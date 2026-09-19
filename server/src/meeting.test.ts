import assert from "node:assert/strict";
import test from "node:test";
import {
  AfterGetOutputSchema,
  MeetingDetailSchema,
  MeetingSummarySchema,
  SessionStateSchema,
  StatsOutputSchema,
  RecordViewSchema,
  type MeetingCreateInput,
  type Profile,
} from "@tutorial/shared";
import type { AppDatabase } from "./database.js";
import { createTestDatabase } from "./test-support/sqlite-d1.js";
import { ServiceError, type ServiceContext } from "./services/core.js";
import { getProfile, saveProfile } from "./services/profile.js";
import {
  ackSchedule,
  applyToMeeting,
  cancelMeeting,
  createMeeting,
  declineProposal,
  fillWithDemoMembers,
  getMeetingDetail,
  leaveMeeting,
  listMeetings,
  proposalInbox,
} from "./services/meeting.js";
import { listMessages, manualNudge, sendMessage } from "./services/chat.js";
import {
  finishSession,
  getSession,
  pickMember,
  startSession,
  voteMember,
} from "./services/session.js";
import {
  getAfterState,
  getDmRoom,
  listDmRooms,
  setContactConsent,
  submitAfter,
} from "./services/after.js";
import {
  recommendPlaces,
  selectPlace,
  shareReservation,
} from "./services/place.js";
import {
  departmentStats,
  getReview,
  listRecords,
  submitAfterReview,
  submitReview,
} from "./services/review.js";

const T0 = new Date("2026-09-19T03:00:00.000Z");
const minutes = (base: Date, n: number) => new Date(base.getTime() + n * 60000);
const days = (base: Date, n: number) => new Date(base.getTime() + n * 86400000);

const male = (dept: string): Profile => ({
  dept,
  admissionYear: 24,
  age: 22,
  gender: "male",
});
const female = (dept: string): Profile => ({
  dept,
  admissionYear: 24,
  age: 21,
  gender: "female",
});

function actor(
  db: AppDatabase,
  userId: string,
  now: Date = T0,
): ServiceContext {
  return { db, userId, now };
}

const anySide = {
  dept: "",
  gender: "any" as const,
  ageMin: 18,
  ageMax: 40,
  yearMin: 0,
  yearMax: 99,
};

function csVsBiz(
  overrides: Partial<MeetingCreateInput> = {},
): MeetingCreateInput {
  return {
    kind: "recruit",
    title: "컴공 × 경영 미팅",
    description: "",
    size: 1,
    startAt: days(T0, 2).toISOString(),
    region: "성수",
    condA: { ...anySide, dept: "컴퓨터공학과", gender: "male" },
    condB: { ...anySide, dept: "경영학과", gender: "female" },
    ...overrides,
  };
}

async function setup() {
  const db = createTestDatabase();
  await saveProfile(actor(db, "host"), male("컴퓨터공학과"));
  await saveProfile(actor(db, "guest"), female("경영학과"));
  return db;
}

/** 1:1 meeting that is matched and started (speed 60: one real minute = one hour of meeting time). */
async function startedMeeting(db: AppDatabase, speed = 60) {
  const meetingId = await createMeeting(actor(db, "host"), csVsBiz());
  await applyToMeeting(actor(db, "guest"), meetingId, "b");
  await startSession(actor(db, "host"), meetingId, speed);
  return meetingId;
}

async function rejects(promise: Promise<unknown>, type: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(
      error instanceof ServiceError,
      `expected ServiceError, got ${String(error)}`,
    );
    assert.equal(error.type, type);
    return true;
  });
}

test("profiles are saved per user and required before joining", async () => {
  const db = createTestDatabase();
  assert.equal(await getProfile(actor(db, "u1")), null);
  await rejects(createMeeting(actor(db, "u1"), csVsBiz()), "profileRequired");
  await saveProfile(actor(db, "u1"), male("컴퓨터공학과"));
  assert.deepEqual(await getProfile(actor(db, "u1")), male("컴퓨터공학과"));
  await saveProfile(actor(db, "u1"), { ...male("컴퓨터공학과"), age: 23 });
  assert.equal((await getProfile(actor(db, "u1")))?.age, 23);
});

