import { PLATFORMS, type Game, type GameGenre } from '@steam-draft/contracts';
import { decodeHTML } from 'entities';

export const defaultCountry = 'ru';
export const defaultLanguage = 'russian';

const genreIds: Record<string, GameGenre> = {
  '1': 'action', '3': 'rpg', '2': 'strategy', '4': 'casual', '9': 'racing',
  '18': 'sports', '23': 'indie', '25': 'adventure', '28': 'simulation',
};
const modeIds: Record<number, Game['modes'][number]> = {
  2: 'solo', 1: 'multi', 9: 'coop', 36: 'multi', 37: 'multi', 38: 'multi',
  39: 'coop', 47: 'multi', 48: 'coop',
};

interface StoreDetails {
  type: string;
  name: string;
  short_description?: string;
  header_image?: string;
  screenshots?: { path_full: string }[];
  genres?: { id: string }[];
  categories?: { id: number }[];
  platforms?: Partial<Record<keyof typeof PLATFORMS, boolean>>;
  is_free: boolean;
  release_date?: { coming_soon: boolean };
  price_overview?: { currency: string; final: number; final_formatted: string };
}

interface ReviewResponse {
  response?: { query_summary?: { total_positive?: number; total_negative?: number } };
}

interface BrowseResponse {
  response?: { store_items?: { appid: number; success: number; tags?: { tagid: number }[] }[] };
}

type StoreTags = ReadonlyMap<number, readonly number[]>;
const horrorTags = new Set([1667, 3978]);

async function steamJson<T>(url: string | URL): Promise<T> {
  const request = () => fetch(url, { signal: AbortSignal.timeout(12_000) });
  let response = await request();
  if (response.status === 429 || response.status === 503) {
    const retryAfter = response.headers.get('retry-after');
    const seconds = retryAfter === null ? 2 : Number(retryAfter);
    if (Number.isFinite(seconds) && seconds <= 15) {
      await response.body?.cancel();
      await Bun.sleep(Math.max(1, seconds) * 1000);
      response = await request();
    }
  }
  if (!response.ok) throw new Error(`Steam HTTP ${response.status}`);
  return await response.json() as T;
}

function steamService(path: string, params: object): URL {
  const url = new URL(path, 'https://api.steampowered.com/');
  url.searchParams.set('input_json', JSON.stringify(params));
  return url;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

async function getSteamReviews(id: number, free: boolean): Promise<Game['reviews']> {
  const url = steamService('IUserReviewsService/GetAppReviews/v1/', {
    appid: id, languages: ['all'], day_range: 0, num_per_page: 1, purchase_type: free ? 1 : 0,
  });
  const summary = (await steamJson<ReviewResponse>(url)).response?.query_summary;
  const positive = summary?.total_positive;
  const negative = summary?.total_negative;
  return isCount(positive) && isCount(negative) ? { positive, negative } : null;
}

export async function getSteamTags(ids: number[], country: string, language: string): Promise<StoreTags> {
  const batches = Array.from({ length: Math.ceil(ids.length / 40) }, (_, index) => ids.slice(index * 40, index * 40 + 40));
  const results = await Promise.allSettled(batches.map(batch => steamJson<BrowseResponse>(steamService(
    'IStoreBrowseService/GetItems/v1/',
    {
      ids: batch.map(appid => ({ appid })),
      context: { language, country_code: country.toUpperCase(), steam_realm: 1 },
      data_request: { include_tag_count: 5 },
    },
  ))));
  const tags = new Map<number, readonly number[]>();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const items = result.value.response?.store_items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (item.success === 1 && Array.isArray(item.tags)) tags.set(item.appid, item.tags.slice(0, 5).map(tag => tag.tagid));
    }
  }
  return tags;
}

function steamImage(raw?: string): string | undefined {
  if (!raw) return;
  const parsed = URL.parse(raw);
  if (parsed?.protocol === 'https:' && parsed.hostname.endsWith('.steamstatic.com')) return raw;
}

export function storeLocale() {
  const country = (process.env.STEAM_COUNTRY || defaultCountry).toLowerCase();
  const language = (process.env.STEAM_LANGUAGE || defaultLanguage).toLowerCase();
  if (!/^[a-z]{2}$/.test(country) || !/^[a-z]{3,24}$/.test(language)) {
    throw new Error('Invalid STEAM_COUNTRY or STEAM_LANGUAGE');
  }
  return { country, language };
}

export async function getSteamGame(id: number, country: string, language: string, tags?: StoreTags): Promise<Game | null> {
  const params = new URLSearchParams({ appids: String(id), cc: country, l: language });
  const payload = await steamJson<Record<string, { success: boolean; data?: StoreDetails }>>(
    `https://store.steampowered.com/api/appdetails?${params}`,
  );
  const details = payload[id]?.data;
  if (!payload[id]?.success || !details || details.type !== 'game' || details.release_date?.coming_soon !== false) {
    return null;
  }
  const image = steamImage(details.header_image);
  const description = decodeHTML(details.short_description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const price = details.price_overview?.final_formatted || null;
  if (!image || !description || !details.name || (!details.is_free && !price)) return null;

  const [reviews, lookup] = await Promise.all([
    getSteamReviews(id, details.is_free).catch(() => null),
    tags ?? getSteamTags([id], country, language),
  ]);
  const genres = [...new Set(details.genres?.flatMap(({ id: genre }) => genreIds[genre] ? [genreIds[genre]] : []) ?? [])];
  const isHorror = lookup.get(id)?.some(tag => horrorTags.has(tag));
  const primaryGenre = isHorror ? 'horror' : genres.find(genre => genre !== 'indie') ?? genres[0] ?? 'adventure';
  const finalPrice = details.price_overview?.final;
  const currency = details.price_overview?.currency;

  return {
    id,
    title: details.name,
    description,
    image,
    backdrop: id === 383870 ? steamImage(details.screenshots?.[0]?.path_full) : undefined,
    url: `https://store.steampowered.com/app/${id}/`,
    genres: isHorror ? ['horror', ...genres] : genres,
    primaryGenre,
    modes: [...new Set(details.categories?.flatMap(({ id: mode }) => modeIds[mode] ? [modeIds[mode]] : []) ?? [])],
    platforms: (Object.keys(PLATFORMS) as Game['platforms']).filter(platform => details.platforms?.[platform]),
    free: details.is_free,
    price: details.is_free ? null : price,
    priceMinor: details.is_free ? 0 : isCount(finalPrice) ? finalPrice : null,
    priceCurrency: currency && /^[A-Z]{3}$/.test(currency) ? currency : undefined,
    reviews: reviews ?? null,
  };
}
