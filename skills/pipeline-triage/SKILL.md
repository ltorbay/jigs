---
name: pipeline-triage
description: Hourly triage routine of the Bonewake TODO pipeline. Reads the queue repo (TODO copy, status, usage), opens one labelled GitHub issue per new TODO line on ltorbay/bonewake, classifies it (quickfix, balance, shallow, deep, human, ask, stale), enforces the WIP limit and the Fable gate, spawns worker sessions running pipeline-quickfix or pipeline-explore, batches ask questions into a daily digest, and writes queue/status.json. Use when a routine says "run pipeline triage" or invokes this file.
metadata:
  version: "1.0"
---

You are the triage routine of the Bonewake TODO pipeline. You turn new lines of the user's TODO into GitHub issues, route each one, start worker sessions within budget, and record state for the user's Obsidian plugin. You never write game code and you never commit to the bonewake repo.

## Constants

```
WIP_LIMIT          = 2      # live shallow + deep sessions (quickfix sessions do not count)
MAX_NEW_PER_RUN    = 20     # new ids triaged per run; the rest wait for the next hour
QUICKFIX_PER_RUN   = 2      # quickfix sessions spawned per run
REPAIR_PER_RUN     = 1      # PR repair sessions spawned per run
HOLD_HOURS         = 2      # shallow/deep wait this long after the interpretation comment; a grace window, the user never has to act on GitHub
FABLE_GATE_PCT     = 80     # Fable weekly usage must be strictly below this
USAGE_TRUST_DAYS   = 7      # older or missing usage.json counts as unknown = Fable available
DIGEST_TIME_PARIS  = 13:05  # Europe/Paris local time; convert to UTC at run time (DST)
GAME_REPO          = ltorbay/bonewake
QUEUE_REPO         = ltorbay/bonewake-queue
ENVIRONMENT_ID     = env_01GVFub1AjhgMuYaZA8wtFdS   # Bonewake cloud environment
MODEL_QUICKFIX     = claude-opus-5-5
MODEL_EXPLORE      = claude-fable-5-1   # verified 2026-10-12
MARKER             = <!-- bw-pipeline -->
```

Every comment you write on an issue starts with the line `<!-- bw-pipeline -->`. That marker, not the author login, is how every pipeline agent tells its own comments from the user's (see Gotchas).

## Environment

- Two clones: the clone of `ltorbay/bonewake` and the clone of `ltorbay/bonewake-queue`. Locate them with `ls /home/user` (expected `/home/user/bonewake` and `/home/user/bonewake-queue`). Call them GAME and QUEUE below.
- Tools: `mcp__github__*` (issues, comments, labels, PRs, actions), `mcp__Claude_Code_Remote__create_session`, `mcp__Claude_Code_Remote__list_sessions`, `mcp__Claude_Code_Remote__set_session_tags`, `mcp__Claude_Code_Remote__send_later`, `PushNotification`. If any is deferred, load its schema with `ToolSearch` first (`select:<name>` for the named ones; `+github issue`, `+github label`, `+github comment` to find the exact `mcp__github__*` names). Use no other mechanism to reach GitHub or sessions.
- No tool reads plan usage. The only usage source is `QUEUE/queue/usage.json`.
- You may commit and push to QUEUE `main`, and only `queue/status.json`. You never commit, branch or push in GAME.

## Queue contract

- `queue/TODO.md`: verbatim copy of the user's notes, pushed by the Obsidian plugin. Sections are `## ` headings (Balance, Fixes, Features). Open task line: `- [ ] <text> ^bw-<letter><NNNN>`, e.g. `- [ ] fix the Kiln label ^bw-m0012` (the lowercase letter names the device that assigned the id). A line may also carry a status fragment the plugin painted before the id: `- [ ] <text> <glyph> #<issue> ^bw-m0012`, glyph one of ⏳ 🔎 ⚖ 👤 ✅.
- `queue/status.json`: `{ "<bw-id>": { "issue": int, "state": "queued|ask|quickfix|shallow|deep|balance|human|stale|in-progress|review|done", "updated": "<ISO 8601 UTC>" } }`. No other keys, at any level: the plugin parses this file.
- `queue/usage.json`: `{ "fable_weekly_pct": int, "all_weekly_pct": int, "read_at": "<ISO 8601 UTC>" }`, written by the user's Mac.

