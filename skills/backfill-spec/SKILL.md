---
name: backfill-spec
description: Retroactively catch OpenSpec specs up after a small task was done without a change (no explore/propose/apply). Generates a minimal delta-only change from the work just done, validates it, then STOPS for review before the native archive merges it into main specs. Use when the user says "backfill the spec", "update the spec retroactively", "spec the thing I just did", "I skipped the change, fix the spec", or wants to avoid spec drift after a direct edit.
metadata:
  version: "1.0"
---

Catch the specs up to a task already implemented, without hand-editing main specs.

This skill exists because the safe spec-writing path is the native delta merge. Skipping the change lifecycle does NOT mean skipping the delta: it means collapsing propose → apply → archive into one retroactive pass where apply already happened (the code is done). The mechanism stays native, drift-safe, and leaves an audit trail in `openspec/changes/archive/`.

## Hard rule (read first)

**NEVER hand-edit `openspec/specs/<cap>/spec.md`.** Only `openspec archive` may write main specs: it converts `## ADDED/MODIFIED/REMOVED Requirements` deltas into proper `## Requirements` edits. Direct hand-editing is exactly what wrote delta headers into main specs in the source project and corrupted the spec tree (the archive protocol in `.claude/protocols/archive.md` and the spec-hygiene meta-suite exist because of it). You write a delta in a change dir; the CLI does the merge.

## Scope

Spec **only the task just finished**; no broad code-to-spec drift hunt. If the work turns out to be large, design-heavy, or needs alternatives weighed, STOP and tell the user to run the propose command instead. This skill is for small, well-defined, already-done tasks.

## Procedure

### 1. Reconstruct exactly what changed

Use this conversation's context first (what we just did), then ground it in git:
- `git diff` (unstaged) + `git diff --staged` for the current working tree
- `git log --oneline -10` and `git show <sha>` for the relevant recent commit(s)

Build a precise list of behaviour changed: new rules, changed numbers, new/removed entities, new invariants. **Verify every concrete value (number, enum, key, path) against the actual code. Do not trust memory or the conversation summary.**

### 2. Find the owning capability

- `ls openspec/specs` and grep specs for the affected symbols, keywords and filenames.
- Decide the delta op, conservatively:
  - existing spec already covers this behaviour → **MODIFIED** (or **REMOVED** if behaviour deleted)
  - genuinely new behaviour with no owning spec → **ADDED** (new `specs/<cap>/spec.md`, a new capability)
- Prefer modifying an existing requirement over inventing a new capability. A "new capability" for a one-line tweak is a smell; reread the existing specs.

### 3. Read the owning main spec(s) in full

Before writing a MODIFIED delta, read the current `### Requirement: <name>` text. The merge **replaces the whole requirement**, so your delta must restate the complete, updated requirement (header text matching the existing one exactly) plus at least one `#### Scenario:`.

### 4. Write the minimal change dir

`openspec/changes/<kebab-name>/` (verb-led name, e.g. `backfill-<thing>`):
- `proposal.md`: one short paragraph, what changed and why, noting it was implemented retroactively. Reference the commit sha(s).
- `specs/<cap>/spec.md`: the delta. `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements`, each requirement with full text and at least one `#### Scenario:` using WHEN/THEN bullets. Match the format of existing deltas.
- **Never use `## RENAMED Requirements`.** The OpenSpec CLI version used in the source project validated it but silently no-op'd it at merge (totals showed `→ 0`, header kept the old name; observed twice). Rename = REMOVED (old header, Reason/Migration lines) + ADDED (new header, body carried verbatim) in one delta; ADDED appends at the end of the main spec. Re-check with your CLI version.
- `tasks.md`: the tasks, **already checked** (`- [x]`), referencing the commit(s). They are done.
- No `design.md`. If you feel you need one, the task is too big for this skill (see Scope).

### 5. Validate

```bash
openspec validate <name> --strict
```

Fix any delta-format errors until it passes.

### 6. REVIEW GATE: stop here

Show the user: the change name, the delta requirement(s) (ADDED/MODIFIED/REMOVED + scenarios), and the validation result. **Do NOT archive yet.** Let the user eyeball the ADDED-vs-MODIFIED judgment and the requirement text. Wait for explicit go-ahead.

### 7. Archive (only after the user confirms)

```bash
openspec archive <name> -y
```

This is the only sanctioned main-spec writer. If it aborts with `target spec is structurally invalid`, a main spec already carries a delta header (pre-existing corruption): run the hygiene meta-suite, repair the named specs, re-run. **Never** `--skip-specs` to "get past" it; that silently drops the spec sync.

## Summary to display after archive

Change name, delta op(s), capability touched, spec-sync status (from the CLI's "Specs updated successfully" / "No delta specs" output).
