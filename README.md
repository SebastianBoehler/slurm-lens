# Slurm Lens

A lightweight, read-only Slurm dashboard for continuously running cluster services.
Rust handles collection, persistent history and streaming; native HTML, CSS and
JavaScript render the interface without a frontend framework or chart dependency.

- Current running/pending jobs, allocations and dependency conditions.
- Scrollable job timetable, grouped by scheduler node assignments.
- Historical charts with time ranges; changing the range never rewinds current jobs.
- Jobs and allocated GPUs grouped by Slurm account or job owner.
- Node inventory and optional GPU/CPU/RAM measurements through Prometheus.
- One collector shared by all browsers; server-sent events deliver new data.
- Local SQLite history across restarts, explicit connection/storage errors.
- Light/dark themes, keyboard controls and chart data tables.

MIT licensed. [Deployment guide](docs/deployment.md) · [Live adapter](docs/live.md)

## Run the service

Requires Rust and a C compiler for bundled SQLite. No Node.js is needed at runtime.
The initial adapter supports Slurm REST **v0.0.45**.

```sh
cargo build --release --locked
mkdir -p local
cp examples/connection.json local/connection.json
# Configure endpoints, exact cluster and collector username in the JSON.
# Supply the named token environment variables through your secret manager.
./target/release/slurm-lens --live local/connection.json
```

Open http://127.0.0.1:4317. For continuous Linux operation, use the included
[systemd unit](deploy/slurm-lens.service) and [deployment instructions](docs/deployment.md).
The operator controls where collection runs and where history is stored. There is
no external analytics service or automatic upload of job data.

For shared access, use an authenticated HTTPS gateway. All admitted viewers see the
collector's visibility scope; per-viewer RBAC is not implemented.

## Try the offline demo

```sh
cargo run --release --locked -- --demo
```

The bundled anonymized recording illustrates UI behavior. It is explicitly labeled
recorded data, never represented as a live cluster. `--data path.json` opens an
export. Starting without arguments prints setup guidance.

## Navigate

| Page | Purpose |
| --- | --- |
| Overview | Latest job counts, queue context and hardware telemetry |
| Jobs | State filters, search, resource requests and job inspection |
| Timeline | Scrollable timetable of observed job durations and node placement |
| Clusters | Scheduler inventory and exporter measurements |
| Available data | Source health, retention, limitations and history export |

**Time range** controls charts and the timetable, not current job state. Live
updates arrive automatically. **Pause live updates** freezes the display while
collection continues; **Resume live updates** catches up. **Chart data** exposes
exact historical values without a snapshot picker.

The workload breakdown compares visible jobs by **Account** or **User**. Its bars
follow **Show metric**; counts always use the latest collected state. Missing owners
are grouped as **Not reported**, never inferred from account names. Stale jobs are
excluded; incomplete GPU totals are labeled. Job ownership uses Slurm's optional
[`user_name` field](https://slurm.schedmd.com/rest_api.html).

## Data semantics and limits

Allocation is not utilization. Missing data stays missing. Nearby live samples can
be connected as a visual trend; outages and sparse recordings remain gaps.
Node lanes are not physical GPU slots. Disappearing jobs are not assumed completed.

History is retained locally, bounded by the configured sample count and 32 MiB of
serialized payloads. Long-term accounting backfill, job control, device-to-job
mapping, multi-cluster federation and built-in authentication are not implemented.
Polling is near-real-time monitoring, not a guarantee of capturing every transition.

## Development

```sh
cargo fmt --check
cargo test --locked
cargo clippy --all-targets --locked -- -D warnings
npm test
cargo build --release --locked
python3 tests/live_http.py
```

The HTTP test requires port 4317 free and uses a local test fixture only. Rebuild
and restart after web changes: assets are embedded in the Rust binary.
