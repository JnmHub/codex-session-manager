import os from 'node:os';
import path from 'node:path';

export function getCodexHome() {
  return process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex');
}

export function getSessionsDir(codexHome = getCodexHome()) {
  return path.join(codexHome, 'sessions');
}

export function getHistoryFile(codexHome = getCodexHome()) {
  return path.join(codexHome, 'history.jsonl');
}

export function getAppHome() {
  return process.env.CXM_HOME ?? path.join(os.homedir(), '.codex-session-manager');
}

export function getStoreFile() {
  return path.join(getAppHome(), 'store.json');
}
