const DEFAULT_ACCELERATOR_BASE_URL = 'https://github.aiceo.dev';

const githubProxyHosts = new Set([
  'api.github.com',
  'codeload.github.com',
  'github.com',
  'objects.githubusercontent.com',
  'raw.githubusercontent.com',
  'release-assets.githubusercontent.com'
]);

export const githubAcceleratorBaseUrl = normalizeBaseUrl(
  process.env.CXM_GITHUB_ACCELERATOR_URL ?? DEFAULT_ACCELERATOR_BASE_URL
);

export function toGithubProxyUrl(input: string | URL) {
  const url = typeof input === 'string' ? input : input.toString();
  if (!githubAcceleratorBaseUrl || !shouldProxyGithubUrl(url)) {
    return url;
  }
  return `${githubAcceleratorBaseUrl}/proxy?url=${encodeURIComponent(url)}`;
}

export async function fetchGithubUrl(input: string | URL, init?: RequestInit) {
  const originalUrl = typeof input === 'string' ? input : input.toString();
  const proxyUrl = toGithubProxyUrl(originalUrl);
  if (proxyUrl === originalUrl) {
    return fetch(originalUrl, init);
  }

  try {
    const response = await fetch(proxyUrl, init);
    if (response.ok || response.status < 500) {
      return response;
    }
  } catch (error) {
    // Fall through to the original GitHub URL when the accelerator is unreachable.
  }
  return fetch(originalUrl, init);
}

export function getDefaultRegistryUrl() {
  return toGithubProxyUrl('https://raw.githubusercontent.com/JnmHub/codex-session-registry/main/registry.json');
}

function shouldProxyGithubUrl(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (host === new URL(githubAcceleratorBaseUrl).hostname.toLowerCase()) {
      return false;
    }
    return parsed.protocol === 'https:' && (
      githubProxyHosts.has(host) ||
      host.endsWith('.githubusercontent.com')
    );
  } catch {
    return false;
  }
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}
