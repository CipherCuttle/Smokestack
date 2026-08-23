# ADR-0006: DSH Is an Optional Development Control Plane, Not a Smokestack Runtime Dependency

Status: ACCEPTED for PR-00

## Context

Smokestack may use DeepSeek Harness (DSH) to coordinate independent coding-agent roles while the application itself remains a small TypeScript modular monolith.

DSH is currently a developer-preview project with compatibility-breaking changes expected. The earlier QntyLab DSH lineage also demonstrated that a build harness can accumulate its own prerequisite chain: runtime materialization, profile composition, executable identity, ambient home state, provider ordering, claim transport, and retry semantics all became blockers before useful repository work occurred.

Smokestack must obtain the benefits of bounded multi-agent development without making the product depend on that machinery.

## Decision

DSH is **tooling**, not application architecture.

- `src/**` MUST NOT import DSH packages or DSH-generated runtime state.
- a clean Smokestack build/test MUST NOT require DSH, Codex, Claude, coding-agent authentication, an OpenRouter key, or a DSH home;
- DSH tooling lives under `tooling/dsh/` only after its qualification stage begins;
- DSH receives its own exact version/commit identity and lockfile;
- an unqualified DSH installation MUST NOT mutate Smokestack;
- failure or rejection of the DSH build-control thesis MUST NOT kill Smokestack or block manual/single-agent development;
- DSH may be used on Smokestack implementation PRs only after `DSH_BUILD_CONTROL_QUALIFIED` closes PASS.

## Intended topology

```text
OpenRouter -> DeepSeek V4 Flash parent
              |
      governed DSH tools
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

The parent has orchestration authority only and no direct repository write route. The implementer owns the bounded write surface. The reviewer cannot repair findings.

## Authentication decision

The parent is intentionally API-backed through OpenRouter. The native coding children remain subscription-authenticated.

Target secret layout:

- `OPENROUTER_API_KEY`: parent route only;
- no `OPENAI_API_KEY` for Codex child execution;
- no `ANTHROPIC_API_KEY` for Claude reviewer execution;
- no direct DeepSeek API key.

The exact parent model is pinned to `deepseek/deepseek-v4-flash-0731`; a floating `latest` alias is not permitted in a qualified protocol.

Native child account state is created interactively outside Smokestack/DSH. DSH receives only the explicit non-secret home/identity references required to launch the selected native products. Parent and child credentials must never cross role boundaries.

Future market/social data providers may have their own independent credential requirements during source qualification.

## Parent integration decision

Use DSH's upstream provider-neutral `llm-pi-ai` seam against OpenRouter's OpenAI-compatible endpoint before considering any custom parent adapter.

This deliberately abandons the earlier keyless-native-Codex-parent idea. The OpenRouter parent is simpler, upstream-aligned, cheap enough for bounded orchestration, and avoids another custom protocol/launcher prerequisite chain.

The parent receives only the tools required by the frozen lifecycle. Generic repository write authority is forbidden. Provider retries are zero in the first qualified protocol; parent request count is mechanically bounded outside the prompt.

## No remote claim machinery in V0 tooling

Smokestack DSH V0 does not implement QntyLab-style remote Git episode claims, remote create-only refs, production DSH_HOME materialization, or network-backed at-most-once acquisition.

A development episode uses a local exclusive episode identity/state directory. Ambiguous local process state fails closed for that episode. Git PR/branch state remains ordinary Git state.

Remote claim machinery may be proposed only through a later ADR after a real distributed-concurrency requirement exists.

## Consequences

Positive:
- DSH cannot infect product runtime dependencies;
- parent integration uses an upstream-supported provider seam;
- only one model API credential is required, isolated to the parent;
- Codex/Claude can still use native subscription auth;
- failures in DSH qualification are cheap and isolated;
- QntyLab's useful lessons are preserved without copying its governance/runtime prerequisite stack.

Negative:
- parent orchestration now has a small metered API cost;
- `OPENROUTER_API_KEY` becomes a development-tool secret to protect;
- DSH still needs a separate qualification step before it can accelerate product work;
- coding-agent subscription limits and provider policy still apply to the native children.
