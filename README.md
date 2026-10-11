# jigs

A jig holds the work and guides the tool so the cut comes out the same every time. This repository is a set of jigs for building a Godot game with a coding agent: Claude Code hooks that inject an anti-drift protocol only at the moments it matters, meta-tests that check the tests and the specs rather than the game, a spec-first loop built on [OpenSpec](https://github.com/Fission-AI/OpenSpec), skills for verifying on a real phone and for running implementer subagents in worktrees, and a written playbook that says when each one applies. It was extracted from a private Godot mobile game built fully agentically by one person over seven months. At the time of extraction that project had 1,618 commits, 4 tagged releases on two stores, 796 archived OpenSpec changes merged into about 525 specs, and 259 test suites (5,813 test functions) running in one headless boot on every push, 16 of them meta-suites. None of that proves the kit is right; it proves it was used.

## What is inside

| Path | What it is |
|---|---|
| `PLAYBOOK.md` | The doctrine: unit test vs meta-test vs tripwire, the anti-drift protocol, the OpenSpec loop and what each hook does, CLAUDE.md graduation rules and the budget failure, device verification, parallel apply, a bootstrap checklist. Read this first. |
| `hooks/protocol_inject.py` | `UserPromptExpansion` hook. Injects `protocols/apply.md`, `archive.md` or `verify.md` as context only when the matching OpenSpec command runs. Zero always-on cost. |
| `hooks/archive_spec_check.py` | `PostToolUse` hook on Bash. After `openspec archive`, scans for specs with a placeholder Purpose or missing from the index and injects a blocking reminder. |
| `hooks/protocols/` | The Drift Protocol (apply), the native-merge archive protocol, the verify gates. Placeholders in angle brackets. |
| `hooks/settings.example.json` | How to register both hooks and allow the read-only OpenSpec commands. |
| `skills/verify` | Automated ladder (full suite, suite test, headless boot smoke, scene drive) then manual ladder (repro script for the user). |
| `skills/backfill-spec` | Catch specs up after a direct edit, through a delta and the native archive, with a review gate. |
| `skills/parallel-apply` | One implementer subagent per change in its own worktree, main-thread review, sequential cherry-pick; dated gotchas including measured model-choice cost. |
| `skills/tech-audit` | Runtime-discovered, exhaustive-by-construction audit with an orthogonal dependency/seam agent. |
| `skills/device-drive` | Android over adb: dev APK, screenshot-and-tap navigation, logcat, save protection, A/B "before" build, stall bisection with shadow marks. |
| `scripts/test.sh` | The one test command: per-path lock, throwaway `$HOME`, import-if-stale, `--quiet`, `[FAIL]`/`[DONE]` grep contract. |
| `scripts/spec_index.sh` | Regenerates `openspec/specs/INDEX.md` from each spec's Purpose line. |
| `tests/meta/` | Minimal runner plus two runnable meta-suites: test registration, spec index freshness. README explains how to adapt. |
| `openspec/config.example.yaml` | The `rules.tasks` mechanism: pre-enumerate test, snapshot and CLAUDE.md edits at planning time so they are pre-authorised at apply time. |
| `CLAUDE.example.md` | A lean root CLAUDE.md template (under 8 KB) carrying the graduation ladder and the budget. |

## Prerequisites

- Godot 4.x on the PATH as `godot` (or set `GODOT`).
- [OpenSpec](https://github.com/Fission-AI/OpenSpec), a third-party spec-driven workflow CLI. The hooks match its command names and its `openspec archive` behaviour; the protocols record edge cases observed with the version in use during 2026 and say so. Re-check them against yours.
- Claude Code with hooks enabled. The hook events used are `UserPromptExpansion` (with `command_name` in the payload) and `PostToolUse`.
- Python 3 for the hooks, `adb` for the device skill.

## Install in a Godot project

```bash
KIT=/path/to/this/repo
mkdir -p .claude/hooks .claude/protocols .claude/skills tools
cp $KIT/hooks/*.py .claude/hooks/
cp $KIT/hooks/protocols/*.md .claude/protocols/
cp -R $KIT/skills/* .claude/skills/
cp $KIT/scripts/test.sh $KIT/scripts/spec_index.sh tools/ && chmod +x tools/*.sh
cp $KIT/openspec/config.example.yaml openspec/config.yaml   # after `openspec init`
cp $KIT/CLAUDE.example.md CLAUDE.md                          # or merge into yours
```

Then:

1. Merge `hooks/settings.example.json` into `.claude/settings.json`. The hook commands use `$CLAUDE_PROJECT_DIR`, so the paths above work as-is.
2. Replace the angle-bracket placeholders in `.claude/protocols/*.md` (`<TEST_COMMAND>`, `<TEST_RUNNER_SCENE>`, `<SPEC_INDEX_TOOL>`), and set `TEST_SCENE` for `tools/test.sh` if your runner is not at `res://scenes/tests/test_runner.tscn`.
3. Copy `tests/meta/*.gd` into your suites folder, set `SUITE_DIR`, and register both suites in your runner scene (see `tests/meta/README.md`). If you have no runner yet, `tests/meta/test_runner.gd` and `.tscn` are a working minimum.
4. Run one change through propose → apply → verify → archive and check `.claude/hooks/protocol_inject.log` shows three fires. Delete a test registration on purpose and watch the registration suite fail. Installed.

Nothing here is Godot-specific except `tests/meta`, `scripts/test.sh` and the two device/verify skills; the hooks, protocols, `rules.tasks`, `backfill-spec`, `parallel-apply` and `tech-audit` apply to any project that uses Claude Code and OpenSpec.

## What failed

Read these before trusting the rest.

**The CLAUDE.md budget did not hold.** In May 2026 a graduation pass cut root CLAUDE.md from 51.5 KB to 30 KB and set a soft budget of 30 KB / 200 lines, with a ladder for moving rules into tests and per-folder files. At extraction root CLAUDE.md was 162 KB and 371 lines, with one line of 16,700 characters; the per-folder files had grown the same way, the largest to 177 KB. The per-change audit checklist had been appended to a generated command file that `openspec update` regenerates, and no trace of it remained; the budget had no sensor; a second graduation pass was never scheduled. The playbook's section 4 is written from that failure, and the kit now puts the ladder in a surface that survives regeneration and recommends a `wc -c` meta-test from day one.

**No agent step in CI.** The workflows build, bake, import and run the suite on every push, and ship to the two stores on dispatch. No flaky-test triage, no dependency review, no assisted code review runs in CI. Everything agentic happened in interactive sessions.

**No velocity or quality measurement.** The only numbers the project recorded are device performance figures and the token/time costs in the parallel-apply skill. There is no measure of how much faster or slower this workflow is than not having it, nor of defect rates with and without the protocol. The protocol's trigger list and the "compliance theatre" paragraph were written after observed incidents, but those incidents were not counted.

**Solo project.** One developer, one agent, one shared working tree. Nothing here has been tested with a team: no review of agent output by a second human, no concurrent human edits except the author's own, no onboarding of someone who did not write the rules.

## Licence

MIT. See `LICENSE`.
