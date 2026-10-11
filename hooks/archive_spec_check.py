#!/usr/bin/env python3
"""Claude Code hook — event: PostToolUse, matcher: Bash.

Trigger: fires after every Bash tool call; no-ops unless the command text
contains `openspec archive`.

Purpose: `openspec archive` writes newly *created* main specs with a
placeholder Purpose ("TBD - created by archiving change ...") and never
touches openspec/specs/INDEX.md. Left alone, the spec-index meta-suite
(tests/meta/spec_index_suite.gd) fails on the next run, and the agent that
archived has usually already reported "done". This hook scans
openspec/specs/ right after the archive and injects a blocking reminder
listing every spec with a TBD/missing Purpose and every spec absent from
the index. Silent (exit 0, no output) when the tree is clean.

The hook only reads; the agent authors the Purpose lines and reruns the
index tool. That keeps a human-readable sentence per spec, which is what
agents grep to find the right spec later.
"""
import json
import os
import sys

SPECS_DIR = os.path.join("openspec", "specs")
INDEX_FILE = "INDEX.md"
# Commands named in the reminder. Adjust to your layout.
INDEX_TOOL = os.environ.get("SPEC_INDEX_TOOL", "tools/spec_index.sh")
TEST_TOOL = os.environ.get("PROJECT_TEST_TOOL", "tools/test.sh")


def first_purpose_line(text: str) -> str:
    in_purpose = False
    for line in text.splitlines():
        if line.strip() == "## Purpose":
            in_purpose = True
            continue
        if in_purpose:
            if line.startswith("## "):
                return ""
            if line.strip():
                return line.strip()
    return ""


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    if data.get("tool_name") != "Bash":
        return
    command = str((data.get("tool_input") or {}).get("command") or "")
    if "openspec archive" not in command:
        return

    base = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    specs_dir = os.path.join(base, SPECS_DIR)
    if not os.path.isdir(specs_dir):
        return

    names = []
    bad_purpose = []
    for name in sorted(os.listdir(specs_dir)):
        spec_path = os.path.join(specs_dir, name, "spec.md")
        if not os.path.isfile(spec_path):
            continue
        names.append(name)
        try:
            with open(spec_path, encoding="utf-8") as f:
                text = f.read()
        except OSError:
            continue
        purpose = first_purpose_line(text)
        if not purpose or purpose.startswith("TBD"):
            bad_purpose.append(name)

    try:
        with open(os.path.join(specs_dir, INDEX_FILE), encoding="utf-8") as f:
            index_text = f.read()
    except OSError:
        index_text = ""
    unindexed = [n for n in names if ("- **%s**" % n) not in index_text]

    if not bad_purpose and not unindexed:
        return

    msg = ["openspec archive left spec hygiene debt; the spec-index suite WILL fail. Fix before reporting done:"]
    if bad_purpose:
        msg.append("- TBD/missing Purpose: %s (author a one-line Purpose in each spec.md)" % ", ".join(bad_purpose))
    if unindexed:
        msg.append("- absent from %s/%s: %s" % (SPECS_DIR, INDEX_FILE, ", ".join(unindexed)))
    msg.append("Then run %s to regenerate the index, and %s to confirm." % (INDEX_TOOL, TEST_TOOL))
    json.dump({
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": "\n".join(msg),
        }
    }, sys.stdout)


if __name__ == "__main__":
    main()
