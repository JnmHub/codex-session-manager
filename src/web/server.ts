import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {scanSessions} from '../core/scanner.js';
import {getCodexFile, saveCodexFile} from '../core/codexFiles.js';
import {
  deleteMcpServer,
  deleteSkill,
  getHooksFile,
  getSkill,
  listMcpServers,
  listSkills,
  saveHooksFile,
  saveMcpServer,
  saveSkill,
  type HookScope,
  type SkillScope
} from '../core/codexExtensions.js';
import {
  getSession,
  listProjects,
  listSessions,
  deleteSession,
  setArchived,
  setBoundPath,
  setCategory,
  setFavorite,
  setSessionLaunchOptions,
  setNote,
  toggleArchived,
  toggleFavorite
} from '../core/sessions.js';
import {launchSessionWithDefaults} from '../core/launcher.js';
import {getSettings, updateSettings} from '../core/settings.js';
import {deleteProfile, getProfileFiles, listProfiles, saveProfileFiles, upsertProfile} from '../core/profiles.js';
import {createWorkspaceAndOpenSession} from '../core/newSession.js';
import {getTranscript, resetTranscriptEdits, saveTranscriptEdits} from '../core/transcript.js';
import {getProjectAgentsFile, saveProjectAgentsFile} from '../core/projectAgents.js';
import {
  createLlmConversation,
  deleteLlmConversation,
  getLlmConversation,
  listLlmConversations,
  reorderLlmConversations,
  updateLlmConversation
} from '../core/llmConversations.js';
import {runLlmChat, runLlmTask, runManagedLlmChat, runManagedLlmChatStream} from '../core/llm.js';
import {getAnnouncementFeed, getAppInfo, getVersionFeed} from '../core/releaseFeeds.js';
import {
  closeSessionWindow,
  getSessionWindowStatus,
  listSessionWindowStatuses,
  reopenSessionWindow
} from '../core/sessionWindows.js';
import {
  downloadLatestUpdate,
  getLatestUpdateAssets,
  openDownloadedUpdate,
  type UpdateAssetKind
} from '../core/updateDownloads.js';
import {defaultRegistryUrl, fetchSyncRegistryWithStatus, installSyncItems} from '../core/syncRegistry.js';
import type {LlmPermissionLevel} from '../types.js';

type WebOptions = {
  host?: string;
  port?: number;
  open?: boolean;
  scan?: boolean;
};

type ApiHandler = (request: http.IncomingMessage, body: unknown) => Promise<unknown>;

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

