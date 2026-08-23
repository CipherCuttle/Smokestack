# Smokestack DSH Tooling

This directory is reserved for the optional DeepSeek Harness development control plane described in `docs/DSH_BUILD_CONTROL.md` and ADR-0006.

## PR-00 state

`NOT_QUALIFIED`

No DSH package, profile, home, agent credential, adapter, launcher, or runtime state belongs here yet.

The first tooling phase is **DSH-Q0 cold-install/runtime qualification on disposable fixtures**. Do not add DSH to the root Smokestack `package.json`.

When Q0 begins, tooling dependencies must use their own exact versions and lockfile inside this boundary. A clean application build remains independent:

```bash
npm ci
npm run check
```

must continue to work with `tooling/dsh/` absent or unused.

## Parent candidate

```text
OpenRouter
  model: deepseek/deepseek-v4-flash-0731
  secret: OPENROUTER_API_KEY
```

The parent key is scoped to the DSH parent-provider route only. It must never be copied into Codex/Claude child environments, fixtures, receipts, or repository files.

## Non-negotiable

Until `DSH_BUILD_CONTROL_QUALIFIED`:

- DSH MUST NOT mutate Smokestack `src/`;
- DSH MUST NOT become required by CI for application correctness;
- `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are not introduced to make native child qualification pass;
- `OPENROUTER_API_KEY` is the only model API credential authorized for DSH qualification and only for the parent route;
- all model-backed qualification runs use disposable fixture workspaces;
- failure of DSH qualification leaves ordinary/manual Smokestack development available.
