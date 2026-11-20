import { BadRequestException, ConflictException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Filters, Game, PlayerState, Roll, SharedRoll } from '@steam-draft/contracts';
import type { Prisma } from '../../generated/prisma/client';
import { CatalogService } from '../catalog/catalog.module';
import { drawGames } from '../catalog/draft';
import { PlayerRepository, toRoll, type ListKind, type Player, type PlayerQueries, type RollRow } from './player.repository';

const dayLength = 86_400_000;
const dailyLimit = 8;
const bonusRolls = 3;

@Injectable()
export class PlayerService {
  constructor(
    @Inject(PlayerRepository) private readonly repository: PlayerRepository,
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}

  private async currentPlayer(id: string, players: PlayerQueries): Promise<Player> {
    await players.reset(id, Math.floor(Date.now() / dayLength));
    const player = await players.player(id);
    if (!player) throw new NotFoundException('Сессия не найдена.');
    return player;
  }

  private daily(player: Player): PlayerState['daily'] {
    const limit = dailyLimit + player.bonus * bonusRolls;
    return {
      limit, remaining: limit - player.rollsToday,
      bonusAvailable: !player.bonus, resetsAt: (player.day + 1) * dayLength,
    };
  }

  private async lists(id: string, players: PlayerQueries, db: Prisma.TransactionClient) {
    const rows = await players.lists(id);
    const catalog = await this.catalog.catalog(db);
    return rows.map(row => {
      const snapshot = JSON.parse(row.game) as Game;
      return { ...row, game: catalog.get(snapshot.id) ?? snapshot };
    });
  }

  state(id: string): Promise<PlayerState> {
    return this.repository.transaction(async (players, db) => {
      const player = await this.currentPlayer(id, players);
      const history = (await players.history(id, 30)).map(toRoll);
      const lists = await this.lists(id, players, db);
      const collection = lists.filter(row => row.kind === 'collection')
        .map(row => ({ game: row.game, played: Boolean(row.played), savedAt: Number(row.addedAt) }));
      return {
        activeRoll: history[0] ?? null,
        collection,
        wishlist: lists.filter(row => row.kind === 'wishlist').map(row => row.game),
        hidden: lists.filter(row => row.kind === 'hidden').map(row => row.game),
        history,
        daily: this.daily(player),
        stats: {
          rolls: player.rollsTotal,
          collected: collection.length,
          played: collection.filter(row => row.played).length,
          points: player.points,
        },
      };
    });
  }

  async roll(id: string, filters: Filters): Promise<PlayerState> {
    await this.repository.transaction(async (players, tx) => {
      if (this.daily(await this.currentPlayer(id, players)).remaining < 1) {
        throw new HttpException('Подборки на сегодня закончились. Забери бонус или дождись обновления.', 429);
      }
      const excluded = new Set([...await players.listIds(id, 'collection'), ...await players.listIds(id, 'hidden')]);
      const wishes = new Set(await players.listIds(id, 'wishlist'));
      const pool = (await this.catalog.eligible(filters, tx)).filter(game => !excluded.has(game.id));
      if (pool.length < 2) {
        throw new BadRequestException('Под фильтры подходят меньше двух новых игр. Попробуй ослабить условия.');
      }

      const [latest] = await players.history(id, 1);
      const previous = new Set(latest ? toRoll(latest).games.map(game => game.id) : []);
      const unseen = pool.filter(game => !previous.has(game.id));
      const games = drawGames(unseen.length >= 3 ? unseen : pool, wishes);
      await players.addRoll(id, { id: randomUUID(), games, filters, selectedId: null, createdAt: Date.now() });
    });
    return this.state(id);
  }

  async claim(id: string, rollId: string, appId: number): Promise<PlayerState> {
    await this.repository.transaction(async players => {
      const row = await players.roll(id, rollId);
      if (!row) throw new NotFoundException('Подборка не найдена.');
      if (row.selectedId === BigInt(appId)) return;
      if (!await this.isVotingOpen(row, players)) {
        throw new ConflictException('Эта подборка уже закрыта. Выбери игру из текущей.');
      }
      const game = toRoll(row).games.find(item => item.id === appId);
      if (!game) throw new BadRequestException('Этой игры нет в подборке.');
      await players.addToList(id, game, 'collection');
      await players.removeFromList(id, appId, 'wishlist');
      await players.removeFromList(id, appId, 'hidden');
      await players.select(id, rollId, appId);
    });
    return this.state(id);
  }

  async bonus(id: string): Promise<PlayerState> {
    await this.repository.transaction(async players => {
      await this.currentPlayer(id, players);
      await players.grantBonus(id);
    });
    return this.state(id);
  }

  async preference(id: string, appId: number, kind: Exclude<ListKind, 'collection'>, enabled: boolean): Promise<PlayerState> {
    await this.repository.transaction(async (players, tx) => {
      if (!enabled) {
        await players.removeFromList(id, appId, kind);
        return;
      }
      const game = (await this.catalog.catalog(tx)).get(appId);
      if (!game) throw new NotFoundException('Игры нет в каталоге.');
      if (kind === 'wishlist' && (await players.listIds(id, 'collection')).includes(appId)) {
        throw new ConflictException('Эта игра уже в коллекции.');
      }
      await players.addToList(id, game, kind);
      await players.removeFromList(id, appId, kind === 'hidden' ? 'wishlist' : 'hidden');
    });
    return this.state(id);
  }

  async played(id: string, appId: number, played: boolean): Promise<PlayerState> {
    if (!await this.repository.markPlayed(id, appId, played)) throw new NotFoundException('Игры нет в коллекции.');
    return this.state(id);
  }

  share(id: string, rollId: string): Promise<{ shareId: string }> {
    return this.repository.transaction(async players => {
      const roll = await players.roll(id, rollId);
      if (!roll) throw new NotFoundException('Подборка не найдена.');
      const shareId = roll.shareId ?? randomUUID();
      if (!roll.shareId) await players.publish(rollId, shareId);
      return { shareId };
    });
  }

  async shared(id: string, shareId: string): Promise<SharedRoll> {
    const row = await this.repository.sharedRow(shareId);
    if (!row) throw new NotFoundException('Общая подборка не найдена.');
    const { games, selectedId } = toRoll(row);
    return { games, selectedId, votingOpen: await this.isVotingOpen(row), ...await this.repository.votes(row.id, id) };
  }

  private async isVotingOpen(row: RollRow, players: PlayerQueries = this.repository): Promise<boolean> {
    return row.selectedId === null && (await players.history(row.playerId, 1))[0]?.id === row.id;
  }

  async vote(id: string, shareId: string, appId: number): Promise<SharedRoll> {
    await this.repository.transaction(async players => {
      const row = await players.sharedRow(shareId);
      if (!row) throw new NotFoundException('Общая подборка не найдена.');
      if (!await this.isVotingOpen(row, players)) throw new ConflictException('Голосование уже завершено.');
      if (!toRoll(row).games.some(game => game.id === appId)) throw new BadRequestException('Этой игры нет в подборке.');
      await players.vote(row.id, id, appId);
    });
    return this.shared(id, shareId);
  }
}
