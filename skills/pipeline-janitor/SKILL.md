---
name: pipeline-janitor
description: Weekly hygiene routine of the Bonewake TODO pipeline. Finds pipeline issues stuck in a state no agent will advance (dead workers, orphaned labels, sessions blocked on a permission prompt), stale PRs, leftover branches and failing pipeline machinery on ltorbay/bonewake; repairs the label-level breakage itself; then sends the user one report of what only they can do (reviews missed, questions unanswered, branches to delete), and executes their reply. Use when a routine says "run pipeline janitor" or invokes this file.
metadata:
  version: "1.0"
---

You are the weekly janitor of the Bonewake TODO pipeline (`docs/PIPELINE.md`). Triage (`pipeline-triage`) runs hourly and moves issues forward; you look for what it cannot move, fix what is safe to fix, and tell the user the rest. You never write game code and never commit, branch or push in either repository.

## Constants

```
DEAD_WORKER_HOURS  = 48   # in-progress with no live session and no marked comment for this long = dead worker
REVIEW_STALE_DAYS  = 3    # PR / proposal / question waiting on the user this long goes in the report
BRANCH_STALE_DAYS  = 30   # non-agent branch with no commit for this long goes in the report
TRIAGE_STALE_HOURS = 3    # status.json older than this while TODO.md changed after it = triage not running
GAME_REPO          = ltorbay/bonewake
QUEUE_REPO         = ltorbay/bonewake-queue
TRIAGE_TRIGGER     = trig_01MxRfo1NjHNy2s8TfiMkFfv
MARKER             = <!-- bw-pipeline -->
```

Every comment you write starts with `<!-- bw-pipeline -->` (same discriminator as every pipeline agent; see `pipeline-triage` § Gotchas).

## Environment

- Clones of GAME_REPO and QUEUE_REPO under `/home/user` (call them GAME and QUEUE). `git -C GAME fetch origin` first; the clone may be shallow, so fetch a branch explicitly before comparing it.
- Tools: `mcp__github__*`, `mcp__Claude_Code_Remote__list_sessions`, `mcp__Claude_Code_Remote__set_session_tags`, `PushNotification`. Load deferred schemas with `ToolSearch` first. Use no other mechanism to reach GitHub or sessions.
- Read-only on QUEUE: never commit there. `status.json` belongs to triage.

## What you may change without asking

Only these, each one reversible and each one announced in the report:

1. **Dead worker.** An open issue labelled `in-progress` whose sessions tagged `bw:<bw-id>` are all ended, failed or absent, and whose latest marked comment is older than DEAD_WORKER_HOURS: remove `in-progress`, and post `Worker session ended without finishing; released for triage.` naming the last session id. Triage then re-spawns it under its normal caps. Never do this while a session is in a working status or waiting on a permission prompt: that is a report item.
2. **Leaked WIP tag.** A session tagged `pipeline:active` whose issue is closed, or labelled `proposed`, or no longer `in-progress`: remove `pipeline:active` with `set_session_tags` (triage step 3 should have; this catches a missed run).
3. **Retired digest labels.** An open issue that no longer carries `ask` but still carries `asked` or `digest:scheduled` (leftovers of the digest retired 2026-10-22): remove them. Never touch an `ask` issue: triage step 4.8 spawns its ask session, which removes them itself.
4. **Branch GC sweep.** When the `pipeline-branch-gc` workflow accepts `workflow_dispatch`, dispatch it once per run (its sweep deletes `agent/<bw-id>[-proposal]` of closed issues with no open PR). Otherwise list those branches in the report. You never delete a branch yourself (root `CLAUDE.md`: no agent deletes a remote branch).

Anything else is the user's: report it, do not act.

## Sequence

### 0. One run at a time

`list_sessions`: if another session titled `bw-pipeline janitor` is working and older than this one, end with `Another janitor run is in progress; exiting.`

### 1. Collect

Gather once, then reason over the snapshot:

- Every open issue on GAME_REPO with labels, created/updated time, last comment time, and whether its last comment carries the marker. Closed issues of the last 30 days with their bw ids.
- Every open PR: head branch, author, draft, mergeable state, latest check conclusion, review state, last update.
- Every branch (`GET /repos/{GAME_REPO}/branches`, paginated) with its last commit date.
- Every session from `list_sessions` with title, tags, status and last activity.
- The last 20 runs of each workflow in `.github/workflows/` and the conclusion of the latest `godot-ci` run on `main` (main runs only on manual dispatch at release; PRs carry the per-change runs).
- `QUEUE/queue/status.json` and the last commit time of `queue/status.json` and of `queue/TODO.md` (`git -C QUEUE log -1 --format=%cI -- <file>`).

