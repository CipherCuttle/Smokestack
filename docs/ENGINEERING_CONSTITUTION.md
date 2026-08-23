# Engineering Constitution

## Debt target

Smokestack cannot guarantee zero future maintenance cost. It does require **zero known, unowned, untracked or avoidable debt on `main`**.

A temporary workaround is not a PASS condition. Either remove it before stage closure or leave the stage blocked.

## Promotion boundary

`experiments/` is disposable product/source qualification code.
`research/` records calibration/evaluation artifacts.
`src/` is promoted application runtime code.
`tooling/` is development infrastructure and is outside the application dependency graph.

Production code may not import experiment/research/tooling code. A useful experiment is rewritten/ported through an explicit promotion PR with fixtures/parity tests where applicable.

## Agent tooling boundary

DeepSeek Harness may be used only after the qualification ladder in `docs/DSH_BUILD_CONTROL.md` closes `DSH_BUILD_CONTROL_QUALIFIED`.

Before that verdict:
- no DSH model-backed run may mutate Smokestack;
- no DSH package belongs in the root application dependency set;
- no coding-agent API key may be introduced to rescue qualification;
- qualification uses disposable fixture repositories/worktrees;
- failure of DSH qualification leaves manual/single-agent development available.

After qualification, DSH remains a build controller. The active phase contract, Git state, deterministic tests, and this constitution outrank agent suggestions.

An agent may not self-authorize downstream work, skip required review, expand scope, or declare its own unobserved tests successful.

## Complexity budget

Before PR-09, prohibited in the application without a new ADR backed by measured need:
- second application runtime language;
- microservices;
- Redis;
- Kafka/RabbitMQ;
- vector database;
- graph database;
- ML framework;
- web framework;
- LLM provider SDK in the detector path.

Qualified development tooling under `tooling/` does not count as an application runtime language/service, but it must remain independently removable and must not change the clean application bootstrap.

## TypeScript baseline

`src/core` must compile under strict TypeScript with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, and `noUncheckedSideEffectImports`.

External unknown data is validated before it reaches core contracts.

## Forbidden debt markers on promoted runtime paths

Unless a PR explicitly fails closure, promoted code must not contain unresolved TODO/FIXME/HACK, `@ts-ignore`, broad lint/type suppressions, skipped tests, swallowed exceptions, undocumented magic thresholds, or silent provider fallbacks.

## Dependency rule

Every direct application dependency must be listed in `docs/DEPENDENCIES.md` with purpose and removal criteria. Prefer platform/runtime primitives until a third-party package clearly lowers total risk.

Tooling dependencies get a separate manifest/lock under their tooling boundary; they do not silently enter the root application dependency graph.

## PR completion protocol

For every implementation phase:

`IMPLEMENT -> TEST -> ONE independent hostile review -> fix Critical/High -> ONE targeted re-review only if C/H fixes occurred -> COMMIT/MERGE -> MOVE FORWARD`

Medium/Low do not restart a phase unless they invalidate the phase objective/evidence, violate a frozen invariant, or create a fail-closed/security risk.

When qualified DSH is used, those limits are mechanically enforced by the build protocol rather than left only in the prompts.

## Change size

Prefer one semantic concern per PR. Contracts and migrations precede consumers. Backward-incompatible changes require an explicit migration/version plan.

## ADR rule

Create an ADR for decisions expensive to reverse: a new application runtime language/service, database/storage class, provider semantic substitution, time semantics, detector scientific contract, public receipt format, execution/custody capability, or a material change to the DSH build-control trust/permission model.
