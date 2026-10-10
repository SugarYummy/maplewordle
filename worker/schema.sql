-- One row per (mode, day, score); count = how many players got that score.
CREATE TABLE IF NOT EXISTS results (
  mode  TEXT    NOT NULL,
  day   INTEGER NOT NULL,
  score TEXT    NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (mode, day, score)
);
