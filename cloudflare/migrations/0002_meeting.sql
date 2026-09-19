-- Blind meeting platform. Every row is scoped to the Channel (channel_id) and
-- identifies people by the signed Channel caller (manager id).
-- Timestamps are epoch milliseconds so MC timing can be computed without parsing.

CREATE TABLE IF NOT EXISTS meeting_profiles (
  channel_id TEXT NOT NULL,
  manager_id TEXT NOT NULL,
  department TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  age INTEGER NOT NULL,
  student_year INTEGER NOT NULL,
  -- Private: never returned to others; only shared by its owner in a private chat.
  contact TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (channel_id, manager_id)
);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('open', 'proposal')),
  host_id TEXT NOT NULL,
  department TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  size INTEGER NOT NULL CHECK (size BETWEEN 1 AND 6),
  target_gender TEXT NOT NULL CHECK (target_gender IN ('male', 'female', 'any')),
  target_department TEXT,
  age_min INTEGER NOT NULL,
  age_max INTEGER NOT NULL,
  year_min INTEGER NOT NULL,
  year_max INTEGER NOT NULL,
  meet_date TEXT NOT NULL,
  meet_time TEXT NOT NULL,
  region TEXT NOT NULL,
  intro TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'recruiting'
    CHECK (status IN ('recruiting', 'matched', 'live', 'finished', 'cancelled')),
  guest_department TEXT,
  place TEXT NOT NULL DEFAULT '',
  host_code TEXT NOT NULL,
  guest_code TEXT,
  notify_group_id TEXT,
  started_at INTEGER,
  mc_speed INTEGER NOT NULL DEFAULT 1,
  mc_reroll INTEGER NOT NULL DEFAULT 0,
  mc_announced INTEGER NOT NULL DEFAULT -1,
  finished_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS meetings_channel_status ON meetings (channel_id, status, meet_date);
CREATE UNIQUE INDEX IF NOT EXISTS meetings_host_code ON meetings (host_code);
CREATE UNIQUE INDEX IF NOT EXISTS meetings_guest_code ON meetings (guest_code);

CREATE TABLE IF NOT EXISTS meeting_members (
  meeting_id TEXT NOT NULL REFERENCES meetings (id),
  manager_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('host', 'guest')),
  schedule_confirmed INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (meeting_id, manager_id)
);
CREATE INDEX IF NOT EXISTS meeting_members_manager ON meeting_members (manager_id);

CREATE TABLE IF NOT EXISTS meeting_applications (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings (id),
  applicant_id TEXT NOT NULL,
  department TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at INTEGER NOT NULL,
  UNIQUE (meeting_id, applicant_id)
);

CREATE TABLE IF NOT EXISTS meeting_messages (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings (id),
  sender_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('chat', 'system', 'mc')),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS meeting_messages_meeting ON meeting_messages (meeting_id, created_at);

CREATE TABLE IF NOT EXISTS meeting_places (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings (id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  proposed_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meeting_place_votes (
  place_id TEXT NOT NULL REFERENCES meeting_places (id),
  manager_id TEXT NOT NULL,
  PRIMARY KEY (place_id, manager_id)
);

CREATE TABLE IF NOT EXISTS meeting_stick_votes (
  meeting_id TEXT NOT NULL REFERENCES meetings (id),
  voter_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (meeting_id, voter_id)
);

-- One row per submitted after form (also when nobody was chosen).
CREATE TABLE IF NOT EXISTS meeting_after_submissions (
  meeting_id TEXT NOT NULL REFERENCES meetings (id),
  manager_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (meeting_id, manager_id)
);

CREATE TABLE IF NOT EXISTS meeting_after_choices (
  meeting_id TEXT NOT NULL REFERENCES meetings (id),
  chooser_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  PRIMARY KEY (meeting_id, chooser_id, target_id)
);

-- member_a < member_b so a pair has exactly one chat per meeting.
CREATE TABLE IF NOT EXISTS meeting_private_chats (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings (id),
  member_a TEXT NOT NULL,
  member_b TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (meeting_id, member_a, member_b)
);

CREATE TABLE IF NOT EXISTS meeting_private_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES meeting_private_chats (id),
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS meeting_private_messages_chat ON meeting_private_messages (chat_id, created_at);

CREATE TABLE IF NOT EXISTS meeting_reviews (
  meeting_id TEXT NOT NULL REFERENCES meetings (id),
  manager_id TEXT NOT NULL,
  mood INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
  conversation INTEGER NOT NULL CHECK (conversation BETWEEN 1 AND 5),
  place INTEGER NOT NULL CHECK (place BETWEEN 1 AND 5),
  content INTEGER NOT NULL CHECK (content BETWEEN 1 AND 5),
  want_again INTEGER NOT NULL CHECK (want_again IN (0, 1)),
  after_review TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (meeting_id, manager_id)
);
