# Drift Protocol — apply-time anti-laundering contract

(Injected by the `UserPromptExpansion` hook only when the OpenSpec apply command runs; see `.claude/settings.json` and `.claude/hooks/protocol_inject.py`. The task-authoring counterpart lives in `openspec/config.yaml` → `rules.tasks`.)

Failing tests, spec deltas and CLAUDE.md are the project's executable record of intent. Editing one to make a step "pass" is editing the spec, with the same gravity as retuning shipped data.

**Default hypothesis when a pre-existing test fails: the production change has a defect. Not the test.** Justify the production change first; only consider the test stale after the production diff is independently defensible. "The spec mentions this area changes" is not justification; it is the start of a question.

**Trigger list. Any of these is a blocker, not a unilateral move:**
- Editing the assertion of a pre-existing test.
- Deleting a pre-existing test.
- Weakening an assertion (`check_eq` → `check`, dropping a sub-assertion, loosening a boundary).
- Removing a suite from the test runner's registration (`<TEST_RUNNER_SCENE>`, e.g. `scenes/tests/test_runner.tscn`).
- Appending to any `SKIP_*` / `EXCLUDE_*` / `ALLOWED_*` / `ALLOWLIST` entry in a meta-suite.
- Editing files under `openspec/changes/<name>/specs/`, or the change's `proposal.md` / `design.md`, mid-apply.
- Editing root `CLAUDE.md` or any per-folder `CLAUDE.md` mid-apply.

**Bypass requires a quoted-phrase justification.** Before taking any trigger action, write one sentence of the form:

> This test/list/artifact asserts <X>; the change modifies <X> because the proposal says: "<exact quoted phrase from proposal/spec/design/tasks>" (`<path>:<line>`).

If you cannot locate a verbatim phrase that names the changed behaviour, the action is not authorised. Stop and ask.

**The quote requirement is load-bearing. Do not route around it.** A file pointer (`per proposal.md`) is not a quote. A summary (`the X system is being reworked`) is not a quote. A topic match (`the proposal covers this area`) is not a quote. The failure mode this rule prevents is compliance theatre: generating plausible-sounding citations that do not map to a sentence in the artifact, then proceeding anyway. If the quote feels forced or generic, the action is unjustified; that is the signal to ask, not to soften the quote.

**Pre-enumerated edits are pre-authorised.** Tests named in `tasks.md` by file and method (e.g. `4.9 Update test_foo_unchanged_after_bar in scripts/tests/foo_suite.gd for the new flow`) need no quoted-phrase justification at apply time. Tests NOT enumerated fall under the bypass rule. The same holds for data/snapshot edits: if `tasks.md` lists the data files and the snapshot-suite dictionaries to update, those edits are a pre-authorised two-file diff.

**Scope of "pre-existing".** A test, list entry or artifact is pre-existing if it was on the branch before apply began for this change. Tests authored *during* the apply (per the change's tasks) are not pre-existing and iterate freely.

**Test cadence.** Run `<TEST_COMMAND> | grep -E '^\[(FAIL|DONE)'` after each task or tight task group. Do not batch the first suite run to the end of the change: a failure surfaced five tasks late is five tasks of suspects.

**CLAUDE.md edits named in tasks.md are pre-authorised.** The mid-apply CLAUDE.md trigger gates *unplanned* edits. A task naming the exact CLAUDE.md file and section to update (typically the change's final task) is its own authorisation. If the change alters a documented invariant and `tasks.md` schedules no such task, flag it during apply rather than silently skipping the doc update.
