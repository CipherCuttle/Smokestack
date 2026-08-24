# Long Sprint Controller V0

Status: PR-00B HOST-CONTROL REPAIR CANDIDATE — TARGETED REREVIEW PENDING

## Goal

Provide one-command, low-attention Smokestack development sprints without transferring authority to a model.

The host controller owns task state, authority, tests, Git/HEAD scope, actual child-call ceilings, receipts, retries, terminal decisions, and escalation. Models research, implement, and review only inside host-issued capabilities.

## Live topology

```text
USER — one command
  |
  v
HOST SPRINT SUPERVISOR
  +--> deterministic task DAG / READY frontier
  +--> host tests + Git/HEAD scope + checkpoint commits
  +--> parent request ceilings + per-phase trusted child-tool transcript
  +--> tracked/untracked + ignored-state boundary checks
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

FAST: `IMPLEMENT -> HOST VERIFY -> HOST COMMIT -> CLOSE`

REVIEWED: `IMPLEMENT -> HOST VERIFY -> TEN_STACK REVIEW -> [C/H only] REPAIR(1) -> RETEST -> REREVIEW(1) -> HOST COMMIT/CLOSE or BLOCK`

GOVERNED adds a separate MCP research episode before implementation when the task contract requires evidence.

A model may not downgrade mode, expand write authority, weaken acceptance, extend a budget, commit its own success, or advance the DAG.

## Research / MCP boundary

The exact pinned `@deepseek-ai/dsh-mcp-client@0.1.1-rc.2` is mounted only for RESEARCH.

V0 research exposes the logical contract:

- `search_literature(query)`
- `verify_source(id)`

Research does not pass from parent prose alone. A trusted guard plugin emits per-phase JSONL tool events to a dedicated extra pipe captured by the host; the mutable filesystem and DSH stdout/stderr are not authority channels. The host transcript must prove at least one successful `search_literature` call, at least two successful `verify_source` calls for distinct canonical source identities, and that every source identity claimed in `EVIDENCE_JSON.sources` is among those verified identities. A missing, malformed, denied, incomplete, duplicate, reordered, or erroring required tool call fails closed.

The MCP client's `failOnStartupError: true` activation completes connection/discovery before the tools are registered. Therefore a successful host-observed MCP tool call also requires the pinned client to have completed its initialize/discovery/list path; the qualification receipt treats that as a mechanically required predecessor, while the per-phase trusted transcript directly attests the search/verify calls themselves.

Codex implementation and Claude review do not inherit the MCP surface.

The PR-00B qualification server is a deterministic local MCP fixture. Its `fixture://` sources prove MCP transport, source verification mechanics, role isolation, and autonomous continuation; they are explicitly not real scientific literature. A later real literature MCP may substitute Crossref/OpenAlex/Semantic Scholar/arXiv-style read-only sources only if it preserves stable source identity and this narrow contract.

## Request and child-call ceilings

Per GOVERNED task:

- RESEARCH episode: DeepSeek parent <= 8 requests;
- LIFECYCLE episode: DeepSeek parent <= 8 requests total across implementation, review, optional repair, and optional rereview;
- provider retries: 0;
- implementation: exactly one successful Codex delegation when the phase executes;
- review: exactly one successful Claude delegation when the phase executes;
- repair: exactly one successful Codex delegation and only after `CRITICAL_HIGH_FOUND`;
- rereview: exactly one successful Claude delegation and only after repair;
- whole-task replay: 0.

The child-call limits are not prompt conventions. Each phase mounts a local Smokestack guard on DSH's monotonic tool-guard seam. A second Codex/Claude delegation in the same phase is denied before dispatch and emitted to the host-owned trusted transcript. Phase success additionally requires the host to parse that captured stream and prove exactly the expected successful child call with no denied, incomplete, or erroring duplicate.

Research cannot borrow lifecycle budget and the parent cannot enlarge either ceiling.

## Git / checkpoint authority

V0 allows one writer at a time. Every task begins from a clean Git-visible state, and the host re-checks that boundary before selecting the next READY node. The task also captures the exact checkpoint `HEAD`; that identity remains host-owned until the host creates the task checkpoint.

