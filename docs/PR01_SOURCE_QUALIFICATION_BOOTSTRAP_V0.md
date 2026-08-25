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

Every future candidate source is assigned one or more explicit roles:

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
