# PR-01 Source Qualification Bootstrap V0

## Phase identity

- Phase: `PR01_SOURCE_QUALIFICATION_BOOTSTRAP_V0`
- State: `AUTHORIZED_NOT_EXECUTED`
- Predecessor authority: `ae94dafbe9fb62b87cb19a1b11b28e3d15416748`
- Predecessor verdict: `FOUNDATION_PASS`

This document freezes the source-qualification protocol. It authorizes no
source requests or measurements. Qualification work is disposable and must
remain under `experiments/qualification/`; no provider behavior may be
promoted to `src/` in PR-01.

## Scientific objective

Determine whether a source stack can observe the newly active Solana market
universe with sufficient discovery coverage and freshness, represent market
state without undocumented semantic loss, identify first buyers reliably, and
agree with direct-chain truth at the frozen Stage-1 gates. Record provider
semantics, pagination, rate limits, freshness, coverage, schema behavior,
first-buyer chain-truth agreement, and cost. This is source/instrument
qualification, not a Formation, attention, efficacy, or trading evaluation.

## Source roles

Every future candidate source is assigned one or more explicit roles, subject
to the source-role independence gate below:

- `DISCOVERY`: identify assets entering the frozen candidate universe and the
  time/order information needed for eligibility.
- `MARKET_STATE`: provide the market-state fields required to establish
  market-legibility and freshness under the frozen denominator.
- `FIRST_BUYER`: report the first-buyer identity and ordering claim for an
  eligible asset, including explicit unavailable/ambiguous outcomes.
- `DIRECT_CHAIN_AUDIT`: inspect chain truth independently to audit provider
  first-buyer identity and order.

Provider roles are not interchangeable. A fallback or aggregation is a new
source observation with explicit semantics.

## Source-role independence gate

The same candidate source MUST NOT carry both `FIRST_BUYER` and
`DIRECT_CHAIN_AUDIT`. Qualification must bind two explicitly identified,
distinct source identities:

- `FIRST_BUYER_SOURCE_ID`
- `DIRECT_CHAIN_AUDIT_SOURCE_ID`

The qualification packet MUST require
`FIRST_BUYER_SOURCE_ID != DIRECT_CHAIN_AUDIT_SOURCE_ID`. A source identity
includes its controlled source/data path, not merely a display label or role
name.

`DIRECT_CHAIN_AUDIT` truth MUST be independently derived from chain-native
transaction, instruction, and/or account evidence. It MUST NOT derive its
truth from:

- the `FIRST_BUYER` source's interpreted first-buyer endpoint;
- the same provider-derived first-buyer dataset;
- a re-export, cache, or aggregation of that same derived dataset; or
- the `FIRST_BUYER` candidate's claimed ordering.

The preregistration packet MUST identify and establish an independently controlled source/data path for chain truth before measurement. If that independence cannot be established, `AUDIT_RESULT = INVALID_OR_UNAVAILABLE` and it MUST NOT be counted as audited agreement success. A fallback or aggregation is a new explicitly identified source observation; labeling it `DIRECT_CHAIN_AUDIT` does not inherit audit independence.

## Frozen Stage-1 gates

These gates are fixed before measurement and may not be weakened,
reinterpreted, optimized, or moved after measurement:

- successful parse rate >= 99.5%
- schema violations <= 0.5%
- market-legible universe coverage >= 95%
- p95 discovery latency <= 120 seconds
- first-buyer availability >= 95% of eligible assets
- audited first-buyer identity/order >= 99% agreement with direct-chain truth
- zero undocumented semantic shifts during qualification

## `SOLANA_UNIVERSE_CANDIDATE_V0`

`SOLANA_UNIVERSE_CANDIDATE_V0 = DEFERRED` because PR-00 contains no
repository-authoritative universe definition or evidence sufficient to freeze
the actual asset set now. Consequently:

`MEASUREMENT_AUTHORIZED = NO`

The following contract requirements are nevertheless frozen. Before any
measurement, a qualification packet must provide a deterministic, versioned
value for each requirement and bind it to the packet identity:

- **Inclusion semantics:** state exactly which newly active Solana assets enter
  the candidate universe, with observable source fields and boundary rules.
- **Exclusion semantics:** state exactly which assets are excluded and why;
  exclusions must not be inferred from provider absence or silently applied
  after measurement.
