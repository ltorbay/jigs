---
name: pipeline-handoff
description: Hand an OpenSpec change that was proposed and approved in a desktop session to the Bonewake TODO pipeline, so that triage starts a pipeline-apply session for it. Picks the next free bw-cNNNN id, makes the proposal reachable (proposal branch or main), opens the labelled GitHub issue on ltorbay/bonewake and posts the marked Proposal comment. Use when the user says "create an issue so triage applies it", "hand this to the pipeline", "let the pipeline apply it", or wants an approved desktop proposal implemented by a cloud apply session.
metadata:
  version: "1.0"
---

Use this skill in a desktop session after the user approves an OpenSpec change that you wrote with them (`/opsx:explore`, `/opsx:propose`). The pipeline then applies it like a change from its own explore sessions. Precedents: #368 (`bw-c0001`), #522 (`bw-c0002`), #544 (`bw-c0003`).

## Why this exists

`docs/PIPELINE.md` decision 1 says that the notes are the only entry point. A desktop hand-off is the one exception: the work started in a session with the user, so there is no TODO line. The `c` series of bw ids marks these issues. On 2026-11-06 the issues showed device ids in `a`, `e`, `s` and `u` only, and `c` only on hand-offs. If a device ever gets the letter `c`, ask the user for another letter.

What the pipeline does with such an issue:
- **Triage step 4.3** starts the apply for any open issue labelled `approved` without `in-progress` or `review`. Before it spawns, it requires that the proposal can be reached: the branch `agent/<bw-id>-proposal` exists on the remote, or the change named by the latest marked `## Proposal:` comment exists as `openspec/changes/<name>/` on `origin/main`. If neither holds, triage posts a "proposal missing" comment and skips the issue.
- **The issue is not in `queue/status.json`**, so triage step 3a never closes it for a missing TODO line. In the apply order it sorts after every issue that has a TODO line. The load cap and the WIP limit still apply.
- **`pipeline-apply` step 1** branches `agent/<bw-id>` from the proposal branch, or from `origin/main` when the change is already there. The issue thread is the apply session's whole contract: it has no memory of your session.

## Steps

1. **Check that the change is final.** `openspec validate <name> --strict` passes, and every mockup or image that the change cites is inside `openspec/changes/<name>/` (for example `mockup/`), so it travels with the change.

2. **Pick the next id.** List every `c` id that is used, then take the highest plus one, as four digits:
   ```bash
   gh issue list -R ltorbay/bonewake --state all --limit 1000 --json body \
     --jq '.[].body | capture("\\*\\*bw id:\\*\\* *bw-c(?<n>[0-9]{4})").n' | sort -u
   ```
   Read the `**bw id:**` field, not plain text: other issues mention `c` ids in their text (#506 mentions `bw-c0002`). If the list is empty, start at `bw-c0001`.

3. **Make the proposal reachable.** Choose one route and tell the user which one:
   - **Proposal branch (the precedent, recommended when you can push).** Commit the change directory on `agent/bw-cNNNN-proposal` and push that branch. The user pushes nothing, and the apply PR carries both the proposal and the implementation. On a desktop checkout, SSH can fail (`Permission denied (publickey)` was seen on 2026-11-06); if `git push` fails, use the main route.
   - **Main.** Commit the change directory on local `main` (root `CLAUDE.md`: local commits go on `main`). You never push `main`, so the user must push it. Triage skips the issue until the commit is on `origin/main`.

4. **Open the issue.** Title: one line that names the change in words. Labels: `pipeline`, `deep`, `approved`. Body, exactly in this shape:
   ```
   <!-- bw-pipeline -->
   **bw id:** bw-cNNNN
   **Section:** (direct from a desktop explore session, no TODO line)
   **Line:** <one sentence: what the change does>
   **Interpretation:** Explored and proposed in a desktop session with the user on <YYYY-MM-DD>. The OpenSpec change `<name>` is on <branch `agent/bw-cNNNN-proposal` | `main` (commit `<sha>`)> and the user approved it for apply. <The visual contract, when there is one: path inside the change dir.>
   **Class:** deep (proposal already written and approved; route straight to pipeline-apply).
   **Stale evidence:** none
   ```
   Use `gh issue create -R ltorbay/bonewake --body-file <file> --label pipeline --label deep --label approved`. Write the body file in your scratchpad, not in the repo.

5. **Post the Proposal comment.** This is the line that triage and pipeline-apply read for the change name. Start it with the marker:
   ```
   <!-- bw-pipeline -->
   ## Proposal: `<name>`
   **Branch:** <`agent/bw-cNNNN-proposal` | none. The change is on `main` (commit `<sha>`). Branch `agent/bw-cNNNN` from `origin/main`.>

   **Decisions (from the session, <YYYY-MM-DD>):**
   - <each decision the user made, with the rejected options and why>

   <Any step where the apply session must stop and show the user something, and any open check.>

   ---
   _Generated by [Claude Code](https://claude.ai/code)_
   ```
   Put the decisions here, not only in `design.md`. The apply session re-reads the thread, and a later correction in the thread takes priority over the artifacts.

6. **Report to the user.** Give the issue link, the id, the route and what is left for them. On the main route that is the push of `main`. Then the next hourly triage run starts the apply when the load cap allows it.

## Gotchas

- Never invent an id in a device letter (`m`, `u`, `e`, ...). Those belong to the Obsidian plugin.
- Never write `queue/status.json` or the queue repo. Triage owns them.
- Every pipeline comment starts with `<!-- bw-pipeline -->`. It is the only way pipeline agents tell their own comments from the user's (`pipeline-triage` § Gotchas).
- Do not add `in-progress` or `review`. Triage adds `in-progress` when it starts the apply, and the apply session moves the issue to `review` when it opens its PR.
- One issue per change. If the user changes a decision after the hand-off, post a new marked comment on the same issue. Do not open a second one.
