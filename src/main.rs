mod model;
mod server;

use std::{env, fs, process};

fn main() {
    if let Err(error) = run() {
        eprintln!("Slurm Lens: {error}");
        process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let args: Vec<String> = env::args().skip(1).collect();
    let input = match args.as_slice() {
        [] => include_str!("../examples/session.json").to_owned(),
        [flag, path] if flag == "--data" => {
            if fs::metadata(path)?.len() > 32 * 1024 * 1024 {
                return Err("Recording exceeds the 32 MiB limit".into());
            }
            fs::read_to_string(path)?
        }
        [flag] if flag == "--help" || flag == "-h" => {
            println!(
                "slurm-lens [--data recording.json]\nLocal recorded-session viewer at http://127.0.0.1:4317\nNo SSH connections or cluster changes."
            );
            return Ok(());
        }
        _ => return Err("Usage: slurm-lens [--data recording.json]".into()),
    };
    let session = model::Session::parse(&input)?;
    let json = serde_json::to_vec(&session)?;
    server::serve(json)
}
