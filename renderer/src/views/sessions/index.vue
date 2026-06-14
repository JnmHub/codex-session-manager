<template>
  <div class="sessions-page art-full-height">
    <section class="overview art-card">
      <div class="overview-main">
        <div class="overview-icon">
          <ArtSvgIcon icon="ri:terminal-box-line" />
        </div>
        <div>
          <h2>会话管家</h2>
          <p>统一管理本机 Codex 历史会话、备注、归档、路径绑定和一键恢复。Jnm Copyright</p>
        </div>
      </div>
      <div class="overview-actions">
        <ElButton :loading="loading" @click="scanSessions" v-ripple>
          <template #icon><Refresh /></template>
          扫描会话
        </ElButton>
        <ElButton type="primary" :disabled="!selectedSession" @click="openSession(false)" v-ripple>
          <template #icon><VideoPlay /></template>
          打开会话
        </ElButton>
        <ElButton :disabled="!selectedSession || !isWindowOpen(selectedSession)" @click="reopenSessionWindow(selectedSession)" v-ripple>
          <template #icon><RefreshRight /></template>
          关闭并重开
        </ElButton>
      </div>
    </section>

    <ElRow :gutter="16" class="stats-row">
      <ElCol :xs="12" :sm="12" :md="6">
        <ArtStatsCard
          title="全部会话"
          description="已索引记录"
          icon="ri:database-2-line"
          icon-style="bg-blue-500"
          :count="sessions.length"
        />
      </ElCol>
      <ElCol :xs="12" :sm="12" :md="6">
        <ArtStatsCard
          title="已归档"
          description="暂时隐藏"
          icon="ri:archive-line"
          icon-style="bg-purple-500"
          :count="archivedCount"
        />
      </ElCol>
      <ElCol :xs="12" :sm="12" :md="6">
        <ArtStatsCard
          title="路径失效"
          description="需要重新绑定"
          icon="ri:error-warning-line"
          icon-style="bg-amber-500"
          :count="missingCount"
        />
      </ElCol>
      <ElCol :xs="12" :sm="12" :md="6">
        <ArtStatsCard
          title="项目数"
          description="关联工作目录"
          icon="ri:folder-3-line"
          icon-style="bg-emerald-500"
          :count="projects.length"
        />
      </ElCol>
    </ElRow>

    <ArtSearchBar
      v-show="showSearchBar"
      v-model="filterForm"
      :items="searchItems"
      :span="8"
      label-width="58px"
      :show-expand="false"
      @search="applySearch"
      @reset="resetSearch"
    >
      <template #status>
        <ElSegmented v-model="filterForm.status" :options="statusOptions" />
      </template>
    </ArtSearchBar>

    <ElCard class="art-table-card table-panel" shadow="never">
      <ArtTableHeader
        v-model:columns="columns"
        v-model:show-search-bar="showSearchBar"
        :loading="loading"
        layout="search,refresh,size,fullscreen,columns"
        @refresh="loadData"
      >
        <template #left>
          <div class="table-title">
            <h3>会话列表</h3>
            <span>{{ filteredSessions.length }} / {{ sessions.length }} 条</span>
          </div>
        </template>
        <template #right>
          <ElButton type="primary" :disabled="!selectedSession" @click="editSelected" v-ripple>
            <template #icon><EditPen /></template>
            编辑
          </ElButton>
        </template>
      </ArtTableHeader>

      <ElTable
        v-loading="loading"
        row-key="id"
        highlight-current-row
        :data="filteredSessions"
        class="session-table"
        height="calc(100vh - 430px)"
        empty-text="暂无会话"
        @current-change="selectSession"
        @row-dblclick="(row: SessionRecord) => editSession(row)"
      >
        <ElTableColumn v-if="isColumnVisible('session')" label="会话" min-width="360">
          <template #default="{ row }">
            <div class="session-cell">
              <div class="session-title">
                <ElIcon v-if="(row as SessionRecord).favorite" class="favorite">
                  <StarFilled />
                </ElIcon>
                <span>
                  {{
                    (row as SessionRecord).summary ||
                    (row as SessionRecord).note ||
                    shortId((row as SessionRecord).id)
                  }}
                </span>
              </div>
              <div class="session-meta">
                <ElTag size="small" effect="plain">{{ shortId((row as SessionRecord).id) }}</ElTag>
                <span>{{ formatDate((row as SessionRecord).updatedAt) }}</span>
              </div>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn v-if="isColumnVisible('project')" label="项目" min-width="260">
          <template #default="{ row }">
            <div class="project-cell">
              <strong>{{ projectLabel(activePath(row as SessionRecord)) }}</strong>
              <span>{{ activePath(row as SessionRecord) }}</span>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn v-if="isColumnVisible('status')" label="状态" width="110">
          <template #default="{ row }">
            <ElTag :type="statusTag(row as SessionRecord).type" effect="light" round>
              {{ statusTag(row as SessionRecord).label }}
            </ElTag>
          </template>
        </ElTableColumn>

        <ElTableColumn v-if="isColumnVisible('note')" label="备注" min-width="200">
          <template #default="{ row }">
            <span class="note-text">{{ (row as SessionRecord).note || '未备注' }}</span>
          </template>
        </ElTableColumn>

        <ElTableColumn v-if="isColumnVisible('actions')" label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <ElButton link type="primary" @click.stop="openSession(false, row as SessionRecord)">
                打开
              </ElButton>
              <ElButton
                v-if="isWindowOpen(row as SessionRecord)"
                link
                type="success"
                @click.stop="reopenSessionWindow(row as SessionRecord)"
              >
                重开
              </ElButton>
              <ElButton link @click.stop="editSession(row as SessionRecord)">详情</ElButton>
              <ElButton link @click.stop="toggleFavorite(row as SessionRecord)">
                {{ (row as SessionRecord).favorite ? '取消收藏' : '收藏' }}
              </ElButton>
              <ElButton
                link
                :type="(row as SessionRecord).archived ? 'success' : 'warning'"
                @click.stop="toggleArchive(row as SessionRecord)"
              >
                {{ (row as SessionRecord).archived ? '取消归档' : '归档' }}
              </ElButton>
            </div>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <ElDrawer v-model="drawerVisible" size="480px" title="会话详情" append-to-body>
      <ElTabs v-if="editingSession" v-model="detailTab">
        <ElTabPane label="配置" name="config">
          <ElForm label-position="top" class="detail-form">
            <ElFormItem label="会话 ID">
              <ElInput :model-value="editingSession.id" readonly />
            </ElFormItem>
            <ElFormItem label="备注">
              <ElInput
                v-model="detailForm.note"
                type="textarea"
                :rows="4"
                placeholder="给这个会话写一点说明"
              />
            </ElFormItem>
            <ElFormItem label="绑定路径">
              <ElInput v-model="detailForm.boundPath" placeholder="项目移动后填新路径">
                <template #append>
                  <ElButton @click="selectBoundPath">选择文件夹</ElButton>
                </template>
              </ElInput>
            </ElFormItem>
            <ElFormItem label="Profile">
              <ElSelect v-model="detailForm.profile" filterable clearable placeholder="使用全局 Profile">
                <ElOption v-for="profile in profiles" :key="profile.id" :label="profile.name" :value="profile.name" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem>
              <ElCheckbox v-model="detailForm.yolo">此会话开启 Yolo 模式</ElCheckbox>
            </ElFormItem>

            <ElDescriptions :column="1" border class="detail-descriptions">
              <ElDescriptionsItem label="摘要">{{ editingSession.summary || '无摘要' }}</ElDescriptionsItem>
              <ElDescriptionsItem label="当前路径">{{ activePath(editingSession) }}</ElDescriptionsItem>
              <ElDescriptionsItem label="原始路径">{{ editingSession.cwd }}</ElDescriptionsItem>
              <ElDescriptionsItem label="窗口状态">
                <div class="window-status">
                  <ElTag :type="windowStatus?.open ? 'success' : 'info'" effect="light">
                    {{ windowStatus?.open ? '已打开' : '未检测到' }}
                  </ElTag>
                  <ElButton link size="small" @click="loadWindowStatus">刷新</ElButton>
                  <ElButton
                    link
                    size="small"
                    type="success"
                    :disabled="!windowStatus?.open"
                    @click="reopenSessionWindow(editingSession)"
                  >
                    关闭并重开
                  </ElButton>
                </div>
              </ElDescriptionsItem>
            </ElDescriptions>
          </ElForm>
        </ElTabPane>
        <ElTabPane label="聊天记录" name="transcript">
          <div class="transcript-toolbar">
            <ElTag :type="transcriptEdited ? 'warning' : 'info'" effect="light">
              {{ transcriptEdited ? '编辑副本' : '原始记录' }}
            </ElTag>
            <div>
              <ElButton size="small" @click="loadTranscript">刷新</ElButton>
              <ElButton size="small" type="warning" @click="resetTranscript">还原</ElButton>
            </div>
          </div>
          <ElScrollbar height="520px" class="transcript-list">
            <div v-for="message in transcriptMessages" :key="message.id" class="message-item">
              <div class="message-meta">
                <ElTag size="small" effect="plain">{{ roleLabel(message.role) }}</ElTag>
                <span>{{ message.timestamp ? formatDate(message.timestamp) : 'unknown' }}</span>
              </div>
              <ElInput v-model="message.text" type="textarea" :autosize="{ minRows: 2, maxRows: 10 }" />
            </div>
          </ElScrollbar>
        </ElTabPane>
      </ElTabs>

      <template #footer>
        <div class="drawer-footer">
          <ElButton @click="drawerVisible = false">关闭</ElButton>
          <ElButton :disabled="!editingSession" @click="openSession(true)">复制命令</ElButton>
          <ElButton :disabled="!editingSession" @click="saveTranscript">保存聊天</ElButton>
          <ElButton type="primary" :disabled="!editingSession" @click="saveDetail">保存</ElButton>
        </div>
      </template>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { ElMessage } from 'element-plus'
  import { EditPen, Refresh, RefreshRight, StarFilled, VideoPlay } from '@element-plus/icons-vue'
  import type { ColumnOption } from '@/types'
  import { apiRequest, getErrorMessage } from '@/utils/session-manager-api'

  type SessionRecord = {
    id: string
    createdAt: string
    updatedAt: string
    cwd: string
    filePath: string
    summary?: string
    note?: string
    tags: string[]
    archived: boolean
    favorite: boolean
    boundPath?: string
    profile?: string
    yolo?: boolean
  }

  type ProjectRecord = {
    path: string
    count: number
    missing: boolean
    latest: string
  }

  type ProfileRecord = {
    id: string
    name: string
    note?: string
  }

  type TranscriptMessage = {
    id: string
    role: 'user' | 'assistant' | 'system' | 'tool' | 'unknown'
    text: string
    timestamp?: string
    source: 'original' | 'edited'
    line?: number
  }

  type SessionWindowStatus = {
    id: string
    open: boolean
    processes: Array<{ pid: number; name: string; title: string }>
  }

  const route = useRoute()
  const loading = ref(false)
  const showSearchBar = ref(false)
  const sessions = ref<SessionRecord[]>([])
  const projects = ref<ProjectRecord[]>([])
  const profiles = ref<ProfileRecord[]>([])
  const selectedSession = ref<SessionRecord>()
  const editingSession = ref<SessionRecord>()
  const drawerVisible = ref(false)
  const detailTab = ref('config')
  const transcriptMessages = ref<TranscriptMessage[]>([])
  const transcriptEdited = ref(false)
  const windowStatus = ref<SessionWindowStatus>()
  const windowStatuses = ref<Record<string, SessionWindowStatus>>({})
  let windowStatusTimer: number | undefined

  const filterForm = reactive({
    keyword: '',
    project: '',
    status: 'active'
  })

  const detailForm = reactive({
    note: '',
    boundPath: '',
    profile: '',
    yolo: false
  })

  const statusOptions = [
    { label: '未归档', value: 'active' },
    { label: '已归档', value: 'archived' },
    { label: '全部', value: 'all' },
    { label: '路径失效', value: 'missing' },
    { label: '收藏', value: 'favorite' }
  ]

  const searchItems = computed(() => [
    {
      key: 'keyword',
      label: '关键词',
      type: 'input',
      props: {
        clearable: true,
        placeholder: '搜索 ID、项目、备注、摘要'
      }
    },
    {
      key: 'project',
      label: '项目',
      type: 'select',
      props: {
        filterable: true,
        clearable: true,
        placeholder: '全部项目',
        options: projects.value.map((project) => ({
          label: `${projectLabel(project.path)} (${project.count})`,
          value: project.path
        }))
      }
    },
    {
      key: 'status',
      label: '状态',
      span: 8
    }
  ])

  const columns = ref<ColumnOption<SessionRecord>[]>([
    {
      prop: 'session',
      label: '会话',
      minWidth: 360,
      useSlot: true
    },
    {
      prop: 'project',
      label: '项目',
      minWidth: 260,
      useSlot: true
    },
    {
      prop: 'status',
      label: '状态',
      width: 110,
      useSlot: true
    },
    {
      prop: 'note',
      label: '备注',
      minWidth: 200,
      useSlot: true
    },
    {
      prop: 'actions',
      label: '操作',
      width: 280,
      fixed: 'right',
      useSlot: true,
      disabled: true
    }
  ])

  const archivedCount = computed(() => sessions.value.filter((item) => item.archived).length)
  const missingCount = computed(() => sessions.value.filter((item) => isMissing(item)).length)

  const filteredSessions = computed(() => {
    const keyword = filterForm.keyword.trim().toLowerCase()
    return sessions.value.filter((session) => {
      if (filterForm.status === 'active' && session.archived) return false
      if (filterForm.status === 'archived' && !session.archived) return false
      if (filterForm.status === 'missing' && !isMissing(session)) return false
      if (filterForm.status === 'favorite' && !session.favorite) return false
      if (filterForm.project && activePath(session) !== filterForm.project) return false
      if (!keyword) return true

      return [session.id, session.cwd, session.boundPath, session.note, session.summary]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    })
  })

  onMounted(async () => {
    applyRouteMode()
    await loadData()
    windowStatusTimer = window.setInterval(() => {
      void refreshWindowStatuses()
    }, 5000)
  })

  onUnmounted(() => {
    if (windowStatusTimer) {
      window.clearInterval(windowStatusTimer)
    }
  })

  watch(() => route.path, () => {
    applyRouteMode()
    applySearch()
  })

  async function loadData() {
    loading.value = true
    try {
      const [sessionData, projectData, profileData] = await Promise.all([
        apiRequest<{ sessions: SessionRecord[] }>('/api/sessions?all=1&limit=500'),
        apiRequest<{ projects: ProjectRecord[] }>('/api/projects'),
        apiRequest<{ profiles: ProfileRecord[] }>('/api/profiles')
      ])
      sessions.value = sessionData.sessions
      projects.value = projectData.projects
      profiles.value = profileData.profiles
      selectedSession.value = filteredSessions.value[0]
      await loadWindowStatuses(sessionData.sessions.map((session) => session.id))
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      loading.value = false
    }
  }

  async function scanSessions() {
    loading.value = true
    try {
      await apiRequest('/api/scan', { method: 'POST' })
      await loadData()
      ElMessage.success('扫描完成')
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      loading.value = false
    }
  }

  function applySearch() {
    selectedSession.value = filteredSessions.value[0]
  }

  function resetSearch() {
    filterForm.keyword = ''
    filterForm.project = ''
    filterForm.status = 'active'
    applyRouteMode()
    applySearch()
  }

  function selectSession(row: SessionRecord | null) {
    selectedSession.value = row || undefined
  }

  function editSelected() {
    if (selectedSession.value) editSession(selectedSession.value)
  }

  function editSession(row: SessionRecord) {
    editingSession.value = row
    selectedSession.value = row
    detailForm.note = row.note || ''
    detailForm.boundPath = row.boundPath || ''
    detailForm.profile = row.profile || ''
    detailForm.yolo = Boolean(row.yolo)
    detailTab.value = 'config'
    drawerVisible.value = true
    void loadTranscript()
    void loadWindowStatus()
  }

  function isColumnVisible(prop: string) {
    const column = columns.value.find((item) => item.prop === prop)
    return column ? column.visible !== false && column.checked !== false : true
  }

  async function saveDetail() {
    if (!editingSession.value) return
    try {
      await apiRequest('/api/note', {
        method: 'POST',
        body: { id: editingSession.value.id, note: detailForm.note }
      })
      if (detailForm.boundPath.trim()) {
        await apiRequest('/api/bind', {
          method: 'POST',
          body: { id: editingSession.value.id, path: detailForm.boundPath.trim() }
        })
      }
      await apiRequest('/api/session-options', {
        method: 'POST',
        body: {
          id: editingSession.value.id,
          profile: detailForm.profile.trim(),
          yolo: detailForm.yolo
        }
      })
      ElMessage.success('已保存')
      drawerVisible.value = false
      await loadData()
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    }
  }

  async function openSession(dryRun: boolean, target?: SessionRecord) {
    const session = target || editingSession.value || selectedSession.value
    if (!session) return

    try {
      const result = await apiRequest<{ command: string }>('/api/open', {
        method: 'POST',
        body: buildLaunchBody(session, dryRun)
      })

      if (dryRun) {
        await navigator.clipboard?.writeText(result.command)
        ElMessage.success('命令已复制')
      } else {
        ElMessage.success('打开请求已发送')
        setTimeout(() => {
          void refreshWindowStatuses()
          void loadWindowStatus()
        }, 900)
      }
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    }
  }

  async function toggleFavorite(row: SessionRecord) {
    try {
      await apiRequest('/api/favorite', { method: 'POST', body: { id: row.id } })
      await loadData()
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    }
  }

  async function toggleArchive(row: SessionRecord) {
    try {
      await apiRequest('/api/archive', { method: 'POST', body: { id: row.id } })
      await loadData()
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    }
  }

  function activePath(session: SessionRecord) {
    return session.boundPath || session.cwd || ''
  }

  function isMissing(session: SessionRecord) {
    const project = projects.value.find((item) => item.path === activePath(session))
    return project ? project.missing : false
  }

  function statusTag(session: SessionRecord) {
    if (isWindowOpen(session)) return { label: '已打开', type: 'primary' as const }
    if (session.archived) return { label: '已归档', type: 'info' as const }
    if (isMissing(session)) return { label: '路径失效', type: 'warning' as const }
    return { label: '可打开', type: 'success' as const }
  }

  function shortId(id: string) {
    return id.slice(0, 8)
  }

  function projectLabel(value: string) {
    if (!value) return '未绑定'
    return value.split(/[\\/]/).filter(Boolean).at(-1) || value
  }

  function formatDate(value: string) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleString()
  }

  function applyRouteMode() {
    if (route.path.includes('/favorites')) {
      filterForm.status = 'favorite'
    } else if (route.path.includes('/archived')) {
      filterForm.status = 'archived'
    } else {
      filterForm.status = 'active'
    }
  }

  function buildLaunchBody(session: SessionRecord, dryRun: boolean) {
    const isEditing = editingSession.value?.id === session.id
    return {
      id: session.id,
      dryRun,
      profile: isEditing ? detailForm.profile : session.profile,
      yolo: isEditing ? detailForm.yolo : session.yolo
    }
  }

  async function selectBoundPath() {
    const selected = await window.sessionManager?.selectDirectory()
    if (selected) {
      detailForm.boundPath = selected
    }
  }

  async function loadTranscript() {
    if (!editingSession.value) return
    try {
      const data = await apiRequest<{
        messages: TranscriptMessage[]
        edited: boolean
      }>(`/api/transcript?id=${encodeURIComponent(editingSession.value.id)}`)
      transcriptMessages.value = data.messages
      transcriptEdited.value = data.edited
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    }
  }

  async function saveTranscript() {
    if (!editingSession.value) return
    try {
      await apiRequest('/api/transcript', {
        method: 'POST',
        body: { id: editingSession.value.id, messages: transcriptMessages.value }
      })
      transcriptEdited.value = true
      ElMessage.success('聊天编辑副本已保存')
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    }
  }

  async function resetTranscript() {
    if (!editingSession.value) return
    try {
      await apiRequest('/api/transcript/reset', {
        method: 'POST',
        body: { id: editingSession.value.id }
      })
      await loadTranscript()
      ElMessage.success('已还原原始记录')
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    }
  }

  async function loadWindowStatus() {
    if (!editingSession.value) return
    try {
      windowStatus.value = await apiRequest<SessionWindowStatus>(
        `/api/session-window?id=${encodeURIComponent(editingSession.value.id)}`
      )
      windowStatuses.value = {
        ...windowStatuses.value,
        [windowStatus.value.id]: windowStatus.value
      }
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    }
  }

  async function loadWindowStatuses(ids: string[]) {
    if (!ids.length) {
      windowStatuses.value = {}
      return
    }
    const data = await apiRequest<{ statuses: SessionWindowStatus[] }>('/api/session-windows/statuses', {
      method: 'POST',
      body: { ids }
    })
    windowStatuses.value = Object.fromEntries(data.statuses.map((status) => [status.id, status]))
  }

  async function refreshWindowStatuses() {
    if (!sessions.value.length) return
    try {
      await loadWindowStatuses(sessions.value.map((session) => session.id))
      if (editingSession.value) {
        windowStatus.value = windowStatuses.value[editingSession.value.id]
      }
    } catch {
      // 状态轮询失败不打扰用户，手动刷新或下一轮轮询会重试。
    }
  }

  async function reopenSessionWindow(target?: SessionRecord) {
    const session = target || editingSession.value || selectedSession.value
    if (!session) return
    try {
      const result = await apiRequest<{ closed: number; command: string }>('/api/session-window/reopen', {
        method: 'POST',
        body: buildLaunchBody(session, false)
      })
      ElMessage.success(`已关闭 ${result.closed} 个旧窗口并重新打开`)
      setTimeout(() => {
        void refreshWindowStatuses()
        if (editingSession.value?.id === session.id) {
          void loadWindowStatus()
        }
      }, 900)
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    }
  }

  function isWindowOpen(session?: SessionRecord) {
    return Boolean(session && windowStatuses.value[session.id]?.open)
  }

  function roleLabel(role: TranscriptMessage['role']) {
    const map = {
      user: '用户',
      assistant: '助手',
      system: '系统',
      tool: '工具',
      unknown: '未知'
    }
    return map[role]
  }
