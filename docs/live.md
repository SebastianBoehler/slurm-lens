# Live connections

Slurm Lens collects scheduler state centrally and streams observations to browsers
using server-sent events. There is one collection loop per process, independent
of browser count. This version supports one cluster per process.

## Configure

The first adapter targets **Slurm REST API v0.0.45**. Other API versions are not
claimed compatible. The administrator must provide a reachable Slurm REST service
and a credential with appropriate visibility. Slurm Lens calls only the jobs and
nodes GET endpoints; it never submits, cancels, requeues or changes jobs/nodes.

Copy `examples/connection.json` to the gitignored `local/connection.json` and edit
its endpoints, exact cluster identity and Slurm username. Supply the token through
the environment variable named in `slurm_token_env`, using your credential manager
or shell environment. Do not put tokens in URLs or committed JSON.

```sh
cargo run --release --locked -- --live local/connection.json
```

Open http://127.0.0.1:4317. `--demo` explicitly opens the bundled offline dataset;
`--data file.json` opens a saved recording. No-argument startup prints usage.
A failed live connection never switches to example data.

HTTPS endpoints require valid certificates. HTTP is accepted only on loopback,
for example through an administrator-configured SSH tunnel. Redirects are disabled
so credentials cannot follow a redirect to a different host. Requests have an
8-second deadline and a 32 MiB response limit. Credential environment values are
read for each collection; restart the process after changing its environment.

## Optional hardware metrics

Set `prometheus` to an object with `url` and optionally `token_env`, or to `null` to
disable telemetry. The Prometheus instance must scrape NVIDIA DCGM Exporter and/or
Prometheus node_exporter. Slurm Lens queries these standard series:

- `DCGM_FI_DEV_GPU_UTIL`: GPU utilization percent.
- `DCGM_FI_DEV_FB_USED`: framebuffer memory used, MiB.
- `node_cpu_seconds_total`: CPU utilization calculated from two-minute idle rates.
- `node_memory_MemTotal_bytes` and `node_memory_MemAvailable_bytes`: RAM used.

Queries cover series visible to that Prometheus credential. Configure a dedicated
Prometheus view/tenant containing the intended cluster; Slurm Lens does not infer
a cluster label or silently join targets from multiple clusters. Exporter targets
(`instance`) and GPU UUIDs are displayed as supplied. They are not automatically
joined to scheduler aliases, physical GPU lanes, or individual jobs.

The cluster page includes measured values, per-series Prometheus result timestamps and recent
sample charts. Missing series are absent, never zero. Nonfinite, negative or invalid
percentage values fail the telemetry collection explicitly. Telemetry failure does
not stop scheduler collection; each has its own visible status. A scheduler failure
retains the previous complete observation, so newer telemetry is not presented as
if it belongs to that older scheduler observation.

## Live and history

The dashboard follows the latest collected state. Time ranges control charts and
the timetable without rewinding current jobs. Pause freezes the display while
collection continues; Resume catches up. Disconnected streams reconnect and receive
current state. Missed intermediate browser updates remain gaps until refresh loads
the retained server history.

`poll_seconds` is the delay after a collection completes (10–3600 seconds), not a
hard real-time guarantee. Jobs/nodes/metrics are separate queries, not an atomic
cluster snapshot. The browser reports stale scheduler data after the greater of
30 seconds or two configured intervals. Prometheus result timestamps are shown
separately from successful collection times. Instant queries can reuse samples
within Prometheus lookback; these timestamps are not proof of the last device
scrape time. CPU rates summarize a two-minute window.

History persists to `history_path` in local SQLite. Retention is capped by
`history_frames` (2–10000) and 32 MiB of serialized samples; one sample may not
exceed 4 MiB. Restarts restore retained history, with its original timestamps.
Storage failures are explicit in the dashboard and `/healthz`. See
[service deployment](deployment.md) for setup, backup, access and exact bounds.

Disappearing jobs retain their last observation within the retention horizon;
absence is not completion. Success/failure is only reported when observed. Slurm
controller retention limits what can be collected; accounting backfill is not yet
implemented. Dependency expressions are preserved verbatim, including compound
conditions. Multi-node hostlists remain allocation-group lanes; this version does
not claim per-node GPU distribution or physical slot mapping for those jobs.

## Deployment

Use the [continuous-service deployment guide](deployment.md) and included systemd
unit. Collection runs independently of browser sessions. Bind remains loopback;
shared access uses the operator's authenticated HTTPS gateway. All admitted viewers
see the configured collector scope. Tokens remain server-side.

## Verification and references

```sh
cargo build --release --locked
python3 tests/live_http.py
```

The HTTP test needs port 4317 free. It starts an explicitly labeled local protocol
fixture, checks REST mapping, the event stream, caching, outage/recovery and request
guards, then shuts both processes down. It never connects to a real cluster.

- [Slurm REST architecture](https://slurm.schedmd.com/rest.html)
- [Slurm v0.0.45 API reference](https://slurm.schedmd.com/rest_api.html)
- [NVIDIA DCGM Exporter](https://github.com/NVIDIA/dcgm-exporter)
- [Prometheus node_exporter](https://github.com/prometheus/node_exporter)
