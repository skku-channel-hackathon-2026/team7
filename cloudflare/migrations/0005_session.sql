-- 미팅 진행 콘텐츠: 단계별 프롬프트, 미션 투표, 사랑의 짝대기
CREATE TABLE IF NOT EXISTS meeting_prompts (
  meeting_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  kind TEXT NOT NULL,
  minute INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  voteable INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (meeting_id, slot)
);

CREATE TABLE IF NOT EXISTS prompt_votes (
  meeting_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  voter_member_id INTEGER NOT NULL,
  target_member_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (meeting_id, slot, voter_member_id)
);

CREATE TABLE IF NOT EXISTS picks (
  meeting_id TEXT NOT NULL,
  chooser_member_id INTEGER NOT NULL,
  target_member_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (meeting_id, chooser_member_id)
);
