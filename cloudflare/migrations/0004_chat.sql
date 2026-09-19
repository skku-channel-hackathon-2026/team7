-- 단체 채팅(room_type = meeting)과 개인 채팅(room_type = dm) 공용 메시지 테이블
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_type TEXT NOT NULL CHECK (room_type IN ('meeting', 'dm')),
  room_id TEXT NOT NULL,
  sender_member_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'system', 'nudge', 'prompt')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_messages (room_type, room_id, id);
