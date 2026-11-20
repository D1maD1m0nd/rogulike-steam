import { useEffect, useRef, useState } from 'react';
import { Alert, Button, CircularProgress, LinearProgress, TextField } from '@mui/material';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import BookmarkBorderRounded from '@mui/icons-material/BookmarkBorderRounded';
import CardGiftcardRounded from '@mui/icons-material/CardGiftcardRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import EmojiEventsOutlined from '@mui/icons-material/EmojiEventsOutlined';
import ShareOutlined from '@mui/icons-material/ShareOutlined';
import { type CatalogPage, type Filters, type Game, type PlayerState, type SharedRoll } from '@steam-draft/contracts';
import { api, post } from './api';
import { FilterFields, filterNames } from './filters';
import { GameCard } from './game-card';

export interface CardActions {
  wished?: boolean;
  hidden?: boolean;
  disabled?: boolean;
  onWish?: () => void;
  onHide?: () => void;
}

export function PageHeader({ title, description }: { title: string; description: string }) {
  return <div className="page-heading"><h1>{title}</h1><p>{description}</p></div>;
}

export function Library({ state, actions, onPlayed }: {
  state: PlayerState;
  actions: (game: Game) => CardActions;
  onPlayed: (id: number, value: boolean) => void;
}) {
  const [tab, setTab] = useState<'saved' | 'wishlist' | 'hidden'>(() =>
    location.hash === '#wishlist' ? 'wishlist' : 'saved');
  useEffect(() => {
    const update = () => setTab(location.hash === '#wishlist' ? 'wishlist' : 'saved');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const games = tab === 'saved' ? state.collection.map(entry => entry.game) : state[tab];
  return <>
    <PageHeader title="Коллекция" description="Твои находки, желаемое и игры, которые больше не стоит предлагать." />
    <div className="segmented" aria-label="Списки игр">
      <button aria-pressed={tab === 'saved'} onClick={() => setTab('saved')}>Собрано <span>{state.collection.length}</span></button>
      <button aria-pressed={tab === 'wishlist'} onClick={() => setTab('wishlist')}>Желаемое <span>{state.wishlist.length}</span></button>
      <button aria-pressed={tab === 'hidden'} onClick={() => setTab('hidden')}>Скрыто <span>{state.hidden.length}</span></button>
    </div>
    {games.length ? <div className="game-grid standalone-grid">
      {games.map(game => {
        const entry = state.collection.find(item => item.game.id === game.id);
        const props = actions(game);
        return <GameCard key={game.id} game={game} {...props}
          action={tab === 'saved' && <Button fullWidth variant="outlined" color="secondary" disabled={props.disabled}
            startIcon={entry?.played ? <CheckRounded /> : undefined} aria-pressed={Boolean(entry?.played)}
            onClick={() => onPlayed(game.id, !entry?.played)}>{entry?.played ? 'Сыграно' : 'Отметить сыгранной'}</Button>} />;
      })}
    </div> : <div className="empty-state">
      <BookmarkBorderRounded />
      <h2>{tab === 'saved' ? 'Здесь появятся твои игры' : tab === 'wishlist' ? 'Список желаемого пуст' : 'Скрытых игр пока нет'}</h2>
      <p>{tab === 'saved' ? 'Выбери игру из подборки, чтобы сохранить её.' :
        tab === 'wishlist' ? 'Нажми на закладку на любой карточке. Желаемые игры выпадают чаще.' :
          'Меню карточки позволяет исключить игру из новых подборок.'}</p>
      <Button href={tab === 'saved' ? '#play' : '#catalog'} variant="outlined">{tab === 'saved' ? 'К подбору' : 'Открыть каталог'}</Button>
    </div>}
  </>;
}

export function Catalog({ actions }: { actions: (game: Game) => CardActions }) {
  const [term, setTerm] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<CatalogPage>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setPage(undefined);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ ...filters, q: term.trim(), offset: String(offset) });
      void api<CatalogPage>('catalog?' + params, { signal: controller.signal })
        .then(setPage).catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term, filters, offset, retry]);
  return <>
    <PageHeader title="Каталог игр" description="Найди игру и добавь в желаемое, чтобы она выпадала чаще." />
    <div className="catalog-controls">
      <TextField label="Название или жанр" type="search" size="small" inputProps={{ maxLength: 100 }} value={term}
        onChange={event => { setTerm(event.target.value); setOffset(0); }} />
      <FilterFields value={filters} onChange={next => { setFilters(next); setOffset(0); }} />
    </div>
    {error ? <Alert severity="error" action={<Button onClick={() => setRetry(retry + 1)}>Повторить</Button>}>{error}</Alert> :
      !page ? <LinearProgress aria-label="Загрузка каталога" /> :
        page.total === 0 ? <div className="empty-state"><h2>Игры не найдены</h2>
          <Button onClick={() => { setTerm(''); setFilters({}); setOffset(0); }}>Сбросить поиск и фильтры</Button></div> :
          <>
            <p className="catalog-count" role="status">Найдено игр: {page.total}</p>
            <div className="game-grid standalone-grid">{page.games.map(game => <GameCard key={game.id} game={game} {...actions(game)} />)}</div>
            {page.total > 12 && <div className="pagination">
              <Button disabled={offset === 0} onClick={() => setOffset(offset - 12)}>Назад</Button>
              <span>{offset + 1}–{Math.min(offset + 12, page.total)} из {page.total}</span>
              <Button disabled={offset + 12 >= page.total} onClick={() => setOffset(offset + 12)}>Дальше</Button>
            </div>}
          </>}
  </>;
}

