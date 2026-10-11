---
name: verify
description: Project verify recipe for a Godot game. Exercise a change end-to-end in the real game, not just tests or typecheck. Use before committing any nontrivial change, whenever the root CLAUDE.md rule "manual verify if UI-touching" fires, or when asked to confirm a change actually works. Covers the automated ladder (full suite, a suite test that drives the changed path, headless boot smoke, scripted scene drive) and the manual ladder (a repro script for the user).
metadata:
  version: "1.0"
---

Verification has two ladders. Climb the automated one as far as it reaches, then hand the user a precise manual script for what only eyes can confirm. Never claim "verified" for a rung you did not run.

## Automated ladder

### 1. Full suite (always)

```bash
tools/test.sh | grep -E '^\[(FAIL|DONE)'
```

`--no-import` only when nothing but data resources changed. This rung is necessary, never sufficient: suites pin rules, not the flow you just changed.

### 2. Exercise the change through a suite test

If no existing test drives the changed path, write one in the matching `*_suite.gd` (conventions: `scripts/tests/CLAUDE.md`). Prefer keeping it as a permanent tripwire; delete it only if it asserts nothing durable.

Know what the runner environment turns off. A test runner typically flips static gates (animations skipped, passive saves suppressed, input commit windows skipped, pacing disabled, time scale raised). Anything behind those gates (animation timing, save writes, touch arbitration) is NOT exercised by any suite. List those gates in `scripts/tests/CLAUDE.md` and read that list before claiming coverage.

### 3. Headless boot smoke

Catches parse errors, broken preloads and autoload failures that compile-time misses:

```bash
godot --headless --path . --quit-after 600 2>&1 | grep -iE 'error|warning' | head -30
```

Expect zero `SCRIPT ERROR` and zero `Parse Error` lines; `ObjectDB instances leaked` and `N resources still in use at exit` are the engine's usual exit noise.

Keep the frame count high (600 frames is about 6 s). If the main menu starts threaded loads, quitting early makes `ResourceLoader::clear_thread_load_tasks` fail every in-flight dependency: each parent then prints `<path>.tres:<line> - Parse Error: .` (empty message) plus `Failed loading resource`, a different random set per run. That is a shutdown artifact, not broken content; `--quit-after 5` produced it every time in the source project.

### 4. Scripted scene drive (logic with runtime wiring)

For flows that need a real scene tree but no eyes (signal wiring, phase transitions), a temporary suite test is still the best harness: it runs with autoloads and factories. Do NOT drive gameplay via `godot --script` scratch files: autoloads do not load there, so anything touching them fails to compile. If you must boot the real game outside the runner, guard the user's save first (suppress passive saves; never delete files under `user://`).

## Manual ladder (UI, visuals, feel)

You cannot see the screen. When the change is visual, layout, animation or feel, produce a **repro script for the user**, exact and minimal:

1. **Pick the entry point.** A scenario launcher or debug workbench that boots a specific encounter/screen with a seed beats "play until you reach it". Name the scene path and the tab. For run-flow changes, normal boot; mention any debug flag that skips a funnel (tutorial, onboarding). For visuals, point at a hand-authored fixture scene if one exists as ground truth.
2. **State the expected observation** as a checkable sentence ("the companion acts after enemies, before your next turn"), plus the failure symptom if you know it.
3. **Wait for their report** before declaring the change verified. Suggest `! <command>` for any shell step so output lands in the conversation.

## Adapting

Replace `tools/test.sh` with your wrapper, name your runner's static gates in `scripts/tests/CLAUDE.md`, and name your scenario launcher / fixture scenes in step 1 of the manual ladder. Keep the rule "never claim verified for a rung you did not run" verbatim.
