-- Meeting v2: schools, polls in the group chat, server-driven random live
-- events, anonymous like votes, catfish (메기) members and department rank.
-- Additive only; existing rows keep working through column defaults.

ALTER TABLE meeting_profiles ADD COLUMN school TEXT NOT NULL DEFAULT '성균관대 인사캠';

ALTER TABLE meetings ADD COLUMN school TEXT NOT NULL DEFAULT '성균관대 인사캠';
ALTER TABLE meetings ADD COLUMN guest_school TEXT;
-- Live event scheduling is owned by the server: the next random event and the
-- next like vote are stored here and claimed atomically through event_seq.
ALTER TABLE meetings ADD COLUMN event_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meetings ADD COLUMN next_event_at INTEGER;
ALTER TABLE meetings ADD COLUMN next_vote_at INTEGER;
-- NULL = undecided, 1 = the room wants catfish members, 0 = no catfish.
ALTER TABLE meetings ADD COLUMN catfish INTEGER;
ALTER TABLE meetings ADD COLUMN host_catfish_code TEXT;
ALTER TABLE meetings ADD COLUMN guest_catfish_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS meetings_host_catfish_code ON meetings (host_catfish_code);
CREATE UNIQUE INDEX IF NOT EXISTS meetings_guest_catfish_code ON meetings (guest_catfish_code);

ALTER TABLE meeting_members ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE meeting_members ADD COLUMN entered_at INTEGER;

-- meeting_places now backs every poll in the room: date, region and place.
ALTER TABLE meeting_places ADD COLUMN poll TEXT NOT NULL DEFAULT 'place';
ALTER TABLE meeting_places ADD COLUMN meta TEXT NOT NULL DEFAULT '';

ALTER TABLE meeting_reviews ADD COLUMN partner INTEGER;

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
