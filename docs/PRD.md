# Product Requirements Document — Smokestack v0

## Problem

Crypto discovery tools commonly expose token trend, wallet, social, and launch information as separate feeds. The user is forced to infer whether multiple weak observations represent a genuinely forming cluster or merely a late, obvious, or manufactured narrative.

Smokestack tests whether a narrower product can work: detect structural onchain formation first, independently qualify current public attention, and preserve point-in-time evidence before outcomes are known.

## Primary user

A technically literate crypto operator/researcher who wants a small number of inspectable anomalies rather than another ranked feed.

## Job to be done

“When several new assets begin sharing unusual independent structure, tell me why the cluster is worth inspecting and whether public attention appears genuinely low — without pretending that this is automatically a buy signal.”

## V0 success definition

V0 succeeds only if all are true:

1. source coverage/freshness qualifies;
2. Formation construction survives contamination controls;
3. public-attention instrumentation qualifies;
4. a preregistered prospective cohort shows a useful incremental relation versus controls;
5. a consecutive operator utility test shows the alerts are worth opening.

## V0 output

Before PR-10 the output is CLI/research artifacts only. A future Tripwire detail should eventually expose:

- Formation ID and frozen detection time;
- member list and independent deployer count;
- qualifying actor overlap after exclusions;
- structural facts and reason codes;
- public attention state and source-health state;
- Blackline explanation;
- immutable evidence/decision receipt;
- later checkpoints stored separately from the original decision.

## Explicit non-goals

V0 does not rank gems, execute trades, recommend buys/sells, score wallet intelligence, assign model confidence, infer human identities, use LLMs in decision making, or optimize investment returns.

## Future product roles

Only after validated Formations exist:

- `ORIGIN`: earliest surviving member under frozen role rules;
- `TORCH`: comparatively mature representative;
- `EMBER`: strongly connected but comparatively immature member;
- `CLONE`: weak structural support despite narrative relation;
- `TRAP`: adverse structural evidence.

Roles are derived separately from Formation membership.

## User trust requirements

- show reason codes, not opaque scores;
- distinguish THIN from UNAVAILABLE;
- preserve false alarms in Ash;
- preserve exact detection timestamp and source state;
- show when a role is experimental;
- never market a retrospective replay as prospective evidence.
