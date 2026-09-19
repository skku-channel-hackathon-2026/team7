import type { AppDatabase } from "./database.js";

// The meeting tables from cloudflare/migrations/0002–0005, applied by the Worker
// itself so the remote D1 needs no manual migration. Every statement is
// idempotent: tables and indexes use IF NOT EXISTS, and ADD COLUMN on a column
// that already exists is skipped. Keep this in sync with new migrations.
const MEETING_SCHEMA: string[] = [
  // 0002_meeting.sql
  `
    CREATE TABLE IF NOT EXISTS meeting_profiles (
      channel_id TEXT NOT NULL,
      manager_id TEXT NOT NULL,
      department TEXT NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
      age INTEGER NOT NULL,
      student_year INTEGER NOT NULL,
      contact TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (channel_id, manager_id)
    )
  `,
  `
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
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS meetings_channel_status ON meetings (channel_id, status, meet_date)
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS meetings_host_code ON meetings (host_code)
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS meetings_guest_code ON meetings (guest_code)
  `,
  `
    CREATE TABLE IF NOT EXISTS meeting_members (
      meeting_id TEXT NOT NULL REFERENCES meetings (id),
      manager_id TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('host', 'guest')),
      schedule_confirmed INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (meeting_id, manager_id)
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS meeting_members_manager ON meeting_members (manager_id)
  `,
  `
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
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS meeting_messages (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL REFERENCES meetings (id),
      sender_id TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('chat', 'system', 'mc')),
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS meeting_messages_meeting ON meeting_messages (meeting_id, created_at)
  `,
  `
    CREATE TABLE IF NOT EXISTS meeting_places (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL REFERENCES meetings (id),
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      proposed_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS meeting_place_votes (
      place_id TEXT NOT NULL REFERENCES meeting_places (id),
      manager_id TEXT NOT NULL,
      PRIMARY KEY (place_id, manager_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS meeting_stick_votes (
      meeting_id TEXT NOT NULL REFERENCES meetings (id),
      voter_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (meeting_id, voter_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS meeting_after_submissions (
      meeting_id TEXT NOT NULL REFERENCES meetings (id),
      manager_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (meeting_id, manager_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS meeting_after_choices (
      meeting_id TEXT NOT NULL REFERENCES meetings (id),
      chooser_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      PRIMARY KEY (meeting_id, chooser_id, target_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS meeting_private_chats (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL REFERENCES meetings (id),
      member_a TEXT NOT NULL,
      member_b TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (meeting_id, member_a, member_b)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS meeting_private_messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES meeting_private_chats (id),
      sender_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS meeting_private_messages_chat ON meeting_private_messages (chat_id, created_at)
  `,
  `
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
    )
  `,
  // 0003_meeting_live.sql
  `
    ALTER TABLE meeting_profiles ADD COLUMN school TEXT NOT NULL DEFAULT '성균관대 인사캠'
  `,
  `
    ALTER TABLE meetings ADD COLUMN school TEXT NOT NULL DEFAULT '성균관대 인사캠'
  `,
  `
    ALTER TABLE meetings ADD COLUMN guest_school TEXT
  `,
  `
    ALTER TABLE meetings ADD COLUMN event_seq INTEGER NOT NULL DEFAULT 0
  `,
  `
    ALTER TABLE meetings ADD COLUMN next_event_at INTEGER
  `,
  `
    ALTER TABLE meetings ADD COLUMN next_vote_at INTEGER
  `,
  `
    ALTER TABLE meetings ADD COLUMN catfish INTEGER
  `,
  `
    ALTER TABLE meetings ADD COLUMN host_catfish_code TEXT
  `,
  `
    ALTER TABLE meetings ADD COLUMN guest_catfish_code TEXT
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS meetings_host_catfish_code ON meetings (host_catfish_code)
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS meetings_guest_catfish_code ON meetings (guest_catfish_code)
  `,
  `
    ALTER TABLE meeting_members ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
  `,
  `
    ALTER TABLE meeting_members ADD COLUMN entered_at INTEGER
  `,
  `
    ALTER TABLE meeting_places ADD COLUMN poll TEXT NOT NULL DEFAULT 'place'
  `,
  `
    ALTER TABLE meeting_places ADD COLUMN meta TEXT NOT NULL DEFAULT ''
  `,
  `
    ALTER TABLE meeting_reviews ADD COLUMN partner INTEGER
  `,
  `
    CREATE TABLE IF NOT EXISTS meeting_catfish_votes (
      meeting_id TEXT NOT NULL REFERENCES meetings (id),
      manager_id TEXT NOT NULL,
      agree INTEGER NOT NULL CHECK (agree IN (0, 1)),
      PRIMARY KEY (meeting_id, manager_id)
    )
  `,
  `
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
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS meeting_event_votes (
      event_id TEXT NOT NULL REFERENCES meeting_events (id),
      voter_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      PRIMARY KEY (event_id, voter_id)
    )
  `,
  // 0004_meeting_availability.sql
  `
    CREATE TABLE IF NOT EXISTS meeting_availability (
      meeting_id TEXT NOT NULL REFERENCES meetings (id),
      manager_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      PRIMARY KEY (meeting_id, manager_id, slot)
    )
  `,
  // 0005_meeting_place_cache.sql
  `
    CREATE TABLE IF NOT EXISTS meeting_place_cache (
      region TEXT PRIMARY KEY,
      places_json TEXT NOT NULL CHECK (json_valid(places_json)),
      fetched_at INTEGER NOT NULL
    )
  `,
];

let ready: Promise<void> | undefined;

async function apply(database: AppDatabase): Promise<void> {
  for (const sql of MEETING_SCHEMA) {
    try {
      await database.prepare(sql).bind().run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error))) throw error;
    }
  }
}

/** Creates the meeting schema once per Worker isolate. */
export function ensureMeetingSchema(database: AppDatabase): Promise<void> {
  ready ??= apply(database).catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}
