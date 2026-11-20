import { MenuItem, TextField } from '@mui/material';
import { GENRES, MODES, PLATFORMS, PRICES, type Filters } from '@steam-draft/contracts';

export const presets: { name: string; filters: Filters }[] = [
  { name: 'Любые', filters: {} },
  { name: 'Инди', filters: { genre: 'indie' } },
  { name: 'Кооператив', filters: { mode: 'coop' } },
  { name: 'Бесплатные', filters: { price: 'free' } },
  { name: 'Стратегии', filters: { genre: 'strategy' } },
];

const options = [
  { key: 'genre', label: 'Жанр', values: GENRES },
  { key: 'mode', label: 'Режим', values: MODES },
  { key: 'platform', label: 'Платформа', values: PLATFORMS },
  { key: 'price', label: 'Цена', values: PRICES },
] as const;

export function sameFilters(a: Filters, b: Filters): boolean {
  return options.every(({ key }) => a[key] === b[key]);
}

export function FilterFields({ value, onChange }: { value: Filters; onChange: (next: Filters) => void }) {
  return <div className="filter-fields">
    {options.map(({ key, label, values }) => <TextField key={key} select size="small" label={label} value={value[key] ?? ''}
      onChange={event => {
        const next = { ...value };
        if (event.target.value) return onChange({ ...next, [key]: event.target.value });
        delete next[key];
        onChange(next);
      }}>
      <MenuItem value="">Любой вариант</MenuItem>
      {Object.entries(values).map(([id, name]) => <MenuItem key={id} value={id}>{name}</MenuItem>)}
    </TextField>)}
  </div>;
}

export function filterNames(filters: Filters): string {
  return [filters.genre && GENRES[filters.genre], filters.mode && MODES[filters.mode],
    filters.platform && PLATFORMS[filters.platform], filters.price && PRICES[filters.price]].filter(Boolean).join(' · ');
}
