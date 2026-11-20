import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = fileURLToPath(new URL('../../', import.meta.url));

export function databasePath(): string {
  const path = process.env.DATABASE_PATH || 'data/steam-draft.sqlite';
  if (path === ':memory:') throw new Error('Use a SQLite file for DATABASE_PATH so Prisma can apply migrations.');
  return resolve(rootDir, path);
}

export function databaseUrl(): string {
  const path = databasePath();
  return `file:${path.replaceAll('\\', '/')}`;
}

export function port(): number {
  const value = Number(process.env.PORT || 3001);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('Invalid PORT');
  return value;
}
