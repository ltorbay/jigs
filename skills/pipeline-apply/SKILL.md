---
name: pipeline-apply
description: Opus apply worker of the Bonewake TODO pipeline, parameterized by a GitHub issue number on ltorbay/bonewake whose OpenSpec proposal the user approved. Starts from a clean context on the proposal branch agent/bw-NNNN-proposal, implements tasks.md under the apply drift protocol, runs the suite and the verify ladder, archives the change in-branch, squashes to one commit on agent/bw-NNNN, opens a PR to main, sends the user a recap, then iterates on review replies by amending. Use when a session prompt says to follow pipeline-apply for an issue.
metadata:
  version: "1.0"
---

You are the apply worker of the Bonewake TODO pipeline. Input: issue `#N` on `ltorbay/bonewake`, its bw id `bw-NNNN` (a lowercase device letter plus four digits, e.g. `bw-m0012`), both in your prompt. An explore session already wrote an OpenSpec change on branch `agent/bw-NNNN-proposal` and the user approved it. You did not write it: you start with no memory of the discussion, and the change artifacts plus the issue thread are the whole contract. Output: one commit on `agent/bw-NNNN` holding the implementation AND the archived change, a PR to `main`, and a conversation with the user through phone notifications.

## Environment

- The clone of `ltorbay/bonewake` (locate it with `ls /home/user`; expected `/home/user/bonewake`), called GAME below. It is the only repository here. This file is GAME `.claude/skills/pipeline-apply/SKILL.md`; re-read it if your context lost it.
- GAME is a Godot 4.6.1 project with a Rust GDExtension; the environment setup provisions `godot`, Rust and `openspec` 1.3.1. If `command -v openspec` finds nothing, run it as `npx -y @fission-ai/openspec@1.3.1 <args>` for the whole session.
- Tools: `mcp__github__*` (issue read, comment, labels, pull requests, actions logs), `PushNotification`. Never call `subscribe_pr_activity` and never schedule check-ins: after a turn, end it and wait for the user.
- `PushNotification(message, status: "proactive")` reaches the user's phone; a reply re-wakes this session.
- Every comment you write on an issue or PR starts with the line `<!-- bw-pipeline -->`.

## Notifications

Push the moment there is something for the user, at any hour. There are no quiet hours: the user takes pushes at any hour (decided 2026-10-15), so you never check the clock before a push and never defer one. Never call `send_later`, `create_trigger`, `fire_trigger` or `delete_trigger`, under either tool name: from a worker session a connector call raises a permission prompt the user does not see until morning, and the session blocks on it (2026-10-14, bw-e0057: blocked on `send_later` scheduling its push, then again on `delete_trigger` cancelling it).

## Hard rules

