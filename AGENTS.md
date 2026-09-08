# Slurm Lens

- This is a standalone local viewer. Do not import a research project's code,
  credentials, raw logs, hostnames, user identities or scientific artifacts.
- Keep source files focused and around 300 lines or fewer.
- Allocation, actual utilization, node inventory and device identity are distinct.
  Missing evidence must remain missing in both model and UI.
- Never connect to a cluster, run SSH commands, submit or cancel jobs without
  authorization for that specific integration or campaign action.
- Use `cargo test`, `cargo clippy --all-targets -- -D warnings`, and `npm test`.
- Rebuild/restart after asset edits because the binary embeds the web files.
- Verify user-facing behavior in the browser, including the theme toggle and a
  narrow viewport. Keep all themes keyboard-accessible and respect reduced motion.
