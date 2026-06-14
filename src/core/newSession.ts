import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {getAppHome} from './paths.js';
import {loadStore} from './store.js';

export type NewSessionInput = {
  workspacePath: string;
  createFolder?: boolean;
  profile?: string;
  yolo?: boolean;
  prompt?: string;
};

export async function createWorkspaceAndOpenSession(input: NewSessionInput) {
  const workspacePath = path.resolve(input.workspacePath);
  if (input.createFolder !== false) {
    await fs.mkdir(workspacePath, {recursive: true});
  } else {
    const stat = await fs.stat(workspacePath);
    if (!stat.isDirectory()) {
      throw new Error('工作区路径不是文件夹');
    }
  }

  const store = await loadStore();
  const profile = input.profile || store.settings.globalProfile;
  const yolo = input.yolo ?? store.settings.yoloDefault;
  const args = buildNewSessionArgs({profile, yolo, prompt: input.prompt});
  const command = `Set-Location ${quotePowerShell(workspacePath)}; codex ${args.map(quotePowerShell).join(' ')}`;

  if (process.platform === 'win32') {
    const {cmdPath} = await writeWindowsLaunchFiles(workspacePath, args);
    spawn('explorer.exe', [cmdPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    }).unref();
  } else {
    spawn('codex', args, {
      cwd: workspacePath,
      detached: true,
      stdio: 'ignore'
    }).unref();
  }

  return {
    workspacePath,
    command
  };
}

function buildNewSessionArgs(input: {profile?: string; yolo?: boolean; prompt?: string}) {
  const args: string[] = [];
  if (input.profile) {
    args.push('-p', input.profile);
  }
  if (input.yolo) {
    args.push('--dangerously-bypass-approvals-and-sandbox');
  }
  const prompt = input.prompt?.trim();
  if (prompt) {
    args.push(prompt);
  }
  return args;
}

async function writeWindowsLaunchFiles(workspacePath: string, args: string[]) {
  const dir = path.join(getAppHome(), 'launch');
  await fs.mkdir(dir, {recursive: true});

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const scriptPath = path.join(dir, `new-session-${stamp}.ps1`);
  const cmdPath = path.join(dir, `new-session-${stamp}.cmd`);
  const logPath = path.join(dir, `new-session-${stamp}.log`);
  const content = [
    '$ErrorActionPreference = "Continue"',
    '$host.UI.RawUI.WindowTitle = "Codex New Session"',
    `if (Test-Path -LiteralPath ${quotePowerShell(logPath)}) { Remove-Item -LiteralPath ${quotePowerShell(logPath)} -Force }`,
    `Start-Transcript -Path ${quotePowerShell(logPath)} -Append | Out-Null`,
    `Set-Location -LiteralPath ${quotePowerShell(workspacePath)}`,
    `Write-Host ${quotePowerShell(`Starting new Codex session in ${workspacePath}`)}`,
    `& codex ${args.map(quotePowerShell).join(' ')}`,
    'Write-Host ""',
    `Write-Host ${quotePowerShell('Codex process ended. This window is kept open for diagnostics.')}`,
    'Stop-Transcript | Out-Null'
  ].join('\r\n');

  await fs.writeFile(scriptPath, `\uFEFF${content}`, 'utf8');
  await fs.writeFile(
    cmdPath,
    [
      '@echo off',
      'chcp 65001 >nul',
      'title Codex New Session',
      `powershell.exe -NoExit -ExecutionPolicy Bypass -File "${scriptPath}"`,
      ''
    ].join('\r\n'),
    'utf8'
  );
  return {scriptPath, cmdPath};
}

function quotePowerShell(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
