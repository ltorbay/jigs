# tests/meta — a runnable example meta-suite

Two tripwires that test the tests and the specs, not the game, on a minimal copy of the runner contract the source project uses (single headless boot, explicit registration, `[FAIL]`/`[DONE]` output).

| File | Role |
|---|---|
| `test_suite.gd` | Base class: `get_tests()`, `is_async()`, `check()`, `check_eq()`, sealed-suite detection. |
| `test_runner.gd` | Runs every `TestSuite` child, prints `[SUITE]` / `[FAIL]` / `[DONE]`, flags a child whose script failed to compile, exits 1 on any failure. |
| `test_runner.tscn` | Registration: one child node per suite, string `ext_resource` ids equal to the suite basename (so parallel branches adding suites conflict as a both-keep hunk). |
| `test_registration_suite.gd` | Scans every `*_suite.gd` for a `func test_*` missing from `get_tests()`. Parser is pure and self-tested. |
| `spec_index_suite.gd` | Every `openspec/specs/*/spec.md` has an authored Purpose; `INDEX.md` matches, nothing missing or stale. |

## Run it

Copy `tests/meta/` into a Godot 4 project (the suites need autoload-free scripts only) and run:

```bash
godot --headless --path . --run-scene res://tests/meta/test_runner.tscn -- --quiet
```

Expected on a project with an `openspec/specs` tree and a fresh `tools/spec_index.sh` run: `[DONE] N/N passed, 6 tests`. Without an `openspec/` tree the spec-index suite fails on purpose (missing index): that failure is the tripwire working.

## Adapt it

1. Move the suites to your own folder (`scripts/tests/` in the source project) and set `SUITE_DIR` in `test_registration_suite.gd` to it. Update the three paths in `test_runner.tscn`.
2. If you already have a `TestSuite` / `TestRunner` `class_name`, keep yours and port only the two suites; the only API they need is `check` / `check_eq` / `get_tests`.
3. Add every new suite to `test_runner.tscn` as the last `ext_resource` and last node, `load_steps` untouched.
4. Wire `scripts/test.sh` as `tools/test.sh` with `TEST_SCENE` pointing at your runner, and grep its output with `grep -E '^\[(FAIL|DONE)'`.
5. Write more meta-suites in the same shape when a rule is worth more than a sentence in CLAUDE.md. Shapes that paid off in the source project: a snapshot suite that holds every balance literal in one place (so a retune is a two-file diff), a suite that greps test sources for a real resource preloaded but asserted against a literal, a suite that checks no main spec carries a delta header, a suite that checks a mute flag is written only under `scripts/tests/`.

## What the source project's runner adds (not ported, worth knowing)

- An `OS.add_logger` sink installed for the run: any engine `ERROR` or `SCRIPT ERROR` during a test is a `[FAIL]` attributed to that test and folded into the exit code. A GDScript runtime error aborts only the function it fires in, so without this a test could lose half its assertions and still print green.
- A per-test mute flag for deliberately provoked errors, cleared by the runner after every test so a bracket cannot become a standing allowlist.
- Static gates flipped for the run (animations skipped, pacing off, passive saves suppressed, `Engine.time_scale` raised with the low-processor frame sleep zeroed), saved in `_ready` and restored in `_exit_tree`.
- `--only=<Suite>` filtering, with the rule that a filtered run is never the green gate.
