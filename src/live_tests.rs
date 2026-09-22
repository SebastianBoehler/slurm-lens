use crate::{slurm, telemetry};
use serde_json::json;

fn responses() -> (serde_json::Value, serde_json::Value) {
    let meta = json!({"slurm":{"cluster":"test"}});
    (
        json!({"meta":meta,"errors":[],"jobs":[{
            "job_id":12,"name":"fixture","job_state":["RUNNING"],"nodes":"node-1",
            "start_time":{"set":true,"infinite":false,"number":1787000000},
            "end_time":{"set":true,"infinite":false,"number":1987000000},
            "tres_req_str":"cpu=4,mem=32G,gres/gpu=2,gres/gpu:a100=2",
            "tres_alloc_str":"cpu=4,mem=32G,gres/gpu=2,gres/gpu:a100=2",
            "dependency":"afterok:10?afternotok:11"
        }]}),
        json!({"meta":meta,"nodes":[{"name":"node-1","state":["MIXED"],"cpus":64,"real_memory":128000,"gres":"gpu:a100:4"}]}),
    )
}
#[test]
fn allocations_do_not_double_count_or_invent_actual_end() {
    let (jobs, nodes) = responses();
    let frame = slurm::parse(&jobs, &nodes, "test", "2026-09-08T12:00:00Z").unwrap();
    assert_eq!(frame.jobs[0].allocated.as_ref().unwrap().gpus, 2);
    assert!(frame.jobs[0].ended_at.is_none());
    assert_eq!(
        frame.jobs[0].dependency_expression.as_deref(),
        Some("afterok:10?afternotok:11")
    );
    assert!(frame.jobs[0].dependencies.is_empty());
    assert_eq!(frame.inventory.unwrap()[0].cpus, Some(64));
}
#[test]
fn identity_and_api_errors_fail_closed() {
    let (mut jobs, nodes) = responses();
    assert!(slurm::parse(&jobs, &nodes, "other", "2026-09-08T12:00:00Z").is_err());
    jobs["errors"] = json!([{"description":"denied"}]);
    assert!(slurm::parse(&jobs, &nodes, "test", "2026-09-08T12:00:00Z").is_err());
}
#[test]
fn pending_estimates_are_not_actual_allocations() {
    let (mut jobs, nodes) = responses();
    jobs["jobs"][0]["job_state"] = json!(["PENDING"]);
    let frame = slurm::parse(&jobs, &nodes, "test", "2026-09-08T12:00:00Z").unwrap();
    assert!(frame.jobs[0].allocated.is_none());
    assert!(frame.jobs[0].started_at.is_none());
}
#[test]
fn exporter_samples_keep_identity_and_reject_nonfinite_values() {
    let mut value = json!({"status":"success","data":{"resultType":"vector","result":[{"metric":{"instance":"host:9400","UUID":"GPU-1"},"value":[1787000000,"42"]}]}});
    let metric = telemetry::parse(&value, "GPU utilization (%)")
        .unwrap()
        .remove(0);
    assert_eq!(metric.device.as_deref(), Some("GPU-1"));
    assert_eq!(metric.value, 42.0);
    value["data"]["result"][0]["value"][1] = json!("NaN");
    assert!(telemetry::parse(&value, "GPU utilization (%)").is_err());
}

#[test]
fn job_owner_is_preserved_without_inventing_missing_identity() {
    let (mut jobs, nodes) = responses();
    for value in [json!(null), json!(""), json!("  "), json!("alice")] {
        jobs["jobs"][0]["user_name"] = value.clone();
        let frame = slurm::parse(&jobs, &nodes, "test", "2026-09-08T12:00:00Z").unwrap();
        assert_eq!(
            frame.jobs[0].user.as_deref(),
            if value == "alice" {
                Some("alice")
            } else {
                None
            }
        );
    }
}
