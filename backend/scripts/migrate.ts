import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';
import { databasePath, rootDir } from '../src/config';

const path = databasePath();
mkdirSync(dirname(path), { recursive: true });
// The Prisma schema engine on Windows needs the SQLite file to exist.
closeSync(openSync(path, 'a'));

const result = Bun.spawnSync(['bun', 'run', 'prisma', 'migrate', 'deploy'], {
  cwd: rootDir,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});
process.exit(result.exitCode);