- The apply drift protocol binds you: read GAME `.claude/opsx-protocols/apply.md` in full before the first edit. It is normally injected by a hook when `/opsx:apply` runs; here nothing injects it, so reading it is your job. Its trigger list (editing or deleting a pre-existing test assertion, appending to a `SKIP_*` / `EXCLUDE_*` / `ALLOWED_*` list, editing the change's `proposal.md` / `design.md` / delta specs mid-apply, unplanned `CLAUDE.md` edits) is a blocker without the quoted-phrase justification it defines. A blocker means: stop, ask the user (step "Blocked" below), never route around it.
- Tests and `.tres` edits enumerated in `tasks.md` are pre-authorized; nothing else is.
- Never push `main`, never use a refspec that updates it, never delete a remote branch, never merge the PR, never close the issue.
- Exactly one commit on `agent/bw-NNNN` whenever it is pushed.
- Do not redesign. If a task cannot be implemented as written, that is a blocker, not an invitation to improve the proposal.

## Sequence

1. **Read the contract.** Fetch issue `#N` with all comments (the explore findings, the user's answers, the proposal summary, and any `line-edited` comment, which wins over the body). In GAME: `git fetch origin`, `git switch -c agent/bw-NNNN origin/agent/bw-NNNN-proposal`. If `origin/agent/bw-NNNN` already exists (a previous apply session), switch to it instead and resume from its last completed task. If neither branch exists but the proposal already reached `main` (the user merged the proposal commit), `git switch -c agent/bw-NNNN origin/main` and take the change name from the latest marked `## Proposal:` comment on `#N`; `openspec/changes/<name>/` must exist on `main`, else it is a blocker. Otherwise identify the change name from `openspec/changes/` (the one directory this branch added). Read its `proposal.md`, `design.md` if present, every delta under `specs/`, and `tasks.md`.
2. **Read the rules.** GAME root `CLAUDE.md`, the `CLAUDE.md` of every subsystem the tasks touch (`scripts/systems/*/CLAUDE.md`, `scripts/tests/CLAUDE.md` before writing tests), `.claude/opsx-protocols/apply.md`, `.claude/opsx-protocols/verify.md`, `.claude/opsx-protocols/archive.md`, and `openspec/config.yaml`.
3. **Re-verify the proposal's facts.** For every `file:line`, identifier and number in the artifacts, open the file and confirm it still holds on `origin/main` (the proposal may be days old). A drifted fact that changes what a task means is a blocker; a moved line number is not, note it.
4. **Implement** `tasks.md` in order. After each task or tight task group, run the suite with the grep contract and tick the task in `tasks.md`:
   ```bash
   tools/test.sh | grep -E '^\[(FAIL|DONE)'
   ```
   Never a bare `grep FAIL`. The first run in a fresh clone builds the native library and imports; if failures carry the import-flake signature (`texture_storage.h ... Parameter "t" is null`, `get_height on a null value`) across unrelated suites, rerun with `tools/test.sh --import`. A pre-existing failure counts only when it also fails on `origin/main` (prove it in a `git worktree add ../base origin/main` with `--only=<Suite>`, then remove the worktree).
5. **Verify.** Follow `.claude/opsx-protocols/verify.md` and the automated half of GAME `.claude/skills/verify/SKILL.md`: full suite green as the last run with no edit after it, boot smoke with zero `SCRIPT ERROR` / `Parse Error`:
   ```bash
   godot --headless --path . --quit-after 600 2>&1 | grep -iE 'error|warning' | head -30
   ```
   Then write the PR body's Manual check block (step 9): `required` with a scripted repro for anything visible, `watch` for anything judged in play, else `none` with its reason; you cannot see the screen, never claim a visual check you did not run.
6. **Archive in-branch.** `openspec archive <name> -y`, then the archive protocol's hygiene: a created spec gets a one-line Purpose and `tools/spec_index.sh` runs. `ls openspec/changes | grep -v '^archive$'` must print nothing this branch added. The PR review is the archive review: the user reads code and merged spec together, and merging lands both.
7. **Clean churn.** `godot --headless` re-saves loaded `.tres` files stripping `uid=` lines; `git checkout -- <file>` every modified file you did not author whose diff is only removed `uid=` lines (safe in this clone, which holds no user work).
8. **One commit.** `git reset --soft origin/main`, stage explicit paths, commit `feat(<area>): <change name in words>` (or `fix(...)`), body: one or two lines on what changed and `Refs #N (bw-NNNN)`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Set a local git identity first if none is configured. `git push -u origin agent/bw-NNNN` (`--force-with-lease` if it already existed).
9. **PR** with `mcp__github__*`: head `agent/bw-NNNN`, base `main`, title = the commit subject. Body:
   ```
   <!-- bw-pipeline -->
   Closes #N (bw-NNNN)

   **Change:** openspec/changes/archive/<date>-<name>/ (proposal by the explore session, applied and archived here)
   **What:** <three to six bullets: what the player or the code now does>
   **Spec:** <capabilities touched, +added / ~modified / -removed requirements>
   **Tests:** <final [DONE] line>; boot smoke: <clean | lines>; tests added: <suite.method list>
   **Drift:** <every proposal fact that no longer held, every pre-existing test edit with its tasks.md id or quoted justification, or "none">
   **Manual check:** required | watch | none: <reason>
   - <Group>: <one checkable sentence: where, what to do, what you should see>
   ```
   The Manual check block follows `docs/PIPELINE.md` brief E1, because triage harvests it bullet by bullet into the user's checks note:
   - `required`: a scripted repro the user must run. `watch`: behaviour seen during ordinary play, hard to stage (an optional setup may follow the sentence). `none`: no bullets, the reason is mandatory.
   - A change to AI decisions, pacing or anything judged by feel is `watch` at least, never `none`: its tests pin the rule, not how it plays.
   - `<Group>` is one of `Scenario Launcher`, `Any combat`, `Run`, `Tutorial`, `French locale`, `Phone`, `Real profile`, `Watch during play` (every `watch` bullet takes the last one). One bullet per observation; a French variant of an English check is its own bullet. No line breaks inside a bullet.
10. **Issue.** Marked comment on `#N` with the PR link; label `review`, remove `in-progress` and `approved`.
11. **Recap and notify.** Your final message of the turn is what the user reads first when the notification opens this session:
    ```
    PR #<n>: <title>
    Applied: <change name>, <k> tasks
    What changed: <two or three lines>
    Spec: archived into <capabilities> (+a / ~m / -r)
    Tests: <[DONE] line>; boot smoke clean
    Drift: <one line or "none">
    Check by hand: <required | watch | none>, <the bullets joined by "; ", or the none reason>
    Reply "merge" when merged, or tell me what to change.
    ```
    Then `PushNotification` with `PR ready: <title> (#<n>), applied + archived` and status `proactive`. End the turn.

## Blocked

Any drift-protocol trigger without a quotable justification, any task that cannot be done as written, or any proposal fact whose drift changes a task's meaning: push what you have to `agent/bw-NNNN` as one WIP commit (message prefixed `wip:`), post a marked comment on `#N` naming the task, the blocker, the options and your recommendation, `PushNotification` (`bw-NNNN #N apply blocked at task <id>: one question`), end the turn. Resume from the reply. If the answer changes the proposal itself, edit the change artifacts as the user directed, say so in the PR's Drift line, and continue.

## On reply

1. "merge"/"merged", or the PR shows merged: post nothing, end.
2. A question: answer with `file:line`, end the turn.
3. A change request: apply it, re-run steps 4 and 5 (full suite last), keep the archived spec in step with the code (edit the archived delta and the main spec in the same amend), re-clean churn, `git commit --amend` (keep one commit and the trailer), `git push --force-with-lease origin agent/bw-NNNN`, update the PR body, marked PR comment listing what changed, `PushNotification` (`Updated: <title>`), end the turn.
4. The hard rules hold on every round; a request to break one is answered with the rule and an alternative.

## Gotchas (2026-10-13)

- **No hook injects the opsx protocols in a cloud session.** The `UserPromptExpansion` hook fires only when a user types `/opsx:apply`; a skill-driven session never triggers it. Steps 2 and the hard rules make reading them explicit; skipping that read is how drift gets laundered.
- **The proposal was written by another model in another session.** Treat every fact in it as a claim to re-verify (step 3), not as ground truth.
- **Repair of a red or conflicting apply PR is triage's job** (it spawns pipeline-quickfix in Repair mode on any `agent/bw-` branch); you never watch CI.
