# ADR-0006: DSH Is an Optional Development Control Plane, Not a Smokestack Runtime Dependency

Status: ACCEPTED for PR-00

## Context

Smokestack may use DeepSeek Harness (DSH) to coordinate independent coding-agent identities while the application itself remains a small TypeScript modular monolith.

DSH is currently a developer-preview project with compatibility-breaking changes expected. The earlier QntyLab DSH lineage also demonstrated that a build harness can accumulate its own prerequisite chain: runtime materialization, profile composition, executable identity, ambient home state, provider ordering, claim transport, and retry semantics all became blockers before useful repository work occurred.

Smokestack must obtain the benefits of bounded multi-agent development without making the product depend on that machinery.

## Decision

DSH is **tooling**, not application architecture.

- `src/**` MUST NOT import DSH packages or DSH-generated runtime state.
- a clean Smokestack build/test MUST NOT require DSH, Codex, Claude, coding-agent authentication, or a DSH home;
- DSH tooling lives under `tooling/dsh/` only after its qualification stage begins;
- DSH receives its own exact version/commit identity and lockfile;
- an unqualified DSH installation MUST NOT mutate Smokestack;
- failure or rejection of the DSH build-control thesis MUST NOT kill Smokestack or block manual/single-agent development;
- DSH may be used on Smokestack implementation PRs only after `DSH_BUILD_CONTROL_QUALIFIED` closes PASS.

## Intended topology

```text
subscription-authenticated Codex orchestrator
              |
      governed tool calls
              v
       DSH control boundary
        /             \
       v               v
Codex implementer   Claude reviewer
(worktree-write)    (mechanically read-only)
       |               |
       +-------+-------+
               v
       tests + receipts
```

The orchestrator must have no direct repository write authority. The implementer owns the bounded write surface. The reviewer cannot repair findings.

## Authentication decision

Coding-agent authentication remains native to the coding products and outside Smokestack/DSH semantic policy.

The target configuration contains **no `OPENAI_API_KEY` and no `ANTHROPIC_API_KEY`**. Each coding identity is authenticated interactively through its native subscription/account flow before DSH is invoked. DSH receives only explicit non-secret identity/home references required to launch the selected native product.

This statement applies to coding-agent authentication only. Future market/social data providers may have their own independent credential requirements during source qualification.

## Parent integration decision

Do not route the orchestrator through an API-metered DSH LLM provider merely because that path already exists.

The preferred native-parent spike uses Codex `app-server --stdio` with structured JSON-RPC and dynamic tools. The controller exposes only governed orchestration operations to the parent. Terminal-output scraping is forbidden.

If a native Codex parent cannot be made structured, observable, read-only, bounded, and reproducible without fragile integration, the native-parent thesis is killed. A simpler external/manual orchestrator may remain available, but it does not inherit the stronger DSH-parent claim.

## No remote claim machinery in V0 tooling

Smokestack DSH V0 does not implement QntyLab-style remote Git episode claims, remote create-only refs, production DSH_HOME materialization, or network-backed at-most-once acquisition.

A development episode uses a local exclusive episode identity/state directory. Ambiguous local process state fails closed for that episode. Git PR/branch state remains ordinary Git state.

Remote claim machinery may be proposed only through a later ADR after a real distributed-concurrency requirement exists.

## Consequences

Positive:
- DSH cannot infect product runtime dependencies;
- the product remains buildable if all agent subscriptions are unavailable;
- subscription-native orchestration can be tested cheaply on disposable fixtures;
- failures in DSH qualification are cheap and isolated;
- QntyLab's useful lessons are preserved without copying its governance/runtime prerequisite stack.

Negative:
- DSH receives a separate qualification step before it can accelerate product work;
- a native Codex-parent bridge may require a small Smokestack-owned tooling adapter/controller;
- coding-agent subscription limits still exist even when API keys are absent.
