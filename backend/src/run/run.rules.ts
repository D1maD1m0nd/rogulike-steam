import { createHash } from 'node:crypto';
import type { RunBattle, RunEnemy, RunIntent, RunMapNode, RunRoom, RunRoute } from '@steam-draft/contracts';

export const maxSteps = 5;
export const maxHp = 18;
export const prizePoints = 40;
export const restHp = 5;
export const eventCost = 3;
export const eventCoins = 2;
export const shopCost = 4;
export const battleCoins = 4;
export const eliteCoins = 7;

export const ENEMIES: Record<RunEnemy, string> = {
  parent: 'Мама с дневником',
  spoiler: 'Друг-спойлерщик',
  backlog: 'Сторож бэклога',
  drill: 'Сосед с перфоратором',
  patch: 'Патч на 80 ГБ',
  gabe: 'Гейб Ньюэлл',
};

const rooms: Record<RunRoom, RunRoute> = {
  battle: { kind: 'battle', title: 'Схватка', description: `После победы: ${battleCoins} монеты и выбор карты.` },
  elite: { kind: 'elite', title: 'Элитная схватка', description: `После победы: ${eliteCoins} монет и выбор улучшенной карты.` },
  rest: { kind: 'rest', title: 'Передышка', description: `Восстанови до ${restHp} здоровья.` },
  event: { kind: 'event', title: 'Обходной путь', description: `За ${eventCost} здоровья получишь ${eventCoins} монеты и выбор карты. Нужно больше ${eventCost} здоровья.` },
  shop: { kind: 'shop', title: 'Лавка', description: `Выбери улучшенную карту за ${shopCost} монеты.` },
  boss: { kind: 'boss', title: ENEMIES.gabe, description: 'Победи Гейба, чтобы сохранить одну игру из колоды.' },
};

const regularEnemies = ['parent', 'spoiler', 'backlog'] as const;
const eliteEnemies = ['drill', 'patch'] as const;

export function makeMap(seed: string, previous: RunRoom[] = []): RunMapNode[] {
  const bytes = createHash('sha256').update(seed).digest();
  const rows = Array.from({ length: maxSteps }, (_, depth) => {
    const random = (slot: number) => bytes[depth * 6 + slot];
    const firstSide = random(0) % 2 ? 0 : 2;
    const lanes = depth === maxSteps - 1 ? [1] : random(1) % 2 ? [firstSide, 1] : [0, 1, 2];
    const alternatives: RunRoom[] = depth === 0 ? ['elite', 'event'] : ['elite', 'event', 'rest', 'shop'];
    const sideIndex = random(2) % alternatives.length;
    return lanes.sort((a, b) => a - b).map((lane): RunMapNode => {
      const kind = depth === maxSteps - 1 ? 'boss'
        : lane === 1 ? previous[depth] ?? 'battle'
          : depth === 3 && lane === firstSide ? 'rest'
            : alternatives[(sideIndex + Number(lane !== firstSide)) % alternatives.length];
      const enemy = kind === 'boss' ? 'gabe' : kind === 'battle' ? regularEnemies[(random(3) + lane) % regularEnemies.length]
        : kind === 'elite' ? eliteEnemies[(random(4) + lane) % eliteEnemies.length] : undefined;
      const room = rooms[kind];
      return { ...room, title: enemy ? ENEMIES[enemy] : room.title, id: depth * 3 + lane + 1, depth, lane, enemy, next: [] };
    });
  });
  return rows.flatMap((row, depth) => row.map(node => ({
    ...node,
    next: (rows[depth + 1] ?? []).filter(target => Math.abs(node.lane - target.lane) <= 1).map(target => target.id),
  })));
}

export function getAvailableNodes(map: RunMapNode[], current: number | null, hp: number, coins: number): number[] {
  const destinations = current === null ? map.filter(node => node.depth === 0).map(node => node.id)
    : map.find(node => node.id === current)?.next ?? [];
  return map.filter(node => destinations.includes(node.id)
    && (node.kind !== 'shop' || coins >= shopCost)
    && (node.kind !== 'event' || hp > eventCost)).map(node => node.id);
}

export interface StoredBattle extends RunBattle {
  room: 'battle' | 'elite' | 'boss';
  pattern: RunIntent[];
}

export function makeBattle(room: StoredBattle['room'], step: number, enemy: RunEnemy): StoredBattle {
  const hp = room === 'boss' ? 27 : room === 'elite' ? 12 + step * 2 : 10 + step * 2;
  const hit = room === 'boss' ? 7 : room === 'elite' ? 4 + step : 3 + step;
  const armor = room === 'boss' ? 4 : room === 'elite' ? 3 : 2;
  const attack = (label: string, value = hit): RunIntent => ({ type: 'attack', value, label });
  const defend = (label: string, value = armor): RunIntent => ({ type: 'guard', value, label });
  const patterns = {
    parent: [attack('Покажи дневник'), defend('Проверяет оценки'), attack('А уроки сделал?', hit + 2)],
    spoiler: [attack('Сейчас расскажу концовку'), attack('Ой, ты ещё не проходил?', hit + 1), defend('Делает вид, что ничего не сказал')],
    backlog: [defend('Пересчитывает непройденные', armor + 1), attack('Ещё одна игра'), attack('Ты так и не прошёл туториал', hit + 2)],
    drill: [attack('Пробный пуск', hit + 1), defend('Меняет сверло'), attack('Суббота, восемь утра', hit + 3)],
    patch: [defend('Распаковывает обновление'), attack('Нет места на диске', hit + 3), attack('Перезапуск после патча')],
    gabe: [attack('Посмотри новинки'), defend('Наполняет корзину'), attack('Летняя распродажа', hit + 2)],
  };
  const pattern = patterns[enemy];
  return { enemy, room, name: ENEMIES[enemy], hp, maxHp: hp, turn: 1, intent: pattern[0], spentIds: [], usedAbilities: [], pattern };
}
