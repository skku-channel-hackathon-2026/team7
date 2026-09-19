-- Real places around a meeting area, looked up from OpenStreetMap and cached
-- so the polled room view does not call the external API every time.
CREATE TABLE IF NOT EXISTS meeting_place_cache (
  region TEXT PRIMARY KEY,
  places_json TEXT NOT NULL CHECK (json_valid(places_json)),
  fetched_at INTEGER NOT NULL
);
