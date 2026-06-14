import {readJsonl} from './jsonl.js';
import {getSession} from './sessions.js';
import {loadStore, saveStore} from './store.js';
import type {TranscriptMessage} from '../types.js';

type JsonlRow = {
  timestamp?: string;
  type?: string;
  payload?: any;
};

export async function getTranscript(idOrPrefix: string) {
  const session = await getSession(idOrPrefix);
  const original = await readTranscriptFileSafe(session.filePath);
  const store = await loadStore();
  const edited = store.transcriptEdits[session.id];
  return {
    sessionId: session.id,
    original,
    messages: edited?.length ? edited : original,
    edited: Boolean(edited?.length)
  };
}

async function readTranscriptFileSafe(filePath: string) {
  try {
    return await readTranscriptFile(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'EPERM' || code === 'EACCES') {
      return [];
    }
    throw error;
  }
}

export async function saveTranscriptEdits(idOrPrefix: string, messages: TranscriptMessage[]) {
  const session = await getSession(idOrPrefix);
  const store = await loadStore();
  store.transcriptEdits[session.id] = messages.map((message, index) => ({
    ...message,
    id: message.id || `edited-${index + 1}`,
    source: 'edited'
  }));
  await saveStore(store);
  return getTranscript(session.id);
}

export async function resetTranscriptEdits(idOrPrefix: string) {
  const session = await getSession(idOrPrefix);
  const store = await loadStore();
  delete store.transcriptEdits[session.id];
  await saveStore(store);
  return getTranscript(session.id);
}

async function readTranscriptFile(filePath: string) {
  const messages: TranscriptMessage[] = [];

  await readJsonl<JsonlRow>(filePath, (row, line) => {
    const extracted = extractMessage(row, line);
    if (extracted) {
      messages.push(extracted);
    }
  });

  return messages;
}

function extractMessage(row: JsonlRow, line: number): TranscriptMessage | undefined {
  if (row.type === 'response_item' && row.payload?.type === 'message') {
    return {
      id: `line-${line}`,
      role: normalizeRole(row.payload.role),
      text: extractContentText(row.payload.content),
      timestamp: row.timestamp,
      source: 'original',
      line
    };
  }

  if (row.type === 'event_msg' && row.payload?.type === 'user_message') {
    return {
      id: `line-${line}`,
      role: 'user',
      text: String(row.payload.message ?? ''),
      timestamp: row.timestamp,
      source: 'original',
      line
    };
  }

  if (row.type === 'event_msg' && row.payload?.type === 'agent_message') {
    return {
      id: `line-${line}`,
      role: 'assistant',
      text: String(row.payload.message ?? ''),
      timestamp: row.timestamp,
      source: 'original',
      line
    };
  }

  return undefined;
}

function normalizeRole(role: unknown): TranscriptMessage['role'] {
  return role === 'user' || role === 'assistant' || role === 'system' || role === 'tool'
    ? role
    : 'unknown';
}

function extractContentText(content: unknown) {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map(item => {
      if (!item || typeof item !== 'object') {
        return '';
      }
      const record = item as Record<string, unknown>;
      return String(record.text ?? '');
    })
    .filter(Boolean)
    .join('\n');
}
