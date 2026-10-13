---
name: pipeline-quickfix
description: Opus worker session of the Bonewake TODO pipeline, parameterized by a GitHub issue number on ltorbay/bonewake. Fixes a small no-mechanic item (copy, fr.po, rename, wrong label, logged crash, cited file:line), runs the test suite and the verify ladder, writes the backfill-spec delta, pushes one commit on agent/bw-NNNN, opens a PR to main, notifies the phone, then iterates on the user's review replies by amending the single commit. Use when a session prompt says to follow pipeline-quickfix for an issue.
metadata:
  version: "1.0"
---

You are a quickfix worker in the Bonewake TODO pipeline. Input: issue `#N` on `ltorbay/bonewake` and its bw id `bw-NNNN` (both in your prompt). Output: one reviewed-ready commit on branch `agent/bw-NNNN`, a PR to `main`, and a conversation with the user through phone notifications. Throughout, `bw-NNNN` stands for the full id as the issue gives it, a lowercase device letter plus four digits (e.g. `bw-m0012`, branch `agent/bw-m0012`).

## Environment

- The clone of `ltorbay/bonewake` (locate it with `ls /home/user`; expected `/home/user/bonewake`), called GAME below. It is the only repository in this session: you do not have the queue repo or the jigs repo. Everything about the item (bw id, section, class, the full line, triage's interpretation) is in the issue body; `queue/status.json` belongs to triage and you never touch it. This file is GAME `.claude/skills/pipeline-quickfix/SKILL.md`; re-read it if your context lost it.
- GAME is a Godot 4.6.1 project with a Rust GDExtension. The environment setup provisions `godot` and Rust; `tools/test.sh` builds the native library itself when it is missing.
- `openspec` (1.3.1) is installed by the environment setup. If `command -v openspec` finds nothing, run it as `npx -y @fission-ai/openspec@1.3.1 <args>` for the whole session; never skip a validate or archive step because the binary is missing.
- Tools: `mcp__github__*` (issue read, comment, labels, pull requests), `PushNotification`, and `send_later` for quiet hours only. Never call `subscribe_pr_activity`: it starts a 50-minute self check-in loop that wakes this session (and the user's permission prompts) for nothing; the hourly triage routine repairs PRs that go red or conflict. Load deferred schemas with `ToolSearch` (`select:PushNotification`, `+github pull`, `+github issue`) before first use.
- `PushNotification(message, status: "proactive")` reaches the user's phone. A reply from the phone re-wakes this same session. After every notification, end your turn and continue from the reply. Every push obeys Quiet hours.
- Every comment you write on an issue or PR starts with the line `<!-- bw-pipeline -->`.

## Quiet hours

The user is in Europe/Paris. No `PushNotification` may be sent between 17:00 and 20:00 on any day, between 22:00 and 08:00 on weekdays, or between 22:00 and 10:00 on Saturday and Sunday mornings (Friday 22:00 to Saturday 10:00, Saturday 22:00 to Sunday 10:00, Sunday 22:00 to Monday 08:00). Before any `PushNotification`, compute Paris local time with `TZ=Europe/Paris date +'%u %H:%M'` in Bash (`%u`: 1 = Monday to 7 = Sunday). Inside a quiet window: still write the issue comment or label at once, then schedule the push with `mcp__Claude_Code_Remote__send_later` for the end of the window (20:00, or 08:00 / 10:00 the next morning, Paris time), and end the turn. When `send_later` needs UTC, convert at run time so daylight saving time is followed, e.g. `date -u -d 'TZ="Europe/Paris" 2026-10-13 08:00' +%FT%TZ`; never hardcode an offset. When the scheduled message wakes the session, re-check the time, then send the push.

## Hard rules

- Never touch numeric balance values in any `.tres` (damage, HP, costs, ranges, weights, multipliers, pool odds). Text fields in `.tres` (names, descriptions, dialogue lines) are allowed.
- Never edit `scripts/tests/balance_snapshot_suite.gd`, unless the issue is a rename and the snapshot must follow the renamed identifier with every value unchanged.
- Never push `main`, never use a refspec that updates it (`HEAD:main`), never delete a remote branch. Push only `agent/bw-NNNN`.
- Never merge the PR, never enable auto-merge, never close the issue. The user merges (squash).
- Exactly one commit on the branch, at every moment it is pushed.
- Drift protocol (GAME `.claude/opsx-protocols/apply.md`) applies with no `tasks.md` to pre-authorise anything: editing or deleting the assertion of a pre-existing test, weakening it, appending to a `SKIP_*` / `EXCLUDE_*` / `ALLOWED_*` / allowlist in a meta-suite, or editing any `CLAUDE.md`, is a blocker. Stop and ask (step 3 below) instead of doing it.
- If the item turns out to need a gameplay decision or a new rule, it is not a quickfix: remove labels `quickfix` and `in-progress`, add `shallow` (one subsystem) or `deep` (cross-system), post a marked comment explaining why with `file:line` evidence, send `PushNotification` (`bw-NNNN #N is not a quickfix, relabelled <class>`), and end. Triage reschedules it.

## Sequence

1. **Read.** Fetch issue `#N` with its comments. If the issue carries `line-edited`, the user changed the TODO line after triage: the latest marked `Line edited` comment holds the current text and wins over the body; remove the label once you have read it. Read GAME `CLAUDE.md` (root), and the subsystem `CLAUDE.md` of every directory you will touch (`scripts/systems/*/CLAUDE.md`, `scripts/tests/CLAUDE.md` before writing a test). Comments without the marker are the user's and override the issue body.
2. **Restate.** Write, for yourself and for the PR, ONE sentence: what is wrong, where (`file:line`), and what the fix is. Every concrete identifier in it must come from a read or a grep, not memory.
3. **Unclear?** If the sentence cannot be written without guessing, post a marked comment with your best guess and one question, `PushNotification` (`bw-NNNN #N: one question before I fix`), end the turn, and resume from the reply at step 2.
4. **Branch.** In GAME: `git fetch origin main`, `git switch -c agent/bw-NNNN origin/main`. If the branch already exists on the remote (a previous session), `git switch -c agent/bw-NNNN origin/agent/bw-NNNN` and continue from it.
5. **Implement** the smallest fix that satisfies the sentence. Follow the root CLAUDE.md conventions (typing, no comments by default, no em or en dashes in player-facing copy, `fr.po` updated whenever an English msgid changes, `TranslatableFields` for new text fields).
6. **Test.** Run the suite with the grep contract, quoted verbatim from GAME root `CLAUDE.md`:
   ```bash
   tools/test.sh | grep -E '^\[(FAIL|DONE)'
   ```
   Never a bare `grep FAIL`: `grep` exits 1 when nothing matches, so an all-pass run looks like a failure. `[DONE]` always prints, so the alternation always matches and the pipe's exit code stays meaningful. Green = a `[DONE]` line with no `failed` count and no `[FAIL]` line.
   - The first run in a fresh clone imports the project; if failures carry the import-flake signature (`texture_storage.h ... Parameter "t" is null`, `get_height on a null value`) across unrelated suites, rerun with `tools/test.sh --import` before diagnosing.
   - **Pre-existing failure policy.** A failure is yours by default. It counts as pre-existing only when it is unrelated to your diff AND fails on `origin/main` too: prove it with `git worktree add ../base origin/main` and `tools/test.sh --only=<Suite> | grep -E '^\[(FAIL|DONE)'` there (run alone; `test.sh` kills other headless Godot processes), then `git worktree remove --force ../base`. Name each proven pre-existing failure, with the `[FAIL]` line, in the PR body. Never edit a test to make it pass.
   - A filtered run is never the gate. The last suite run before committing is a full run with no edit of any kind after it.
7. **Verify ladder** (GAME `.claude/skills/verify/SKILL.md`, automated half):
   - Rung 1: the full suite above.
   - Rung 2: if no existing test drives the changed path and the fix is behavioural (not pure copy), add a test in the matching `*_suite.gd`. Revert your production line once and confirm the new test fails, then restore it.
   - Rung 3: headless boot smoke, expecting zero `SCRIPT ERROR` and zero `Parse Error` lines:
     ```bash
     godot --headless --path . --quit-after 600 2>&1 | grep -iE 'error|warning' | head -30
     ```
   - Manual half: if the change is visible (UI, layout, copy on screen, animation), write a repro script for the PR body: entry point, steps, the expected observation as a checkable sentence. You cannot see the screen; never claim a visual check you did not run.
8. **Backfill spec.** Follow GAME `.claude/skills/backfill-spec/SKILL.md` steps 1 to 5: write `openspec/changes/backfill-<kebab>/` (proposal, delta spec, checked tasks) and pass `openspec validate <name> --strict`. Then run its step 7 in this branch, `openspec archive <name> -y`, and follow the archive protocol in GAME `.claude/opsx-protocols/archive.md` (no placeholder Purpose, `tools/spec_index.sh` if a spec is new). The PR review IS the backfill skill's review gate: the user reads the archived delta and the merged spec diff in the PR, and merging the PR lands code and spec together, so nothing is left to archive after merge. A `## MODIFIED Requirements` entry must carry every existing scenario of that requirement verbatim (GAME `openspec/config.yaml` `rules.specs`). If the fix changes no behaviour any spec covers (a typo in copy, a missing `fr.po` entry), write no change directory and say "no spec delta: <reason>" in the PR body.
9. **Clean churn.** `git status --short`. `godot --headless` re-saves loaded `.tres` files stripping `uid=` lines; for every modified file you did not author whose diff is only removed `uid=` lines, `git checkout -- <file>`. In this clone there is no user work in progress, so that revert is safe here and only here.
10. **Gate: nothing left unarchived.** `ls openspec/changes | grep -v '^archive$'` must print nothing this branch added. A `backfill-*` directory still there means step 8's archive did not run: run it now. Never commit or open the PR with a live change directory of yours.
11. **Commit once.** Stage explicit paths. Conventional message (`fix(<area>): <what>`, `chore(i18n): ...`, `refactor: rename ...`), a body of one or two lines with the restated sentence and `Refs #N`, and the trailer:
    ```
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    ```
    Set a local git identity first if none is configured.
12. **Push.** `git push -u origin agent/bw-NNNN`.
13. **PR.** Open a PR with `mcp__github__*`: head `agent/bw-NNNN`, base `main`, title = the commit subject. Body:
    ```
    <!-- bw-pipeline -->
    Closes #N (bw-NNNN)

    **What:** <the restated sentence>
    **Tests:** <the final [DONE] line>; boot smoke: <clean | lines>
    **Pre-existing failures:** <none | each [FAIL] line, shown failing on origin/main>
    **Spec:** openspec/changes/archive/<date>-<name>/ (archived in this PR; review the spec diff) | no spec delta: <reason>
    **Manual check:** <repro script | not needed: <reason>>
    ```
14. **Issue.** Marked comment on `#N` with the PR link; add label `review`, remove `in-progress`.
15. **Recap and notify.** Write the recap as your final message of the turn, because the phone notification opens this session and that message is what the user reads first. Shape:
    ```
    PR #<n>: <PR title>
    Fix: <the restated sentence, with file:line>
    Spec: archived <date>-<name> into <capability> (<+added / ~modified / -removed> requirements; one line on what the requirement now says) | no spec delta: <reason>
    Tests: <[DONE] line>; boot smoke clean
    Check by hand: <one-line repro, or "nothing visible">
    Reply "merge" when merged, or tell me what to change.
    ```
    Then `PushNotification` with message `PR ready: <PR title> (#<n>), fix + spec archived` (or `fix, no spec delta`) and status `proactive`. End the turn.

## On reply

The user's reply from the phone is review feedback on this PR. Do not schedule check-ins or re-arm anything after a turn: end it and wait for the user.

1. Read it in full; if it says the PR was merged or closed, post nothing and end.
2. If it is a question, answer it in the session, cite `file:line`, and end the turn.
3. If it asks for a change: apply it, then re-run step 6 (full suite) and step 7 rung 3, update the spec if behaviour moved (edit the archived change's delta AND the merged main spec in the same amend, or `git reset` the archive and re-run steps 8's archive), re-clean churn, `git commit --amend` (keep one commit, keep the trailer), `git push --force-with-lease origin agent/bw-NNNN`.
4. If CI on the PR failed: read the failing job's log through `mcp__github__*` actions tools, fix as in 3, or, if the failure is proven pre-existing on `main`, say so on the PR.
5. Update the PR body's Tests line, post a marked PR comment listing what changed, `PushNotification` (`Updated: <PR title>, <one-line summary>`), end the turn.
6. The same hard rules hold on every round; a request to break one (push main, merge, retune a value) is answered with the rule and a suggestion, not done.

## Repair mode

Used when your prompt says "Repair mode for PR #<n>". The PR exists, its branch is `agent/bw-NNNN`, and it is conflicting with `main` or its CI is red. Every hard rule above still holds.

1. Read the PR, its issue (`Closes #N` in the body) and their comments. Read the failing CI job log through `mcp__github__*` actions tools when CI is red.
2. In GAME: `git fetch origin`, `git switch -c agent/bw-NNNN origin/agent/bw-NNNN`, `git rebase origin/main`.
3. Resolve conflicts keeping BOTH intents: main's change and the PR's change. `resources/i18n/fr.po` conflicts are almost always two independent entries; keep both. A conflict where the two sides genuinely contradict (both edit the same line to different values for different reasons) is not yours to settle: `git rebase --abort`, post a marked PR comment naming the file, both sides and your suggested resolution, `PushNotification` (`PR #<n> needs your call on a conflict`), end the turn, and resume from the reply.
4. Fix any test the rebase broke, or the CI failure, under the same rules as step 6 of the Sequence (never edit a test to make it pass; prove pre-existing failures on `origin/main`).
5. Full suite green with the grep contract, boot smoke clean, churn cleaned, still exactly one commit (squash with `git reset --soft origin/main` then commit again with the original message and trailer if the rebase left more than one).
6. `git push --force-with-lease origin agent/bw-NNNN`.
7. Marked PR comment: `Repaired: rebased on main <short sha>` plus what conflicted or failed and how it was resolved. Update the PR body's Tests line.
8. `PushNotification` with message `PR #<n> repaired, ready to merge: <PR title>` and status `proactive` (quiet hours apply). End the turn.

## Gotchas (2026-10-12)

- **The phone reply re-wakes this session**, observed in routine probes with `persist_session: false`. The resume path under real work (a PR open, a reply, an amend) was not yet exercised end to end; if a reply arrives without the session's earlier context, re-derive state from the issue, the PR and `git log origin/agent/bw-NNNN` before acting.
- **`--force-with-lease` after every amend, never plain `--force`,** and only on `agent/bw-NNNN`.
- **No PR subscription, no self check-ins (2026-10-13).** A subscribed session re-armed `send_later` every 50 minutes and called the connector under its raw id (`mcp__bf7c680d-5fdc-5ef4-b4a0-abadb619bf0a__*`), outside the allow list, so every PR cost the user permission prompts. CI failures and conflicts are triage's job (Repair mode).
