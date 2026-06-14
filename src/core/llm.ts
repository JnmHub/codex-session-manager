import {randomUUID} from 'node:crypto';
import {launchSessionWithDefaults} from './launcher.js';
import {getCodexFile, saveCodexFile} from './codexFiles.js';
import {appendLlmMessages, buildContextMessages, ensureLlmConversation} from './llmConversations.js';
import {deleteProfile, getProfileFiles, listProfiles, saveProfileFiles, upsertProfile} from './profiles.js';
import {scanSessions} from './scanner.js';
import {closeSessionWindow, getSessionWindowStatus, reopenSessionWindow} from './sessionWindows.js';
import {
  getSession,
  listProjects,
  listSessions,
  setBoundPath,
  setNote,
  setSessionLaunchOptions,
  toggleArchived,
  toggleFavorite
} from './sessions.js';
import {getSettings, resolveApiKey, updateSettings} from './settings.js';
import {getTranscript, resetTranscriptEdits, saveTranscriptEdits} from './transcript.js';
import type {AppSettings, LlmPermissionLevel, SessionRecord, TranscriptMessage} from '../types.js';

type LlmChatMessage = {
  role: 'user' | 'assistant' | 'system';
  text: string;
};

type LlmAction = {
  tool: string;
  args?: Record<string, unknown>;
};

type LlmActionResult = {
  tool: string;
  ok: boolean;
  summary: string;
  data?: unknown;
};

type StreamCallbacks = {
  onMeta?: (data: unknown) => void;
  onDelta?: (text: string) => void;
  onActions?: (actions: LlmActionResult[]) => void;
  onDone?: (data: unknown) => void;
};

const dangerousTools = new Set([
  'openSession',
  'closeSessionWindow',
  'reopenSessionWindow',
  'setNote',
  'bindPath',
  'setSessionOptions',
  'toggleFavorite',
  'toggleArchived',
  'upsertProfile',
  'deleteProfile',
  'updateSettings',
  'saveProfileFiles',
  'saveCodexFile',
  'saveTranscriptEdits',
  'resetTranscriptEdits'
]);

export async function runLlmTask(input: {task: string; text: string; instruction?: string}) {
  const settings = await getSettings();
  const apiKey = await resolveApiKey();
  if (!settings.llm.enabled) {
    throw new Error('LLM is disabled in settings');
  }
  if (!apiKey) {
    throw new Error('LLM API key is not configured');
  }

  const prompt = buildPrompt(input);
  const response = await fetch(`${settings.llm.baseUrl.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: settings.llm.model,
      input: prompt
    })
  });

  const data = await readLlmResponse(response);
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || 'LLM request failed');
  }

  return {
    text: extractResponseText(data),
    rawType: data?.object || data?.type || 'response'
  };
}

export async function runLlmChat(input: {messages: LlmChatMessage[]; permissionLevel?: LlmPermissionLevel}) {
  const settings = await getSettings();
  const apiKey = await resolveApiKey();
  if (!settings.llm.enabled) {
    throw new Error('LLM is disabled in settings');
  }
  if (!apiKey) {
    throw new Error('LLM API key is not configured');
  }

  const permissionLevel = input.permissionLevel ?? 'normal';
  const prompt = await buildChatPrompt(input.messages, permissionLevel);
  const response = await fetch(`${settings.llm.baseUrl.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(buildResponsesPayload(settings, prompt, false))
  });

  const data = await readLlmResponse(response);
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || 'LLM request failed');
  }

  const rawText = extractResponseText(data);
  const parsed = parseAssistantJson(rawText);
  const actions = Array.isArray(parsed?.actions) ? parsed.actions.slice(0, 6) : [];
  const actionResults: LlmActionResult[] = [];

  for (const action of actions) {
    actionResults.push(await executeToolAction(action, permissionLevel));
  }

  return {
    message: {
      role: 'assistant',
      text: typeof parsed?.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : rawText
    },
    actions: actionResults
  };
}

