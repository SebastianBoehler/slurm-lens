use serde_json::Value;
use std::time::Duration;
pub fn client() -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
}
pub async fn json(request: reqwest::RequestBuilder) -> Result<Value, String> {
    let mut response = request
        .send()
        .await
        .map_err(|_| "Connection failed or timed out".to_string())?;
    if !response.status().is_success() {
        return Err(format!("Upstream HTTP {}", response.status().as_u16()));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Failed to read upstream response")?
    {
        if bytes.len() + chunk.len() > 32 * 1024 * 1024 {
            return Err("Upstream response exceeds 32 MiB".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "Upstream returned invalid JSON".into())
}
