# DSH Build Control

## Purpose

DeepSeek Harness (DSH) is an optional development control plane for building Smokestack. It is **not** part of the Smokestack application runtime and has no scientific authority over Smokestack's market hypotheses.

The intended development protocol is:

```text
PLAN
  |
  v
DEEPSEEK V4 FLASH PARENT
(OpenRouter API; orchestration only)
  |
  v
DSH GOVERNED DELEGATION
  |
  +--> CODEX IMPLEMENTER (native subscription auth, bounded worktree write)
  |          |
  |          v
  |     HOST-OBSERVED TESTS
  |
  +--> CLAUDE REVIEWER (native subscription auth, independent, mechanically read-only)
             |
             +-- no Critical/High --> CLOSURE
             |
             +-- Critical/High --> ONE REPAIR
                                      |
                                      v
                                    RETEST
                                      |
                                      v
                              ONE TARGETED REREVIEW
                                      |
                                      v
                                     STOP
```

Hard lifecycle limits for the first qualified protocol:

- parent model requests: <=8 per episode;
- implementation calls: <=1 before review;
- hostile reviews: <=1;
- repair calls: <=1 and only for Critical/High;
- targeted rereviews: <=1 and only after Critical/High repair;
- whole-episode automatic retries: 0;
- DSH parent-provider retries: 0 for qualification and first production protocol.

Medium/Low findings do not create repair loops unless they invalidate the phase objective/evidence, violate a frozen invariant, or create a fail-closed/security risk.

## Authentication and spend boundary

The build-control treatment intentionally uses **one API credential** for the parent only:

- `OPENROUTER_API_KEY` -> DSH parent route only;
- `OPENAI_API_KEY` -> MUST be absent from Codex child configuration;
- `ANTHROPIC_API_KEY` -> MUST be absent from Claude reviewer configuration;
- no direct DeepSeek API key is required.

Codex authenticates through native ChatGPT/Codex account state. Claude Code authenticates through native Claude account state when that use is compatible with current product/account policy.

The OpenRouter key is a parent-model transport secret, not a child coding-agent credential. It must be read only by the DSH parent-provider process/configuration seam and must never be copied into child `env` overlays, prompts, receipts, fixtures, logs, Git config, or repository files.

This does **not** promise that future market-data/social-data sources are keyless. Birdeye, Helius, Kaito, or other data-source credentials are a separate PR-01 source-qualification question.

## Upstream baseline candidate

Qualification begins from an exact upstream identity, never `latest`:

```text
repository: deepseek-ai/deepseek-harness
commit:     b150a551b8d465e31e418e1b2eaf5e79bbb7d28e
release:    0.1.1-rc.2
```

This is only the **candidate baseline** until DSH-Q0 proves a cold, deterministic install. DSH is developer preview; upgrading the pin is an explicit tooling qualification event, not an ambient dependency update.

Current upstream already provides:
- a provider-neutral `llm-pi-ai` parent adapter that supports configured OpenAI-compatible gateways;
- first-class one-shot Codex subagent bundles;
- first-class one-shot Claude Code subagent bundles.

Smokestack should use those upstream surfaces before writing any provider fork.

## Parent model identity

The first parent candidate is pinned to a dated model, not an alias:

```text
provider route: smokestack-openrouter
transport:      OpenRouter OpenAI-compatible API
model:          deepseek/deepseek-v4-flash-0731
role:           orchestration/planning only
```

Do **not** use `~deepseek/deepseek-v4-flash-latest` in the qualified protocol because the alias can silently change model identity.

A future parent upgrade is a tooling requalification event and must preserve the old receipt/model identity.

### Candidate DSH parent route

The qualification profile should begin from this shape rather than patching DSH source:

```yaml
- id: llm
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      smokestack-openrouter:
        displayName: Smokestack OpenRouter
        apiKeyEnv: OPENROUTER_API_KEY
        api: openai-completions
        baseURL: https://openrouter.ai/api/v1
        compat:
          thinkingFormat: openrouter
        retryPolicy:
          mode: normal
          maxRetries: 0
        models:
          - id: deepseek/deepseek-v4-flash-0731
            name: DeepSeek V4 Flash 0731
            contextWindow: 1310720
            maxTokens: 8192
```

The exact compatibility fields are **candidate configuration** until DSH-Q1/Q2 exercises a real tool-calling turn against OpenRouter. Do not promote a guessed field merely because the YAML loads.

## Identity ontology

Never repeat QntyLab's package/native-version conflation.

An agent/model identity is a tuple, not a product name:

```text
agent_id
role
provider/product
DSH source/release identity
parent provider route + exact model id (for parent)
product package identity (for native children, if applicable)
native executable/package-payload identity
product version
executable/entrypoint digest where observable
account/auth domain (non-secret descriptor only)
HOME / CODEX_HOME identity
workspace/worktree
permission policy
call ceiling
```

Package version and native product version are separate fields. Equality is neither required nor inferred unless an upstream contract explicitly makes it so.

## Home/state layout

DSH state and native child account state are separate.

Conceptual local layout:

