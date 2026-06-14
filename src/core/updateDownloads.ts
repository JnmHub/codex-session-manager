import {spawn} from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {getAppHome} from './paths.js';

export type UpdateAssetKind = 'setup' | 'portable';

export type UpdateAsset = {
  name: string;
  size: number;
  browserDownloadUrl: string;
  kind: UpdateAssetKind | 'other';
};

type GitHubRelease = {
  tag_name: string;
  name?: string;
  html_url: string;
  published_at?: string;
  assets: Array<{
    name: string;
    size: number;
    browser_download_url: string;
  }>;
};

type DownloadProgress = {
  received: number;
  total: number;
  percent: number;
};

const REPO_OWNER = 'JnmHub';
const REPO_NAME = 'codex-session-manager';
const DOWNLOAD_TIMEOUT_MS = 120000;

export async function getLatestUpdateAssets() {
  const release = await fetchLatestRelease();
  const assets = release.assets.map(asset => ({
    name: asset.name,
    size: asset.size,
    browserDownloadUrl: asset.browser_download_url,
    kind: getAssetKind(asset.name)
  }));

  return {
    tagName: release.tag_name,
    name: release.name ?? release.tag_name,
    releaseUrl: release.html_url,
    publishedAt: release.published_at,
    assets,
    recommended: assets.find(asset => asset.kind === 'setup') ?? assets.find(asset => asset.kind === 'portable')
  };
}

export async function downloadLatestUpdate(
  kind: UpdateAssetKind,
  onProgress: (progress: DownloadProgress) => void
) {
  const release = await getLatestUpdateAssets();
  const asset = release.assets.find(item => item.kind === kind);

  if (!asset) {
    throw new Error(`未找到 ${kind === 'setup' ? '安装包' : '便携包'} 下载资产`);
  }

  return downloadAsset(asset, onProgress);
}

export function getDownloadsDir() {
  return path.join(getAppHome(), 'downloads');
}

export async function openDownloadedUpdate(filePath: string, mode: 'file' | 'folder') {
  const downloadsDir = path.resolve(getDownloadsDir());
  const resolved = path.resolve(filePath);

  if (!resolved.startsWith(downloadsDir + path.sep) && resolved !== downloadsDir) {
    throw new Error('只能打开本工具下载目录内的更新文件');
  }

  await fsp.access(resolved);

  if (process.platform === 'win32') {
    const command = mode === 'folder'
      ? `explorer.exe /select,"${resolved.replace(/"/g, '""')}"`
      : `Start-Process -LiteralPath '${resolved.replace(/'/g, "''")}'`;

    spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', command], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref();
    return {ok: true};
  }

  const target = mode === 'folder' ? path.dirname(resolved) : resolved;
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(command, [target], {detached: true, stdio: 'ignore'}).unref();
  return {ok: true};
}

async function fetchLatestRelease() {
  const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'codex-session-manager'
    }
  });

  if (!response.ok) {
    throw new Error(`获取 GitHub Release 失败：${response.status}`);
  }

  return await response.json() as GitHubRelease;
}

async function downloadAsset(asset: UpdateAsset, onProgress: (progress: DownloadProgress) => void) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  const downloadsDir = getDownloadsDir();
  const filePath = path.join(downloadsDir, sanitizeFileName(asset.name));
  const tempPath = `${filePath}.download`;

  await fsp.mkdir(downloadsDir, {recursive: true});

  try {
    const response = await fetch(asset.browserDownloadUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'codex-session-manager'
      }
    });

    if (!response.ok || !response.body) {
      throw new Error(`下载失败：${response.status}`);
    }

    const total = Number(response.headers.get('content-length') ?? asset.size ?? 0);
    let received = 0;
    const reader = response.body.getReader();
    const file = fs.createWriteStream(tempPath);

    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) {
          break;
        }

        received += value.byteLength;
        file.write(Buffer.from(value));
        onProgress({
          received,
          total,
          percent: total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0
        });
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        file.once('error', reject);
        file.end(() => {
          file.off('error', reject);
          resolve();
        });
      });
    }

    await fsp.rename(tempPath, filePath);
    return {
      asset,
      filePath,
      fileName: path.basename(filePath),
      bytes: received
    };
  } catch (error) {
    await fsp.rm(tempPath, {force: true});
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getAssetKind(name: string): UpdateAsset['kind'] {
  if (/setup/i.test(name) && /\.exe$/i.test(name)) {
    return 'setup';
  }

  if (/portable/i.test(name) && /\.exe$/i.test(name)) {
    return 'portable';
  }

  return 'other';
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_');
}
