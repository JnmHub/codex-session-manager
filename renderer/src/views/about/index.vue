<template>
  <div class="about-page art-full-height">
    <section class="about-hero art-card">
      <div class="brand-mark">
        <img src="@imgs/common/jnm-logo.svg" alt="logo" />
      </div>
      <div class="brand-copy">
        <h2>{{ appInfo?.name || '会话管家' }}</h2>
        <p>统一管理 Codex CLI 会话、Profile、配置、LLM 助手、更新和公告。</p>
      </div>
      <div class="brand-actions">
        <ElTag effect="light">当前版本 v{{ updateFeed?.currentVersion || appInfo?.version || '0.1.0' }}</ElTag>
        <ElButton type="primary" @click="openUrl(appInfo?.repository)">GitHub 仓库</ElButton>
      </div>
    </section>

    <ElRow :gutter="16">
      <ElCol :xs="24" :lg="9">
        <ElCard class="about-card" shadow="never">
          <template #header>
            <div class="card-title">
              <ArtSvgIcon icon="ri:user-heart-line" />
              <span>作者信息</span>
            </div>
          </template>
          <ElDescriptions :column="1" border>
            <ElDescriptionsItem label="作者">{{ appInfo?.author || 'Jnm' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="版权">{{ appInfo?.copyright || 'Jnm Copyright' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="更新源">
              <ElLink type="primary" :underline="false" @click="openUrl(appInfo?.feeds.versions)">
                version.jsonl
              </ElLink>
            </ElDescriptionsItem>
            <ElDescriptionsItem label="公告源">
              <ElLink type="primary" :underline="false" @click="openUrl(appInfo?.feeds.announcements)">
                announcement.jsonl
              </ElLink>
            </ElDescriptionsItem>
          </ElDescriptions>
        </ElCard>

        <ElCard class="about-card" shadow="never">
          <template #header>
            <div class="card-title">
              <ArtSvgIcon icon="ri:megaphone-line" />
              <span>公告</span>
            </div>
          </template>
          <ElEmpty v-if="!announcementFeed?.entries.length" description="暂无公告" />
          <div v-else class="announcement-list">
            <article v-for="item in announcementFeed.entries" :key="item.id" class="announcement-item">
              <div class="announcement-head">
                <strong>{{ item.title }}</strong>
                <ElTag size="small" :type="tagType(item.level)" effect="light">{{ item.date }}</ElTag>
              </div>
              <p>{{ item.content }}</p>
              <ElLink v-if="item.url" type="primary" :underline="false" @click="openUrl(item.url)">
                查看详情
              </ElLink>
            </article>
          </div>
        </ElCard>
      </ElCol>

      <ElCol :xs="24" :lg="15">
        <ElCard class="about-card release-card" shadow="never">
          <template #header>
            <div class="release-header">
              <div class="card-title">
                <ArtSvgIcon icon="ri:git-branch-line" />
                <span>更新记录</span>
              </div>
              <ElButton :loading="loading" @click="loadFeeds">刷新</ElButton>
            </div>
          </template>

          <ElAlert
            v-if="updateFeed?.hasUpdate && updateFeed.latest"
            class="update-alert"
            type="success"
            :closable="false"
            show-icon
          >
            <template #title>
              发现新版本 v{{ updateFeed.latest.version }}：{{ updateFeed.latest.title }}
            </template>
            <ElButton link type="primary" @click="openUrl(updateFeed.latest?.releaseUrl || appInfo?.releasesUrl)">
              打开 Release
            </ElButton>
            <ElButton link type="success" :loading="downloadState.downloading" @click="downloadUpdate('setup')">
              下载更新
            </ElButton>
          </ElAlert>

          <div class="download-panel">
            <div class="download-head">
              <div>
                <strong>在线下载</strong>
                <span>{{ updateAssets?.tagName || 'latest' }}</span>
              </div>
              <div>
                <ElButton :loading="loadingAssets" @click="loadUpdateAssets">刷新资产</ElButton>
                <ElButton type="primary" :loading="downloadState.downloading" @click="downloadUpdate('setup')">
                  下载安装包
                </ElButton>
                <ElButton :loading="downloadState.downloading" @click="downloadUpdate('portable')">
                  下载便携包
                </ElButton>
              </div>
            </div>
            <ElProgress
              v-if="downloadState.downloading || downloadState.filePath"
              :percentage="downloadState.percent"
              :status="downloadState.filePath ? 'success' : undefined"
            />
            <div v-if="downloadState.filePath" class="download-actions">
              <span>{{ downloadState.fileName }}</span>
              <ElButton link type="primary" @click="openDownloaded('folder')">打开文件夹</ElButton>
              <ElButton link type="success" @click="openDownloaded('file')">运行安装包</ElButton>
            </div>
            <ElTable :data="downloadAssets" size="small" class="asset-table" empty-text="暂无可下载资产">
              <ElTableColumn prop="name" label="文件" min-width="260" />
              <ElTableColumn label="类型" width="100">
                <template #default="{ row }">
                  <ElTag size="small" effect="light">{{ assetKindLabel(row.kind) }}</ElTag>
                </template>
              </ElTableColumn>
              <ElTableColumn label="大小" width="120">
                <template #default="{ row }">{{ formatBytes(row.size) }}</template>
              </ElTableColumn>
            </ElTable>
          </div>

          <ElTable
            v-loading="loading"
            :data="updateFeed?.entries || []"
            row-key="version"
            class="version-table"
            empty-text="暂无更新记录"
          >
            <ElTableColumn label="版本" width="120">
              <template #default="{ row }">
                <ElTag :type="row.version === updateFeed?.currentVersion ? 'primary' : 'info'" effect="light">
                  v{{ row.version }}
                </ElTag>
              </template>
            </ElTableColumn>
            <ElTableColumn prop="date" label="日期" width="130" />
            <ElTableColumn prop="title" label="标题" min-width="170" />
            <ElTableColumn label="更新内容" min-width="260">
              <template #default="{ row }">
                <ul class="change-list">
                  <li v-for="item in row.content" :key="item">{{ item }}</li>
                </ul>
              </template>
            </ElTableColumn>
            <ElTableColumn label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <ElButton link type="primary" @click="openUrl(row.releaseUrl || appInfo?.releasesUrl)">
                  Release
                </ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
        </ElCard>
      </ElCol>
    </ElRow>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, reactive, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import {
    apiRequest,
    getErrorMessage,
    type AnnouncementFeed,
    type AppInfo,
    type UpdateAsset,
    type UpdateAssetsFeed,
    type UpdateDownloadResult,
    type UpdateFeed
  } from '@/utils/session-manager-api'

  const loading = ref(false)
  const loadingAssets = ref(false)
  const appInfo = ref<AppInfo>()
  const updateFeed = ref<UpdateFeed>()
  const announcementFeed = ref<AnnouncementFeed>()
  const updateAssets = ref<UpdateAssetsFeed>()
  const downloadState = reactive({
    downloading: false,
    percent: 0,
    filePath: '',
    fileName: ''
  })
  const downloadAssets = computed(() =>
    (updateAssets.value?.assets || []).filter((asset) => asset.kind === 'setup' || asset.kind === 'portable')
  )

  onMounted(loadFeeds)

  async function loadFeeds() {
    loading.value = true
    try {
      const [infoData, updateData, announcementData] = await Promise.all([
        apiRequest<AppInfo>('/api/app-info'),
        apiRequest<UpdateFeed>('/api/updates'),
        apiRequest<AnnouncementFeed>('/api/announcements')
      ])
      appInfo.value = infoData
      updateFeed.value = updateData
      announcementFeed.value = announcementData
      await loadUpdateAssets()
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      loading.value = false
    }
  }

  async function loadUpdateAssets() {
    loadingAssets.value = true
    try {
      updateAssets.value = await apiRequest<UpdateAssetsFeed>('/api/update/assets')
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      loadingAssets.value = false
    }
  }

  function tagType(level?: string) {
    if (level === 'success' || level === 'warning' || level === 'danger') {
      return level
    }
    return 'info'
  }

  function openUrl(url?: string) {
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function downloadUpdate(kind: 'setup' | 'portable') {
    if (downloadState.downloading) return
    downloadState.downloading = true
    downloadState.percent = 0
    downloadState.filePath = ''
    downloadState.fileName = ''

    const source = new EventSource(`/api/update/download/stream?kind=${kind}`)
    source.addEventListener('progress', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { percent: number }
      downloadState.percent = data.percent
    })
    source.addEventListener('done', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as UpdateDownloadResult
      downloadState.downloading = false
      downloadState.percent = 100
      downloadState.filePath = data.filePath
      downloadState.fileName = data.fileName
      source.close()
      ElMessage.success(`已下载 ${data.fileName}`)
    })
    source.addEventListener('fail', (event) => {
      downloadState.downloading = false
      source.close()
      const data = JSON.parse((event as MessageEvent).data) as { error?: string }
      ElMessage.error(data.error || '下载失败')
    })
    source.onerror = () => {
      if (!downloadState.downloading) return
      downloadState.downloading = false
      source.close()
      ElMessage.error('下载连接中断')
    }
  }

  async function openDownloaded(mode: 'file' | 'folder') {
    if (!downloadState.filePath) return
    try {
      await apiRequest('/api/update/open', {
        method: 'POST',
        body: {
          path: downloadState.filePath,
          mode
        }
      })
      ElMessage.success(mode === 'folder' ? '已打开下载目录' : '已启动安装包')
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    }
  }

  function assetKindLabel(kind: UpdateAsset['kind']) {
    if (kind === 'setup') return '安装包'
    if (kind === 'portable') return '便携包'
    return '其他'
  }

  function formatBytes(bytes: number) {
    if (!bytes) return '-'
    const mb = bytes / 1024 / 1024
    return `${mb.toFixed(1)} MB`
  }
</script>

<style scoped lang="scss">
  .about-page {
    display: grid;
    gap: 16px;
  }

  .about-hero {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 18px 22px;
  }

  .brand-mark {
    width: 54px;
    height: 54px;
    flex: 0 0 54px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--art-card-border);
    border-radius: 12px;
    background: var(--default-box-color);

    img {
      width: 38px;
      height: 38px;
    }
  }

  .brand-copy {
    min-width: 0;
    flex: 1;

    h2 {
      margin: 0;
      color: var(--art-gray-900);
      font-size: 22px;
      font-weight: 600;
      line-height: 30px;
    }

    p {
      margin: 5px 0 0;
      color: var(--art-gray-600);
      font-size: 14px;
      line-height: 22px;
    }
  }

  .brand-actions,
  .release-header,
  .card-title,
  .announcement-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .card-title {
    color: var(--art-gray-900);
    font-weight: 600;
  }

  .about-card {
    margin-bottom: 16px;
  }

  .release-card {
    margin-bottom: 0;
  }

  .release-header,
  .announcement-head {
    justify-content: space-between;
  }

  .update-alert {
    margin-bottom: 14px;
  }

  .download-panel {
    display: grid;
    gap: 12px;
    margin-bottom: 16px;
    padding: 14px;
    border: 1px solid var(--art-card-border);
    border-radius: 8px;
    background: var(--default-bg-color);
  }

  .download-head,
  .download-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .download-head {
    flex-wrap: wrap;

    > div {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }

    strong {
      color: var(--art-gray-900);
      font-size: 15px;
    }

    span {
      color: var(--art-gray-500);
      font-size: 13px;
    }
  }

  .download-actions {
    justify-content: flex-start;
    flex-wrap: wrap;

    span {
      color: var(--art-gray-700);
    }
  }

  .asset-table {
    :deep(.el-table__cell) {
      padding-top: 8px;
      padding-bottom: 8px;
    }
  }

  .announcement-list {
    display: grid;
    gap: 12px;
  }

  .announcement-item {
    padding: 12px;
    border: 1px solid var(--art-card-border);
    border-radius: 8px;
    background: var(--default-bg-color);

    strong {
      color: var(--art-gray-900);
    }

    p {
      margin: 8px 0 0;
      color: var(--art-gray-600);
      line-height: 22px;
    }
  }

  .change-list {
    margin: 0;
    padding-left: 18px;
    color: var(--art-gray-700);
    line-height: 22px;
  }

  @media (width <= 768px) {
    .about-hero {
      align-items: stretch;
      flex-direction: column;
    }

    .brand-actions {
      justify-content: flex-start;
    }
  }
</style>
