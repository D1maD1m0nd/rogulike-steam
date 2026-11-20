import { useState, type ReactNode } from 'react';
import { Button, IconButton, Menu, MenuItem } from '@mui/material';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import BookmarkBorderRounded from '@mui/icons-material/BookmarkBorderRounded';
import BookmarkRounded from '@mui/icons-material/BookmarkRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded';
import SportsEsportsOutlined from '@mui/icons-material/SportsEsportsOutlined';
import { gameRating, GENRES, MODES, PLATFORMS, primaryGenre, type Game } from '@steam-draft/contracts';

interface Props {
  game: Game;
  wished?: boolean;
  hidden?: boolean;
  disabled?: boolean;
  selected?: boolean;
  eager?: boolean;
  onWish?: () => void;
  onHide?: () => void;
  action?: ReactNode;
}

export function GameCard({ game, wished, hidden, disabled, selected, eager, onWish, onHide, action }: Props) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [failedImage, setFailedImage] = useState<string>();
  const genre = primaryGenre(game);
  const secondGenre = game.genres.find(tag => tag !== genre);
  const rating = gameRating(game);
  const reviews = (game.reviews?.positive ?? 0) + (game.reviews?.negative ?? 0);
  const approval = reviews ? Math.round(100 * (game.reviews?.positive ?? 0) / reviews) : null;
  return <article className={selected ? 'game-card game-card-selected' : 'game-card'}>
    <div className="game-visual">
      {failedImage === game.image
        ? <div className="image-placeholder" aria-hidden="true"><SportsEsportsOutlined fontSize="large" /></div>
        : <img src={game.image} alt="" loading={eager ? 'eager' : 'lazy'} width={460} height={215}
          onError={() => setFailedImage(game.image)} />}
      {onWish && <IconButton className="float-button" size="small" onClick={onWish} disabled={disabled}
        aria-pressed={Boolean(wished)} aria-label={wished ? `Убрать ${game.title} из желаемого` : `Добавить ${game.title} в желаемое`}>
        {wished ? <BookmarkRounded fontSize="small" /> : <BookmarkBorderRounded fontSize="small" />}
      </IconButton>}
      {selected && <span className="selected-label"><CheckRounded /> Выбрано</span>}
    </div>
    <div className="game-content">
      <div className="game-kicker">
        {[GENRES[genre], secondGenre && GENRES[secondGenre]].filter(Boolean).join(' / ')}
        {onHide && <>
          <IconButton size="small" disabled={disabled} onClick={event => setMenu(event.currentTarget)} aria-haspopup="menu"
            aria-label={`Действия для ${game.title}`}><MoreHorizRounded fontSize="small" /></IconButton>
          <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
            <MenuItem onClick={() => { setMenu(null); onHide(); }}>{hidden ? 'Вернуть в подборки' : 'Скрыть из подборок'}</MenuItem>
          </Menu>
        </>}
      </div>
      <h3>{game.title}</h3>
      <div className="game-rating">
        <strong title="75% — отзывы Steam, 25% — доступность цены в рублях">Оценка {rating}<span> / 100</span></strong>
        {approval !== null
          ? <span>{approval}% положительных · {reviews.toLocaleString('ru')} отзывов</span>
          : <span>Отзывы Steam недоступны</span>}
      </div>
      <p>{game.description}</p>
      <span className="game-metadata">
        {game.platforms.map(platform => PLATFORMS[platform]).join(' · ')}
        {game.platforms.length > 0 && game.modes.length > 0 ? ' / ' : ''}
        {game.modes.map(mode => MODES[mode]).join(' · ')}
      </span>
      <div className="game-footer">
        <strong className={game.free ? 'free-price' : undefined}>{game.free ? 'Бесплатно' : game.price ?? 'См. в Steam'}</strong>
        <Button className="steam-link" component="a" href={game.url} target="_blank" rel="noopener noreferrer"
          color="secondary" size="small" endIcon={<ArrowOutwardRounded fontSize="small" />} aria-label={`Открыть ${game.title} в Steam`}>
          Steam
        </Button>
      </div>
      {action}
    </div>
  </article>;
}
