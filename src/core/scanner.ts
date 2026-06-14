import fs from 'node:fs/promises';
import path from 'node:path';
import {getCodexHome, getHistoryFile, getSessionsDir} from './paths.js';
import {readJsonl} from './jsonl.js';
import {loadStore, mergeSession, saveStore} from './store.js';
import type {SessionMeta} from '../types.js';

type CodexJsonlRow = {
  timestamp?: string;
  type?: string;
  payload?: {
    id?: string;
    timestamp?: string;
    cwd?: string;
    source?: string;
    originator?: string;
    cli_version?: string;
  };
};

type HistoryRow = {
  session_id?: string;
  ts?: number;
  text?: string;
};

export async function scanSessions(codexHome = getCodexHome()) {
  const sessionsDir = getSessionsDir(codexHome);
  const files = await findJsonlFiles(sessionsDir);
  const summaries = await readLatestHistory(codexHome);
  const metas: SessionMeta[] = [];

  for (const file of files) {
    const meta = await readSessionMetaSafe(file);
    if (meta) {
      meta.summary = summaries.get(meta.id);
      metas.push(meta);
    }
  }

  const store = await loadStore();
  for (const meta of metas) {
    store.sessions[meta.id] = mergeSession(store.sessions[meta.id], meta);
  }

  await saveStore(store);
  return metas;
}

export async function findJsonlFiles(root: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, {withFileTypes: true});
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }

      throw error;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        found.push(fullPath);
      }
    }
  }

  await walk(root);
  return found;
}

export async function readSessionMeta(filePath: string): Promise<SessionMeta | undefined> {
  let meta: SessionMeta | undefined;

  await readJsonl<CodexJsonlRow>(filePath, row => {
    if (row.type !== 'session_meta' || !row.payload?.id) {
      return;
    }

    const createdAt = row.payload.timestamp ?? row.timestamp ?? new Date(0).toISOString();
    meta = {
      id: row.payload.id,
      createdAt,
      updatedAt: row.timestamp ?? createdAt,
      cwd: row.payload.cwd ?? '',
      filePath,
      source: row.payload.source,
      originator: row.payload.originator,
      cliVersion: row.payload.cli_version
    };
    return false;
  });

  return meta;
}

async function readSessionMetaSafe(filePath: string) {
  try {
    return await readSessionMeta(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'EPERM' || code === 'EACCES') {
      return undefined;
    }

    throw error;
  }
}

async function readLatestHistory(codexHome: string) {
  const latest = new Map<string, {ts: number; text: string}>();
  const historyFile = getHistoryFile(codexHome);

  try {
    await readJsonl<HistoryRow>(historyFile, row => {
      if (!row.session_id || !row.text) {
        return;
      }

      const ts = row.ts ?? 0;
      const current = latest.get(row.session_id);
      if (!current || ts >= current.ts) {
        latest.set(row.session_id, {ts, text: row.text});
      }
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  return new Map(Array.from(latest, ([id, value]) => [id, value.text]));
}
