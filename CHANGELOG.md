# Changelog

## 0.1.0 – initial extraction from a private project at commit b96e27b9

- Hooks: on-demand protocol injection (apply / archive / verify), post-archive spec hygiene check, example `settings.json`.
- Protocols: Drift Protocol (apply), native-merge archive protocol, verify gates.
- Skills: `verify`, `backfill-spec`, `parallel-apply`, `tech-audit`, `device-drive`.
- Scripts: `test.sh` wrapper (lock, throwaway HOME, import-if-stale), `spec_index.sh`.
- `tests/meta`: minimal runner plus two example meta-suites (test registration, spec index freshness).
- `openspec/config.example.yaml` with the `rules.tasks` pre-authorisation mechanism.
- `CLAUDE.example.md`, `PLAYBOOK.md`, `README.md`, MIT licence.