export async function startWebServer(options: WebOptions = {}) {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8765;
  const staticRoot = getStaticRoot();

  if (options.scan !== false) {
    await scanSessions();
  }

  const server = http.createServer(async (request, response) => {
    try {
      await routeRequest(request, response, staticRoot);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  await listenWithFallback(server, port, host);
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const url = `http://${host}:${actualPort}`;

  if (options.open !== false) {
    openBrowser(url);
  }

  return {server, url};
}

async function routeRequest(request: http.IncomingMessage, response: http.ServerResponse, staticRoot: string) {
  const method = request.method ?? 'GET';
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

  if (requestUrl.pathname.startsWith('/api/')) {
    const body = method === 'GET' ? undefined : await readBody(request);
    await routeApi(request, response, requestUrl, body);
    return;
  }

  await serveStatic(response, staticRoot, requestUrl.pathname);
}

async function routeApi(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  requestUrl: URL,
  body: unknown
) {
  if ((request.method ?? 'GET') === 'POST' && requestUrl.pathname === '/api/llm/chat/stream') {
    await streamManagedChat(response, body);
    return;
  }

  if ((request.method ?? 'GET') === 'GET' && requestUrl.pathname === '/api/update/download/stream') {
    await streamUpdateDownload(response, requestUrl);
    return;
  }

  const routes: Record<string, ApiHandler> = {
    'GET /api/health': async () => ({ok: true}),
    'GET /api/app-info': async () => getAppInfo(),
    'GET /api/updates': async () => getVersionFeed(),
    'GET /api/announcements': async () => getAnnouncementFeed(),
    'GET /api/sync/registry': async () => {
      return fetchSyncRegistryWithStatus({
        url: optionalString(requestUrl.searchParams.get('url')) ?? defaultRegistryUrl,
        skillScope: requireSkillScope(requestUrl.searchParams.get('skillScope') ?? 'global'),
        projectPath: optionalString(requestUrl.searchParams.get('projectPath'))
      });
    },
    'POST /api/sync/install': async () => {
      const payload = requireObject(body);
      return installSyncItems({
        url: optionalString(payload.url) ?? defaultRegistryUrl,
        items: Array.isArray(payload.items) ? payload.items as never : [],
        skillScope: requireSkillScope(payload.skillScope ?? 'global'),
        projectPath: optionalString(payload.projectPath)
      });
    },
    'GET /api/update/assets': async () => getLatestUpdateAssets(),
    'GET /api/sessions': async () => {
      const limit = Number(requestUrl.searchParams.get('limit') ?? 300);
      return {
        sessions: await listSessions({
          all: requestUrl.searchParams.get('all') === '1',
          query: requestUrl.searchParams.get('query') ?? undefined,
          project: requestUrl.searchParams.get('project') ?? undefined,
          limit
        })
      };
    },
    'GET /api/projects': async () => ({projects: await listProjects()}),
    'GET /api/settings': async () => ({settings: await getSettings()}),
    'POST /api/settings': async () => ({settings: await updateSettings(requireObject(body))}),
    'GET /api/profiles': async () => ({profiles: await listProfiles()}),
    'GET /api/profile-files': async () => {
      return getProfileFiles(requireString(requestUrl.searchParams.get('id'), 'id'));
    },
    'POST /api/profiles': async () => {
      const payload = requireObject(body);
      return {
        profile: await upsertProfile({
          id: optionalString(payload.id),
          name: requireString(payload.name, 'name'),
          note: optionalString(payload.note),
          commandArgs: optionalString(payload.commandArgs)
        })
      };
    },
    'DELETE /api/profiles': async () => {
      const payload = requireObject(body);
      return deleteProfile(requireString(payload.id, 'id'));
    },
    'POST /api/profile-files': async () => {
      const payload = requireObject(body);
      return saveProfileFiles({
        id: requireString(payload.id, 'id'),
        configContent: optionalStringAllowEmpty(payload.configContent),
        markdownContent: optionalStringAllowEmpty(payload.markdownContent)
      });
    },
    'GET /api/codex-file': async () => {
      return getCodexFile(requireString(requestUrl.searchParams.get('name'), 'name'));
    },
    'POST /api/codex-file': async () => {
      const payload = requireObject(body);
      return saveCodexFile(
        requireString(payload.name, 'name'),
        optionalStringAllowEmpty(payload.content) ?? ''
      );
    },
    'GET /api/project-agents': async () => {
      return getProjectAgentsFile(requireString(requestUrl.searchParams.get('projectPath'), 'projectPath'));
    },
    'POST /api/project-agents': async () => {
      const payload = requireObject(body);
      return saveProjectAgentsFile(
        requireString(payload.projectPath, 'projectPath'),
        optionalStringAllowEmpty(payload.content) ?? ''
      );
    },
    'GET /api/transcript': async () => {
      return getTranscript(requireString(requestUrl.searchParams.get('id'), 'id'));
    },
    'POST /api/transcript': async () => {
      const payload = requireObject(body);
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      return saveTranscriptEdits(requireString(payload.id, 'id'), messages as never);
    },
    'POST /api/transcript/reset': async () => {
      const payload = requireObject(body);
      return resetTranscriptEdits(requireString(payload.id, 'id'));
    },
    'POST /api/llm/run': async () => {
      const payload = requireObject(body);
      return runLlmTask({
        task: optionalString(payload.task) ?? 'rewrite',
        text: requireString(payload.text, 'text'),
        instruction: optionalString(payload.instruction)
      });
    },
    'POST /api/llm/chat': async () => {
      const payload = requireObject(body);
      if (typeof payload.text === 'string') {
        return runManagedLlmChat({
          conversationId: optionalString(payload.conversationId),
          text: payload.text,
          permissionLevel: optionalPermission(payload.permissionLevel)
        });
      }
      return runLlmChat({
        messages: Array.isArray(payload.messages) ? payload.messages as never : [],
        permissionLevel: optionalPermission(payload.permissionLevel)
      });
    },
    'GET /api/llm/conversations': async () => ({conversations: await listLlmConversations()}),
    'GET /api/llm/conversation': async () => {
      return {conversation: await getLlmConversation(requireString(requestUrl.searchParams.get('id'), 'id'))};
    },
    'POST /api/llm/conversation': async () => {
      const payload = requireObject(body);
      if (typeof payload.id === 'string' && payload.id.length > 0) {
        return {
          conversation: await updateLlmConversation(payload.id, {
            title: optionalString(payload.title),
            category: optionalStringAllowEmpty(payload.category),
            pinned: typeof payload.pinned === 'boolean' ? payload.pinned : undefined,
            maxContext: typeof payload.maxContext === 'number' ? payload.maxContext : undefined,
            permissionLevel: optionalPermission(payload.permissionLevel)
          })
        };
      }
      return {
        conversation: await createLlmConversation({
          title: optionalString(payload.title),
          category: optionalStringAllowEmpty(payload.category),
          maxContext: typeof payload.maxContext === 'number' ? payload.maxContext : undefined
        })
      };
    },
    'DELETE /api/llm/conversation': async () => {
      const payload = requireObject(body);
      return deleteLlmConversation(requireString(payload.id, 'id'));
    },
    'POST /api/llm/conversations/reorder': async () => {
      const payload = requireObject(body);
      return {conversations: await reorderLlmConversations(Array.isArray(payload.ids) ? payload.ids as string[] : [])};
    },
    'POST /api/command': async () => {
      const payload = requireObject(body);
      return runCommand(requireString(payload.command, 'command'));
    },
    'POST /api/update/open': async () => {
      const payload = requireObject(body);
      return openDownloadedUpdate(
        requireString(payload.path, 'path'),
        payload.mode === 'file' ? 'file' : 'folder'
      );
    },
    'POST /api/scan': async () => {
      const sessions = await scanSessions();
      return {count: sessions.length};
    },
    'POST /api/new-session': async () => {
      const payload = requireObject(body);
      return createWorkspaceAndOpenSession({
        workspacePath: requireString(payload.workspacePath, 'workspacePath'),
        createFolder: payload.createFolder !== false,
        profile: optionalString(payload.profile),
        yolo: typeof payload.yolo === 'boolean' ? payload.yolo : undefined,
        prompt: optionalStringAllowEmpty(payload.prompt)
      });
    },
    'GET /api/skills': async () => {
      return {
        skills: await listSkills({
          scope: optionalSkillScope(requestUrl.searchParams.get('scope')),
          projectPath: optionalString(requestUrl.searchParams.get('projectPath'))
        })
      };
    },
    'GET /api/skill': async () => {
      return getSkill({
        scope: requireSkillScope(requestUrl.searchParams.get('scope')),
        name: requireString(requestUrl.searchParams.get('name'), 'name'),
        projectPath: optionalString(requestUrl.searchParams.get('projectPath'))
      });
    },
    'POST /api/skill': async () => {
      const payload = requireObject(body);
      return saveSkill({
        scope: requireSkillScope(payload.scope),
        name: requireString(payload.name, 'name'),
        content: optionalStringAllowEmpty(payload.content) ?? '',
        projectPath: optionalString(payload.projectPath)
      });
    },
    'DELETE /api/skill': async () => {
      const payload = requireObject(body);
      return deleteSkill({
        scope: requireSkillScope(payload.scope),
        name: requireString(payload.name, 'name'),
        projectPath: optionalString(payload.projectPath)
      });
    },
    'GET /api/mcp': async () => listMcpServers(),
    'POST /api/mcp': async () => {
      const payload = requireObject(body);
      return saveMcpServer({
        name: requireString(payload.name, 'name'),
        body: optionalStringAllowEmpty(payload.body) ?? ''
      });
    },
    'DELETE /api/mcp': async () => {
      const payload = requireObject(body);
      return deleteMcpServer(requireString(payload.name, 'name'));
    },
    'GET /api/hooks': async () => {
      return getHooksFile({
        scope: requireHookScope(requestUrl.searchParams.get('scope')),
        projectPath: optionalString(requestUrl.searchParams.get('projectPath'))
      });
    },
    'POST /api/hooks': async () => {
      const payload = requireObject(body);
      return saveHooksFile({
        scope: requireHookScope(payload.scope),
        content: optionalStringAllowEmpty(payload.content) ?? '',
        projectPath: optionalString(payload.projectPath)
      });
    },
    'POST /api/open': async () => {
      const payload = requireObject(body);
      const session = await getSession(requireString(payload.id, 'id'));
      const command = await launchSessionWithDefaults(session, {
        dryRun: Boolean(payload.dryRun),
        profile: optionalString(payload.profile),
        yolo: typeof payload.yolo === 'boolean' ? payload.yolo : undefined
      });
      return {command};
    },
    'GET /api/session-window': async () => {
      return getSessionWindowStatus(requireString(requestUrl.searchParams.get('id'), 'id'));
    },
    'POST /api/session-windows/statuses': async () => {
      const payload = requireObject(body);
      return {statuses: await listSessionWindowStatuses(Array.isArray(payload.ids) ? payload.ids as string[] : [])};
    },
    'POST /api/session-window/close': async () => {
      const payload = requireObject(body);
      return closeSessionWindow(requireString(payload.id, 'id'));
    },
    'POST /api/session-window/reopen': async () => {
      const payload = requireObject(body);
      return reopenSessionWindow(requireString(payload.id, 'id'), {
        profile: optionalString(payload.profile),
        yolo: typeof payload.yolo === 'boolean' ? payload.yolo : undefined
      });
    },
    'POST /api/note': async () => {
      const payload = requireObject(body);
      const session = await setNote(requireString(payload.id, 'id'), optionalStringAllowEmpty(payload.note) ?? '');
      return {session};
    },
    'POST /api/category': async () => {
      const payload = requireObject(body);
      const session = await setCategory(requireString(payload.id, 'id'), optionalStringAllowEmpty(payload.category) ?? '');
      return {session};
    },
    'POST /api/bind': async () => {
      const payload = requireObject(body);
      const session = await setBoundPath(requireString(payload.id, 'id'), requireString(payload.path, 'path'));
      return {session};
    },
    'POST /api/session-options': async () => {
      const payload = requireObject(body);
      const session = await setSessionLaunchOptions(requireString(payload.id, 'id'), {
        profile: typeof payload.profile === 'string' ? payload.profile || null : undefined,
        yolo: typeof payload.yolo === 'boolean' ? payload.yolo : undefined
      });
      return {session};
    },
    'POST /api/favorite': async () => {
      const payload = requireObject(body);
      const session = await toggleFavorite(requireString(payload.id, 'id'));
      return {session};
    },
    'POST /api/archive': async () => {
      const payload = requireObject(body);
      const session = await toggleArchived(requireString(payload.id, 'id'));
      return {session};
    },
    'POST /api/sessions/batch': async () => {
      const payload = requireObject(body);
      const ids = Array.isArray(payload.ids) ? payload.ids.filter((id): id is string => typeof id === 'string') : [];
      const action = requireString(payload.action, 'action');
      const results: unknown[] = [];

      for (const id of ids) {
        if (action === 'favorite') {
          results.push(await setFavorite(id, true));
        } else if (action === 'unfavorite') {
          results.push(await setFavorite(id, false));
        } else if (action === 'archive') {
          results.push(await setArchived(id, true));
        } else if (action === 'unarchive') {
          results.push(await setArchived(id, false));
        } else if (action === 'delete') {
          results.push(await deleteSession(id, {deleteFile: payload.deleteFile !== false}));
        } else {
          throw new Error(`Unknown batch action: ${action}`);
        }
      }

      return {ok: true, count: results.length, results};
    },
    'DELETE /api/session': async () => {
      const payload = requireObject(body);
      return deleteSession(requireString(payload.id, 'id'), {
        deleteFile: payload.deleteFile !== false
      });
    }
  };

  const key = `${request.method ?? 'GET'} ${requestUrl.pathname}`;
  const handler = routes[key];
  if (!handler) {
    sendJson(response, 404, {error: 'Not found'});
    return;
  }

  sendJson(response, 200, await handler(request, body));
}

async function streamUpdateDownload(response: http.ServerResponse, requestUrl: URL) {
  const kind = requestUrl.searchParams.get('kind') === 'portable' ? 'portable' : 'setup';
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive'
  });

  const send = (event: string, data: unknown) => {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send('meta', {kind});
    const result = await downloadLatestUpdate(kind as UpdateAssetKind, progress => send('progress', progress));
    send('done', result);
  } catch (error) {
    send('fail', {error: error instanceof Error ? error.message : String(error)});
  } finally {
    response.end();
  }
}

async function streamManagedChat(response: http.ServerResponse, body: unknown) {
  const payload = requireObject(body);
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive'
  });

  const send = (event: string, data: unknown) => {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await runManagedLlmChatStream({
      conversationId: optionalString(payload.conversationId),
      text: requireString(payload.text, 'text'),
      permissionLevel: optionalPermission(payload.permissionLevel)
    }, {
      onMeta: data => send('meta', data),
      onDelta: text => send('delta', {text}),
      onActions: actions => send('actions', {actions}),
      onDone: data => send('done', data)
    });
  } catch (error) {
    send('error', {error: error instanceof Error ? error.message : String(error)});
  } finally {
    response.end();
  }
}

