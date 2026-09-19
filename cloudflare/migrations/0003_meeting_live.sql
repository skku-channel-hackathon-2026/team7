-- Meeting v2: schools, polls in the group chat, server-driven random live
-- events, anonymous like votes, catfish (메기) members and department rank.
--
-- The v2 columns on existing tables (school, guest_school, event_seq,
-- next_event_at, next_vote_at, catfish, host/guest_catfish_code, role,
-- entered_at, poll, meta, partner) and the catfish-code unique indexes are
-- added by the Worker itself (server/src/meeting.schema.ts). SQLite has no
-- "ADD COLUMN IF NOT EXISTS", and the Worker may already have added them to the
-- remote D1, so this file keeps only statements that are safe to re-run.

CREATE TABLE IF NOT EXISTS meeting_catfish_votes (
  meeting_id TEXT NOT NULL REFERENCES meetings (id),
  manager_id TEXT NOT NULL,
  agree INTEGER NOT NULL CHECK (agree IN (0, 1)),
  PRIMARY KEY (meeting_id, manager_id)
);

CREATE TABLE IF NOT EXISTS meeting_events (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings (id),
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('start', 'topic', 'mission', 'game', 'vote', 'catfish')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  UNIQUE (meeting_id, seq)
);

CREATE TABLE IF NOT EXISTS meeting_event_votes (
  event_id TEXT NOT NULL REFERENCES meeting_events (id),
  voter_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  PRIMARY KEY (event_id, voter_id)
);
