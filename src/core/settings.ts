import fs from 'node:fs/promises';
import path from 'node:path';
import {getCodexHome} from './paths.js';
import {defaultSettings, loadStore, saveStore} from './store.js';
import type {AppSettings} from '../types.js';

type CodexProviderInfo = {
  provider: string;
  model: string;
  baseUrl: string;
  wireApi?: string;
  hasAuthKey: boolean;
};

export async function getSettings() {
  const store = await loadStore();
  const codex = await readCodexProviderInfo();
  return {
    ...store.settings,
    llm: {
      ...store.settings.llm,
      provider: preferStoredSetting(store.settings.llm.provider, codex.provider, defaultSettings.llm.provider),
      model: preferStoredSetting(store.settings.llm.model, codex.model, defaultSettings.llm.model),
      baseUrl: preferStoredSetting(store.settings.llm.baseUrl, codex.baseUrl, defaultSettings.llm.baseUrl),
      manualApiKey: '',
      hasKey: await hasConfiguredApiKey(store.settings)
    },
    codex
  };
}

export async function updateSettings(next: Partial<AppSettings>) {
  const store = await loadStore();
  store.settings = {
    ...store.settings,
    globalProfile: typeof next.globalProfile === 'string' ? next.globalProfile : store.settings.globalProfile,
    yoloDefault: typeof next.yoloDefault === 'boolean' ? next.yoloDefault : store.settings.yoloDefault,
    llm: {
      ...store.settings.llm,
      ...sanitizeLlmSettings(next.llm)
    }
  };
  await saveStore(store);
  return getSettings();
}

export async function readCodexProviderInfo(): Promise<CodexProviderInfo> {
  const config = await readTextSafe(path.join(getCodexHome(), 'config.toml'));
  const auth = await readJsonSafe(path.join(getCodexHome(), 'auth.json'));
  const provider = readTomlString(config, 'model_provider') || defaultSettings.llm.provider;
  const model = readTomlString(config, 'model') || defaultSettings.llm.model;
  const providerBlock = readTomlBlock(config, `model_providers.${provider}`);
  const baseUrl =
    readTomlString(providerBlock, 'base_url') ||
    readTomlString(config, 'base_url') ||
    defaultSettings.llm.baseUrl;

  return {
    provider,
    model,
    baseUrl,
    wireApi: readTomlString(providerBlock, 'wire_api'),
    hasAuthKey: typeof auth?.OPENAI_API_KEY === 'string' && auth.OPENAI_API_KEY.length > 0
  };
}

export async function resolveApiKey(settings?: AppSettings) {
  const active = settings ?? (await loadStore()).settings;

  if (active.llm.apiKeySource === 'manual' && active.llm.manualApiKey) {
    return active.llm.manualApiKey;
  }

  if (active.llm.apiKeySource === 'environment') {
    return process.env[active.llm.apiKeyEnv || 'OPENAI_API_KEY'];
  }

  const auth = await readJsonSafe(path.join(getCodexHome(), 'auth.json'));
  return typeof auth?.OPENAI_API_KEY === 'string' ? auth.OPENAI_API_KEY : undefined;
}

export async function hasConfiguredApiKey(settings?: AppSettings) {
  return Boolean(await resolveApiKey(settings));
}

async function readTextSafe(file: string) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return '';
  }
}

async function readJsonSafe(file: string) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function readTomlString(source: string, key: string) {
  const match = source.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]*)"`, 'm'));
  return match?.[1];
}

function readTomlBlock(source: string, name: string) {
  const start = source.indexOf(`[${name}]`);
  if (start < 0) {
    return '';
  }

  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n\[[^\]]+\]/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function preferStoredSetting(stored: string | undefined, codexValue: string, defaultValue: string) {
  if (!stored || stored === defaultValue) {
    return codexValue;
  }

  return stored;
}

function sanitizeLlmSettings(llm: Partial<AppSettings['llm']> | undefined) {
  if (!llm) {
    return {};
  }

  return removeUndefined({
    enabled: typeof llm.enabled === 'boolean' ? llm.enabled : undefined,
    provider: typeof llm.provider === 'string' ? llm.provider : undefined,
    model: typeof llm.model === 'string' ? llm.model : undefined,
    baseUrl: typeof llm.baseUrl === 'string' ? llm.baseUrl : undefined,
    apiKeySource: isApiKeySource(llm.apiKeySource) ? llm.apiKeySource : undefined,
    apiKeyEnv: typeof llm.apiKeyEnv === 'string' ? llm.apiKeyEnv : undefined,
    manualApiKey: typeof llm.manualApiKey === 'string' ? llm.manualApiKey : undefined
  });
}

function isApiKeySource(value: unknown): value is AppSettings['llm']['apiKeySource'] {
  return value === 'codex-auth' || value === 'environment' || value === 'manual';
}

function removeUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
