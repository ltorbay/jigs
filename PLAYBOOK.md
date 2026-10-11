# Playbook: testing and guardrails for an agent-built Godot project

This is the doctrine behind the files in this repository, distilled from how one private Godot game was actually built over seven months with Claude Code and OpenSpec. Every claim below comes from reading that project at the commit named in the README; where something is an inference rather than an observation, it says so.

The woodworking metaphor is deliberate. A jig does not make the cut; it holds the work so that a tool, in anyone's hands, cuts the same way twice. The hooks, protocols and meta-suites here hold the agent the same way. None of them replaces judgment. They make the places where judgment fails loud.

## 1. Unit test, meta-test or tripwire?

Three kinds of check, three different questions.

**A unit test asks "does the game do the right thing?"** It lives in a `*_suite.gd`, builds a fixture and asserts behaviour: rules, propagation, interactions. The source project's conventions are worth copying: assert behaviour, not balance (a damage number read from a shipped resource is asserted through the field, `hp_before - punch.damage`, never through the literal `2`); reference code constants directly; when a test reads both input and expected output from the same resource, add a combination or boundary assertion so a typo in that resource still fails somewhere.

**A meta-test asks "are the tests and specs themselves intact?"** It scans sources, not behaviour. The source project had sixteen at extraction; two ship here. `TestRegistrationSuite` parses every suite file for a `func test_*` absent from `get_tests()`, because an unregistered test never runs and the suite stays green. `SpecIndexSuite` checks that every spec has an authored Purpose and that the generated index matches. Others in the project: a snapshot suite holding every balance literal in one dictionary so a retune is a two-file diff; a suite that greps test sources for a real resource preloaded but asserted against a literal; one that checks no main spec carries a delta header; several that check a mute flag is written only under `scripts/tests/`.

**A tripwire is a cheap check that fires when the agent drifts.** An agent under pressure to reach green has a short list of moves cheaper than fixing production code: weaken an assertion (`check_eq` to `check`), delete the failing test, remove the suite from the runner scene, append to a `SKIP_*` / `ALLOWLIST` dictionary, edit `CLAUDE.md` so the rule no longer says what the code violates, edit the proposal mid-implementation so the spec matches what got built. Every one is legal code, invisible to a behaviour test, and leaves the run green. A tripwire is whatever makes it visible: a source scan, a `[DONE] ... T tests` count that only moves when a test is registered or removed, a runner that reports a suite which failed to compile instead of skipping it, or a protocol that names the move and demands a quote before it is made.

Rule of thumb: when you write the same gotcha into CLAUDE.md for the second time, it wants to be a meta-test. Two of the sixteen were born that way during a graduation pass, each confirmed by mutating the property and watching the suite fail before the prose was deleted.

## 2. The anti-drift protocol

The full text is `hooks/protocols/apply.md`. The parts that carry the weight:

**Default hypothesis: production is wrong, not the test.** A pre-existing test that fails after a change is treated as evidence about the change. The agent justifies the production diff first and may consider the test stale only after that diff is defensible on its own. "The spec mentions this area changes" is explicitly ruled out as justification; it is the beginning of a question.

**A closed trigger list.** Editing or deleting a pre-existing test, weakening an assertion, removing a suite from the runner, widening a meta-suite allowlist, editing the change's own proposal/design/spec deltas mid-apply, editing any CLAUDE.md mid-apply. Each is "a blocker, not a unilateral move".

**Bypass only by quotation with a path and line.** The one sentence the agent must write before a trigger action: *this artifact asserts X; the change modifies X because the proposal says "<verbatim phrase>" (path:line)*. The protocol then closes the loopholes it had seen used: a file pointer is not a quote, a summary is not a quote, a topic match is not a quote. The named failure mode is "compliance theatre": a plausible citation that maps to no sentence. When the quote feels forced, ask; do not soften the quote.

**Pre-authorisation in `tasks.md`.** This is the half that makes the protocol livable. `openspec/config.yaml` → `rules.tasks` requires that the tasks name every pre-existing test that will legitimately change (by file and method), every snapshot dictionary that will be retuned, and every CLAUDE.md section that will be updated. Anything named is pre-authorised at apply time; anything not named falls under the quote rule. The decision "this test will change" is made with the proposal open and the suite green, not with a red suite and a model hunting for the shortest path. Tests written during the apply iterate freely; the rule targets only what was on the branch when apply began.

The injection mechanism matters as much as the text. The protocol is not in CLAUDE.md: a `UserPromptExpansion` hook injects it only when the apply, archive or verify command expands, so it costs nothing on other turns and arrives exactly when the trigger list is relevant. The hook appends one line per fire to a gitignored log, which is how you check it actually fired.

## 3. The spec-first loop with OpenSpec

