import { getSteamGame, storeLocale } from '../src/catalog/steam';
import { createPrismaClient, writeTransaction } from '../src/database/database.module';

const key = process.env.STEAM_WEB_API_KEY?.trim();
if (!key) {
  console.error('Для синхронизации задай STEAM_WEB_API_KEY в .env. Стартовый каталог работает без ключа.');
  process.exit(1);
}

const size = Number(process.argv[2] ?? 100);
if (!Number.isInteger(size) || size < 1 || size > 500) {
  throw new Error('Размер порции должен быть целым числом от 1 до 500.');
}

const { country, language } = storeLocale();
const db = createPrismaClient();
const locale = { country, language };

try {
  const cursor = await db.steamCursor.findUnique({ where: { country_language: locale } });
  const saved = Number(cursor?.appId ?? 0n);
  const url = new URL('https://api.steampowered.com/IStoreService/GetAppList/v1/');
  url.searchParams.set('key', key);
  url.searchParams.set('input_json', JSON.stringify({
    include_games: true, include_dlc: false, include_software: false,
    include_videos: false, include_hardware: false, max_results: size, last_appid: saved,
  }));
  let response: Response;
  try {
    response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error('Не удалось связаться с официальным Steam Web API.');
  }
  if (!response.ok) throw new Error(`Steam Web API HTTP ${response.status}.`);
  const payload = await response.json() as { response?: { apps?: { appid: number }[]; have_more_results?: boolean } };
  if (!payload.response) throw new Error('Steam Web API вернул неожиданный ответ.');
  const ids = [...new Set(payload.response.apps?.map(item => item.appid) ?? [])]
    .filter(id => Number.isSafeInteger(id) && id > saved).sort((a, b) => a - b);
  let found = 0;
  for (const id of ids) {
    const game = await getSteamGame(id, country, language);
    const appId = BigInt(id);
    const entry = { ...locale, appId };
    const snapshot = JSON.stringify(game);
    await writeTransaction(db, async tx => {
      await tx.steamCatalogEntry.upsert({
        where: { country_language_appId: entry },
        create: { ...entry, game: snapshot },
        update: { game: snapshot },
      });
      await tx.steamCursor.upsert({
        where: { country_language: locale },
        create: entry,
        update: { revision: { increment: 1 } },
      });
      await tx.steamCursor.updateMany({ where: { ...locale, appId: { lt: appId } }, data: { appId } });
    });
    if (game) found++;
    await Bun.sleep(350);
  }
  console.log(`Проверено ${ids.length}, доступно ${found}. ${payload.response.have_more_results ? 'Повтори команду для следующей порции.' : 'Конец каталога.'}`);
} finally {
  await db.$disconnect();
}
