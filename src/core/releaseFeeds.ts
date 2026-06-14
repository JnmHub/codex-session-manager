import fs from 'node:fs/promises';
import path from 'node:path';

export type VersionEntry = {
  version: string;
  date: string;
  title: string;
  content: string[];
  releaseUrl?: string;
  critical?: boolean;
};

export type AnnouncementEntry = {
  id: string;
  date: string;
  title: string;
  content: string;
  level?: 'info' | 'success' | 'warning' | 'danger';
  url?: string;
};

const APP_VERSION = '0.2.0';
const REPO_OWNER = 'JnmHub';
const REPO_NAME = 'codex-session-manager';
const RAW_BASE_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main`;
const RELEASES_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`;

const FEED_TIMEOUT_MS = 4500;

export async function getAppInfo() {
  return {
    name: '会话管家',
    version: APP_VERSION,
    author: 'Jnm',
    copyright: 'Jnm Copyright',
    repository: `https://github.com/${REPO_OWNER}/${REPO_NAME}`,
    releasesUrl: RELEASES_URL,
    feeds: {
      versions: `${RAW_BASE_URL}/version.jsonl`,
      announcements: `${RAW_BASE_URL}/announcement.jsonl`
    }
  };
}

export async function getVersionFeed() {
  const entries = sortVersions(await readJsonlFeed<VersionEntry>('version.jsonl'));
  const latest = entries[0];

  return {
    currentVersion: APP_VERSION,
    latestVersion: latest?.version ?? APP_VERSION,
    hasUpdate: latest ? compareVersions(latest.version, APP_VERSION) > 0 : false,
    latest,
    entries
  };
}

export async function getAnnouncementFeed() {
  const entries = await readJsonlFeed<AnnouncementEntry>('announcement.jsonl');
  return {
    entries: entries.sort((a, b) => b.date.localeCompare(a.date))
  };
}

async function readJsonlFeed<T>(fileName: 'version.jsonl' | 'announcement.jsonl') {
  const remoteUrl = `${RAW_BASE_URL}/${fileName}`;

  try {
    const remoteText = await fetchText(remoteUrl);
    return parseJsonl<T>(remoteText);
  } catch {
    const localText = await readLocalFeed(fileName);
    return parseJsonl<T>(localText);
  }
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/plain, application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Feed request failed: ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function readLocalFeed(fileName: string) {
  const candidates = [
    path.resolve(process.cwd(), fileName),
    path.resolve(process.cwd(), '..', fileName),
    process.resourcesPath ? path.resolve(process.resourcesPath, fileName) : ''
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, 'utf8');
    } catch {
      // Try the next local fallback path.
    }
  }

  return '';
}

function parseJsonl<T>(text: string) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

function sortVersions(entries: VersionEntry[]) {
  return [...entries].sort((a, b) => compareVersions(b.version, a.version));
}

function compareVersions(a: string, b: string) {
  const pa = normalizeVersion(a);
  const pb = normalizeVersion(b);
  const max = Math.max(pa.length, pb.length);

  for (let index = 0; index < max; index += 1) {
    const diff = (pa[index] ?? 0) - (pb[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function normalizeVersion(version: string) {
  return version
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map(part => Number.parseInt(part, 10))
    .map(part => (Number.isFinite(part) ? part : 0));
}