`authority.write` is a host contract, not a Git pathspec. Each entry must be either an exact repo-relative path such as `src/foo.ts` or one recursive directory authority ending in `/**`, such as `experiments/qualification/**`. Other wildcard syntax is invalid and fails closed before model execution.

A non-host commit is an authority violation even when `git status` is clean. Before a PASS checkpoint, the host requires current `HEAD` to equal the task's captured checkpoint HEAD. On a non-PASS path, HEAD drift also hard-stops and the controller does not rewrite or hide that commit.

After a task reaches PASS the host confirms only `authority.write` paths changed, stages only the exact observed changed paths, and re-checks the staged set against the same authority matcher. The host then creates `sprint: <task-id>` with `core.hooksPath=/dev/null`, so repository or configured Git hooks cannot mutate the checkpoint after scope validation. After commit, the host proves:

- the new commit's sole parent is the captured checkpoint HEAD;
- the exact committed path set equals the exact pre-commit staged path set;
- the Git-visible worktree is clean.

Only then may the DAG advance. A model never creates the success checkpoint.

After a task reaches a non-PASS terminal state, the host reconciles against the checkpoint HEAD captured before that task. If and only if HEAD is unchanged and every dirty path is authorized, the host may restore the task's tracked/staged paths to that checkpoint and remove only exact authorized untracked paths, then prove the worktree clean before another independent READY node runs. If HEAD changed or any dirty path is unauthorized, the host cleans nothing, records the observed state, hard-stops the controller, and leaves the mutations inspectable. Global reset/clean is not part of this path.

## Ignored workspace boundary

Git-ignored files are outside normal porcelain scope but can still affect tests or later tasks. V0 therefore treats pre-existing ignored workspace state as immutable during a sprint.

At sprint/task boundaries the host enumerates ignored entries with Git and records filesystem identity/change metadata (device/inode/mode/size/mtime/ctime plus symlink target where applicable). It also binds effective Git configuration and file-valued `core.attributesFile`/`core.excludesFile` references, including references from non-local config scopes. The controller compares those snapshots after research/lifecycle work and at final closure. Creating, deleting, replacing, or modifying an ignored entry or effective metadata reference hard-stops with `IGNORED_WORKTREE_MUTATION` or Git metadata attestation failure; ignored state is never silently rolled back into an apparent clean checkpoint.

This is a contamination detector, not an authorization mechanism for ignored outputs. Tasks that intentionally need generated state must use a tracked or ordinary untracked path represented by their frozen `authority.write` contract instead of relying on ignored side effects.

## Human escalation

The controller does not autonomously authorize frozen scientific-semantic changes, weakened acceptance, new credential domains, spend/time expansion, publication, protected-branch merge, destructive non-disposable operations, or unresolved canonical source conflicts. Independent READY work may continue until the executable frontier is exhausted, but only across clean checkpoint boundaries.

## PR-00B live qualification

The disposable live sprint has four dependent tasks:

1. FAST deterministic normalization;
2. REVIEWED first-wins dedupe;
3. GOVERNED point-in-time filter with separate MCP research;
4. REVIEWED integration summary depending on tasks 2 and 3.

PASS requires zero human intervention, all four tasks PASS, mechanically admitted MCP discovery plus host-attested search/source verification, read-only research, host tests, exact child-call ceilings, unambiguous TEN_STACK gates, zero unauthorized Git/HEAD writes, unchanged ignored workspace state, bounded repair/rereview if triggered, four hook-disabled host checkpoint commits with exact path attestation, a clean final worktree, and a machine-readable final receipt.

GitHub Actions runs zero-model syntax/control tests, including authority matching, child-call guard/transcript enforcement, MCP evidence binding, ignored-state contamination detection, HEAD drift rejection, malicious pre-commit-hook suppression, exact checkpoint attestation, and non-PASS cleanup followed by a different task. Native Codex/Claude subscription authentication and OpenRouter model spend are exercised only by the local live qualification.

The live four-task qualification remains blocked until the repaired host-control candidate survives the one allowed targeted independent rereview with no remaining Critical/High finding.

Run the live qualification only after that gate and after reconciling the operator's local worktree to the reviewed candidate; do not blindly discard local WIP.

The runner installs the exact pinned DSH MCP client into the isolated headless profile if it is absent.