</script>

<style scoped lang="scss">
  .sessions-page {
    display: grid;
    gap: 16px;
  }

  .overview {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 82px;
    padding: 16px 24px;
  }

  .overview-main {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 16px;

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

  .overview-icon {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 14px;
    color: #fff;
    font-size: 26px;
    background: linear-gradient(135deg, var(--theme-color), #36cfc9);
    box-shadow: 0 12px 28px rgb(var(--theme-color-rgb) / 18%);
  }

  .overview-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
  }

  .stats-row {
    row-gap: 16px;

    :deep(.art-card) {
      height: 96px;
      padding-top: 14px;
      padding-bottom: 14px;
    }
  }

  .table-panel {
    min-width: 0;

    :deep(.el-card__body) {
      display: grid;
      gap: 14px;
    }
  }

  .table-title {
    display: flex;
    align-items: center;
    gap: 10px;

    h3 {
      margin: 0;
      color: var(--art-gray-900);
      font-size: 16px;
      font-weight: 600;
    }

    span {
      color: var(--art-gray-500);
      font-size: 13px;
    }
  }

  .session-cell,
  .project-cell {
    min-width: 0;
  }

  .session-title {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 6px;

    span {
      overflow: hidden;
      color: var(--art-gray-900);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .favorite {
    color: #f59e0b;
  }

  .session-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    color: var(--art-gray-500);
    font-size: 12px;
  }

  .project-cell {
    display: grid;
    gap: 4px;

    strong,
    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      color: var(--art-gray-900);
      font-weight: 600;
    }

    span {
      color: var(--art-gray-500);
      font-size: 12px;
    }
  }

  .note-text {
    display: block;
    overflow: hidden;
    color: var(--art-gray-600);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 8px;
  }

  .window-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .detail-form {
    :deep(.el-textarea__inner) {
      resize: vertical;
    }
  }

  .detail-descriptions {
    margin-top: 10px;
  }

  .drawer-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .transcript-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .transcript-list {
    padding-right: 8px;
  }

  .message-item {
    display: grid;
    gap: 8px;
    margin-bottom: 14px;
  }

  .message-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--art-gray-500);
    font-size: 12px;
  }

  @media (width <= 768px) {
    .overview {
      align-items: stretch;
      flex-direction: column;
      padding: 18px;
    }

    .overview-actions {
      justify-content: flex-start;
    }

    .overview-main h2 {
      font-size: 20px;
    }
  }
</style>