test("meeting creation validates time, host eligibility and proposal rules", async () => {
  const db = await setup();
  await rejects(
    createMeeting(
      actor(db, "host"),
      csVsBiz({ startAt: minutes(T0, -5).toISOString() }),
    ),
    "pastStart",
  );
  await rejects(
    createMeeting(actor(db, "guest"), csVsBiz()),
    "hostNotEligible",
  );
  await rejects(
    createMeeting(
      actor(db, "host"),
      csVsBiz({ kind: "proposal", condB: { ...anySide, dept: "" } }),
    ),
    "targetRequired",
  );
  await rejects(
    createMeeting(
      actor(db, "host"),
      csVsBiz({
        kind: "proposal",
        condB: { ...anySide, dept: "컴퓨터공학과" },
      }),
    ),
    "sameDept",
  );
});

test("list shows applicable sides, filters and hides proposals from the public list", async () => {
  const db = await setup();
  const id = await createMeeting(actor(db, "host"), csVsBiz({ size: 3 }));
  await createMeeting(
    actor(db, "host"),
    csVsBiz({
      kind: "proposal",
      condB: { ...anySide, dept: "경영학과", gender: "female" },
    }),
  );

  const asGuest = await listMeetings(actor(db, "guest"), {
    onlyApplicable: false,
  });
  assert.equal(asGuest.length, 1, "proposals are not part of the public list");
  const summary = asGuest[0];
  assert.ok(summary);
  assert.equal(summary.id, id);
  assert.deepEqual(summary.applicableSides, ["b"]);
  assert.equal(summary.countA, 1);
  MeetingSummarySchema.parse(summary);

  assert.equal(
    (
      await listMeetings(actor(db, "guest"), {
        onlyApplicable: false,
        region: "강남",
      })
    ).length,
    0,
  );
  assert.equal(
    (
      await listMeetings(actor(db, "guest"), {
        onlyApplicable: false,
        dept: "경영학과",
      })
    ).length,
    1,
  );
  await saveProfile(actor(db, "other"), male("사학과"));
  assert.equal(
    (await listMeetings(actor(db, "other"), { onlyApplicable: true })).length,
    0,
  );
});

test("applying enforces eligibility, uniqueness and seat limits, then matches automatically", async () => {
  const db = await setup();
  const id = await createMeeting(actor(db, "host"), csVsBiz());
  await saveProfile(actor(db, "wrong"), male("경영학과"));
  await rejects(applyToMeeting(actor(db, "wrong"), id, "b"), "notEligible");
  await rejects(applyToMeeting(actor(db, "host"), id, "b"), "alreadyJoined");

  await applyToMeeting(actor(db, "guest"), id, "b");
  const detail = await getMeetingDetail(actor(db, "guest"), id);
  assert.equal(detail.status, "matched");
  assert.equal(detail.members.length, 2);
  MeetingDetailSchema.parse(detail);

  await saveProfile(actor(db, "late"), female("경영학과"));
  await rejects(applyToMeeting(actor(db, "late"), id, "b"), "notRecruiting");

  const messages = await listMessages(actor(db, "guest"), {
    roomType: "meeting",
    roomId: id,
    afterId: 0,
  });
  assert.ok(messages.some((m) => m.body.includes("미팅이 성사됐어요")));
});

test("blind profile: other participants never see identities, only dept/year/age", async () => {
  const db = await setup();
  const id = await createMeeting(actor(db, "host"), csVsBiz());
  await applyToMeeting(actor(db, "guest"), id, "b");
  const json = JSON.stringify(await getMeetingDetail(actor(db, "guest"), id));
  assert.ok(
    !json.includes('"host"') && !json.includes('"guest"'),
    "manager ids must not leak",
  );
  const detail = await getMeetingDetail(actor(db, "guest"), id);
  assert.deepEqual(
    detail.members.map((m) => m.alias),
    ["참가자 A", "참가자 B"],
  );
});

