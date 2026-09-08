# Contributing to Slurm Lens

Slurm Lens supports live REST collection and offline recording playback. Open an
issue before adding job control or new collection sources so their permission
and data model boundaries can be discussed explicitly. Small fixes and documentation improvements are welcome.

## Local development

Install stable Rust with rustfmt and Clippy, and Node.js 22 or newer for the
frontend tests. No npm install or frontend build is required.

```sh
cargo run --release --locked
```

Open http://127.0.0.1:4317. Assets are embedded at compile time, so restart the
process after rebuilding UI changes, then reload the browser.

## Project layout

- `src/`: recording model, validation, CLI, and loopback HTTP server.
- `web/`: native JavaScript modules, HTML, CSS, and SVG interface.
- `examples/session.json`: anonymized example recording.
- `tests/`: dependency-free frontend tests.
- `docs/`: recording format, screenshots, and verification notes.
- `local/`: gitignored private recordings and temporary outputs.

Keep changes focused and source files around 300 lines or fewer. Preserve the
distinction between requested resources, allocations, utilization, and inventory.
Missing or stale observations must remain visible as such.

## Before opening a pull request

```sh
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
npm test
```

For UI changes, check light and dark themes, keyboard navigation, and a narrow
viewport. Explain the resulting behavior and what you verified in the PR.

Never commit credentials, private recordings, original cluster identifiers,
usernames, shell commands from jobs, or raw cluster logs. Use small anonymized
fixtures when a regression needs new test data. Bug reports should describe the
steps, expected behavior, actual behavior, and browser/OS without private data.

Contributions are licensed under the project's MIT License.
