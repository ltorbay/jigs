# Verify Protocol — project verification gates

(Injected by the `UserPromptExpansion` hook only when the OpenSpec verify command runs. Supplements the generated verify steps; where they conflict, this wins.)

**1. Run the suite. Never infer test coverage from grep alone.**

```bash
<TEST_COMMAND> | grep -E '^\[(FAIL|DONE)'
```

A verification report produced without executing the suite is incomplete. Any `[FAIL]` line is a CRITICAL finding regardless of what the artifact mapping says.

**2. Anything the user sees needs the manual ladder.** If the diff touches scenes, UI scripts, visuals, animation or feel, the report MUST include a user repro script (entry point, steps, one checkable expected observation), per the project `verify` skill. Keyword search cannot verify pixels; say so explicitly instead of marking visual scenarios "covered".

**3. CLAUDE.md impact check.** List every root or per-folder `CLAUDE.md` section whose documented invariants this change altered (new system, changed rule, now-false claim). Each un-updated one is a WARNING naming the exact file and section. CLAUDE.md edits are deliberately Drift-Protocol-gated mid-apply, so verify is where this debt must surface, before archive buries it.

**4. Coverage verdicts cite evidence.** A requirement marked "implemented" needs `file:line` from an actual read; a scenario marked "covered" names the suite and the test method. Keyword-hit counts are not evidence.