export async function runManagedLlmChat(input: {conversationId?: string; text: string; permissionLevel?: LlmPermissionLevel}) {
  const conversation = await ensureLlmConversation(input.conversationId);
  const permissionLevel = input.permissionLevel ?? conversation.permissionLevel;
  const now = new Date().toISOString();
  const userMessage = {
    id: randomUUID(),
    role: 'user' as const,
    text: input.text,
    createdAt: now
  };
  const withUser = await appendLlmMessages(conversation.id, [userMessage]);
  const result = await runLlmChat({messages: buildContextMessages(withUser), permissionLevel});
  const assistantMessage = {
    id: randomUUID(),
    role: 'assistant' as const,
    text: result.message.text,
    createdAt: new Date().toISOString(),
    actions: result.actions
  };
  const saved = await appendLlmMessages(conversation.id, [assistantMessage]);
  return {
    conversation: saved,
    message: assistantMessage,
    actions: result.actions
  };
}

export async function runManagedLlmChatStream(input: {
  conversationId?: string;
  text: string;
  permissionLevel?: LlmPermissionLevel;
}, callbacks: StreamCallbacks) {
  const conversation = await ensureLlmConversation(input.conversationId);
  const permissionLevel = input.permissionLevel ?? conversation.permissionLevel;
  const now = new Date().toISOString();
  const userMessage = {
    id: randomUUID(),
    role: 'user' as const,
    text: input.text,
    createdAt: now
  };
  const withUser = await appendLlmMessages(conversation.id, [userMessage]);
  callbacks.onMeta?.({conversationId: conversation.id, userMessage});

  const result = await streamLlmChat({
    messages: buildContextMessages(withUser),
    permissionLevel,
    onDelta: callbacks.onDelta
  });
  const assistantMessage = {
    id: randomUUID(),
    role: 'assistant' as const,
    text: result.message.text,
    createdAt: new Date().toISOString(),
    actions: result.actions
  };
  const saved = await appendLlmMessages(conversation.id, [assistantMessage]);
  callbacks.onActions?.(result.actions);
  callbacks.onDone?.({
    conversation: saved,
    message: assistantMessage,
    actions: result.actions
  });
  return {
    conversation: saved,
    message: assistantMessage,
    actions: result.actions
  };
}

function buildPrompt(input: {task: string; text: string; instruction?: string}) {
  const instruction = input.instruction?.trim() || defaultInstruction(input.task);
  return `${instruction}\n\n---\n${input.text}`;
}

function defaultInstruction(task: string) {
  if (task === 'rewrite-profile') {
    return '请基于以下内容改写为简洁、明确、适合 Codex CLI profile 的中文配置说明，只输出改写结果。';
  }
  if (task === 'rewrite-transcript') {
    return '请在不改变事实含义的前提下整理和改写以下聊天记录，只输出改写后的内容。';
  }
  return '请根据用户输入完成改写，只输出结果。';
}

