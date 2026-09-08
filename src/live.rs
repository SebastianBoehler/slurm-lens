use crate::{config::Config, http_client, model::Session, slurm, telemetry};
use serde::Serialize;
use std::{collections::VecDeque, sync::Arc};
use tokio::sync::{RwLock, broadcast};

#[derive(Clone, Serialize)]
pub struct Health {
    pub last_success: Option<String>,
    pub error: Option<String>,
}
#[derive(Clone, Serialize)]
pub struct Update {
    pub revision: u64,
    pub cluster: String,
    pub poll_seconds: u64,
    pub history_frames: usize,
    pub history_start: Option<String>,
    pub scheduler: Health,
    pub telemetry: Health,
    pub telemetry_enabled: bool,
    pub frame: Option<crate::model::Frame>,
}
#[derive(Clone)]
pub struct Live {
    pub state: Arc<RwLock<Update>>,
    pub history: Arc<RwLock<VecDeque<crate::model::Frame>>>,
    pub events: broadcast::Sender<Arc<Update>>,
}
impl Live {
    pub fn start(config: Config) -> Result<Self, reqwest::Error> {
        let client = http_client::client()?;
        let (events, _) = broadcast::channel(8);
        let live = Self {
            state: Arc::new(RwLock::new(Update {
                revision: 0,
                cluster: config.cluster.clone(),
                poll_seconds: config.poll_seconds,
                history_frames: config.history_frames,
                history_start: None,
                telemetry_enabled: config.prometheus.is_some(),
                scheduler: Health {
                    last_success: None,
                    error: None,
                },
                telemetry: Health {
                    last_success: None,
                    error: None,
                },
                frame: None,
            })),
            history: Arc::new(RwLock::new(VecDeque::new())),
            events,
        };
        let collector = live.clone();
        tokio::spawn(async move {
            loop {
                let metrics = async {
                    match &config.prometheus {
                        Some(p) => telemetry::collect(&client, p).await.map(Some),
                        None => Ok(None),
                    }
                };
                let (frame, metrics) = tokio::join!(slurm::collect(&client, &config), metrics);
                collector.publish(frame, metrics).await;
                tokio::time::sleep(config.interval()).await;
            }
        });
        Ok(live)
    }
    pub async fn publish(
        &self,
        frame: Result<crate::model::Frame, String>,
        metrics: Result<Option<Vec<telemetry::Metric>>, String>,
    ) {
        let mut state = self.state.write().await;
        state.revision += 1;
        match metrics {
            Ok(ref values) => {
                if values.is_some() {
                    state.telemetry.last_success = Some(slurm::now());
                }
                state.telemetry.error = None;
            }
            Err(ref error) => state.telemetry.error = Some(error.clone()),
        }
        match frame {
            Ok(mut frame) => {
                frame.metrics = metrics.ok().flatten();
                if let Some(previous) = &state.frame {
                    let horizon = chrono::Utc::now()
                        - chrono::Duration::seconds(
                            (state.poll_seconds * state.history_frames as u64) as i64,
                        );
                    let horizon = horizon.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
                    let ids: std::collections::HashSet<_> =
                        frame.jobs.iter().map(|j| j.id.clone()).collect();
                    frame.jobs.extend(
                        previous
                            .jobs
                            .iter()
                            .filter(|j| !ids.contains(&j.id) && j.observed_at > horizon)
                            .cloned(),
                    );
                }
                let frame_size = serde_json::to_vec(&frame)
                    .expect("serializable frame")
                    .len();
                if frame_size > 4 * 1024 * 1024 {
                    state.scheduler.error = Some(
                        "Normalized observation exceeds 4 MiB; narrow upstream visibility".into(),
                    );
                    let _ = self.events.send(Arc::new(state.clone()));
                    return;
                }
                state.scheduler.last_success = Some(frame.captured_at.clone());
                state.scheduler.error = None;
                let mut history = self.history.write().await;
                if history
                    .back()
                    .is_none_or(|f| f.captured_at < frame.captured_at)
                {
                    history.push_back(frame.clone());
                    let mut bytes: usize = history
                        .iter()
                        .map(|f| serde_json::to_vec(f).expect("serializable frame").len())
                        .sum();
                    while history.len() > state.history_frames || bytes > 32 * 1024 * 1024 {
                        let old = history.pop_front().expect("nonempty history");
                        bytes -= serde_json::to_vec(&old).expect("serializable frame").len();
                    }
                }
                state.history_start = history.front().map(|f| f.captured_at.clone());
                state.frame = Some(frame);
            }
            Err(error) => state.scheduler.error = Some(error),
        }
        let _ = self.events.send(Arc::new(state.clone()));
    }
    pub async fn session(&self) -> Session {
        let state = self.state.read().await;
        Session { schema_version:1, title:format!("{} live observations",state.cluster),
            description:"Read-only Slurm REST and optional Prometheus observations. Visibility follows configured credentials. History is bounded and held in memory; export to retain it.".into(),
            timezone:"UTC".into(),frames:self.history.read().await.iter().cloned().collect() }
    }
}
