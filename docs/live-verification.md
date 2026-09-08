# Live implementation verification

Verified locally on macOS / Apple Silicon, 8 September 2026.

- Eight Rust tests and seven frontend tests passed; formatting and Clippy passed.
- Local HTTP protocol fixtures exercised the Slurm jobs/nodes endpoints, token
  header, Prometheus vectors, SSE, shared cache, HTTP 503 outage, stale retention,
  recovery, disappearance without inferred completion, and request guards.
- The fixture shuts the service down with SIGINT, including with browser streams.
- Browser checks exercised live collection, pause while collection continued,
  return to live, search/focus across refreshes, inspector, inventory/telemetry and
  connection-health views. No browser console errors or warnings were reported.
- The narrow viewport had equal document scroll/client widths (375 CSS pixels).
  Wide tables scroll inside containers. Light and dark themes were checked.
- The source uses a maximum of 240 retained observations and a 32 MiB serialized
  history budget, plus a 4 MiB normalized frame budget. Runtime object overhead,
  active streams and browser copies are additional memory. These are bounds, not
  measured performance guarantees.

## Not verified against production

No real Slurm REST or Prometheus endpoint, administrator credentials, ML Cloud
connection, real multi-node allocation, or real GPU telemetry was available for
this implementation turn. Protocol fixtures exercise the documented v0.0.45
response shape; they do not establish compatibility with every Slurm release or
site configuration. See [live setup](live.md) for deployment and data limits.

The local browser is returned to recording mode after tests. Test data is not a
production fallback and the public example recording remains anonymized.
