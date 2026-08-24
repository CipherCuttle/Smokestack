# PR-00B R2 — Local-State Metadata Boundary

## Identity

- Phase: `PR-00B_R2_LOCAL_STATE_METADATA_BOUNDARY`
- Predecessor SHA: `6a60ab6203406aaf6ac5604ab97017f245addf07`
- Predecessor terminal status: `CLOSED_FAIL_TARGETED_REREVIEW_CRITICAL_HIGH_FOUND`
- R1 remains immutable failed historical lineage.

## Hostile review consumed

The independent R2 hostile review consumed the frozen candidate
`fbed2edbda5173c8a6398cadf20f08626ba606f5` and returned:

- `CRITICAL = 0`
- `HIGH = 2`
- `R2_HOSTILE_REVIEW_GATE: CRITICAL_HIGH_FOUND`

The two exact High findings were:

1. **Git `%(prefix)` path expansion bypasses referenced-file fingerprinting** — `resolveGitConfigReference()` treated the literal configured value as a repository-relative path while Git expanded `%(prefix)` to the effective external path. Mutating the file Git consumed changed `git check-attr`/`git check-ignore` semantics while `compareGitMetadataState(...).ok` remained true.
2. **Implicit XDG global attributes/excludes files are not attested** — when the effective `core.attributesFile`/`core.excludesFile` keys were unset, Git still consumed `$XDG_CONFIG_HOME/git/attributes` and `$XDG_CONFIG_HOME/git/ignore`, but R2 recorded neither. Mutating either file changed Git behavior while metadata comparison remained clean.

## Bounded repair

The one authorized Critical/High repair used Git's `--path` expansion for configured attributes/excludes references and fingerprinted Git's default XDG global attributes/excludes resources when the corresponding effective key was unset. Existing resource, include, symlink, filter, ignored-state, content, index, tree, HEAD, hook, and final-attestation controls were preserved.

Zero-model regressions reproduce the security-relevant effects and assert fail-closed metadata comparison for both findings:

- `Git %(prefix) expansion binds the same attributes and excludes files Git consumes`
- `implicit XDG global attributes and excludes files are bound`

The frozen candidate was reproduced before repair for both bypasses; the repaired regressions distinguish those clean-comparison failures from the repaired fail-closed behavior.

## Lifecycle

- Lifecycle: `TARGETED_REREVIEW_PENDING`
- Broad review remaining: `0`
- Targeted rereview remaining: `1`
- No second broad review is permitted.
- No second repair loop is permitted.
- No live qualification is run; no merge is performed; PR-01 is not started.

The next gate is one independent targeted rereview by the reserved reviewer.

## Explicit non-goals

No redesign of RH01 or RH03, no live qualification, no merge, no PR-01, and no claim that R1 passed or that PR-00B is fully qualified.
