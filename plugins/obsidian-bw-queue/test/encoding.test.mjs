import { test } from "node:test";
import assert from "node:assert/strict";
import { base64ToUtf8, utf8ToBase64 } from "../test-build/encoding.mjs";

test("base64 round-trips UTF-8 including emoji and accents", () => {
  const text = "- [ ] réparer la bombe 🔎 #3 ^bw-0001\n".repeat(3000);
  const encoded = utf8ToBase64(text);
  assert.equal(encoded, Buffer.from(text, "utf8").toString("base64"));
  assert.equal(base64ToUtf8(encoded), text);
  assert.equal(base64ToUtf8(encoded.replace(/(.{60})/g, "$1\n")), text);
});
