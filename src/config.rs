use serde::Deserialize;
use std::{env, fs, time::Duration};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub cluster: String,
    pub slurm_url: String,
    pub slurm_user: String,
    pub slurm_token_env: String,
    pub poll_seconds: u64,
    pub history_frames: usize,
    pub history_path: String,
    pub prometheus: Option<Prometheus>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Prometheus {
    pub url: String,
    pub token_env: Option<String>,
}
impl Config {
    pub fn load(path: &str) -> Result<Self, String> {
        let data = fs::read_to_string(path).map_err(|_| "Cannot read connection config")?;
        let config: Self = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        if config.cluster.is_empty()
            || config.slurm_user.is_empty()
            || !(10..=3600).contains(&config.poll_seconds)
            || config.history_path.trim().is_empty()
            || !(2..=10000).contains(&config.history_frames)
        {
            return Err(
                "Set cluster, Slurm user, poll_seconds (10–3600), and history_frames (2–10000), and history_path"
                    .into(),
            );
        }
        validate_url(&config.slurm_url)?;
        token(&config.slurm_token_env)?;
        if let Some(p) = &config.prometheus {
            validate_url(&p.url)?;
            if let Some(key) = &p.token_env {
                token(key)?;
            }
        }
        Ok(config)
    }
    pub fn interval(&self) -> Duration {
        Duration::from_secs(self.poll_seconds)
    }
}
pub fn token(key: &str) -> Result<String, String> {
    let value = env::var(key).map_err(|_| "Required credential environment variable is not set")?;
    if value.trim().is_empty() {
        return Err("Credential is empty".into());
    }
    Ok(value)
}
fn validate_url(value: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(value).map_err(|_| "Invalid endpoint URL")?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Endpoint URLs cannot contain credentials, queries or fragments".into());
    }
    if url.scheme() != "https"
        && !(url.scheme() == "http"
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")))
    {
        return Err("Use HTTPS, or an HTTP endpoint reached through a loopback tunnel".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_url;
    #[test]
    fn credential_transport_requires_tls_or_loopback() {
        assert!(validate_url("https://cluster.example/rest").is_ok());
        assert!(validate_url("http://127.0.0.1:6820").is_ok());
        assert!(validate_url("http://cluster.example").is_err());
        assert!(validate_url("https://user:secret@cluster.example").is_err());
        assert!(validate_url("https://cluster.example?token=secret").is_err());
    }
}
