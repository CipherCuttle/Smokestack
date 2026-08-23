# Engineering Constitution

## Debt target

Smokestack cannot guarantee zero future maintenance cost. It does require **zero known, unowned, untracked or avoidable debt on `main`**.

A temporary workaround is not a PASS condition. Either remove it before stage closure or leave the stage blocked.

## Promotion boundary

`experiments/` is disposable qualification code.
`research/` records calibration/evaluation artifacts.
`src/` is promoted runtime code.

Production code may not import experiment/research code. A useful experiment is rewritten/ported through an explicit promotion PR with fixtures/parity tests where applicable.

## Complexity budget

Before PR-09, prohibited without a new ADR backed by measured need:
- second runtime language;
- microservices;
- Redis;
- Kafka/RabbitMQ;
- vector database;
- graph database;
- ML framework;
- web framework;
- LLM provider SDK in the detector path.

## TypeScript baseline

`src/core` must compile under strict TypeScript with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, and `noUncheckedSideEffectImports`.

External unknown data is validated before it reaches core contracts.

## Forbidden debt markers on promoted runtime paths

Unless a PR explicitly fails closure, promoted code must not contain unresolved TODO/FIXME/HACK, `@ts-ignore`, broad lint/type suppressions, skipped tests, swallowed exceptions, undocumented magic thresholds, or silent provider fallbacks.

## Dependency rule

Every direct dependency must be listed in `docs/DEPENDENCIES.md` with purpose and removal criteria. Prefer platform/runtime primitives until a third-party package clearly lowers total risk.

## PR completion protocol

For every implementation phase:

`IMPLEMENT -> TEST -> ONE independent hostile review -> fix Critical/High -> ONE targeted re-review only if C/H fixes occurred -> COMMIT/MERGE -> MOVE FORWARD`

Medium/Low do not restart a phase unless they invalidate the phase objective/evidence, violate a frozen invariant, or create a fail-closed/security risk.

## Change size

Prefer one semantic concern per PR. Contracts and migrations precede consumers. Backward-incompatible changes require an explicit migration/version plan.

## ADR rule

Create an ADR for decisions expensive to reverse: a new runtime language/service, database/storage class, provider semantic substitution, time semantics, detector scientific contract, public receipt format, or execution/custody capability.
