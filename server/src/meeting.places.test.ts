import assert from "node:assert/strict";
import test from "node:test";
import { REGION_SPOTS } from "@tutorial/shared";
import {
  isMeetingPlaceName,
  naverMapLink,
  pickPlaces,
  type OverpassElement,
} from "./meeting.places.js";
import { PLACE_SNAPSHOT } from "./meeting.places.snapshot.js";

const center = { lat: 37.5822, lng: 127.0018 };
const place = (
  name: string,
  amenity: string,
  offset: number,
  extra: Record<string, string> = {},
): OverpassElement => ({
  lat: center.lat + offset,
  lon: center.lng,
  tags: { name, amenity, ...extra },
});

test("real places are named, de-duplicated, nearest first, with Naver links", () => {
  const places = pickPlaces("혜화", center, [
    place("금문", "restaurant", 0.002, { "addr:street": "창경궁로" }),
    place("이씨네술집", "pub", 0.001),
    place("금문", "restaurant", 0.003),
    place("서울대학교 의생명연구원 카페", "cafe", 0.0005),
    { lat: center.lat, lon: center.lng, tags: { amenity: "cafe" } },
    place("편의점", "convenience", 0.0001),
  ]);

  assert.deepEqual(
    places.map((p) => p.name),
    ["이씨네술집", "금문"],
  );
  assert.equal(places[1].note, "음식점 · 창경궁로 · 혜화에서 220m");
  assert.equal(
    places[1].link,
    `https://map.naver.com/p/search/${encodeURIComponent("혜화 금문")}`,
  );
});

test("the pick mixes kinds before filling the rest by distance", () => {
  const cafes = Array.from({ length: 6 }, (_, i) =>
    place(`카페${i}`, "cafe", 0.0001 * (i + 1)),
  );
  const food = Array.from({ length: 6 }, (_, i) =>
    place(`식당${i}`, "restaurant", 0.001 * (i + 1)),
  );
  const kinds = pickPlaces("혜화", center, [...cafes, ...food], 8).map(
    (p) => p.category,
  );
  assert.equal(kinds.filter((k) => k === "음식점").length, 4);
  assert.equal(kinds.filter((k) => k === "카페").length, 4);
});

test("Naver links do not repeat the area already in the name", () => {
  assert.equal(
    naverMapLink("혜화", "스타벅스 혜화역점"),
    `https://map.naver.com/p/search/${encodeURIComponent("스타벅스 혜화역점")}`,
  );
});

test("every selectable area has real places bundled with Naver links", () => {
  for (const spot of REGION_SPOTS) {
    const places = PLACE_SNAPSHOT[spot.name];
    assert.ok(places && places.length >= 5, spot.name);
    for (const place of places) {
      assert.ok(isMeetingPlaceName(place.name), place.name);
      assert.ok(place.link?.startsWith("https://map.naver.com/p/search/"));
    }
  }
});

test("karaoke, gaming and broken map names are not suggested", () => {
  assert.equal(isMeetingPlaceName("edge coin garaoke"), false);
  assert.equal(isMeetingPlaceName("티엑스홀덤"), false);
  assert.equal(isMeetingPlaceName("고에몬 (달인,, unbong eden"), false);
  assert.equal(isMeetingPlaceName("학림다방"), true);
});
