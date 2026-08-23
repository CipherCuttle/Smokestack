## Phase / objective

<!-- One bounded phase objective. -->

## Prerequisite state

- [ ] Prior stage is terminal ADVANCE/PIVOT as required.
- [ ] No unauthorized downstream capability is introduced.

## Changes

<!-- Smallest safe diff. -->

## Verification

- [ ] `npm run check`
- [ ] Relevant golden/negative/adversarial tests
- [ ] No decision-time future leakage introduced
- [ ] No silent unavailable->zero/THIN coercion
- [ ] Direct dependencies documented
- [ ] Migrations/contracts precede consumers when applicable

## Research boundary

- [ ] Qualification / Calibration / Frozen / Prospective state is explicit.
- [ ] Trial ledger updated if calibration semantics changed.
- [ ] Frozen detector version bumped if semantic meaning changed.

## Hostile review

- [ ] Exactly one independent hostile review completed.
- [ ] Critical/High findings fixed.
- [ ] Targeted re-review used only if Critical/High repairs occurred.

## Debt check

- [ ] No unresolved workaround is being called PASS.
- [ ] No TODO/FIXME/HACK/skip/suppression added to promoted runtime paths.

## Verdict

`ADVANCE | PIVOT | KILL | BLOCKED`
