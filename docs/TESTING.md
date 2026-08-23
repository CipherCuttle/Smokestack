# Testing Doctrine

Tests are organized by risk, not by an arbitrary repository-wide coverage percentage.

## Foundation

Every PR must keep `npm run check` green. Promoted code must have deterministic unit/contract coverage for the semantics it introduces.

## Pure decision logic

Once introduced, temporal eligibility, Formation construction, attention-state aggregation, Tripwire decisions and publication identity require branch/boundary coverage plus negative controls. A rule is not tested merely because its happy path ran.

## Golden fixtures

Ported donor behavior must have a golden fixture whenever preserving exact behavior matters. Record donor repo/commit and the fixture's source identity.

Golden fixtures are immutable once bound to a frozen research artifact; create a new fixture/version rather than editing history.

## Property-based tests

Introduce property-based testing when PR-02 temporal/serialization logic exists. Target invariants such as:

- decode(encode(x)) = x for domain contracts;
- replay of the same raw input produces identical decision-relevant output;
- duplicate ingest is semantically idempotent;
- future-fetched evidence cannot affect a snapshot at an earlier decision time;
- canonical receipt bytes/digest remain invariant under irrelevant object insertion order once receipt work is authorized.

Do not add a property-testing dependency before a real property exists.

## Mutation testing

Mutation testing is deferred until a frozen detector exists. Use it only on high-consequence pure functions such as temporal eligibility, Tripwire decision thresholds and publication uniqueness. A surviving boundary mutation is a test failure to repair before closure.

## Integration tests

Provider integrations use captured fixtures by default. Live tests are qualification or explicitly authorized canaries; unit/CI tests must not depend on live provider availability.

Database integration tests, once PR-02 begins, must cover:
- migration from empty database;
- migration from previous supported schema;
- transaction rollback;
- unique/idempotency constraints;
- deterministic rebuild from raw observations.

## Adversarial battery

Before a frozen detector may run prospectively, tests must include at least:
- semantic/name-only fake cluster;
- same-deployer spam;
- service/high-ubiquity actor shared everywhere;
- provider outage and partial coverage;
- duplicate/out-of-order observations;
- future observation injection;
- symbol/name collision;
- parser schema drift;
- duplicated concurrent decision/publication attempts when publication exists.

## Test debt rule

No skipped test or knowingly insufficient test suite may be called PASS for the phase whose invariant it is supposed to protect.
