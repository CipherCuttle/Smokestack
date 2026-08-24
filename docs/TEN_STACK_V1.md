# TEN_STACK_V1

Status: FROZEN FOR PR-00B QUALIFICATION

TEN_STACK_V1 is the adversarial review rubric for autonomous Smokestack development sprints. It is a review contract, not a source of authority over product or research semantics.

Each reviewed task must return an explicit disposition for all ten vectors:

1. **OBJECTIVE** — Does the candidate satisfy the frozen task/phase contract rather than a nearby easier task?
2. **CORRECTNESS** — Logic, invariants, edge cases, boundary behavior, type/ordering errors, and hidden assumptions.
3. **ADVERSARIAL** — Inputs, states, sequences, actors, or environmental conditions that could break or invalidate the candidate.
4. **SECURITY** — Permissions, credentials, trust boundaries, fail-open behavior, injection, data exposure, and unauthorized side effects.
5. **EVIDENCE** — Are material factual or research claims source-backed? Are contradictory sources or plausible counterarguments represented? Citations must resolve to stable identifiers/URLs supplied by the research toolchain; reviewer prose alone is not evidence.
6. **TEMPORAL_DATA** — Point-in-time correctness, ordering, freshness, source/schema drift, lookahead contamination, replayability, and missing-data semantics.
7. **VERIFICATION** — Can the tests/receipts actually falsify the implementation? Are assertions independent of the implementation and are hidden/host-observed checks preserved?
8. **ARCHITECTURE** — Coupling, unnecessary abstraction, dependency violations, cross-layer leakage, and durable technical debt.
9. **OPERATIONS** — Crash safety, retries, idempotency, process quiescence, observability, resource ceilings, and cost/spend behavior.
10. **SIMPLICITY_UTILITY** — Is there a materially simpler solution? Is the change worth its complexity and does it advance the phase objective?

## Severity contract

Allowed severities are `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, and `NONE`.

Normal autonomous repair is authorized only for `CRITICAL` or `HIGH` findings. `MEDIUM` or `LOW` does not create a repair loop unless it independently invalidates the task objective/evidence, violates a frozen invariant, or creates a fail-closed/security risk; such escalation must be encoded by the host controller as a Critical/High-equivalent gate rather than inferred from reviewer prose.

## Required structured result

```json
{
  "rubric": "TEN_STACK_V1",
  "vectors": {
    "OBJECTIVE": {"severity": "NONE", "findings": []},
    "CORRECTNESS": {"severity": "NONE", "findings": []},
    "ADVERSARIAL": {"severity": "HIGH", "findings": [{"id": "H-01", "evidence": "...", "repair_condition": "..."}]},
    "SECURITY": {"severity": "NONE", "findings": []},
    "EVIDENCE": {"severity": "NONE", "findings": []},
    "TEMPORAL_DATA": {"severity": "NONE", "findings": []},
    "VERIFICATION": {"severity": "NONE", "findings": []},
    "ARCHITECTURE": {"severity": "NONE", "findings": []},
    "OPERATIONS": {"severity": "NONE", "findings": []},
    "SIMPLICITY_UTILITY": {"severity": "NONE", "findings": []}
  },
  "gate": "CRITICAL_HIGH_FOUND"
}
```

`gate` must be exactly `CRITICAL_HIGH_FOUND` when any vector contains a Critical/High finding, otherwise `NO_CRITICAL_HIGH`.

## Independence rule

The implementer may self-check before handoff, but its self-check never closes the review gate. For `REVIEWED` and `GOVERNED` tasks, closure requires an independent reviewer result plus host-observed verification.

## Evidence rule

For research-backed tasks, the reviewer receives a compact evidence package containing claim IDs and stable source identifiers. The reviewer may challenge those claims and request additional research, but citations are validated by the host/research toolchain; invented or unresolved citations fail closed.
