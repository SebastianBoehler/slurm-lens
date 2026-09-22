# Deploy a continuous service

Slurm Lens runs on a cluster management host, independently of browser sessions.
It collects from the operator's Slurm REST endpoint and optional Prometheus,
retains history in local SQLite, and serves the dashboard with server-sent updates.
It never submits jobs or sends collected data to a hosted analytics service.
One process serves one cluster and one configured visibility scope.

## Linux / systemd

Build on the target OS and architecture with Rust and a C compiler (SQLite is bundled):

```sh
cargo build --release --locked
sudo install -m 0755 target/release/slurm-lens /usr/local/bin/slurm-lens
sudo install -d -m 0755 /etc/slurm-lens
sudo install -m 0644 deploy/connection.json /etc/slurm-lens/connection.json
sudo install -m 0644 deploy/slurm-lens.service /etc/systemd/system/slurm-lens.service
sudo install -m 0600 /dev/null /etc/slurm-lens/credentials.env
```

Edit the connection JSON with the exact cluster, REST endpoint and collector user.
Edit the root-readable credentials file using your secret-management workflow:

```text
SLURM_LENS_SLURM_TOKEN=your-token
```

The system service manager reads this file; the dynamic service user does not
need access to it. Configure credential renewal before the Slurm token expires;
restart the service after updating its environment. Do not commit credentials.
The unit creates and owns `/var/lib/slurm-lens` with mode 0700. All runtime writes
are confined to that state directory and private temporary storage.

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now slurm-lens
systemctl status slurm-lens
journalctl -u slurm-lens
curl --fail http://127.0.0.1:4317/healthz
```

`/healthz` returns 503 while scheduler data is missing/stale or persistence is
failing. Optional telemetry failures are reported separately in the UI/status API.
The service handles SIGTERM; systemd restarts crashes. History commits are atomic.

## Browser access and authentication

The application listens on `127.0.0.1:4317`. For shared access, place it behind
your existing authenticated HTTPS reverse proxy on the same host. Required proxy
settings: rewrite the upstream Host to `127.0.0.1:4317`, disable buffering for
`/api/events`, and use a long read timeout for the event stream. Preserve streaming
responses and do not cache dashboard API data.

The proxy must authenticate users **before** forwarding any route, including
assets, APIs and exports. Every admitted viewer can see the same collected data;
there is no per-viewer Slurm impersonation or RBAC. Use separate deployments and
collector credentials when visibility boundaries differ. This is an operator
console, not a multi-tenant portal. TLS and authentication belong to the existing
site gateway, not to the collection token.

## Storage and retention

`history_path` is required in live mode. Its parent directory must exist and be
writable. SQLite stores the captured jobs, inventory and optional telemetry;
credentials are never stored in history. The database is bound to the configured
cluster, REST URL and Slurm user. Changing any of those requires a separate history
file, to avoid mixing visibility scopes. Keep local databases out of Git.

Retention is limited by `history_frames` (2–10000) and 32 MiB of serialized sample
payloads, whichever is reached first. The deployment example requests up to a day
at a ten-second interval, but collection duration and the byte cap can shorten it.
SQLite pages/WAL and runtime object overhead are additional. Deleted pages are
reused; this is bounded recent history, not a long-term accounting warehouse.
A single sample above 4 MiB is rejected with an explicit error.

Stop the service before copying the database and any WAL files for backup, or use
SQLite's online backup API. Treat history and exports as cluster data under your
site's normal access and retention policies. A storage failure is visible; there
is no silent switch to an ephemeral or demo source.

## Local demo and development

```sh
cargo run --release --locked -- --demo
# Or inspect an explicitly supplied recording:
cargo run --release --locked -- --data recording.json
```

The demo is offline and labeled as such. No-argument startup prints usage rather
than silently opening example data. The recording is a development aid, not the
product's collection architecture.

## Current scope

Slurm REST v0.0.45 only; scheduler polling is streamed to browsers, not scheduler
push events. The collector does not backfill jobs from SlurmDBD, and it cannot
recover events missed while offline. No per-job device attribution, job control,
HA/multi-process collection or built-in shared-user auth is claimed. See
[live adapter details](live.md) for polling, telemetry and data semantics.

The systemd unit is included for Linux deployment; local macOS verification does
not substitute for starting it on your target Linux distribution.