```text
<tooling-state>/
  dsh-home/                 # DSH profile/config only; no secret values committed
  episodes/
    <episode-id>/
      intent.json
      lock
      receipt.json

<identity-state-outside-repo>/
  codex-implementer/        # CODEX_HOME
  claude-reviewer/          # native Claude account/settings state
```

Rules:
- never commit parent or child auth state;
- never require an ambient scratch DSH_HOME;
- do not infer native child identity from PATH alone;
- qualify using explicit home/workspace inputs;
- agent home contents are not hashed wholesale because they can contain secrets/private state;
- `OPENROUTER_API_KEY` is referenced by environment variable name only and its value is never serialized.

## Parent strategy

### Preferred: native DSH loop + OpenRouter DeepSeek V4 Flash

Use DSH's normal provider-neutral LLM seam. Do not build a custom Codex-parent bridge unless the simpler route proves inadequate.

The parent is responsible only for orchestration:
- read the frozen phase objective and acceptance contract;
- inspect repository state through read-only tools where needed;
- delegate one bounded implementation task;
- request host-observed tests;
- request one independent review;
- route exactly one severe repair when allowed;
- stop at the terminal state.

The parent must not receive direct repository write/edit authority. Generic shell/network capability should not be exposed merely because DSH can expose it.

### Why this is now preferred

This uses an upstream-supported DSH LLM adapter instead of creating the most fragile part of the previous QntyLab experiment: a custom/native parent integration. OpenRouter V4 Flash supports tool calling, and the exact model can be pinned. The parent is cheap enough that we do not need to contort the architecture around zero parent spend.

The thesis principle we keep is **role separation and external enforcement**, not “every model must be subscription-authenticated.”

## Child strategy

### Codex implementer

Use upstream `@deepseek-ai/dsh-subagent-codex` first.

Required behavior:
- explicit implementer `CODEX_HOME`;
- native subscription login pre-exists;
- no `OPENAI_API_KEY` overlay;
- no `OPENROUTER_API_KEY` overlay;
- exact parent Session worktree cwd;
- one fresh child turn;
- bounded workspace-write policy;
- no merge, branch-authority, unrelated-repo, secret-discovery, or broad network authority.

### Claude reviewer

Use upstream `@deepseek-ai/dsh-subagent-claude-code` first if subscription-auth policy qualification passes.

Required behavior:
- independent reviewer account/session state;
- no `ANTHROPIC_API_KEY` overlay;
- no `OPENROUTER_API_KEY` overlay;
- read-only repository surface;
- no Bash/write/edit/agent-spawn/MCP mutation surface;
- receives candidate diff/artifact + acceptance contract, not the implementer's hidden reasoning;
- cannot repair findings.

If current Anthropic account/product policy does not support DSH-mediated subscription use safely, the Claude-via-DSH leg is `NOT_QUALIFIED`; do not silently add an Anthropic API key. A manual native Claude Code review may be evaluated separately, but it is not the same treatment.

## DSH qualification ladder

DSH qualification is development-tool research. It is not a Smokestack product-science stage.

### DSH-Q0 — Cold install / runtime closure

Use a disposable directory and clean DSH home.

Prove:
- exact DSH release/source identity;
- exact package lock;
- cold install from one documented command;
- no source checkout patching;
- no ambient scratch DSH_HOME dependency;
- profile composition is deterministic;
- only expected files are written under qualification-owned state roots;
- process tree quiesces after a no-model probe.

KILL DSH baseline if a clean install requires hand-edited node_modules, source patches, implicit global packages, or an undocumented host DSH_HOME.

### DSH-Q1 — Parent route + native child identity qualification

Use qualification fixtures only.

Parent:
- `OPENROUTER_API_KEY` exists only at the configured parent route boundary;
- exact provider route and model id are recorded;
- exact dated model `deepseek/deepseek-v4-flash-0731` resolves;
- provider retries are zero;
- the secret value never appears in logs/receipts/child environments.

Codex:
- explicit `CODEX_HOME`;
- native account session already authenticated;
- package/native executable identities recorded separately;
- zero `OPENAI_API_KEY` requirement.

Claude:
- native CLI/SDK startup compatibility;
- subscription-auth state identified without credential reads;
- zero `ANTHROPIC_API_KEY` requirement;
- current policy/billing path acceptable for intended local development use.

KILL the proposed route if credentials leak across roles, exact model identity cannot be bound, or either native child cannot be deterministically selected.

### DSH-Q2 — Parent tool-loop qualification

Disposable fixture only; no Smokestack mutation.

Prove with a tiny harmless tool surface:
- real OpenRouter DeepSeek parent request succeeds;
- tool schema reaches the model;
- at least one expected tool call is emitted and parsed structurally;
- tool name/arguments/result are machine-observable;
- malformed or unknown tool requests fail closed;
- parent request ceiling is external to the prompt;
- zero automatic provider retries;
- timeout/cancellation quiesces the episode;
- no repository mutation occurs.

KILL this parent route if tool dispatch is unreliable, tool semantics are silently altered, usage cannot be bounded, or termination cannot be mechanically classified.

