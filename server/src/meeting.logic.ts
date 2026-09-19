import { createHmac, randomBytes } from "node:crypto";
import {
  EVENT_GAMES,
  EVENT_MISSIONS,
  EVENT_TOPICS,
  REGION_SPOTS,
  SCHOOLS,
  type LiveEventKind,
  type Suggestion,
} from "@tutorial/shared";

const MINUTE = 60_000;

/**
 * Live meeting pacing in programme minutes. Events are random but never closer
 * than the minimum gap; like votes recur every 30-40 minutes, never on a fixed
 * clock. Demo mode divides every duration by the meeting speed.
 */
export const LIVE = {
  startMinutes: 8,
  eventGap: [10, 18] as const,
  eventMinutes: 8,
  minSpacing: 8,
  voteGap: [30, 40] as const,
  voteMinutes: 8,
  catfishAfter: 60,
  demoSpeed: 30,
};

export function toReal(minutes: number, speed: number): number {
  return Math.round((minutes * MINUTE) / speed);
}

export function between(
  [min, max]: readonly [number, number],
  rand: () => number = Math.random,
): number {
  return min + (max - min) * rand();
}

export interface LiveContent {
  kind: Exclude<LiveEventKind, "vote" | "start" | "catfish">;
  title: string;
  body: string;
}

/** Weighted pick: conversation topics most often, then games and missions. */
export function pickEvent(rand: () => number = Math.random): LiveContent {
  const roll = rand();
  const pick = <T extends readonly string[]>(pool: T) =>
    pool[Math.floor(rand() * pool.length) % pool.length];
  if (roll < 0.45)
    return {
      kind: "topic",
      title: "새로운 대화 주제",
      body: pick(EVENT_TOPICS),
    };
  if (roll < 0.75)
    return { kind: "game", title: "게임 타임", body: pick(EVENT_GAMES) };
  return { kind: "mission", title: "랜덤 미션", body: pick(EVENT_MISSIONS) };
}

export interface TickState {
  now: number;
  speed: number;
  nextEventAt: number;
  nextVoteAt: number;
  current: { kind: LiveEventKind; startsAt: number; endsAt: number } | null;
}

export interface TickDecision {
  kind: "vote" | "random";
  nextEventAt: number;
  nextVoteAt: number;
}

/**
 * Decides whether the server should emit a new live event now. Pure so the
 * pacing rules are testable; the caller claims the result atomically.
 */
export function decideTick(
  state: TickState,
  rand: () => number = Math.random,
): TickDecision | null {
  const { now, speed, current } = state;
  if (current) {
    if (current.kind === "vote" && now < current.endsAt) return null;
    if (now < current.startsAt + toReal(LIVE.minSpacing, speed)) return null;
  }
  if (now >= state.nextVoteAt)
    return {
      kind: "vote",
      nextVoteAt: now + toReal(between(LIVE.voteGap, rand), speed),
      nextEventAt: Math.max(
        state.nextEventAt,
        now + toReal(LIVE.voteMinutes + LIVE.minSpacing, speed),
      ),
    };
  if (now >= state.nextEventAt)
    return {
      kind: "random",
      nextVoteAt: state.nextVoteAt,
      nextEventAt: now + toReal(between(LIVE.eventGap, rand), speed),
    };
  return null;
}

function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Areas closest to the midpoint of both campuses, with the distance for each team. */
export function regionSuggestions(
  hostSchool: string,
  guestSchool: string | null,
  limit = 4,
): Suggestion[] {
  const find = (name: string | null) => SCHOOLS.find((s) => s.name === name);
  const a = find(hostSchool) ?? SCHOOLS[0];
  const b = find(guestSchool) ?? a;
  const middle = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
  return [...REGION_SPOTS]
    .map((spot) => ({
      spot,
      score:
        distanceKm(spot, middle) +
        Math.abs(distanceKm(spot, a) - distanceKm(spot, b)) / 2,
    }))
    .sort((x, y) => x.score - y.score)
    .slice(0, limit)
    .map(({ spot }) => ({
      name: spot.name,
      category: "지역",
      note:
        a === b
          ? `${a.name}에서 ${distanceKm(spot, a).toFixed(1)}km`
          : `${a.name} ${distanceKm(spot, a).toFixed(1)}km · ${b.name} ${distanceKm(spot, b).toFixed(1)}km`,
    }));
}

