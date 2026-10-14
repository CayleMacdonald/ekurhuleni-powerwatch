import assert from "node:assert/strict";
import test from "node:test";
import { norm, suspiciousFlags } from "./reports";

const base = { type: "outage" as const, suburb: "Witfield" };

test("clean report has no flags", () => {
  assert.deepEqual(suspiciousFlags(base, 0), []);
});
test("links / phone numbers in notes are flagged", () => {
  assert.ok(suspiciousFlags({ ...base, notes: "call me 0821234567" }, 0).includes("contact_or_link_in_notes"));
  assert.ok(suspiciousFlags({ ...base, notes: "see http://x.y" }, 0).includes("contact_or_link_in_notes"));
});
test("future / ancient start times are flagged", () => {
  const now = Date.now();
  assert.ok(suspiciousFlags({ ...base, started_at: new Date(now + 3.6e6).toISOString() }, 0, now).includes("start_in_future"));
  assert.ok(suspiciousFlags({ ...base, started_at: new Date(now - 100 * 3.6e6).toISOString() }, 0, now).includes("start_too_old"));
});
test("rate limit and unknown suburb are flagged", () => {
  assert.ok(suspiciousFlags(base, 5).includes("rate_limit"));
  assert.ok(suspiciousFlags({ ...base, suburb: "Narnia" }, 0).includes("unknown_suburb"));
});
test("norm", () => assert.equal(norm("  Main  St. "), "main st"));