async function runCommand(command: string) {
  const profileMatch = command.match(/(?:session|会话)\s+([0-9a-f-]{8,36}).*?(?:profile|Profile)\s+([^\s]+)/i);
  if (profileMatch) {
    const session = await setSessionLaunchOptions(profileMatch[1], {
      profile: profileMatch[2],
      yolo: undefined
    });
    return {ok: true, message: `已设置 ${session.id.slice(0, 8)} 的 Profile 为 ${profileMatch[2]}`, session};
  }

  const yoloMatch = command.match(/(?:session|会话)\s+([0-9a-f-]{8,36}).*?(?:yolo|--yolo)\s+(on|off|true|false|开|关)/i);
  if (yoloMatch) {
    const enabled = /^(on|true|开)$/i.test(yoloMatch[2]);
    const session = await setSessionLaunchOptions(yoloMatch[1], {
      profile: undefined,
      yolo: enabled
    });
    return {ok: true, message: `已${enabled ? '开启' : '关闭'} ${session.id.slice(0, 8)} 的 yolo`, session};
  }

  throw new Error('无法识别命令。示例：session 019eabcd profile ctf；session 019eabcd yolo on');
}

async function serveStatic(response: http.ServerResponse, staticRoot: string, pathname: string) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const fullPath = path.resolve(staticRoot, relative);
  const outsideRoot = path.relative(staticRoot, fullPath).startsWith('..');

  if (outsideRoot) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const data = await fs.readFile(fullPath);
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(fullPath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await serveStatic(response, staticRoot, '/');
      return;
    }

    throw error;
  }
}

