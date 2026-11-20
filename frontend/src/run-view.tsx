import { useEffect, useRef, useState } from 'react';
import { Alert, Button, LinearProgress } from '@mui/material';
import AssignmentLateRounded from '@mui/icons-material/AssignmentLateRounded';
import AutoFixHighRounded from '@mui/icons-material/AutoFixHighRounded';
import BoltRounded from '@mui/icons-material/BoltRounded';
import BuildRounded from '@mui/icons-material/BuildRounded';
import CoffeeRounded from '@mui/icons-material/CoffeeRounded';
import ConstructionRounded from '@mui/icons-material/ConstructionRounded';
import EmojiEventsOutlined from '@mui/icons-material/EmojiEventsOutlined';
import ExploreRounded from '@mui/icons-material/ExploreRounded';
import FavoriteRounded from '@mui/icons-material/FavoriteRounded';
import ForumRounded from '@mui/icons-material/ForumRounded';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import LayersOutlined from '@mui/icons-material/LayersOutlined';
import LocalFireDepartmentOutlined from '@mui/icons-material/LocalFireDepartmentOutlined';
import PaidOutlined from '@mui/icons-material/PaidOutlined';
import PsychologyRounded from '@mui/icons-material/PsychologyRounded';
import RouteOutlined from '@mui/icons-material/RouteOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import SpeedRounded from '@mui/icons-material/SpeedRounded';
import SportsScoreRounded from '@mui/icons-material/SportsScoreRounded';
import SystemUpdateAltRounded from '@mui/icons-material/SystemUpdateAltRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import { ABILITIES, GENRES, previewCardPlay, type Expedition, type GameGenre, type RunAction, type RunBattle, type RunCard, type RunEnemy, type RunState } from '@steam-draft/contracts';
import { api, post } from './api';
import gabePortrait from './assets/gabe-boss.png';
import { GameCard } from './game-card';
import { RunMap } from './run-map';
import './run-view.css';

type Act = (action: RunAction, choice?: number) => Promise<void>;

const enemyIcons = {
  parent: AssignmentLateRounded, spoiler: ForumRounded, backlog: Inventory2Outlined,
  drill: ConstructionRounded, patch: SystemUpdateAltRounded, gabe: EmojiEventsOutlined,
} satisfies Record<RunEnemy, object>;

const abilityIcons = {
  action: LocalFireDepartmentOutlined, adventure: ExploreRounded, indie: AutoFixHighRounded, rpg: FavoriteRounded,
  simulation: BuildRounded, strategy: PsychologyRounded, casual: CoffeeRounded, racing: SpeedRounded,
  sports: SportsScoreRounded, horror: VisibilityOffRounded,
} satisfies Record<GameGenre, object>;

const stages: Record<Expedition['phase'], { title: string; hint?: string }> = {
  starter: { title: 'Стартовая карта' },
  route: { title: 'Куда дальше?', hint: 'Выбери следующую комнату.' },
  battle: { title: 'Бой' },
  draft: { title: 'Пополнение колоды', hint: 'Добавь одну карту или продолжи с текущей колодой.' },
  victory: { title: 'Босс повержен' },
  finished: { title: 'Забег пройден' },
  defeat: { title: 'Забег окончен' },
  abandoned: { title: 'Забег завершён' },
};

function isTerminal(run: Expedition) {
  return run.phase === 'finished' || run.phase === 'defeat' || run.phase === 'abandoned';
}

function RunStats({ state }: { state: RunState }) {
  return <dl className="run-stats">
    <div><dt>Попытки</dt><dd>{state.attempts}</dd></div>
    <div><dt>Победы</dt><dd>{state.wins}</dd></div>
    <div><dt>Рекорд по комнатам</dt><dd>{state.best}</dd></div>
  </dl>;
}

function Health({ hp, maxHp }: { hp: number; maxHp: number }) {
  const percent = Math.min(100, Math.max(0, hp / maxHp * 100));
  return <span className="run-health" role="progressbar" aria-label="Здоровье" aria-valuemin={0}
    aria-valuemax={maxHp} aria-valuenow={Math.max(0, hp)}>
    <span style={{ width: `${percent}%` }} />
  </span>;
}

function CardPowers({ card, details = false }: { card: RunCard; details?: boolean }) {
  const ability = ABILITIES[card.genre];
  const AbilityIcon = abilityIcons[card.genre];
  return <div className="run-card-details">
    <div className="run-card-powers">
      <span><BoltRounded aria-hidden="true" /> {card.attack} урон</span>
      <span><ShieldOutlined aria-hidden="true" /> {card.guard} защита</span>
      {card.upgraded && <strong>Улучшена</strong>}
    </div>
    <div className="run-card-ability" title={ability.description}>
      <AbilityIcon aria-hidden="true" />
      <div><strong>{ability.name}</strong> <span>· {GENRES[card.genre]}</span>
        {details && <p>{ability.description}</p>}
      </div>
    </div>
  </div>;
}

