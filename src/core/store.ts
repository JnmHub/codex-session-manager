import fs from 'node:fs/promises';
import path from 'node:path';
import {getStoreFile} from './paths.js';
import type {AppSettings, SessionMeta, SessionRecord, StoreData} from '../types.js';

export const defaultSettings: AppSettings = {
  yoloDefault: true,
  llm: {
    enabled: true,
    provider: 'custom',
    model: 'gpt-5.5',
    baseUrl: 'http://127.0.0.1:48760/v1',
    apiKeySource: 'codex-auth',
    apiKeyEnv: 'OPENAI_API_KEY'
  }
};

export async function loadStore(): Promise<StoreData> {
  const file = getStoreFile();
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    return normalizeStore(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }

    return normalizeStore({});
  }
}

export async function saveStore(store: StoreData) {
  const file = getStoreFile();
  await fs.mkdir(path.dirname(file), {recursive: true});
  const next = {
    ...store,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

export function mergeSession(existing: SessionRecord | undefined, meta: SessionMeta): SessionRecord {
  return {
    ...meta,
    note: existing?.note,
    category: existing?.category,
    tags: existing?.tags ?? [],
    archived: existing?.archived ?? false,
    favorite: existing?.favorite ?? false,
    boundPath: existing?.boundPath,
    profile: existing?.profile,
    yolo: existing?.yolo,
    launchArgs: existing?.launchArgs
  };
}

export function normalizeStore(parsed: Partial<StoreData>): StoreData {
  return {
    version: 2,
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    sessions: parsed.sessions ?? {},
    settings: {
      ...defaultSettings,
      ...(parsed.settings ?? {}),
      llm: {
        ...defaultSettings.llm,
        ...(parsed.settings?.llm ?? {})
      }
    },
    profiles: parsed.profiles ?? {},
    transcriptEdits: parsed.transcriptEdits ?? {},
    syncInstalls: parsed.syncInstalls ?? {},
    llmConversations: Object.fromEntries(
      Object.entries(parsed.llmConversations ?? {}).map(([id, conversation]) => [
        id,
        {
          ...conversation,
          permissionLevel: conversation.permissionLevel === 'dangerous' ? 'dangerous' : 'normal',
          messages: (conversation.messages ?? []).map(message => ({
            ...message,
            text: message.text === '我可以在会话管家范围内帮你查找、归档、备注、绑定路径、设置 Profile/yolo、读取聊天记录和打开会话。'
              ? '我是 Jnm 小助手，我可以在 Codex会话管家范围内帮你查找、归档、备注、绑定路径、设置 Profile/yolo、读取聊天记录和打开会话。'
              : message.text
          }))
        }
      ])
    )
  };
}
