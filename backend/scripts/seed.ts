import { getSteamGame, getSteamTags, storeLocale } from '../src/catalog/steam';
import type { Game } from '@steam-draft/contracts';

const starterIds = [
  1145360, 413150, 504230, 383870, 367520, 620, 105600, 427520, 294100, 646570,
  632360, 548430, 1086940, 1245620, 239030, 212680, 264710, 311690, 250900, 312520,
  588650, 698780, 916440, 1274570, 1281930, 1794680, 1623730, 1868140, 1966720,
  553420, 753640, 391540, 1030300, 1817070, 440, 570, 730, 238960, 230410, 236390,
  1085660, 1599340, 291550, 438100, 252490, 346110, 394510, 892970, 221100, 976730,
  813780, 244850, 281990, 255710, 392110, 359320, 960090, 690790, 244210, 3019940,
  646910, 400, 286160, 108600, 881100, 1147560, 1604030, 268910, 22380, 780290,
  3241660, 2379780, 1948280, 2420660, 1497440, 1511460, 1817800, 2103140, 2368470,
  2201940, 1266700, 2012840, 238320, 1237970, 304930, 602960, 238460, 242760,
  240, 550, 552500, 682990, 1313140, 1716740, 1172470, 526870, 1097150, 611670,
  1158310, 1466860, 1151340, 1240440, 1174180, 220, 4000, 253230, 232090, 233860,
  57300, 282140, 739630, 274520, 1349060,
];
const { country, language } = storeLocale();
const snapshot = new URL('../src/catalog/steam-snapshot.json', import.meta.url);
const previous = await Bun.file(snapshot).json().catch(() => null) as {
  country: string;
  language: string;
  games: Game[];
} | null;
const previousGames = new Map(
  previous?.country === country && previous.language === language ? previous.games.map(game => [game.id, game]) : [],
);
const gameIds = [...new Set([...starterIds, ...previousGames.keys()])];
const tags = await getSteamTags(gameIds, country, language);
const games: Game[] = [];
let errors = 0;
let retained = 0;

for (let offset = 0; offset < gameIds.length; offset += 4) {
  const batch = gameIds.slice(offset, offset + 4);
  const responses = await Promise.allSettled(batch.map(id => getSteamGame(id, country, language, tags)));
  for (const [index, response] of responses.entries()) {
    const id = batch[index];
    const old = previousGames.get(id);
    if (response.status === 'rejected') {
      errors += 1;
      if (old) {
        retained += 1;
        games.push(old);
      }
    } else if (response.value) {
      const game = response.value;
      if (!tags.has(id) && old?.primaryGenre === 'horror') {
        game.primaryGenre = 'horror';
        game.genres = ['horror', ...game.genres.filter(genre => genre !== 'horror')];
      }
      games.push({ ...game, reviews: game.reviews ?? old?.reviews ?? null });
    }
  }
  if (offset + batch.length < gameIds.length) await Bun.sleep(350);
}

const verified = games.length - retained;
if (verified < 12) throw new Error(`Only ${verified} verified Steam games, ${errors} failed requests. Snapshot kept.`);
await Bun.write(snapshot, JSON.stringify({ country, language, verifiedAt: new Date().toISOString(), games }, null, 2) + '\n');
console.log(
  `Stored ${games.length} Steam games for ${country}, including ${games.filter(game => game.reviews).length} with reviews ` +
  `and ${games.filter(game => game.primaryGenre === 'horror').length} horror titles. ${errors} failed requests, ${retained} entries retained.`,
);
