-- 미팅 모집글 / 다른 학과에 거는 제안 / 참가자
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'recruit' CHECK (kind IN ('recruit', 'proposal')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL CHECK (size BETWEEN 1 AND 5),
  start_at TEXT NOT NULL,
  region TEXT NOT NULL,
  cond_a TEXT NOT NULL CHECK (json_valid(cond_a)),
  cond_b TEXT NOT NULL CHECK (json_valid(cond_b)),
  status TEXT NOT NULL DEFAULT 'recruiting'
    CHECK (status IN ('recruiting', 'matched', 'in_progress', 'finished', 'cancelled')),
  place_id TEXT NOT NULL DEFAULT '',
  place_name TEXT NOT NULL DEFAULT '',
  place_url TEXT NOT NULL DEFAULT '',
  place_note TEXT NOT NULL DEFAULT '',
  reserved_for TEXT NOT NULL DEFAULT '',
  started_at TEXT,
  speed INTEGER NOT NULL DEFAULT 1,
  matched_at TEXT,
  finished_at TEXT,
  last_nudge_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings (status, start_at);
CREATE INDEX IF NOT EXISTS idx_meetings_host ON meetings (host_id);

-- 프로필은 참가 시점의 값을 복사해 저장한다(이후 프로필이 바뀌어도 기록·통계가 유지된다).
CREATE TABLE IF NOT EXISTS meeting_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id TEXT NOT NULL,
  manager_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('a', 'b')),
  seq INTEGER NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  dept TEXT NOT NULL,
  admission_year INTEGER NOT NULL,
  age INTEGER NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  schedule_acked_at TEXT,
  after_submitted_at TEXT,
  joined_at TEXT NOT NULL,
  UNIQUE (meeting_id, manager_id),
  UNIQUE (meeting_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_members_manager ON meeting_members (manager_id);
CREATE INDEX IF NOT EXISTS idx_members_meeting ON meeting_members (meeting_id);

-- 받은 제안을 거절(숨김)한 기록
CREATE TABLE IF NOT EXISTS meeting_hidden (
  meeting_id TEXT NOT NULL,
  manager_id TEXT NOT NULL,
  PRIMARY KEY (meeting_id, manager_id)
);
