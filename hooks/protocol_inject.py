#!/usr/bin/env python3
"""Claude Code hook — event: UserPromptExpansion.

Trigger: fires every time a prompt-type slash command expands. It no-ops
(exit 0, no output) unless the command name contains one of the NEEDLES
below, i.e. only when an OpenSpec apply / archive / verify command runs.

Purpose: inject the matching protocol file (hooks/protocols/*.md) as
`additionalContext`, so the anti-drift rules cost zero always-on context.
They appear exactly at the step where the agent could drift (editing a
pre-existing test mid-apply, hand-merging a spec at archive, reporting
"verified" without running the suite), and nowhere else.

Install: copy to .claude/hooks/ and the protocols to .claude/protocols/,
then register in .claude/settings.json (see hooks/settings.example.json).

Configuration is the three constants below. The verify needle is namespaced
("opsx:verify") because a bare "verify" would collide with a project-level
/verify skill (the one shipped in skills/verify).
"""
import json
import os
import sys
import time

# (substring of the expanded command name, protocol file to inject)
NEEDLES = (
    ("apply", "apply.md"),
    ("archive", "archive.md"),
    ("opsx:verify", "verify.md"),
)
# Relative to the project dir. Override with PROTOCOL_DIR for a non-standard layout.
PROTOCOL_DIR = os.environ.get("PROTOCOL_DIR", os.path.join(".claude", "protocols"))
# Append-only observability log, one line per fire. Keep it gitignored. Empty = off.
LOG_FILE = os.environ.get("PROTOCOL_INJECT_LOG", os.path.join(".claude", "hooks", "protocol_inject.log"))


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return  # malformed input: inject nothing, never block

    command_name = str(data.get("command_name") or "").lower()
    base = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()

    target = None
    for needle, filename in NEEDLES:
        if needle in command_name:
            target = filename
            break

    if LOG_FILE:
        try:
            with open(os.path.join(base, LOG_FILE), "a", encoding="utf-8") as log:
                log.write("%s\t%s\t-> %s\n" % (
                    time.strftime("%Y-%m-%dT%H:%M:%S"),
                    command_name or "(empty)",
                    target or "(no inject)",
                ))
        except OSError:
            pass

    if target is None:
        return

    path = os.path.join(base, PROTOCOL_DIR, target)
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return

    json.dump({
        "hookSpecificOutput": {
            "hookEventName": "UserPromptExpansion",
            "additionalContext": text,
        }
    }, sys.stdout)


if __name__ == "__main__":
    main()
