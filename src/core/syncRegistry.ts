import path from 'node:path';
import {listSkills, saveSkill, saveSkillFiles, type SkillScope} from './codexExtensions.js';
import {listProfiles, saveProfileFiles, upsertProfile} from './profiles.js';
import {loadStore, saveStore} from './store.js';

export const defaultRegistryUrl =
  process.env.CXM_REGISTRY_URL ??
  'https://raw.githubusercontent.com/JnmHub/codex-session-registry/main/registry.json';

export type SyncItemRef = {
  type: 'skill' | 'profile';
  id: string;
};

type RegistrySkill = {
  id?: string;
  name: string;
  version?: string;
  updatedAt?: string;
  description?: string;
  content?: string;
  skillUrl?: string;
  files?: Array<{
    path: string;
    content?: string;
    url?: string;
  }>;
  tags?: string[];
};

type RegistryProfile = {
  id?: string;
  name: string;
  version?: string;
  updatedAt?: string;
  note?: string;
  commandArgs?: string;
  configContent?: string;
  markdownContent?: string;
  configUrl?: string;
  markdownUrl?: string;
  tags?: string[];
};

type SyncRegistry = {
  name?: string;
  version?: string;
  updatedAt?: string;
  skills?: RegistrySkill[];
  profiles?: RegistryProfile[];
};

export async function fetchSyncRegistry(url = defaultRegistryUrl) {
  let registry: SyncRegistry;
  try {
    registry = await fetchJson<SyncRegistry>(url);
  } catch (error) {
    if (url !== defaultRegistryUrl) {
      throw error;
    }
    registry = {
      name: 'Codex Sync Registry',
      version: 'empty',
      updatedAt: new Date().toISOString(),
      skills: [],
      profiles: []
    };
  }
  const skills = (registry.skills ?? []).map((item, index) => ({
    ...item,
    id: item.id || item.name || `skill-${index}`,
    type: 'skill' as const
  }));
  const profiles = (registry.profiles ?? []).map((item, index) => ({
    ...item,
    id: item.id || item.name || `profile-${index}`,
    type: 'profile' as const
  }));

  return {
    url,
    name: registry.name || 'Codex Sync Registry',
    version: registry.version || '',
    updatedAt: registry.updatedAt || '',
    skills,
    profiles,
    count: skills.length + profiles.length
  };
}

export async function fetchSyncRegistryWithStatus(input: {
  url?: string;
  skillScope: SkillScope;
  projectPath?: string;
}) {
  const registry = await fetchSyncRegistry(input.url);
  const installedSkills = new Set(
    (await listSkills({scope: input.skillScope, projectPath: input.projectPath}))
      .filter(skill => skill.exists)
      .map(skill => skill.name)
  );
  const installedProfiles = new Set((await listProfiles()).map(profile => profile.name));
  const store = await loadStore();

  const skills = registry.skills.map(skill => {
    const installKey = syncInstallKey({
      registryUrl: registry.url,
      type: 'skill',
      id: skill.id,
      skillScope: input.skillScope,
      projectPath: input.projectPath
    });
    return {
      ...skill,
      local: getLocalStatus({
        installed: installedSkills.has(skill.name),
        record: store.syncInstalls[installKey],
        remoteVersion: skill.version,
        remoteUpdatedAt: skill.updatedAt
      })
    };
  });

  const profiles = registry.profiles.map(profile => {
    const installKey = syncInstallKey({
      registryUrl: registry.url,
      type: 'profile',
      id: profile.id
    });
    return {
      ...profile,
      local: getLocalStatus({
        installed: installedProfiles.has(profile.name),
        record: store.syncInstalls[installKey],
        remoteVersion: profile.version,
        remoteUpdatedAt: profile.updatedAt
      })
    };
  });

  return {
    ...registry,
    skills,
    profiles
  };
}

