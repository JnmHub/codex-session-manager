import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {launchSessionWithDefaults} from './launcher.js';
import {getSession} from './sessions.js';

const execFileAsync = promisify(execFile);

export type SessionWindowProcess = {
  pid: number;
  name: string;
  title: string;
  commandLine: string;
};

export async function getSessionWindowStatus(idOrPrefix: string) {
  const session = await getSession(idOrPrefix);
  const processes = await findSessionWindowProcesses(session.id);
  return {
    id: session.id,
    open: processes.length > 0,
    processes
  };
}

export async function listSessionWindowStatuses(ids: string[]) {
  const sessions = await Promise.all(ids.map(id => getSession(id)));
  const processes = await findManagedSessionWindowProcesses();
  return sessions.map(session => {
    const shortId = session.id.slice(0, 8).toLowerCase();
    const matched = processes.filter(processInfo => processInfo.shortId === shortId);
    return {
      id: session.id,
      open: matched.length > 0,
      processes: matched.map(({shortId: _shortId, ...processInfo}) => processInfo)
    };
  });
}

export async function closeSessionWindow(idOrPrefix: string) {
  const status = await getSessionWindowStatus(idOrPrefix);
  for (const processInfo of status.processes) {
    try {
      process.kill(processInfo.pid);
    } catch {
      // The user may have closed the window between detection and kill.
    }
  }

  return {
    ...status,
    closed: status.processes.length
  };
}

export async function reopenSessionWindow(
  idOrPrefix: string,
  options: {profile?: string; yolo?: boolean} = {}
) {
  const session = await getSession(idOrPrefix);
  const closed = await closeSessionWindow(session.id);
  const command = await launchSessionWithDefaults(session, options);
  return {
    id: session.id,
    closed: closed.closed,
    command
  };
}

async function findSessionWindowProcesses(sessionId: string): Promise<SessionWindowProcess[]> {
  const shortId = sessionId.slice(0, 8).replace(/[^a-z0-9]/gi, '').toLowerCase();
  const processes = await findManagedSessionWindowProcesses();
  return processes
    .filter(processInfo => processInfo.shortId === shortId)
    .map(({shortId: _shortId, ...processInfo}) => processInfo);
}

async function findManagedSessionWindowProcesses(): Promise<Array<SessionWindowProcess & {shortId: string}>> {
  if (process.platform !== 'win32') {
    return [];
  }

  const command = [
    '$ErrorActionPreference = "SilentlyContinue"',
    '$items = Get-CimInstance Win32_Process | Where-Object {',
    "  $_.Name -in @('powershell.exe', 'pwsh.exe', 'cmd.exe') -and (",
    '    $_.CommandLine -like "*resume-*.ps1*" -or',
    '    $_.CommandLine -like "*resume-*.cmd*"',
    '  )',
    '} | ForEach-Object {',
    '  $proc = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue',
    '  [pscustomobject]@{',
    '    pid = [int]$_.ProcessId',
    '    name = [string]$_.Name',
    '    title = [string]$proc.MainWindowTitle',
    '    commandLine = [string]$_.CommandLine',
    '  }',
    '}',
    '$titleItems = Get-Process -Name powershell,pwsh,cmd -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "Codex ????????" } | ForEach-Object {',
    '  [pscustomobject]@{',
    '    pid = [int]$_.Id',
    '    name = [string]$_.ProcessName',
    '    title = [string]$_.MainWindowTitle',
    '    commandLine = ""',
    '  }',
    '}',
    '@($items + $titleItems) | Sort-Object pid -Unique | ConvertTo-Json -Depth 3 -Compress',
    'exit 0'
  ].join('\n');

  const {stdout} = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed) as SessionWindowProcess | SessionWindowProcess[];
  return (Array.isArray(parsed) ? parsed : [parsed])
    .filter(item => Number.isFinite(item.pid))
    .map(item => ({...item, shortId: extractShortId(item)}))
    .filter(item => item.shortId.length > 0);
}

function extractShortId(processInfo: SessionWindowProcess) {
  const commandMatch = processInfo.commandLine.match(/resume-([0-9a-f]{8})\.(?:ps1|cmd)/i);
  if (commandMatch) {
    return commandMatch[1].toLowerCase();
  }

  const titleMatch = processInfo.title.match(/^Codex ([0-9a-f]{8})$/i);
  return titleMatch ? titleMatch[1].toLowerCase() : '';
}