test("leaving is allowed for guests while recruiting, never for the host", async () => {
  const db = await setup();
  const id = await createMeeting(actor(db, "host"), csVsBiz({ size: 2 }));
  await applyToMeeting(actor(db, "guest"), id, "b");
  await rejects(leaveMeeting(actor(db, "host"), id), "hostCannotLeave");
  await leaveMeeting(actor(db, "guest"), id);
  const detail = await getMeetingDetail(actor(db, "host"), id);
  assert.equal(detail.countB, 0);
  await applyToMeeting(actor(db, "guest"), id, "b");
  assert.equal((await getMeetingDetail(actor(db, "host"), id)).countB, 1);
});

test("cancelling follows the host rules", async () => {
  const db = await setup();
  const id = await createMeeting(actor(db, "host"), csVsBiz({ size: 2 }));
  await applyToMeeting(actor(db, "guest"), id, "b");
  await cancelMeeting(actor(db, "host"), id);
  assert.equal(
    (await getMeetingDetail(actor(db, "host"), id)).status,
    "cancelled",
  );
  await rejects(applyToMeeting(actor(db, "guest"), id, "b"), "notRecruiting");
});

test("proposals reach the target department, can be accepted or declined", async () => {
  const db = await setup();
  await createMeeting(
    actor(db, "host"),
    csVsBiz({
      kind: "proposal",
      title: "경영학과에 제안",
      condB: { ...anySide, dept: "경영학과", gender: "female" },
    }),
  );
  await saveProfile(actor(db, "other"), male("사학과"));
  assert.equal((await proposalInbox(actor(db, "other"))).length, 0);
  await saveProfile(actor(db, "classmate"), male("컴퓨터공학과"));
  assert.equal(
    (await proposalInbox(actor(db, "classmate"))).length,
    0,
    "the proposer's own department is not the addressee",
  );

  const inbox = await proposalInbox(actor(db, "guest"));
  assert.equal(inbox.length, 1);
  const proposal = inbox[0];
  assert.ok(proposal);
  await declineProposal(actor(db, "guest"), proposal.id);
  assert.equal((await proposalInbox(actor(db, "guest"))).length, 0);

  await applyToMeeting(actor(db, "guest"), proposal.id, "b");
  assert.equal(
    (await getMeetingDetail(actor(db, "guest"), proposal.id)).status,
    "matched",
  );
});

test("group chat opens after matching, nudges only count pending people", async () => {
  const db = await setup();
  const id = await createMeeting(actor(db, "host"), csVsBiz());
  await rejects(
    listMessages(actor(db, "host"), {
      roomType: "meeting",
      roomId: id,
      afterId: 0,
    }),
    "chatNotReady",
  );
  await applyToMeeting(actor(db, "guest"), id, "b");
  await sendMessage(actor(db, "host"), {
    roomType: "meeting",
    roomId: id,
    body: "안녕하세요!",
  });

  const seen = await listMessages(actor(db, "guest"), {
    roomType: "meeting",
    roomId: id,
    afterId: 0,
  });
  const hello = seen.find((m) => m.body === "안녕하세요!");
  assert.ok(hello);
  assert.equal(hello.mine, false);
  assert.equal(hello.senderAlias, "참가자 A");

  const later = await listMessages(actor(db, "guest"), {
    roomType: "meeting",
    roomId: id,
    afterId: hello.id,
  });
  assert.equal(later.length, 0);

  await saveProfile(actor(db, "outsider"), male("사학과"));
  await rejects(
    sendMessage(actor(db, "outsider"), {
      roomType: "meeting",
      roomId: id,
      body: "hi",
    }),
    "notMember",
  );

  await ackSchedule(actor(db, "host"), id);
  const early = await manualNudge(actor(db, "host", minutes(T0, 5)), id);
  assert.equal(early.sent, false, "too soon after matching");
  const nudge = await manualNudge(actor(db, "host", minutes(T0, 15)), id);
  assert.deepEqual(nudge, { sent: true, pending: 1 });
  const again = await manualNudge(actor(db, "host", minutes(T0, 16)), id);
  assert.equal(again.sent, false, "rate limited");
  const nudges = (
    await listMessages(actor(db, "guest", minutes(T0, 16)), {
      roomType: "meeting",
      roomId: id,
      afterId: 0,
    })
  ).filter((m) => m.kind === "nudge");
  assert.equal(nudges.length, 1);
  assert.match(
    nudges[0]?.body ?? "",
    /아직 미팅 일정을 확인하지 않은 사람이 있어요/,
  );

  await ackSchedule(actor(db, "guest", minutes(T0, 17)), id);
  const done = await manualNudge(actor(db, "host", minutes(T0, 60)), id);
  assert.equal(done.pending, 0);
});

