import assert from "node:assert/strict";
import test from "node:test";
import { detectStatus, extractEta, parseNotice } from "./parse";

// Test fixtures are synthetic strings for the parser only; they are never shown to users.
const pub = "2026-10-13T08:00:00.000Z"; // 10:00 SAST

test("explicit ETA is resolved in SAST", () => {
  const r = extractEta("Estimated restoration time: 14:30 today", pub);
  assert.equal(r.eta, "2026-10-13T12:30:00.000Z");
});

test("vague wording yields no ETA", () => {
  assert.equal(extractEta("Power will be restored as soon as possible", pub).eta, null);
  assert.equal(extractEta("Crews are on site, ETA to follow", pub).eta, null);
});

test("ETA earlier than publish time is rejected, not guessed", () => {
  assert.equal(extractEta("ETA 08:00", pub).eta, null);
});

test("no publish time => no ETA", () => {
  assert.equal(extractEta("ETA 14:30", null).eta, null);
});

test("status detection", () => {
  assert.equal(detectStatus("Power has been restored to Witfield"), "restored");
  assert.equal(detectStatus("Power will be restored by 18:00"), "reported");
  assert.equal(detectStatus("Repairs are in progress"), "repair_in_progress");
  assert.equal(detectStatus("Technicians have been dispatched"), "crew_dispatched");
});

test("irrelevant and non-matching notices are skipped", () => {
  assert.equal(parseNotice("Water interruption in Alberton", "Water supply will be off", pub).relevant, false);
  assert.equal(parseNotice("Power outage", "Residents in an unknown place", pub).relevant, false);
  assert.equal(parseNotice("Stage 4 load shedding schedule", "Boksburg", pub).relevant, false);
});

test("suburb + ward extraction, longest match wins", () => {
  const p = parseNotice("Power outage in Boksburg North, Ward 22", "Fault at Maple Substation. Feeder F12.", pub);
  assert.equal(p.relevant, true);
  assert.deepEqual(p.suburbs, ["Boksburg North"]);
  assert.equal(p.ward, 22);
  assert.equal(p.feeder, "F12");
});
