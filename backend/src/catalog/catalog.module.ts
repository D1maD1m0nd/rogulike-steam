import { Controller, Get, Inject, Injectable, Module, Query } from '@nestjs/common';
import { GENRES, type CatalogPage, type Filters, type Game, type Showcase } from '@steam-draft/contracts';
import type { Prisma } from '../../generated/prisma/client';
import { DatabaseService } from '../database/database.module';
import { CatalogQueryDto } from './catalog.dto';
import { storeLocale } from './steam';
import snapshot from './steam-snapshot.json';

@Injectable()
export class CatalogService {
  private readonly locale = storeLocale();
  private version: number | undefined;
  private games = new Map<number, Game>();

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async catalog(db: Prisma.TransactionClient = this.database.client): Promise<ReadonlyMap<number, Game>> {
    const { country, language } = this.locale;
    const cursor = await db.steamCursor.findUnique({
      where: { country_language: { country, language } },
      select: { revision: true },
    });
    const version = cursor?.revision ?? -1;
    if (version === this.version) return this.games;

    const matchesSnapshot = country === snapshot.country && language === snapshot.language;
    const games = new Map((matchesSnapshot ? snapshot.games as Game[] : []).map(game => [game.id, game]));
    const rows = await db.steamCatalogEntry.findMany({
      where: { country, language }, orderBy: { appId: 'asc' },
    });
    for (const row of rows) {
      const game = JSON.parse(row.game) as Game | null;
      if (game) games.set(game.id, game);
      else games.delete(Number(row.appId));
    }
    this.games = games;
    this.version = version;
    return this.games;
  }

  async eligible(filters: Filters, db?: Prisma.TransactionClient): Promise<Game[]> {
    return [...(await this.catalog(db)).values()].filter(game =>
      (!filters.genre || game.genres.includes(filters.genre)) &&
      (!filters.mode || game.modes.includes(filters.mode)) &&
      (!filters.platform || game.platforms.includes(filters.platform)) &&
      (!filters.price || game.free === (filters.price === 'free')),
    );
  }

  async search(query: CatalogQueryDto): Promise<CatalogPage> {
    const term = query.q?.toLocaleLowerCase().trim();
    const games = (await this.eligible(query)).filter(game => !term ||
      [game.title, ...game.genres.map(genre => GENRES[genre])].some(value => value.toLocaleLowerCase().includes(term)),
    );
    return { games: games.slice(query.offset, query.offset + 12), total: games.length };
  }

  async showcase(): Promise<Showcase> {
    const catalog = await this.catalog();
    const preferred = [1145360, 413150, 504230].flatMap(id => catalog.get(id) ?? []);
    const games = [...new Set([...preferred, ...catalog.values()])].slice(0, 3);
    return { games, banner: catalog.get(383870) ?? null, count: catalog.size, country: this.locale.country };
  }
}

@Controller('catalog')
class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get()
  search(@Query() query: CatalogQueryDto) {
    return this.catalog.search(query);
  }

  @Get('showcase')
  showcase() {
    return this.catalog.showcase();
  }
}

@Module({ controllers: [CatalogController], providers: [CatalogService], exports: [CatalogService] })
export class CatalogModule {}