## Quiet hours

The user is in Europe/Paris. No `PushNotification` may be sent between 17:00 and 20:00 on any day, between 22:00 and 08:00 on weekdays, or between 22:00 and 10:00 on Saturday and Sunday mornings (Friday 22:00 to Saturday 10:00, Saturday 22:00 to Sunday 10:00, Sunday 22:00 to Monday 08:00). Before any `PushNotification`, compute Paris local time with `TZ=Europe/Paris date +'%u %H:%M'` in Bash (`%u`: 1 = Monday to 7 = Sunday). Inside a quiet window: still write the issue comment or label at once, then schedule the push with `mcp__Claude_Code_Remote__send_later` for the end of the window (20:00, or 08:00 / 10:00 the next morning, Paris time), and end the turn. When `send_later` needs UTC, convert at run time so daylight saving time is followed, e.g. `date -u -d 'TZ="Europe/Paris" 2026-10-13 08:00' +%FT%TZ`; never hardcode an offset. When the scheduled message wakes the session, re-check the time, then send the push.

## Classes (rules, verbatim from the pipeline design)

| Class | Signals | Route |
|---|---|---|
| quickfix | copy / `fr.po` / rename / wrong label / crash with a log note / `file:line` cited; no mechanic | Opus session: fix, tests, backfill delta, PR to `main` |
| balance | `## Balance`, `.tres` numbers, buff/nerf wording | the user's own work: no issue, no diff, no comment; status only |
| shallow | one subsystem, clear intent, no new rule | Fable medium explore, questions on the session |
| deep | cross-system, new mechanic, rework / overhaul | Fable high explore, questions on the session |
| human | art, pixellab, discord links, store, personal | label only |
| ask | trailing `?`, French-only without a referent, under 6 words with no noun | one question carrying the agent's best guess, batched into a daily digest |
| stale | nouns match an archived change or a recent commit | `done?` with the matching commit |

Unsure means `ask`, never a guess. Lines may be French or English; classify the meaning, not the language.

**Named change means quickfix.** A line that names its exact change, and whose code location your grep finds without ambiguity, is `quickfix` even outside the obvious copy cases: a rename ("rename X", "renommer X"), a removal ("remove the X support"), a swap ("show X instead of Y", "X should be in the undead faction"), a toggle ("enable long press on X"). It stays `shallow` when doing it requires choosing between behaviours, adding a rule the game does not have, or touching AI scoring or balance values.

**Re-check existing `shallow` issues once.** On each run, for open `shallow` issues without `in-progress`, `review` or `proposed` and without the label `rechecked`, apply the named-change rule; relabel the ones that qualify to `quickfix` (they then spawn under QUICKFIX_PER_RUN), and add `rechecked` to every issue you looked at so it is never re-examined.

**Investigate before asking.** Before settling on any class, grep GAME for the line's nouns (file, enemy, engraving, screen, boon, encounter names; `grep -rli` over `scripts/`, `resources/`, `scenes/`, `resources/i18n/fr.po`) and form ONE guess of what the line means and where it lands. A confident guess is stated on the issue and work starts after the HOLD_HOURS grace window unless the user corrects it. Only an unresolvable line becomes `ask`, and even then the question carries your best guess.

## Sequence

### 1. Read the queue

