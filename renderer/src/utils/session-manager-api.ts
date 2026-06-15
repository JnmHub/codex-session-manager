export async function apiRequest<T = unknown>(
  url: string,
  options: {method?: string; body?: unknown} = {}
) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.body ? {'Content-Type': 'application/json'} : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }
  return data as T
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败'
}

export type VersionEntry = {
  version: string
  date: string
  title: string
  content: string[]
  releaseUrl?: string
  critical?: boolean
}

export type AnnouncementEntry = {
  id: string
  date: string
  title: string
  content: string
  level?: 'info' | 'success' | 'warning' | 'danger'
  url?: string
}

export type AppInfo = {
  name: string
  version: string
  author: string
  copyright: string
  repository: string
  releasesUrl: string
  githubAcceleratorUrl?: string
  defaultRegistryUrl?: string
  feeds: {
    versions: string
    announcements: string
  }
}

export type UpdateFeed = {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  latest?: VersionEntry
  entries: VersionEntry[]
}

export type AnnouncementFeed = {
  entries: AnnouncementEntry[]
}

export type UpdateAsset = {
  name: string
  size: number
  browserDownloadUrl: string
  kind: 'setup' | 'portable' | 'other'
}

export type UpdateAssetsFeed = {
  tagName: string
  name: string
  releaseUrl: string
  publishedAt?: string
  assets: UpdateAsset[]
  recommended?: UpdateAsset
}

export type UpdateDownloadResult = {
  asset: UpdateAsset
  filePath: string
  fileName: string
  bytes: number
}
