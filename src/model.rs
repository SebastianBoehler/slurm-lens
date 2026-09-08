use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Session {
    pub schema_version: u8,
    pub title: String,
    pub description: String,
    pub timezone: String,
    pub frames: Vec<Frame>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Frame {
    pub captured_at: String,
    pub jobs: Vec<Job>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Job {
    pub id: String,
    pub name: String,
    pub cluster: String,
    pub account: String,
    pub partition: String,
    pub state: String,
    pub reason: String,
    pub node: Option<String>,
    pub submitted_at: Option<String>,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub observed_at: String,
    pub time_limit: String,
    pub requested: Option<Resources>,
    pub allocated: Option<Resources>,
    pub dependencies: Vec<Dependency>,
    pub exit_code: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Resources {
    pub gpus: u32,
    pub cpus: u32,
    pub memory: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Dependency {
    pub id: String,
    pub condition: String,
}

impl Session {
    pub fn parse(input: &str) -> Result<Self, String> {
        let data: Self = serde_json::from_str(input).map_err(|e| e.to_string())?;
        data.validate()?;
        Ok(data)
    }

    fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 || self.timezone != "UTC" || self.frames.is_empty() {
            return Err("Expected schema_version 1, timezone UTC and at least one frame".into());
        }
        let mut previous = "";
        let mut cluster = None;
        for frame in &self.frames {
            if !utc_stamp(&frame.captured_at) || frame.captured_at.as_str() <= previous {
                return Err("Capture timestamps must be ordered, unique UTC timestamps".into());
            }
            previous = &frame.captured_at;
            let mut ids = HashSet::new();
            for job in &frame.jobs {
                if let Some(expected) = cluster {
                    if expected != job.cluster {
                        return Err("Version 1 recordings support one cluster per session".into());
                    }
                } else {
                    cluster = Some(job.cluster.as_str());
                }
                if job.id.is_empty() || !ids.insert((&job.cluster, &job.id)) {
                    return Err(
                        "Job IDs must be nonempty and unique within a cluster and frame".into(),
                    );
                }
                for stamp in [
                    Some(&job.observed_at),
                    job.started_at.as_ref(),
                    job.ended_at.as_ref(),
                    job.submitted_at.as_ref(),
                ]
                .into_iter()
                .flatten()
                {
                    if !utc_stamp(stamp) {
                        return Err(format!("Invalid timestamp for {}", job.id));
                    }
                }
                if job.state == "PENDING" && (job.allocated.is_some() || job.started_at.is_some()) {
                    return Err(format!(
                        "Pending job {} cannot have an allocation or actual start",
                        job.id
                    ));
                }
                if job
                    .ended_at
                    .as_ref()
                    .zip(job.started_at.as_ref())
                    .is_some_and(|(end, start)| end < start)
                {
                    return Err(format!("Job {} ends before it starts", job.id));
                }
                if job.dependencies.iter().any(|d| {
                    d.id == job.id
                        || !["afterok", "afternotok", "afterany"].contains(&d.condition.as_str())
                }) {
                    return Err(format!("Invalid dependency for {}", job.id));
                }
            }
        }
        Ok(())
    }
}

fn utc_stamp(value: &str) -> bool {
    let b = value.as_bytes();
    let shape = b.len() == 20
        && [4, 7].iter().all(|&i| b[i] == b'-')
        && b[10] == b'T'
        && b[13] == b':'
        && b[16] == b':'
        && b[19] == b'Z'
        && b.iter()
            .enumerate()
            .all(|(i, c)| [4, 7, 10, 13, 16, 19].contains(&i) || c.is_ascii_digit());
    if !shape {
        return false;
    }
    let n = |a: usize, z: usize| value[a..z].parse::<u32>().unwrap_or(0);
    let year = n(0, 4);
    let month = n(5, 7);
    let day = n(8, 10);
    let leap = year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if leap {
                29
            } else {
                28
            }
        }
        _ => 0,
    };
    year > 0 && day > 0 && day <= days && n(11, 13) < 24 && n(14, 16) < 60 && n(17, 19) < 60
}

#[cfg(test)]
mod tests {
    use super::*;
    const EXAMPLE: &str = include_str!("../examples/session.json");

    #[test]
    fn rejects_invalid_calendar_dates() {
        assert!(!utc_stamp("2026-02-30T12:00:00Z"));
        assert!(!utc_stamp("2026-08-01T25:00:00Z"));
        assert!(utc_stamp("2024-02-29T12:00:00Z"));
    }

    #[test]
    fn recording_preserves_waiting_to_running_transition() {
        let session = Session::parse(EXAMPLE).unwrap();
        assert_eq!(session.frames.len(), 21);
        let first = &session.frames[0];
        let pending = first.jobs.iter().find(|j| j.state == "PENDING").unwrap();
        assert!(!pending.dependencies.is_empty());
        assert!(session.frames.iter().any(|f| {
            f.jobs
                .iter()
                .any(|j| j.id == pending.id && j.state == "RUNNING" && j.allocated.is_some())
        }));
    }

    #[test]
    fn rejects_pending_allocations_and_reordered_history() {
        let mut session = Session::parse(EXAMPLE).unwrap();
        session.frames[0]
            .jobs
            .iter_mut()
            .find(|j| j.state == "PENDING")
            .unwrap()
            .allocated = Some(Resources {
            gpus: 1,
            cpus: 4,
            memory: "32G".into(),
        });
        assert!(session.validate().is_err());
        let mut session = Session::parse(EXAMPLE).unwrap();
        session.frames.swap(0, 1);
        assert!(session.validate().is_err());
    }
}
