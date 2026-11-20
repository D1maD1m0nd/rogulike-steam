import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Chip, Collapse, LinearProgress, Snackbar, TextField, Tooltip } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import CasinoRounded from '@mui/icons-material/CasinoRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import ShareOutlined from '@mui/icons-material/ShareOutlined';
import TuneRounded from '@mui/icons-material/TuneRounded';
import WorkspacePremiumOutlined from '@mui/icons-material/WorkspacePremiumOutlined';
import { type Filters, type Game, type PlayerState, type Showcase } from '@steam-draft/contracts';
import { api, post } from './api';
import { FilterFields, filterNames, presets, sameFilters } from './filters';
import { GameCard } from './game-card';
import { RunView } from './run-view';
import { Catalog, History, Library, Profile, Shared, type CardActions } from './views';

const links = [
  ['run', 'Забег'], ['play', 'Подбор'], ['catalog', 'Каталог'], ['collection', 'Коллекция'], ['history', 'История'],
] as const;

function readHash() {
  return location.hash.slice(1) || 'run';
}

export function App() {
  const [page, setPage] = useState(readHash);
  const [state, setState] = useState<PlayerState>();
  const [showcase, setShowcase] = useState<Showcase>();
  const [filters, setFilters] = useState<Filters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [initialError, setInitialError] = useState('');
  const inFlight = useRef(false);
  const shareField = useRef<HTMLInputElement>(null);
  const deck = useRef<HTMLElement>(null);
  const shareId = page.match(/^share\/([0-9a-f-]{36})$/)?.[1];
  const isLibrary = page === 'collection' || page === 'wishlist';
  const activePage = isLibrary ? 'collection' : page;
  const isPlay = page === 'play';
  const isRun = !shareId && !['play', 'catalog', 'collection', 'wishlist', 'history', 'profile'].includes(page);
  const roll = state?.activeRoll;
  const cards = roll?.games ?? showcase?.games ?? [];

  const initialize = useCallback(async () => {
    setInitialError('');
    try {
      const [player, featured] = await Promise.all([api<PlayerState>('player'), api<Showcase>('catalog/showcase')]);
      setState(player);
      setFilters(player.activeRoll?.filters ?? {});
      setShowcase(featured);
    } catch (cause) { setInitialError((cause as Error).message); }
  }, []);

  const privatePage = !shareId;
  const initialized = Boolean(state);
  useEffect(() => {
    if (privatePage && !initialized) void initialize();
  }, [initialize, initialized, privatePage]);

  useEffect(() => {
    const update = () => {
      setPage(readHash());
      setError('');
      setShareUrl('');
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', update);
    return () => removeEventListener('hashchange', update);
  }, []);

  useEffect(() => {
    if (!state?.daily.resetsAt || !privatePage) return;
    const nextReset = state.daily.resetsAt;
    const timer = window.setTimeout(() => {
      void api<PlayerState>('player').then(setState).catch(() => {});
    }, Math.max(100, nextReset - Date.now() + 500));
    return () => clearTimeout(timer);
  }, [state?.daily.resetsAt, privatePage]);

  const refreshPlayer = useCallback(() => {
    void api<PlayerState>('player').then(setState).catch((cause: Error) => setError(cause.message));
  }, []);

  async function run(action: () => Promise<void>) {
    if (inFlight.current || !state) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try { await action(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); inFlight.current = false; }
  }

  function mutate(path: string, body?: object, success?: string) {
    return run(async () => {
      setState(await post<PlayerState>('player/' + path, body));
      if (success) setToast(success);
    });
  }

  function makeRoll() {
    return run(async () => {
      setState(await post<PlayerState>('player/rolls', filters));
      setShareUrl('');
      if (window.matchMedia('(max-width: 700px)').matches) {
        requestAnimationFrame(() => deck.current?.scrollIntoView({ block: 'start' }));
      }
    });
  }

  function claim(game: Game) {
    if (roll && roll.selectedId === null) {
      return mutate(`rolls/${roll.id}/claim`, { appId: game.id }, `${game.title} в коллекции`);
    }
  }

  function cardActions(game: Game): CardActions {
    const wished = state?.wishlist.some(item => item.id === game.id);
    const hidden = state?.hidden.some(item => item.id === game.id);
    const saved = state?.collection.some(item => item.game.id === game.id);
    return {
      wished, hidden, disabled: busy || !state,
      onWish: saved ? undefined : () => void mutate('preferences', { appId: game.id, kind: 'wishlist', enabled: !wished }),
      onHide: saved ? undefined : () => void mutate('preferences', { appId: game.id, kind: 'hidden', enabled: !hidden }),
    };
  }

  async function copyShared(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setToast('Ссылка скопирована');
    } catch {
      requestAnimationFrame(() => shareField.current?.select());
    }
  }

  function share(id: string) {
    return run(async () => {
      const result = await post<{ shareId: string }>(`player/rolls/${id}/share`);
      const url = new URL(location.href);
      url.hash = 'share/' + result.shareId;
      setShareUrl(url.href);
      await copyShared(url.href);
    });
  }

  const bannerImage = showcase?.banner?.backdrop ?? showcase?.banner?.image;
  const canRoll = Boolean(state && state.daily.remaining > 0 && !busy);
  const openRoll = roll && roll.selectedId === null;

  return <>
    <a className="skip-link" href="#main-content" onClick={event => {
      event.preventDefault(); document.getElementById('main-content')?.focus();
    }}>К основному содержимому</a>
    <header className="site-header">
      <div className="header-inner wrap">
        <a className="brand" href="#run"><span className="brand-mark"><CasinoRounded /></span> Steam<span>Draft</span></a>
        <nav aria-label="Разделы">
          {links.map(([key, label]) => <a key={key} href={'#' + key}
            aria-current={activePage === key || (key === 'run' && isRun) ? 'page' : undefined}>{label}</a>)}
        </nav>
        <Tooltip title="Прогресс и ежедневный бонус">
          <Button className="profile-link" href="#profile" color="secondary" aria-label="Прогресс и ежедневный бонус"
            startIcon={<WorkspacePremiumOutlined />}>{state ? `${state.stats.points} очков` : 'Прогресс'}</Button>
        </Tooltip>
      </div>
    </header>

    <main id="main-content" tabIndex={-1} className="wrap main">
      {privatePage && initialError && <Alert severity="error" action={<Button onClick={() => void initialize()}>Повторить</Button>}>{initialError}</Alert>}
      {privatePage && !state && !initialError && <LinearProgress aria-label="Загрузка профиля" />}
      {error && <Alert className="top-alert" severity="error" onClose={() => setError('')}>{error}</Alert>}
      {shareUrl && <div className="share-banner">
        <TextField inputRef={shareField} size="small" label="Ссылка для друзей" value={shareUrl} slotProps={{ input: { readOnly: true } }} />
        <Button onClick={() => void copyShared(shareUrl)} startIcon={<ContentCopyRounded />}>Копировать</Button>
        <Button href={shareUrl} target="_blank" rel="noopener noreferrer" color="secondary">Открыть</Button>
      </div>}

      {isRun && state && <RunView onCollectionChange={refreshPlayer} />}

      {isPlay && <>
        <section className="hero" aria-labelledby="hero-heading">
          {bannerImage && <img className="hero-art" src={bannerImage} alt="" fetchPriority="high" />}
          <div className="hero-copy">
            <p className="hero-label"><span /> Подбор игр в Steam</p>
            <h1 id="hero-heading">Во что сыграем?</h1>
            <p className="hero-lede">Открой случайную подборку Steam и забери одну игру в свою коллекцию.</p>
            <div className="hero-actions">
              <Button size="large" variant="contained" className="roll-button" startIcon={<CasinoRounded />}
                disabled={!canRoll} onClick={() => void makeRoll()}>
                {busy ? 'Подожди…' : roll ? 'Новая подборка' : 'Подобрать игры'}
              </Button>
              {state && <a className="roll-meter" href="#profile"><span>{state.daily.remaining} / {state.daily.limit}</span> подборок сегодня</a>}
            </div>
          </div>
          {showcase?.banner && bannerImage && <a className="art-caption" href={showcase.banner.url} target="_blank" rel="noopener noreferrer">{showcase.banner.title} ↗</a>}
        </section>

        <section className="selection-controls" aria-label="Настройки подбора">
          <div className="filter-strip">
            <div className="preset-list" aria-label="Быстрые фильтры">
              {presets.map(preset => <Chip key={preset.name} variant="outlined" label={preset.name}
                className={sameFilters(filters, preset.filters) ? 'preset-active' : undefined}
                aria-pressed={sameFilters(filters, preset.filters)} onClick={() => {
                  setFilters(preset.filters); setError('');
                }} />)}
            </div>
            <Button color="secondary" aria-expanded={showFilters} aria-controls="advanced-filters" startIcon={<TuneRounded />}
              onClick={() => setShowFilters(!showFilters)}>Фильтры{Object.keys(filters).length ? ` · ${Object.keys(filters).length}` : ''}</Button>
          </div>
          <Collapse in={showFilters} id="advanced-filters">
            <FilterFields value={filters} onChange={next => { setFilters(next); setError(''); }} />
          </Collapse>
        </section>

        <section className="deck" ref={deck} aria-labelledby="deck-heading">
          <div className="deck-header">
            <div aria-live="polite">
              <h2 id="deck-heading">{roll ? 'Твоя подборка' : 'Игры из каталога'}</h2>
              <p>{openRoll ? `Выбери одну из ${roll.games.length === 2 ? 'двух' : 'трёх'} игр.` : roll ?
                `Сохранено в коллекцию: ${roll.games.find(game => game.id === roll.selectedId)?.title}.` :
                'Несколько игр, которые могут выпасть.'}{roll && filterNames(roll.filters) ? ` · ${filterNames(roll.filters)}` : ''}</p>
            </div>
            {roll ? <Button variant="outlined" color="secondary" startIcon={<ShareOutlined />} disabled={busy}
              onClick={() => void share(roll.id)}>Поделиться</Button> :
              <Button color="secondary" href="#catalog" endIcon={<ArrowForwardRounded />}>Весь каталог</Button>}
          </div>
          {cards.length ? <div className="game-grid">
            {cards.map(game => <GameCard key={game.id} game={game} {...cardActions(game)} eager selected={game.id === roll?.selectedId}
              action={openRoll && <Button fullWidth variant="contained" disabled={busy} onClick={() => void claim(game)}
                startIcon={<CheckRounded />} aria-label={`Выбрать ${game.title}`}>Выбрать игру</Button>} />)}
          </div> : showcase && <Alert severity="info">Для выбранного региона каталог пуст. Обнови данные Steam.</Alert>}
        </section>
      </>}

      {page === 'catalog' && <Catalog actions={cardActions} />}
      {state && isLibrary && <Library state={state} actions={cardActions} onPlayed={(appId, played) => void mutate('played', { appId, played })} />}
      {state && page === 'history' && <History state={state} onShare={id => void share(id)} busy={busy} />}
      {state && page === 'profile' && <Profile state={state} onBonus={() => void mutate('bonus', {}, 'Доступны три дополнительные подборки')} busy={busy} />}
      {shareId && <Shared key={shareId} id={shareId} />}
    </main>

    <footer className="wrap site-footer">
      <span>Steam Draft</span>
      <span>{showcase ? `${showcase.count} игр · Регион ${showcase.country.toUpperCase()} · Актуальная цена в Steam` : 'Карточки игр из Steam'}</span>
    </footer>
    <Snackbar open={Boolean(toast)} autoHideDuration={3200} message={toast} onClose={() => setToast('')} />
  </>;
}
