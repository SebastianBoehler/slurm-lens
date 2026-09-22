# History interaction review (historical)

This documents the earlier observation-picker implementation. The current service
UI uses time ranges and latest-state monitoring; see README.md and deployment.md.

## Scope and coverage

Full review of the shared Workload history panel and its observation selection flow.
This is not a whole-application accessibility audit.

| Domain | Inspected | Result |
| --- | --- | --- |
| UI | Metric selection, chart selection, latest action, live pause/resume | Clear after changes |
| Layout | Desktop and 320px reflow; grouped chart and selection controls | Clear |
| Typography | Axis labels, hierarchy, tabular values, 16px mobile selects | Clear |
| Colors | Light/dark foreground and chart contrast, shape-based selection | Clear |
| Writing | Metric names, UTC times, observation and missing-data explanation | Clear after changes |
| Accessibility | Native labeled selectors, keyboard operation, visible focus, chart description | Clear within tested coverage |

## Findings

| # | Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | MEDIUM | UI | `web/index.html`, `web/history.js` | Slider exposed position but no trend | Time-based chart for allocations, running jobs and pending jobs | Users can see development before choosing a time |
| 2 | MEDIUM | Accessibility | `web/history.js`, `web/history.css` | Chart-only interaction would require precise pointer targeting | Native time selector with exact values, focus ring and selection announcement | Equivalent keyboard operation without dragging |
| 3 | LOW | Writing | `web/history.js` | Lowercased acronym and plural for one GPU | “1 GPU allocated”; seconds on sub-minute chart ranges | Precise units and distinguishable timestamps |

All findings above are resolved.

## Considered but rejected

| Location | Candidate | Rejected because |
| --- | --- | --- |
| History chart | Filled histogram bins or interpolated area | Irregular samples do not establish what happened between observations |
| Overview | Keep the old allocation chart beside the new history panel | Duplicates the same metric and increases scanning effort |
| Chart selection | Pointer-only controls | Native selection provides a reliable keyboard and assistive-technology alternative |

## Verification

Passed:

- `npm test`: 10 tests, including actual timestamp spacing, nearest observation,
  single/empty history, zero values, stale job exclusion and pending state flags.
- `cargo test --locked`: 8 tests.
- `cargo clippy --all-targets --locked -- -D warnings`: passed.
- `cargo build --release --locked`: embedded assets built successfully.
- Browser: metric selection, chart click, native ArrowDown/Enter selection,
  retained focus with a 3px outline, and Show latest all update the selected observation.
- Browser: light and dark themes; 320px viewport has 320px document width,
  full-width 16px native selects, and no horizontal document overflow.
- Rendered token contrast: muted text 5.01:1 light / 7.47:1 dark;
  chart strokes 5.50:1 light / 8.03:1 dark against their surfaces.
- Local protocol fixture: focusing the time selector paused history; selection
  stayed at 06:21:35 while collection advanced to 06:21:55. Show latest resumed following.
  This verifies local streaming behavior, not an ML Cloud connection.
- New history styles introduce no animation and include forced-colors rules.

Not verified:

- Screen reader speech output, OS forced-colors rendering, and browser zoom.
- Production cluster connectivity or production-scale performance.

## Verdict

Approve
