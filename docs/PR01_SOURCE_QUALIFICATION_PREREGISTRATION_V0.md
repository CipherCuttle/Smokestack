# PR-01 Source Qualification Preregistration V0

## Closure state

- Phase: `PR01_SOURCE_QUALIFICATION_PREREGISTRATION_V0`
- State: `PREREGISTERED_NOT_EXECUTED`
- Predecessor: `42bc8003b280affc8da0bb484ea9468da32bb656`
- Preregistration recorded at: `2026-08-25T19:37:26Z`
- Machine-readable contract: `experiments/qualification/pr01-source-qualification-prereg-v0.json`
- Machine-readable contract SHA-256: `6ee5cb453262fa4ca192624ff756cc31b05b8ce870b398748c31b1e6964416bb`
- `MEASUREMENT_AUTHORIZED = NO`
- `LIVE_PROVIDER_EXECUTION_AUTHORIZED = NO`
- `PAID_PROVIDER_SPEND_AUTHORIZED = NO`
- `SECRET_READ_AUTHORIZED = NO`
- `SOLANA_RPC_EXECUTION_AUTHORIZED = NO`

This is a candidate-selection and preregistration artifact. No provider data
request, Solana RPC call, source measurement run, paid request, credential
read, database start, or detector run occurred while producing it. Public web
research below is documentation research only.

The bootstrap contract at the predecessor SHA remains authoritative. This file
freezes the deferred universe, source candidates, first-buyer semantics, chain
ordering, audit population, sampling frame, denominators, and future execution
shape. It does not qualify a source stack.

## Frozen decision boundary

The exact Stage-1 gates remain unchanged:

| Gate | Required threshold |
|---|---:|
| Successful parse rate | `>=99.5%` |
| Schema violations | `<=0.5%` |
| Market-legible universe coverage | `>=95%` |
| p95 discovery latency | `<=120 seconds` |
| First-buyer availability | `>=95%` of eligible assets |
| Audited first-buyer identity/order agreement | `>=99%` with direct-chain truth |
| Undocumented semantic shifts | `0` |

No observed result exists. The phase cannot output `SOURCE_STACK_QUALIFIED`.

## A. `SOLANA_UNIVERSE_CANDIDATE_V0`

`SOLANA_UNIVERSE_CANDIDATE_V0 = FROZEN`.

### Chain and asset object

- Chain identity is `Solana mainnet-beta`; devnet and testnet are out of scope.
- The observed asset object is one fungible token mint that is a side of a
  newly initialized Raydium CPMM pool.
- The canonical identity is the tuple
  `(chain_id = solana-mainnet-beta, mint_address)`. `mint_address` is the
  base-58 public key of the SPL Token or Token-2022 mint account. Names,
  symbols, metadata, pool addresses, and provider IDs are never identity keys.
- The only market program in V0 is Raydium CPMM:
  `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`.
