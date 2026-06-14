import fs from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve('src/web/static');
const target = path.resolve('dist/web/static');

await fs.rm(target, {recursive: true, force: true});
await fs.mkdir(target, {recursive: true});
await fs.cp(source, target, {recursive: true});
