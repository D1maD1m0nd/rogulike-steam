-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;
CREATE TABLE "new_expeditions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "player_id" TEXT NOT NULL,
    "created_at" BIGINT NOT NULL,
    "phase" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    CONSTRAINT "expeditions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_expeditions" (rowid, "created_at", "id", "phase", "player_id", "state", "step") SELECT rowid, "created_at", "id", "phase", "player_id", "state", "step" FROM "expeditions";
DROP TABLE "expeditions";
ALTER TABLE "new_expeditions" RENAME TO "expeditions";
CREATE INDEX "player_expeditions" ON "expeditions"("player_id", "created_at" DESC);
CREATE TABLE "new_game_lists" (
    "player_id" TEXT NOT NULL,
    "app_id" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "added_at" BIGINT NOT NULL,
    "played" BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY ("player_id", "app_id", "kind"),
    CONSTRAINT "game_lists_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_game_lists" (rowid, "added_at", "app_id", "game", "kind", "played", "player_id") SELECT rowid, "added_at", "app_id", "game", "kind", "played", "player_id" FROM "game_lists";
DROP TABLE "game_lists";
ALTER TABLE "new_game_lists" RENAME TO "game_lists";
CREATE TABLE "new_players" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" INTEGER NOT NULL DEFAULT 0,
    "rolls_today" INTEGER NOT NULL DEFAULT 0,
    "bonus" INTEGER NOT NULL DEFAULT 0,
    "rolls_total" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_players" (rowid, "bonus", "day", "id", "points", "rolls_today", "rolls_total") SELECT rowid, "bonus", "day", "id", "points", "rolls_today", "rolls_total" FROM "players";
DROP TABLE "players";
ALTER TABLE "new_players" RENAME TO "players";
CREATE TABLE "new_rolls" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "player_id" TEXT NOT NULL,
    "games" TEXT NOT NULL,
    "filters" TEXT NOT NULL,
    "selected_id" BIGINT,
    "created_at" BIGINT NOT NULL,
    "share_id" TEXT,
    CONSTRAINT "rolls_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_rolls" (rowid, "created_at", "filters", "games", "id", "player_id", "selected_id", "share_id") SELECT rowid, "created_at", "filters", "games", "id", "player_id", "selected_id", "share_id" FROM "rolls";
DROP TABLE "rolls";
ALTER TABLE "new_rolls" RENAME TO "rolls";
CREATE UNIQUE INDEX "rolls_share_id_key" ON "rolls"("share_id");
CREATE INDEX "player_rolls" ON "rolls"("player_id", "created_at" DESC);
CREATE TABLE "new_steam_catalog" (
    "country" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "app_id" BIGINT NOT NULL,
    "game" TEXT NOT NULL,

    PRIMARY KEY ("country", "language", "app_id")
);
INSERT INTO "new_steam_catalog" (rowid, "app_id", "country", "game", "language") SELECT rowid, "app_id", "country", "game", "language" FROM "steam_catalog";
DROP TABLE "steam_catalog";
ALTER TABLE "new_steam_catalog" RENAME TO "steam_catalog";
CREATE TABLE "new_steam_cursor" (
    "country" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "app_id" BIGINT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("country", "language")
);
INSERT INTO "new_steam_cursor" (rowid, "app_id", "country", "language") SELECT rowid, "app_id", "country", "language" FROM "steam_cursor";
DROP TABLE "steam_cursor";
ALTER TABLE "new_steam_cursor" RENAME TO "steam_cursor";
CREATE TABLE "new_votes" (
    "roll_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "game_id" BIGINT NOT NULL,

    PRIMARY KEY ("roll_id", "player_id"),
    CONSTRAINT "votes_roll_id_fkey" FOREIGN KEY ("roll_id") REFERENCES "rolls" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "votes_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_votes" (rowid, "game_id", "player_id", "roll_id") SELECT rowid, "game_id", "player_id", "roll_id" FROM "votes";
DROP TABLE "votes";
ALTER TABLE "new_votes" RENAME TO "votes";
COMMIT;
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