test("session: timeline, generated prompts, votes, pick and reveal", async () => {
  const db = await setup();
  const id = await createMeeting(actor(db, "host"), csVsBiz());
  await applyToMeeting(actor(db, "guest"), id, "b");
  await rejects(startSession(actor(db, "guest"), id, 1), "notHost");
  await startSession(actor(db, "host"), id, 60);

  const start = new Date(
    (await getSession(actor(db, "host"), id)).startedAt ?? T0.toISOString(),
  );
  const at = (realMin: number) => minutes(start, realMin);

  const first = await getSession(actor(db, "host", at(0.01)), id);
  SessionStateSchema.parse(first);
  assert.equal(first.prompts.length, 1);
  assert.equal(first.prompts[0]?.kind, "intro");
  await rejects(
    pickMember(actor(db, "host", at(0.01)), {
      meetingId: id,
      targetMemberId: 2,
    }),
    "pickClosed",
  );

  // 60 meeting-minutes in (1 real minute at 60x): intro, topic 8, question, topic 22, event, topic 38, pick, topic 52, mission
  const mid = await getSession(actor(db, "host", at(1)), id);
  assert.deepEqual(
    mid.prompts.map((p) => p.slot),
    [
      "stage:intro",
      "topic:8",
      "stage:question",
      "topic:22",
      "stage:event",
      "topic:38",
      "stage:pick",
      "topic:52",
      "stage:mission",
    ],
  );
  assert.equal(mid.stages.find((s) => s.key === "mission")?.state, "active");
  assert.equal(mid.pick.open, true);
  assert.equal(mid.pick.revealed, false);
  const topic = mid.prompts.find((p) => p.slot === "topic:22");
  assert.match(topic?.body ?? "", /미팅 시작 후 22분이 지났어요/);

  // Polling again from another participant does not duplicate prompts or chat posts.
  await getSession(actor(db, "guest", at(1)), id);
  const promptMessages = (
    await listMessages(actor(db, "guest", at(1)), {
      roomType: "meeting",
      roomId: id,
      afterId: 0,
    })
  ).filter((m) => m.kind === "prompt");
  assert.equal(promptMessages.length, 9);

  // Pick before reveal, results are private until the after stage.
  const guestMember = mid.members.find((m) => m.isMe === false);
  const hostMember = mid.members.find((m) => m.isMe === true);
  assert.ok(guestMember && hostMember);
  await pickMember(actor(db, "host", at(1)), {
    meetingId: id,
    targetMemberId: guestMember.memberId,
  });
  await rejects(
    pickMember(actor(db, "host", at(1)), {
      meetingId: id,
      targetMemberId: hostMember.memberId,
    }),
    "invalidTarget",
  );
  await pickMember(actor(db, "guest", at(1.01)), {
    meetingId: id,
    targetMemberId: hostMember.memberId,
  });
  const hidden = await getSession(actor(db, "host", at(1.01)), id);
  assert.equal(hidden.pick.myPick, guestMember.memberId);
  assert.deepEqual(hidden.pick.mutual, []);
  assert.equal(hidden.pick.receivedCount, 0);

  const revealed = await getSession(actor(db, "host", at(1.3)), id);
  assert.equal(revealed.pick.revealed, true);
  assert.equal(revealed.pick.mutual.length, 1);
  assert.equal(revealed.pick.mutual[0]?.memberId, guestMember.memberId);
  assert.equal(revealed.pick.receivedCount, 1);
  assert.equal(revealed.afterOpen, true);
  await rejects(
    pickMember(actor(db, "host", at(1.3)), {
      meetingId: id,
      targetMemberId: guestMember.memberId,
    }),
    "pickRevealed",
  );
});

