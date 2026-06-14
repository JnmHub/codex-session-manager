import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {getAppHome} from './paths.js';
import {getActivePath} from './sessions.js';
import {loadStore} from './store.js';
import type {LaunchOptions, SessionRecord} from '../types.js';

export function buildCodexArgs(session: SessionRecord, options: LaunchOptions = {}) {
  const args = ['resume', session.id, '-C', getActivePath(session)];
  const profile = options.profile ?? session.profile;

  if (profile) {
    args.push('-p', profile);
  }

  if (options.yolo) {
    args.push('--dangerously-bypass-approvals-and-sandbox');
  }

  if (session.launchArgs?.length) {
    args.push(...session.launchArgs);
  }

  return args;
}

export function buildPowerShellCommand(session: SessionRecord, options: LaunchOptions = {}) {
  const cwd = getActivePath(session);
  const args = buildCodexArgs(session, options).map(quotePowerShell).join(' ');
  return `Set-Location ${quotePowerShell(cwd)}; codex ${args}`;
}

export function launchSession(session: SessionRecord, options: LaunchOptions = {}) {
  const command = buildPowerShellCommand(session, options);

  if (options.dryRun) {
    return command;
  }

  if (options.inline) {
    const child = spawn('codex', buildCodexArgs(session, options), {
      cwd: getActivePath(session),
      stdio: 'inherit',
      shell: false
    });
    child.on('exit', code => process.exit(code ?? 0));
    return command;
  }

  if (process.platform === 'win32') {
    const {cmdPath} = writeWindowsLaunchFiles(session, options);
    spawn('explorer.exe', [cmdPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    }).unref();
  } else {
    spawn('sh', ['-lc', command], {
      detached: true,
      stdio: 'ignore'
    }).unref();
  }

  return command;
}

export async function launchSessionWithDefaults(session: SessionRecord, options: LaunchOptions = {}) {
  const store = await loadStore();
  const launchOptions: LaunchOptions = {
    ...options,
    profile: options.profile || session.profile || store.settings.globalProfile,
    yolo: options.yolo ?? session.yolo ?? store.settings.yoloDefault
  };
  return launchSession(session, launchOptions);
}

function quotePowerShell(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function writeWindowsLaunchFiles(session: SessionRecord, options: LaunchOptions = {}) {
  const dir = path.join(getAppHome(), 'launch');
  fs.mkdirSync(dir, {recursive: true});

  const scriptPath = path.join(dir, `resume-${session.id.slice(0, 8)}.ps1`);
  const cmdPath = path.join(dir, `resume-${session.id.slice(0, 8)}.cmd`);
  const cwd = getActivePath(session);
  const args = buildCodexArgs(session, options).map(quotePowerShell).join(' ');
  const logPath = path.join(dir, `resume-${session.id.slice(0, 8)}.log`);
  const content = [
    '$ErrorActionPreference = "Continue"',
    `$host.UI.RawUI.WindowTitle = ${quotePowerShell(`Codex ${session.id.slice(0, 8)}`)}`,
    `if (Test-Path -LiteralPath ${quotePowerShell(logPath)}) { Remove-Item -LiteralPath ${quotePowerShell(logPath)} -Force }`,
    `Start-Transcript -Path ${quotePowerShell(logPath)} -Append | Out-Null`,
    `Set-Location -LiteralPath ${quotePowerShell(cwd)}`,
    `Write-Host ${quotePowerShell(`Resuming Codex session ${session.id}`)}`,
    `Write-Host ${quotePowerShell(cwd)}`,
    `& codex ${args}`,
    'Write-Host ""',
    `Write-Host ${quotePowerShell('Codex process ended. This window is kept open for diagnostics.')}`,
    'Stop-Transcript | Out-Null'
  ].join('\r\n');

  fs.writeFileSync(scriptPath, `\uFEFF${content}`, 'utf8');
  fs.writeFileSync(
    cmdPath,
    [
      '@echo off',
      'chcp 65001 >nul',
      `title Codex ${session.id.slice(0, 8)}`,
      `powershell.exe -NoExit -ExecutionPolicy Bypass -File "${scriptPath}"`,
      ''
    ].join('\r\n'),
    'utf8'
  );
  return {scriptPath, cmdPath};
}
