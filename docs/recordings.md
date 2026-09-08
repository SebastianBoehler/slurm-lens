# Recording format, version 1

The Rust types in `src/model.rs` define the accepted JSON structure. Unknown fields,
unsupported versions, non-UTC timestamps and unordered captures are rejected.
The file size limit for a supplied recording is 32 MiB. Version 1 supports one
cluster per recording; cluster federation and combined inventories are not modeled.

## Session

| Field | Meaning |
| --- | --- |
| `schema_version` | Integer `1` |
| `title`, `description` | Human-readable origin and limitations |
| `timezone` | `UTC` |
| `frames` | Nonempty sequence of captures, ordered oldest first |

Each frame contains `captured_at` and a `jobs` array. Live exports can also include
`inventory` (node records) and `metrics` (Prometheus series). Both are optional;
their exact types are in `src/telemetry.rs`. Metrics preserve their series identity
and result timestamp. Jobs can include an optional `dependency_expression` string
for scheduler conditions that must not be simplified.

 Timestamps use the exact form
`YYYY-MM-DDTHH:MM:SSZ`. A capture is not necessarily an atomic cluster snapshot:
the source may read several jobs sequentially.

## Job

Identity: `id`, `name`, `cluster`, `account`, `partition`.

State: `state` (Slurm state), `reason` (scheduler reason), `exit_code` (nullable).

Placement: `node` (nullable), `requested`, `allocated`. Resource objects contain
integer `gpus`, integer `cpus`, and the scheduler's `memory` quantity string.
Absent resource data is JSON `null`, not zero. Pending jobs have no actual start
or allocation. A zero count means a recorded zero only.

Timing: nullable `submitted_at`, `started_at`, `ended_at`; required `observed_at`
and `time_limit`. `ended_at` is a terminal actual end, never a time-limit-derived
projected end. `time_limit` preserves Slurm's duration representation.

Dependencies: array of `{ "id": "4101", "condition": "afterok" }`.
Supported conditions are `afterok`, `afternotok` and `afterany`; a dependency may
refer to a predecessor outside the recording. Do not silently flatten complex
Slurm AND/OR expressions into this format: version 1 does not encode them.

Each capture should include observed jobs plus retained earlier terminal records.
Retained entries keep their original `observed_at`. A missing scheduler row is
not evidence that a job completed. Previously recorded dependency edges can be
retained; do not invent dependencies that were never captured.

## Included example

`examples/session.json` is a sanitized derivative of existing scheduler captures.
Only explicitly selected fields were copied. Job and campaign identifiers,
names, account, partition labels, cluster and node names were replaced. Dates
were shifted by one common offset, keeping relative intervals. Paths, usernames,
comments, commands, environment data, source hashes, scientific results and raw
transport logs are excluded.

`node-01` etc. are stable aliases within the recording. They do not encode node
capacity or hardware slot numbers. The source was a single-GPU-per-job workload;
it does not demonstrate a real multi-GPU job.

The source collector omitted already-expired scheduler records. Consequently
some earlier smoke tests are absent. Last-known terminal jobs are carried forward;
nonterminal observations that become stale remain distinguishable in the UI.
