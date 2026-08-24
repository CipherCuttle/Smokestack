# Long Sprint Controller V0

Status: PR-00B LIVE QUALIFICATION CANDIDATE

## Goal

Provide one-command, low-attention Smokestack development sprints without transferring authority to a model.

The host controller owns task state, authority, tests, Git scope, budgets, receipts, retries, terminal decisions, and escalation. Models research, implement, and review only inside host-issued capabilities.

## Live topology

```text
USER — one command
  |
  v
HOST SPRINT SUPERVISOR
  +--> deterministic task DAG / READY frontier
  +--> host tests + Git scope + checkpoint commits
  +--> request ceilings + receipts
  |
  +--> RESEARCH episode
  |      DeepSeek parent read-only
  |      narrow literature MCP only
  |      Codex disabled; Claude disabled
  |
  +--> LIFECYCLE episode
         DeepSeek parent read-only
         Codex write only during IMPLEMENT/REPAIR
         Claude read-only only during REVIEW/REREVIEW
```

The sprint is long-lived; model episodes are bounded and replaceable.

## Modes

FAST:

`IMPLEMENT -> HOST VERIFY -> HOST COMMIT -> CLOSE`

REVIEWED:

`IMPLEMENT -> HOST VERIFY -> TEN_STACK REVIEW -> [C/H only] REPAIR(1) -> RETEST -> REREVIEW(1) -> HOST COMMIT/CLOSE or BLOCK`

GOVERNED adds a separate MCP research episode before implementation when the task contract requires evidence.

A model may not downgrade mode, expand write authority, weaken acceptance, extend a budget, commit its own success, or advance the DAG.

## Research / MCP boundary

The exact pinned `@deepseek-ai/dsh-mcp-client@0.1.1-rc.2` is mounted only for RESEARCH.

V0 research exposes the logical contract:

- `search_literature(query)`
- `verify_source(id)`

Research fails closed unless at least two source identities are verified and a machine-parseable evidence receipt is returned. Codex implementation and Claude review do not inherit the MCP surface.

The PR-00B qualification server is a deterministic local MCP fixture. Its `fixture://` sources prove MCP transport, source verification mechanics, role isolation, and autonomous continuation; they are explicitly not real scientific literature. A later real literature MCP may substitute Crossref/OpenAlex/Semantic Scholar/arXiv-style read-only sources only if it preserves stable source identity and this narrow contract.

## Request ceilings

Per GOVERNED task:

- RESEARCH episode: DeepSeek parent <= 8 requests;
- LIFECYCLE episode: DeepSeek parent <= 8 requests total across implementation, review, optional repair, and optional rereview;
- provider retries: 0;
- implementation <= 1 before review;
- review <= 1 before repair;
- repair <= 1 and only after `CRITICAL_HIGH_FOUND`;
- rereview <= 1 and only after repair;
- whole-task replay: 0.

Research cannot borrow lifecycle budget and the parent cannot enlarge either ceiling.

## Git / checkpoint authority

V0 allows one writer at a time. A task begins from a clean Git state.

After a task reaches PASS the host:

1. confirms only `authority.write` paths changed;
2. stages only those paths;
3. re-checks staged paths;
4. creates `sprint: <task-id>` checkpoint commit;
5. advances the DAG.

A model never creates the success checkpoint. Unauthorized writes are fail-closed.

## Human escalation

The controller does not autonomously authorize frozen scientific-semantic changes, weakened acceptance, new credential domains, spend/time expansion, publication, protected-branch merge, destructive non-disposable operations, or unresolved canonical source conflicts. Independent READY work may continue until the executable frontier is exhausted.

## PR-00B live qualification

The disposable live sprint has four dependent tasks:

1. FAST deterministic normalization;
2. REVIEWED first-wins dedupe;
3. GOVERNED point-in-time filter with separate MCP research;
4. REVIEWED integration summary depending on tasks 2 and 3.

PASS requires zero human intervention, all four tasks PASS, actual MCP initialize/list/call compatibility, read-only research, host tests, unambiguous TEN_STACK gates, zero unauthorized writes, bounded repair/rereview if triggered, four host checkpoint commits, a clean final worktree, and a deterministic final receipt.

GitHub Actions runs only zero-model syntax/control tests. Native Codex/Claude subscription authentication and OpenRouter model spend are exercised only by the local live qualification.

Run:

```bash
cd ~/DevHub/repos/Smokestack \
&& git pull --ff-only \
&& source "$HOME/.nvm/nvm.sh" \
&& nvm use 24.19.0 \
&& node tooling/sprint/qualification/qualification.mjs
```

The runner installs the exact pinned DSH MCP client into the isolated headless profile if it is absent.
