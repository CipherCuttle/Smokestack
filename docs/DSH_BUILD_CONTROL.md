# DSH Build Control

## Purpose

DeepSeek Harness (DSH) is an optional development control plane for building Smokestack. It is **not** part of the Smokestack application runtime and has no scientific authority over Smokestack's market hypotheses.

The intended development protocol is:

```text
PLAN
  |
  v
CODEX ORCHESTRATOR (subscription identity B, read-only)
  |
  v
DSH GOVERNED DELEGATION
  |
  +--> CODEX IMPLEMENTER (subscription identity A, bounded worktree write)
  |          |
  |          v
  |     HOST-OBSERVED TESTS
  |
  +--> CLAUDE REVIEWER (independent, mechanically read-only)
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

- orchestrator planning rounds: <=2;
- implementation calls: <=1 before review;
- hostile reviews: <=1;
- repair calls: <=1 and only for Critical/High;
- targeted rereviews: <=1 and only after Critical/High repair;
- whole-episode automatic retries: 0.

Medium/Low findings do not create repair loops unless they invalidate the phase objective/evidence, violate a frozen invariant, or create a fail-closed/security risk.

## What "no API keys" means

The target build-control configuration MUST NOT require:

- `OPENAI_API_KEY`;
- `ANTHROPIC_API_KEY`;
- a DeepSeek model API key.

Codex identities authenticate through native ChatGPT/Codex account state. Claude Code authenticates through native Claude account state when that use is compatible with the current product/account policy.

Authentication happens outside DSH. The harness/controller must not copy, print, hash, commit, serialize, or inspect credential values.

This does **not** promise that future market-data/social-data sources are keyless. Birdeye, Helius, Kaito, or other data-source credentials are a separate PR-01 source-qualification question.

## Upstream baseline candidate

Qualification begins from an exact upstream identity, never `latest`:

```text
repository: deepseek-ai/deepseek-harness
commit:     b150a551b8d465e31e418e1b2eaf5e79bbb7d28e
release:    0.1.1-rc.2
```

This is only the **candidate baseline** until DSH-Q0 proves a cold, deterministic install. DSH is developer preview; upgrading the pin is an explicit tooling qualification event, not an ambient dependency update.

Current upstream already provides first-class one-shot Codex and Claude Code subagent bundles. Smokestack should use those surfaces before writing any child-provider fork.

## Identity ontology

Never repeat QntyLab's package/native-version conflation.

An agent identity is a tuple, not a product name:

```text
agent_id
role
provider/product
DSH source/release identity
product package identity (if applicable)
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

DSH state and native agent account state are separate.

Conceptual local layout:

```text
<tooling-state>/
  dsh-home/                 # DSH profile/config only
  episodes/
    <episode-id>/
      intent.json
      lock
      receipt.json

<identity-state-outside-repo>/
  codex-orchestrator/       # CODEX_HOME B
  codex-implementer/        # CODEX_HOME A
  claude-reviewer/          # native Claude account/settings state
```

Rules:
- never commit product auth state;
- never require an ambient scratch DSH_HOME;
- do not share `CODEX_HOME` between orchestrator and implementer;
- do not infer identity from PATH alone;
- qualify using explicit home/workspace inputs;
- agent home contents are not hashed wholesale because they can contain secrets/private state.

## Parent strategy

### Preferred: structured native Codex parent

Use the official Codex app-server protocol, not terminal scraping.

The parent controller should:

1. spawn the exact qualified Codex wrapper/executable with orchestrator `CODEX_HOME`;
2. perform the app-server `initialize` / `initialized` handshake;
3. start an ephemeral read-only thread;
4. register a tiny set of dynamic orchestration tools;
5. submit the frozen phase objective/acceptance contract;
6. observe every dynamic tool request and dispatch only legal state-machine transitions;
7. stop at the terminal state and emit a harness/controller receipt.

Initial dynamic tools should be semantic, not generic shell escape hatches:

```text
delegate_implementation
run_required_tests
request_hostile_review
delegate_severe_repair
run_targeted_rereview
close_phase
```

The parent must not receive a generic repository write/edit tool from the control layer. Its native sandbox is read-only and network-denied except what the authenticated model product itself requires.

### Why this is preferable to a DSH API parent

Current DSH has a provider-neutral LLM seam but no first-class native-Codex parent adapter in the inspected release. Using `llm-pi-ai`/OpenAI API for the parent would reintroduce an API key and defeat the subscription-native objective.

### Fallback

If structured native parent qualification fails, do **not** implement terminal scraping or relax write authority.

Fallback choices:
- use Codex manually/external to the controller for planning while keeping DSH children bounded; or
- build Smokestack with the ordinary single-agent/manual PR protocol.

The stronger `DSH_NATIVE_CODEX_PARENT` claim dies if Q2 fails.

## Child strategy

### Codex implementer

Use upstream `@deepseek-ai/dsh-subagent-codex` first.

Required behavior:
- explicit implementer `CODEX_HOME`;
- native subscription login pre-exists;
- no `OPENAI_API_KEY` overlay;
- exact parent Session worktree cwd;
- one fresh child turn;
- bounded workspace-write policy;
- no merge, branch-authority, unrelated-repo, secret-discovery, or broad network authority.