export async function installSyncItems(input: {
  url?: string;
  items: SyncItemRef[];
  skillScope: SkillScope;
  projectPath?: string;
}) {
  const registry = await fetchSyncRegistry(input.url);
  const itemKeys = new Set(input.items.map(item => `${item.type}:${item.id}`));
  const installAll = itemKeys.size === 0;
  const installed: Array<{type: string; id: string; name: string}> = [];

  for (const skill of registry.skills) {
    if (!installAll && !itemKeys.has(`skill:${skill.id}`)) {
      continue;
    }
    if (skill.files?.length) {
      const files = await Promise.all(skill.files.map(async file => ({
        path: file.path,
        content: file.content ?? await fetchTextRequired(file.url, `Skill ${skill.name}/${file.path}`)
      })));
      await saveSkillFiles({
        scope: input.skillScope,
        projectPath: input.projectPath,
        name: skill.name,
        files
      });
    } else {
      const content = skill.content ?? await fetchTextRequired(skill.skillUrl, `Skill ${skill.name}`);
      await saveSkill({
        scope: input.skillScope,
        projectPath: input.projectPath,
        name: skill.name,
        content
      });
    }
    await recordSyncInstall({
      registryUrl: registry.url,
      type: 'skill',
      id: skill.id,
      name: skill.name,
      version: skill.version,
      remoteUpdatedAt: skill.updatedAt,
      skillScope: input.skillScope,
      projectPath: input.projectPath
    });
    installed.push({type: 'skill', id: skill.id, name: skill.name});
  }

  for (const profile of registry.profiles) {
    if (!installAll && !itemKeys.has(`profile:${profile.id}`)) {
      continue;
    }
    const saved = await upsertProfile({
      name: profile.name,
      note: profile.note,
      commandArgs: profile.commandArgs
    });
    const configContent = profile.configContent ?? await fetchTextOptional(profile.configUrl);
    const markdownContent = profile.markdownContent ?? await fetchTextOptional(profile.markdownUrl);
    if (typeof configContent === 'string' || typeof markdownContent === 'string') {
      await saveProfileFiles({
        id: saved.id,
        configContent,
        markdownContent
      });
    }
    await recordSyncInstall({
      registryUrl: registry.url,
      type: 'profile',
      id: profile.id,
      name: profile.name,
      version: profile.version,
      remoteUpdatedAt: profile.updatedAt
    });
    installed.push({type: 'profile', id: profile.id, name: profile.name});
  }

  return {
    ok: true,
    installed
  };
}

function getLocalStatus(input: {
  installed: boolean;
  record?: {
    version?: string;
    remoteUpdatedAt?: string;
    installedAt: string;
  };
  remoteVersion?: string;
  remoteUpdatedAt?: string;
}) {
  if (!input.installed) {
    return {
      installed: false,
      tracked: false,
      updateAvailable: false,
      state: 'not-installed' as const
    };
  }

  if (!input.record) {
    return {
      installed: true,
      tracked: false,
      updateAvailable: false,
      state: 'installed-untracked' as const
    };
  }

  const versionChanged = Boolean(input.remoteVersion && input.record.version && input.remoteVersion !== input.record.version);
  const newerRemote = Boolean(
    input.remoteUpdatedAt &&
    input.record.remoteUpdatedAt &&
    Date.parse(input.remoteUpdatedAt) > Date.parse(input.record.remoteUpdatedAt)
  );
  const updateAvailable = versionChanged || newerRemote;

  return {
    installed: true,
    tracked: true,
    updateAvailable,
    state: updateAvailable ? 'update-available' as const : 'current' as const,
    installedVersion: input.record.version,
    installedRemoteUpdatedAt: input.record.remoteUpdatedAt,
    installedAt: input.record.installedAt
  };
}

async function recordSyncInstall(input: {
  registryUrl: string;
  type: 'skill' | 'profile';
  id: string;
  name: string;
  version?: string;
  remoteUpdatedAt?: string;
  skillScope?: SkillScope;
  projectPath?: string;
}) {
  const store = await loadStore();
  const key = syncInstallKey(input);
  store.syncInstalls[key] = {
    key,
    type: input.type,
    id: input.id,
    name: input.name,
    registryUrl: input.registryUrl,
    version: input.version,
    remoteUpdatedAt: input.remoteUpdatedAt,
    installedAt: new Date().toISOString(),
    skillScope: input.skillScope,
    projectPath: input.projectPath ? path.resolve(input.projectPath) : undefined
  };
  await saveStore(store);
}

function syncInstallKey(input: {
  registryUrl: string;
  type: 'skill' | 'profile';
  id: string;
  skillScope?: SkillScope;
  projectPath?: string;
}) {
  if (input.type === 'profile') {
    return `${normalizeRegistryUrl(input.registryUrl)}::profile::${input.id}`;
  }
  const scopeKey = input.skillScope === 'project'
    ? `project:${input.projectPath ? path.resolve(input.projectPath).toLowerCase() : ''}`
    : 'global';
  return `${normalizeRegistryUrl(input.registryUrl)}::skill::${scopeKey}::${input.id}`;
}

function normalizeRegistryUrl(value: string) {
  return value.trim();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchUrl(url);
  return await response.json() as T;
}

async function fetchTextRequired(url: string | undefined, label: string) {
  if (!url) {
    throw new Error(`${label} missing content or URL`);
  }
  return fetchTextOptional(url) as Promise<string>;
}

async function fetchTextOptional(url: string | undefined) {
  if (!url) {
    return undefined;
  }
  const response = await fetchUrl(url);
  return response.text();
}

async function fetchUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http/https registry URLs are supported');
  }
  const response = await fetch(parsed);
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}: ${url}`);
  }
  return response;
}
