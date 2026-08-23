# Contributing to Smokestack

Read `docs/NORTH_STAR.md`, `docs/WORKING_ORDER.md`, `docs/ENGINEERING_CONSTITUTION.md`, `docs/RESEARCH_POLICY.md` and the active phase contract before changing code.

## Core rule

Do not implement downstream capability because it is convenient while working on an earlier prerequisite. The chronological build order is part of the product's correctness.

## Branch / PR discipline

- one bounded semantic objective per PR;
- contracts/migrations before consumers;
- smallest safe diff;
- no drive-by refactors unrelated to the phase objective;
- update ADR when an expensive-to-reverse architectural decision changes;
- update trial ledger when calibration semantics change;
- new frozen detector semantics require a new detector version/cohort.

## Definition of done

`IMPLEMENT -> TEST -> ONE independent hostile review -> fix Critical/High -> ONE targeted re-review only if C/H fixes occurred -> COMMIT/MERGE -> MOVE FORWARD`.

A phase cannot close PASS with a known temporary workaround or an assumption that materially affects its objective.

## Commands

```bash
nvm use
npm ci
npm run check
npm run smokestack -- status
```

Additional stage-specific checks are documented in that stage's PR/closure artifact.
