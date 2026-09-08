use crate::{
    config::{Prometheus, token},
    http_client,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Node {
    pub name: String,
    pub state: String,
    pub architecture: String,
    pub cpus: Option<u64>,
    pub memory_mib: Option<u64>,
    pub gres: String,
    pub gres_used: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Metric {
    pub kind: String,
    #[serde(default)]
    pub series: String,
    pub target: String,
    pub device: Option<String>,
    pub value: f64,
    pub sampled_at: String,
}
// Keep exporter targets separate from Slurm nodes: sites must not accidentally
// join an instance:port, GPU hostname, and scheduler alias as the same device.
const QUERIES: &[(&str, &str)] = &[
    ("GPU utilization (%)", "DCGM_FI_DEV_GPU_UTIL"),
    ("VRAM used (MiB)", "DCGM_FI_DEV_FB_USED"),
    (
        "CPU utilization (%)",
        "100 * (1 - avg by(instance) (rate(node_cpu_seconds_total{mode=\"idle\"}[2m])))",
    ),
    (
        "RAM used (bytes)",
        "node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes",
    ),
];
pub async fn collect(client: &reqwest::Client, config: &Prometheus) -> Result<Vec<Metric>, String> {
    let mut tasks = tokio::task::JoinSet::new();
    let credential = config
        .token_env
        .as_ref()
        .map(|key| token(key))
        .transpose()?;
    for (kind, query) in QUERIES {
        let client = client.clone();
        let url = format!("{}/api/v1/query", config.url.trim_end_matches('/'));
        let credential = credential.clone();
        tasks.spawn(async move {
            let mut request = client.get(url).query(&[("query", query)]);
            if let Some(value) = credential {
                request = request.bearer_auth(value);
            }
            parse(&http_client::json(request).await?, kind)
        });
    }
    let mut out = Vec::new();
    while let Some(result) = tasks.join_next().await {
        out.extend(result.map_err(|_| "Metrics collector task failed")??);
    }
    out.sort_by(|a, b| (&a.kind, &a.target, &a.device).cmp(&(&b.kind, &b.target, &b.device)));
    Ok(out)
}

pub fn parse(value: &Value, kind: &str) -> Result<Vec<Metric>, String> {
    if value["status"] != "success" || value["data"]["resultType"] != "vector" {
        return Err("Prometheus did not return a successful instant vector".into());
    }
    let rows = value["data"]["result"]
        .as_array()
        .ok_or("Prometheus vector missing")?;
    rows.iter()
        .map(|r| {
            let value = r["value"][1]
                .as_str()
                .and_then(|s| s.parse::<f64>().ok())
                .filter(|n| n.is_finite() && *n >= 0.0)
                .ok_or("Prometheus returned an invalid metric value")?;
            if kind.ends_with("(%)") && value > 100.0 {
                return Err("Percentage metric outside 0–100".into());
            }
            let epoch = r["value"][0].as_f64().ok_or("Metric timestamp missing")?;
            let stamp = chrono::DateTime::from_timestamp(epoch as i64, 0)
                .ok_or("Invalid metric timestamp")?;
            Ok(Metric {
                kind: kind.into(),
                series: r["metric"].to_string(),
                target: r["metric"]["instance"]
                    .as_str()
                    .ok_or("Metric instance label missing")?
                    .into(),
                device: r["metric"]["UUID"].as_str().map(str::to_owned),
                value,
                sampled_at: stamp.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
            })
        })
        .collect()
}
