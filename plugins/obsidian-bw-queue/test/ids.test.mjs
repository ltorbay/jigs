import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignIds, formatId, highestId, isDeviceLetter, needsId, nextId, randomDeviceLetter,
} from "../test-build/ids.mjs";

test("formatId puts the device letter before four padded digits", () => {
  assert.equal(formatId("m", 12), "bw-m0012");
  assert.equal(formatId("a", 12345), "bw-a12345");
});

test("device letters are one lowercase ascii letter", () => {
  assert.equal(isDeviceLetter("m"), true);
  for (const bad of ["", "M", "mm", "1", null, 3]) assert.equal(isDeviceLetter(bad), false);
  assert.equal(randomDeviceLetter(() => 0), "a");
  assert.equal(randomDeviceLetter(() => 0.9999), "z");
  for (let i = 0; i < 200; i++) assert.equal(isDeviceLetter(randomDeviceLetter()), true);
});

test("assignIds rejects an invalid letter", () => {
  assert.throws(() => assignIds("- [ ] a", "M"));
});

test("nextId starts at 1 on a file without ids", () => {
  assert.equal(nextId("- [ ] a\n- [x] b", "m"), 1);
});

test("nextId counts this letter's ids anywhere, ticked lines included", () => {
  const text = "- [ ] a ^bw-m0003\n- [x] b ^bw-m0041\nprose mentioning ^bw-m0010";
  assert.equal(highestId(text, "m"), 41);
  assert.equal(nextId(text, "m"), 42);
});

test("nextId ignores the other device's ids", () => {
  const text = "- [ ] a ^bw-m0003\n- [ ] b ^bw-p0900";
  assert.equal(nextId(text, "m"), 4);
  assert.equal(nextId(text, "p"), 901);
  assert.equal(nextId(text, "q"), 1);
});

test("needsId matches open tasks without a trailing id only", () => {
  assert.equal(needsId("- [ ] fix it"), true);
  assert.equal(needsId("  - [ ] nested"), true);
  assert.equal(needsId("- [ ] fix it ^bw-m0001"), false);
  assert.equal(needsId("- [ ] other device ^bw-p0001"), false);
  assert.equal(needsId("- [ ] legacy ^bw-0001"), false);
  assert.equal(needsId("- [x] done"), false);
  assert.equal(needsId("- [] malformed"), false);
  assert.equal(needsId("text - [ ] inline"), false);
});

test("assignIds numbers new open tasks after this letter's highest id", () => {
  const input = ["## Fixes", "- [ ] a", "- [x] old ^bw-m0009", "- [ ] b ^bw-m0002", "\t- [ ] c  ", "- [x] ticked"].join("\n");
  const expected = ["## Fixes", "- [ ] a ^bw-m0010", "- [x] old ^bw-m0009", "- [ ] b ^bw-m0002", "\t- [ ] c ^bw-m0011", "- [x] ticked"].join("\n");
  assert.equal(assignIds(input, "m"), expected);
});

test("two letters coexist and other-letter lines are left alone", () => {
  const input = "- [ ] phone ^bw-p0007\n- [ ] mac ^bw-m0002\n- [ ] new";
  assert.equal(assignIds(input, "m"), "- [ ] phone ^bw-p0007\n- [ ] mac ^bw-m0002\n- [ ] new ^bw-m0003");
  assert.equal(assignIds(input, "p"), "- [ ] phone ^bw-p0007\n- [ ] mac ^bw-m0002\n- [ ] new ^bw-p0008");
});

test("assignIds is idempotent", () => {
  const once = assignIds("- [ ] a\n- [ ] b\n", "m");
  assert.equal(assignIds(once, "m"), once);
  assert.equal(assignIds(once, "p"), once);
});

test("assignIds skips ids still held by ticked lines", () => {
  assert.equal(assignIds("- [x] b ^bw-m0002\n- [ ] c", "m"), "- [x] b ^bw-m0002\n- [ ] c ^bw-m0003");
});

test("without a floor, deleting the highest line frees its id", () => {
  assert.equal(assignIds("- [ ] a ^bw-m0001\n- [ ] c", "m"), "- [ ] a ^bw-m0001\n- [ ] c ^bw-m0002");
});

test("the floor applies to its own letter only", () => {
  const text = "- [ ] a ^bw-m0001\n- [ ] b ^bw-p0001";
  assert.equal(nextId(text, "m", 5), 6);
  assert.equal(nextId(text, "m", 0), 2);
  assert.equal(nextId("- [ ] a ^bw-m0009", "m", 2), 10);
  assert.equal(assignIds(text + "\n- [ ] c", "m", 5), text + "\n- [ ] c ^bw-m0006");
  assert.equal(assignIds(text + "\n- [ ] c", "p", 0), text + "\n- [ ] c ^bw-p0002");
});

test("assignIds keeps CRLF line endings", () => {
  assert.equal(assignIds("- [ ] a\r\n- [ ] b\r\n", "m"), "- [ ] a ^bw-m0001\r\n- [ ] b ^bw-m0002\r\n");
});

test("assignIds leaves a file without open tasks untouched", () => {
  const text = "# TODO\n\n- [x] done ^bw-m0001\n";
  assert.equal(assignIds(text, "m"), text);
});
