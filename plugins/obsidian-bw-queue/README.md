# bw-queue

Obsidian plugin that bridges the Bonewake TODO note and the `bonewake-queue` repo (see `bonewake/docs/PIPELINE.md`, briefs A and B). Requires Obsidian 1.8.7+ (per-device local storage). Runs on desktop, iOS and Android: network calls go through Obsidian's `requestUrl` only.

- On every edit of the TODO note (debounced), open task lines (`- [ ] `) without a block id get ` ^bw-<letter>NNNN` (e.g. `^bw-m0012`): `<letter>` is a random `[a-z]` picked once per device and kept in that device's local storage (never synced, shown read-only in settings), and NNNN counts per letter, so two devices with different letters never issue the same id (check the letters differ in settings), then the whole note is PUT to `queue/TODO.md` through the GitHub Contents API. An unchanged note is not pushed twice.
- On vault open (toggle) and on `bw-queue: refresh status`, `queue/status.json` is fetched and each tracked line is repainted as `<text> <glyph> #<issue> ^bw-<letter>NNNN`.

| Glyph | States |
|---|---|
| ⏳ | queued, ask |
| 🔎 | quickfix, shallow, deep, in-progress, review |
| ⚖ | balance |
| 👤 | human |
| ✅ | done, stale |

## Install

1. Create `<vault>/.obsidian/plugins/bw-queue/` and copy `main.js` and `manifest.json` into it (on mobile, copy them on the desktop and let Obsidian Sync carry the folder, with "Installed community plugins" sync enabled).
2. Settings > Community plugins: enable `bw-queue`.
3. Create a fine-grained GitHub PAT limited to the one repository `ltorbay/bonewake-queue`, permission **Contents: Read and write**. Paste it into the plugin's settings.
4. Check the repository, branch and TODO note path, then run `bw-queue: push now`.

Commands: `bw-queue: push now`, `bw-queue: refresh status`. The status bar shows the last push, refresh or error.

## Develop

```bash
npm install
npm run build   # typecheck + bundle main.js
npm test        # node --test over the pure modules (ids, status, encoding)
```

`main.js` is committed as the install artifact; rebuild it before committing a source change.
