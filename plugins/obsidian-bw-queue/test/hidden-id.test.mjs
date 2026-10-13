import { test } from "node:test";
import assert from "node:assert/strict";
import { clampCursor, findHiddenId, findHiddenIdRange } from "../test-build/hidden-id.mjs";

test("hides the trailing id with its leading space", () => {
  const line = "- [ ] fix the bomb ^bw-m0012";
  assert.deepEqual(findHiddenIdRange(line), [18, line.length]);
  assert.equal(line.slice(18), " ^bw-m0012");
  assert.equal(findHiddenId(line).id, "bw-m0012");
});

test("keeps the painted status fragment visible", () => {
  const line = "- [ ] rework AI 🔎 #13 ^bw-p0002";
  const [from, to] = findHiddenIdRange(line);
  assert.equal(line.slice(0, from), "- [ ] rework AI 🔎 #13");
  assert.equal(line.slice(from, to), " ^bw-p0002");
});

test("swallows trailing whitespace after the id", () => {
  const line = "- [ ] a ^bw-m0001  ";
  assert.deepEqual(findHiddenIdRange(line), [7, line.length]);
});

test("accepts legacy ids without a letter", () => {
  assert.deepEqual(findHiddenIdRange("- [x] old ^bw-0003"), [9, 18]);
});

test("returns null when there is no trailing id", () => {
  for (const line of ["- [ ] no id", "", "- [ ] mid ^bw-m0001 text", "- [ ] other ^abc123", "- [ ] glued^bw-m0001", "- [ ] short ^bw-m001"]) {
    assert.equal(findHiddenIdRange(line), null, line);
  }
});

test("clampCursor leaves positions before the hidden range alone", () => {
  const line = "- [ ] a ^bw-m0001";
  assert.equal(clampCursor(line, null, 3, true), 3);
  assert.equal(clampCursor(line, null, 7, true), 7);
  assert.equal(clampCursor("- [ ] no id", null, 11, true), 11);
});

test("clampCursor pulls a click or End at the line end back before the id", () => {
  const line = "- [ ] a ^bw-m0001";
  assert.equal(clampCursor(line, null, line.length, true), 7);
  assert.equal(clampCursor(line, 30, line.length, true), 7);
  assert.equal(clampCursor(line, null, 12, true), 7);
});

test("clampCursor lets a forward step past the id reach the next line", () => {
  const line = "- [ ] a ^bw-m0001";
  assert.equal(clampCursor(line, 7, line.length, true), line.length + 1);
  assert.equal(clampCursor(line, 7, line.length, false), 7);
});
