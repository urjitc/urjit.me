-- Jams on the public wall (worker/jams.ts). `pattern` is the hits (src/features/looper/jam.ts).
CREATE TABLE jams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pattern TEXT NOT NULL,
  kit TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX jams_recent ON jams (created_at DESC);
