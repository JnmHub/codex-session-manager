import fs from 'node:fs/promises';
import path from 'node:path';
import {getCodexHome} from './paths.js';

type CodexFileName = 'config.toml' | 'auth.json';

export async function getCodexFile(name: string) {
  const fileName = normalizeCodexFileName(name);
  const filePath = path.join(getCodexHome(), fileName);
  return {
    name: fileName,
    path: filePath,
    content: await readTextSafe(filePath),
    updatedAt: await getUpdatedAt(filePath)
  };
}

export async function saveCodexFile(name: string, content: string) {
  const fileName = normalizeCodexFileName(name);
  if (fileName === 'auth.json') {
    JSON.parse(content);
  }

  const filePath = path.join(getCodexHome(), fileName);
  await fs.writeFile(filePath, content, 'utf8');
  return getCodexFile(fileName);
}

function normalizeCodexFileName(name: string): CodexFileName {
  if (name === 'config.toml' || name === 'auth.json') {
    return name;
  }
  throw new Error('Unsupported Codex file');
}

async function readTextSafe(filePath: string) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

async function getUpdatedAt(filePath: string) {
  try {
    return (await fs.stat(filePath)).mtime.toISOString();
  } catch {
    return undefined;
  }
}
