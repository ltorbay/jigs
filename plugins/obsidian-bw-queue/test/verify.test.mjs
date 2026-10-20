import { test } from "node:test";
import assert from "node:assert/strict";
import { checkId, EMPTY_NOTE, mergeVerify, parseVerify, readCursor } from "../test-build/verify.mjs";

const URL = "https://github.com/ltorbay/bonewake/pull/";
const item = (seq, group, text, pr = 300) => ({ seq, pr, group, text });
const line = (seq, text, pr = 300) => `- [ ] ${text} [#${pr}](${URL}${pr}) ^${checkId(seq)}`;

const NOTE = [
  "---",
  "verify_cursor: 2",
  "---",
  "Intro.",
  "",
  "## Scenario Launcher",
  "",
  line(1, "one"),
  "",
  "## Phone",
  "",
  line(2, "two"),
  "",
].join("\n");

test("checkId pads to four digits", () => {
  assert.equal(checkId(7), "vf-0007");
  assert.equal(checkId(12345), "vf-12345");
});

test("parseVerify keeps valid items in seq order", () => {
  const json = JSON.stringify({
    next_seq: 9,
    harvested_prs: [1],
    items: [item(5, "Run", "b"), item(3, "Run", "a"), { seq: 4, pr: 1, group: "Run", text: "x\ny" }, { seq: "6" }],
  });
  assert.deepEqual(parseVerify(json).map((i) => i.seq), [3, 5]);
  assert.throws(() => parseVerify("[]"));
  assert.throws(() => parseVerify("{}"));
});

test("readCursor reads the frontmatter, else 0", () => {
  assert.equal(readCursor(NOTE), 2);
  assert.equal(readCursor("no frontmatter\nverify_cursor: 9\n"), 0);
  assert.equal(readCursor("---\ntitle: x\n---\n"), 0);
  assert.equal(readCursor(EMPTY_NOTE), 0);
});

test("items at or below the cursor are skipped and the note is unchanged", () => {
  assert.equal(mergeVerify(NOTE, [item(1, "Phone", "again"), item(2, "Run", "again")]), NOTE);
});

test("a new item lands at the end of its section and moves the cursor", () => {
  const out = mergeVerify(NOTE, [item(3, "Scenario Launcher", "three")]);
  assert.equal(readCursor(out), 3);
  const lines = out.split("\n");
  const at = lines.indexOf(line(3, "three"));
  assert.equal(lines[at - 1], line(1, "one"));
  assert.equal(lines[at + 1], "");
  assert.equal(lines[at + 2], "## Phone");
});

test("a missing heading is created at the end of the note", () => {
  const out = mergeVerify(NOTE, [item(3, "Run", "three"), item(4, "Run", "four")]);
  assert.ok(out.endsWith(`## Phone\n\n${line(2, "two")}\n\n## Run\n\n${line(3, "three")}\n${line(4, "four")}\n`));
});

test("an id already in the note is not inserted twice, but the cursor still moves", () => {
  const seeded = mergeVerify(NOTE, [item(3, "Phone", "three")]).replace("verify_cursor: 3", "verify_cursor: 2");
  const out = mergeVerify(seeded, [item(3, "Phone", "three"), item(4, "Phone", "four")]);
  assert.equal(out.split(`^${checkId(3)}`).length, 2);
  assert.equal(readCursor(out), 4);
  assert.ok(out.endsWith(`${line(3, "three")}\n${line(4, "four")}\n`));
});

test("an empty section gets a blank line under its heading", () => {
  const note = "---\nverify_cursor: 0\n---\n## Tutorial\n## Phone\n";
  const out = mergeVerify(note, [item(1, "Tutorial", "t")]);
  assert.equal(out, `---\nverify_cursor: 1\n---\n## Tutorial\n\n${line(1, "t")}\n\n## Phone\n`);
});

test("a note without frontmatter, or without the key, gains the cursor", () => {
  assert.ok(mergeVerify("Hello\n", [item(1, "Run", "r")]).startsWith("---\nverify_cursor: 1\n---\nHello\n"));
  const keyless = mergeVerify("---\ntags: x\n---\nBody\n", [item(1, "Run", "r")]);
  assert.ok(keyless.startsWith("---\ntags: x\nverify_cursor: 1\n---\nBody\n"));
});

test("the empty note template takes items", () => {
  assert.equal(mergeVerify(EMPTY_NOTE, [item(1, "Phone", "p")]), `---\nverify_cursor: 1\n---\n\n## Phone\n\n${line(1, "p")}\n`);
});

test("CRLF notes stay CRLF", () => {
  const crlf = NOTE.replace(/\n/g, "\r\n");
  const out = mergeVerify(crlf, [item(3, "Phone", "three")]);
  assert.ok(!/[^\r]\n/.test(out));
  assert.equal(readCursor(out), 3);
  assert.ok(out.includes(`${line(3, "three")}\r\n`));
});

test("merge is idempotent", () => {
  const items = [item(3, "Phone", "three"), item(4, "Run", "four")];
  const once = mergeVerify(NOTE, items);
  assert.equal(mergeVerify(once, items), once);
});
