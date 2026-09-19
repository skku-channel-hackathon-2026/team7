import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE,
  availabilityDates,
  bestSlots,
  decideTick,
  memberKey,
  mutualPairs,
  pickEvent,
  regionSuggestions,
  toReal,
  type TickState,
} from "./meeting.logic.js";

const MINUTE = 60_000;

function state(overrides: Partial<TickState>): TickState {
  return {
    now: 100 * MINUTE,
    speed: 1,
    nextEventAt: 200 * MINUTE,
    nextVoteAt: 200 * MINUTE,
    current: null,
    ...overrides,
  };
}

test("nothing happens before the scheduled time", () => {
  assert.equal(decideTick(state({})), null);
});

test("random events keep a minimum gap and are rescheduled 10-18 minutes out", () => {
  const now = 100 * MINUTE;
  const tooSoon = decideTick(
    state({
      nextEventAt: now,
      current: {
        kind: "topic",
        startsAt: now - 3 * MINUTE,
        endsAt: now + MINUTE,
      },
    }),
  );
  assert.equal(tooSoon, null);

  for (const roll of [0, 0.5, 0.999]) {
    const decision = decideTick(state({ nextEventAt: now }), () => roll);
    assert.equal(decision?.kind, "random");
    const gap = (decision!.nextEventAt - now) / MINUTE;
    assert.ok(gap >= LIVE.eventGap[0] && gap <= LIVE.eventGap[1]);
  }
});

test("like votes recur 30-40 minutes apart, not on a fixed clock", () => {
  const now = 100 * MINUTE;
  const gaps = [0, 0.3, 0.9].map((roll) => {
    const decision = decideTick(state({ nextVoteAt: now }), () => roll);
    assert.equal(decision?.kind, "vote");
    return (decision!.nextVoteAt - now) / MINUTE;
  });
  for (const gap of gaps) assert.ok(gap >= 30 && gap <= 40);
  assert.ok(new Set(gaps).size > 1);
});

test("an open vote is never interrupted", () => {
  const now = 100 * MINUTE;
  assert.equal(
    decideTick(
      state({
        nextEventAt: now,
        nextVoteAt: now,
        current: {
          kind: "vote",
          startsAt: now - 20 * MINUTE,
          endsAt: now + MINUTE,
        },
      }),
    ),
    null,
  );
});

test("demo speed compresses every duration", () => {
  assert.equal(toReal(30, LIVE.demoSpeed), MINUTE);
  const decision = decideTick(
    state({ nextEventAt: 100 * MINUTE, speed: 30 }),
    () => 0,
  );
  assert.equal(decision!.nextEventAt - 100 * MINUTE, toReal(10, 30));
});

test("random events are topics, games or missions", () => {
  const kinds = new Set(
    [0.1, 0.5, 0.9].map((roll) => pickEvent(() => roll).kind),
  );
  assert.deepEqual([...kinds].sort(), ["game", "mission", "topic"]);
});

test("region suggestions favour areas between the two campuses", () => {
  const nearSuwon = regionSuggestions("성균관대 자과캠", "아주대").map(
    (s) => s.name,
  );
  assert.ok(
    nearSuwon.some((name) => ["수원역", "인계동", "성균관대역"].includes(name)),
  );
  const seoul = regionSuggestions("연세대", "이화여대").map((s) => s.name);
  assert.ok(seoul.includes("신촌"));
});

test("after results only reveal mutual choices", () => {
  const pairs = mutualPairs([
    { chooser: "a1", target: "b1" },
    { chooser: "b1", target: "a1" },
    { chooser: "a2", target: "b2" },
    { chooser: "b2", target: "a3" },
  ]);
  assert.deepEqual(pairs, [["a1", "b1"]]);
});

test("member keys hide manager ids and differ per meeting", () => {
  const key = memberKey("secret", "mt_1", "manager-1");
  assert.equal(key, memberKey("secret", "mt_1", "manager-1"));
  assert.notEqual(key, memberKey("secret", "mt_2", "manager-1"));
  assert.ok(!key.includes("manager"));
});

test("availability grid covers the next week in Korea time", () => {
  // 2026-09-19 23:30 KST is still the 19th in Korea (14:30 UTC).
  const dates = availabilityDates(Date.UTC(2026, 8, 19, 14, 30));
  assert.equal(dates.length, 7);
  assert.equal(dates[0], "2026-09-20");
  assert.equal(dates[6], "2026-09-26");
  // 00:30 KST on the 20th is 15:30 UTC on the 19th.
  assert.equal(
    availabilityDates(Date.UTC(2026, 8, 19, 15, 30))[0],
    "2026-09-21",
  );
});

test("best slots rank by overlap, then earliest", () => {
  const best = bestSlots({
    "2026-09-21 19:00": ["A1", "B1"],
    "2026-09-20 18:00": ["A1", "A2", "B1"],
    "2026-09-20 19:00": ["A1", "B1"],
    "2026-09-22 12:00": [],
  });
  assert.deepEqual(best, [
    { slot: "2026-09-20 18:00", count: 3 },
    { slot: "2026-09-20 19:00", count: 2 },
    { slot: "2026-09-21 19:00", count: 2 },
  ]);
});
