-- Bomb online rooms (docs/decisions/0004, docs/plans/bomb-online-contract.md). The seat order, names, styles, decks,
-- rematch votes and the engine state live in rooms.state; room_members answers "is this person in this room" by key.
-- No index on updated_at: the expiry sweep runs only when a room is created, and an index would add a row write to
-- every action.
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL,
  state TEXT NOT NULL,
  last_action TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE room_members (
  room_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  seen INTEGER NOT NULL,
  PRIMARY KEY (room_id, person_id)
) WITHOUT ROWID;