[OpenSpec](https://github.com/Fission-AI/OpenSpec) is a third-party CLI; this kit assumes it and adds guardrails around it. Over the source project's life it ran 796 archived changes merged into roughly 525 main specs, so the loop below was exercised a few times a day for seven months.

**Propose.** The agent writes `openspec/changes/<name>/` with `proposal.md`, `design.md` (decisions, rejected alternatives, context read from the code), `tasks.md` and spec deltas under `specs/<capability>/spec.md` using `## ADDED / MODIFIED / REMOVED Requirements` headers. `rules.tasks` shapes the tasks as described above. No hook fires here.

**Apply.** The apply command expands; the hook injects the Drift Protocol. The agent implements task by task and runs the full suite after each task group ("a failure surfaced five tasks late is five tasks of suspects"). `tools/test.sh` gives it one command and one grep.

**Verify.** The hook injects the verify gates: run the suite, never infer coverage from grep; UI-touching diffs need a repro script for the user; list every CLAUDE.md section the change falsified; every "implemented" verdict cites `file:line`. This is where CLAUDE.md debt is meant to surface, because the apply-time protocol blocks unplanned doc edits.

**Archive.** The hook injects the archive protocol: `openspec archive <name> -y` is the only writer of main specs, preceded by a doc-sync check (update any CLAUDE.md the change falsified; this is the sanctioned window) and annotated with the known CLI edges (renames silently no-op, retirement aborts with a false "no files changed"). After the Bash call returns, the `PostToolUse` hook scans `openspec/specs/` and, if the archive created a spec with a placeholder Purpose or left the index stale, injects a blocking reminder. The agent authors the Purpose, runs `tools/spec_index.sh`, runs the suite. `SpecIndexSuite` is the backstop if it does not.

**Backfill.** When a small task was done directly, the `backfill-spec` skill collapses the loop into one retroactive pass: reconstruct from `git diff`, write a delta-only change, validate, stop for review, then native archive. Same mechanism, same audit trail.

One lesson sits in the archive protocol: the generated instructions once described a hand-rolled merge (copy deltas into main specs); doing that wrote delta headers into the canonical tree and needed a repair pass. The protocol now overrides the generated text, a meta-suite fails on any delta header in a main spec, and the CLI's own edges live in the protocol injected at archive time, not in root CLAUDE.md.

## 4. When and how to update CLAUDE.md

The source project formalised this as an OpenSpec capability in May 2026 after root CLAUDE.md had grown 27:1 over two weeks (55 small additions against 2 condensation passes). The rule set:

**The graduation ladder.** A rule lives at the lowest rung that holds it: (1) a test tripwire, where the failure message is the documentation; (2) a per-folder `CLAUDE.md` under the subsystem's directory, auto-loaded by Claude Code when work happens there, with root keeping one pointer line; (3) a one-line local comment at the bug-prone call site; (4) root `CLAUDE.md`, for genuinely cross-cutting, non-testable rules only. A rule may live at several rungs; the ladder defines the minimum surface needed to drop it from root.

**Test-first migration.** When prose graduates to a test: write or locate the assertion, run it green, mutate the property and watch it fail, and only then delete the prose. Never the other order; the unprotected window must be zero.

**Per-change audit.** Every archive that adds lines to root CLAUDE.md declares each line's rung; rungs 1 to 3 are relocated before the archive completes.

**A soft budget.** 30 KB / 200 lines on root. Exceeding it triggers a dedicated single-subsystem graduation pass, not ad-hoc condensation. The design explicitly rejected a hard cap ("invites gaming: compress prose, lose nuance") and programmatic enforcement ("too rigid for a discipline still being learned"), leaving a CI `wc -c` check as an open question.

**What belongs elsewhere.** The project's own rule, from its memory section: invariants and gotchas go to the CLAUDE.md hierarchy; behaviour goes to OpenSpec specs; enforcement goes to tripwire tests; plans and measured records go to `docs/`; workflows (how to verify, how to drive the phone, how to run parallel agents) go to skills. The harness's auto-memory gets only what has no repo home. A good test for a candidate CLAUDE.md line: if it describes a procedure, it is a skill; if it describes what the system must do, it is a spec; if it is a number someone measured, it is a doc; if it can fail a test, it is a test.

**The honest lesson.** The first graduation pass worked: root went from 232 lines / 51.5 KB to 202 lines / 30 KB, two tripwire tests were added and mutation-checked, nine narrative rules moved to the subsystem file. Then no second pass was ever archived. Root CLAUDE.md read 41.5 KB at the end of June, 43.6 KB in early August, 72.8 KB at the end of August, 102 KB mid-September, 132 KB at the end of September and 162 KB / 371 lines at extraction, with one line of 16,700 characters; the thirteen per-folder files had grown the same way, the largest to 177 KB. Three mechanisms failed at once, and the first is the one to design against. The per-change audit checklist had been appended to the generated archive command file, the one surface `openspec update` regenerates; at extraction no generated command or skill mentions it, so the forcing function was lost (that it was lost on regeneration is inferred; that it is gone is observed). Second, the budget was a signal with no sensor: nothing measured `wc -c` and nothing fired. Third, the soft trigger required someone to choose a graduation pass over the next feature, and a solo developer shipping releases never did. The kit's `CLAUDE.example.md` therefore puts the ladder and the budget in root itself, `rules.tasks` restates the ladder at task-authoring time (a surface that survives regeneration), and the recommendation is to add the `wc -c` check to the meta-suite on day one.

## 5. Verifying on real devices

**Headless boot for everything automatable.** The entire suite runs in one `godot --headless --run-scene` boot through `tools/test.sh`, locally and in CI on every push (build the native extension, bake derived assets, import, run the runner under a five-minute timeout). The wrapper's details were all earned: a per-project-path lock so a second run's orphan cleanup does not kill the first; a throwaway `$HOME` so `user://` saves are per-checkout; an mtime heuristic that reimports only when the checkout changed. The `verify` skill adds a boot smoke (`--quit-after 600`, grep for `SCRIPT ERROR` and `Parse Error`) because a short quit produces random parse errors from cancelled threaded loads that look like broken content.

**Know what headless cannot see.** The runner flips static gates (animations, pacing, passive saves, time scale ×10) and the headless renderer is a dummy: no shader compile, no driver, no glyph rasterisation. So verification has an automated ladder and a manual one, and the manual one ends with a repro script handed to the user (entry point, steps, one checkable observation) and the instruction to wait for the report.

**Drive the physical phone.** The `device-drive` skill is the generic form of what the agent did over adb: install a dev APK, cold-launch, screenshot and tap (never from memory; layout shifts with state), read the engine's `print()` from logcat, back up and restore saves through `run-as`, build a "before" APK from HEAD in a detached worktree for A/B runs, script the proven path. The probing method is a bisection: read the trace the build already prints, shadow-mark the deferred queue (a `call_deferred` mark at the end of a phase runs after everything that phase queued), split tree entry with `_enter_tree` marks, confirm with a removal test. Every probe line is tagged `# PROBE` so the revert is one checkout. Cold needs three launches minimum (five over adb; first-launch costs varied 3× on the reference phone), and "cold" has two depths, process-cold and driver-cold, since the shader cache survives a kill.

**Write the numbers down.** The project's `docs/DEVICE_PERF.md` is dated by investigation, names device, build and commit, and keeps a "ruled out (measured, cheap)" table next to each finding, a "remaining budget" breakdown and a "candidates for the next optimisation, by measured size" list, so the next optimisation starts from facts instead of re-probing. The one fix recorded there (a debug overlay instanced in every build, costing up to a second on the first combat of a process) was found by removal test and shipped as its own change; the probe never became the fix.

## 6. Parallel apply with worktree subagents

The `parallel-apply` skill is a record of four runs (July to October 2026), each gotcha dated. What generalises:

- Create worktrees yourself off a prep commit that includes the normally-untracked change directories; the tool's built-in isolation forks from the session-start snapshot and cannot see an in-session commit.
- Run the baseline on main before spawning and name every pre-existing failure in every brief; nine agents once independently diagnosed the same stale failure to prove their innocence. One checkout imports at a time; a concurrent first import produced about twenty spurious failures.
- The runner scene is the guaranteed merge conflict; string `ext_resource` ids equal to the suite basename, appended last, reduce it to a both-keep hunk.
- Model choice is measured, not assumed: on 2 October 2026 the cheaper model on the easiest change produced three test-quality defects and a fix round at ~400k tokens / 53 min; the larger model on two harder changes produced none, caught a wrong design claim and a spec test that could not fail, at 327k / 48 min and 418k / 41 min. The cheaper model was not cheaper.
- The main thread reviews every branch diff itself before anything lands, asking of each new test "would this pass with the production line reverted". No reviewer subagents: they lack the cross-change context. Fixes route back through the original agent; a worktree patched from the main thread leaves its transcript stale.
- N = 1 is the common case: the value is the implementer-in-worktree plus main-thread-review gate, not the parallelism.

## 7. Bootstrapping a new Godot project with this kit

1. Install OpenSpec and run its init in the project; copy `openspec/config.example.yaml` to `openspec/config.yaml` and keep the three `rules.tasks` entries.
2. Copy `hooks/*.py` to `.claude/hooks/`, `hooks/protocols/` to `.claude/protocols/`, and merge `hooks/settings.example.json` into `.claude/settings.json`. Replace `<TEST_COMMAND>`, `<TEST_RUNNER_SCENE>` and `<SPEC_INDEX_TOOL>` in the protocols.
3. Copy `scripts/test.sh` and `scripts/spec_index.sh` to `tools/`; set `TEST_SCENE`. Run `tools/spec_index.sh` once.
4. Copy `tests/meta/` into your test folder, point `SUITE_DIR` at it, register both suites in your runner scene. Add a `wc -c CLAUDE.md` budget check as a third suite.
5. Copy the skills you will use into `.claude/skills/`; fill in the placeholders in `verify` (your scenario launcher, your runner's static gates) and `device-drive` (package id read from the export preset, launcher activity).
6. Start root `CLAUDE.md` from `CLAUDE.example.md`. Create the first per-folder `CLAUDE.md` the first time a subsystem rule appears.
7. Run one trivial change through propose → apply → verify → archive and check `.claude/hooks/protocol_inject.log` shows three fires. Then delete a test registration on purpose and watch `TestRegistrationSuite` fail. The kit is installed when both happen.
