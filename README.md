# Smokestack

> **The chain moves before the timeline does.**

Smokestack is a prospective research and operator-support system for detecting when newly active onchain assets begin forming a non-trivial structural cluster before public attention around those members becomes obvious.

## Current state

`PR00_CONSTITUTION_ONLY`

This repository is intentionally fail-closed. PR-00 contains the engineering/research constitution, chronological build order, stage kill gates, and a minimal buildable TypeScript CLI. It does **not** authorize live providers, detectors, alerts, trading, or public claims.

Run locally with the pinned toolchain:

```bash
nvm use
npm ci
npm run check
npm run smokestack -- status
```

Expected status includes:

```json
{
  "state": "PR00_CONSTITUTION_ONLY",
  "mode": "OBSERVATION_ONLY",
  "liveProvidersAuthorized": false,
  "detectorAuthorized": false,
  "publicAlertsAuthorized": false,
  "tradingAuthorized": false
}
```

## North Star

Smokestack should eventually answer, with point-in-time evidence:

1. What is forming?
2. Why does it look structurally real rather than name/deployer spam?
3. Was public attention actually low when the formation was detected?
4. Which assets belong to the formation, and why?
5. Which members are structurally suspect?
6. When did Smokestack first know each fact?
7. What happened afterward?
8. Can the original decision be replayed and verified?

The initial scientific claim is deliberately narrower than “find gems”:

> **Structural formations observed while member-level public attention is qualified as THIN may predict subsequent attention transition better than trivial contemporaneous baselines.**

`EMBER` is a later, separate economic hypothesis and is not part of V0.

## Development orchestration

Smokestack intends to qualify DeepSeek Harness as an **optional development control plane**, not an application dependency.

Target topology:

```text
subscription Codex orchestrator (read-only)
              |
              v
            DSH
        /           \
Codex worker     Claude reviewer
 bounded write      read-only
```

The target development treatment requires no `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or DeepSeek model API key. Native coding-product subscription/account authentication stays outside the repository. DSH is not allowed to mutate Smokestack until its disposable-fixture qualification ladder passes, and failure of that tooling experiment does not block Smokestack development.

See [`docs/DSH_BUILD_CONTROL.md`](docs/DSH_BUILD_CONTROL.md) and [`docs/ADR/0006-dsh-development-control-plane.md`](docs/ADR/0006-dsh-development-control-plane.md).

## Read first

- [`docs/NORTH_STAR.md`](docs/NORTH_STAR.md)
- [`docs/WORKING_ORDER.md`](docs/WORKING_ORDER.md)
- [`docs/KILL_CRITERIA.md`](docs/KILL_CRITERIA.md)
- [`docs/RESEARCH_POLICY.md`](docs/RESEARCH_POLICY.md)
- [`docs/ENGINEERING_CONSTITUTION.md`](docs/ENGINEERING_CONSTITUTION.md)
- [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/DSH_BUILD_CONTROL.md`](docs/DSH_BUILD_CONTROL.md)

## Non-goals for V0

No trading, custody, transaction signing, “smart money” claims, alpha score, confidence score, embeddings, vector DB, graph DB, ML/LLM decision path, public UI, Telegram alerts, multi-chain support, Python application service, Rust verifier, Redis, Kafka, or microservices.

Those are not missing features. They are intentionally unauthorized until earlier stage evidence earns them.