- A quote mint is one of these fixed public keys: wrapped SOL
  `So11111111111111111111111111111111111111112`, USDC
  `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, or USDT
  `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`. The set is an address
  set, not a symbol interpretation.

### Inclusion rule

An asset is included exactly once when the independent chain census finds the
earliest finalized successful transaction in the observation window that:

1. invokes the frozen Raydium CPMM program with `Initialize` or
   `InitializeWithPermission`;
2. creates a pool whose two mint public keys are distinct and sorted according
   to the CPMM instruction contract;
3. has exactly one non-quote mint and exactly one quote mint from the fixed
   quote set;
4. supplies positive `init_amount_0` and `init_amount_1` in the instruction;
5. has a complete pool state, both vault accounts, both mint accounts, and the
   token-program owners in the same finalized chain evidence; and
6. has the pool swap operation enabled (`status` swap-disabled bit clear) and
   `open_time <= blockTime` for the initialization transaction.

The non-quote mint is the candidate asset. Positive initialization amounts and
the on-chain swap-enabled state are market-legibility conditions known at the
eligibility event; no later price, return, volume, survival, attention, or
successful-trade outcome is used.

The canonical census is built from raw chain evidence. A discovery provider
may miss an asset; that absence never changes the universe denominator.

### Exclusion rule

The following are deterministic exclusions, recorded with a reason and raw
lineage rather than silently discarded:

- failed transactions (`meta.err != null`);
- any program other than the frozen CPMM program;
- `Deposit`, `Withdraw`, `SwapBaseInput`, `SwapBaseOutput`, fee collection,
  router, LaunchLab, CLMM, AMM v4, or arbitrary transfer instructions as the
  universe-creating event;
- two quote mints, two non-quote mints, identical mints, missing mint account,
  or an unsupported token-program owner;
- zero initialization amount, swap-disabled status, or an initialization
  whose open time is after its event block time;
- an identity collision that cannot be resolved to one `(chain_id, mint)` key.

These exclusions are protocol exclusions, never provider-absence exclusions.
An otherwise qualifying candidate with unavailable or ambiguous evidence is
retained as `UNAVAILABLE_OR_INVALID` in the census ledger and is not converted
to a successful eligible asset.

### Newly active and timestamps

The observation window is seven consecutive 24-hour UTC periods. Its start is
the first UTC midnight after a future host execution authorization is recorded;
its end is exactly seven days later. The census closes at end plus a fixed
30-minute finality/census grace period.

“Newly active” means the first qualifying CPMM initialization for the mint in
that window. If a mint has an earlier qualifying initialization in the same
chain census, a later pool is a duplicate and cannot make the mint newly active.

Every eligible observation stores:

- `source_event_at`: the chain `blockTime`, when non-null;
- `source_slot_or_block`: finalized slot and the transaction’s array index in
  its full block response;
- `eligibility_knowledge_at`: the `fetched_at` of the first complete finalized
  census evidence; this is the conservative knowledge-time boundary;
- `fetched_at` and `recorded_at` for every provider observation.

The event timestamp is used to measure discovery latency. Any decision use of
the observation is bounded by `eligibility_knowledge_at`, never by a later
correction.

### Duplicate, alias, migration, and ambiguity handling

- Sort candidates by `(slot, transaction_index, outer_instruction_index,
  inner_instruction_index, inner_instruction_index_within_parent,
  signature_bytes)` and retain the first qualifying initialization for a mint.
- Repeated pools for the same mint are linked duplicates; they remain visible
  but do not increment the universe or any role denominator.
- Metadata aliases, symbols, names, logos, and provider token IDs are ignored.
- A migration to a new mint is a new asset; the old and new mint addresses are
  never merged. Any explicit migration relation is descriptive only.
- Missing or conflicting mint owner, pool mint, vault, or transaction-order
  evidence is `AMBIGUOUS`/`UNAVAILABLE_OR_INVALID`, not guessed, merged, or
  treated as provider absence.

### Late and unavailable source behavior

An event inside the window that is first delivered by a source after the
source-specific 10-minute late-result boundary remains in the fixed universe
and counts against discovery timeliness. It is labelled `LATE`; it is not
removed from coverage, availability, or audit denominators. An event arriving
after the census close remains a late correction and cannot retroactively enter
the closed snapshot.

Provider outage, missing endpoint support, timeout, malformed response,
unsupported field, null timestamp, and ambiguous identity are explicit states:
`UNAVAILABLE`, `TIMEOUT`, `MALFORMED`, `UNSUPPORTED`, `AMBIGUOUS`, or
`UNAVAILABLE_OR_INVALID`. None is mapped to zero, absence, a thin market, or a
successful parse.

## B. Frozen provider candidate set

`PROVIDER_CANDIDATE_SET = FROZEN`.

The smallest candidate set judged worth measuring is four source identities.
The roles and public evidence are also recorded in the JSON contract.

### `HELIUS_LASERSTREAM_GRPC_MAINNET_V0`

- Role: `DISCOVERY`.
- Exact family: Helius LaserStream gRPC transaction stream, raw
  `transactionUpdate` filtered to the Raydium CPMM program and the two frozen
  initialization discriminators.
- Public evidence: Helius LaserStream gRPC quickstart and Helius pricing/rate
  limits.
- Authentication: Helius account/API credential; a credential will be needed
  later and is not present or read in this phase.
- Public pricing: mainnet LaserStream is documented on Business and higher;
  the public Business reference price is `$499/month`, with streaming data
  add-ons publicly listed separately. Usage is also documented as credit/data
  metered. This is an estimate, not authorization or spend.
- Rate-limit semantics: public docs specify LaserStream networks, active
  connection limits, and max pubkeys by plan; exact stream delivery behavior,
  disconnect loss window, and billing for this exact filter are
  `UNKNOWN_TO_BE_MEASURED`.
- Pagination/order/timestamps: reconnect and historical replay are documented;
  the stream’s raw slot/transaction ordering, replay overlap behavior, and
  provider timestamp semantics are `UNKNOWN_TO_BE_MEASURED`. Smokestack will
  use chain order from the independent audit source for truth.
- Schema/version: raw Yellowstone/gRPC message schema and provider SDK version
  must be pinned in the later packet; the exact deployed schema revision is
  `UNKNOWN_TO_BE_MEASURED`.
- Historical/live claim: documented live transaction monitoring and historical
  replay; completeness, retention, and end-to-end latency are unmeasured.
- Known limitations: provider stream delivery is not chain truth; disconnects,
  replay gaps, parser choices, and undocumented changes remain failure states.
- Terms/licensing: Helius terms prohibit unauthorized access, resale,
  sublicensing, and interference. Later use must be account-authorized and raw
  evidence retention must be checked against the applicable plan/terms.

### `BIRDEYE_SOLANA_MARKET_DATA_V3`

- Role: `MARKET_STATE`.
- Exact family: Birdeye Data API Solana token/market endpoints, using Token -
  All Market List (`/defi/v2/markets`) to resolve pools and Token - Market Data
  (`/defi/v3/token/market-data`) or its documented single-token equivalent for
  the frozen mint at the eligibility knowledge-time boundary.
- Public evidence: Birdeye Token/Market List, getting-started,
  compute-unit-cost, and per-API-rate-limit documentation.
- Authentication: `X-API-KEY`; a later source-specific credential is required.
- Free/paid status and pricing: an account/API key and package are required;
  public docs list 30 compute units for all-market-list and 10 compute units
  for token market data, but the applicable package price is
  `UNKNOWN_TO_BE_MEASURED`. No free or paid spend is authorized here.
- Rate-limit semantics: public docs list 100 requests/minute for all-market
  list and 300 requests/minute for token market data. Account/package limits
  and burst behavior remain `UNKNOWN_TO_BE_MEASURED`.
- Pagination/order/timestamps: the list family documents discovery and pool
  lists; exact cursor, ordering, snapshot timestamp, correction, and historical
  as-of semantics for this use are `UNKNOWN_TO_BE_MEASURED`.
- Schema/version: endpoint payload schema and version header must be captured;
  exact version pin is `UNKNOWN_TO_BE_MEASURED`.
- Historical/live claim: market, liquidity, price, and transaction-flow data
  are publicly described; historical point-in-time completeness is unmeasured.
- Known limitations: an aggregate market layer may omit or reinterpret pools;
  provider labels cannot establish market legibility, and missing records are
  unavailable rather than excluded.
- Terms/licensing: Birdeye’s published terms govern API data access and use;
  later retention, attribution, redistribution, and research-use constraints
  must be confirmed against the selected package before execution.

### `HELIUS_ENHANCED_TRANSACTIONS_V1`

- Role: `FIRST_BUYER`.
- Exact family: Helius Enhanced Transactions legacy V1, transactions-by-address
  and/or get-transactions-by-signature endpoints for the eligible CPMM pool,
  retaining the provider’s parsed transaction plus all available token
  transfer, account, slot, and signature fields.
- Public evidence: Helius Enhanced Transactions API reference, FAQ, credits,
  and rate-limit documentation.
- Authentication: Helius API key in the documented query parameter; credential
  required later and not present/read now.
- Free/paid status and pricing: Helius plans are public (`$0`, `$49`, `$499`,
  `$999` monthly references) with credits; exact request cost depends on the
  endpoint and plan. No spend is authorized.
- Rate-limit semantics: public docs specify plan-level Enhanced/DAS requests
  per second, historical batch limits, HTTP 429 behavior, and a maximum of five
  recommended retries; this preregistration freezes a lower two-retry ceiling.
- Pagination/order/timestamps: history pagination is documented; provider
  ordering, corrections, parsed timestamp semantics, and whether all relevant
  inner instructions survive parsing are `UNKNOWN_TO_BE_MEASURED`.
- Schema/version: V1 is explicitly a legacy parsed API and V2 is a separate
  future family; V1 endpoint and response schema must be pinned. Any V2 use is
  a new candidate, not a silent substitution.
- Historical/live claim: documented parsing of SPL-related swaps/transfers and
  historical address transactions; unsupported transaction types are filtered
  by the provider and therefore count as unavailable for this role.
- Known limitations: a parsed `SWAP` label is not accepted as chain truth;
  missing owner, transfer, instruction, failure, or order evidence yields
  unavailable/ambiguous.
- Terms/licensing: the same Helius account-use, anti-resale, and access rules
  apply. Provider interpretation is retained as a claim, never as audit truth.

### `QUICKNODE_SOLANA_MAINNET_RPC_DIRECT_AUDIT_V0`

- Role: `DIRECT_CHAIN_AUDIT`.
- Exact family: a separately controlled QuickNode Solana mainnet-beta JSON-RPC
  endpoint using raw `getSignaturesForAddress`, `getBlock`, `getTransaction`,
  and required mint/account reads at `finalized` commitment with
  `jsonParsed`/full transaction metadata as needed.
- Public evidence: Solana `getBlock`/`getTransaction` specifications and
  QuickNode method docs, Solana product page, and pricing page.
- Authentication: separate QuickNode endpoint/API key or account credential;
  it must not be shared with Helius, and no credential is read now.
- Free/paid status and pricing: QuickNode publicly lists a free trial with
  10M credits/no overage, then Build at a public `$49/month` reference and
  credit-based usage. Archive depth and exact method credit multipliers are
  plan-dependent and `UNKNOWN_TO_BE_MEASURED`.
- Rate-limit semantics: public pricing lists plan RPS (free trial 15, Build
  50, higher tiers more); exact method-specific throttling and archive limits
  are `UNKNOWN_TO_BE_MEASURED`.
- Pagination/order/timestamps: `getSignaturesForAddress` uses `before`/`until`
  pagination and returns slot/signature/status; `getBlock` returns the ordered
  transaction array, and `getTransaction` returns slot, block time, metadata,
  instructions, and token balances. Any null or missing required primitive is
  unavailable, never guessed.
- Schema/version: standard Solana JSON-RPC method/version and response
  encoding are frozen; endpoint software/version and archive retention are
  captured at execution.
- Historical/live claim: standard finalized block and transaction reads are
  documented; historical completeness and availability must be measured.
- Known limitations: an RPC provider can be unavailable or pruned; failed,
  null, incomplete, and rate-limited reads remain in the audit lineage.
- Terms/licensing: QuickNode terms grant a limited product-use license and
  usage is subject to plan/API-credit terms; raw-evidence retention and any
  redistribution must be checked before execution.

## C. Source-role independence

`FIRST_BUYER_SOURCE_ID = HELIUS_ENHANCED_TRANSACTIONS_V1`.

`DIRECT_CHAIN_AUDIT_SOURCE_ID = QUICKNODE_SOLANA_MAINNET_RPC_DIRECT_AUDIT_V0`.

`AUDIT_SOURCE_INDEPENDENCE_FROZEN = YES`.

The IDs are distinct controlled source paths, not alternate labels. The
first-buyer source supplies Helius’s parsed/interpreted transaction claim. The
audit source is a separately provisioned QuickNode endpoint/account and uses
only raw Solana JSON-RPC block, transaction, account, and token-balance
evidence. The audit parser reads the frozen Raydium instruction/state contract;
it does not read, import, cache, or accept Helius first-buyer output.

The audit path is not a Helius export, Helius cache, Helius-derived dataset,
same-provider wrapper, or claimed ordering supplied by Helius. No fallback to
Helius, Birdeye, a DEX aggregator, or a provider-labelled first buyer is
allowed for a `DIRECT_CHAIN_AUDIT` result. Before any future result is
inspected, the host must record the QuickNode endpoint identity, separate
credential boundary, and raw JSON-RPC request/response hashes. Failure to bind
that separate path changes the state to
`AUDIT_SOURCE_INDEPENDENCE_FROZEN = NO` and keeps measurement unauthorized.

## D. First-buyer semantics

`FIRST_BUYER_SEMANTICS_FROZEN = YES`.

For one eligible asset and its first qualifying CPMM pool, the first buyer is
the canonical wallet owner of the recipient token account in the earliest
successful, single-hop Raydium CPMM swap that transfers a positive net amount
of the asset mint from the pool vault to that owner and transfers a positive
quote amount from the swapper side into the paired pool vault.

- Successful means `meta.err == null` in direct truth. A provider response that
  lacks an equivalent explicit success/failure field is unavailable.
- Included instructions are only Raydium CPMM `SwapBaseInput` and
  `SwapBaseOutput` for the frozen pool, including their CPI token transfers.
- The recipient owner is resolved from the recipient SPL Token/Token-2022
  account. The token-account address, pool authority, vault, mint authority,
  program account, and fee account are not wallet identity substitutes.
- Net acquisition is computed from pre/post token balances where available;
  transfer-fee behavior is represented by the recipient’s net amount. Missing
  balance/owner evidence is unavailable.
- `Initialize`, `Deposit`, `Withdraw`, fee collection, mint, burn, direct
  transfer, airdrop, LP-token movement, and self-transfer are not acquisitions.
- A transaction is single-hop only if it contains one qualifying CPMM swap for
  the pool and no Jupiter/Raydium router, second pool, second swap, or other
  DEX swap. Routed/multi-hop/aggregated acquisitions are explicitly
  `OUT_OF_SCOPE_ROUTED`, not silently interpreted.
- Multiple transfer rows to the same owner in one qualifying swap are
  aggregated. Two or more distinct positive recipient owners, an owner
  collision, or a missing instruction path is `AMBIGUOUS`.
- Repeated acquisitions by the same owner after the first are duplicate
  activity and do not change first-buyer identity/order.
- The first-buyer answer is `(wallet_owner, chain_order_key)`; it is not a
  claim about a real-world person, intelligence, quality, or future outcome.

Unavailable, malformed, ambiguous, failed, routed, and provider-failure
states remain visible and are not converted to “no buyer.”

## E. Chain order convention

`CHAIN_ORDER_CONVENTION_FROZEN = YES`.

The deterministic order key is:

1. finalized `slot` ascending;
2. transaction index ascending in the ordered `getBlock` transaction array;
3. outer instruction index ascending;
4. CPI `innerInstructions.index` / inner-instruction position ascending;
5. nested instruction path ascending where the response exposes it; and
6. signature bytes ascending only as a deterministic duplicate-record
   tie-breaker, never as a substitute for a missing chain position.

The primary authoritative primitives are Solana finalized slot and the full
block transaction-array order. Instruction paths come from the transaction
message and `innerInstructions`; the audit must request enough metadata to
preserve them. Events sharing one instruction path are aggregated before
ordering. If a block transaction index, required instruction path, slot,
failure state, or token-account owner is absent/ambiguous, the answer is
`UNAVAILABLE_OR_INVALID`; no lexical guess or provider order is used.

## F. Audit-eligible population

`AUDIT_ELIGIBLE_POPULATION_FROZEN = YES`.

The population is every distinct asset in the closed, content-addressed
`SOLANA_UNIVERSE_CANDIDATE_V0` snapshot that satisfies the frozen chain
inclusion rule and has the outcome-independent observable fields required to
identify its first pool, mint accounts, initial transaction signature, event
slot, and pool vaults.

The population is not filtered on discovery success, market API success,
parser result, first-buyer answer, provider/chain agreement, price, volume,
survival, attention, or any later result. Provider absence cannot remove a
case. Assets with missing post-inclusion evidence remain visible as invalid or
unavailable cases; if the independent census itself cannot close, the packet
is invalid and no gate is reported.

## G. Audit sampling frame

`AUDIT_SAMPLING_FRAME_FROZEN = YES`.

- Snapshot: the full universe ledger is frozen at the seven-day window close
  plus 30 minutes; its RFC 8785/JCS byte representation is hashed with
  SHA-256 and stored before any first-buyer or audit result is inspected.
- Sample: without replacement, choose `min(200, N)` assets from the snapshot.
- Selection score: sort by
  `SHA256("smokestack:pr01:source-qualification:audit-v0|" + universe_digest + "|" + canonical_asset_identity)`
  as unsigned hexadecimal bytes and take the first `min(200, N)`.
- Commitment: store the ordered selected identity list and its SHA-256 digest
  before reading any Helius first-buyer answer or QuickNode audit answer.
- No manual selection, cherry-picking, post-result reselection, or replacement
  is permitted.
- A selected timeout, malformed response, ambiguous identity, provider
  failure, chain failure, routed case, or unavailable answer remains a selected
  case and remains in the audit-agreement denominator. There is no replacement
  policy.

## H. Frozen denominator and status accounting

Every logical scheduled observation has one stable case ID. Retries are
attempts attached to that case; they do not create new denominator rows.
Duplicate payloads are retained as `DUPLICATE` and do not inflate a logical
denominator. Conflicting duplicates are invalid/schema evidence, not silently
deduplicated.

| Metric | Numerator | Denominator / invalid and unavailable treatment |
|---|---|---|
| Successful parse rate | Scheduled logical cases whose final adjudication has a complete valid expected schema and mandatory fields | All scheduled logical cases for that role, including timeout, unavailable, malformed, and failed cases. Retry success can make the case parse-success, but any malformed payload remains schema evidence. |
| Schema violations | Logical cases with at least one received non-duplicate payload that violates the frozen schema or mandatory-field contract | All scheduled logical cases for that role. Timeout with no payload is not a schema violation but remains a parse failure. |
| Market-legible coverage | Distinct frozen-universe assets with a valid Birdeye market-state observation bound to the correct mint/pool and eligibility knowledge-time boundary | Every asset in the independent universe snapshot. Missing, unavailable, late, malformed, timeout, unsupported, and provider-failure cases remain in the denominator. |
| p95 discovery latency | Each asset has `discovery_fetched_at - source_event_at` in seconds | Every asset in the frozen universe. Missing/timeout/unavailable/late beyond the 10-minute bound is assigned `+Infinity`; sort N values and use index `ceil(0.95*N)-1`. |
| First-buyer availability | Eligible assets with one unambiguous Helius first-buyer answer satisfying the frozen semantics | Every audit-eligible asset. Failed, routed, ambiguous, malformed, timeout, unavailable, and provider-failure states count in the denominator and not the numerator. |
| Audited identity/order agreement | Selected cases where Helius identity and order key exactly match independent QuickNode-derived chain truth | Every committed selected case. Any unavailable, invalid, malformed, failed, ambiguous, provider-failure, chain-failure, or disagreement state is not agreement success. |
| Undocumented semantic shifts | No numerator; gate is zero undocumented shifts | All source observations and provider/schema changes during the packet. A documented, captured, versioned change may be recorded; an undocumented or silently interpreted change fails the gate. |

Late results never reopen or shrink a denominator. A correction appends a new
observation linked to the original case; it does not erase the original state
or change the frozen snapshot.

## I. Future execution shape (specified, not executed)

- Observation window: one seven-day UTC window as defined above; close is fixed
  at end plus 30 minutes. No discretionary early stop. If a hard capacity cap
  is reached, preserve all known cases and close as invalid/not qualified;
  never sample down the universe.
- Evaluation order: (1) QuickNode chain census and snapshot commitment;
  (2) Helius LaserStream discovery capture; (3) Birdeye market-state requests;
  (4) Helius Enhanced Transactions first-buyer claims; (5) QuickNode audit of
  the committed sample; (6) gate calculation and semantic-drift review.
- Request ceilings: one LaserStream connection, at most 10 reconnects and one
  15-minute replay per reconnect; at most 20 Helius history pages per asset;
  at most two Birdeye market requests per asset; at most 50,000 QuickNode
  signature pages and 100,000 raw RPC calls total. Exceeding a ceiling is an
  explicit capacity failure, not a denominator adjustment.
- Retries: two retries maximum for 408/429/5xx/transport failures with
  bounded exponential backoff; no retry for 400/401/403/404 or schema errors.
  All attempts, including unsuccessful and duplicate attempts, are retained.
- Concurrency: one stream; four concurrent Birdeye requests; four concurrent
  Helius history requests; eight concurrent QuickNode reads. Request ordering
  within a logical case is deterministic.
- Timeouts: 30 seconds for a stream operation/replay and 10 seconds per HTTP
  request; timeout is a first-class result and not an implicit retry success.
- Pagination: use only documented cursors/before-until tokens; no page is
  silently truncated. Helius history is capped at 20 pages per asset; the
  QuickNode census is capped at 50,000 signature pages.
- Raw evidence: retain request metadata, response bytes or permitted immutable
  references, SHA-256 hashes, endpoint/product/schema identity, timestamps,
  attempt status, parser result, and cost evidence for at least 24 months. If a
  provider’s terms prohibit raw retention, retain the permitted immutable
  reference plus digest and classify recomputation limits before any verdict.
- Parser/code identity: the later harness must record its commit SHA, Node/npm
  toolchain, contract digest, provider schema revisions, and parser version
  before the first live request. Any parser/schema change after the first
  request creates a new packet and cannot repair the current packet.
- Cost accounting: record plan, fixed subscription, credits, requests,
  retries, bytes, overages, and actual invoice/usage evidence separately for
  every source. Public estimate is at least Helius Business `$499/month` plus
  QuickNode Build `$49/month`, plus a Birdeye package and usage charges that
  are not publicly fixed in the selected documentation. This is an estimate,
  not authorization or actual spend.
- Semantic drift: capture documentation URLs and retrieval timestamps before
  execution; bind response schema/version for every observation; compare
  payload shape, enum meaning, timestamp meaning, ordering, pagination, and
  missingness throughout the run. An undocumented shift is preserved and
  fails the zero-shift gate.
- Failure preservation: no raw response, failed case, duplicate, late result,
  unavailable state, or invalid sample member may be deleted or hidden to
  obtain a passing denominator.

## J. Spend and authorization boundary

The end-of-phase state is exactly:

- `LIVE_PROVIDER_EXECUTION_AUTHORIZED = NO`
- `PAID_PROVIDER_SPEND_AUTHORIZED = NO`
- `SECRET_READ_AUTHORIZED = NO`
- `SOLANA_RPC_EXECUTION_AUTHORIZED = NO`
- `MEASUREMENT_AUTHORIZED = NO`

Future execution may require Helius, Birdeye, and QuickNode credentials and
possibly paid plans. Those credentials are listed as prerequisites only; none
was read, copied, tested, or stored. Host execution authorization must be
explicitly granted after this preregistration closes.

## K. Fail-closed product state

The existing foundation status remains unchanged and must report:

```json
{
  "liveProvidersAuthorized": false,
  "detectorAuthorized": false,
  "publicAlertsAuthorized": false,
  "tradingAuthorized": false
}
```

This phase starts no database, detector, alert path, runtime provider adapter,
or PR-02 work. `SOURCE_STACK_QUALIFIED = NO` and `PR02 = NOT_STARTED`.

## Public evidence register

The following stable public documentation was consulted without requesting
provider data:

- Solana RPC: [getBlock](https://solana.com/docs/rpc/http/getblock),
  [getTransaction](https://solana.com/docs/rpc/http/gettransaction), and
  [JSON structures](https://solana.com/docs/rpc/json-structures).
- Raydium: [program addresses](https://docs.raydium.io/reference/program-addresses),
  [CPMM instructions](https://docs.raydium.io/products/cpmm/instructions), and
  [CPMM accounts](https://docs.raydium.io/products/cpmm/accounts).
- Helius: [LaserStream gRPC](https://www.helius.dev/docs/laserstream/grpc),
  [Enhanced Transactions](https://www.helius.dev/docs/api-reference/enhanced-transactions/gettransactions),
  [rate limits](https://www.helius.dev/docs/billing/rate-limits),
  [pricing](https://www.helius.dev/pricing), and
  [terms](https://www.helius.dev/terms).
- Birdeye: [Token/Market List](https://docs.birdeye.so/reference/tokenmarket-list),
  [compute-unit cost](https://docs.birdeye.so/docs/compute-unit-cost),
  [per-API rate limits](https://docs.birdeye.so/docs/per-api-rate-limit), and
  [getting started](https://docs.birdeye.so/reference/birdeye-api-getting-started).
- QuickNode: [getBlock](https://www.quicknode.com/docs/solana/getBlock),
  [getTransaction](https://www.quicknode.com/docs/solana/getTransaction),
  [Solana RPC](https://www.quicknode.com/chains/solana), and
  [pricing](https://www.quicknode.com/pricing).

Claims in the provider records are labelled as documented, inferred, or
unknown in the machine-readable contract. No marketing claim is a measured
qualification result.

## Phase result

`PREREGISTERED_NOT_EXECUTED`.

`SOURCE_STACK_QUALIFIED = NO`.

Next gate: `PR01_PREREG_INDEPENDENT_REVIEW`.