async function buildChatPrompt(messages: LlmChatMessage[], permissionLevel: LlmPermissionLevel) {
  const [profiles, sessions, projects, settings] = await Promise.all([
    listProfiles(),
    listSessions({all: true, limit: 20}),
    listProjects(),
    getSettings()
  ]);

  const context = {
    product: '会话管家',
    permissionLevel,
    limits: permissionLevel === 'dangerous'
      ? '危险权限：可以调用本工具暴露的任意读写动作，包括保存配置、编辑聊天记录副本、关闭/重开会话窗口。仍然不能执行任意 shell、访问任意 URL 或修改 Codex 原始 jsonl。'
      : '正常权限：只能读取、查询和生成 dry-run 命令。不能写入配置、修改记录、真实打开会话、关闭窗口或重开窗口。',
    settings: {
      globalProfile: settings.globalProfile,
      yoloDefault: settings.yoloDefault,
      llm: {
        enabled: settings.llm.enabled,
        provider: settings.llm.provider,
        model: settings.llm.model,
        baseUrl: settings.llm.baseUrl,
        apiKeySource: settings.llm.apiKeySource,
        hasKey: settings.llm.hasKey
      }
    },
    profiles: profiles.map(profile => ({
      id: profile.id,
      name: profile.name,
      note: profile.note,
      commandArgs: profile.commandArgs
    })),
    projects: projects.slice(0, 20),
    recentSessions: sessions.map(session => compactSession(session))
  };

  return [
    '你是“会话管家”的内置助手。你要用中文回答，帮助用户管理 Codex CLI 历史会话。',
    '你具有上下文记忆：下面会给出最近聊天记录、本工具状态和可调用动作。',
    `当前权限等级：${permissionLevel === 'dangerous' ? '危险' : '正常'}。`,
    '权限边界：你只能建议或调用下列白名单动作。不要声称能访问本工具之外的文件、网络、系统命令或 Codex 内部未暴露能力。',
    '当需要执行动作时，只输出严格 JSON，不要 Markdown，不要代码块。reply 字段必须是给用户看的自然中文，不要把 JSON 当成用户可读内容解释。',
    '输出格式：{"reply":"给用户看的中文回复","actions":[{"tool":"工具名","args":{}}]}。',
    '如果不需要执行动作，actions 输出空数组。',
    '',
    '可用工具：',
    '- scanSessions {}：重新扫描 Codex 会话。',
    '- listSessions {query?, status?, limit?}：查询会话。status 可为 all, active, archived, favorite, missing。',
    '- openSession {id, dryRun?, profile?, yolo?}：打开会话；dryRun=true 只返回命令。',
    '- getSessionWindow {id}：检查某个会话窗口是否已打开。',
    '- closeSessionWindow {id}：关闭某个会话对应的 PowerShell 窗口。危险权限。',
    '- reopenSessionWindow {id, profile?, yolo?}：关闭并重开某个会话窗口。危险权限。',
    '- setNote {id, note}：设置会话备注。',
    '- bindPath {id, path}：重新绑定会话工作目录。',
    '- setSessionOptions {id, profile?, yolo?}：设置单会话 Profile/yolo。',
    '- toggleFavorite {id}：切换收藏。',
    '- toggleArchived {id}：切换归档。',
    '- listProjects {}：列出项目。',
    '- listProfiles {}：列出 Profile。',
    '- upsertProfile {id?, name, note?, commandArgs?}：新增或更新本工具 Profile 备注。',
    '- deleteProfile {id}：删除本工具创建的 Profile 记录。',
    '- updateSettings {globalProfile?, yoloDefault?}：更新全局 Profile/yolo 默认值。',
    '- getTranscript {id}：读取某个会话可解析的聊天记录。',
    '- saveTranscriptEdits {id, messages}：保存某个会话的聊天记录编辑副本。危险权限，只修改本工具副本。',
    '- resetTranscriptEdits {id}：删除某个会话的聊天记录编辑副本并回到原始记录。危险权限。',
    '- getProfileFiles {id}：读取 Profile 对应的 config toml 和 Markdown。',
    '- saveProfileFiles {id, configContent?, markdownContent?}：保存 Profile 对应的 config toml 和 Markdown。',
    '- getCodexFile {name}：读取 Codex 主配置文件。name 只能是 config.toml 或 auth.json。',
    '- saveCodexFile {name, content}：保存 Codex 主配置文件。name 只能是 config.toml 或 auth.json。',
    '',
    '当前工具状态 JSON：',
    JSON.stringify(context, null, 2),
    '',
    '最近对话：',
    ...messages.slice(-12).map(message => `${message.role}: ${message.text}`),
    '',
    '现在请根据最后一条用户消息回复。'
  ].join('\n');
}

function compactSession(session: SessionRecord) {
  return {
    id: session.id,
    shortId: session.id.slice(0, 8),
    summary: session.summary,
    note: session.note,
    cwd: session.cwd,
    boundPath: session.boundPath,
    archived: session.archived,
    favorite: session.favorite,
    profile: session.profile,
    yolo: session.yolo,
    updatedAt: session.updatedAt
  };
}

