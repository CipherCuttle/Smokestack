# Operations Progression

Operational machinery is added only when the product phase needs it.

## PR-00

Only CI build/typecheck/test. No daemon, scheduler, DB or network source.

## Source qualification

Qualification scripts must log provider request count/status, parser failures, schema-drift cases, latency/freshness, coverage denominator, and cost. They are not production SLOs.

## Promoted observation runtime

Once PR-03 exists, add domain telemetry for source request/error/schema-drift, source freshness seconds, observations ingested/deduped, and projection replay failures.

## Detector runtime

Once PR-08 exists, add candidate formation count, FIRE/NO_SIGNAL/UNAVAILABLE counts by reason, decision latency, stale-source ineligibility, and checkpoint completion.

## Notification runtime

Once PR-11 exists, add outbox pending age, publication attempt/ack/retry, duplicate/conflict attempts and reconciliation state.

Alerting should remain simple and actionable. Do not build anomaly detection for the monitoring system before basic freshness/error signals exist.
