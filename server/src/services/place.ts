import type {
  PlaceInfo,
  PlaceRecommendInput,
  PlaceReserveInput,
  PlaceSelectInput,
  PlaceView,
} from "@tutorial/shared";
import { ServiceError, exec, queryAll, type ServiceContext } from "./core.js";
import { formatKst, kstHour } from "./format.js";
import { postSystem } from "./chat.js";
import {
  PLACES,
  findPlace,
  mapUrl,
  reservationUrl,
  type PlaceSeed,
} from "./places-data.js";
import { loadMeeting, requireMember } from "./store.js";

const BASE_REVIEW_WEIGHT = 20;
const MAX_PER_CATEGORY = 3;
const MAX_RESULTS = 12;

interface ReviewAgg {
  place_id: string;
  n: number;
  avg_place: number;
}

function isOpenAt(place: PlaceSeed, hour: number): boolean {
  return (
    (hour >= place.openFrom && hour < place.openTo) ||
    (hour + 24 >= place.openFrom && hour + 24 < place.openTo)
  );
}

/** How well a category suits the time of day (0-3). */
function timeFit(category: string, hour: number): number {
  const slot =
    hour < 11
      ? "morning"
      : hour < 17
        ? "afternoon"
        : hour < 21
          ? "evening"
          : "night";
  const table: Record<string, Record<string, number>> = {
    morning: { 카페: 3, 음식점: 2 },
    afternoon: { 카페: 3, 보드게임카페: 3, 방탈출: 3, 기타: 2, 음식점: 2 },
    evening: { 음식점: 3, 술집: 2, 보드게임카페: 2, 방탈출: 2, 기타: 1 },
    night: { 술집: 3, 보드게임카페: 2, 기타: 2 },
  };
  return table[slot]?.[category] ?? 0;
}

const SLOT_LABEL = (hour: number): string =>
  hour < 11
    ? "오전"
    : hour < 17
      ? "낮 시간"
      : hour < 21
        ? "저녁 시간"
        : "늦은 시간";

export async function recommendPlaces(
  sc: ServiceContext,
  input: PlaceRecommendInput,
): Promise<PlaceView[]> {
  let region = input.region;
  let headcount = input.headcount;
  let startAt = input.startAt;
  if (input.meetingId) {
    const meeting = await loadMeeting(sc, input.meetingId);
    region ||= meeting.region;
    headcount ??= meeting.size * 2;
    startAt ??= meeting.start_at;
  }
  const hour = startAt ? kstHour(startAt) : 19;

  const aggs = await queryAll<ReviewAgg>(
    sc,
    `SELECT m.place_id AS place_id, COUNT(*) AS n, AVG(r.place) AS avg_place
     FROM reviews r JOIN meetings m ON m.id = r.meeting_id
     WHERE m.place_id != '' GROUP BY m.place_id`,
  );
  const aggById = new Map(aggs.map((a) => [a.place_id, a]));

  const candidates = PLACES.filter(
    (p) =>
      (!region || p.region === region) &&
      (!input.category || p.category === input.category) &&
      (!headcount || p.capacityMax >= headcount) &&
      isOpenAt(p, hour),
  );

  const scored = candidates
    .map((place) => {
      const agg = aggById.get(place.id);
      const reviewCount = agg?.n ?? 0;
      const rating = agg
        ? (place.rating * BASE_REVIEW_WEIGHT + agg.avg_place * agg.n) /
          (BASE_REVIEW_WEIGHT + agg.n)
        : place.rating;
      const fit = timeFit(place.category, hour);
      const score = rating * 10 + fit * 8 + (place.perk ? 3 : 0);
      return { place, rating, reviewCount, fit, score };
    })
    .sort((a, b) => b.score - a.score);

  // Keep the list varied unless the caller asked for one category.
  const perCategory = new Map<string, number>();
  const picked = scored.filter(({ place }) => {
    if (input.category) return true;
    const used = perCategory.get(place.category) ?? 0;
    if (used >= MAX_PER_CATEGORY) return false;
    perCategory.set(place.category, used + 1);
    return true;
  });

  const results: PlaceView[] = [];
  for (const { place, rating, reviewCount, fit } of picked.slice(
    0,
    MAX_RESULTS,
  )) {
    const comments = await queryAll<{ comment: string }>(
      sc,
      `SELECT r.comment AS comment FROM reviews r JOIN meetings m ON m.id = r.meeting_id
       WHERE m.place_id = ? AND r.comment != '' ORDER BY r.created_at DESC LIMIT 3`,
      place.id,
    );
    const reasons = [
      headcount ? `${headcount}명이 앉기 좋아요` : "",
      fit >= 3 ? `${SLOT_LABEL(hour)}에 잘 어울려요` : "",
      place.perk ? "미팅 참가자 혜택" : "",
    ].filter(Boolean);
    results.push({
      placeId: place.id,
      name: place.name,
      category: place.category,
      region: place.region,
      address: place.address,
      capacityMax: place.capacityMax,
      priceLevel: place.priceLevel,
      tags: place.tags,
      rating: Math.round(rating * 10) / 10,
      reviewCount,
      perk: place.perk,
      reservationUrl: reservationUrl(place),
      mapUrl: mapUrl(place),
      reason: reasons.join(" · ") || "이 지역의 인기 장소예요",
      recentReviews: comments.map((c) => c.comment),
    });
  }
  return results;
}

