import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
const origin = process.env.SMOKE_ORIGIN ?? "http://127.0.0.1:8797";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) {
  throw new Error("This synthetic smoke is local-only");
}
for (const path of ["/api/health", "/api/ready"]) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
}
const body =
  '{ "method": "extension.command.metadata.getCommands", "params": {} }';
const signature = createHmac("sha256", Buffer.from("11".repeat(32), "hex"))
  .update(body)
  .digest("base64");
const send = (path, sig, value = body) =>
  fetch(origin + path, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(sig ? { "x-signature": sig } : {}),
    },
    body: value,
  });
for (const path of ["/functions", "/functions/v1"]) {
  for (const response of await Promise.all([
    send(path, signature),
    send(path, signature),
  ])) {
    assert.equal(response.status, 200);
    assert.match(await response.text(), /meeting\.open/);
  }
  assert.equal((await send(path)).status, 401);
  assert.equal((await send(path, "invalid")).status, 401);
  assert.equal((await send(path, signature, body + " ")).status, 401);
}
const wam = await fetch(origin + "/resource/wam/meeting/");
assert.equal(wam.status, 200);
const html = await wam.text();
const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map(
  (match) => match[1],
);
assert(assets.length >= 2);
for (const asset of assets)
  assert.equal((await fetch(new URL(asset, wam.url))).status, 200);
console.log(
  "PASS: Workers HTTP adapter, signed concurrent calls, invalid/tampered signatures, D1 readiness, WAM and static assets",
);

// Blind-meeting flow against the local D1: profile -> recruit -> match -> chat -> start.
const key = Buffer.from("11".repeat(32), "hex");
async function callFunction(method, params, managerId) {
  const payload = JSON.stringify({
    method,
    params,
    context: {
      caller: { type: "manager", id: managerId },
      channel: { id: "smoke-channel" },
    },
  });
  const sig = createHmac("sha256", key).update(payload).digest("base64");
  const response = await send("/functions/v1", sig, payload);
  assert.equal(response.status, 200, `${method} -> HTTP ${response.status}`);
  return response.json();
}
async function callOk(method, params, managerId) {
  const body = await callFunction(method, params, managerId);
  assert.equal(
    body.error,
    undefined,
    `${method}: ${JSON.stringify(body.error)}`,
  );
  return body.result;
}

const run = Date.now().toString(36);
const host = `smoke-host-${run}`;
const guest = `smoke-guest-${run}`;
const listed = await callOk("extension.core.function.getFunctions", {}, host);
assert(listed.functions.some((f) => f.name === "meeting.create"));
assert.deepEqual(await callOk("profile.get", {}, host), { profile: null });
await callOk(
  "profile.save",
  { dept: "컴퓨터공학과", admissionYear: 24, age: 22, gender: "male" },
  host,
);
await callOk(
  "profile.save",
  { dept: "경영학과", admissionYear: 24, age: 21, gender: "female" },
  guest,
);
const { meetingId } = await callOk(
  "meeting.create",
  {
    title: "smoke",
    size: 1,
    startAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    region: "성수",
    condA: { dept: "컴퓨터공학과", gender: "male" },
    condB: { dept: "경영학과", gender: "female" },
  },
  host,
);
await callOk("meeting.apply", { meetingId, side: "b" }, guest);
const { meeting } = await callOk("meeting.get", { meetingId }, guest);
assert.equal(meeting.status, "matched");
assert.equal(
  JSON.stringify(meeting).includes(host),
  false,
  "blind profile leaked an id",
);
await callOk(
  "chat.send",
  { roomType: "meeting", roomId: meetingId, body: "hello" },
  host,
);
const chat = await callOk(
  "chat.list",
  { roomType: "meeting", roomId: meetingId, afterId: 0 },
  guest,
);
assert(chat.messages.some((m) => m.body === "hello" && !m.mine));
await callOk("session.start", { meetingId, speed: 1 }, host);
const { session } = await callOk("session.get", { meetingId }, guest);
assert.equal(session.status, "in_progress");
assert.equal(session.prompts[0].slot, "stage:intro");
const missing = await callFunction("meeting.get", { meetingId: "nope" }, host);
assert.equal(missing.error?.type, "meetingNotFound");
console.log(
  "PASS: blind meeting flow (profile, recruit, auto-match, group chat, timeline) on local D1",
);
