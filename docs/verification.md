# Initial verification

Checked locally on macOS / Apple Silicon, 8 September 2026.

- `cargo fmt --check`, Clippy with warnings denied, three Rust tests and four
  frontend tests passed. GitHub's initial Checks workflow also passed.
- The frontend tests render all 21 frames and all page types; cover untrusted
  labels, stale allocation exclusion, and non-overlapping concurrent job tracks.
- Browser checks exercised job state filtering, name search, dependency
  inspection, snapshot stepping, cluster/data pages, and light/dark persistence
  across reloads.
- At a 390px viewport override, the page had no document-level horizontal
  overflow. The job dialog opened and dismissed with Escape. Wide tables and
  timeline canvases intentionally scroll within their containers.
- Final browser instance reported no console errors or warnings.
- HTTP checks confirmed GET success, POST rejection (405), missing route (404),
  and untrusted Host rejection (403).
- Public source/example files were checked for original usernames, paths,
  campaign IDs, job IDs and node identifiers. Only sanitized records are included.

## Small local measurements

The optimized binary, including UI assets and example data, was approximately
831 KiB. A local process sample reported 2,832 KiB RSS and 0.0% CPU. Twenty
sequential recording-API requests measured 0.289 ms median / 15.691 ms maximum
round-trip time, including Python client overhead. The compact response was
90,110 bytes.

These are local observations, not cross-platform performance guarantees. They
exclude browser memory, browser rendering and SSH/network collection costs.

## Not verified or implemented

No SSH connection, live cluster inventory, hardware utilization collection,
multi-node Slurm allocation, complete scheduler expression parsing, or
accessibility conformance audit was performed. The included real recording has
one GPU per job. See the README for the version 0.1 scope.