test("session: mission votes are hidden until everyone voted", async () => {
  const db = await setup();
  const id = await startedMeeting(db);
  const start = new Date(
    (await getSession(actor(db, "host"), id)).startedAt ?? T0.toISOString(),
  );
  // 65 meeting-minutes in: the mission prompt (minute 60) exists and its reveal grace has not passed.
  const now = minutes(start, 65 / 60);
  const session = await getSession(actor(db, "host", now), id);
  // Force the mission to be a vote so the test does not depend on which item the pool picked.
  await db
    .prepare(
      "UPDATE meeting_prompts SET voteable = 1 WHERE meeting_id = ? AND slot = ?",
    )
    .bind(id, "stage:mission")
    .run();

  const me = session.members.find((m) => m.isMe);
  const other = session.members.find((m) => !m.isMe);
  assert.ok(me && other);
  const slot = "stage:mission";
  const view = async (user: string) =>
    (await getSession(actor(db, user, now), id)).prompts.find(
      (p) => p.slot === slot,
    );

  assert.equal((await view("host"))?.voteResult, null);
  await rejects(
    voteMember(actor(db, "host", now), {
      meetingId: id,
      slot,
      targetMemberId: me.memberId,
    }),
    "invalidTarget",
  );
  await voteMember(actor(db, "host", now), {
    meetingId: id,
    slot,
    targetMemberId: other.memberId,
  });
  assert.equal((await view("host"))?.myVote, other.memberId);
  assert.equal(
    (await view("host"))?.voteResult,
    null,
    "still waiting for the other participant",
  );
  await voteMember(actor(db, "guest", now), {
    meetingId: id,
    slot,
    targetMemberId: me.memberId,
  });
  assert.equal((await view("host"))?.voteResult?.length, 2);
  await rejects(
    voteMember(actor(db, "host", now), {
      meetingId: id,
      slot: "stage:intro",
      targetMemberId: other.memberId,
    }),
    "notVoteable",
  );
});

test("after: choices stay anonymous and only mutual picks open a private room", async () => {
  const db = await setup();
  const id = await startedMeeting(db);
  const start = new Date(
    (await getSession(actor(db, "host"), id)).startedAt ?? T0.toISOString(),
  );
  const at = (realMin: number) => minutes(start, realMin);

  await rejects(
    submitAfter(actor(db, "host", at(0.1)), {
      meetingId: id,
      targetMemberIds: [],
    }),
    "afterClosed",
  );

  const state = await getAfterState(actor(db, "host", at(1.3)), id);
  AfterGetOutputSchema.parse({ after: state });
  assert.equal(state.open, true);
  assert.equal(state.candidates.length, 1);
  const guestMember = state.candidates[0];
  assert.ok(guestMember);
  const hostMember = (await getSession(actor(db, "guest", at(1.3)), id)).pick
    .candidates[0];
  assert.ok(hostMember);

  // Host says yes, guest says "no one": nothing is revealed to either side.
  await submitAfter(actor(db, "host", at(1.3)), {
    meetingId: id,
    targetMemberIds: [guestMember.memberId],
  });
  await rejects(
    submitAfter(actor(db, "host", at(1.3)), {
      meetingId: id,
      targetMemberIds: [],
    }),
    "alreadySubmitted",
  );
  let hostView = await getAfterState(actor(db, "host", at(1.31)), id);
  assert.equal(hostView.final, false);
  assert.equal(hostView.waitingCount, 1);
  assert.deepEqual(hostView.matches, []);

  await submitAfter(actor(db, "guest", at(1.32)), {
    meetingId: id,
    targetMemberIds: [],
  });
  hostView = await getAfterState(actor(db, "host", at(1.33)), id);
  const guestView = await getAfterState(actor(db, "guest", at(1.33)), id);
  assert.equal(hostView.final, true);
  assert.deepEqual(hostView.matches, []);
  assert.deepEqual(guestView.matches, []);
  assert.equal(guestView.none, true);
  assert.deepEqual(await listDmRooms(actor(db, "host")), []);
  assert.equal(
    (await getSession(actor(db, "host", at(1.4)), id)).status,
    "finished",
  );
});