function parseAssistantJson(text: string) {
  try {
    return JSON.parse(text) as {reply?: unknown; actions?: LlmAction[]};
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as {reply?: unknown; actions?: LlmAction[]};
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

async function streamLlmChat(input: {
  messages: LlmChatMessage[];
  permissionLevel: LlmPermissionLevel;
  onDelta?: (text: string) => void;
}) {
  const settings = await getSettings();
  const apiKey = await resolveApiKey();
  if (!settings.llm.enabled) {
    throw new Error('LLM is disabled in settings');
  }
  if (!apiKey) {
    throw new Error('LLM API key is not configured');
  }

  const prompt = await buildChatPrompt(input.messages, input.permissionLevel);
  const response = await fetch(`${settings.llm.baseUrl.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(buildResponsesPayload(settings, prompt, true))
  });

  if (!response.ok) {
    const data = await readLlmResponse(response);
    throw new Error(data?.error?.message || data?.message || 'LLM request failed');
  }

  const rawText = await readLlmResponseStream(response, input.onDelta);
  const parsed = parseAssistantJson(rawText);
  const actions = Array.isArray(parsed?.actions) ? parsed.actions.slice(0, 6) : [];
  const actionResults: LlmActionResult[] = [];
  for (const action of actions) {
    actionResults.push(await executeToolAction(action, input.permissionLevel));
  }

  return {
    message: {
      role: 'assistant',
      text: typeof parsed?.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : rawText
    },
    actions: actionResults
  };
}

async function executeToolAction(action: LlmAction, permissionLevel: LlmPermissionLevel): Promise<LlmActionResult> {
  try {
    const args = action.args ?? {};
    if (permissionLevel !== 'dangerous' && dangerousTools.has(action.tool)) {
      if (action.tool === 'openSession' && booleanArg(args.dryRun) === true) {
        // Dry-run only returns a command string and does not launch a shell.
      } else {
        return fail(action.tool, `当前为正常权限，已拒绝危险动作：${action.tool}`);
      }
    }

    switch (action.tool) {
      case 'scanSessions': {
        const sessions = await scanSessions();
        return ok(action.tool, `已扫描 ${sessions.length} 个会话。`, {count: sessions.length});
      }
      case 'listSessions': {
        const sessions = await listSessions({
          all: true,
          query: stringArg(args.query),
          limit: numberArg(args.limit) ?? 20
        });
        const filtered = await filterSessionsByStatus(sessions, stringArg(args.status));
        return ok(action.tool, `找到 ${filtered.length} 个会话。`, filtered.slice(0, 20).map(compactSession));
      }
      case 'openSession': {
        const session = await getSession(requiredString(args.id, 'id'));
        const command = await launchSessionWithDefaults(session, {
          dryRun: booleanArg(args.dryRun) ?? false,
          profile: stringArg(args.profile),
          yolo: booleanArg(args.yolo)
        });
        return ok(action.tool, booleanArg(args.dryRun) ? '已生成打开命令。' : '已发送打开会话请求。', {command});
      }
      case 'getSessionWindow': {
        const status = await getSessionWindowStatus(requiredString(args.id, 'id'));
        return ok(action.tool, status.open ? '会话窗口正在打开。' : '未检测到会话窗口。', {
          id: status.id,
          open: status.open,
          processes: status.processes.map(process => ({
            pid: process.pid,
            name: process.name,
            title: process.title
          }))
        });
      }
      case 'closeSessionWindow': {
        const result = await closeSessionWindow(requiredString(args.id, 'id'));
        return ok(action.tool, `已关闭 ${result.closed} 个会话窗口进程。`, {
          id: result.id,
          closed: result.closed
        });
      }
      case 'reopenSessionWindow': {
        const result = await reopenSessionWindow(requiredString(args.id, 'id'), {
          profile: stringArg(args.profile),
          yolo: booleanArg(args.yolo)
        });
        return ok(action.tool, `已关闭 ${result.closed} 个旧窗口并重新打开会话。`, result);
      }
      case 'setNote': {
        const session = await setNote(requiredString(args.id, 'id'), requiredString(args.note, 'note'));
        return ok(action.tool, `已更新 ${session.id.slice(0, 8)} 的备注。`, compactSession(session));
      }
      case 'bindPath': {
        const session = await setBoundPath(requiredString(args.id, 'id'), requiredString(args.path, 'path'));
        return ok(action.tool, `已绑定 ${session.id.slice(0, 8)} 的路径。`, compactSession(session));
      }
      case 'setSessionOptions': {
        const session = await setSessionLaunchOptions(requiredString(args.id, 'id'), {
          profile: typeof args.profile === 'string' ? args.profile || null : undefined,
          yolo: typeof args.yolo === 'boolean' ? args.yolo : undefined
        });
        return ok(action.tool, `已更新 ${session.id.slice(0, 8)} 的会话配置。`, compactSession(session));
      }
      case 'toggleFavorite': {
        const session = await toggleFavorite(requiredString(args.id, 'id'));
        return ok(action.tool, session.favorite ? '已收藏会话。' : '已取消收藏会话。', compactSession(session));
      }
      case 'toggleArchived': {
        const session = await toggleArchived(requiredString(args.id, 'id'));
        return ok(action.tool, session.archived ? '已归档会话。' : '已取消归档会话。', compactSession(session));
      }
      case 'listProjects': {
        const projects = await listProjects();
        return ok(action.tool, `找到 ${projects.length} 个项目。`, projects.slice(0, 30));
      }
      case 'listProfiles': {
        const profiles = await listProfiles();
        return ok(action.tool, `找到 ${profiles.length} 个 Profile。`, profiles);
      }
      case 'upsertProfile': {
        const profile = await upsertProfile({
          id: stringArg(args.id),
          name: requiredString(args.name, 'name'),
          note: stringArg(args.note),
          commandArgs: stringArg(args.commandArgs)
        });
        return ok(action.tool, `已保存 Profile ${profile.name}。`, profile);
      }
      case 'deleteProfile': {
        const result = await deleteProfile(requiredString(args.id, 'id'));
        return ok(action.tool, '已删除 Profile 记录。', result);
      }
      case 'updateSettings': {
        const payload: Partial<AppSettings> = {};
        if (typeof args.globalProfile === 'string') {
          payload.globalProfile = args.globalProfile;
        }
        if (typeof args.yoloDefault === 'boolean') {
          payload.yoloDefault = args.yoloDefault;
        }
        const settings = await updateSettings(payload);
        return ok(action.tool, '已更新全局设置。', {
          globalProfile: settings.globalProfile,
          yoloDefault: settings.yoloDefault
        });
      }
      case 'getTranscript': {
        const transcript = await getTranscript(requiredString(args.id, 'id'));
        return ok(action.tool, `读取到 ${transcript.messages.length} 条聊天记录。`, {
          sessionId: transcript.sessionId,
          edited: transcript.edited,
          messages: transcript.messages.slice(0, 30)
        });
      }
      case 'saveTranscriptEdits': {
        const messages = Array.isArray(args.messages) ? args.messages as TranscriptMessage[] : [];
        const transcript = await saveTranscriptEdits(requiredString(args.id, 'id'), messages);
        return ok(action.tool, `已保存 ${transcript.messages.length} 条聊天记录编辑副本。`, {
          sessionId: transcript.sessionId,
          edited: transcript.edited,
          count: transcript.messages.length
        });
      }
      case 'resetTranscriptEdits': {
        const transcript = await resetTranscriptEdits(requiredString(args.id, 'id'));
        return ok(action.tool, '已还原为原始聊天记录。', {
          sessionId: transcript.sessionId,
          edited: transcript.edited,
          count: transcript.messages.length
        });
      }
      case 'getProfileFiles': {
        const files = await getProfileFiles(requiredString(args.id, 'id'));
        return ok(action.tool, `已读取 Profile ${files.profile.name} 的文件。`, files);
      }
      case 'saveProfileFiles': {
        const files = await saveProfileFiles({
          id: requiredString(args.id, 'id'),
          configContent: typeof args.configContent === 'string' ? args.configContent : undefined,
          markdownContent: typeof args.markdownContent === 'string' ? args.markdownContent : undefined
        });
        return ok(action.tool, `已保存 Profile ${files.profile.name} 的文件。`, {
          profile: files.profile,
          config: {path: files.config.path, exists: files.config.exists},
          markdown: {path: files.markdown.path, exists: files.markdown.exists}
        });
      }
      case 'getCodexFile': {
        const file = await getCodexFile(requiredString(args.name, 'name'));
        return ok(action.tool, `已读取 ${file.name}。`, {
          ...file,
          content: file.name === 'auth.json' ? maskAuthContent(file.content) : file.content
        });
      }
      case 'saveCodexFile': {
        const file = await saveCodexFile(requiredString(args.name, 'name'), requiredString(args.content, 'content'));
        return ok(action.tool, `已保存 ${file.name}。`, {
          name: file.name,
          path: file.path,
          updatedAt: file.updatedAt
        });
      }
      default:
        return fail(action.tool, `工具不在白名单内：${action.tool}`);
    }
  } catch (error) {
    return fail(action.tool, error instanceof Error ? error.message : String(error));
  }
}

async function filterSessionsByStatus(sessions: SessionRecord[], status?: string) {
  if (!status || status === 'all') {
    return sessions;
  }

  if (status === 'active') {
    return sessions.filter(session => !session.archived);
  }
  if (status === 'archived') {
    return sessions.filter(session => session.archived);
  }
  if (status === 'favorite') {
    return sessions.filter(session => session.favorite);
  }
  if (status === 'missing') {
    const projects = await listProjects();
    const missing = new Set(projects.filter(project => project.missing).map(project => project.path));
    return sessions.filter(session => missing.has(session.boundPath || session.cwd));
  }

  return sessions;
}

function ok(tool: string, summary: string, data?: unknown): LlmActionResult {
  return {tool, ok: true, summary, data};
}

function fail(tool: string, summary: string): LlmActionResult {
  return {tool, ok: false, summary};
}

function stringArg(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberArg(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanArg(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required action field: ${field}`);
  }

  return value;
}

function maskAuthContent(content: string) {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    for (const key of Object.keys(parsed)) {
      if (/key|token|secret/i.test(key) && typeof parsed[key] === 'string') {
        const value = parsed[key] as string;
        parsed[key] = value.length <= 8 ? '***' : `${value.slice(0, 4)}***${value.slice(-4)}`;
      }
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return '';
  }
}

function buildResponsesPayload(settings: AppSettings, input: string, stream: boolean) {
  return {
    model: settings.llm.model,
    input,
    ...(stream ? {stream: true} : {})
  };
}

function extractResponseText(data: any) {
  if (typeof data?.output_text === 'string') {
    return data.output_text;
  }

  const chunks: string[] = [];
  for (const item of data?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === 'string') {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join('\n').trim();
}

async function readLlmResponseStream(response: Response, onDelta?: (text: string) => void) {
  if (!response.body) {
    const data = await readLlmResponse(response);
    const text = extractResponseText(data);
    onDelta?.(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let rawText = '';
  let visibleText = '';

  while (true) {
    const {done, value} = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, {stream: true});
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      for (const delta of parseSseDeltaBlock(part)) {
        rawText += delta;
        const nextVisible = extractVisibleReply(rawText);
        const emitted = nextVisible !== undefined ? nextVisible : shouldHoldRawStream(rawText) ? visibleText : rawText;
        if (emitted.length > visibleText.length) {
          const nextDelta = emitted.slice(visibleText.length);
          visibleText = emitted;
          onDelta?.(nextDelta);
        }
      }
    }
  }

  if (buffer.trim()) {
    for (const delta of parseSseDeltaBlock(buffer)) {
      rawText += delta;
      const nextVisible = extractVisibleReply(rawText);
      const emitted = nextVisible !== undefined ? nextVisible : shouldHoldRawStream(rawText) ? visibleText : rawText;
      if (emitted.length > visibleText.length) {
        const nextDelta = emitted.slice(visibleText.length);
        visibleText = emitted;
        onDelta?.(nextDelta);
      }
    }
  }

  return rawText.trim();
}

function shouldHoldRawStream(rawText: string) {
  const trimmed = rawText.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('```json') || trimmed.startsWith('```');
}

function parseSseDeltaBlock(block: string) {
  const deltas: string[] = [];
  let currentEvent = '';

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.startsWith('event:')) {
      currentEvent = line.slice('event:'.length).trim();
      continue;
    }
    if (!line.startsWith('data:')) {
      continue;
    }

    const payload = line.slice('data:'.length).trim();
    if (!payload || payload === '[DONE]') {
      continue;
    }

    try {
      const parsed = JSON.parse(payload);
      if (typeof parsed.delta === 'string' && (parsed.type === 'response.output_text.delta' || currentEvent.endsWith('delta'))) {
        deltas.push(parsed.delta);
      } else if (typeof parsed.output_text === 'string') {
        deltas.push(parsed.output_text);
      }
    } catch {
      deltas.push(payload);
    }
  }

  return deltas;
}