### DSH-Q3 — One implementer

Fixture topology:

```text
DeepSeek V4 Flash Parent -> governed subagent tool -> DSH Codex Worker
```

Prove:
- exactly one worker call;
- worker can change only fixture worktree;
- parent has no direct write route;
- tests are run/observed by controller/host rather than trusted from worker prose;
- changed paths/diff/test exit are recorded;
- no second worker call can be obtained by prompt tricks;
- parent key never reaches the worker environment.

KILL DSH write path if scope containment, credential isolation, or call ceiling is bypassable.

### DSH-Q4 — Independent reviewer

Add Claude reviewer.

Prove with negative controls:
- reviewer cannot write/edit/Bash;
- seeded request to repair is denied/fails;
- exactly one review call;
- reviewer sees acceptance contract + artifact, not implementer chain-of-thought;
- parent and implementer credentials do not reach reviewer;
- seeded Critical/High defects are detectable often enough to justify the role in later comparative evaluation.

KILL reviewer treatment if it is not mechanically read-only or is merely generic review theater.

### DSH-Q5 — One bounded severe repair

State machine:

```text
IMPLEMENT -> TEST -> REVIEW
                  |
            Critical/High?
             /          \
           no            yes
           |              |
         CLOSE         REPAIR(1)
                          |
                        RETEST
                          |
                      REREVIEW(1)
                          |
                         CLOSE
```

Prove:
- Medium/Low cannot trigger normal repair loop;
- second repair/rereview is rejected mechanically;
- failed/ambiguous child process cannot be treated as success;
- parent cannot extend its own request budget;
- final state is deterministic and finite.

### DSH-Q6 — Comparative utility

Before making DSH the default Smokestack build path, compare on unseen disposable engineering tasks:

A. Codex alone;
B. Codex + prompt-only/manual review workflow;
C. DSH DeepSeek V4 Flash parent -> Codex implementer -> Claude reviewer.

Measure at minimum:
- task/hidden-test success;
- escaped Critical/High defects;
- regression rate;
- protocol violations;
- unauthorized writes;
- wall-clock time;
- parent token usage/cost;
- child calls/repair frequency;
- unnecessary diff size.

`DSH_BUILD_CONTROL_QUALIFIED` requires a meaningful reliability/quality advantage or a sufficiently valuable governance advantage to justify the orchestration tax.

If it does not, do not make DSH mandatory for Smokestack development.

## Lessons carried from QntyLab

### Keep

- exact DSH/source identity;
- exact parent provider/model identity;
- provider/package/native executable identities as separate facts;
- zero-model/native compatibility probes before child work;
- hard request/call ceilings outside prompts;
- parent secret isolation from children;
- reviewer read-only enforcement;
- external observation of test exit state;
- safe diagnostics and credential redaction;
- process-tree ownership/quiescence;
- finite repair protocol;
- fail closed on ambiguous side-effect state.

### Explicitly do not carry into V0

- OpenAI API-funded parent specifically;
- custom/native Codex parent bridge;
- two separate Codex identities just to make the parent keyless;
- remote Git episode claim refs;
- remote create-only claim transport;
- `BLOCK_NEVER_REPLAY` network-claim machinery;
- production DSH_HOME source materializer;
- patches against an old DSH source tree;
- source-built DSH monorepo as a Smokestack prerequisite;
- package-version == native-CLI-version assumptions;
- child provider reimplementation when current upstream already ships the product bundle.

## Episode state / receipt

Initial V0 development episodes are local and create-only.

Minimum receipt:

```json
{
  "episode_id": "...",
  "protocol_version": "...",
  "dsh_identity": {},
  "parent_identity": {
    "provider": "smokestack-openrouter",
    "model": "deepseek/deepseek-v4-flash-0731"
  },
  "implementer_identity": {},
  "reviewer_identity": {},
  "workspace_identity": {},
  "call_counts": {},
  "parent_usage": {},
  "changed_paths": [],
  "tests": { "observed_exit_code": 0 },
  "review": { "critical": 0, "high": 0 },
  "policy_violations": 0,
  "unauthorized_writes": 0,
  "terminal_state": "PASS"
}
```

The controller/harness generates the receipt from observed events. Agents do not author their own success receipt.

Do not persist:
- OpenRouter key values;
- OAuth tokens;
- API keys;
- credential helper output;
- complete environment dumps;
- complete agent home/config contents;
- raw hidden reasoning.

## Post-qualification Smokestack PR protocol

After `DSH_BUILD_CONTROL_QUALIFIED` only:

```text
DEEPSEEK V4 FLASH PARENT
  plan from active phase contract
       |
       v
CODEX IMPLEMENTER
  smallest safe diff
       |
       v
HOST TEST
       |
       v
CLAUDE HOSTILE REVIEW
       |
       +-- no C/H ------------------> CLOSURE
       |
       +-- C/H -> one repair -> retest -> one rereview -> CLOSURE
```

The active Smokestack phase contract always wins over agent suggestions. DSH cannot authorize a downstream product stage merely because the parent proposes it.
