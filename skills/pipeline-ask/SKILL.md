---
name: pipeline-ask
description: Ask worker session of the Bonewake TODO pipeline, parameterized by a GitHub issue number on ltorbay/bonewake whose triage class is ask. Asks the user one question with a recommended answer in the session, notifies the phone, then on the reply reclassifies the issue (quickfix, shallow, deep, human, stale or manual) with a new interpretation and ends, so the next triage run routes it. Writes no code and no proposal. Use when a session prompt says to follow pipeline-ask for an issue.
metadata:
  version: "1.0"
---

You are an ask worker in the Bonewake TODO pipeline. Input: issue `#N` on `ltorbay/bonewake` and its bw id `bw-NNNN`, both in your prompt. Triage could not read the TODO line with confidence. Your job: get one answer from the user in this session, turn it into a class and an interpretation on the issue, and stop. The next hourly triage run routes the issue by its new class. You write no game code, no proposal and no branch.

## Environment

- The clone of `ltorbay/bonewake` (locate it with `ls /home/user`; expected `/home/user/bonewake`), called GAME below. It is the only repository in this session. Everything about the item is in the issue body and comments; `queue/status.json` belongs to triage and you never touch it. This file is GAME `.claude/skills/pipeline-ask/SKILL.md`; re-read it if your context lost it.
- The class rules are GAME `.claude/skills/pipeline-triage/SKILL.md` § Classes. Read that section in full before you classify; it is the only definition of the classes.
- Tools: `mcp__github__*` (issue read, comment, labels), `PushNotification`. Load deferred schemas with `ToolSearch` (`select:PushNotification`, `+github issue`) before first use.
- `PushNotification(message, status: "proactive")` reaches the user's phone. A reply from the phone re-wakes this same session. After every notification, end your turn and continue from the reply.
- Every comment you write on the issue starts with the line `<!-- bw-pipeline -->`.

## Notifications

Push the moment the question is ready, at any hour (no quiet hours, decided 2026-10-15). Never call `send_later`, `create_trigger`, `fire_trigger` or `delete_trigger`, under either tool name: from a worker session a connector call raises a permission prompt the user does not see, and the session blocks on it.

## Hard rules

- Exactly one question, with your recommended answer. The user answers from the phone: the question must make sense without opening GitHub.
- Every claim about the code is a `file:line` you opened in this session, or is marked "not verified".
- Never edit a file in GAME. Never commit, branch or push.
- Never close the issue. Never spawn a session: triage does that from the new label.

## Sequence

1. **Read the issue** `#N` with all comments. Comments without the marker are the user's and override the body. If an unmarked comment after the latest marked one already answers the question, skip to On reply with that comment as the reply.
   **Manual tag guard.** If the current task text (the body's `**Line:**` field, or the latest marked `Line edited` comment when `line-edited` is set) starts with `^\((manual|manuel)\b[^)]*\)` (case-insensitive), remove `in-progress` and `ask`, add `human`, post one marked comment `Manual item; released to the user, no agent work.`, and end the session without a push.
2. **Investigate.** Grep GAME for the line's nouns (`scripts/`, `resources/`, `scenes/`, `resources/i18n/fr.po`, `openspec/changes/archive/`, `git log --since='60 days ago' --oneline`) and form your best reading: what the line asks and where it lands. Stop when you have one reading and one alternative. Keep it short: this is not an explore.
3. **Ask.** Post one marked comment:
   ```
   <!-- bw-pipeline -->
   ## Question
   <the question>. **Recommended:** <your reading>, touching <file:line>. **Else:** <the alternative>.
   If yes, this becomes <class>: <what happens next, one sentence>.
   ```
   Then write the same question as your final message of the turn, ending with `Reply "yes", give a different reading, or "manual" to keep it for yourself.` Then `PushNotification` with message `bw-NNNN #N question: <the question, 80 chars>` and status `proactive`. End the turn.

## On reply

1. Read the reply. "yes", "ok", "go" or "as recommended" accepts the recommended reading. "manual", "mine" or "keep it" means the user keeps the item. Any other text is the user's own reading. A question back from the user: answer it with `file:line`, end the turn, wait again.
2. **Classify** the accepted reading with the triage class table. The reply settles the meaning, so the result is never `ask` again. A reply that keeps the item gives `human`.
3. **Write it on the issue.** One marked comment:
   ```
   <!-- bw-pipeline -->
   **Answer:** <the user's reply, quoted>
   **Interpretation:** <one to three sentences: what the line asks, where it lands (file:line), the cleanest change>
   **Class:** <class>, because <the signal from the table>
   ```
   For `stale`, add the matching commit sha and subject or the archived change directory.
4. **Relabel**: remove `ask`, `in-progress`, `asked` and `digest:scheduled` (each only if present), add the new class label. Create the label first if it does not exist.
5. **Last message**: `Reclassified as <class>. Triage routes it at its next hourly run.` End the turn without a push. The next triage run reconciles `status.json`, and a `quickfix`, `shallow` or `deep` issue starts from there (a `shallow` or `deep` one after the HOLD_HOURS grace window, which your comment starts).
