import { type CSSProperties, type KeyboardEvent, useId, useRef, useState } from 'react';
import { Button, ButtonBase } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import BoltRounded from '@mui/icons-material/BoltRounded';
import CasinoRounded from '@mui/icons-material/CasinoRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import EmojiEventsOutlined from '@mui/icons-material/EmojiEventsOutlined';
import FavoriteRounded from '@mui/icons-material/FavoriteRounded';
import LocalFireDepartmentOutlined from '@mui/icons-material/LocalFireDepartmentOutlined';
import RouteOutlined from '@mui/icons-material/RouteOutlined';
import StorefrontOutlined from '@mui/icons-material/StorefrontOutlined';
import type { RunMapNode, RunRoom } from '@steam-draft/contracts';
import './run-map.css';

const roomStyles = {
  battle: { label: 'Бой', icon: BoltRounded },
  elite: { label: 'Элита', icon: LocalFireDepartmentOutlined },
  rest: { label: 'Отдых', icon: FavoriteRounded },
  event: { label: 'Событие', icon: CasinoRounded },
  shop: { label: 'Лавка', icon: StorefrontOutlined },
  boss: { label: 'Босс', icon: EmojiEventsOutlined },
} satisfies Record<RunRoom, { label: string; icon: typeof BoltRounded }>;

type RoomStatus = 'current' | 'visited' | 'available' | 'future';

const statusNames: Record<RoomStatus, string> = {
  current: 'Текущая комната',
  visited: 'Пройдено',
  available: 'Можно войти',
  future: 'Переход недоступен',
};

interface RunMapProps {
  nodes: RunMapNode[];
  currentNodeId: number | null;
  visitedNodeIds: number[];
  availableNodeIds: number[];
  onTravel: (nodeId: number) => void;
  disabled: boolean;
}

interface Connection {
  from: RunMapNode;
  to: RunMapNode;
  state: 'visited' | 'available' | 'future';
}

function MapConnections({ connections, depths, lanes, vertical }: {
  connections: Connection[];
  depths: number;
  lanes: number;
  vertical: boolean;
}) {
  const position = ({ depth, lane }: RunMapNode) => {
    const step = (depth + .5) * 100 / depths;
    const track = (lane + .5) * 100 / lanes;
    return vertical ? [track, step] : [step, track];
  };
  return <svg className={vertical ? 'run-map__lines run-map__lines--vertical' : 'run-map__lines'} viewBox="0 0 100 100"
    preserveAspectRatio="none" aria-hidden="true" focusable="false">
    {connections.map(({ from, to, state }) => {
      const [x1, y1] = position(from);
      const [x2, y2] = position(to);
      const middle = vertical ? (y1 + y2) / 2 : (x1 + x2) / 2;
      const controls = vertical ? `${x1} ${middle}, ${x2} ${middle}` : `${middle} ${y1}, ${middle} ${y2}`;
      return <path key={`${from.id}-${to.id}`} d={`M ${x1} ${y1} C ${controls}, ${x2} ${y2}`}
        data-state={state} vectorEffect="non-scaling-stroke" />;
    })}
  </svg>;
}

