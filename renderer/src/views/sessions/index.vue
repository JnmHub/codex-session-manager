<template>
  <div class="sessions-page art-full-height">
    <section class="overview art-card">
      <div class="overview-main">
        <div class="overview-icon">
          <ArtSvgIcon icon="ri:terminal-box-line" />
        </div>
        <div>
          <h2>Codex会话管家</h2>
          <p>统一管理本机 Codex 历史会话、分类、备注、归档、路径绑定和一键恢复。Jnm Copyright</p>
        </div>
      </div>
      <div class="overview-actions">
        <ElButton :loading="loading" @click="scanSessions" v-ripple>
          <template #icon><Refresh /></template>
          扫描会话
        </ElButton>
        <ElButton type="success" @click="openNewSessionDialog" v-ripple>
          <template #icon><CirclePlus /></template>
          新建会话
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
            <span v-if="selectedSessions.length">已选 {{ selectedSessions.length }} 条</span>
            <ElSegmented v-model="filterForm.status" :options="statusOptions" class="status-switch" />
          </div>
        </template>
        <template #right>
          <ElButton :disabled="!selectedSessions.length" @click="batchFavorite(true)" v-ripple>
            批量收藏
          </ElButton>
          <ElButton :disabled="!selectedSessions.length" @click="batchArchive(true)" v-ripple>
            批量归档
          </ElButton>
          <ElButton type="danger" plain :disabled="!selectedSessions.length" @click="batchDelete" v-ripple>
            批量删除
          </ElButton>
          <ElButton type="primary" :disabled="!selectedSession" @click="editSelected" v-ripple>
            <template #icon><EditPen /></template>
            编辑
          </ElButton>
        </template>
      </ArtTableHeader>

      <div class="quick-filter-bar">
        <ElInput
          v-model="filterForm.keyword"
          clearable
          placeholder="搜索会话 ID、项目、备注、摘要"
          class="quick-filter-keyword"
          @input="applySearch"
          @clear="applySearch"
        />
        <ElSelect
          v-model="filterForm.category"
          filterable
          clearable
          placeholder="全部分类"
          class="quick-filter-select"
          @change="applySearch"
          @clear="applySearch"
        >
          <ElOption v-for="category in sessionCategories" :key="category" :label="category" :value="category" />
        </ElSelect>
        <ElSelect
          v-model="filterForm.project"
          filterable
          clearable
          placeholder="全部项目"
          class="quick-filter-project"
          @change="applySearch"
          @clear="applySearch"
        >
          <ElOption
            v-for="project in projects"
            :key="project.path"
            :label="`${projectLabel(project.path)} (${project.count})`"
            :value="project.path"
          />
        </ElSelect>
        <ElButton @click="resetSearch" v-ripple>重置筛选</ElButton>
      </div>

      <ElTable
        v-loading="loading"
        row-key="id"
        highlight-current-row
        :data="filteredSessions"
        :size="tableSize"
        class="session-table"
        height="calc(100vh - 430px)"
        empty-text="暂无会话"
        @current-change="selectSession"
        @selection-change="selectedSessions = $event"
        @row-dblclick="(row: SessionRecord) => editSession(row)"
      >
        <ElTableColumn type="selection" width="44" />
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

        <ElTableColumn v-if="isColumnVisible('category')" label="分类" min-width="140">
          <template #default="{ row }">
            <ElTag v-if="(row as SessionRecord).category" size="small" effect="plain">
              {{ (row as SessionRecord).category }}
            </ElTag>
            <span v-else class="note-text">未分类</span>
          </template>
        </ElTableColumn>

        <ElTableColumn v-if="isColumnVisible('note')" label="备注" min-width="200">
          <template #default="{ row }">
            <span class="note-text">{{ (row as SessionRecord).note || '未备注' }}</span>
          </template>
        </ElTableColumn>

        <ElTableColumn v-if="isColumnVisible('actions')" label="操作" width="110" fixed="right" align="center">
          <template #default="{ row }">
            <ElDropdown
              trigger="click"
              @click.stop
              @command="(command: string) => handleRowCommand(command, row as SessionRecord)"
            >
              <ElButton size="small">
                操作
                <ElIcon class="el-icon--right"><ArrowDown /></ElIcon>
              </ElButton>
              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem command="open">打开</ElDropdownItem>
                  <ElDropdownItem command="reopen" :disabled="!isWindowOpen(row as SessionRecord)">
                    关闭并重开
                  </ElDropdownItem>
                  <ElDropdownItem command="detail">详情</ElDropdownItem>
                  <ElDropdownItem command="favorite">
                    {{ (row as SessionRecord).favorite ? '取消收藏' : '收藏' }}
                  </ElDropdownItem>
                  <ElDropdownItem command="archive">
                    {{ (row as SessionRecord).archived ? '取消归档' : '归档' }}
                  </ElDropdownItem>
                  <ElDropdownItem command="delete" divided class="danger-dropdown-item">
                    删除
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <ElDrawer v-model="drawerVisible" size="720px" title="会话详情" append-to-body>
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
            <ElFormItem label="分类">
              <ElSelect
                v-model="detailForm.category"
                allow-create
                filterable
                clearable
                placeholder="选择或输入分类"
              >
                <ElOption v-for="category in sessionCategories" :key="category" :label="category" :value="category" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="绑定路径">
              <ProjectPathPicker
                v-model="detailForm.boundPath"
                placeholder="从已有会话选择新路径，也可手动输入"
              />
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
              <ElDescriptionsItem label="项目快捷入口">
                <div class="window-status">
                  <ElButton link type="primary" @click="openProjectSkills(editingSession)">项目 Skills</ElButton>
                  <ElButton link type="primary" @click="detailTab = 'project-agents'">项目 AGENTS.md</ElButton>
                </div>
              </ElDescriptionsItem>
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
        <ElTabPane label="项目 AGENTS.md" name="project-agents">
          <div class="project-agents-panel">
            <div class="transcript-toolbar">
              <div class="agents-path">
                <strong>{{ projectAgents.path || '项目根目录/AGENTS.md' }}</strong>
                <span>{{ projectAgents.updatedAt ? `更新于 ${formatDate(projectAgents.updatedAt)}` : '文件不存在时保存会创建' }}</span>
              </div>
              <div>
                <ElButton size="small" :loading="projectAgentsLoading" @click="loadProjectAgents">刷新</ElButton>
                <ElButton size="small" type="primary" :loading="projectAgentsSaving" @click="saveProjectAgents">保存</ElButton>
              </div>
            </div>
            <ElInput
              v-model="projectAgents.content"
              type="textarea"
              :rows="22"
              resize="none"
              placeholder="这个项目级 AGENTS.md 会跟随当前会话绑定路径保存"
              class="agents-editor"
            />
          </div>
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
            <div
              v-for="message in transcriptMessages"
              :key="message.id"
              class="transcript-message"
              :class="`transcript-${message.role}`"
            >
              <div class="transcript-avatar">
                {{ roleShortLabel(message.role) }}
              </div>
              <div class="transcript-body">
                <div class="message-meta">
                  <div>
                    <strong>{{ roleLabel(message.role) }}</strong>
                    <span>{{ message.timestamp ? formatDate(message.timestamp) : 'unknown' }}</span>
                  </div>
                  <ElTag size="small" effect="plain" :type="message.source === 'edited' ? 'warning' : 'info'">
                    {{ message.source === 'edited' ? '编辑副本' : '原始' }}
                  </ElTag>
                </div>
                <ElInput
                  v-model="message.text"
                  type="textarea"
                  :autosize="{ minRows: 3, maxRows: 14 }"
                  resize="none"
                  class="transcript-editor"
                />
              </div>
            </div>
          </ElScrollbar>
        </ElTabPane>
      </ElTabs>

      <template #footer>
        <div class="drawer-footer">
          <ElButton type="danger" plain :disabled="!editingSession" @click="deleteSession(editingSession)">
            删除会话
          </ElButton>
          <div class="drawer-actions">
            <ElButton @click="drawerVisible = false">关闭</ElButton>
            <ElButton :disabled="!editingSession" @click="openSession(true)">复制命令</ElButton>
            <ElButton :disabled="!editingSession" @click="saveTranscript">保存聊天</ElButton>
            <ElButton type="primary" :disabled="!editingSession" @click="saveDetail">保存</ElButton>
          </div>
        </div>
      </template>
    </ElDrawer>

    <ElDialog v-model="newSessionVisible" title="新建 Codex 会话" width="720px" append-to-body>
      <ElForm label-position="top" class="new-session-form">
        <ElFormItem label="工作区路径">
          <ProjectPathPicker
            v-model="newSessionForm.workspacePath"
            placeholder="例如 C:\Users\jnmgp\Desktop\new-project，或从已有会话选择"
          />
        </ElFormItem>
        <ElFormItem>
          <ElCheckbox v-model="newSessionForm.createFolder">路径不存在时自动创建文件夹</ElCheckbox>
        </ElFormItem>
        <ElRow :gutter="14">
          <ElCol :xs="24" :md="12">
            <ElFormItem label="Profile">
              <ElSelect v-model="newSessionForm.profile" filterable clearable placeholder="使用全局 Profile">
                <ElOption v-for="profile in profiles" :key="profile.id" :label="profile.name" :value="profile.name" />
              </ElSelect>
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="12">
            <ElFormItem label="Yolo 模式">
              <ElSwitch v-model="newSessionForm.yolo" active-text="开启" inactive-text="关闭" />
            </ElFormItem>
          </ElCol>
        </ElRow>
        <ElFormItem label="初始提示词">
          <ElInput
            v-model="newSessionForm.prompt"
            type="textarea"
            :rows="4"
            placeholder="可选。留空则只打开 Codex 交互会话。"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="newSessionVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="newSessionLoading" @click="createNewSession">创建并打开</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { storeToRefs } from 'pinia'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { ArrowDown, CirclePlus, EditPen, Refresh, StarFilled } from '@element-plus/icons-vue'
  import type { ColumnOption } from '@/types'
  import { useTableStore } from '@/store/modules/table'
  import ProjectPathPicker from '@/components/session-manager/ProjectPathPicker.vue'
  import { apiRequest, getErrorMessage } from '@/utils/session-manager-api'

  type SessionRecord = {
    id: string
    createdAt: string
    updatedAt: string
    cwd: string
    filePath: string
    summary?: string
    note?: string
    category?: string
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
  const router = useRouter()
  const { tableSize } = storeToRefs(useTableStore())
  const loading = ref(false)
  const newSessionLoading = ref(false)
  const showSearchBar = ref(false)
  const newSessionVisible = ref(false)
  const sessions = ref<SessionRecord[]>([])
  const projects = ref<ProjectRecord[]>([])
  const profiles = ref<ProfileRecord[]>([])
  const selectedSession = ref<SessionRecord>()
  const selectedSessions = ref<SessionRecord[]>([])
  const editingSession = ref<SessionRecord>()
  const drawerVisible = ref(false)
  const detailTab = ref('config')
  const transcriptMessages = ref<TranscriptMessage[]>([])
  const transcriptEdited = ref(false)
  const windowStatus = ref<SessionWindowStatus>()
  const windowStatuses = ref<Record<string, SessionWindowStatus>>({})
  const projectAgentsLoading = ref(false)
  const projectAgentsSaving = ref(false)
  let windowStatusTimer: number | undefined

  const filterForm = reactive({
    keyword: '',
    project: '',
    category: '',
    status: 'active'
  })

  const detailForm = reactive({
    note: '',
    category: '',
    boundPath: '',
    profile: '',
    yolo: false
  })
  const projectAgents = reactive({
    path: '',
    content: '',
    updatedAt: ''
  })
  const newSessionForm = reactive({
    workspacePath: '',
    createFolder: true,
    profile: '',
    yolo: true,
    prompt: ''
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
      key: 'category',
      label: '分类',
      type: 'select',
      props: {
        allowCreate: true,
        filterable: true,
        clearable: true,
        placeholder: '全部分类',
        options: sessionCategories.value.map((category) => ({
          label: category,
          value: category
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
      prop: 'category',
      label: '分类',
      minWidth: 140,
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
      width: 110,
      fixed: 'right',
      useSlot: true,
      disabled: true
    }
  ])

  const archivedCount = computed(() => sessions.value.filter((item) => item.archived).length)
  const missingCount = computed(() => sessions.value.filter((item) => isMissing(item)).length)
  const sessionCategories = computed(() =>
    Array.from(new Set(sessions.value.map((session) => session.category).filter(Boolean) as string[])).sort()
  )

  const filteredSessions = computed(() => {
    const keyword = filterForm.keyword.trim().toLowerCase()
    return sessions.value.filter((session) => {
      if (filterForm.status === 'active' && session.archived) return false
      if (filterForm.status === 'archived' && !session.archived) return false
      if (filterForm.status === 'missing' && !isMissing(session)) return false
      if (filterForm.status === 'favorite' && !session.favorite) return false
      if (filterForm.project && activePath(session) !== filterForm.project) return false
      if (filterForm.category && session.category !== filterForm.category) return false
      if (!keyword) return true

      return [session.id, session.cwd, session.boundPath, session.category, session.note, session.summary]
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
      selectedSessions.value = []
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
    filterForm.category = ''
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
    detailForm.category = row.category || ''
    detailForm.boundPath = row.boundPath || ''
    detailForm.profile = row.profile || ''
    detailForm.yolo = Boolean(row.yolo)
    detailTab.value = 'config'
    drawerVisible.value = true
    void loadTranscript()
    void loadWindowStatus()
    void loadProjectAgents()
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
      await apiRequest('/api/category', {
        method: 'POST',
        body: { id: editingSession.value.id, category: detailForm.category }
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

  async function handleRowCommand(command: string, row: SessionRecord) {
    if (command === 'open') {
      await openSession(false, row)
    } else if (command === 'reopen') {
      await reopenSessionWindow(row)
    } else if (command === 'detail') {
      editSession(row)
    } else if (command === 'favorite') {
      await toggleFavorite(row)
    } else if (command === 'archive') {
      await toggleArchive(row)
    } else if (command === 'delete') {
      await deleteSession(row)
    }
  }

  async function deleteSession(row?: SessionRecord) {
    if (!row) return
    const title = row.summary || row.note || shortId(row.id)
    const openHint = isWindowOpen(row) ? '当前检测到这个会话窗口已打开，删除前建议先关闭对应窗口。' : ''
    const confirmed = await ElMessageBox.confirm(
      `确认删除「${title}」？这会从列表移除该会话，并删除 Codex 原始历史文件，操作不可恢复。${openHint}`,
      '删除会话',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger'
      }
    ).then(() => true).catch(() => false)
    if (!confirmed) return

    try {
      await apiRequest('/api/session', {
        method: 'DELETE',
        body: { id: row.id, deleteFile: true }
      })
      if (editingSession.value?.id === row.id) {
        drawerVisible.value = false
        editingSession.value = undefined
      }
      if (selectedSession.value?.id === row.id) {
        selectedSession.value = undefined
      }
      ElMessage.success('会话已删除')
      await loadData()
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    }
  }

  async function batchFavorite(favorite: boolean) {
    await runBatchAction(favorite ? 'favorite' : 'unfavorite', favorite ? '已批量收藏' : '已批量取消收藏')
  }

  async function batchArchive(archived: boolean) {
    await runBatchAction(archived ? 'archive' : 'unarchive', archived ? '已批量归档' : '已批量取消归档')
  }

  async function batchDelete() {
    const count = selectedSessions.value.length
    if (!count) return
    const confirmed = await ElMessageBox.confirm(
      `确认删除选中的 ${count} 个会话？这会从列表移除会话，并删除 Codex 原始历史文件，操作不可恢复。`,
      '批量删除会话',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger'
      }
    ).then(() => true).catch(() => false)
    if (!confirmed) return
    await runBatchAction('delete', `已删除 ${count} 个会话`)
  }

  async function runBatchAction(action: string, message: string) {
    const ids = selectedSessions.value.map((session) => session.id)
    if (!ids.length) return
    loading.value = true
    try {
      await apiRequest('/api/sessions/batch', {
        method: 'POST',
        body: {
          action,
          ids,
          deleteFile: true
        }
      })
      ElMessage.success(message)
      await loadData()
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      loading.value = false
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

  function openNewSessionDialog() {
    newSessionForm.workspacePath = selectedSession.value ? activePath(selectedSession.value) : ''
    newSessionForm.createFolder = true
    newSessionForm.profile = ''
    newSessionForm.yolo = true
    newSessionForm.prompt = ''
    newSessionVisible.value = true
  }

  async function createNewSession() {
    if (!newSessionForm.workspacePath.trim()) {
      ElMessage.warning('请填写或选择工作区路径')
      return
    }
    newSessionLoading.value = true
    try {
      await apiRequest('/api/new-session', {
        method: 'POST',
        body: {
          workspacePath: newSessionForm.workspacePath,
          createFolder: newSessionForm.createFolder,
          profile: newSessionForm.profile,
          yolo: newSessionForm.yolo,
          prompt: newSessionForm.prompt
        }
      })
      ElMessage.success('已打开新 Codex 会话窗口')
      newSessionVisible.value = false
      await loadData()
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      newSessionLoading.value = false
    }
  }

  function openProjectSkills(session?: SessionRecord) {
    if (!session) return
    void router.push({
      path: '/sessions/skills',
      query: {
        scope: 'project',
        projectPath: activePath(session)
      }
    })
  }

  async function loadProjectAgents() {
    if (!editingSession.value) return
    const projectPath = activePath(editingSession.value)
    if (!projectPath) return
    projectAgentsLoading.value = true
    try {
      const data = await apiRequest<{ path: string; content: string; updatedAt?: string }>(
        `/api/project-agents?projectPath=${encodeURIComponent(projectPath)}`
      )
      projectAgents.path = data.path
      projectAgents.content = data.content
      projectAgents.updatedAt = data.updatedAt || ''
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      projectAgentsLoading.value = false
    }
  }

  async function saveProjectAgents() {
    if (!editingSession.value) return
    projectAgentsSaving.value = true
    try {
      const data = await apiRequest<{ path: string; content: string; updatedAt?: string }>('/api/project-agents', {
        method: 'POST',
        body: {
          projectPath: activePath(editingSession.value),
          content: projectAgents.content
        }
      })
      projectAgents.path = data.path
      projectAgents.content = data.content
      projectAgents.updatedAt = data.updatedAt || ''
      ElMessage.success('项目 AGENTS.md 已保存')
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      projectAgentsSaving.value = false
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

  function roleShortLabel(role: TranscriptMessage['role']) {
    const map = {
      user: 'U',
      assistant: 'A',
      system: 'S',
      tool: 'T',
      unknown: '?'
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
    flex-wrap: wrap;
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

  .status-switch {
    margin-left: 6px;
  }

  .quick-filter-bar {
    display: grid;
    grid-template-columns: minmax(220px, 1.4fr) minmax(150px, 0.7fr) minmax(220px, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--art-card-border);
    border-radius: 8px;
    background: var(--art-main-bg-color);
  }

  .quick-filter-keyword,
  .quick-filter-select,
  .quick-filter-project {
    width: 100%;
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

  .window-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  :global(.danger-dropdown-item) {
    color: var(--el-color-danger);
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
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
  }

  .drawer-actions {
    display: flex;
    flex-wrap: wrap;
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

  .transcript-message {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 12px;
    margin-bottom: 14px;
    padding: 12px;
    border: 1px solid var(--art-card-border);
    border-radius: 8px;
    background: var(--default-box-color);
  }

  .transcript-avatar {
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    background: var(--theme-color);
  }

  .transcript-assistant .transcript-avatar {
    background: #10b981;
  }

  .transcript-system .transcript-avatar {
    background: #64748b;
  }

  .transcript-tool .transcript-avatar {
    background: #f59e0b;
  }

  .transcript-body {
    min-width: 0;
  }

  .message-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
    color: var(--art-gray-500);
    font-size: 12px;

    div {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }

    strong {
      color: var(--art-gray-900);
      font-size: 13px;
    }
  }

  .transcript-editor {
    :deep(.el-textarea__inner) {
      border-color: transparent;
      background: var(--default-bg-color);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.75;
      resize: none;
    }
  }

  .new-session-form,
  .project-agents-panel {
    display: grid;
    gap: 12px;
  }

  .agents-path {
    display: grid;
    min-width: 0;
    gap: 4px;

    strong,
    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      color: var(--art-gray-800);
      font-size: 13px;
    }

    span {
      color: var(--art-gray-500);
      font-size: 12px;
    }
  }

  .agents-editor {
    :deep(.el-textarea__inner) {
      min-height: 440px !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      line-height: 1.65;
    }
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

    .quick-filter-bar {
      grid-template-columns: 1fr;
    }
  }

  @media (width > 768px) and (width <= 1100px) {
    .quick-filter-bar {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
