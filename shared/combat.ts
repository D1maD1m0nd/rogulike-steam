import type { Game, GameGenre, RunBattle, RunCard } from './index';

export const ABILITIES: Record<GameGenre, { name: string; description: string }> = {
  action: { name: 'Натиск', description: '+2 урона, когда враг собирается атаковать.' },
  adventure: { name: 'Разведка', description: '+2 защиты от атаки в первый ход боя.' },
  indie: { name: 'Импровизация', description: '+2 урона, когда у тебя осталась половина здоровья или меньше.' },
  rpg: { name: 'Второе дыхание', description: 'Восстанавливает 2 здоровья, если после хода его осталась половина или меньше. Один раз за бой.' },
  simulation: { name: 'Техобслуживание', description: '+2 защиты от атаки силой 6 или выше.' },
  strategy: { name: 'План Б', description: 'Игнорирует до 3 единиц защиты врага.' },
  casual: { name: 'Передышка', description: 'Восстанавливает 1 здоровье, пока враг защищается.' },
  racing: { name: 'Обгон', description: '+2 урона на чётном ходе.' },
  sports: { name: 'Финишный рывок', description: '+2 урона, когда у врага осталось не больше половины здоровья.' },
  horror: { name: 'Испуг', description: 'Оглушает врага и отменяет атаку, которая нанесла бы урон. Один раз за бой на всю колоду.' },
};

const attributes: Record<GameGenre, readonly [attack: number, guard: number]> = {
  action: [7, 0],
  adventure: [6, 2],
  indie: [6, 2],
  rpg: [6, 3],
  simulation: [5, 4],
  strategy: [5, 3],
  casual: [5, 4],
  racing: [7, 1],
  sports: [6, 2],
  horror: [6, 2],
};

export function primaryGenre(game: Game): GameGenre {
  return game.primaryGenre ?? game.genres.find(genre => genre !== 'indie') ?? game.genres[0] ?? 'adventure';
}

export function gameRating(game: Game): number {
  const positive = game.reviews?.positive ?? 0;
  const negative = game.reviews?.negative ?? 0;
  const reviewScore = 100 * (positive + 35) / (positive + negative + 50);
  const priceScore = game.free
    ? 100
    : game.priceMinor != null && game.priceCurrency === 'RUB'
      ? 100 * 120_000 / (120_000 + game.priceMinor)
      : 50;
  return Math.round(0.75 * reviewScore + 0.25 * priceScore);
}

export function cardFromGame(game: Game, upgraded: boolean): RunCard {
  const genre = primaryGenre(game);
  const rating = gameRating(game);
  const [attack, guard] = attributes[genre];
  const attackBonus = rating >= 80 ? 1 : rating < 60 ? -1 : 0;
  return {
    game, genre, rating, upgraded,
    attack: attack + attackBonus + Number(upgraded),
    guard: guard + Number(rating >= 85) + Number(upgraded),
  };
}

export function previewCardPlay(card: RunCard, battle: RunBattle, hp: number, maxHp: number) {
  const attacking = battle.intent.type === 'attack';
  const intent = battle.intent.value;
  let attack = card.attack;
  let guard = card.guard;
  let defense = attacking ? 0 : intent;
  let active = false;

  switch (card.genre) {
    case 'action': active = attacking; if (active) attack += 2; break;
    case 'adventure': active = attacking && battle.turn === 1; if (active) guard += 2; break;
    case 'indie': active = hp * 2 <= maxHp; if (active) attack += 2; break;
    case 'simulation': active = attacking && intent >= 6; if (active) guard += 2; break;
    case 'strategy': active = defense > 0; if (active) defense = Math.max(0, defense - 3); break;
    case 'racing': active = battle.turn % 2 === 0; if (active) attack += 2; break;
    case 'sports': active = battle.hp * 2 <= battle.maxHp; if (active) attack += 2; break;
  }

  const damage = Math.max(0, attack - defense);
  const wins = damage >= battle.hp;
  const wouldTakeDamage = attacking && !wins ? Math.max(0, intent - guard) : 0;
  const stunned = card.genre === 'horror' && wouldTakeDamage > 0 && !battle.usedAbilities.includes('horror');
  const incoming = stunned ? 0 : wouldTakeDamage;
  const hpAfterAttack = Math.max(0, hp - incoming);
  const secondWind = card.genre === 'rpg' && hpAfterAttack > 0 && hpAfterAttack * 2 <= maxHp && !battle.usedAbilities.includes('rpg');
  const recovery = secondWind ? 2 : card.genre === 'casual' && !attacking ? 1 : 0;
  const healing = Math.min(recovery, maxHp - hpAfterAttack);
  const ability = stunned || healing > 0 || active ? ABILITIES[card.genre].name : null;
  return { damage, incoming, healing, wins, stunned, secondWind, ability };
}