test("after: mutual choice opens a room and contacts are shared only with both consents", async () => {
  const db = await setup();
  const id = await startedMeeting(db);
  const start = new Date(
    (await getSession(actor(db, "host"), id)).startedAt ?? T0.toISOString(),
  );
  const at = (realMin: number) => minutes(start, realMin);

  const hostState = await getAfterState(actor(db, "host", at(1.3)), id);
  const guestState = await getAfterState(actor(db, "guest", at(1.3)), id);
  const guestMember = hostState.candidates[0];
  const hostMember = guestState.candidates[0];
  assert.ok(guestMember && hostMember);

  await submitAfter(actor(db, "host", at(1.3)), {
    meetingId: id,
    targetMemberIds: [guestMember.memberId],
  });
  await submitAfter(actor(db, "guest", at(1.31)), {
    meetingId: id,
    targetMemberIds: [hostMember.memberId],
  });

  const rooms = await listDmRooms(actor(db, "host"));
  assert.equal(rooms.length, 1);
  const room = rooms[0];
  assert.ok(room);
  assert.equal(room.partner.alias, "참가자 B");
  assert.equal(
    (await listDmRooms(actor(db, "guest")))[0]?.partner.alias,
    "참가자 A",
  );

  await saveProfile(actor(db, "stranger"), male("사학과"));
  await rejects(getDmRoom(actor(db, "stranger"), room.roomId), "notMember");
  await rejects(
    sendMessage(actor(db, "stranger"), {
      roomType: "dm",
      roomId: room.roomId,
      body: "hi",
    }),
    "notMember",
  );

  await sendMessage(actor(db, "host"), {
    roomType: "dm",
    roomId: room.roomId,
    body: "오늘 즐거웠어요",
  });
  const dm = await listMessages(actor(db, "guest"), {
    roomType: "dm",
    roomId: room.roomId,
    afterId: 0,
  });
  assert.ok(dm.some((m) => m.body === "오늘 즐거웠어요" && !m.mine));

  await rejects(
    setContactConsent(actor(db, "host"), {
      roomId: room.roomId,
      consent: true,
      contact: "",
    }),
    "contactRequired",
  );
  const first = await setContactConsent(actor(db, "host"), {
    roomId: room.roomId,
    consent: true,
    contact: "@host_insta",
  });
  assert.equal(first.partnerContact, null);
  const guestSees = await getDmRoom(actor(db, "guest"), room.roomId);
  assert.equal(guestSees.partnerConsent, true);
  assert.equal(guestSees.partnerContact, null, "guest has not agreed yet");

  const both = await setContactConsent(actor(db, "guest"), {
    roomId: room.roomId,
    consent: true,
    contact: "kakao:guest",
  });
  assert.equal(both.partnerContact, "@host_insta");
  assert.equal(
    (await getDmRoom(actor(db, "host"), room.roomId)).partnerContact,
    "kakao:guest",
  );

  const withdrawn = await setContactConsent(actor(db, "host"), {
    roomId: room.roomId,
    consent: false,
    contact: "",
  });
  assert.equal(withdrawn.myConsent, false);
  assert.equal(
    (await getDmRoom(actor(db, "guest"), room.roomId)).partnerContact,
    null,
  );
});

