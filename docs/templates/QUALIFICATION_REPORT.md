# Source / Instrument Qualification Report

## Identity

- Qualification ID:
- Stage:
- Code SHA:
- Config digest:
- Started at:
- Closed at:

## Claim being qualified

State exactly what this instrument/source must be able to measure. This is not a product efficacy claim.

## Universe / denominator

- Universe definition:
- Inclusion rule:
- Exclusion rule:
- Observation window:
- Total eligible denominator:

## Frozen gates before measurement

| Metric | Required gate | Observed | PASS/FAIL |
|---|---:|---:|---|
| Parse success | | | |
| Coverage | | | |
| Freshness/latency | | | |
| Audit agreement | | | |
| Schema drift | | | |
| Cost | | | |

## Source semantics

Document endpoint/query, pagination, timestamps, revision/correction behavior, rate limits, known missingness and any vendor-generated labels intentionally excluded from decision use.

## Independent audit

Describe how a sample was checked against direct chain/source truth without using outcome information.

## Failures

List every failure class and denominator. Do not collapse timeouts/schema errors into zero observations.

## Verdict

`QUALIFIED | NOT_QUALIFIED | PIVOT`

## Authorized next action

Exactly one next stage/action. Qualification PASS does not authorize detector efficacy claims.
