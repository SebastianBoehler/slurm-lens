# Slurm Lens

A small, local workspace for understanding Slurm jobs. Browse allocations, follow
dependencies, and step through recorded scheduler snapshots without installing
anything on a cluster.

**v0.1 is an offline recording viewer.** It does not connect over SSH, submit jobs,
or collect live telemetry. The included session comes from real scheduler captures,
with identifiers and dates anonymized.

## Run

Requires a current stable Rust toolchain (tested with Rust 1.98).

```sh
cargo run --release
```

Open **http://127.0.0.1:4317**. The server binds only to loopback. Stop with Ctrl+C.
All assets and the example recording are embedded in the binary; it can be run
from any directory. No Node runtime, frontend build, CDN, or external service is
needed to run the application.

To load a different recording in the [version 1 format](docs/recordings.md):

```sh
cargo run --release -- --data ./local/session.json
```

Malformed recordings fail with an error; they are not replaced with example data.
Keep private recordings in the gitignored `local/` directory.

## Try it

1. Open **Jobs**, select **Pending**, and search for `Run C`.
2. Select the job to see its requested resources and success dependency.
3. Follow **Smoke test C** in the inspector to trace the predecessor chain.
4. Open **Timeline** and step through the recording with the snapshot slider.
5. Open **Clusters** to see the observed nodes and allocated resources.
6. Toggle the moon/sun button; the light/dark preference persists locally.
7. Open **Available data** for provenance, limitations, and a recording export.

## Honest boundaries

- The example has 21 captures and 10 observed jobs from one overnight workload.
- Node lanes group recorded allocations. Concurrent allocations are packed into
  visual columns; those columns **are not physical GPU identities**.
- GPU counts and RAM requests are allocations, not measured utilization.
- No complete node inventory, hardware health, or other users' jobs is included.
- Dependencies are retained when previously observed, even after the scheduler
  clears satisfied conditions. Conditions missed before recording remain unknown.
- Terminal jobs remain visible with their last observation time. A stale running
  observation is marked as such and excluded from current allocation counts.
- The allocation chart shows sampled counts. Between-capture transitions and
  future placement are not inferred.

## Implementation

Rust validates and serves the recording and embedded assets with `tiny_http`.
The browser fetches one compact JSON document, then filters and renders locally
using small native ES modules, semantic HTML, CSS and SVG. There are no continuous
timers, network polling loops or animation loops. The Rust process never launches
shell commands. Only GET and HEAD requests are accepted.

Accessibility includes keyboard-operable controls, visible focus, text alongside
status colors, a focus-contained native job dialog, reduced-motion support and
a job table as an alternative to the timeline. This is not an accessibility
conformance certification.

## Development

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
npm test
```

Node is used only for dependency-free frontend tests. Rust embeds assets at
compile time: rebuild/restart the server and reload the page after editing them.

The next integration boundary is a read-only, explicitly scoped SSH collector.
It should batch scheduler reads, preserve their provenance and timestamps, and
represent stale or missing data explicitly. Full inventory and device telemetry
are separate data sources; neither should be fabricated from allocations.

MIT licensed.
