# Security Baseline

## V0 threat boundary

Smokestack begins as observation-only. It holds no trading keys, custody, transaction-signing authority or user funds.

## Repository / CI

- GitHub Actions permissions are explicit and least-privilege.
- Third-party actions are pinned to full commit SHAs.
- Dependency versions are exact and lockfile-backed.
- `npm ci` is the target CI installation path after bootstrap lock generation.
- install scripts are disabled at bootstrap unless a future dependency is explicitly reviewed and requires them.
- secrets must never enter fixtures/research artifacts.

## Coding-agent authentication

The DSH build-control treatment uses one metered parent credential and native subscription authentication for coding children.

- `OPENROUTER_API_KEY` is permitted only at the DSH parent-provider boundary.
- `OPENAI_API_KEY` is not used by the Codex child.
- `ANTHROPIC_API_KEY` is not used by the Claude reviewer while subscription-native Claude is under qualification.
- Parent credentials must never be forwarded to child environments.
- Native child account state is created outside Smokestack/DSH and is never copied into the repository.
- Receipts record only non-secret provider/model/executable/home identities and never credential values.
- Complete environment dumps and complete product-auth/config dumps are prohibited.

Any parent-secret appearance in a child environment, prompt, fixture, receipt, Git diff or retained diagnostic is a qualification failure.

Product data sources introduced in PR-01 may have separate credentials under their own source-specific controls.

## Third-party coding-agent policy

Native subscription use must remain compatible with the provider's current product/account policy and billing behavior.

If a provider no longer supports the intended mediated subscription use, that child leg becomes `NOT_QUALIFIED`. Smokestack does not disguise traffic, scrape credentials, or silently switch that child to paid API usage.

## Agent permissions

The build protocol follows least privilege:
- parent: read/orchestration plus governed delegation tools; no direct write/edit/commit/merge/unbounded shell;
- implementer: assigned worktree read/write/edit/test only; no merge, authority changes, secret discovery, unrelated repository mutation, or unbounded network;
- reviewer: mechanically read-only; no write/edit/Bash/repair/agent-spawn mutation path.

Permission invariants require negative-control tests; prompt instructions are not permission enforcement.

## Input handling

Provider payloads are hostile input: preserve raw response, parse through a provider-specific boundary, validate before core, reject schema drift explicitly, and never coerce unavailable fields into semantic zero.

## Supply chain progression

Early research: pinned toolchain/dependencies, least-privilege CI, secret hygiene, dependency inventory.

Before distributable artifacts: CycloneDX SBOM and vulnerability review.

Before public release: signed hosted-build provenance target (SLSA Build L2 or current equivalent), web security review against current OWASP ASVS baseline, and public threat model.

## Public data and identity

Do not infer or publish a real-world identity behind a wallet unless independently supported and required by product semantics.

Use neutral terms such as `RECURRENT_ACTOR` and `HIGH_UBIQUITY_ACTOR`; do not upgrade these to `SMART`, `INSIDER`, `BOT`, `MARKET_MAKER`, or wrongdoing claims without a separately defined evidence standard.
