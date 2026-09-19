// Local end-to-end check of the blind meeting Functions against `wrangler dev`.
// Calls are signed exactly like AppStore requests, with synthetic managers.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const origin = process.env.SMOKE_ORIGIN ?? "http://127.0.0.1:8797";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) {
  throw new Error("This synthetic smoke is local-only");
}
const key = Buffer.from("11".repeat(32), "hex");
const channelId = `smoke-${Date.now()}`;

async function call(managerId, method, params = {}) {
  const body = JSON.stringify({
    method,
    params,
    context: {
      caller: { type: "manager", id: managerId },
      channel: { id: channelId },
    },
  });
  const response = await fetch(`${origin}/functions/v1`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-signature": createHmac("sha256", key).update(body).digest("base64"),
    },
    body,
  });
  const json = await response.json();
  if (json.error || response.status !== 200) {
    const error = new Error(json.error?.message ?? json.message ?? "failed");
    error.status = response.status;
    throw error;
  }
  return json.result;
}

const profile = (school, department, gender, age, contact) => ({
  school,
  department,
  gender,
  age,
  studentYear: 24,
  contact,
});
const people = {
  h1: profile("성균관대 자과캠", "컴퓨터공학과", "male", 22, "insta_h1"),
  h2: profile("성균관대 자과캠", "컴퓨터공학과", "male", 21, "insta_h2"),
  g1: profile("이화여대", "경영학과", "female", 21, "kakao_g1"),
  g2: profile("이화여대", "경영학과", "female", 22, "kakao_g2"),
  c1: profile("성균관대 자과캠", "기계공학부", "male", 23, "insta_c1"),
};
for (const [id, value] of Object.entries(people))
  await call(id, "meeting.saveProfile", value);

// Posts carry only school, department, gender and size.
const { meetingId } = await call("h1", "meeting.create", {
  department: "컴퓨터공학과",
  size: 2,
});
const forWomen = await call("g1", "meeting.list", {});
const card = forWomen.meetings.find((m) => m.id === meetingId);
assert.equal(card.school, "성균관대 자과캠");
assert.equal(card.meetDate, "");
// Men never see men's posts.
assert.ok(
  !(await call("h2", "meeting.list", {})).meetings.some(
    (m) => m.id === meetingId,
  ),
);
await assert.rejects(call("h2", "meeting.apply", { meetingId }));

await call("g1", "meeting.apply", { meetingId, message: "안녕하세요!" });
const detail = await call("h1", "meeting.get", { meetingId });
assert.equal(detail.applications[0].profile.school, "이화여대");
await call("h1", "meeting.decide", {
  applicationId: detail.applications[0].id,
  accept: true,
});
await call("h2", "meeting.joinTeam", { code: detail.hostCode });
const guestCode = (await call("g1", "meeting.get", { meetingId })).guestCode;
await call("g2", "meeting.joinTeam", { code: guestCode });

let room = await call("h1", "meeting.room", { meetingId });
assert.equal(room.members.length, 4);
assert.ok(
  room.messages.some((m) =>
    m.body.includes("채팅방 개설이 완료되었습니다. 서로 인사하세요!"),
  ),
);
assert.ok(!JSON.stringify(room).includes("insta_"), "contacts stay private");

// Date poll → region poll (recommended from both campuses) → place → booking.
// TimePick-style date vote: everyone paints free hours, the overlap wins.
const { dates } = room.availability;
assert.equal(dates.length, 7);
const slotA = `${dates[1]} 19:00`;
const slotB = `${dates[1]} 20:00`;
await call("h1", "meeting.setAvailability", {
  meetingId,
  slots: [slotA, slotB],
});
await call("h2", "meeting.setAvailability", { meetingId, slots: [slotA] });
await call("g1", "meeting.setAvailability", { meetingId, slots: [slotA] });
// Slots outside the grid are ignored.
await call("g2", "meeting.setAvailability", {
  meetingId,
  slots: [slotB, "2020-01-01 19:00"],
});
let grid = (await call("g2", "meeting.room", { meetingId })).availability;
assert.equal(grid.responded, 4);
assert.deepEqual(grid.mine, [slotB]);
assert.deepEqual(grid.best[0], { slot: slotA, count: 3 });
assert.deepEqual(grid.available[slotA], ["A1", "A2", "B1"]);
await call("g2", "meeting.setAvailability", { meetingId, slots: [slotA] });
grid = (await call("h1", "meeting.room", { meetingId })).availability;
assert.deepEqual(grid.best[0], { slot: slotA, count: 4 });
await call("g1", "meeting.decideSlot", { meetingId, slot: slotA });
assert.ok(room.regionSuggestions.length >= 3);
const area = room.regionSuggestions[0].name;
const region = await call("h2", "meeting.proposePlace", {
  meetingId,
  poll: "region",
  name: area,
});
await call("g2", "meeting.decidePoll", { meetingId, placeId: region.placeId });
room = await call("g1", "meeting.room", { meetingId });
assert.equal(room.meeting.meetDate, dates[1]);
assert.equal(room.meeting.meetTime, "19:00");
assert.equal(room.meeting.region, area);
assert.ok(room.placeSuggestions.length > 0);
const place = await call("g1", "meeting.proposePlace", {
  meetingId,
  poll: "place",
  name: room.placeSuggestions[0].name,
  category: room.placeSuggestions[0].category,
});
await call("g1", "meeting.decidePoll", { meetingId, placeId: place.placeId });
assert.equal(
  (await call("h1", "meeting.room", { meetingId })).meeting.place,
  room.placeSuggestions[0].name,
);

