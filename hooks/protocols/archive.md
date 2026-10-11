# Archive Protocol — native merge only

(Injected by the `UserPromptExpansion` hook only when the OpenSpec archive command runs.)

**This supersedes the generated archive command/skill steps wherever they conflict.** Generated OpenSpec instructions may describe a hand-rolled flow (`mkdir openspec/changes/archive`, an agent-driven "sync specs" step, a manual `mv`). Ignore those steps. In the source project they are exactly what wrote `## ADDED Requirements` headers into main specs and corrupted the spec tree; a meta-suite now tripwires that corruption.

**The only correct archive is the native CLI:**

```bash
openspec archive "<name>" -y
```

This one command validates the change, **merges** each delta spec into its main spec at `openspec/specs/<capability>/spec.md` (turning `## ADDED/MODIFIED/REMOVED Requirements` deltas into edits of the canonical `## Requirements` section), and moves `openspec/changes/<name>` → `openspec/changes/archive/YYYY-MM-DD-<name>`. `-y` skips the confirmation prompt.

**DO NOT** copy delta spec files into `openspec/specs/` by hand or via a subagent, do not invoke any "sync specs" skill, and do not `mkdir`/`mv` the change yourself. Only `openspec archive` (or `openspec spec`) may write main specs.

## CLI behaviours observed in the source project (re-check against your OpenSpec version)

- **RENAMED ops silently no-op at merge.** The CLI validated `## RENAMED Requirements` deltas but never applied them: the archive totals showed `→ 0` and the main-spec header kept the old name (observed twice, 2026-07). Ship a rename as **REMOVED (old header, with Reason/Migration) + ADDED (new header, body carried verbatim)** in one delta, and check the totals line after every archive that renames. ADDED appends at the end of the main spec, so the requirement moves position; acceptable.
- **The CLI could not express capability retirement, and its abort message lied.** A delta that REMOVES every requirement of a capability rebuilt to an empty spec and aborted with `Spec must have at least one requirement`. `Aborted. No files were changed.` was false: every spec merged before the failing one was already on disk. Always `git status openspec/specs/` after an abort and revert partial writes before retrying. Workaround used: revert partial writes, `rm -rf openspec/specs/<retired-cap>`, move the retirement delta out of the change to a scratch dir, archive, move the delta back into the archived change so the Reason/Migration record ships, regenerate the index.
- **If the command aborts with `target spec is structurally invalid`**, a main spec already carries a delta header (pre-existing corruption). Run the hygiene meta-suite, repair the named specs, re-run the archive. Never bypass with `--skip-specs` "to get past it": that silently drops the spec sync.

## Gates around the archive

**Pre-archive doc-sync check.** Before running the archiver, answer: did this change alter behaviour documented in root `CLAUDE.md` or any per-folder `CLAUDE.md` (new system, changed invariant, now-false claim)? If yes and the docs were not updated during apply, update them NOW. Post-apply / pre-archive is the sanctioned window; mid-apply edits are Drift-Protocol-gated. Precedent for this gate: a change archived while root CLAUDE.md still claimed a feature "is not implemented yet"; the stale claim survived until a manual audit months later.

**Post-archive spec hygiene: created specs ship broken.** Whenever the CLI's "Specs to update" list shows a `create` line, the new main spec is written with a placeholder Purpose (`TBD - created by archiving change ...`) and is NOT added to `openspec/specs/INDEX.md`. After every archive that created a spec:

1. Author a one-line Purpose in each created `spec.md` (style: "Defines the X: key mechanics, seams, invariants.").
2. Run `<SPEC_INDEX_TOOL>` (e.g. `tools/spec_index.sh`) to regenerate the index.
3. Run `<TEST_COMMAND>` before reporting done. The archive is not complete while the spec-index suite fails.

A `PostToolUse` hook (`.claude/hooks/archive_spec_check.py`) scans for leftover TBD Purposes / unindexed specs after any `openspec archive` call and injects a reminder. Treat its output as a blocking to-do, not advice.

**Summary to display:** change name, archive location, spec sync status (from the CLI's "Specs to update" / "Specs updated successfully" output, or "No delta specs"), any incomplete-artifact or task warnings, the doc-sync outcome (updated / not needed), and the created-spec hygiene outcome (Purposes authored + index regenerated / no created specs).
