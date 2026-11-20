CREATE TABLE players (
  id TEXT PRIMARY KEY,
  day INTEGER NOT NULL DEFAULT 0,
  rolls_today INTEGER NOT NULL DEFAULT 0,
  bonus INTEGER NOT NULL DEFAULT 0,
  rolls_total INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE rolls (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  games TEXT NOT NULL,
  filters TEXT NOT NULL,
  selected_id INTEGER,
  created_at INTEGER NOT NULL,
  share_id TEXT UNIQUE
);
CREATE INDEX player_rolls ON rolls(player_id, created_at DESC);
CREATE TABLE votes (
  roll_id TEXT NOT NULL REFERENCES rolls(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  game_id INTEGER NOT NULL,
  PRIMARY KEY (roll_id, player_id)
);
CREATE TABLE game_lists (
  player_id TEXT NOT NULL REFERENCES players(id),
  app_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  game TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  played INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, app_id, kind)
);
CREATE TABLE steam_catalog (
  country TEXT NOT NULL,
  language TEXT NOT NULL,
  app_id INTEGER NOT NULL,
  game TEXT NOT NULL,
  PRIMARY KEY (country, language, app_id)
);
CREATE TABLE steam_cursor (
  country TEXT NOT NULL,
  language TEXT NOT NULL,
  app_id INTEGER NOT NULL,
  PRIMARY KEY (country, language)
);
CREATE TABLE expeditions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  created_at INTEGER NOT NULL,
  phase TEXT NOT NULL,
  step INTEGER NOT NULL,
  state TEXT NOT NULL
);
CREATE INDEX player_expeditions ON expeditions(player_id, created_at DESC);