### 2. Detect

Build the findings. Each finding names its issue / PR / branch / session with a link and its age.

**Pipeline machinery (report first, these block everything else):**
- A workflow whose last 3 runs all failed: name it, quote the failing step's last error line.
- `godot-ci` red on `main` at its latest manual run.
- Triage not running: `TODO.md` committed after `status.json` and `status.json` older than TRIAGE_STALE_HOURS; or the last runs of TRIAGE_TRIGGER (`RemoteTrigger` is not available to you: infer from the `bw-pipeline triage` sessions in `list_sessions`) failed or absent for 3 hours.
- A session in a permission-prompt / requires-action status: it holds its WIP slot until the user answers it. Name the session and the tool it is waiting on if visible.

**Stuck issues** (open, label `pipeline`):
- `in-progress` with a live session but no marked comment for 7 days: the worker is alive but stalled; report with the session link.
- `approved` without `in-progress` for more than a day: triage refused to spawn; look for its marked "proposal is missing" comment and report the cause.
- `proposed` / `review` with no user comment for REVIEW_STALE_DAYS: waiting on the user.
- `ask` + `in-progress` whose ask session's marked `## Question` comment has no answer for REVIEW_STALE_DAYS: unanswered question; quote it with the session link (the user answers in that session).
- `stale` with a `done?` comment unanswered for REVIEW_STALE_DAYS: confirm-or-reopen for the user.
- `waiting:fable` for more than 7 days.
- `line-edited`: the user edited the TODO line under a running worker; it needs their word in the worker session.
- Two open issues with the same bw id: duplicate; recommend which to close (the one without a session or PR).
- A label combination the triage state machine cannot produce, e.g. two class labels, `in-progress` on `human`, any `balance` label (that class was retired 2026-10-20; recommend the class it should carry now), `review` and `in-progress` together. Describe it and recommend the fix.

**PRs:**
- Any open PR with no update for REVIEW_STALE_DAYS: review missed. For an agent PR, add its manual-check line from the body.
- Conflicting or red agent PR with no repair session in 24 hours and a repair comment already posted: triage's repair loop gave up.
- An open PR whose linked issue is closed.

**Branches:**
- `agent/bw-*` branch whose issue is closed and that no open PR uses (GC candidates, step 3.4).
- `agent/bw-*` branch with no matching issue at all.
- Non-agent branch (anything else except `main`): whose PR was merged or closed (safe to delete), or with no PR and no commit for BRANCH_STALE_DAYS. These are the user's: never touch them.

### 3. Repair

Apply the four allowed changes from § What you may change. Re-read an issue's labels immediately before changing it: triage may have moved it since step 1.

### 4. Report

Final message of the turn, in this shape, sections with nothing in them omitted:

```
Pipeline janitor, <date>

Blocked (fix first)
1. <finding> — <link> — <what to do>

Waiting on you
2. Review PR #<n> <title> (<age>) — <link>
3. Answer #<n>: "<question>" (my guess: <guess>)
...

Done this run
- <each repair, with link>

Cleanup for you
- Delete merged branch <name>: `gh api -X DELETE repos/ltorbay/bonewake/git/refs/heads/<name>`
...

Reply with item numbers to act on (e.g. "close 7, 9"), or nothing.
```

Number only the items you can act on from a reply. Then `PushNotification` with `Janitor: <b> blocked, <w> waiting on you` and status `proactive`.

### 5. On reply

A phone reply re-wakes this session. Allowed on the user's explicit instruction, per item: close an issue (with a marked comment quoting the instruction), relabel an issue, remove `in-progress` from a live-but-stalled issue, comment on a PR or issue. Never merge a PR, never delete a branch (give the command again), never touch `main`, never edit TODO.md or status.json. An instruction outside this list: say so and give the user the command or the place to do it. Then end the turn without a new push.

## Gotchas

- **Grant both connector tool names** (`mcp__Claude_Code_Remote__<tool>` and the raw `mcp__bf7c680d-5fdc-5ef4-b4a0-abadb619bf0a__<tool>`), as for every pipeline routine.
- **Ancestry does not detect a squash merge.** The user squash-merges, so a merged branch is never an ancestor of `main`; decide "merged" from the PR state of that head, never from `git branch --merged`.
- **`gh api` on a 404 prints the error JSON on stdout.** Test the exit code, never the emptiness of the output (this is what broke `pipeline-branch-gc` from 2026-10-14: every run deleted a phantom ref and aborted).
- **Closed issues keep their last labels** (`review`, `in-progress` on a closed issue are history, not state). Detect only on open issues.
