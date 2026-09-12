import assert from "node:assert/strict";
import test from "node:test";
import { submitCommand } from "./command-submission.js";

test("submission reports admission and preserves refusal synchronously", () => {
  const messages = [];
  let accepted = submitCommand({ send: () => {} }, { type: "pause" }, message => messages.push(message));
  assert.equal(accepted, true);
  assert.equal(messages.at(-1), "Order queued");
  accepted = submitCommand({ send: () => { throw new Error("remote runtime unavailable"); } }, { type: "pause" }, message => messages.push(message));
  assert.equal(accepted, false);
  assert.match(messages.at(-1), /Order refused: remote runtime unavailable/);
});
