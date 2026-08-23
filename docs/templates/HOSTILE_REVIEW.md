# Independent Hostile Review Receipt

## Candidate identity

- PR / commit SHA:
- Phase objective:
- Reviewer identity/tool:
- Reviewed at:

## Review boundary

List files/contracts/evidence inspected and what was intentionally out of scope.

## Attack vectors

At minimum consider:
1. prerequisite/version/toolchain failure;
2. semantic contract ambiguity;
3. temporal/lookahead leakage;
4. missingness/provider outage misclassification;
5. idempotency/concurrency failure;
6. evidence/research-state contamination;
7. security/supply-chain boundary;
8. complexity/debt introduced beyond phase objective;
9. falsification/kill gate evasion;
10. silent conflict or mutable identity.

## Findings

| ID | Severity | Finding | Evidence | Required fix? |
|---|---|---|---|---|

Severity: `CRITICAL | HIGH | MEDIUM | LOW`.

## Verdict

`PASS_NO_CRITICAL_HIGH | CHANGES_REQUIRED`

Medium/Low do not automatically restart the phase unless they invalidate the phase objective/evidence, violate a frozen invariant, or create fail-closed/security risk.

## Re-review budget

Exactly one targeted re-review is permitted only if Critical/High repairs were required.
