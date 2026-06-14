import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {loadStore, saveStore} from './store.js';
import {getSessionsDir} from './paths.js';
import type {ListOptions, SessionRecord} from '../types.js';

export async function listSessions(options: ListOptions = {}) {
  const store = await loadStore();
  const query = options.query?.toLowerCase();

  return Object.values(store.sessions)
    .filter(session => options.all || !session.archived)
    .filter(session => {
      if (!query) {
        return true;
      }

      return [
        session.id,
        session.cwd,
        session.boundPath,
        session.category,
        session.note,
        session.summary,
        ...session.tags
      ]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query));
    })
    .filter(session => {
      if (!options.project) {
        return true;
      }

      return projectName(session).toLowerCase().includes(options.project.toLowerCase());
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, options.limit ?? 50);
}

export async function getSession(idOrPrefix: string) {
  const store = await loadStore();
  const exact = store.sessions[idOrPrefix];
  if (exact) {
    return exact;
  }

  const matches = Object.values(store.sessions).filter(session => session.id.startsWith(idOrPrefix));
  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    throw new Error(`Session prefix is ambiguous: ${idOrPrefix}`);
  }

  throw new Error(`Session not found: ${idOrPrefix}. Run "cxm scan" first.`);
}

export async function setNote(idOrPrefix: string, note: string) {
  const store = await loadStore();
  const session = await getSession(idOrPrefix);
  store.sessions[session.id] = {...session, note};
  await saveStore(store);
  return store.sessions[session.id];
}

export async function setCategory(idOrPrefix: string, category: string) {
  const store = await loadStore();
  const session = await getSession(idOrPrefix);
  const normalized = category.trim();
  store.sessions[session.id] = {...session, category: normalized || undefined};
  await saveStore(store);
  return store.sessions[session.id];
}

export async function setBoundPath(idOrPrefix: string, boundPath: string) {
  const resolved = path.resolve(boundPath);
  const store = await loadStore();
  const session = await getSession(idOrPrefix);
  store.sessions[session.id] = {...session, boundPath: resolved};
  await saveStore(store);
  return store.sessions[session.id];
}

export async function setSessionLaunchOptions(
  idOrPrefix: string,
  options: {profile?: string | null; yolo?: boolean | null}
) {
  const store = await loadStore();
  const session = await getSession(idOrPrefix);
  store.sessions[session.id] = {
    ...session,
    profile: options.profile === null ? undefined : options.profile === undefined ? session.profile : options.profile,
    yolo: options.yolo === null ? undefined : options.yolo === undefined ? session.yolo : options.yolo
  };
  await saveStore(store);
  return store.sessions[session.id];
}

export async function toggleFavorite(idOrPrefix: string) {
  const store = await loadStore();
  const session = await getSession(idOrPrefix);
  store.sessions[session.id] = {...session, favorite: !session.favorite};
  await saveStore(store);
  return store.sessions[session.id];
}

export async function setFavorite(idOrPrefix: string, favorite: boolean) {
  const store = await loadStore();
  const session = await getSession(idOrPrefix);
  store.sessions[session.id] = {...session, favorite};
  await saveStore(store);
  return store.sessions[session.id];
}

export async function toggleArchived(idOrPrefix: string) {
  const store = await loadStore();
  const session = await getSession(idOrPrefix);
  store.sessions[session.id] = {...session, archived: !session.archived};
  await saveStore(store);
  return store.sessions[session.id];
}

export async function setArchived(idOrPrefix: string, archived: boolean) {
  const store = await loadStore();
  const session = await getSession(idOrPrefix);
  store.sessions[session.id] = {...session, archived};
  await saveStore(store);
  return store.sessions[session.id];
}

export async function deleteSession(idOrPrefix: string, options: {deleteFile?: boolean} = {}) {
  const store = await loadStore();
  const session = await getSession(idOrPrefix);
  let deletedFile = false;

  if (options.deleteFile) {
    const filePath = assertSessionHistoryPath(session.filePath);
    try {
      await fsp.unlink(filePath);
      deletedFile = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  delete store.sessions[session.id];
  delete store.transcriptEdits[session.id];
  await saveStore(store);
  return {session, deletedFile};
}

export async function listProjects() {
  const sessions = await listSessions({all: true, limit: Number.MAX_SAFE_INTEGER});
  const projects = new Map<string, {path: string; count: number; missing: boolean; latest: string}>();

  for (const session of sessions) {
    const activePath = getActivePath(session);
    const key = activePath || '(no cwd)';
    const existing = projects.get(key);
    projects.set(key, {
      path: key,
      count: (existing?.count ?? 0) + 1,
      missing: activePath ? !fs.existsSync(activePath) : true,
      latest:
        !existing || Date.parse(session.updatedAt) > Date.parse(existing.latest)
          ? session.updatedAt
          : existing.latest
    });
  }

  return Array.from(projects.values()).sort((a, b) => Date.parse(b.latest) - Date.parse(a.latest));
}

export function getActivePath(session: SessionRecord) {
  return session.boundPath || session.cwd;
}

export function projectName(session: SessionRecord) {
  const activePath = getActivePath(session);
  return activePath ? path.basename(activePath) || activePath : '(no cwd)';
}

export function formatShortId(id: string) {
  return id.slice(0, 8);
}

function assertSessionHistoryPath(filePath: string) {
  const root = path.resolve(getSessionsDir());
  const resolved = path.resolve(filePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !resolved.endsWith('.jsonl')) {
    throw new Error('Refusing to delete a file outside Codex sessions directory');
  }
  return resolved;
}
