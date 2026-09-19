-- 블라인드 프로필: 미팅 성사 전에는 학과·학번·나이만 상대에게 공개된다.
CREATE TABLE IF NOT EXISTS profiles (
  manager_id TEXT PRIMARY KEY,
  dept TEXT NOT NULL,
  admission_year INTEGER NOT NULL CHECK (admission_year BETWEEN 0 AND 99),
  age INTEGER NOT NULL CHECK (age BETWEEN 18 AND 40),
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
