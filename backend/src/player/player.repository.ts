import { Inject, Injectable } from '@nestjs/common';
import type { Filters, Game, Roll, SharedRoll } from '@steam-draft/contracts';
import type { GameList, Prisma, Roll as StoredRoll } from '../../generated/prisma/client';
import { DatabaseService, writeTransaction } from '../database/database.module';

export type { Player, Roll as RollRow } from '../../generated/prisma/client';
export type ListKind = 'collection' | 'wishlist' | 'hidden';

export function toRoll(row: StoredRoll): Roll {
  return {
    id: row.id,
    games: JSON.parse(row.games) as Game[],
    filters: JSON.parse(row.filters) as Filters,
    selectedId: row.selectedId === null ? null : Number(row.selectedId),
    createdAt: Number(row.createdAt),
  };
}

export class PlayerQueries {
  constructor(private readonly db: Prisma.TransactionClient) {}

  player(id: string) {
    return this.db.player.findUnique({ where: { id } });
  }

  register(id: string) {
    return this.db.player.create({ data: { id } });
  }

  reset(id: string, day: number) {
    return this.db.player.updateMany({
      where: { id, day: { not: day } },
      data: { day, rollsToday: 0, bonus: 0 },
    });
  }

  grantBonus(id: string) {
    return this.db.player.update({ where: { id }, data: { bonus: 1 } });
  }

  history(id: string, limit: number) {
    return this.db.$queryRaw<StoredRoll[]>`
      SELECT id, player_id AS playerId, games, filters, selected_id AS selectedId,
        created_at AS createdAt, share_id AS shareId
      FROM rolls WHERE player_id = ${id} ORDER BY created_at DESC, rowid DESC LIMIT ${limit}
    `;
  }

  roll(playerId: string, id: string) {
    return this.db.roll.findUnique({ where: { id, playerId } });
  }

  async addRoll(playerId: string, roll: Roll) {
    await this.db.roll.create({
      data: {
        id: roll.id, playerId, games: JSON.stringify(roll.games), filters: JSON.stringify(roll.filters),
        createdAt: BigInt(roll.createdAt),
      },
    });
    return this.db.player.update({
      where: { id: playerId },
      data: { rollsToday: { increment: 1 }, rollsTotal: { increment: 1 }, points: { increment: 3 } },
    });
  }

  async select(playerId: string, rollId: string, appId: number) {
    await this.db.roll.update({ where: { id: rollId }, data: { selectedId: BigInt(appId) } });
    return this.addPoints(playerId, 25);
  }

  addPoints(id: string, points: number) {
    return this.db.player.update({ where: { id }, data: { points: { increment: points } } });
  }

  lists(id: string) {
    return this.db.$queryRaw<Pick<GameList, 'game' | 'kind' | 'played' | 'addedAt'>[]>`
      SELECT game, kind, played, added_at AS addedAt
      FROM game_lists WHERE player_id = ${id} ORDER BY added_at DESC, rowid DESC
    `;
  }

  async listIds(playerId: string, kind: ListKind): Promise<number[]> {
    const rows = await this.db.gameList.findMany({ where: { playerId, kind }, select: { appId: true } });
    return rows.map(row => Number(row.appId));
  }

  addToList(playerId: string, game: Game, kind: ListKind) {
    const key = { playerId, appId: BigInt(game.id), kind };
    return this.db.gameList.upsert({
      where: { playerId_appId_kind: key },
      create: { ...key, game: JSON.stringify(game), addedAt: BigInt(Date.now()) },
      update: {},
    });
  }

  removeFromList(playerId: string, appId: number, kind: ListKind) {
    return this.db.gameList.deleteMany({ where: { playerId, appId: BigInt(appId), kind } });
  }

  async markPlayed(playerId: string, appId: number, played: boolean): Promise<boolean> {
    const { count } = await this.db.gameList.updateMany({
      where: { playerId, appId: BigInt(appId), kind: 'collection' },
      data: { played },
    });
    return count > 0;
  }

  publish(rollId: string, shareId: string) {
    return this.db.roll.update({ where: { id: rollId }, data: { shareId } });
  }

  sharedRow(shareId: string) {
    return this.db.roll.findUnique({ where: { shareId } });
  }

  async votes(rollId: string, playerId: string): Promise<Pick<SharedRoll, 'votes' | 'ownVote'>> {
    const tally = await this.db.vote.groupBy({ by: ['gameId'], where: { rollId }, _count: { _all: true } });
    const ownVote = await this.db.vote.findUnique({ where: { rollId_playerId: { rollId, playerId } } });
    return {
      votes: Object.fromEntries(tally.map(row => [Number(row.gameId), row._count._all])),
      ownVote: ownVote ? Number(ownVote.gameId) : null,
    };
  }

  vote(rollId: string, playerId: string, appId: number) {
    const gameId = BigInt(appId);
    return this.db.vote.upsert({
      where: { rollId_playerId: { rollId, playerId } },
      create: { rollId, playerId, gameId },
      update: { gameId },
    });
  }
}

@Injectable()
export class PlayerRepository extends PlayerQueries {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {
    super(database.client);
  }

  transaction<T>(operation: (players: PlayerQueries, tx: Prisma.TransactionClient) => Promise<T>) {
    return writeTransaction(this.database.client, tx => operation(new PlayerQueries(tx), tx));
  }
}
