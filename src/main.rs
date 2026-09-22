mod assets;
mod config;
mod http_client;
mod live;
mod model;
mod server;
mod slurm;
mod storage;
mod telemetry;

use std::{env, fs, process};

#[tokio::main(worker_threads = 2)]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("Slurm Lens: {error}");
        process::exit(1);
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let args: Vec<String> = env::args().skip(1).collect();
    if let [flag, path] = args.as_slice()
        && flag == "--live"
    {
        let config = config::Config::load(path)?;
        return server::serve(server::Source::Live(live::Live::start(config).await?)).await;
    }
    let input = match args.as_slice() {
        [flag] if flag == "--demo" => include_str!("../examples/session.json").to_owned(),
        [flag, path] if flag == "--data" => {
            if fs::metadata(path)?.len() > 32 * 1024 * 1024 {
                return Err("Recording exceeds the 32 MiB limit".into());
            }
            fs::read_to_string(path)?
        }
        [] => {
            println!(
                "Slurm Lens — continuous Slurm monitoring\nUsage: slurm-lens --live connection.json\nTry the offline demo: slurm-lens --demo\nSee docs/deployment.md for the systemd service."
            );
            return Ok(());
        }
        [flag] if flag == "--help" || flag == "-h" => {
            println!(
                "slurm-lens [--live connection.json | --demo | --data recording.json]\nDashboard at http://127.0.0.1:4317\nLive mode uses read-only REST connections; no job control."
            );
            return Ok(());
        }
        _ => {
            return Err(
                "Usage: slurm-lens [--live connection.json | --demo | --data recording.json]"
                    .into(),
            );
        }
    };
    let session = model::Session::parse(&input)?;
    server::serve(server::Source::Recording(std::sync::Arc::new(session))).await
}

#[cfg(test)]
mod live_tests;
