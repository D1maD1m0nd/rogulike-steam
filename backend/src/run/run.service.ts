import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { cardFromGame, previewCardPlay, type Expedition, type RunAction, type RunCard, type RunPhase, type RunState } from '@steam-draft/contracts';
import type { Prisma } from '../../generated/prisma/client';
import { CatalogService } from '../catalog/catalog.module';
import { drawGames } from '../catalog/draft';
import { DatabaseService } from '../database/database.module';
import { PlayerRepository, type PlayerQueries } from '../player/player.repository';
import {
  battleCoins, eliteCoins, eventCoins, eventCost, getAvailableNodes, makeBattle, makeMap, ENEMIES,
  maxHp, maxSteps, prizePoints, restHp, shopCost, type StoredBattle,
} from './run.rules';

interface SavedRun extends Expedition {
  seen: number[];
  battle: StoredBattle | null;
}

interface RunTransaction {
  playerId: string;
  players: PlayerQueries;
  db: Prisma.TransactionClient;
}

const terminal = new Set<RunPhase>(['finished', 'defeat', 'abandoned']);

@Injectable()
export class RunService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(PlayerRepository) private readonly players: PlayerRepository,
  ) {}

  private async current(playerId: string, db: Prisma.TransactionClient): Promise<SavedRun | null> {
    const [row] = await db.$queryRaw<{ state: string }[]>`
      SELECT state FROM expeditions WHERE player_id = ${playerId} ORDER BY created_at DESC, rowid DESC LIMIT 1
    `;
    if (!row) return null;
    const run = JSON.parse(row.state) as SavedRun & { routes?: unknown };
    // Saves from before the map can be placed on its central path at the same depth.
    if (!run.map) {
      run.map = makeMap(run.id, run.path);
      run.visitedNodeIds = run.path.map((_, depth) => depth * 3 + 2);
      run.currentNodeId = run.visitedNodeIds.at(-1) ?? null;
      run.availableNodeIds = run.phase === 'route' ? getAvailableNodes(run.map, run.currentNodeId, run.hp, run.coins) : [];
      delete run.routes;
      const catalog = await this.catalog.catalog(db);
      const updateCard = (card: RunCard) => cardFromGame(catalog.get(card.game.id) ?? card.game, card.upgraded);
      run.deck = run.deck.map(updateCard);
      run.options = run.options.map(updateCard);
    }
    if (run.battle && !run.battle.enemy) {
      const battle = run.battle;
      const node = run.map.find(room => room.id === run.currentNodeId);
      battle.enemy = node?.enemy ?? (battle.room === 'boss' ? 'gabe' : battle.room === 'elite' ? 'drill' : 'parent');
      const { pattern } = makeBattle(battle.room, run.step, battle.enemy);
      battle.name = ENEMIES[battle.enemy];
      battle.usedAbilities = [];
      battle.pattern = pattern;
      battle.intent = pattern[(battle.turn - 1) % pattern.length];
    }
    return run;
  }

  state(playerId: string): Promise<RunState> {
    return this.database.client.$transaction(async db => {
      const run = await this.current(playerId, db);
      const stats = await db.expedition.aggregate({ where: { playerId }, _count: true, _max: { step: true } });
      const wins = await db.expedition.count({ where: { playerId, phase: { in: ['victory', 'finished'] } } });
      const result = { attempts: stats._count, wins, best: stats._max.step ?? 0 };
      if (!run) return { current: null, ...result };
      const { seen: _seen, battle, ...current } = run;
      const publicBattle = battle && {
        name: battle.name, enemy: battle.enemy, hp: battle.hp, maxHp: battle.maxHp, turn: battle.turn,
        intent: battle.intent, spentIds: battle.spentIds, usedAbilities: battle.usedAbilities,
      };
      return { current: { ...current, battle: publicBattle }, ...result };
    });
  }

  async start(playerId: string): Promise<RunState> {
    await this.players.transaction(async (players, db) => {
      const current = await this.current(playerId, db);
      if (current && !terminal.has(current.phase)) return;
      const id = randomUUID();
      const run: SavedRun = {
        id, version: 0, phase: 'starter', step: 0, maxSteps, hp: maxHp, maxHp,
        coins: 0, deck: [], seen: [], options: [], map: makeMap(id), battle: null,
        currentNodeId: null, visitedNodeIds: [], availableNodeIds: [],
        path: [], prizeId: null, note: 'Выбери первую игру для колоды.',
      };
      await this.offerCards({ playerId, players, db }, run, false);
      if (!run.options.length) throw new BadRequestException('В каталоге нет доступных игр для забега.');
      await db.expedition.create({
        data: { id, playerId, createdAt: BigInt(Date.now()), phase: run.phase, step: run.step, state: JSON.stringify(run) },
      });
    });
    return this.state(playerId);
  }

  async act(playerId: string, id: string, version: number, action: RunAction, choice?: number): Promise<RunState> {
    await this.players.transaction(async (players, db) => {
      const run = await this.current(playerId, db);
      if (!run || run.id !== id) throw new NotFoundException('Забег не найден.');
      if (run.version !== version) throw new ConflictException('Забег уже изменился. Обнови его состояние.');
      if (terminal.has(run.phase)) throw new ConflictException('Этот забег завершён.');
      const transaction = { playerId, players, db };
      switch (action) {
        case 'draft': this.draft(run, choice); break;
        case 'travel': await this.travel(transaction, run, choice); break;
        case 'play': await this.play(transaction, run, choice); break;
        case 'prize': await this.prize(transaction, run, choice); break;
        case 'skip': this.skip(run); break;
        case 'abandon': this.abandon(run); break;
      }
      run.version++;
      await db.expedition.update({
        where: { id },
        data: { phase: run.phase, step: run.step, state: JSON.stringify(run) },
      });
    });
    return this.state(playerId);
  }

  private async offerCards({ playerId, players, db }: RunTransaction, run: SavedRun, upgraded: boolean) {
    const excluded = new Set([...run.seen, ...await players.listIds(playerId, 'hidden')]);
    const wishes = new Set(await players.listIds(playerId, 'wishlist'));
    const pool = (await this.catalog.eligible({}, db)).filter(game => !excluded.has(game.id));
    const drawn = drawGames(pool, wishes);
    run.options = drawn.map(game => cardFromGame(game, upgraded));
    run.seen.push(...drawn.map(game => game.id));
  }

  private route(run: SavedRun) {
    run.phase = 'route';
    run.options = [];
    run.availableNodeIds = getAvailableNodes(run.map, run.currentNodeId, run.hp, run.coins);
  }

  private draft(run: SavedRun, choice?: number) {
    if (run.phase !== 'starter' && run.phase !== 'draft') throw new BadRequestException('Сейчас нельзя взять карту.');
    const card = run.options.find(candidate => candidate.game.id === choice);
    if (!card) throw new BadRequestException('Этой карты нет среди вариантов.');
    run.deck.push(card);
    run.note = `${card.game.title} в колоде забега.`;
    this.route(run);
  }

  private async openDraft(transaction: RunTransaction, run: SavedRun, upgraded: boolean) {
    await this.offerCards(transaction, run, upgraded);
    if (run.options.length) run.phase = 'draft';
    else {
      run.note = 'В каталоге больше нет новых карт для этого забега.';
      this.route(run);
    }
  }

  private async travel(transaction: RunTransaction, run: SavedRun, choice?: number) {
    const destination = run.phase === 'route' && choice && run.availableNodeIds.includes(choice)
      ? run.map.find(node => node.id === choice) : undefined;
    if (!destination) throw new BadRequestException('Выбери один из доступных путей.');
    const { kind, title } = destination;
    run.availableNodeIds = [];
    run.currentNodeId = destination.id;
    run.visitedNodeIds.push(destination.id);
    run.path.push(kind);
    switch (kind) {
      case 'battle':
      case 'elite':
      case 'boss':
        run.battle = makeBattle(kind, run.step, destination.enemy!);
        run.phase = 'battle';
        run.note = `${run.battle.name} преграждает путь.`;
        return;
      case 'rest': {
        const recovery = Math.min(run.maxHp - run.hp, restHp);
        run.hp += recovery;
        run.step++;
        run.note = recovery ? `Передышка восстановила ${recovery} здоровья.` : 'Передышка пройдена с полным здоровьем.';
        this.route(run);
        return;
      }
      case 'event':
        run.hp -= eventCost;
        run.coins += eventCoins;
        break;
      case 'shop':
        run.coins -= shopCost;
        break;
    }
    run.step++;
    run.note = `${title}. Выбери игру для колоды.`;
    await this.openDraft(transaction, run, kind === 'shop');
  }

  private async play(transaction: RunTransaction, run: SavedRun, choice?: number) {
    const battle = run.battle;
    if (run.phase !== 'battle' || !battle) throw new BadRequestException('Сейчас бой не идёт.');
    const card = run.deck.find(item => item.game.id === choice);
    if (!card || battle.spentIds.includes(card.game.id)) {
      throw new BadRequestException('Эта карта недоступна в текущем цикле.');
    }

    const result = previewCardPlay(card, battle, run.hp, run.maxHp);
    battle.hp = Math.max(0, battle.hp - result.damage);
    run.hp = Math.max(0, run.hp - result.incoming) + result.healing;
    if (result.stunned) battle.usedAbilities.push('horror');
    if (result.secondWind) battle.usedAbilities.push('rpg');
    const recovery = result.healing > 0 ? ` Восстановлено здоровья: ${result.healing}.` : '';
    if (result.wins) {
      await this.winBattle(transaction, run, battle.room);
      run.note += recovery;
      return;
    }

    const effect = result.stunned ? ' Испуг оглушает врага. Его атака отменена.' : result.ability ? ` Сработало: ${result.ability}.` : '';
    run.note = `${card.game.title} наносит ${result.damage} урона. Получено урона: ${result.incoming}.${effect}${recovery}`;
    if (run.hp === 0) {
      this.end(run, 'defeat', 'Здоровье закончилось. Временная колода расформирована.');
      return;
    }
    battle.spentIds.push(card.game.id);
    if (battle.spentIds.length === run.deck.length) battle.spentIds = [];
    battle.turn++;
    battle.intent = battle.pattern[(battle.turn - 1) % battle.pattern.length];
  }

  private async winBattle(transaction: RunTransaction, run: SavedRun, room: StoredBattle['room']) {
    run.battle = null;
    run.step++;
    if (room === 'boss') {
      const { players, playerId } = transaction;
      await players.addPoints(playerId, prizePoints);
      const collected = new Set(await players.listIds(playerId, 'collection'));
      run.options = run.deck.filter(card => !collected.has(card.game.id));
      run.phase = run.options.length ? 'victory' : 'finished';
      run.note = run.options.length
        ? `Босс побеждён. Получено ${prizePoints} очков. Выбери игру для коллекции.`
        : `Босс побеждён. Получено ${prizePoints} очков. Все игры колоды уже в коллекции.`;
      return;
    }
    const coins = room === 'elite' ? eliteCoins : battleCoins;
    run.coins += coins;
    run.note = `Схватка выиграна. Получено монет: ${coins}.`;
    await this.openDraft(transaction, run, room === 'elite');
  }

  private async prize({ players, playerId }: RunTransaction, run: SavedRun, choice?: number) {
    if (run.phase !== 'victory') throw new BadRequestException('Награда открывается после победы над боссом.');
    const card = run.options.find(candidate => candidate.game.id === choice);
    if (!card) throw new BadRequestException('Этой игры нет среди наград.');
    if ((await players.listIds(playerId, 'collection')).includes(card.game.id)) {
      throw new ConflictException('Эта игра уже в коллекции. Выбери другую награду или пропусти выбор.');
    }
    await players.addToList(playerId, card.game, 'collection');
    await players.removeFromList(playerId, card.game.id, 'wishlist');
    await players.removeFromList(playerId, card.game.id, 'hidden');
    run.prizeId = card.game.id;
    this.end(run, 'finished', `${card.game.title} сохранена в коллекцию.`);
  }

  private skip(run: SavedRun) {
    if (run.phase === 'victory') {
      this.end(run, 'finished', 'Забег выигран. Очки за победу сохранены.');
      return;
    }
    if (run.phase !== 'draft') throw new BadRequestException('Сейчас нельзя пропустить выбор.');
    run.note = 'Выбор карты пропущен.';
    this.route(run);
  }

  private abandon(run: SavedRun) {
    if (run.phase === 'victory') {
      throw new BadRequestException('Босс побеждён. Сохрани игру или нажми «Пропустить».');
    }
    this.end(run, 'abandoned', 'Забег завершён, временная колода расформирована.');
  }

  private end(run: SavedRun, phase: 'finished' | 'defeat' | 'abandoned', note: string) {
    run.phase = phase;
    run.note = note;
    run.options = [];
    run.availableNodeIds = [];
    run.battle = null;
    if (phase !== 'finished') run.deck = [];
  }
}