function extractVisibleReply(rawText: string) {
  const keyIndex = rawText.search(/"reply"\s*:/);
  if (keyIndex < 0) {
    return undefined;
  }

  const colon = rawText.indexOf(':', keyIndex);
  if (colon < 0) {
    return '';
  }

  let start = colon + 1;
  while (/\s/.test(rawText[start] ?? '')) {
    start += 1;
  }
  if (rawText[start] !== '"') {
    return '';
  }

  let escaped = false;
  let result = '';
  for (let index = start + 1; index < rawText.length; index += 1) {
    const char = rawText[index];
    if (escaped) {
      result += decodeJsonEscape(char);
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      return result;
    }
    result += char;
  }

  return result;
}

function decodeJsonEscape(char: string) {
  if (char === 'n') {
    return '\n';
  }
  if (char === 'r') {
    return '\r';
  }
  if (char === 't') {
    return '\t';
  }
  return char;
}

async function readLlmResponse(response: Response) {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }

  if (trimmed.startsWith('event:') || trimmed.startsWith('data:')) {
    return parseSseResponse(trimmed);
  }

  return JSON.parse(trimmed);
}

function parseSseResponse(source: string) {
  let outputText = '';
  let finalResponse: any;
  let currentEvent = '';

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.startsWith('event:')) {
      currentEvent = line.slice('event:'.length).trim();
      continue;
    }
    if (!line.startsWith('data:')) {
      continue;
    }

    const payload = line.slice('data:'.length).trim();
    if (!payload || payload === '[DONE]') {
      continue;
    }

    try {
      const parsed = JSON.parse(payload);
      if (typeof parsed.delta === 'string' && (parsed.type === 'response.output_text.delta' || currentEvent.endsWith('delta'))) {
        outputText += parsed.delta;
      }
      if (parsed.type === 'response.completed' && parsed.response) {
        finalResponse = parsed.response;
      } else if (parsed.response) {
        finalResponse = parsed.response;
      } else if (parsed.output || parsed.output_text) {
        finalResponse = parsed;
      }
    } catch {
      outputText += payload;
    }
  }

  if (finalResponse) {
    return {
      ...finalResponse,
      output_text: finalResponse.output_text || outputText
    };
  }

  return {output_text: outputText};
}
