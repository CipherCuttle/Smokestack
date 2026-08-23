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

## Input handling

Provider payloads are hostile input: preserve raw response, parse through a provider-specific boundary, validate before core, reject schema drift explicitly, and never coerce unavailable fields into semantic zero.

## Supply chain progression

Early research: pinned toolchain/dependencies, least-privilege CI, secret hygiene, dependency inventory.

Before distributable artifacts: CycloneDX SBOM and vulnerability review.

Before public release: signed hosted-build provenance target (SLSA Build L2 or current equivalent), web security review against current OWASP ASVS baseline, and public threat model.

## Public data and identity

Do not infer or publish a real-world identity behind a wallet unless independently supported and required by product semantics.

Use neutral terms such as `RECURRENT_ACTOR` and `HIGH_UBIQUITY_ACTOR`; do not upgrade these to `SMART`, `INSIDER`, `BOT`, `MARKET_MAKER`, or wrongdoing claims without a separately defined evidence standard.