### Claude reviewer

Use upstream `@deepseek-ai/dsh-subagent-claude-code` first if subscription-auth policy qualification passes.

Required behavior:
- independent reviewer account/session state;
- no `ANTHROPIC_API_KEY` overlay;
- read-only repository surface;
- no Bash/write/edit/agent-spawn/MCP mutation surface;
- receives candidate diff/artifact + acceptance contract, not the implementer's hidden reasoning;
- cannot repair findings.

If current Anthropic account/product policy does not support DSH-mediated subscription use safely, the Claude-via-DSH leg is `NOT_QUALIFIED`; do not silently add an API key. A manual native Claude Code review may be evaluated separately, but it is not the same treatment.

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
- only expected files are written under the qualification-owned state roots;
- process tree quiesces after a no-model probe.

KILL DSH baseline if a clean install requires hand-edited node_modules, source patches, implicit global packages, or an undocumented host DSH_HOME.

### DSH-Q1 — Subscription identity isolation / zero-model probes

No model-backed task yet.

Codex A and B:
- distinct `CODEX_HOME`;
- both native account sessions already authenticated;
- both can launch concurrently;
- app-server initialize/thread-start compatibility proven without a task/model turn where possible;
- identity fingerprints do not collide;
- zero API-key environment requirement.

Claude:
- native CLI/SDK startup compatibility;
- subscription-auth state identified without credential reads;
- no `ANTHROPIC_API_KEY` present;
- current policy/billing path is acceptable for the intended local development use.

KILL multi-identity subscription routing if homes collide, authentication state leaks, or either required actor cannot be deterministically selected.

### DSH-Q2 — Native Codex parent spike

Disposable fixture only.

Prove:
- structured app-server JSON-RPC, never terminal scraping;
- parent is read-only;
- dynamic tool schemas arrive intact;
- a dynamic tool request is observed and can be answered by the controller;
- tool name/arguments/result are machine-observable;
- parent call/turn ceiling is external to the model prompt;
- timeout/cancellation quiesces process tree;
- every parent action receives an episode/turn identity;
- no repository mutation occurs.

KILL native-parent path if tool dispatch is not structured/reliable, direct writes escape the sandbox, identity cannot be bound, or termination cannot be mechanically classified.

### DSH-Q3 — One implementer

Fixture topology:

```text
Codex Parent -> governed `delegate_implementation` -> DSH Codex Worker
```

Prove:
- exactly one worker call;
- worker can change only fixture worktree;
- orchestrator remains byte-for-byte unable to write;
- tests are run/observed by controller/host rather than trusted from worker prose;
- changed paths/diff/test exit are recorded;
- no second worker call can be obtained by prompt tricks.

KILL DSH write path if scope containment or call ceiling is bypassable.

### DSH-Q4 — Independent reviewer

Add Claude reviewer.

Prove with negative controls:
- reviewer cannot write/edit/Bash;
- seeded request to repair is denied/fails;
- exactly one review call;
- reviewer sees acceptance contract + artifact, not implementer chain-of-thought;
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
- second repair/re-review is rejected mechanically;
- failed/ambiguous child process cannot be treated as success;
- final state is deterministic and finite.

### DSH-Q6 — Comparative utility

Before making DSH the default Smokestack build path, compare on unseen disposable engineering tasks:

A. Codex alone;
B. Codex + prompt-only/manual review workflow;
C. DSH-enforced Codex orchestrator -> Codex implementer -> Claude reviewer.

Measure at minimum:
- task/hidden-test success;
- escaped Critical/High defects;
- regression rate;
- protocol violations;
- unauthorized writes;
- wall-clock time;
- agent calls/repair frequency;
- unnecessary diff size;
- subscription usage where observable.

`DSH_BUILD_CONTROL_QUALIFIED` requires a meaningful reliability/quality advantage or a sufficiently valuable governance advantage to justify the orchestration tax.

If it does not, do not make DSH mandatory for Smokestack development.

## Lessons carried from QntyLab

### Keep

- exact DSH/source identity;
- provider/native executable identities as separate facts;
- zero-model compatibility probes before paid/model-backed work;
- hard call ceilings outside prompts;
- reviewer read-only enforcement;
- external observation of test exit state;
- safe diagnostics and credential redaction;
- process-tree ownership/quiescence;
- finite repair protocol;
- fail closed on ambiguous side-effect state.

### Explicitly do not carry into V0

- OpenAI API-funded DSH parent;
- real-provider secret gate;
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
  "parent_identity": {},
  "implementer_identity": {},
  "reviewer_identity": {},
  "workspace_identity": {},
  "call_counts": {},
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
- OAuth tokens;
- API keys;
- credential helper output;
- complete environment dumps;
- complete agent home/config contents;
- raw hidden reasoning.

## Post-qualification Smokestack PR protocol

After `DSH_BUILD_CONTROL_QUALIFIED` only:

```text
ORCHESTRATOR
  plan from active phase contract
       |
       v
IMPLEMENTER
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

The active Smokestack phase contract always wins over agent suggestions. DSH cannot authorize a downstream product stage merely because an agent proposes it.