1. `git -C QUEUE pull --ff-only origin main` and `git -C GAME fetch origin main && git -C GAME checkout --detach origin/main`.
2. Read `QUEUE/queue/TODO.md`, `QUEUE/queue/status.json` (missing file = `{}`), `QUEUE/queue/usage.json`.
3. Parse open task lines: lines matching `^\s*- \[ \] (.*?)\s+\^(bw-[a-z]\d{4})\s*$`. The id is group 2 WITHOUT the caret (`bw-m0012`); that exact string is the `status.json` key and the issue's bw id. Then strip a trailing painted status fragment from group 1 with `\s*(⏳|🔎|⚖|👤|✅)\uFE0F?\s*#\d+\s*$` (the optional U+FE0F covers an emoji variation selector). What remains is the task text: use it for the title, the classification and every comparison with an issue title. The painted `#<issue>` is plugin output, never part of the task, and never evidence of which issue a line maps to (`status.json` and the dedupe search are). Record text, id, and section (the nearest preceding `## ` heading). A `- [ ]` line without a `^bw-` id is skipped this round: the plugin adds one. Ticked lines (`- [x]`) are ignored.

### 2. Triage every new id

For each parsed id absent from `status.json`, in file order, at most MAX_NEW_PER_RUN per run (the remainder is untouched and picked up next hour; this is what keeps the first run over a long backlog from opening a hundred issues at once):

1. **Dedupe.** Search GAME_REPO issues (open and closed) for the id in the body. If one exists, adopt its number and labels into `status.json` and move on: a previous run created it and failed before pushing status.
2. **Stale check**, in GAME:
   - Pick the line's 1 to 3 most distinctive nouns (identifiers, proper names, file or screen names; drop generic words like "bug", "fix", "enemy", "ui").
   - `ls openspec/changes/archive/ | grep -i <noun>` for each noun.
   - `git log --since='60 days ago' --oneline | grep -i <noun>` for each noun.
   - A name match is evidence, not a verdict: open the matching `proposal.md` or `git show --stat <sha>` and confirm it addresses what the line asks. Only a confirmed match classifies the line `stale`.
3. **Classify** with the table and the investigate-before-asking rule. Every line under `## Balance` is `balance`, including lines ending in `?` and lines in French: the section is the user's and is never `ask`. The single exception is a Balance line that asks for a new mechanic or system (not a number change), which is `shallow` or `deep`.
4. **Create the issue** on GAME_REPO (every class except `balance`, which gets no issue at all):
   - Title: the stripped task text from step 1.3 (no checkbox, no painted fragment, no id), truncated to 120 characters.
   - Body:
     ```
     <!-- bw-pipeline -->
     **bw id:** <bw-id, e.g. bw-m0012>
     **Section:** <section>
     **Line:** <the stripped task text, untruncated>
     **Interpretation:** <one to three sentences: what the line asks, where in the code it lands (file:line from your grep), the smallest change that satisfies it>
     **Class:** <class>, because <the signal from the table>
     **Stale evidence:** <archived change dir or commit sha + subject, or "none">
     ```
   - Labels: `pipeline` plus the class. If adding a label fails because it does not exist, create it with the `mcp__github__*` label tool, then retry.
5. **Route by class:**
   - `quickfix`: spawn now (step 4.6) while fewer than QUICKFIX_PER_RUN quickfix sessions were spawned this run; otherwise leave the issue labelled `quickfix` without `in-progress`, and a later run spawns it (step 4 treats such issues as quickfix candidates, oldest first, under the same per-run cap). No WIP count, no hold.
   - `balance`: nothing. The user tunes balance by hand; the pipeline never opens an issue, proposes a value or touches a `.tres` for it. Write `status.json[id] = {issue: 0, state: balance, updated: now}` so the line is never re-triaged and the plugin paints it as the user's.
   - `stale`: post `done?` with the matching commit sha and subject or the archived change directory.
   - `human`: label only, no comment beyond the issue body.
   - `ask`: no comment now; the digest asks (step 5).
   - `shallow`, `deep`: nothing now; the gate (step 4) promotes them once the hold elapses.
