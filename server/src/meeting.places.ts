import { REGION_SPOTS, type Suggestion } from "@tutorial/shared";

// Real places around a meeting area come from OpenStreetMap through the public
// Overpass API, which needs no key. Each place links to its Naver Map search,
// where the Naver reviews and the Naver booking button live.
// Main instance first, then a public mirror when it is busy.
const OVERPASS_ENDPOINTS = [
  { url: "https://overpass-api.de/api/interpreter", timeoutMs: 8000 },
  {
    url: "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    timeoutMs: 12000,
  },
];
const SEARCH_RADIUS_M = 700;
const PLACE_LIMIT = 8;

const KIND_LABEL: Record<string, string> = {
  restaurant: "음식점",
  pub: "술집",
  bar: "술집",
  cafe: "카페",
};
// How many of each kind to show first; the rest is filled by distance.
const KIND_QUOTA: Record<string, number> = { 음식점: 4, 술집: 2, 카페: 2 };
// Campus canteens, karaoke and gaming venues are not meeting places, and very
// long or comma-laden names are usually broken map entries.
const EXCLUDED_NAME =
  /대학교|학생식당|구내식당|기숙사|병원|홀덤|노래|코인|karaoke|garaoke|,,/i;

export function isMeetingPlaceName(name: string): boolean {
  return name.length <= 30 && !EXCLUDED_NAME.test(name);
}

export interface OverpassElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function regionSpot(region: string) {
  return REGION_SPOTS.find((spot) => spot.name === region);
}

export function naverMapLink(region: string, name: string): string {
  const query = name.includes(region) ? name : `${region} ${name}`;
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}

function metersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(h));
}

/** Named, nearby, de-duplicated places with a mix of food, bars and cafes. */
export function pickPlaces(
  region: string,
  center: { lat: number; lng: number },
  elements: readonly OverpassElement[],
  limit = PLACE_LIMIT,
): Suggestion[] {
  const seen = new Set<string>();
  const candidates = elements
    .map((element) => {
      const tags = element.tags ?? {};
      const name = tags.name?.trim();
      const kind = KIND_LABEL[tags.amenity ?? ""];
      const lat = element.lat ?? element.center?.lat;
      const lng = element.lon ?? element.center?.lon;
      if (!name || !kind || lat === undefined || lng === undefined) return null;
      if (!isMeetingPlaceName(name) || seen.has(name)) return null;
      seen.add(name);
      return {
        name,
        kind,
        street: tags["addr:street"] ?? "",
        distance: metersBetween(center, { lat, lng }),
      };
    })
    .filter((place) => place !== null)
    .sort((a, b) => a.distance - b.distance);

  const picked: typeof candidates = [];
  const counts: Record<string, number> = {};
  for (const place of candidates) {
    if (picked.length >= limit) break;
    if ((counts[place.kind] ?? 0) >= (KIND_QUOTA[place.kind] ?? 0)) continue;
    counts[place.kind] = (counts[place.kind] ?? 0) + 1;
    picked.push(place);
  }
  for (const place of candidates) {
    if (picked.length >= limit) break;
    if (!picked.includes(place)) picked.push(place);
  }

  return picked
    .sort((a, b) => a.distance - b.distance)
    .map((place) => ({
      name: place.name,
      category: place.kind,
      note: [
        place.kind,
        place.street,
        `${region}에서 ${Math.round(place.distance / 10) * 10}m`,
      ]
        .filter(Boolean)
        .join(" · "),
      link: naverMapLink(region, place.name),
    }));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fetches real places around a known meeting area; null when unavailable. */
export async function fetchRegionPlaces(
  region: string,
): Promise<Suggestion[] | null> {
  const spot = regionSpot(region);
  if (!spot) return null;
  const query = `[out:json][timeout:10];nwr(around:${SEARCH_RADIUS_M},${spot.lat},${spot.lng})[name][amenity~"^(restaurant|cafe|bar|pub)$"];out center tags 120;`;
  // The main instance is briefly busy now and then, so it gets one retry.
  const attempts = [
    OVERPASS_ENDPOINTS[0],
    OVERPASS_ENDPOINTS[0],
    ...OVERPASS_ENDPOINTS.slice(1),
  ];
  for (const [index, endpoint] of attempts.entries()) {
    if (index === 1) await sleep(1000);
    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": "gwamegi-meeting-app/1.0 (Channel App)",
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(endpoint.timeoutMs),
      });
      if (!response.ok) continue;
      const json = (await response.json()) as { elements?: OverpassElement[] };
      const places = pickPlaces(region, spot, json.elements ?? []);
      if (places.length) return places;
    } catch {
      // Try again or move on to the mirror.
    }
  }
  return null;
}