function toInfo(row: {
  place_id: string;
  place_name: string;
  place_url: string;
  place_note: string;
  reserved_for: string;
}): PlaceInfo {
  return {
    placeId: row.place_id,
    name: row.place_name,
    url: row.place_url,
    note: row.place_note,
    reservedFor: row.reserved_for,
  };
}

export async function selectPlace(
  sc: ServiceContext,
  input: PlaceSelectInput,
): Promise<PlaceInfo> {
  const { meeting } = await requireMember(sc, input.meetingId);
  if (meeting.host_id !== sc.userId)
    throw new ServiceError("모집한 사람만 장소를 확정할 수 있어요.", "notHost");
  if (meeting.status !== "matched" && meeting.status !== "in_progress")
    throw new ServiceError(
      "성사된 미팅에서만 장소를 정할 수 있어요.",
      "notMatched",
    );
  const place = findPlace(input.placeId);
  if (!place)
    throw new ServiceError(
      "장소를 찾을 수 없어요.",
      "placeNotFound",
      "notFound",
    );

  await exec(
    sc,
    `UPDATE meetings SET place_id = ?, place_name = ?, place_url = ?, place_note = '', reserved_for = ''
     WHERE id = ?`,
    place.id,
    place.name,
    reservationUrl(place),
    input.meetingId,
  );
  await postSystem(
    sc,
    "meeting",
    input.meetingId,
    `📍 장소가 정해졌어요: ${place.name} (${place.region})\n예약 링크: ${reservationUrl(place)}${place.perk ? `\n🎁 ${place.perk}` : ""}`,
  );
  return toInfo({
    place_id: place.id,
    place_name: place.name,
    place_url: reservationUrl(place),
    place_note: "",
    reserved_for: "",
  });
}

export async function shareReservation(
  sc: ServiceContext,
  input: PlaceReserveInput,
): Promise<PlaceInfo> {
  const { meeting } = await requireMember(sc, input.meetingId);
  if (meeting.host_id !== sc.userId)
    throw new ServiceError(
      "모집한 사람만 예약 일정을 공유할 수 있어요.",
      "notHost",
    );
  if (!meeting.place_id)
    throw new ServiceError("먼저 장소를 확정해 주세요.", "placeRequired");
  await exec(
    sc,
    "UPDATE meetings SET reserved_for = ?, place_note = ? WHERE id = ?",
    input.reservedFor,
    input.note,
    input.meetingId,
  );
  await postSystem(
    sc,
    "meeting",
    input.meetingId,
    `✅ 예약 일정이 공유됐어요\n${meeting.place_name} · ${input.reservedFor}${input.note ? `\n메모: ${input.note}` : ""}\n(미팅 시간: ${formatKst(meeting.start_at)})`,
  );
  return toInfo({
    place_id: meeting.place_id,
    place_name: meeting.place_name,
    place_url: meeting.place_url,
    place_note: input.note,
    reserved_for: input.reservedFor,
  });
}
