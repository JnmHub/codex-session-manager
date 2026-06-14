import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {getCodexHome} from './paths.js';
import {loadStore, saveStore} from './store.js';
import type {ProfileRecord} from '../types.js';

export async function listProfiles() {
  const store = await loadStore();
  const profiles = new Map<string, ProfileRecord>();

  for (const profile of await detectCodexProfiles()) {
    profiles.set(profile.id, profile);
  }

  for (const profile of Object.values(store.profiles)) {
    profiles.set(profile.id, profile);
  }

  return Array.from(profiles.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function upsertProfile(input: {id?: string; name: string; note?: string; commandArgs?: string}) {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Profile name is required');
  }

  const store = await loadStore();
  const now = new Date().toISOString();
  const id = input.id || slugProfileName(name);
  const existing = store.profiles[id];
  const record: ProfileRecord = {
    id,
    name,
    note: input.note ?? existing?.note,
    commandArgs: input.commandArgs ?? existing?.commandArgs,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  store.profiles[id] = record;
  await saveStore(store);
  return record;
}

export async function deleteProfile(id: string) {
  const store = await loadStore();
  delete store.profiles[id];
  await saveStore(store);
  return {ok: true};
}

export async function getProfileFiles(idOrName: string) {
  const profile = await findProfile(idOrName);
  const configPath = profile.configPath ?? profileConfigPath(profile.name);
  const markdownPath = await resolveProfileMarkdownPath(profile.name, configPath);

  return {
    profile,
    config: {
      path: configPath,
      exists: await exists(configPath),
      content: await readTextSafe(configPath)
    },
    markdown: {
      path: markdownPath,
      exists: await exists(markdownPath),
      content: await readTextSafe(markdownPath)
    }
  };
}

export async function saveProfileFiles(input: {id: string; configContent?: string; markdownContent?: string}) {
  const profile = await findProfile(input.id);
  const configPath = profile.configPath ?? profileConfigPath(profile.name);

  if (typeof input.configContent === 'string') {
    await writeCodexTextFile(configPath, input.configContent);
  }
  const markdownPath = await resolveProfileMarkdownPath(profile.name, configPath);
  if (typeof input.markdownContent === 'string') {
    await writeCodexTextFile(markdownPath, input.markdownContent);
  }

  return getProfileFiles(profile.id);
}

function slugProfileName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || `profile-${Date.now()}`;
}

async function detectCodexProfiles() {
  const detected: ProfileRecord[] = [];
  const now = new Date().toISOString();

  try {
    const config = await fs.readFile(path.join(getCodexHome(), 'config.toml'), 'utf8');
    const names = new Set<string>();
    for (const match of config.matchAll(/^\[profiles\.([^\]]+)\]/gm)) {
      names.add(match[1].replace(/^['"]|['"]$/g, ''));
    }

    detected.push(...Array.from(names).map<ProfileRecord>(name => ({
      id: slugProfileName(name),
      name,
      note: '从 Codex config.toml 识别',
      createdAt: now,
      updatedAt: now
    })));
  } catch {
    // Ignore missing base config; standalone *.config.toml profiles can still exist.
  }

  try {
    const entries = await fs.readdir(getCodexHome(), {withFileTypes: true});
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.config.toml')) {
        continue;
      }

      const name = entry.name.slice(0, -'.config.toml'.length);
      const configPath = path.join(getCodexHome(), entry.name);
      detected.push({
        id: slugProfileName(name),
        name,
        note: `从 ${entry.name} 识别`,
        configPath,
        markdownPath: await resolveProfileMarkdownPath(name, configPath),
        createdAt: now,
        updatedAt: now
      });
    }
  } catch {
    // Ignore missing or unreadable Codex home.
  }

  const unique = new Map<string, ProfileRecord>();
  for (const profile of detected) {
    unique.set(profile.id, profile);
  }

  return Array.from(unique.values());
}

async function findProfile(idOrName: string) {
  const profiles = await listProfiles();
  const profile = profiles.find(item => item.id === idOrName || item.name === idOrName);
  if (!profile) {
    throw new Error(`Profile not found: ${idOrName}`);
  }

  return profile;
}

function profileConfigPath(name: string) {
  return path.join(getCodexHome(), `${safeProfileFileStem(name)}.config.toml`);
}

async function resolveProfileMarkdownPath(name: string, configPath?: string) {
  if (configPath) {
    const configured = await readModelInstructionsPath(configPath);
    if (configured) {
      return configured;
    }
  }

  const stem = safeProfileFileStem(name);
  const markdown = path.join(getCodexHome(), `${stem}.md`);
  const markdownLong = path.join(getCodexHome(), `${stem}.markdown`);
  if (await exists(markdown)) {
    return markdown;
  }
  if (await exists(markdownLong)) {
    return markdownLong;
  }
  return markdown;
}

async function readModelInstructionsPath(configPath: string) {
  try {
    const content = await fs.readFile(configPath, 'utf8');
    const match = content.match(/^\s*model_instructions_file\s*=\s*["']([^"']+)["']/m);
    if (!match) {
      return undefined;
    }
    return resolveUserPath(match[1]);
  } catch {
    return undefined;
  }
}

function resolveUserPath(value: string) {
  if (value === '~') {
    return os.homedir();
  }
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return path.isAbsolute(value) ? value : path.resolve(getCodexHome(), value);
}

function safeProfileFileStem(name: string) {
  const stem = name.trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(stem)) {
    throw new Error('Profile file name may only contain letters, numbers, dot, underscore and dash');
  }
  return stem;
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
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

async function writeCodexTextFile(filePath: string, content: string) {
  const codexHome = path.resolve(getCodexHome());
  const resolved = path.resolve(filePath);
  if (resolved !== codexHome && !resolved.startsWith(`${codexHome}${path.sep}`)) {
    throw new Error('Refusing to write outside CODEX_HOME');
  }
  await fs.writeFile(resolved, content, 'utf8');
}