- **Eligibility time convention:** use the frozen knowledge-time convention;
  `fetched_at` is the conservative default unless a stricter valid convention
  is explicitly established. Record source event/slot time separately when
  available.
- **Market-legibility definition:** define the observable, deterministic
  market-state conditions that make an asset eligible for the coverage
  denominator. Do not substitute provider labels without recording their
  semantics.
- **Asset identity key:** define the canonical chain/asset identity and bind
  it to the chain context; symbols and names are not identity keys.
- **Duplicate/alias handling:** define deterministic deduplication, alias,
  migration, and collision handling. Ambiguous identity is not silently
  merged or counted twice.
- **Denominator rules:** define the eligible-asset denominator, role-specific
  denominators, exclusions, and treatment of late/duplicate observations
  before metrics are calculated.
- **Unavailable-data rules:** represent outage, unsupported fields, malformed
  responses, and ambiguous identity explicitly as unavailable or invalid
  states; never coerce them to zero, absence, `THIN`, or a successful parse.

No universe value, provider coverage result, or qualification verdict may be
reported while this contract is deferred.

## First-buyer audit preregistration gate

Before ANY provider/source measurement, one immutable preregistration packet
MUST bind concrete deterministic values for all first-buyer and audit
authorization fields below. The packet identity, its content-addressed
digest, and the time of authorization MUST be recorded before any
`FIRST_BUYER` or `DIRECT_CHAIN_AUDIT` result is inspected. This bootstrap
freezes the authorization contract but does not invent the eventual semantic
values, universe, provider candidates, audit sample size, or sample seed.

The current state remains fail-closed:

- `FIRST_BUYER_SEMANTICS_FROZEN = NO`
- `CHAIN_ORDER_CONVENTION_FROZEN = NO`
- `AUDIT_ELIGIBLE_POPULATION_FROZEN = NO`
- `AUDIT_SAMPLING_FRAME_FROZEN = NO`
- `AUDIT_SOURCE_INDEPENDENCE_FROZEN = NO`
- `MEASUREMENT_AUTHORIZED = NO`

### First-buyer definition

The preregistration MUST freeze a mechanically evaluable first-buyer
definition, including the rules necessary to disambiguate:

- qualifying acquisition/transaction semantics;
- successful versus failed transactions;
- wallet/account identity;
- included and excluded transaction/instruction types;
- routing and aggregation behavior;
- duplicate activity;
- self-transfer and other non-acquisition behavior; and
- ambiguous cases and their result state.

No first-buyer semantic value may be selected or changed after measurement
begins.

### Chain order convention

The preregistration MUST freeze a total deterministic ordering convention for
the chain evidence used to decide first-buyer identity and order, including
the chain-order primitives, deterministic tie-breakers, and handling when a
required primitive is absent or ambiguous. If deterministic ordering cannot
be established, the result is `UNAVAILABLE_OR_INVALID`; it MUST NOT be
silently guessed.

### Audit-eligible population

The preregistration MUST freeze the exact population from which audit cases
may be selected. That population MUST derive from the frozen universe and
eligibility rules plus outcome-independent observable criteria. It MUST NOT
be filtered after observing provider success/failure, parse success/failure,
first-buyer claims, chain-truth agreement/disagreement, or later outcomes.
Provider absence MUST NOT remove a case from the frozen population.

### Audit sampling frame

Before observing either `FIRST_BUYER` or `DIRECT_CHAIN_AUDIT` results, the
preregistration MUST freeze:

- the population snapshot and identity;
- the sample-selection algorithm;
- the sample size or a deterministic stopping rule;
- a deterministic seed/hash or equivalent reproducible selector;
- sampling with or without replacement;
- handling of unavailable, failed, or ambiguous selected cases; and
- any permitted replacement rule.

The selected sample, or a deterministic selection commitment, MUST be
content-addressed and digest-bound before result inspection. Difficult,
failed, unavailable, malformed, or ambiguous cases MUST NOT be replaced at
operator discretion. Selected cases remain visible in the audit lineage, and
the denominator treatment frozen below applies to them.

### Denominator preregistration

The preregistration MUST freeze the exact, deterministic treatment of every
selected and eligible case in the availability denominator, the
audit-agreement denominator, and invalid/unavailable accounting before
measurement. No post-observation denominator selection is permitted.

