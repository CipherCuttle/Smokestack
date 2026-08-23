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

The intended DSH build-control treatment is subscription-native and must not require model API-key environment variables.

Rules:
- `OPENAI_API_KEY` is absent from the Codex orchestrator/implementer environment;
- `ANTHROPIC_API_KEY` is absent from the Claude reviewer environment when subscription-native Claude is under qualification;
- no DeepSeek model API key is required for the DSH control plane;
- native login/account state is created interactively by the user outside Smokestack/DSH;
- DSH/tooling may receive explicit home/identity locations but must not copy, print, serialize, hash wholesale, or commit their credential contents;
- credential-shaped environment variables are removed rather than forwarded by default;
- identity evidence records non-secret executable/product/home descriptors and digests, never OAuth/access/refresh tokens;
- complete environment dumps and complete Git/product config dumps are prohibited in receipts.

If a tool unexpectedly requests a model API key, switches billing/auth mode, or cannot prove which native account mode is active without exposing credentials, qualification fails closed.

This boundary concerns coding agents. Product data sources introduced in PR-01 may have separate credentials; those are governed by source-specific secret handling and do not enter agent receipts/prompts unless explicitly required and authorized.

## Third-party coding-agent policy

Technical ability to reuse native account state is not by itself sufficient. DSH-mediated use of a native subscription must remain compatible with the current provider's account/product policy and billing behavior.

If a provider changes policy such that DSH-mediated subscription use is not supported, Smokestack does not disguise traffic, scrape credentials, emulate a first-party client dishonestly, or silently fall back to paid API usage. That agent leg becomes `NOT_QUALIFIED` until a compliant route exists.

## Agent permissions

The build protocol follows least privilege:
- orchestrator: read/search + governed delegation; no direct writes/commit/merge/unbounded shell;
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
