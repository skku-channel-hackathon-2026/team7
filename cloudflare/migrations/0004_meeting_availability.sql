-- TimePick-style date voting: every participant paints the time slots they
-- are available in; the room sees how many people overlap per slot.
CREATE TABLE IF NOT EXISTS meeting_availability (
  meeting_id TEXT NOT NULL REFERENCES meetings (id),
  manager_id TEXT NOT NULL,
  -- 'YYYY-MM-DD HH:MM' (one-hour slot start, Korea time)
  slot TEXT NOT NULL,
  PRIMARY KEY (meeting_id, manager_id, slot)
);
