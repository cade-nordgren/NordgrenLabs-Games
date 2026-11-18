CREATE TABLE saves (
  id TEXT PRIMARY KEY,
  person_public_id TEXT NOT NULL,
  game TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  record TEXT NOT NULL
);
CREATE INDEX saves_owner ON saves (person_public_id, game, updated_at);
