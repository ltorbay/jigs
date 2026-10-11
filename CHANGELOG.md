# Changelog

## 0.2.0

- `tests/meta/claude_md_budget_suite.gd`: root CLAUDE.md budget sensor (30 KB / 200 lines), with a self-tested pure measurement. Registered in the example runner; README, PLAYBOOK and `CLAUDE.example.md` updated. Mutation-checked: 165 KB, 371 lines and a missing file each fail; exactly 30,720 bytes / 200 lines passes.
- Drift Protocol (`hooks/protocols/apply.md`): raising a `MAX_*` budget constant in a meta-suite is now a listed trigger.

## 0.1.0 – initial extraction from a private project at commit b96e27b9

- Hooks: on-demand protocol injection (apply / archive / verify), post-archive spec hygiene check, example `settings.json`.
- Protocols: Drift Protocol (apply), native-merge archive protocol, verify gates.
- Skills: `verify`, `backfill-spec`, `parallel-apply`, `tech-audit`, `device-drive`.
- Scripts: `test.sh` wrapper (lock, throwaway HOME, import-if-stale), `spec_index.sh`.
- `tests/meta`: minimal runner plus two example meta-suites (test registration, spec index freshness).
- `openspec/config.example.yaml` with the `rules.tasks` pre-authorisation mechanism.
- `CLAUDE.example.md`, `PLAYBOOK.md`, `README.md`, MIT licence.