test("places: recommendations respect region, capacity and opening hours; selection is host-only", async () => {
  const db = await setup();
  const id = await createMeeting(
    actor(db, "host"),
    csVsBiz({ size: 3, startAt: "2026-09-25T10:00:00.000Z" }),
  );
  const places = await recommendPlaces(actor(db, "host"), { meetingId: id });
  assert.ok(places.length > 0);
  assert.ok(places.every((p) => p.region === "성수" && p.capacityMax >= 6));
  assert.ok(
    new Set(places.map((p) => p.category)).size > 1,
    "varied categories",
  );
  assert.ok(places.every((p) => p.reservationUrl.startsWith("https://")));

  const cafes = await recommendPlaces(actor(db, "host"), {
    region: "강남",
    category: "카페",
    headcount: 4,
  });
  assert.ok(cafes.length > 0 && cafes.every((p) => p.category === "카페"));
  assert.deepEqual(
    await recommendPlaces(actor(db, "host"), { region: "성수", headcount: 50 }),
    [],
  );

  await applyToMeeting(actor(db, "guest"), id, "b").catch(() => undefined);
  const first = places[0];
  assert.ok(first);
  await rejects(
    selectPlace(actor(db, "host"), { meetingId: id, placeId: first.placeId }),
    "notMatched",
  );

  const small = await createMeeting(
    actor(db, "host"),
    csVsBiz({ startAt: days(T0, 3).toISOString() }),
  );
  await applyToMeeting(actor(db, "guest"), small, "b");
  await rejects(
    selectPlace(actor(db, "guest"), {
      meetingId: small,
      placeId: first.placeId,
    }),
    "notHost",
  );
  await rejects(
    selectPlace(actor(db, "host"), { meetingId: small, placeId: "nope" }),
    "placeNotFound",
  );
  await rejects(
    shareReservation(actor(db, "host"), {
      meetingId: small,
      reservedFor: "금 19:00",
      note: "",
    }),
    "placeRequired",
  );
  const chosen = await selectPlace(actor(db, "host"), {
    meetingId: small,
    placeId: first.placeId,
  });
  assert.equal(chosen.name, first.name);
  const reserved = await shareReservation(actor(db, "host"), {
    meetingId: small,
    reservedFor: "금 19:00 2명",
    note: "창가",
  });
  assert.equal(reserved.reservedFor, "금 19:00 2명");
  const detail = await getMeetingDetail(actor(db, "guest"), small);
  assert.equal(detail.place?.name, first.name);
  const chat = await listMessages(actor(db, "guest"), {
    roomType: "meeting",
    roomId: small,
    afterId: 0,
  });
  assert.ok(chat.some((m) => m.body.includes("장소가 정해졌어요")));
  assert.ok(chat.some((m) => m.body.includes("예약 일정이 공유됐어요")));
});

test("reviews, records and department statistics", async () => {
  const db = await setup();
  const id = await startedMeeting(db);
  const start = new Date(
    (await getSession(actor(db, "host"), id)).startedAt ?? T0.toISOString(),
  );
  const at = (realMin: number) => minutes(start, realMin);

  const early = await getReview(actor(db, "host", at(0.1)), id);
  assert.equal(early.canReview, false);
  await rejects(
    submitReview(actor(db, "host", at(0.1)), {
      meetingId: id,
      mood: 5,
      talk: 5,
      place: 5,
      content: 5,
      rejoin: true,
      comment: "",
    }),
    "reviewClosed",
  );

  const hostState = await getAfterState(actor(db, "host", at(1.3)), id);
  const guestState = await getAfterState(actor(db, "guest", at(1.3)), id);
  await submitAfter(actor(db, "host", at(1.3)), {
    meetingId: id,
    targetMemberIds: [hostState.candidates[0]?.memberId ?? 0],
  });
  await submitAfter(actor(db, "guest", at(1.3)), {
    meetingId: id,
    targetMemberIds: [guestState.candidates[0]?.memberId ?? 0],
  });

  const review = {
    meetingId: id,
    mood: 5,
    talk: 4,
    place: 3,
    content: 5,
    rejoin: true,
    comment: "재밌었어요",
  };
  await submitReview(actor(db, "host", at(2)), review);
  await rejects(
    submitReview(actor(db, "host", at(2)), review),
    "alreadyReviewed",
  );
  await submitReview(actor(db, "guest", at(2)), {
    ...review,
    mood: 3,
    talk: 3,
    place: 3,
    content: 3,
    rejoin: false,
    comment: "",
  });

  const mine = await getReview(actor(db, "host", at(2)), id);
  assert.equal(mine.review?.mood, 5);
  assert.equal(mine.afterReviews.length, 1);
  const roomId = mine.afterReviews[0]?.roomId ?? "";
  await rejects(
    submitAfterReview(actor(db, "host", at(2)), {
      roomId,
      met: true,
      score: null,
      comment: "",
    }),
    "scoreRequired",
  );
  await submitAfterReview(actor(db, "host", at(2)), {
    roomId,
    met: true,
    score: 5,
    comment: "또 만났어요",
  });
  await rejects(
    submitAfterReview(actor(db, "host", at(2)), {
      roomId,
      met: false,
      score: null,
      comment: "",
    }),
    "alreadyReviewed",
  );
  assert.equal(
    (await getReview(actor(db, "host", at(2)), id)).afterReviews[0]?.met,
    true,
  );

  const records = await listRecords(actor(db, "host", at(2)));
  assert.equal(records.length, 1);
  const record = records[0];
  assert.ok(record);
  RecordViewSchema.parse(record);
  assert.equal(record.myDept, "컴퓨터공학과");
  assert.equal(record.otherDept, "경영학과");
  assert.equal(record.afterCount, 1);
  assert.equal(record.reviewed, true);
  assert.equal(record.date, "2026.09.21");

  const stats = await departmentStats(actor(db, "host", at(2)));
  StatsOutputSchema.parse({ stats, minSample: 3 });
  const cs = stats.find((s) => s.dept === "컴퓨터공학과");
  assert.ok(cs);
  assert.equal(cs.meetings, 1);
  assert.equal(cs.matchRate, 1);
  assert.equal(cs.afterRate, 1);
  assert.equal(cs.avgSatisfaction, 4.3);
  assert.equal(cs.rejoinRate, 1);
  const biz = stats.find((s) => s.dept === "경영학과");
  assert.equal(biz?.avgSatisfaction, 3);
  assert.equal(biz?.rejoinRate, 0);
});

