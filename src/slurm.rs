use crate::{
    config::{Config, token},
    http_client,
    model::{Frame, Job, Resources},
    telemetry::Node,
};
use serde_json::Value;

pub async fn collect(client: &reqwest::Client, config: &Config) -> Result<Frame, String> {
    let read = |resource: &str| {
        client
            .get(format!(
                "{}/slurm/v0.0.45/{resource}/",
                config.slurm_url.trim_end_matches('/')
            ))
            .header("X-SLURM-USER-NAME", &config.slurm_user)
    };
    let credential = token(&config.slurm_token_env)?;
    let (jobs, nodes) = tokio::join!(
        http_client::json(read("jobs").header("X-SLURM-USER-TOKEN", &credential)),
        http_client::json(read("nodes").header("X-SLURM-USER-TOKEN", &credential))
    );
    parse(&jobs?, &nodes?, &config.cluster, &now())
}
pub fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}
fn text(v: &Value) -> String {
    v.as_str().unwrap_or("").to_owned()
}
pub fn number(v: &Value) -> Option<u64> {
    if v.is_object() {
        if v["set"] != true || v["infinite"] == true {
            return None;
        }
        v["number"].as_u64()
    } else {
        v.as_u64()
    }
}
fn timestamp(v: &Value) -> Option<String> {
    let n = number(v).filter(|n| *n > 0)?;
    let dt = chrono::DateTime::from_timestamp(i64::try_from(n).ok()?, 0)?;
    Some(dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
}
fn states(v: &Value) -> Result<String, String> {
    let states = v
        .as_array()
        .ok_or("Expected Slurm state array (API v0.0.45)")?;
    if states.is_empty() {
        return Err("Empty Slurm state".into());
    }
    states
        .iter()
        .map(|s| s.as_str().map(str::to_owned).ok_or("Invalid state".into()))
        .collect::<Result<Vec<_>, _>>()
        .map(|s| s.join("+"))
}
fn validate(value: &Value, cluster: &str) -> Result<(), String> {
    if value["errors"].as_array().is_some_and(|a| !a.is_empty()) {
        return Err("Slurm returned API errors".into());
    }
    if value["warnings"].as_array().is_some_and(|a| !a.is_empty()) {
        return Err(
            "Slurm returned API warnings; check upstream before treating this as complete".into(),
        );
    }
    if value["meta"]["slurm"]["cluster"] != cluster {
        return Err("Slurm cluster identity does not match configuration".into());
    }
    Ok(())
}
pub fn parse(jobs: &Value, nodes: &Value, cluster: &str, at: &str) -> Result<Frame, String> {
    validate(jobs, cluster)?;
    validate(nodes, cluster)?;
    let jobs = jobs["jobs"]
        .as_array()
        .ok_or("Slurm jobs array missing")?
        .iter()
        .map(|v| {
            let state = states(&v["job_state"])?;
            let pending = state.split('+').any(|s| s == "PENDING");
            let terminal = state.split('+').any(|s| {
                [
                    "COMPLETED",
                    "FAILED",
                    "CANCELLED",
                    "TIMEOUT",
                    "NODE_FAIL",
                    "OUT_OF_MEMORY",
                    "PREEMPTED",
                    "BOOT_FAIL",
                    "DEADLINE",
                ]
                .contains(&s)
            });
            let dependency = text(&v["dependency"]);
            Ok(Job {
                id: number(&v["job_id"])
                    .ok_or("Slurm job ID missing")?
                    .to_string(),
                name: text(&v["name"]),
                cluster: cluster.into(),
                account: text(&v["account"]),
                partition: text(&v["partition"]),
                state,
                reason: text(&v["state_reason"]),
                node: v["nodes"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned),
                submitted_at: timestamp(&v["submit_time"]),
                started_at: if pending {
                    None
                } else {
                    timestamp(&v["start_time"])
                },
                ended_at: if terminal {
                    timestamp(&v["end_time"])
                } else {
                    None
                },
                observed_at: at.into(),
                time_limit: number(&v["time_limit"])
                    .map(|m| format!("{}:{:02}:00", m / 60, m % 60))
                    .unwrap_or("Not reported / unlimited".into()),
                requested: resources(&text(&v["tres_req_str"]))?,
                allocated: if pending {
                    None
                } else {
                    resources(&text(&v["tres_alloc_str"]))?
                },
                dependencies: vec![],
                dependency_expression: (!dependency.is_empty()).then_some(dependency),
                exit_code: terminal
                    .then(|| number(&v["exit_code"]["return_code"]).map(|c| c.to_string()))
                    .flatten(),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let inventory = nodes["nodes"]
        .as_array()
        .ok_or("Slurm nodes array missing")?
        .iter()
        .map(|v| {
            Ok(Node {
                name: v["name"].as_str().ok_or("Node name missing")?.into(),
                state: states(&v["state"])?,
                architecture: text(&v["architecture"]),
                cpus: number(&v["cpus"]),
                memory_mib: number(&v["real_memory"]),
                gres: text(&v["gres"]),
                gres_used: text(&v["gres_used"]),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let frame = Frame {
        captured_at: at.into(),
        jobs,
        inventory: Some(inventory),
        metrics: None,
    };
    // Apply the same identity/time validation as recordings before publication.
    let session = crate::model::Session {
        schema_version: 1,
        title: String::new(),
        description: String::new(),
        timezone: "UTC".into(),
        frames: vec![frame.clone()],
    };
    crate::model::Session::parse(
        &serde_json::to_string(&session).map_err(|_| "Serialize failed")?,
    )?;
    Ok(frame)
}
fn resources(input: &str) -> Result<Option<Resources>, String> {
    if input.is_empty() {
        return Ok(None);
    }
    let entries: std::collections::HashMap<_, _> =
        input.split(',').filter_map(|v| v.split_once('=')).collect();
    let Some(cpu) = entries.get("cpu") else {
        return Ok(None);
    };
    let cpus = cpu.parse().map_err(|_| "Invalid CPU TRES")?;
    // Generic GPU TRES already includes typed GPU entries: never sum both.
    let gpus = if let Some(n) = entries.get("gres/gpu") {
        n.parse().map_err(|_| "Invalid GPU TRES")?
    } else {
        entries
            .iter()
            .filter(|(k, _)| k.starts_with("gres/gpu:"))
            .try_fold(0u32, |sum, (_, n)| {
                sum.checked_add(n.parse::<u32>().map_err(|_| "Invalid GPU TRES")?)
                    .ok_or("GPU TRES overflow")
            })?
    };
    Ok(Some(Resources {
        cpus,
        gpus,
        memory: entries.get("mem").unwrap_or(&"Not reported").to_string(),
    }))
}
