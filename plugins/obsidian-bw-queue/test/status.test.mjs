import { test } from "node:test";
import assert from "node:assert/strict";
import { glyphFor, parseStatus, repaint, repaintLine } from "../test-build/status.mjs";

const status = parseStatus(JSON.stringify({
  "bw-m0001": { issue: 12, state: "queued", updated: "2026-10-12T10:00:00Z" },
  "bw-m0002": { issue: 13, state: "deep", updated: "2026-10-12T10:00:00Z" },
  "^bw-m0003": { issue: 14, state: "done", updated: "2026-10-12T10:00:00Z" },
  "bw-m0004": { issue: 15, state: "balance" },
  "bw-m0005": { issue: 16, state: "human" },
  "bw-m0006": { issue: 17, state: "nonsense" },
}));

test("glyph mapping follows the brief", () => {
  const expected = {
    queued: "⏳", ask: "⏳", quickfix: "🔎", shallow: "🔎", deep: "🔎", "in-progress": "🔎",
    review: "🔎", balance: "⚖", human: "👤", done: "✅", stale: "✅",
  };
  for (const [state, glyph] of Object.entries(expected)) assert.equal(glyphFor(state), glyph);
  assert.equal(glyphFor("toString"), undefined);
});

test("parseStatus drops unknown states and normalizes caret keys", () => {
  assert.deepEqual(Object.keys(status).sort(), ["bw-m0001", "bw-m0002", "bw-m0003", "bw-m0004", "bw-m0005"]);
  assert.throws(() => parseStatus("[]"));
});

test("repaintLine appends glyph and issue before the id", () => {
  assert.equal(repaintLine("- [ ] fix the bomb ^bw-m0001", status), "- [ ] fix the bomb ⏳ #12 ^bw-m0001");
});

test("repaintLine replaces a previous glyph fragment", () => {
  assert.equal(repaintLine("- [ ] rework AI ⏳ #13 ^bw-m0002", status), "- [ ] rework AI 🔎 #13 ^bw-m0002");
  assert.equal(repaintLine("- [ ] nerf ⚖️ #15 ^bw-m0004", status), "- [ ] nerf ⚖ #15 ^bw-m0004");
  assert.equal(repaintLine("- [ ] x 🔎 #9 ✅ #9 ^bw-m0003", status), "- [ ] x ✅ #14 ^bw-m0003");
});

test("repaint is idempotent", () => {
  const text = ["- [ ] a ^bw-m0001", "- [x] b ^bw-m0003", "- [ ] c ^bw-m0005", "- [ ] d ^bw-m0004"].join("\n");
  const once = repaint(text, status);
  assert.equal(repaint(once, status), once);
  assert.equal(once, ["- [ ] a ⏳ #12 ^bw-m0001", "- [x] b ✅ #14 ^bw-m0003", "- [ ] c 👤 #16 ^bw-m0005", "- [ ] d ⚖ #15 ^bw-m0004"].join("\n"));
});

test("repaint leaves unknown ids and id-less lines untouched", () => {
  const text = "- [ ] untracked ^bw-m0099\n- [ ] no id\n- [ ] bad state ⏳ #3 ^bw-m0006\nprose";
  assert.equal(repaint(text, status), text);
});

test("repaint keeps CRLF endings and the id last", () => {
  assert.equal(repaint("- [ ] a ^bw-m0001\r\n", status), "- [ ] a ⏳ #12 ^bw-m0001\r\n");
});

test("repaint matches ids from every device letter", () => {
  const multi = parseStatus(JSON.stringify({
    "bw-m0001": { issue: 1, state: "review" },
    "^bw-p0001": { issue: 2, state: "human" },
  }));
  const text = "- [ ] mac ^bw-m0001\n- [ ] phone ⏳ #2 ^bw-p0001\n- [ ] other ^bw-q0001";
  const painted = "- [ ] mac 🔎 #1 ^bw-m0001\n- [ ] phone 👤 #2 ^bw-p0001\n- [ ] other ^bw-q0001";
  assert.equal(repaint(text, multi), painted);
  assert.equal(repaint(painted, multi), painted);
});

test("repaint does not touch an issue reference that is part of the text", () => {
  assert.equal(repaintLine("- [ ] see #4 for context ^bw-m0001", status), "- [ ] see #4 for context ⏳ #12 ^bw-m0001");
});
