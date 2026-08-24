# PR-00B R3 — Lossless Git Path Semantics

## Identity

- Phase: `PR-00B_R3_LOSSLESS_GIT_PATH_SEMANTICS`
- Predecessor SHA: `61743a35dea052b237f31bf8858d6aa4f9ed073e`
- Predecessor status: `CLOSED_FAIL_TARGETED_REREVIEW_CRITICAL_HIGH_FOUND`
- R2 remains immutable terminal failed history and is not reopened or claimed as passed.

## Surviving High

Git consumes a quoted Git config path ending in a space with that trailing
space intact, but `resolveGitConfigReference()` trims the value and
Smokestack fingerprints the no-space path instead. Git therefore consumes
resource A while the attestation binds resource B; mutating A can change
`git check-attr` and/or `git check-ignore` semantics while
`compareGitMetadataState(...).ok` remains true.

## Objective

Repair the path-binding implementation so the attested effective file path
denotes exactly the same resource Git consumes, preserving Git path semantics
losslessly after Git performs its own config/path expansion.

## Non-goals

- RH01 redesign
- RH03 redesign
- XDG redesign
- live qualification
- merge
- PR-01

## Required falsification regression

A deterministic zero-model test must use Git as the semantic oracle to prove
the inherited trailing-space mismatch: Git consumes the whitespace-bearing
resource, the inherited attestation binds a different normalized resource,
mutation of the consumed resource changes effective Git behavior, and the
old comparison incorrectly remains clean. The repaired regression must prove
that the same mutation changes the metadata attestation and that ordinary
unchanged supported configuration remains clean. The equivalence class must
cover quoted leading/trailing whitespace where Git preserves it, multiple
trailing spaces where supported, ordinary, absolute, relative, `%(prefix)`,
and `~/path` cases without inventing unsupported Git syntax, while retaining
existing XDG, include, symlink, size, and fail-closed protections.

## Lifecycle and review gate

This phase follows the bounded completion policy:

`IMPLEMENT -> TEST -> ONE independent hostile review -> fix genuine
Critical/High if required -> ONE targeted rereview only if C/H repair was
required -> CLOSE`

One independent hostile review is required after implementation. Medium/Low
findings do not restart the phase unless they undermine the frozen objective,
invalidate evidence, violate a frozen invariant, or create a fail-open or
fail-closed safety risk.

No live qualification, merge, PR-01, or independent review is performed in
this implementation run. The next gate after the draft PR is the reserved
independent hostile review.
