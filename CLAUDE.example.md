# CLAUDE.md — <project name>

Root instruction file. Budget: 30 KB / 200 lines, soft. When it is exceeded, the next change is a graduation pass (see `PLAYBOOK.md` § "When and how to update CLAUDE.md"), not ad-hoc condensation. Check with `wc -c CLAUDE.md`.

## Stance

Assume nothing. Verify every concrete value (number, path, enum, claim in a design doc) against the code before using it. When a pre-existing test fails, the production change is the suspect, not the test (`.claude/protocols/apply.md`). Say "I did not run this" rather than "verified".

## Project

<Two or three sentences: what the game is, engine version, target platforms, native extensions if any.>

Layout: `scripts/systems/<subsystem>/` domain code, `scripts/ui/`, `scripts/data/` resources, `scripts/tests/` suites, `scenes/tests/test_runner.tscn` registration, `openspec/` specs and changes, `docs/` plans and measured records, `.claude/` hooks, protocols and skills.

## Where knowledge lives (graduation ladder)

Every rule goes to the lowest rung that holds it. Root CLAUDE.md is the last resort, not the first.

1. **Test tripwire**: a deterministic property gets a `check()` in the matching `*_suite.gd`; the failure message is the documentation.
2. **Per-folder CLAUDE.md**: a rule scoped to one subsystem lives in `scripts/<area>/CLAUDE.md`, auto-loaded when working there. Root keeps one pointer line per file.
3. **Local comment**: one short line at the bug-prone call site, for engine quirks and measured workarounds only (see Comments).
4. **Root CLAUDE.md**: cross-cutting, non-testable, no single subsystem. Each line added here is declared against the ladder in the change's archive summary.

Behaviour → `openspec/specs/`. Workflows → `.claude/skills/`. Measured numbers → `docs/`. Harness auto-memory → nothing that has a repo home.

## Subsystem pointers

- Spell / ability system: see `scripts/systems/spell/CLAUDE.md` before changes.
- AI: see `scripts/systems/ai/CLAUDE.md`.
- Run / progression: see `scripts/systems/run/CLAUDE.md`.
- Tests: conventions in `scripts/tests/CLAUDE.md` (base API, static gates, balance-vs-behaviour policy).

## Comments

Default: no comments. Before writing one: rename, refactor, put the WHY in the OpenSpec proposal/design, put the invariant in the relevant CLAUDE.md, and only then one short local line. Never comment WHAT the code does, never reference the current task, never top-of-file design blocks.

## Test framework

Single Godot boot, suites under `scripts/tests/`, registered in `scenes/tests/test_runner.tscn`.

```bash
tools/test.sh | grep -E '^\[(FAIL|DONE)'   # the gate; never bare `grep FAIL`
tools/test.sh --import                      # force the reimport
tools/test.sh --only=SomeSuite              # never the green gate
```

`[DONE] a/b passed, T tests`: `a/b` counts checks, `T` counts registered tests and is the completeness signal. An engine ERROR during a run is a `[FAIL]`. Balance literals live in one snapshot suite; rule tests read fields from the resource, never mirror literals. Run the suite after each task group, not at the end of the change.

## OpenSpec loop

proposal → design → tasks → apply → verify → archive. Protocols injected by hook only when the apply / archive / verify commands run: `.claude/protocols/{apply,archive,verify}.md`, task-side rules in `openspec/config.yaml` → `rules.tasks`. These homes survive `openspec update`; the generated `.claude/commands/` and skills do not, so never put a project rule there.

Only `openspec archive` writes main specs. After an archive that created a spec: author its Purpose, `tools/spec_index.sh`, full suite.

## Git

Never push `main`; the user lands work there. The working tree is shared: never `checkout --` / `restore` / `stash` / `clean` a path the change did not author.

## Verification

Automated ladder then manual ladder: `.claude/skills/verify/SKILL.md`. UI-touching change = repro script for the user. Device numbers go to `docs/DEVICE_PERF.md`, probing method in `.claude/skills/device-drive/SKILL.md`.

## Releases

<Your release recipe pointer: version bump locations, notes guard, tag format.>
