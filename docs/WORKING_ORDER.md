# Chronological Working Order

No product stage may begin until the prior product stage has a terminal `ADVANCE` or an explicitly documented `PIVOT` that redefines the downstream North Star. `KILL` stops that branch of the product.

Development tooling has a separate rule: failure of DSH qualification kills the DSH build-control treatment, **not Smokestack**. Manual/single-agent development remains valid.

## PR-00 — Constitution

Build only the repo foundation, pinned toolchain, minimal CLI, CI, documentation, policies, ADRs, and fail-closed status.

Exit: `FOUNDATION_PASS`.

## PR-00A — DSH Build-Control Qualification (tooling, optional for the product; mandatory before DSH may author Smokestack changes)

This phase exists only because Smokestack intends to use DeepSeek Harness as a development control plane. It is not a product/scientific prerequisite and must remain under `tooling/dsh/` plus disposable fixtures.

Run the ordered qualification ladder in `docs/DSH_BUILD_CONTROL.md`:

1. `DSH-Q0` cold install/runtime closure;
2. `DSH-Q1` OpenRouter parent route + native child identity qualification;
3. `DSH-Q2` DeepSeek V4 Flash parent tool-loop qualification;
4. `DSH-Q3` one bounded Codex implementer;
5. `DSH-Q4` mechanically read-only Claude reviewer;
6. `DSH-Q5` one severe-repair/rereview cycle;
7. `DSH-Q6` comparative utility against simpler controls.

No DSH model-backed qualification run may target Smokestack itself before Q5 closes mechanically correct; comparative evaluation uses unseen disposable engineering fixtures. DSH becomes the default build path only after Q6 establishes enough quality/reliability/governance value to justify its orchestration tax.

`OPENROUTER_API_KEY` is authorized only for the parent route during qualification. Do not add OpenAI or Anthropic API keys to rescue native child qualification.

Exit:
- `DSH_BUILD_CONTROL_QUALIFIED`: DSH may be used for later Smokestack implementation PRs under the frozen protocol;
- `DSH_BUILD_CONTROL_REJECTED`: continue Smokestack without mandatory DSH;
- `BLOCKED`: fix only the failing tooling prerequisite under the same bounded phase if its repair is already authorized; otherwise stop and redesign.

## PR-01 — Source Qualification Harness

Disposable code under `experiments/qualification/` only.

Tasks:
- freeze `SOLANA_UNIVERSE_CANDIDATE_V0` definition;
- evaluate discovery, market-state, first-buyer, and direct-chain audit sources;
- record provider semantics, pagination, rate limits, freshness, coverage, and schema behavior;
- verify first-buyer identity/order samples against chain truth;
- measure cost.

No runtime provider code may be promoted yet.

Exit: `SOURCE_STACK_QUALIFIED` or `KILL_SMOKESTACK_V0`.

## PR-02 — Temporal Contracts and Ledger

Introduce PostgreSQL only now.

Build:
- raw observation contract;
- source-event/slot time when available;
- fetched-at and recorded-at knowledge times;
- raw response bytes + SHA-256;
- append-only storage;
- deterministic projection/replay;
- schema-version metadata.

Exit: `TEMPORAL_LEDGER_PASS`.

## PR-03 — Solana Observation Adapters

Rewrite/promote only the source behaviors that passed PR-01. Qualification scripts remain non-runtime or are deleted after fixtures are retained.

Exit: `SOLANA_OBSERVATION_PASS`.

## PR-04 — Structural Actor Kernel

Port/reimplement the useful Pyroshade primitives:
- early actors;
- known service/protocol exclusions;
- high-ubiquity neutral suppression;
- deployer identity;
- structural facts.

No smart-money semantics and no price-outcome labels.

Exit: `STRUCTURAL_KERNEL_PASS` or contamination-driven `PIVOT/KILL`.

## PR-05 — Formation Calibration

Exploratory calibration only; all attempted configurations go to the trial ledger.

Use transparent edges only:
- temporal proximity;
- qualifying actor overlap;
- deployer independence;
- structural quality.

Compare against Amali-style name/deployer baseline. Test graph percolation and sensitivity.

Exit: `FORMATION_INSTRUMENT_QUALIFIED`, `PIVOT`, or `FORMATION_THESIS_FAIL`.

## PR-06 — Attention Instrument Qualification

Qualify at least one crypto-social information family and one independent secondary family. Missing coverage is `UNAVAILABLE`, never `THIN`.

V0 measures attention around frozen Formation members using deterministic identifiers (symbols, names, official domains/handles). No LLM query expansion.

Exit: `ATTENTION_INSTRUMENT_QUALIFIED` or kill the pre-attention claim.

## PR-07 — Silent Ignition Preregistration

Freeze after qualification/calibration:
- universe;
- provider semantics;
- schemas;
- actor/exclusion rules;
- formation config;
- attention rule;
- detector rule;
- controls/baselines;
- horizons;
- primary endpoint;
- minimum useful effect;
- sample size/precision target;
- stopping rule;
- code/config/schema digests;
- complete calibration trial ledger.

Exit: `SILENT_IGNITION_V0_FROZEN`.

## PR-08 — Prospective Shadow Runner

Run the frozen detector prospectively with no UI/alerts/tuning/manual outcome-aware suppression.

Record all FIRE, NO_SIGNAL and UNAVAILABLE decisions plus separate outcome checkpoints.

Any semantic change becomes V1 with a new cohort.

Exit only at the preregistered boundary.

## PR-09 — Silent Ignition Adjudication

Evaluate the preregistered primary endpoint against controls and baselines.

Outcomes:
- `ADVANCE`: effect is large/precise enough to matter;
- `PIVOT`: Formation is useful but attention divergence is not;
- `KILL`: no useful incremental signal.

No product shell is built before this decision.

## PR-10 — Private Operator View

Expose consecutive real Tripwires privately. Record `WORTH_OPENING yes/no` before viewing future outcomes when applicable.

Gate:
- >=60% worth opening: advance;
- 40–60%: one bounded information-density revision and one re-test;
- <40%: kill alert product.

## PR-11 — Transactional Notification

Only now add private notification delivery using PostgreSQL transactional outbox + idempotent publication. No broker unless measured throughput/reliability requires one.

## PR-12 — Independent Receipt Verifier

Only now introduce Rust, if public verification remains valuable. Implement only schemas/JCS/SHA-256/receipt invariants. TypeScript and Rust must agree on all golden vectors.

## PR-13 — Public Smokestack V0

Add public web/API surfaces only after efficacy, operator utility, crash-safe delivery, and independent receipt verification survive.

## PR-14 — Ember Exploration Authorization

A new research program, not an extension of Silent Ignition. Explore relative maturity only on validated Formation semantics, log every trial, freeze `EMBER_V1`, then collect a new prospective economic cohort including realistic liquidity/friction constraints.

## PR-15+ — Cross-chain

Only after the Solana core survives. A second chain must implement the existing observation contracts without chain-specific conditionals invading core semantics.