async function readBody(request: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(response: http.ServerResponse, statusCode: number, data: unknown) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(data));
}

async function listenWithFallback(server: http.Server, port: number, host: string) {
  for (let candidate = port; candidate < port + 20; candidate += 1) {
    try {
      await listen(server, candidate, host);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
        throw error;
      }
    }
  }

  throw new Error(`No free port found from ${port} to ${port + 19}`);
}

function listen(server: http.Server, port: number, host: string) {
  return new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function getStaticRoot() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, '..', '..', 'dist', 'web', 'static');
}

function openBrowser(url: string) {
  if (process.platform === 'win32') {
    spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', `Start-Process '${url}'`], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref();
    return;
  }

  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(command, [url], {detached: true, stdio: 'ignore'}).unref();
}

function requireObject(value: unknown) {
  if (!value || typeof value !== 'object') {
    throw new Error('Expected JSON object body');
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required field: ${field}`);
  }

  return value;
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalStringAllowEmpty(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function requireSkillScope(value: unknown): SkillScope {
  if (value === 'global' || value === 'project') {
    return value;
  }
  throw new Error('Missing required field: scope');
}

function optionalSkillScope(value: unknown): SkillScope | undefined {
  return value === 'global' || value === 'project' ? value : undefined;
}

function requireHookScope(value: unknown): HookScope {
  if (value === 'global' || value === 'project') {
    return value;
  }
  throw new Error('Missing required field: scope');
}

function optionalPermission(value: unknown): LlmPermissionLevel | undefined {
  if (value === 'readwrite' || value === 'dangerous') {
    return 'readwrite';
  }
  if (value === 'readonly' || value === 'normal') {
    return 'readonly';
  }
  return undefined;
}