// Catfish: majority of the 4 members agrees.
for (const id of ["h1", "h2", "g1"])
  await call(id, "meeting.catfishVote", { meetingId, agree: true });
room = await call("h1", "meeting.room", { meetingId });
assert.equal(room.catfish.decision, "yes");
await call("c1", "meeting.joinTeam", { code: room.catfish.code });
assert.equal(
  (await call("h1", "meeting.room", { meetingId })).members.length,
  4,
  "catfish hidden until entry",
);

// Live meeting: one server-owned event seen identically by everyone.
await call("g2", "meeting.startMc", { meetingId, demo: true });
const me = await call("h2", "meeting.getMe", {});
assert.equal(me.liveMeetingId, meetingId);
assert.equal((await call("c1", "meeting.getMe", {})).liveMeetingId, null);
await assert.rejects(call("c1", "meeting.enterCatfish", { meetingId }));
const views = await Promise.all(
  ["h1", "h2", "g1", "g2"].map((id) => call(id, "meeting.live", { meetingId })),
);
assert.equal(new Set(views.map((v) => v.event.id)).size, 1);
assert.equal(views[0].event.kind, "start");

await call("h1", "meeting.nextMc", { meetingId, kind: "random" });
const random = await Promise.all(
  ["h1", "g2"].map((id) => call(id, "meeting.live", { meetingId })),
);
assert.equal(random[0].event.id, random[1].event.id);
assert.ok(["topic", "mission", "game"].includes(random[0].event.kind));

await call("h1", "meeting.nextMc", { meetingId, kind: "vote" });
let live = await call("h1", "meeting.live", { meetingId });
assert.equal(live.event.kind, "vote");
assert.equal(live.vote.receivedByMe, null, "hidden while open");
const keyOf = (view, alias) =>
  view.candidates.find((c) => c.alias === alias).key;
const g1View = await call("g1", "meeting.live", { meetingId });
const g2View = await call("g2", "meeting.live", { meetingId });
await call("h1", "meeting.eventVote", {
  meetingId,
  eventId: live.event.id,
  targetKey: keyOf(live, "B1"),
});
await call("h2", "meeting.eventVote", {
  meetingId,
  eventId: live.event.id,
  targetKey: keyOf(live, "B1"),
});
await call("g1", "meeting.eventVote", {
  meetingId,
  eventId: live.event.id,
  targetKey: keyOf(g1View, "A1"),
});
await call("g2", "meeting.eventVote", {
  meetingId,
  eventId: live.event.id,
  targetKey: keyOf(g2View, "A1"),
});
const result = await call("g1", "meeting.live", { meetingId });
assert.equal(result.vote.open, false, "closes once everyone voted");
assert.equal(result.vote.receivedByMe, 2);
assert.equal(
  (await call("h2", "meeting.live", { meetingId })).vote.receivedByMe,
  0,
);
assert.deepEqual(
  Object.keys(result.vote).sort(),
  ["myVote", "open", "receivedByMe", "votedCount", "voterCount"],
  "only aggregate counts are exposed, never who voted for whom",
);

await call("h1", "meeting.finish", { meetingId });
assert.equal((await call("h1", "meeting.getMe", {})).liveMeetingId, null);

room = await call("h1", "meeting.room", { meetingId });
const roomKey = (alias) => room.members.find((m) => m.alias === alias).key;
await call("h1", "meeting.submitAfter", {
  meetingId,
  targetKeys: [roomKey("B1")],
});
const g1Room = await call("g1", "meeting.room", { meetingId });
const after = await call("g1", "meeting.submitAfter", {
  meetingId,
  targetKeys: [g1Room.members.find((m) => m.alias === "A1").key],
});
assert.equal(after.matches.length, 1);
const chatId = after.matches[0].chatId;
await call("h1", "meeting.shareContact", { chatId });
assert.ok(
  (
    await call("g1", "meeting.privateChat", { chatId })
  ).messages[0].body.includes("insta_h1"),
);

const review = {
  meetingId,
  mood: 5,
  conversation: 4,
  place: 4,
  content: 5,
  wantAgain: true,
};
await call("h1", "meeting.submitReview", { ...review, partner: 5 });
await call("h2", "meeting.submitReview", { ...review, partner: 4 });
await call("g1", "meeting.submitReview", { ...review, partner: 3 });
const rank = await call("g2", "meeting.rank", {});
const business = rank.entries.find((e) => e.department === "경영학과");
assert.equal(business.rating, 4.5);
assert.equal(business.reviews, 2);
assert.deepEqual(business.schools, ["이화여대"]);
assert.equal(
  rank.entries.find((e) => e.department === "컴퓨터공학과").rating,
  3,
);

const history = await call("h1", "meeting.history", {});
assert.equal(history.records[0].otherDepartment, "경영학과");
assert.equal(history.privateChats.length, 1);

console.log(
  "PASS: meeting v2 (opposite-gender posts → match → group chat polls → catfish → server-synced live events → anonymous like vote → after → review → rank)",
);