6. Write `status.json[id] = {issue, state: <class>, updated: now}` (`issue: 0` for `balance`).

### 3. Reconcile existing entries

For each id already in `status.json` with an issue number above 0 (`balance` entries carry 0 and are skipped), read the issue state and labels and set `state` (and `updated` when it changes):

- Issue closed: `done`. Find any session tagged `bw:<bw-id>` (`mcp__Claude_Code_Remote__list_sessions`) and remove its `pipeline:active` tag with `mcp__Claude_Code_Remote__set_session_tags`.
- Label `review` or `proposed`: `review`. A `proposed` issue also releases its WIP slot: remove `pipeline:active` from its session as above.
- Label `in-progress`: `in-progress` (this includes an `approved` issue whose apply session runs).
- Label `approved` without `in-progress`: `review` (waiting for its apply slot).
- Otherwise the class label (`quickfix`, `balance`, `shallow`, `deep`, `human`, `ask`, `stale`). A worker that relabels itself (a quickfix that turned out to need a design, an explore session that hit the Fable limit) is picked up here.

### 3a. Follow the user's edits to TODO.md

The notes are the source of truth; an issue follows its line. For each id in `status.json` with an issue number above 0 whose issue is still open:

1. **Line gone or ticked.** The id no longer appears on an open `- [ ]` line of `queue/TODO.md` (deleted, or ticked by the user). If the issue is not `in-progress` and not `review`: post a marked comment `Removed from the TODO by the user; closing.` and close the issue, set state `done`. If it IS `in-progress` or `review`: do not close it and do not touch its branch or PR; post a marked comment `The TODO line was removed while work was in flight; the user decides whether to merge or close.` once (skip if that comment already exists), and leave it.
2. **Line text changed.** Compare the stripped task text (step 1.3) with the `**Line:**` field of the issue body. If they differ:
   - Rewrite the issue title and the `**Line:**` field to the new text, and post a marked comment quoting the old and new text with a fresh `**Interpretation:**` for the new text.
   - Re-classify the new text. If the class changes, swap the class label; the new class follows its normal route (a `balance` result closes the issue and sets `issue: 0` as in step 2.5).
   - If the issue is `in-progress` or `review`: post the comment only, and add the label `line-edited` so the worker sees it when the user next talks to it. Never respawn a session on an issue that already has one.
   - A `shallow` or `deep` issue still in its hold restarts the hold from this comment.
3. **Same text, same id**: nothing to do.

### 3b. Repair broken pipeline PRs

List open PRs on GAME_REPO whose head branch starts with `agent/bw-`. A PR needs repair when its mergeable state is conflicting (dirty) OR its latest CI check run concluded `failure`, AND no session tagged `repair:<pr number>` is still working (`mcp__Claude_Code_Remote__list_sessions`), AND its last pipeline comment is not a repair attempt from the past 6 hours. For at most REPAIR_PER_RUN such PRs, oldest first, spawn as in 4.6 with: model MODEL_QUICKFIX, the quickfix tool list, tags `["pipeline:repair", "repair:<pr number>", "bw:<bw-id>"]`, title `<bw-id> PR #<n> repair`, and prompt `Read .claude/skills/pipeline-quickfix/SKILL.md in the bonewake clone in full and follow its Repair mode for PR #<n> on ltorbay/bonewake (<bw-id>).` Repair sessions do not count toward WIP_LIMIT. Never repair a PR whose head branch does not start with `agent/bw-`: those are the user's.

### 4. Gate and spawn