For this bootstrap, the fail-closed denominator invariant is:

- every asset in the frozen audit-eligible population remains in the
  first-buyer availability denominator, including unavailable, malformed,
  ambiguous, provider-failure, and chain-audit-failure states;
- every committed audit sample case remains in the audit-agreement
  denominator; unavailable, malformed, ambiguous, provider-failure,
  chain-audit-failure, and disagreement states are not audited agreement
  success; and
- each unavailable or invalid state is retained in invalid/unavailable
  accounting with its reason and lineage, rather than removed from either
  denominator.

The packet MUST bind the exact status mapping and reporting treatment before
measurement, and MUST preserve these cases even when the mapping yields a
failed gate. The quantitative gates remain unchanged, including first-buyer
availability >= 95% of eligible assets and audited first-buyer
identity/order >= 99% agreement with direct-chain truth.

### Measurement authorization predicate

Source measurement remains unauthorized unless every required preregistration
field is frozen and bound, the provider candidate set and universe candidate
are frozen, and host execution authorization is present:

`MEASUREMENT_AUTHORIZED = SOLANA_UNIVERSE_CANDIDATE_V0_FROZEN AND PROVIDER_CANDIDATE_SET_FROZEN AND FIRST_BUYER_SEMANTICS_FROZEN AND CHAIN_ORDER_CONVENTION_FROZEN AND AUDIT_ELIGIBLE_POPULATION_FROZEN AND AUDIT_SAMPLING_FRAME_FROZEN AND AUDIT_SOURCE_INDEPENDENCE_FROZEN AND HOST_EXECUTION_AUTHORIZATION_PRESENT`

The current value remains `MEASUREMENT_AUTHORIZED = NO`.

## Provider-candidate authority

`PROVIDER_CANDIDATE_SET = NOT_YET_FROZEN`

PR-00 does not canonically justify a provider choice. No provider candidate
may be introduced from model memory or treated as pre-approved. Future
candidates require recorded evidence and explicit role assignment before
execution authorization.

## Future provider evidence contract

For every source role and candidate, the qualification evidence must preserve:

- endpoint/version identity;
- query semantics;
- pagination;
- ordering;
- timestamp semantics;
- retry semantics;
- rate limits;
- freshness;
- denominator;
- schema;
- parsing behavior;
- missing/null/unavailable behavior;
- semantic drift;
- cost.

The packet must distinguish provider claims from Smokestack interpretation and
record every semantic change. A provider first-buyer identity or order cannot
be accepted without a direct-chain truth comparison using a frozen,
outcome-independent audit sample.

## Point-in-time and evidence rules

Qualification classification may use only information available under the
frozen point-in-time rule. No future/outcome-aware information may affect
whether a source or observation qualifies.

Future measurements must preserve enough raw response identity and immutable
digests to recompute every reported metric, including request/query identity,
source/version identity, parser/code identity, parse outcome, applicable
times, denominator, and cost evidence. Raw responses or immutable references
and SHA-256 digests are required where the source contract makes them
available. Corrections append evidence; they do not rewrite prior
observations. This bootstrap does not introduce the permanent PR-02
PostgreSQL ledger.

## Spend and execution boundary

- `LIVE_PROVIDER_EXECUTION_AUTHORIZED = NO`
- `PAID_PROVIDER_SPEND_AUTHORIZED = NO`
- `HOST_SPEND_AUTHORIZATION_REQUIRED = YES`

No API keys or secrets may be read. No live provider request, Solana RPC call,
paid API use, source measurement, MCP source research run, DSH live run, or
database start is authorized by this phase.

## Phase exits

The only exits are:

- `SOURCE_STACK_QUALIFIED`
- `KILL_SMOKESTACK_V0`

There is no soft pass. A qualification pass does not authorize runtime
providers, Formation, attention, detector, alerts, trading, or PR-02 work.

## Explicitly unauthorized work

PR-01 bootstrap does not authorize:

- runtime provider adapters;
- PostgreSQL or any permanent ledger;
- Formation implementation;
- attention implementation;
- detector or alert implementation;
- trading;
- PR-02;
- any live source qualification execution.

The existing PR-00 status must remain fail-closed:

- `liveProvidersAuthorized = false`
- `detectorAuthorized = false`
- `publicAlertsAuthorized = false`
- `tradingAuthorized = false`