export function RunMap({ nodes, currentNodeId, visitedNodeIds, availableNodeIds, onTravel, disabled }: RunMapProps) {
  const titleId = useId();
  const detailsId = useId();
  const keyboardId = useId();
  const [selection, setSelection] = useState<{ scope: string; id: number }>();
  const controls = useRef(new Map<number, HTMLButtonElement>());

  const ordered = [...nodes].sort((a, b) => a.depth - b.depth || a.lane - b.lane);
  const byId = new Map(ordered.map(node => [node.id, node]));
  const current = currentNodeId === null ? undefined : byId.get(currentNodeId);
  const visited = new Set(visitedNodeIds);
  const available = new Set(availableNodeIds);
  const path = current && !visited.has(current.id) ? [...visitedNodeIds, current.id] : visitedNodeIds;
  const chosenEdges = new Set(path.slice(1).map((id, index) => `${path[index]}-${id}`));
  const scope = `${currentNodeId}:${availableNodeIds.join(',')}`;
  const remembered = selection?.scope === scope ? byId.get(selection.id) : undefined;
  const selected = remembered ?? ordered.find(node => node.kind === 'battle' && available.has(node.id))
    ?? ordered.find(node => available.has(node.id)) ?? current ?? ordered[0];
  if (!selected) return null;

  const depths = Math.max(...ordered.map(node => node.depth)) + 1;
  const lanes = Math.max(...ordered.map(node => node.lane)) + 1;
  const canTravel = available.has(selected.id);
  const getStatus = (id: number): RoomStatus => {
    if (id === currentNodeId) return 'current';
    if (visited.has(id)) return 'visited';
    return available.has(id) ? 'available' : 'future';
  };

  const connections = ordered.flatMap(from => from.next.flatMap((next): Connection[] => {
    const to = byId.get(next);
    if (!to) return [];
    const state = chosenEdges.has(`${from.id}-${to.id}`) ? 'visited' :
      from.id === currentNodeId && available.has(to.id) ? 'available' : 'future';
    return [{ from, to, state }];
  }));

  function changeSelection(id: number) {
    setSelection({ scope, id });
  }

  function onRoomKey(event: KeyboardEvent<HTMLButtonElement>, nodeId: number) {
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    if (!backward && !forward) return;
    event.preventDefault();
    const index = ordered.findIndex(node => node.id === nodeId);
    const nextIndex = (index + (forward ? 1 : -1) + ordered.length) % ordered.length;
    const next = ordered[nextIndex];
    changeSelection(next.id);
    controls.current.get(next.id)?.focus();
  }

  const grid = { '--map-depths': depths, '--map-lanes': lanes } as CSSProperties;
  const DetailIcon = roomStyles[selected.kind].icon;
  return <section className="run-map" aria-labelledby={titleId}>
    <header className="run-map__heading">
      <h3 id={titleId}><RouteOutlined aria-hidden="true" /> Карта забега</h3>
      <ul className="run-map__legend" aria-label="Условные обозначения">
        <li data-state="visited">Пройдено</li>
        <li data-state="available">Можно войти</li>
        <li data-state="future">Недоступно</li>
      </ul>
    </header>
    <p className="run-map__sr" id={keyboardId}>Стрелки меняют выбранную комнату.</p>
    <ol className="run-map__plot" style={grid} aria-label="Комнаты на карте">
      <li className="run-map__connections" aria-hidden="true">
        <MapConnections connections={connections} depths={depths} lanes={lanes} vertical={false} />
        <MapConnections connections={connections} depths={depths} lanes={lanes} vertical />
      </li>
      {ordered.map(node => {
        const { label, icon: Icon } = roomStyles[node.kind];
        const state = getStatus(node.id);
        const nodePosition = { '--map-step': node.depth + 1, '--map-lane': node.lane + 1 } as CSSProperties;
        return <li className="run-map__cell" key={node.id} style={nodePosition}>
          <ButtonBase type="button" className="run-map__node" data-state={state} data-boss={node.kind === 'boss'}
            aria-current={state === 'current' ? 'location' : undefined} aria-pressed={selected.id === node.id}
            aria-label={`${node.title}, этап ${node.depth + 1}, ${statusNames[state]}`}
            aria-controls={detailsId} aria-describedby={keyboardId} tabIndex={selected.id === node.id ? 0 : -1}
            ref={element => { if (element) controls.current.set(node.id, element); else controls.current.delete(node.id); }}
            onClick={() => changeSelection(node.id)} onKeyDown={event => onRoomKey(event, node.id)}>
            <span className="run-map__marker"><Icon aria-hidden="true" />
              {state === 'visited' && <CheckRounded className="run-map__check" aria-hidden="true" />}
            </span>
            <span className="run-map__node-label">{label}</span>
          </ButtonBase>
        </li>;
      })}
    </ol>
    <div className="run-map__details" data-state={getStatus(selected.id)}>
      <DetailIcon className="run-map__detail-icon" aria-hidden="true" />
      <div className="run-map__detail-text" id={detailsId} aria-live="polite">
        <div className="run-map__detail-title">
          <strong>{selected.title}</strong>
          <span>{statusNames[getStatus(selected.id)]}</span>
        </div>
        <p>{selected.description}</p>
      </div>
      {canTravel && <Button type="button" variant="contained" disabled={disabled} endIcon={<ArrowForwardRounded />}
        onClick={() => onTravel(selected.id)}>Войти в комнату</Button>}
    </div>
  </section>;
}