export function History({ state, onShare, busy }: { state: PlayerState; onShare: (id: string) => void; busy: boolean }) {
  return <>
    <PageHeader title="История подборок" description="Последние 30 подборок и твой выбор в каждой." />
    {state.history.length === 0 ? <div className="empty-state"><h2>История пока пуста</h2>
      <Button href="#play" variant="outlined">Сделать подборку</Button></div> :
      <div className="history-list">{state.history.map((roll, index) => <section className="history-row" key={roll.id}>
        <div>
          <h2>{new Date(roll.createdAt).toLocaleString('ru', { dateStyle: 'medium', timeStyle: 'short' })}</h2>
          <p>{filterNames(roll.filters) || 'Любые игры'}</p>
        </div>
        <ul>{roll.games.map(game => <li key={game.id} className={game.id === roll.selectedId ? 'history-selected' : undefined}>
          {game.id === roll.selectedId && <CheckRounded fontSize="small" aria-label="Выбрано" />}
          <a href={game.url} target="_blank" rel="noopener noreferrer">{game.title}</a>
        </li>)}</ul>
        {index === 0 && roll.selectedId === null
          ? <Button href="#play" size="small">К выбору</Button>
          : <Button onClick={() => onShare(roll.id)} disabled={busy} size="small" startIcon={<ShareOutlined />}>Поделиться</Button>}
      </section>)}</div>}
  </>;
}

export function Profile({ state, onBonus, busy }: { state: PlayerState; onBonus: () => void; busy: boolean }) {
  const achievements = [
    { title: 'Первый бросок', progress: state.stats.rolls, target: 1, label: 'Сделай первую подборку' },
    { title: 'Коллекционер', progress: state.stats.collected, target: 5, label: 'Собери пять игр' },
    { title: 'Хватит выбирать', progress: state.stats.played, target: 3, label: 'Отметь три игры как сыгранные' },
    { title: 'Охота за находками', progress: state.stats.rolls, target: 20, label: 'Сделай двадцать подборок' },
  ];
  const stats = [
    ['Подборок', state.stats.rolls], ['Собрано', state.stats.collected], ['Сыграно', state.stats.played], ['Очки', state.stats.points],
  ] as const;
  return <>
    <PageHeader title="Твой прогресс" description="За подборку начисляется 3 очка, за выбор игры — 25, за победу в забеге — 40." />
    <dl className="stats-grid">{stats.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
    <section className="bonus-panel">
      <CardGiftcardRounded />
      <div><h2>Ежедневный бонус</h2><p>Три дополнительные подборки. Обновление в {new Date(state.daily.resetsAt)
        .toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })} по твоему времени.</p></div>
      <Button variant="contained" disabled={!state.daily.bonusAvailable || busy} onClick={onBonus}>
        {state.daily.bonusAvailable ? 'Забрать +3' : 'Бонус получен'}
      </Button>
    </section>
    <h2>Достижения</h2>
    <div className="achievement-grid">{achievements.map(({ title, progress, target, label }) => <article key={title}>
      <EmojiEventsOutlined color={progress >= target ? 'primary' : 'disabled'} />
      <div><h3>{title}</h3><p>{label}</p></div>
      <strong>{Math.min(progress, target)} / {target}</strong>
    </article>)}</div>
  </>;
}

export function Shared({ id }: { id: string }) {
  const [roll, setRoll] = useState<SharedRoll>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      if (mutation.current) return;
      const request = ++revision.current;
      void api<SharedRoll>('shared/' + id, { signal: controller.signal }).then(updated => {
        if (request === revision.current) { setRoll(updated); setError(''); }
      }).catch((cause: Error) => {
        if (!controller.signal.aborted && request === revision.current) setError(cause.message);
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [id]);
  async function vote(appId: number) {
    if (mutation.current) return;
    mutation.current = true;
    revision.current++;
    setBusy(true);
    setError('');
    try { setRoll(await post<SharedRoll>(`shared/${id}/vote`, { appId })); }
    catch (cause) { setError((cause as Error).message); }
    finally { mutation.current = false; setBusy(false); }
  }
  return <>
    <PageHeader title="Общая подборка" description={roll?.selectedId ? 'Владелец уже выбрал игру.' :
      roll?.votingOpen === false ? 'Голосование завершено.' : 'Посоветуй другу одну игру из этой подборки.'} />
    {error && <Alert severity="error">{error}</Alert>}
    {!roll && !error && <CircularProgress aria-label="Загрузка подборки" />}
    {roll && <div className="game-grid standalone-grid">{roll.games.map(game => <GameCard key={game.id} game={game} eager
      selected={game.id === roll.selectedId} action={<Button fullWidth variant="outlined" disabled={busy || !roll.votingOpen}
        aria-pressed={game.id === roll.ownVote} startIcon={game.id === roll.ownVote ? <CheckRounded /> : <AutoAwesomeRounded />}
        onClick={() => void vote(game.id)}>{game.id === roll.ownVote ? 'Твой голос' : 'Голосовать'} · {roll.votes[game.id] ?? 0}</Button>} />)}</div>}
  </>;
}
