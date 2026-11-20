import { randomInt } from 'node:crypto';
import type { Game } from '@steam-draft/contracts';

export function drawGames(eligible: Game[], wishes: ReadonlySet<number>): Game[] {
  const pool = eligible.map(game => ({ game, weight: wishes.has(game.id) ? 3 : 1 }));
  const selected: Game[] = [];
  while (selected.length < 3 && pool.length) {
    let ticket = randomInt(pool.reduce((sum, candidate) => sum + candidate.weight, 0));
    const index = pool.findIndex(candidate => (ticket -= candidate.weight) < 0);
    selected.push(pool.splice(index, 1)[0].game);
  }
  return selected;
}
