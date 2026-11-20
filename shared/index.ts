export const GENRES = {
  action: 'Экшен',
  adventure: 'Приключения',
  indie: 'Инди',
  rpg: 'Ролевые',
  simulation: 'Симуляторы',
  strategy: 'Стратегии',
  casual: 'Казуальные',
  racing: 'Гонки',
  sports: 'Спорт',
  horror: 'Хоррор',
} as const;
export type GameGenre = keyof typeof GENRES;
export const MODES = { solo: 'Одиночная', coop: 'Кооператив', multi: 'Сетевая' } as const;
export const PLATFORMS = { windows: 'Windows', mac: 'macOS', linux: 'Linux' } as const;
export const PRICES = { free: 'Бесплатно', paid: 'Платные' } as const;

export interface Filters {
  genre?: GameGenre;
  mode?: keyof typeof MODES;
  platform?: keyof typeof PLATFORMS;
  price?: keyof typeof PRICES;
}

export interface Game {
  id: number;
  title: string;
  description: string;
  image: string;
  backdrop?: string;
  url: string;
  genres: GameGenre[];
  primaryGenre?: GameGenre;
  modes: (keyof typeof MODES)[];
  platforms: (keyof typeof PLATFORMS)[];
  free: boolean;
  price: string | null;
  priceMinor?: number | null;
  priceCurrency?: string;
  reviews?: { positive: number; negative: number } | null;
}

export interface Roll {
  id: string;
  games: Game[];
  selectedId: number | null;
  createdAt: number;
  filters: Filters;
}

export interface LibraryEntry {
  game: Game;
  played: boolean;
  savedAt: number;
}

export interface PlayerState {
  activeRoll: Roll | null;
  collection: LibraryEntry[];
  wishlist: Game[];
  hidden: Game[];
  history: Roll[];
  daily: { remaining: number; limit: number; bonusAvailable: boolean; resetsAt: number };
  stats: { rolls: number; collected: number; played: number; points: number };
}

export interface Showcase {
  games: Game[];
  banner: Game | null;
  count: number;
  country: string;
}

export interface CatalogPage {
  games: Game[];
  total: number;
}

export interface SharedRoll {
  games: Game[];
  selectedId: number | null;
  votingOpen: boolean;
  votes: Record<number, number>;
  ownVote: number | null;
}

export type RunRoom = 'battle' | 'elite' | 'rest' | 'event' | 'shop' | 'boss';
export type RunPhase = 'starter' | 'route' | 'battle' | 'draft' | 'victory' | 'finished' | 'defeat' | 'abandoned';
export type RunAction = 'draft' | 'travel' | 'play' | 'prize' | 'skip' | 'abandon';
export type RunEnemy = 'parent' | 'spoiler' | 'backlog' | 'drill' | 'patch' | 'gabe';

export interface RunCard {
  game: Game;
  attack: number;
  guard: number;
  upgraded: boolean;
  rating: number;
  genre: GameGenre;
}

export interface RunRoute {
  kind: RunRoom;
  title: string;
  description: string;
}

export interface RunMapNode extends RunRoute {
  id: number;
  depth: number;
  lane: number;
  next: number[];
  enemy?: RunEnemy;
}

export interface RunIntent {
  type: 'attack' | 'guard';
  value: number;
  label: string;
}

export interface RunBattle {
  enemy: RunEnemy;
  name: string;
  hp: number;
  maxHp: number;
  turn: number;
  intent: RunIntent;
  spentIds: number[];
  usedAbilities: GameGenre[];
}

export interface Expedition {
  id: string;
  version: number;
  phase: RunPhase;
  step: number;
  maxSteps: number;
  hp: number;
  maxHp: number;
  coins: number;
  deck: RunCard[];
  options: RunCard[];
  map: RunMapNode[];
  currentNodeId: number | null;
  visitedNodeIds: number[];
  availableNodeIds: number[];
  battle: RunBattle | null;
  note: string;
  path: RunRoom[];
  prizeId: number | null;
}

export interface RunState {
  current: Expedition | null;
  attempts: number;
  wins: number;
  best: number;
}

export { ABILITIES, cardFromGame, gameRating, previewCardPlay, primaryGenre } from './combat';