function DeckOverview({ deck }: { deck: RunCard[] }) {
  if (deck.length === 0) return null;
  return <details className="run-deck-overview">
    <summary><LayersOutlined /> <span>Твоя колода</span> <strong>{deck.length}</strong></summary>
    <ul>{deck.map(card => <li key={card.game.id}>
      <a href={card.game.url} rel="noopener noreferrer" target="_blank">{card.game.title}</a>
      <CardPowers card={card} />
    </li>)}</ul>
  </details>;
}

function Battle({ battle, deck, hp, maxHp, busy, act }: {
  battle: RunBattle; deck: RunCard[]; hp: number; maxHp: number; busy: boolean; act: Act;
}) {
  const { type, value, label } = battle.intent;
  const attack = type === 'attack';
  const EnemyIcon = enemyIcons[battle.enemy];
  const boss = battle.enemy === 'gabe';
  const hand = useRef<HTMLUListElement>(null);
  const previousTurn = useRef(battle.turn);
  useEffect(() => {
    if (battle.turn === previousTurn.current) return;
    previousTurn.current = battle.turn;
    hand.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [battle.turn]);
  return <>
    <div className={boss ? 'run-enemy run-enemy-boss' : 'run-enemy'}>
      {boss
        ? <img className="run-enemy-portrait" src={gabePortrait} alt="Пиксельный портрет Гейба Ньюэлла" width={104} height={104} />
        : <span className="run-enemy-emblem" aria-hidden="true"><EnemyIcon /></span>}
      <div className="run-enemy-name">
        <span className="run-turn">Ход {battle.turn}</span>
        <h3>{battle.name}</h3>
        <div className="run-enemy-health"><span>{battle.hp} / {battle.maxHp} здоровья</span><Health hp={battle.hp} maxHp={battle.maxHp} /></div>
      </div>
      <div className="run-intent">
        {attack ? <BoltRounded /> : <ShieldOutlined />}
        <div><span>{attack ? 'Атака' : 'Защита'} · {value}</span><strong>{label}</strong></div>
      </div>
    </div>
    <div className="run-hand-heading">
      <h3>Сыграй карту</h3>
      <p>Одна карта за ход. Колода обновляется, когда сыграны все карты.</p>
    </div>
    <ul ref={hand} className="run-hand">
      {deck.map(card => {
        const spent = battle.spentIds.includes(card.game.id);
        const turn = previewCardPlay(card, battle, hp, maxHp);
        return <li key={card.game.id} className={spent ? 'run-hand-spent' : undefined}>
          <div className="run-hand-art"><img src={card.game.image} alt="" width={460} height={215} /></div>
          <div className="run-hand-body">
            <h4>{card.game.title}</h4>
            <CardPowers card={card} />
            <p className="run-hand-preview">{spent ? 'Вернётся в следующем цикле' : turn.wins
              ? 'Добивающий удар' : `Урон ${turn.damage} · получишь ${turn.incoming}`}
              {!spent && turn.ability && <strong>{turn.stunned ? 'Оглушение' : turn.ability}{turn.healing ? ` · +${turn.healing} HP` : ''}</strong>}
            </p>
            <Button variant="outlined" color="secondary" fullWidth disabled={spent || busy}
              aria-label={spent ? `${card.game.title}: сыграна` : `Сыграть ${card.game.title}`}
              onClick={() => void act('play', card.game.id)}>{spent ? 'Сыграна' : 'Сыграть'}</Button>
          </div>
        </li>;
      })}
    </ul>
  </>;
}

export function RunView({ onCollectionChange }: { onCollectionChange: () => void }) {
  const [state, setState] = useState<RunState>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const mutating = useRef(false);
  const stageTitle = useRef<HTMLHeadingElement>(null);
  const previousStage = useRef('');
  const run = state?.current;
  const stageKey = run ? `${run.id}:${run.phase}:${run.step}` : state ? 'start' : '';

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void api<RunState>('runs', { signal: controller.signal }).then(setState).catch((cause: Error) => {
      if (!controller.signal.aborted) setError(cause.message);
    });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (previousStage.current && previousStage.current !== stageKey) stageTitle.current?.focus();
    previousStage.current = stageKey;
  }, [stageKey]);

  async function update(path: string, body: object = {}) {
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await post<RunState>(path, body);
      setState(next);
      if (next.wins !== state?.wins || next.current?.prizeId && next.current.prizeId !== run?.prizeId) onCollectionChange();
    } catch (cause) {
      setError((cause as Error).message);
      try { setState(await api<RunState>('runs')); } catch { /* The action error is already displayed. */ }
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }

  const act: Act = async (action, choice) => {
    if (run) await update(`runs/${run.id}/action`, { version: run.version, action, choice });
  };

  const terminal = run ? isTerminal(run) : false;
  const choosing = run?.phase === 'starter' || run?.phase === 'draft' || run?.phase === 'victory';
  const prize = run?.deck.find(card => card.game.id === run.prizeId);
  const map = run && <RunMap nodes={run.map} currentNodeId={run.currentNodeId} visitedNodeIds={run.visitedNodeIds}
    availableNodeIds={run.availableNodeIds} disabled={busy || run.phase !== 'route'} onTravel={id => void act('travel', id)} />;

  return <div className="run-view">
    <header className="run-heading">
      <div><h1>Карточный забег</h1><p>Собери колоду из игр Steam, пройди четыре комнаты и победи босса.</p></div>
      {state && <RunStats state={state} />}
    </header>
    {error && <Alert severity="error" action={!state && <Button color="inherit" onClick={() => setRetry(value => value + 1)}>
      Повторить
    </Button>}>{error}</Alert>}
    {!state && !error && <LinearProgress aria-label="Загрузка забега" />}
    {state && !run && <section className="run-start" aria-labelledby="run-start-title">
      <div>
        <h2 id="run-start-title">Твой первый маршрут</h2>
        <p>Маршрут и карты меняются с каждой попыткой. После победы можно сохранить одну из игр в коллекцию.</p>
        <Button variant="contained" startIcon={<RouteOutlined />} disabled={busy} onClick={() => void update('runs')}>Начать забег</Button>
      </div>
      <div className="run-start-art" aria-hidden="true"><RouteOutlined /><LayersOutlined /><EmojiEventsOutlined /></div>
    </section>}
    {run && <>
      <section className="run-dashboard" aria-label="Состояние забега">
        <div className="run-progress"><RouteOutlined aria-hidden="true" /> Комнаты <strong>{run.step} / {run.maxSteps}</strong></div>
        <div className="run-resources">
          <div className="run-resource"><FavoriteRounded /><div><span>Здоровье</span><strong>{run.hp} / {run.maxHp}</strong></div></div>
          <div className="run-resource"><PaidOutlined /><div><span>Монеты</span><strong>{run.coins}</strong></div></div>
        </div>
      </section>
      {run.phase !== 'route' && run.phase !== 'starter' && <details className="run-map-drawer">
        <summary>Карта забега</summary>
        {map}
      </details>}
      <section className="run-stage" aria-labelledby="run-stage-title" aria-busy={busy}>
        <div className="run-stage-heading">
          <div>
            <h2 ref={stageTitle} tabIndex={-1} id="run-stage-title">{stages[run.phase].title}</h2>
            {stages[run.phase].hint && <p>{stages[run.phase].hint}</p>}
          </div>
          {(run.phase === 'draft' || run.phase === 'victory') &&
            <Button color="secondary" disabled={busy} onClick={() => void act('skip')}>Пропустить</Button>}
        </div>
        {run.note && <p className="run-note" role="status">{run.note}</p>}
        {choosing && <div className="game-grid run-picks">{run.options.map(card => <GameCard key={card.game.id} game={card.game}
          action={<><CardPowers card={card} details /><Button fullWidth variant="contained" disabled={busy}
            aria-label={run.phase === 'victory' ? `В коллекцию: ${card.game.title}` : `В колоду: ${card.game.title}`}
            onClick={() => void act(run.phase === 'victory' ? 'prize' : 'draft', card.game.id)}>
            {run.phase === 'victory' ? 'В коллекцию' : 'В колоду'}
          </Button></>} />)}</div>}
        {run.phase === 'route' && map}
        {run.phase === 'battle' && run.battle && <Battle battle={run.battle} deck={run.deck} hp={run.hp} maxHp={run.maxHp} busy={busy} act={act} />}
        {terminal && <div className="run-end">
          <div className="run-end-actions">
            <Button variant="contained" disabled={busy} onClick={() => void update('runs')}>Новый забег</Button>
            {run.prizeId && <Button color="secondary" href="#collection">Открыть коллекцию</Button>}
          </div>
          {prize && <div className="run-end-prize"><GameCard game={prize.game} selected /></div>}
        </div>}
      </section>
      {!terminal && run.phase !== 'battle' && <DeckOverview deck={run.deck} />}
      {!terminal && run.phase !== 'victory' && <div className="run-footer">
        <Button color="secondary" size="small" disabled={busy} onClick={() => {
          if (window.confirm('Завершить текущий забег? Его нельзя будет продолжить.')) void act('abandon');
        }}>Завершить забег</Button>
      </div>}
    </>}
  </div>;
}
