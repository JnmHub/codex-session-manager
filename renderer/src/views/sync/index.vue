<template>
  <div class="sync-page art-full-height">
    <ElCard class="art-table-card" shadow="never">
      <template #header>
        <div class="page-header">
          <div>
            <h2>同步中心</h2>
            <p>从公开 registry 同步 Skills 和 Profile。Skills 可安装到全局或项目，Profile 安装到 CODEX_HOME。</p>
          </div>
          <div class="header-actions">
            <ElButton :loading="loading" @click="loadRegistry">读取仓库</ElButton>
            <ElButton type="primary" :loading="installing" :disabled="!selectedActionableRows.length" @click="installSelected">
              同步所选
            </ElButton>
            <ElButton type="success" :loading="installing" :disabled="!actionableRows.length" @click="installAll">
              安装/更新全部
            </ElButton>
          </div>
        </div>
      </template>

      <div class="sync-toolbar">
        <ElInput v-model="registryUrl" placeholder="registry.json URL" clearable />
        <ElSelect v-model="skillScope" class="scope-select">
          <ElOption label="Skills 安装到全局" value="global" />
          <ElOption label="Skills 安装到项目" value="project" />
        </ElSelect>
        <div v-if="skillScope === 'project'" class="project-picker">
          <ProjectPathPicker
            v-model="projectPath"
            placeholder="从已有会话选择项目路径，也可手动输入"
            @change="loadRegistry"
          />
        </div>
      </div>

      <div class="registry-meta">
        <ElTag effect="plain">{{ registry?.name || '未读取' }}</ElTag>
        <span v-if="registry?.version">版本 {{ registry.version }}</span>
        <span v-if="registry?.updatedAt">更新于 {{ registry.updatedAt }}</span>
        <span>{{ filteredRows.length }} / {{ allRows.length }} 项</span>
      </div>

      <div class="filter-row">
        <ElInput v-model="keyword" placeholder="搜索名称、说明、标签" clearable />
        <ElSegmented v-model="typeFilter" :options="typeOptions" />
      </div>

      <ElTable
        ref="tableRef"
        v-loading="loading"
        :data="filteredRows"
        row-key="key"
        height="calc(100vh - 360px)"
        empty-text="暂无同步项"
        @selection-change="selectedRows = $event"
      >
        <ElTableColumn type="selection" width="44" />
        <ElTableColumn label="类型" width="136">
          <template #default="{ row }">
            <div class="type-pill" :class="`is-${row.type}`">
              <span class="type-dot"></span>
              <span>{{ row.typeLabel }}</span>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="名称" min-width="220">
          <template #default="{ row }">
            <div class="name-cell">
              <strong>{{ row.name }}</strong>
              <small>{{ row.installTarget }}</small>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="description" label="说明" min-width="320" show-overflow-tooltip />
        <ElTableColumn label="标签" min-width="180">
          <template #default="{ row }">
            <div class="tag-list">
              <ElTag v-for="tag in row.tags" :key="tag" size="small" effect="plain">{{ tag }}</ElTag>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="来源" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="source-cell">
              <span>{{ row.sourceLabel }}</span>
              <small v-if="row.sourceDetail">{{ row.sourceDetail }}</small>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="本地状态" width="150">
          <template #default="{ row }">
            <div class="local-status">
              <ElTag :type="localStatusType(row)" effect="light">
                {{ localStatusLabel(row) }}
              </ElTag>
              <small v-if="row.local?.installedVersion">本地 {{ row.local.installedVersion }}</small>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="版本" width="130">
          <template #default="{ row }">
            <div class="version-cell">
              <strong>{{ row.version || '未标记' }}</strong>
              <small v-if="row.updatedAt">{{ formatDate(row.updatedAt) }}</small>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="126" fixed="right">
          <template #default="{ row }">
            <ElButton
              size="small"
              type="primary"
              plain
              :loading="installingKey === row.key"
              :disabled="!canInstallRow(row) || (installing && installingKey !== row.key)"
              @click="installOne(row)"
            >
              {{ actionLabel(row) }}
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import ProjectPathPicker from '@/components/session-manager/ProjectPathPicker.vue'
  import { apiRequest, getErrorMessage } from '@/utils/session-manager-api'

  type SyncRow = {
    key: string
    id: string
    type: 'skill' | 'profile'
    typeLabel: string
    installTarget: string
    name: string
    version?: string
    updatedAt?: string
    description?: string
    source?: string
    sourceLabel: string
    sourceDetail?: string
    tags?: string[]
    local?: {
      installed: boolean
      tracked: boolean
      updateAvailable: boolean
      state: 'not-installed' | 'installed-untracked' | 'update-available' | 'current'
      installedVersion?: string
      installedRemoteUpdatedAt?: string
      installedAt?: string
    }
  }

  type RegistryData = {
    url: string
    name: string
    version?: string
    updatedAt?: string
    skills: Array<any>
    profiles: Array<any>
    count: number
  }

  const rawDefaultUrl = 'https://raw.githubusercontent.com/JnmHub/codex-session-registry/main/registry.json'
  const defaultUrl =
    'https://github.aiceo.dev/proxy?url=https%3A%2F%2Fraw.githubusercontent.com%2FJnmHub%2Fcodex-session-registry%2Fmain%2Fregistry.json'
  const savedRegistryUrl = localStorage.getItem('cxm-sync-registry-url')
  const registryUrl = ref(!savedRegistryUrl || savedRegistryUrl === rawDefaultUrl ? defaultUrl : savedRegistryUrl)
  const skillScope = ref<'global' | 'project'>('global')
  const projectPath = ref('')
  const keyword = ref('')
  const typeFilter = ref<'all' | 'skill' | 'profile'>('all')
  const loading = ref(false)
  const installing = ref(false)
  const installingKey = ref('')
  const registry = ref<RegistryData>()
  const selectedRows = ref<SyncRow[]>([])
  const tableRef = ref()
  const typeOptions = [
    { label: '全部', value: 'all' },
    { label: 'Skills', value: 'skill' },
    { label: 'Profile', value: 'profile' }
  ]

  const allRows = computed<SyncRow[]>(() => {
    const skills = (registry.value?.skills || []).map((item) => ({
      key: `skill:${item.id}`,
      id: item.id,
      type: 'skill' as const,
      typeLabel: 'Skill 技能包',
      installTarget: skillScope.value === 'project' ? '安装到项目 .codex/skills' : '安装到全局 ~/.codex/skills',
      name: item.name,
      version: item.version,
      updatedAt: item.updatedAt,
      description: item.description,
      tags: item.tags || [],
      source: item.skillUrl || item.files?.[0]?.url,
      sourceLabel: getSkillSourceLabel(item),
      sourceDetail: getSkillSourceDetail(item),
      local: item.local
    }))
    const profiles = (registry.value?.profiles || []).map((item) => ({
      key: `profile:${item.id}`,
      id: item.id,
      type: 'profile' as const,
      typeLabel: 'Profile 配置',
      installTarget: '安装到 CODEX_HOME',
      name: item.name,
      version: item.version,
      updatedAt: item.updatedAt,
      description: item.note,
      tags: item.tags || [],
      source: item.configUrl || item.markdownUrl,
      sourceLabel: item.configUrl || item.markdownUrl ? '远程 Profile 文件' : 'Registry 内嵌内容',
      sourceDetail: item.configUrl || item.markdownUrl,
      local: item.local
    }))
    return [...skills, ...profiles]
  })

  const actionableRows = computed(() => allRows.value.filter(canInstallRow))
  const selectedActionableRows = computed(() => selectedRows.value.filter(canInstallRow))

  const filteredRows = computed(() => {
    const q = keyword.value.trim().toLowerCase()
    return allRows.value.filter((row) => {
      if (typeFilter.value !== 'all' && row.type !== typeFilter.value) return false
      if (!q) return true
      return [row.name, row.typeLabel, row.installTarget, row.description, row.source, ...(row.tags || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    })
  })

  onMounted(loadRegistry)

  async function loadRegistry() {
    loading.value = true
    try {
      localStorage.setItem('cxm-sync-registry-url', registryUrl.value)
      registry.value = await apiRequest<RegistryData>(
        `/api/sync/registry?url=${encodeURIComponent(registryUrl.value)}&skillScope=${skillScope.value}&projectPath=${encodeURIComponent(projectPath.value)}`
      )
      selectedRows.value = []
      tableRef.value?.clearSelection?.()
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      loading.value = false
    }
  }

  async function installSelected() {
    await installRows(selectedActionableRows.value)
  }

  async function installAll() {
    await installRows(actionableRows.value)
  }

  async function installOne(row: SyncRow) {
    await installRows([row], row.key)
  }

  async function installRows(rows: SyncRow[], activeKey = '') {
    if (skillScope.value === 'project' && !projectPath.value.trim()) {
      ElMessage.warning('请选择项目根目录')
      return
    }
    const targets = rows.filter(canInstallRow)
    if (!targets.length) {
      ElMessage.info('没有需要安装或更新的项目')
      return
    }
    installing.value = true
    installingKey.value = activeKey
    try {
      const result = await apiRequest<{ installed: Array<{ type: string; name: string }> }>('/api/sync/install', {
        method: 'POST',
        body: {
          url: registryUrl.value,
          skillScope: skillScope.value,
          projectPath: projectPath.value,
          items: targets.map((row) => ({ type: row.type, id: row.id }))
        }
      })
      ElMessage.success(`已同步 ${result.installed.length} 项`)
      await loadRegistry()
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      installing.value = false
      installingKey.value = ''
    }
  }

  function getSkillSourceLabel(item: any) {
    if (Array.isArray(item.files) && item.files.length > 0) {
      return `远程多文件 (${item.files.length} 个)`
    }
    if (item.skillUrl) return '远程 Skill 文件'
    return 'Registry 内嵌内容'
  }

  function getSkillSourceDetail(item: any) {
    if (Array.isArray(item.files) && item.files.length > 0) {
      return item.files.length === 1 ? item.files[0].url : `${item.files[0].url} 等`
    }
    return item.skillUrl
  }

  function canInstallRow(row: SyncRow) {
    const state = row.local?.state || 'not-installed'
    return state === 'not-installed' || state === 'update-available' || state === 'installed-untracked'
  }

  function actionLabel(row: SyncRow) {
    const state = row.local?.state || 'not-installed'
    if (state === 'not-installed') return '安装'
    if (state === 'update-available') return '更新'
    if (state === 'installed-untracked') return '重新同步'
    return '已是最新'
  }

  function localStatusLabel(row: SyncRow) {
    const state = row.local?.state || 'not-installed'
    if (state === 'not-installed') return '未安装'
    if (state === 'update-available') return '有更新'
    if (state === 'installed-untracked') return '已安装'
    return '已是最新'
  }

  function localStatusType(row: SyncRow) {
    const state = row.local?.state || 'not-installed'
    if (state === 'not-installed') return 'info'
    if (state === 'update-available') return 'warning'
    if (state === 'installed-untracked') return 'primary'
    return 'success'
  }

  function formatDate(value: string) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
  }
</script>

<style scoped lang="scss">
  .sync-page {
    display: grid;
    gap: 16px;
  }

  .page-header,
  .header-actions,
  .sync-toolbar,
  .project-picker,
  .registry-meta,
  .filter-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .page-header {
    justify-content: space-between;

    h2 {
      margin: 0;
      font-size: 18px;
    }

    p {
      margin: 5px 0 0;
      color: var(--art-gray-600);
    }
  }

  .sync-toolbar,
  .filter-row {
    margin-bottom: 14px;
  }

  .scope-select {
    width: 180px;
    flex: 0 0 180px;
  }

  .project-picker {
    flex: 1;
  }

  .registry-meta {
    margin-bottom: 14px;
    color: var(--art-gray-500);
    font-size: 13px;
  }

  .filter-row {
    justify-content: space-between;

    .el-input {
      max-width: 420px;
    }
  }

  .name-cell {
    display: grid;
    gap: 4px;

    strong {
      color: var(--art-gray-900);
    }

    small {
      color: var(--art-gray-500);
    }
  }

  .type-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-width: 104px;
    height: 30px;
    padding: 0 10px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    border: 1px solid transparent;

    .type-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      flex: 0 0 auto;
    }

    &.is-skill {
      color: #2563eb;
      border-color: rgba(37, 99, 235, 0.26);
      background: rgba(37, 99, 235, 0.08);

      .type-dot {
        background: #2563eb;
      }
    }

    &.is-profile {
      color: #059669;
      border-color: rgba(5, 150, 105, 0.28);
      background: rgba(5, 150, 105, 0.09);

      .type-dot {
        background: #059669;
      }
    }
  }

  .source-cell {
    display: grid;
    gap: 4px;

    span {
      color: var(--art-gray-800);
    }

    small {
      color: var(--art-gray-500);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .local-status,
  .version-cell {
    display: grid;
    gap: 4px;

    small {
      color: var(--art-gray-500);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .version-cell strong {
    color: var(--art-gray-800);
    font-size: 13px;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
</style>