export interface Choice {
  chooser: string;
  target: string;
}

/** Pairs where both sides chose each other; one-sided choices are never returned. */
export function mutualPairs(choices: readonly Choice[]): [string, string][] {
  const chosen = new Set(choices.map((c) => `${c.chooser}\u0000${c.target}`));
  const pairs: [string, string][] = [];
  const seen = new Set<string>();
  for (const { chooser, target } of choices) {
    if (chooser === target) continue;
    if (!chosen.has(`${target}\u0000${chooser}`)) continue;
    const [a, b] = chooser < target ? [chooser, target] : [target, chooser];
    const key = `${a}\u0000${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([a, b]);
  }
  return pairs;
}

/**
 * Per-meeting pseudonym for a member. Manager ids are never sent to other
 * participants, so the blind profile cannot be looked up in Desk.
 */
export function memberKey(
  secret: string,
  meetingId: string,
  managerId: string,
): string {
  return createHmac("sha256", secret)
    .update(`meeting-member\0${meetingId}\0${managerId}`)
    .digest("base64url")
    .slice(0, 16);
}

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function inviteCode(): string {
  return Array.from(
    randomBytes(6),
    (byte) => codeAlphabet[byte % codeAlphabet.length],
  ).join("");
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

export function aliasFor(side: "host" | "guest", index: number): string {
  return `${side === "host" ? "A" : "B"}${index + 1}`;
}

export function genderLabel(gender: string): string {
  return gender === "male" ? "남자" : gender === "female" ? "여자" : "무관";
}

export function placeSuggestions(
  region: string,
  people: number,
  meetTime: string,
): { name: string; category: string; note: string }[] {
  const evening = !meetTime || Number(meetTime.slice(0, 2)) >= 18;
  const seats = `${people}인 단체석`;
  const list = [
    {
      name: `${region} 단체석 맛집`,
      category: "음식점",
      note: `${seats} · 첫 만남엔 대화하기 좋은 룸형 추천`,
    },
    evening
      ? {
          name: `${region} 분위기 좋은 술집`,
          category: "술집",
          note: `${meetTime} 이후 게임하기 좋은 곳`,
        }
      : {
          name: `${region} 대형 카페`,
          category: "카페",
          note: `${seats} 가능한 넓은 테이블`,
        },
    {
      name: `${region} 보드게임카페`,
      category: "보드게임카페",
      note: "어색함을 푸는 2차 코스",
    },
    {
      name: `${region} 방탈출`,
      category: "방탈출",
      note: `${Math.ceil(people / 2)}명씩 팀을 섞어 협동 미션`,
    },
  ];
  return list;
}

/** TimePick-style grid: the next week (from tomorrow, Korea time) in one-hour slots. */
export const AVAILABILITY_HOURS = Array.from({ length: 12 }, (_, i) => 11 + i);

export function availabilityDates(now: number, days = 7): string[] {
  const kst = new Date(now + 9 * 60 * MINUTE);
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(
      Date.UTC(
        kst.getUTCFullYear(),
        kst.getUTCMonth(),
        kst.getUTCDate() + 1 + i,
      ),
    );
    return day.toISOString().slice(0, 10);
  });
}

export function slotOf(date: string, hour: number): string {
  return `${date} ${String(hour).padStart(2, "0")}:00`;
}

/** Slots with the most people available, earliest first on ties. */
export function bestSlots(
  available: Record<string, readonly string[]>,
  limit = 3,
): { slot: string; count: number }[] {
  return Object.entries(available)
    .map(([slot, people]) => ({ slot, count: people.length }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.slot.localeCompare(b.slot))
    .slice(0, limit);
}
