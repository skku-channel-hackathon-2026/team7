-- 미팅 후기 / 애프터 후기 (미팅 기록·학과 통계의 원천 데이터)
CREATE TABLE IF NOT EXISTS reviews (
  meeting_id TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  mood INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
  talk INTEGER NOT NULL CHECK (talk BETWEEN 1 AND 5),
  place INTEGER NOT NULL CHECK (place BETWEEN 1 AND 5),
  content INTEGER NOT NULL CHECK (content BETWEEN 1 AND 5),
  rejoin INTEGER NOT NULL CHECK (rejoin IN (0, 1)),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (meeting_id, member_id)
);

CREATE TABLE IF NOT EXISTS after_reviews (
  room_id TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  met INTEGER NOT NULL CHECK (met IN (0, 1)),
  score INTEGER CHECK (score IS NULL OR score BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (room_id, member_id)
);
