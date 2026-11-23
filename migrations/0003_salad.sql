CREATE TABLE salad_rooms (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  version INTEGER NOT NULL,
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX salad_rooms_code ON salad_rooms (code);
CREATE INDEX salad_rooms_updated ON salad_rooms (updated_at);
CREATE TABLE salad_members (
  room_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  seat INTEGER NOT NULL,
  PRIMARY KEY (room_id, person_id)
);
