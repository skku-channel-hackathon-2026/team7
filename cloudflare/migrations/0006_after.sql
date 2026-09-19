-- 익명 애프터 선택과 상호 일치 시 생성되는 개인 채팅방
-- 선택 결과는 서로 일치할 때만 노출되며, 일치하지 않는 선택은 상대에게 공개되지 않는다.
CREATE TABLE IF NOT EXISTS after_choices (
  meeting_id TEXT NOT NULL,
  chooser_member_id INTEGER NOT NULL,
  target_member_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (meeting_id, chooser_member_id, target_member_id)
);

-- member_a < member_b 로 정규화해서 저장한다.
CREATE TABLE IF NOT EXISTS dm_rooms (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  member_a INTEGER NOT NULL,
  member_b INTEGER NOT NULL,
  a_consent INTEGER NOT NULL DEFAULT 0,
  b_consent INTEGER NOT NULL DEFAULT 0,
  a_contact TEXT NOT NULL DEFAULT '',
  b_contact TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (meeting_id, member_a, member_b),
  CHECK (member_a < member_b)
);
CREATE INDEX IF NOT EXISTS idx_dm_meeting ON dm_rooms (meeting_id);
