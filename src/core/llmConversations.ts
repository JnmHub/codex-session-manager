import {randomUUID} from 'node:crypto';
import {loadStore, saveStore} from './store.js';
import type {LlmConversation, LlmConversationMessage} from '../types.js';

export async function listLlmConversations() {
  const store = await loadStore();
  return Object.values(store.llmConversations)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      return a.order - b.order || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    })
    .map(conversation => ({
      ...conversation,
      messages: undefined,
      messageCount: conversation.messages.length,
      lastMessage: conversation.messages.at(-1)?.text
    }));
}

export async function getLlmConversation(id: string) {
  const store = await loadStore();
  const conversation = store.llmConversations[id];
  if (!conversation) {
    throw new Error(`LLM conversation not found: ${id}`);
  }
  return conversation;
}

export async function createLlmConversation(input: Partial<Pick<LlmConversation, 'title' | 'category' | 'maxContext'>> = {}) {
  const store = await loadStore();
  const now = new Date().toISOString();
  const order = Math.max(0, ...Object.values(store.llmConversations).map(item => item.order)) + 1;
  const conversation: LlmConversation = {
    id: randomUUID(),
    title: input.title?.trim() || '新聊天',
    category: input.category?.trim() || undefined,
    pinned: false,
    order,
    maxContext: normalizeMaxContext(input.maxContext),
    permissionLevel: 'normal',
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: randomUUID(),
        role: 'assistant',
        text: '我可以在会话管家范围内帮你查找、归档、备注、绑定路径、设置 Profile/yolo、读取聊天记录和打开会话。',
        createdAt: now
      }
    ]
  };
  store.llmConversations[conversation.id] = conversation;
  await saveStore(store);
  return conversation;
}

export async function ensureLlmConversation(id?: string) {
  if (id) {
    return getLlmConversation(id);
  }
  return createLlmConversation();
}

export async function updateLlmConversation(
  id: string,
  input: Partial<Pick<LlmConversation, 'title' | 'category' | 'pinned' | 'maxContext' | 'permissionLevel'>>
) {
  const store = await loadStore();
  const conversation = store.llmConversations[id];
  if (!conversation) {
    throw new Error(`LLM conversation not found: ${id}`);
  }

  store.llmConversations[id] = {
    ...conversation,
    title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : conversation.title,
    category: typeof input.category === 'string' ? input.category.trim() || undefined : conversation.category,
    pinned: typeof input.pinned === 'boolean' ? input.pinned : conversation.pinned,
    maxContext: input.maxContext === undefined ? conversation.maxContext : normalizeMaxContext(input.maxContext),
    permissionLevel: input.permissionLevel === 'dangerous' || input.permissionLevel === 'normal'
      ? input.permissionLevel
      : conversation.permissionLevel,
    updatedAt: new Date().toISOString()
  };
  await saveStore(store);
  return store.llmConversations[id];
}

export async function deleteLlmConversation(id: string) {
  const store = await loadStore();
  delete store.llmConversations[id];
  await saveStore(store);
  return {ok: true};
}

export async function reorderLlmConversations(ids: string[]) {
  const store = await loadStore();
  ids.forEach((id, index) => {
    if (store.llmConversations[id]) {
      store.llmConversations[id].order = index + 1;
      store.llmConversations[id].updatedAt = new Date().toISOString();
    }
  });
  await saveStore(store);
  return listLlmConversations();
}

export async function appendLlmMessages(id: string, messages: LlmConversationMessage[]) {
  const store = await loadStore();
  const conversation = store.llmConversations[id];
  if (!conversation) {
    throw new Error(`LLM conversation not found: ${id}`);
  }

  const nextMessages = [...conversation.messages, ...messages];
  const firstUser = nextMessages.find(message => message.role === 'user');
  store.llmConversations[id] = {
    ...conversation,
    title: conversation.title === '新聊天' && firstUser ? titleFromText(firstUser.text) : conversation.title,
    messages: nextMessages,
    updatedAt: new Date().toISOString()
  };
  await saveStore(store);
  return store.llmConversations[id];
}

export function buildContextMessages(conversation: LlmConversation) {
  return conversation.messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .slice(-conversation.maxContext)
    .map(message => ({
      role: message.role,
      text: message.text
    }));
}

function normalizeMaxContext(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(50, Math.max(4, Math.floor(value)))
    : 12;
}

function titleFromText(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 22 ? `${normalized.slice(0, 22)}...` : normalized || '新聊天';
}
