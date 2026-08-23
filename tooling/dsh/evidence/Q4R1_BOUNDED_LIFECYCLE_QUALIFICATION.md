# DSH Q4R1 Bounded Lifecycle Qualification

Status: CLOSED_PASS

## Purpose

Qualify the Smokestack development control plane:

DeepSeek parent
→ bounded Codex implementer
→ host-observed test gate
→ independent mechanically read-only Claude reviewer
→ repair only for Critical/High
→ at most one rereview after such a repair
→ stop.

This receipt covers qualification only. DSH is development tooling and is
not a Smokestack runtime dependency.

## Frozen product topology

Parent:
- OpenRouter
- `deepseek/deepseek-v4-flash-0731`
- provider retries: 0

Implementer:
- DSH Codex subagent bundle `0.1.1-rc.2`
- package-local Codex `0.147.0`
- native ChatGPT authentication
- `permissionMode: approve-for-me`
- workspace-write sandbox
- isolated Smokestack `CODEX_HOME`

Reviewer:
- DSH Claude Code subagent bundle `0.1.1-rc.2`
- native Claude authentication
- `permissionMode: plan`
- mechanically read-only for the qualification

Harness:
- `@deepseek-ai/dsh` `0.1.1-rc.2`

## Predecessor qualification

Q1 — DeepSeek parent route: PASS

Q2 — Codex primitive delegation:
- native package-local execution: PASS
- workspace write: PASS
- exact expected bytes: PASS
- scope containment: PASS
- process quiescence: PASS

Q3 — Claude reviewer primitive:
- independent defect detection: PASS
- attempted write denied / no write observed: PASS
- candidate immutability: PASS
- native package-local execution: PASS
- process quiescence: PASS

## Q4 attempt 1 — preserved failed lineage

Result: CLOSED_INFRA_FAILURE

The first lifecycle implementation attempt inherited the user's ordinary
native Codex configuration.

Observed startup noise included unrelated native MCP configuration for
services such as Linear, Sentry, Cloudflare and Supabase, plus a stale
native model-cache schema error.

The episode was interrupted and closed.

Host reconciliation proved:

- candidate writes: none
- authoritative README mutation: none
- test mutation: none
- implementation remained the original TODO
- host tests remained at the expected failing baseline
- no DSH/Codex child process remained

No candidate from Q4 attempt 1 was promoted.

## Infrastructure repair

A dedicated Smokestack Codex home was created outside the repository.

Properties:

- native `auth.json` copied with mode 0600
- native ChatGPT login verified
- ordinary user `config.toml` not copied
- MCP configuration not copied
- stale model cache not copied
- DSH Codex provider explicitly receives the isolated `CODEX_HOME`
- ordinary user Codex configuration remains untouched

This was an infrastructure-only repair.

## Q4R1 baseline

A fresh disposable Git fixture was created.

The baseline implementation intentionally threw `Error("TODO")`.

Host baseline result:

- tests: 0/5 pass
- expected baseline exit: nonzero

The IMPLEMENT phase composition was verified before model execution:

- isolated Codex home bound
- Codex implementer enabled
- Claude reviewer mechanically unavailable
- config stderr empty

## Q4R1 IMPLEMENT

Exactly one Codex implementation delegation was authorized.

Parent terminal result:

`DSH_IMPLEMENT_OK`

Parent exit:

`0`

Host-observed result:

- tests: 5/5 PASS
- README unchanged: PASS
- test file unchanged: PASS
- only `tag.js` changed: PASS
- no DSH/Codex child remained after completion: PASS

Frozen candidate SHA-256:

`3f6094b6dfa94c8fdfff112be43389af258be8644f21f37ac6740f595478291a`

Frozen candidate diff SHA-256:

`20d461e98378799eb7e369269df73cbf9f057e1d466771cced912bbcb76e0964`

## Q4R1 REVIEW

The candidate was frozen before review.

The REVIEW phase composition was verified before model execution:

- Codex implementer mechanically unavailable
- Claude reviewer enabled
- Claude `permissionMode: plan`
- config stderr empty

Exactly one independent Claude review was authorized.

Parent exit:

`0`

Reviewer gate:

`REVIEW_GATE: NO_CRITICAL_HIGH`

Reviewer findings:

- MEDIUM — fixture test suite did not directly cover contract clause 7
- LOW — initial `trim()` is redundant but harmless
- LOW — non-string behavior is outside the declared input precondition

No Critical or High finding was returned.

Important epistemic distinction:

The reviewer reported additional fuzzing, mutation checks and invariant
checks. Those are reviewer-reported evidence, not independently
host-observed evidence in this receipt. Closure does not depend on those
claims.

## Post-review host reconciliation

Host verification after Claude returned:

- candidate SHA-256 unchanged: PASS
- frozen diff unchanged: PASS
- README unchanged: PASS
- test file unchanged: PASS
- only `tag.js` differs from baseline: PASS
- post-review tests: 5/5 PASS
- unexpected files: none
- DSH/Claude child process remaining: none

Only pre-existing VS Code Codex processes remained.

## Bounded completion decision

Frozen policy:

IMPLEMENT
→ TEST
→ ONE independent hostile review
→ repair Critical/High only
→ ONE rereview only if Critical/High repair occurred
→ STOP.

Because the independent review returned no Critical or High finding:

- repair was NOT AUTHORIZED
- rereview was NOT AUTHORIZED
- Medium/Low findings did not restart the phase

## Verdict

`DSH_Q4R1_BOUNDED_LIFECYCLE_QUALIFICATION_PASS`

The qualified development-control topology is:

DeepSeek parent
→ Codex implementer
→ host test gate
→ Claude read-only hostile review
→ optional single Critical/High repair
→ optional single rereview
→ hard stop.

This result qualifies the topology for bounded Smokestack development work.
It does not establish that DSH improves development quality or efficiency
relative to simpler workflows; comparative utility is a separate question.