test("demo participants fill seats so one tester can run the whole flow", async () => {
  const db = await setup();
  const id = await createMeeting(actor(db, "host"), csVsBiz({ size: 3 }));
  await rejects(fillWithDemoMembers(actor(db, "guest"), id), "notHost");
  assert.equal(await fillWithDemoMembers(actor(db, "host"), id), 5);
  const detail = await getMeetingDetail(actor(db, "host"), id);
  assert.equal(detail.status, "matched");
  assert.equal(detail.members.length, 6);
  assert.equal(detail.members.filter((m) => m.isDemo).length, 5);

  await startSession(actor(db, "host"), id, 60);
  const start = new Date(
    (await getSession(actor(db, "host"), id)).startedAt ?? T0.toISOString(),
  );
  const at = (realMin: number) => minutes(start, realMin);
  const after = await getAfterState(actor(db, "host", at(1.3)), id);
  assert.equal(after.open, true);
  assert.equal(after.candidates.length, 3);
  assert.equal(
    after.waitingCount,
    1,
    "demo members answer automatically; only the host is pending",
  );
  const targets = after.candidates.map((c) => c.memberId);
  await submitAfter(actor(db, "host", at(1.3)), {
    meetingId: id,
    targetMemberIds: targets,
  });
  const done = await getAfterState(actor(db, "host", at(1.31)), id);
  assert.equal(done.final, true);
  assert.ok(
    done.matches.length >= 1,
    "at least one demo participant reciprocates",
  );
  assert.equal(
    (await getSession(actor(db, "host", at(1.32)), id)).status,
    "finished",
  );
});

test("finishing: only the host can end a running meeting, and it auto-ends after the time limit", async () => {
  const db = await setup();
  const id = await startedMeeting(db, 1);
  await rejects(finishSession(actor(db, "guest"), id), "notHost");
  await finishSession(actor(db, "host"), id);
  await rejects(finishSession(actor(db, "host"), id), "notInProgress");

  const second = await createMeeting(
    actor(db, "host"),
    csVsBiz({ startAt: days(T0, 4).toISOString() }),
  );
  await applyToMeeting(actor(db, "guest"), second, "b");
  await startSession(actor(db, "host"), second, 1);
  const startedAt = new Date(
    (await getSession(actor(db, "host"), second)).startedAt ?? T0.toISOString(),
  );
  const late = await getSession(
    actor(db, "host", minutes(startedAt, 200)),
    second,
  );
  assert.equal(late.status, "finished");
});