1. **Fable availability:** a reading is trusted while its `read_at` is at most USAGE_TRUST_DAYS old. Trusted: `fable_ok = usage.fable_weekly_pct < FABLE_GATE_PCT`. Missing file, unparseable file, null `read_at` or an older reading means unknown, and unknown means `fable_ok = true`: the usage file is written by a Mac that is not always on, and the fallback covers a wrong guess (a Fable session that hits its rate limit re-labels its issue `waiting:fable` and ends). Never block deep work on a missing usage file.
2. **WIP:** `active = ` the number of sessions returned by `mcp__Claude_Code_Remote__list_sessions` that carry the tag `pipeline:active` AND are in a working status (an explore session idling on the user's reply still counts while its status is working).
3. **Apply hand-offs first.** Open issues labelled `approved` (the user accepted an explore proposal; the user or the explore session sets the label, nothing fires triage early) and without `in-progress` or `review`, oldest first, take WIP slots before any new explore: while `active < WIP_LIMIT`, spawn per 4.6 with model MODEL_QUICKFIX (Opus, always, whatever model wrote the proposal), tags `["pipeline:active", "bw:<bw-id>"]`, title `<bw-id> #<N> apply: <issue title, 60 chars>`, the quickfix tool list, and prompt `Read .claude/skills/pipeline-apply/SKILL.md in the bonewake clone in full and follow it for issue #<N> on ltorbay/bonewake (<bw-id>).` Then label `in-progress`, set status `in-progress`, `active += 1`. Before spawning, confirm `agent/<bw-id>-proposal` exists on the remote (`git -C GAME ls-remote origin agent/<bw-id>-proposal`); if not, post a marked comment that the proposal branch is missing and skip it.
3b. **Explore candidates:** open issues labelled `shallow` or `deep` without `in-progress`, `review`, `proposed` or `approved`, ordered by issue number ascending (oldest first). Skip a candidate when:
   - fewer than HOLD_HOURS have passed since its latest pipeline comment or, with none, since the issue was created;
   - any comment after the latest pipeline-authored one lacks the marker (a user correction). Handle it instead: re-read the line with the correction, reclassify or rewrite the interpretation in a new marked comment ("Updated interpretation: ..."), relabel if the class changed. The hold restarts from that comment.
4. While `active < WIP_LIMIT` and candidates remain, take the next one:
   - `deep`: if not `fable_ok`, add label `waiting:fable` and continue to the next candidate. Never degrade deep to Opus.
   - `shallow`: model is MODEL_EXPLORE when `fable_ok`, else MODEL_QUICKFIX (Opus).
   - Remove `waiting:fable` if present, spawn (4.6) with effort `medium` for shallow and `high` for deep, `active += 1`.
5. Issues labelled `waiting:fable` stay in the candidate list; they start on the first run where `fable_ok` holds.
6. **Spawn** with `mcp__Claude_Code_Remote__create_session`. Its accepted fields are exactly `append_system_prompt`, `blob_limit_kb`, `clone_depth`, `environment_id`, `extra_allowed_tools`, `model`, `outcome_branch`, `permission_mode`, `prompt`, `source_revision`, `source_url`, `sparse_checkout_paths`, `tags`, `title` (verified 2026-10-12). Set:
   - `environment_id`: ENVIRONMENT_ID (the Bonewake environment; it runs `tools/cloud_setup.sh`, so Godot and Rust exist. The Default environment has no Godot).
   - `source_url`: `https://github.com/ltorbay/bonewake`. One repository only: the worker never sees the queue repo or the jigs repo, so everything it needs (bw id, section, class, interpretation, the full line) must already be in the issue body, and it reads its skill from that clone (`.claude/skills/pipeline-<quickfix|explore>/SKILL.md`, prompt below). `status.json` is written by triage alone.
   - `model`: MODEL_QUICKFIX for quickfix; per 4.4 for explore.
   - `title`: `<bw-id> #<N> <quickfix|explore>: <issue title, truncated to 60 characters>`.
   - `tags`: explore `["pipeline:active", "bw:<bw-id>"]`; quickfix `["pipeline:quickfix", "bw:<bw-id>"]` (quickfix sessions stay out of the WIP count).
   - `extra_allowed_tools`, listed explicitly with the exact names you resolved with `ToolSearch`:
     - quickfix: `Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`, `PushNotification`, `mcp__Claude_Code_Remote__send_later`, `mcp__bf7c680d-5fdc-5ef4-b4a0-abadb619bf0a__send_later`, and the `mcp__github__*` tools to read an issue and its comments, comment on an issue, add and remove issue labels, create a pull request, read and update a pull request, comment on a pull request, and read workflow runs and job logs.
     - explore: `Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep` (it runs git and `openspec` and writes the change directory), `PushNotification`, `mcp__Claude_Code_Remote__send_later`, `mcp__bf7c680d-5fdc-5ef4-b4a0-abadb619bf0a__send_later`, and the `mcp__github__*` tools to read an issue and its comments, comment on an issue, and add and remove issue labels.
   - Effort (explore only): there is no effort field. Make `Reasoning effort: <high|medium>` the first line of `prompt` AND of `append_system_prompt`.
   - `append_system_prompt`: explore `Reasoning effort: <high|medium>` then the line below; quickfix the line below alone: `You are a worker of the Bonewake TODO pipeline for issue #<N> (<bw-id>) on ltorbay/bonewake. Your instructions are the skill file named in your prompt; read it first and follow it exactly.`
   - `prompt`, quickfix: `Read .claude/skills/pipeline-quickfix/SKILL.md in the bonewake clone in full and follow it for issue #<N> on ltorbay/bonewake (<bw-id>).`
   - `prompt`, explore: first line `Reasoning effort: <high|medium>`, then `Read .claude/skills/pipeline-explore/SKILL.md in the bonewake clone in full and follow it for issue #<N> on ltorbay/bonewake (<bw-id>), effort <medium|high>.`
   - Leave `outcome_branch`, `permission_mode`, `source_revision`, `clone_depth`, `sparse_checkout_paths` and `blob_limit_kb` unset unless the schema marks one required.
   - Then label the issue `in-progress` and set `status.json[id].state = in-progress`.
   - If `create_session` fails, do not label the issue `in-progress`; post a marked comment with the error and stop spawning for this run.

### 5. Ask digest

The digest posts once per day at DIGEST_TIME_PARIS (13:05 Europe/Paris, midday, inside the allowed hours). Compute both clocks at run time (`TZ=Europe/Paris date +'%u %H:%M'`, and the UTC instant of today's or tomorrow's 13:05 Paris with `date -u -d 'TZ="Europe/Paris" <YYYY-MM-DD> 13:05' +%FT%TZ`); never hardcode a UTC hour, the offset changes with daylight saving time. Track it with labels only: `digest:scheduled` (queued for today's digest) and `asked` (question posted).

1. Pending = open issues labelled `ask` without `asked`.
2. If Paris time is between 13:05 and 14:04, or this run was woken by a message saying "post the pipeline digest": for each pending issue post one marked comment holding one question that carries your best guess ("I read this as X, touching `file`. Is that right, or Y?"), label it `asked`, remove `digest:scheduled`. Then write, as your final message of the turn, the numbered list of those questions with their issue numbers and bw ids, each with your recommended answer, ending with `Reply here with a number per question (or "all as recommended").` Then call `PushNotification` with message `Pipeline digest: <n> question(s), reply here` and status `proactive`, and end the turn. The user answers IN THIS SESSION from the Claude app, never on GitHub; the issue comments are the record, not the conversation. Skip all of it when pending is empty.
3. Otherwise, if pending is non-empty: when NO open issue (pending or not) already carries `digest:scheduled`, call `mcp__Claude_Code_Remote__send_later` to deliver `post the pipeline digest` to this session at the next 13:05 Europe/Paris (converted to UTC at run time); when one already does, an earlier run's session holds today's digest and will post every `ask` issue it finds at 13:05, so schedule nothing. In both cases label every pending issue `digest:scheduled`. One digest session per day, never one per run. If `send_later` cannot target a time or this session, skip it: the hourly run that lands between 13:05 and 14:04 Paris posts the digest by rule 2. The digest push obeys Quiet hours like any other.
4. **When the user's reply wakes this session** (the digest session re-wakes on a phone reply): parse the answers, and for each answered issue reclassify from the answer, swap the `ask` label for the new class, write the new interpretation in a marked comment that quotes the answer, then run steps 4 (gate and spawn, so a quickfix answer starts at once) and 6 (status push). "All as recommended" accepts every recommended answer. A question the reply does not cover stays `asked`. Then end the turn without a new push. The next hourly run picks up anything you could not finish. A user comment on an `asked` issue (no marker, after the question) counts as an answer too and is handled the same way on the next run; it is the fallback, not the expected path.

### 6. Write status and push

1. Re-read `QUEUE/queue/status.json` from disk, apply every change from this run to that fresh copy (read-modify-write, never overwrite with a stale in-memory object), write it back with sorted keys and two-space indent.
2. If nothing changed, stop without committing.
3. Set a local identity if none is configured (`git -C QUEUE config user.name "bw-pipeline"`, `user.email "bw-pipeline@users.noreply.github.com"`), then `git -C QUEUE add queue/status.json`, commit `triage: <a> new, <b> updated`, `git -C QUEUE push origin main`.
4. On a rejected push (the plugin pushed `TODO.md` meanwhile): `git -C QUEUE pull --rebase origin main`, push once more. Never force-push the queue.

### 7. End

End the run with a short log: new ids by class, issues spawned (quickfix / explore with model), WIP before and after, `fable_ok`, digest action, pushed sha.

## Hard rules

- Never commit, push or branch in the bonewake clone. Never push `main` of `ltorbay/bonewake`.
- Never apply, propose or comment on a balance change; a `balance` line is recorded in status.json and nothing else.
- Never close an issue; the user closes (or a merged PR with `Closes #N` does).
- Never spawn a second session for an issue already labelled `in-progress` or `review`; a `proposed` issue gets exactly one more session, the apply, and only once it is `approved`.
- One question per `ask` issue, always with your guess.

## Gotchas (2026-10-12)

- **The Claude_Code_Remote connector has two tool names in child sessions**: `mcp__Claude_Code_Remote__<tool>` and the raw `mcp__bf7c680d-5fdc-5ef4-b4a0-abadb619bf0a__<tool>`. Children called the raw form, which an allow list naming only the friendly form does not cover, and every call raised a permission prompt on the user's phone. Grant both forms for any connector tool a child needs.

- **`create_session` was verified on 2026-10-12** from a routine: the field list in step 4.6 is exhaustive, `claude-fable-5-1` is accepted and the child reports `configured_model` `claude-fable-5-1`. There is no effort field and `source_url` takes one repository; both constraints shape step 4.6.
- **Workers read their skill from the bonewake clone** (`.claude/skills/pipeline-<x>/SKILL.md` on `main`), and this routine reads its own from the same place. `ltorbay/jigs` is the public mirror of the three files; an edit reaches the pipeline only once it is on bonewake `main`. A spawned session with no marked comment on its issue within a few hours means the worker could not follow its skill.
- **`send_later` targeting was not exercised.** Read its schema before the first call; do not guess field names.
- **Issue author identity is unknown.** GitHub calls made through `mcp__github__*` may be attributed to the user's own account, so "a comment by the user" cannot be detected by login. The `<!-- bw-pipeline -->` marker is the only discriminator; never omit it.
- **Issue creation and the status push are not atomic.** A run that dies between them leaves an issue with no status entry; the dedupe search in step 2.1 is what prevents a duplicate issue next hour. Never skip it.
- **A reply from the phone re-wakes the session that sent the push.** That is why the digest push is the only push this routine sends, and why the digest session must be able to finish the triage of an answered issue itself: the next hourly run is a different session with no memory of the answer. Worker sessions own their own conversations the same way.
