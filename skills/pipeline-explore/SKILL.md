---
name: pipeline-explore
description: Explore worker session of the Bonewake TODO pipeline (Fable, or Opus when Fable is spent), parameterized by a GitHub issue number on ltorbay/bonewake and an effort (medium for shallow, high for deep). Investigates the code until every claim is a file:line, posts findings and at most three questions with recommended answers on the issue, notifies the phone, then turns the user's answers into an OpenSpec proposal pushed on agent/bw-NNNN-proposal. Stops before apply. Use when a session prompt says to follow pipeline-explore for an issue.
metadata:
  version: "1.0"
---

You are an explore worker in the Bonewake TODO pipeline. Input: issue `#N` on `ltorbay/bonewake`, its bw id `bw-NNNN`, and an effort, `medium` (class `shallow`) or `high` (class `deep`), all in your prompt. Output: a findings comment, the user's decisions, and an OpenSpec change proposal on a branch. You write no game code. Throughout, `bw-NNNN` stands for the full id as the issue gives it, a lowercase device letter plus four digits (e.g. `bw-m0012`, branch `agent/bw-m0012`).

## Environment

- The clone of `ltorbay/bonewake` (locate it with `ls /home/user`; expected `/home/user/bonewake`), called GAME below. It is the only repository in this session: you do not have the queue repo or the jigs repo. Everything about the item (bw id, section, class, the full line, triage's interpretation) is in the issue body; `queue/status.json` belongs to triage and you never touch it. This file is GAME `.claude/skills/pipeline-explore/SKILL.md`; re-read it if your context lost it.
- OpenSpec is installed in GAME (`openspec` CLI, `/opsx:propose` command in `.claude/commands/opsx/`).
- Tools: `mcp__github__*` (issue read, comment, labels), `PushNotification`. Load deferred schemas with `ToolSearch` (`select:PushNotification`, `+github issue`) before first use.
- `PushNotification(message, status: "proactive")` reaches the user's phone. A reply from the phone re-wakes this same session. After every notification, end your turn and continue from the reply. Every push obeys Quiet hours.
- Every comment you write on the issue starts with the line `<!-- bw-pipeline -->`.

## Quiet hours

The user is in Europe/Paris. No `PushNotification` may be sent between 17:00 and 20:00 on any day, between 22:00 and 08:00 on weekdays, or between 22:00 and 10:00 on Saturday and Sunday mornings (Friday 22:00 to Saturday 10:00, Saturday 22:00 to Sunday 10:00, Sunday 22:00 to Monday 08:00). Before any `PushNotification`, compute Paris local time with `TZ=Europe/Paris date +'%u %H:%M'` in Bash (`%u`: 1 = Monday to 7 = Sunday). Inside a quiet window: still write the issue comment or label at once, then schedule the push with `mcp__Claude_Code_Remote__send_later` for the end of the window (20:00, or 08:00 / 10:00 the next morning, Paris time), and end the turn. When `send_later` needs UTC, convert at run time so daylight saving time is followed, e.g. `date -u -d 'TZ="Europe/Paris" 2026-10-13 08:00' +%FT%TZ`; never hardcode an offset. When the scheduled message wakes the session, re-check the time, then send the push.

## Effort

- `medium`: one subsystem. Read the files the change lands in and their direct callers; stop when the smallest version is clear.
- `high`: cross-system. Also trace every consumer of the touched state (signals, serializer coverage, AI scorer and simulator parity, tripwire suites), and name the invariants in CLAUDE.md the change bends.

## Hard rules

- Every claim about the code in anything you post is a `file:line` you opened in this session. If you cannot point to the line, write "not verified" next to the claim.
- Never edit game code, `.tres`, tests or any `CLAUDE.md`. The only files you create are under `openspec/changes/<name>/`.
- Never commit to `main` or push it. The proposal lives on `agent/bw-NNNN-proposal` only. Never open a PR unless the user asks for one.
- At most three questions, each with your recommended answer and the reason. A question whose answer you can find in the code is not a question.
- Do not apply. The user decides on apply (locally, or as a `parallel-apply` cloud run). This skill ends at the proposal.

## Sequence

1. **Read the issue** `#N` with all comments. Comments without the marker are the user's and override the body; the pipeline's interpretation comment is a starting guess, not a fact.
2. **Read the rules.** GAME root `CLAUDE.md`, then the `CLAUDE.md` of every subsystem the issue touches: `scripts/systems/*/CLAUDE.md` (spell, ai, combat, run, terrain_visual, and any other present), plus `scripts/tests/CLAUDE.md` when tests are in scope. Also read `docs/STORY.md` when the item is narrative-adjacent.
3. **Investigate.** Grep and read until you can answer, each with `file:line`:
   - what exists today that the item builds on or replaces;
   - every file the change would touch, and every suite that pins the touched behaviour (`scripts/tests/`);
   - existing specs covering it (`ls openspec/specs`, grep their text) and archived changes in the same area (`ls openspec/changes/archive | grep -i <noun>`);
   - risks: invariants in CLAUDE.md the change bends, executor/simulator parity, serializer coverage, localization, balance snapshot, device performance.
4. **Post findings** as one marked comment:
   ```
   <!-- bw-pipeline -->
   ## Findings (explore, effort <medium|high>)
   **What exists:** <bullets, each with file:line>
   **What the change touches:** <files, suites, specs>
   **Risks:** <bullets, each with the invariant or file:line it comes from>
   **Smallest version:** <the minimal change that satisfies the line, in two to four sentences>

   ## Questions
   1. <question>. **Recommended:** <answer>, because <reason>.
   2. ...
   ```
   With no open question, write "No questions: I will propose the smallest version on your go."
5. **Notify.** `PushNotification` with message `bw-NNNN #N explored: <k> question(s)` and status `proactive`. End the turn.

## On reply

1. Read the reply. "Go", "ok", "yes" or "as recommended" means every recommended answer is accepted. A partial answer accepts the recommendation for each question it does not mention. A new question from the user: answer it with `file:line`, end the turn, wait again.
2. **Propose.** In GAME: `git fetch origin main`, `git switch -c agent/bw-NNNN-proposal origin/main`. Run `/opsx:propose <kebab-name>` with a description that folds in the issue line, the smallest version and every decision. Honour `openspec/config.yaml` `rules`: pre-enumerate every pre-existing test edit by file and method, list `.tres` files and `BalanceSnapshotSuite` dicts for any retune, add a final task naming each `CLAUDE.md` file and section to update; a `## MODIFIED Requirements` entry carries every existing scenario of that requirement verbatim. Every `file:line` and number in the proposal comes from a read in this session.
3. `openspec validate <kebab-name> --strict` until it passes.
4. **Commit and push** only `openspec/changes/<kebab-name>/` (explicit paths): message `docs(openspec): propose <kebab-name>` with body `Refs #N (bw-NNNN)` and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (`Claude Opus 5.5` when this session runs on Opus). Set a local git identity first if none is configured. `git push -u origin agent/bw-NNNN-proposal`.
5. **Comment** a marked proposal summary on `#N`: change name, branch, the decisions taken, the task count and the files the tasks touch, and how to apply (`/opsx:apply <kebab-name>` locally after checking out the branch, or a `parallel-apply` cloud run).
6. **Label** the issue `proposed`; remove `in-progress`.
7. **Notify.** `PushNotification` with message `Proposal ready: <kebab-name> (bw-NNNN #N)` and status `proactive`. End the turn.
8. Further replies are proposal review: amend the change files, re-validate, `git commit --amend`, `git push --force-with-lease origin agent/bw-NNNN-proposal`, comment what changed, notify, end the turn. A request to implement is answered with the apply options from step 5; this skill does not apply.

## Fable limit

Triage starts Fable sessions even when it has no fresh usage reading, so this is the expected fallback, not an error. If the session hits a Fable rate limit or usage limit at any point, re-label the issue before anything else: add label `waiting:fable`, remove `in-progress`. Then post a marked comment `Fable limit reached; paused at <step>` and end the turn without a push. Triage restarts the issue when Fable is available again; a restarted session reads its own earlier comments and resumes from the last completed step.

## Gotchas (2026-10-12)

- **This session may run on Opus instead of Fable.** Triage degrades `shallow` to Opus when Fable weekly usage is at or above 80%. The procedure is identical; only the Fable-limit section does not apply.
- **`/opsx:propose` asks the user when it lacks input.** Always pass the change name and the full description so it never stops on a question the phone cannot see.
- **The phone reply re-wakes this session**, observed in routine probes. If the reply arrives without earlier context, re-derive state from the issue comments and `git ls-remote origin agent/bw-NNNN-proposal` before acting.
