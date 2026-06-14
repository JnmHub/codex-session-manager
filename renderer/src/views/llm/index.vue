<template>
  <div class="llm-page art-full-height" @click="hideContextMenu">
    <section class="llm-workspace">
      <ElCard class="art-table-card conversation-panel" shadow="never">
        <template #header>
          <div class="panel-header">
            <h3>聊天会话</h3>
            <ElButton type="primary" size="small" @click="createConversation" v-ripple>新建</ElButton>
          </div>
        </template>

        <ElSelect v-model="categoryFilter" clearable placeholder="全部分类" class="category-filter">
          <ElOption v-for="category in categories" :key="category" :label="category" :value="category" />
        </ElSelect>

        <ElScrollbar height="calc(100dvh - 260px)" class="conversation-scroll">
          <div class="conversation-list">
            <div
              v-for="item in filteredConversations"
              :key="item.id"
              class="conversation-item"
              :class="{ active: item.id === activeId }"
              draggable="true"
              @click="selectConversation(item.id)"
              @contextmenu.prevent.stop="openContextMenu($event, item)"
              @dragstart="dragStart(item.id)"
              @dragover.prevent
              @drop="dropConversation(item.id)"
            >
              <div class="conversation-title">
                <ElIcon v-if="item.pinned"><Top /></ElIcon>
                <strong>{{ item.title }}</strong>
              </div>
              <div class="conversation-meta">
                <span>{{ item.category || '未分类' }}</span>
                <span>{{ item.messageCount || 0 }} 条</span>
              </div>
            </div>
          </div>
        </ElScrollbar>
      </ElCard>

      <ElCard class="art-table-card chat-panel" shadow="never">
        <template #header>
          <div class="chat-header">
            <div class="chat-title-block">
              <h3>{{ activeConversation?.title || 'Jnm 小助手' }}</h3>
              <span>我是 Jnm 小助手，最大上下文 {{ activeConversation?.maxContext || 12 }} 条</span>
            </div>
            <div class="chat-actions">
              <ElSegmented
                v-model="metaForm.permissionLevel"
                :options="permissionOptions"
                class="permission-segment"
                @change="changePermission"
              />
              <ElSelect
                v-model="metaForm.category"
                allow-create
                filterable
                clearable
                placeholder="分类"
                class="meta-category"
                @change="saveCurrentMeta"
              >
                <ElOption v-for="category in categories" :key="category" :label="category" :value="category" />
              </ElSelect>
              <ElInputNumber
                v-model="metaForm.maxContext"
                :min="4"
                :max="50"
                :step="2"
                controls-position="right"
                class="context-number"
                @change="saveCurrentMeta"
              />
              <ElButton @click="togglePin()" v-ripple>
                <template #icon><Top /></template>
                {{ activeConversation?.pinned ? '取消置顶' : '置顶' }}
              </ElButton>
            </div>
          </div>
        </template>

        <ElScrollbar ref="scrollbarRef" height="100%" class="message-scroll">
          <div class="message-list">
            <div
              v-for="message in activeMessages"
              :key="message.id"
              class="message-row"
              :class="`message-${message.role}`"
            >
              <div class="message-bubble">
                <div class="message-meta">
                  <ElTag size="small" :type="roleTag(message.role)" effect="light">
                    {{ roleLabel(message.role) }}
                  </ElTag>
                  <span>{{ formatTime(message.createdAt) }}</span>
                </div>
                <p>{{ message.text }}</p>

                <div v-if="message.actions?.length" class="tool-results">
                  <div
                    v-for="action in message.actions"
                    :key="`${message.id}-${action.tool}-${action.summary}`"
                    class="tool-result"
                    :class="{ failed: !action.ok }"
                  >
                    <div class="tool-result-main">
                      <ElTag size="small" effect="plain" :type="action.ok ? 'success' : 'danger'">
                        {{ action.tool }}
                      </ElTag>
                      <span>{{ action.summary }}</span>
                    </div>
                    <ElTable
                      v-if="isArrayData(action.data)"
                      :data="tableRows(action.data)"
                      size="small"
                      border
                      class="result-table"
                      max-height="280"
                    >
                      <ElTableColumn
                        v-for="column in tableColumns(action)"
                        :key="column.prop"
                        :prop="column.prop"
                        :label="column.label"
                        :min-width="column.minWidth"
                        show-overflow-tooltip
                      />
                    </ElTable>
                    <ElDescriptions
                      v-else-if="isObjectData(action.data)"
                      :column="1"
                      border
                      size="small"
                      class="result-descriptions"
                    >
                      <ElDescriptionsItem
                        v-for="entry in objectEntries(action.data)"
                        :key="entry.key"
                        :label="entry.key"
                      >
                        {{ entry.value }}
                      </ElDescriptionsItem>
                    </ElDescriptions>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ElScrollbar>

        <div class="composer">
          <ElInput
            v-model="inputText"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 6 }"
            resize="none"
            placeholder="例如：帮我找报名项目的会话，设为 ctf Profile，并打开"
            @keydown.enter.exact.prevent="sendMessage"
          />
          <div class="composer-footer">
            <span>Enter 发送，Shift + Enter 换行</span>
            <ElButton type="primary" :loading="loading" :disabled="!inputText.trim()" @click="sendMessage" v-ripple>
              <template #icon><Position /></template>
              发送
            </ElButton>
          </div>
        </div>
      </ElCard>

      <ElCard class="art-table-card side-panel" shadow="never">
        <template #header>
          <div class="panel-header">
            <h3>工具上下文</h3>
            <ElButton size="small" :loading="contextLoading" @click="loadContext">
              <template #icon><Refresh /></template>
              刷新
            </ElButton>
          </div>
        </template>

        <div class="context-block">
          <h4>Profile</h4>
          <div class="tag-list">
            <ElTag v-for="profile in profiles" :key="profile.id" effect="plain">{{ profile.name }}</ElTag>
          </div>
        </div>

        <ElDivider />

        <div class="context-block">
          <h4>全局设置</h4>
          <ElDescriptions :column="1" border size="small">
            <ElDescriptionsItem label="Profile">{{ settings?.globalProfile || '未指定' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="Yolo">{{ settings?.yoloDefault ? '默认开启' : '默认关闭' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="Model">{{ settings?.llm?.model || '-' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="Key">{{ settings?.llm?.hasKey ? '已配置' : '未配置' }}</ElDescriptionsItem>
          </ElDescriptions>
        </div>

        <ElDivider />

        <div class="context-block">
          <h4>可执行动作</h4>
          <div class="tool-list">
            <ElTag v-for="tool in toolNames" :key="tool" size="small" effect="plain">{{ tool }}</ElTag>
          </div>
        </div>
      </ElCard>
    </section>

    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button @click.stop="togglePin(contextMenu.target)">切换置顶</button>
      <button class="danger" @click="deleteConversation(contextMenu.target)">删除会话</button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { Position, Refresh, Top } from '@element-plus/icons-vue'
  import { apiRequest, getErrorMessage } from '@/utils/session-manager-api'

  type ChatRole = 'user' | 'assistant'
  type PermissionLevel = 'normal' | 'dangerous'
  type ToolActionResult = { tool: string; ok: boolean; summary: string; data?: unknown }
  type ChatMessage = { id: string; role: ChatRole; text: string; createdAt: string; actions?: ToolActionResult[] }
  type Conversation = {
    id: string
    title: string
    category?: string
    pinned: boolean
    order: number
    maxContext: number
    permissionLevel: PermissionLevel
    updatedAt: string
    messageCount?: number
    messages?: ChatMessage[]
  }
  type ProfileRecord = { id: string; name: string; note?: string }

  const loading = ref(false)
  const contextLoading = ref(false)
  const inputText = ref('')
  const categoryFilter = ref('')
  const activeId = ref('')
  const draggedId = ref('')
  const scrollbarRef = ref()
  const profiles = ref<ProfileRecord[]>([])
  const settings = ref<any>()
  const conversations = ref<Conversation[]>([])
  const activeConversation = ref<Conversation>()
  const metaForm = reactive({ category: '', maxContext: 12, permissionLevel: 'normal' as PermissionLevel })
  const contextMenu = reactive({
    visible: false,
    x: 0,
    y: 0,
    target: undefined as Conversation | undefined
  })

  const toolNames = [
    'listSessions',
    'openSession',
    'getSessionWindow',
    'closeSessionWindow',
    'reopenSessionWindow',
    'setNote',
    'bindPath',
    'setSessionOptions',
    'toggleFavorite',
    'toggleArchived',
    'listProfiles',
    'getProfileFiles',
    'saveProfileFiles',
    'getCodexFile',
    'saveCodexFile',
    'saveTranscriptEdits',
    'resetTranscriptEdits'
  ]
  const permissionOptions = [
    { label: '只读', value: 'normal' },
    { label: '读写', value: 'dangerous' }
  ]

  const activeMessages = computed(() => activeConversation.value?.messages || [])
  const categories = computed(() =>
    Array.from(new Set(conversations.value.map((item) => item.category).filter(Boolean) as string[])).sort()
  )
  const filteredConversations = computed(() =>
    conversations.value.filter((item) => !categoryFilter.value || item.category === categoryFilter.value)
  )

  watch(activeConversation, (conversation) => {
    metaForm.category = conversation?.category || ''
    metaForm.maxContext = conversation?.maxContext || 12
    metaForm.permissionLevel = conversation?.permissionLevel || 'normal'
  })

  onMounted(async () => {
    await Promise.all([loadConversations(), loadContext()])
  })

  async function loadConversations(selectId?: string) {
    const data = await apiRequest<{ conversations: Conversation[] }>('/api/llm/conversations')
    conversations.value = data.conversations
    const nextId = selectId || activeId.value || conversations.value[0]?.id
    if (nextId) {
      await selectConversation(nextId)
    } else {
      await createConversation()
    }
  }

  async function selectConversation(id: string) {
    activeId.value = id
    const data = await apiRequest<{ conversation: Conversation }>(`/api/llm/conversation?id=${encodeURIComponent(id)}`)
    activeConversation.value = data.conversation
    await scrollToBottom()
  }

  async function createConversation() {
    const data = await apiRequest<{ conversation: Conversation }>('/api/llm/conversation', {
      method: 'POST',
      body: { title: '新聊天', category: categoryFilter.value || undefined }
    })
    await loadConversations(data.conversation.id)
  }

  async function saveCurrentMeta() {
    if (!activeConversation.value) return
    const data = await apiRequest<{ conversation: Conversation }>('/api/llm/conversation', {
      method: 'POST',
      body: {
        id: activeConversation.value.id,
        category: metaForm.category,
        maxContext: metaForm.maxContext,
        permissionLevel: metaForm.permissionLevel
      }
    })
    activeConversation.value = data.conversation
    await loadConversationListOnly()
  }

  async function changePermission(value: string | number | boolean) {
    if (value === 'dangerous') {
      const confirmed = await ElMessageBox.confirm(
        '读写权限允许 Jnm 小助手在本工具范围内执行写入操作，例如归档、备注、绑定路径、保存配置、保存聊天记录编辑副本和打开/重开会话。确认开启？',
        '开启读写权限',
        {
          type: 'warning',
          confirmButtonText: '开启读写',
          cancelButtonText: '保持只读',
          confirmButtonClass: 'el-button--danger'
        }
      ).then(() => true).catch(() => false)
      if (!confirmed) {
        metaForm.permissionLevel = activeConversation.value?.permissionLevel || 'normal'
        return
      }
    }
    await saveCurrentMeta()
  }

  async function togglePin(target = activeConversation.value) {
    if (!target) return
    await apiRequest('/api/llm/conversation', {
      method: 'POST',
      body: { id: target.id, pinned: !target.pinned }
    })
    hideContextMenu()
    await loadConversations(target.id)
  }

  async function deleteConversation(target?: Conversation) {
    if (!target) return
    await ElMessageBox.confirm(`删除聊天「${target.title}」？`, '确认删除', { type: 'warning' })
    await apiRequest('/api/llm/conversation', { method: 'DELETE', body: { id: target.id } })
    hideContextMenu()
    activeId.value = ''
    activeConversation.value = undefined
    await loadConversations()
  }

  async function sendMessage() {
    const text = inputText.value.trim()
    if (!text || loading.value) return
    if (!activeConversation.value) {
      await createConversation()
    }
    const id = activeConversation.value?.id
    if (!id) return

    inputText.value = ''
    loading.value = true
    const userMessage: ChatMessage = {
      id: localId('user'),
      role: 'user',
      text,
      createdAt: new Date().toISOString()
    }
    const assistantMessage: ChatMessage = {
      id: localId('assistant'),
      role: 'assistant',
      text: '',
      createdAt: new Date().toISOString()
    }
    activeConversation.value = {
      ...activeConversation.value,
      messages: [...(activeConversation.value.messages || []), userMessage, assistantMessage]
    }
    await scrollToBottom()
    try {
      await streamChat({
        conversationId: id,
        text,
        permissionLevel: metaForm.permissionLevel,
        onDelta(delta) {
          assistantMessage.text += delta
          replaceLocalMessage(assistantMessage)
          void scrollToBottom()
        },
        onActions(actions) {
          assistantMessage.actions = actions
          replaceLocalMessage(assistantMessage)
        },
        onDone(conversation) {
          activeConversation.value = conversation
        }
      })
      await loadConversationListOnly()
      await loadContext()
    } catch (error) {
      assistantMessage.text = `请求失败：${getErrorMessage(error)}`
      replaceLocalMessage(assistantMessage)
      ElMessage.error(getErrorMessage(error))
    } finally {
      loading.value = false
      await scrollToBottom()
    }
  }

  function replaceLocalMessage(message: ChatMessage) {
    if (!activeConversation.value?.messages) return
    activeConversation.value = {
      ...activeConversation.value,
      messages: activeConversation.value.messages.map((item) => (item.id === message.id ? { ...message } : item))
    }
  }

  async function streamChat(input: {
    conversationId: string
    text: string
    permissionLevel: PermissionLevel
    onDelta: (text: string) => void
    onActions: (actions: ToolActionResult[]) => void
    onDone: (conversation: Conversation) => void
  }) {
    const response = await fetch('/api/llm/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: input.conversationId,
        text: input.text,
        permissionLevel: input.permissionLevel
      })
    })
    if (!response.ok || !response.body) {
      throw new Error('LLM 流式请求失败')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split(/\r?\n\r?\n/)
      buffer = chunks.pop() || ''
      for (const chunk of chunks) {
        handleStreamEvent(chunk, input)
      }
    }

    if (buffer.trim()) {
      handleStreamEvent(buffer, input)
    }
  }

  function handleStreamEvent(
    chunk: string,
    handlers: {
      onDelta: (text: string) => void
      onActions: (actions: ToolActionResult[]) => void
      onDone: (conversation: Conversation) => void
    }
  ) {
    const lines = chunk.split(/\r?\n/)
    const event = lines.find((line) => line.startsWith('event:'))?.slice('event:'.length).trim() || 'message'
    const dataText = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .join('\n')
    if (!dataText) return
    const data = JSON.parse(dataText)

    if (event === 'delta') {
      handlers.onDelta(String(data.text || ''))
      return
    }
    if (event === 'actions') {
      handlers.onActions(Array.isArray(data.actions) ? data.actions : [])
      return
    }
    if (event === 'done' && data.conversation) {
      handlers.onDone(data.conversation)
      return
    }
    if (event === 'error') {
      throw new Error(data.error || 'LLM 请求失败')
    }
  }

  function localId(prefix: string) {
    return `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`
  }

  async function loadConversationListOnly() {
    const data = await apiRequest<{ conversations: Conversation[] }>('/api/llm/conversations')
    conversations.value = data.conversations
  }

  async function loadContext() {
    contextLoading.value = true
    try {
      const [profileData, settingsData] = await Promise.all([
        apiRequest<{ profiles: ProfileRecord[] }>('/api/profiles'),
        apiRequest<{ settings: any }>('/api/settings')
      ])
      profiles.value = profileData.profiles
      settings.value = settingsData.settings
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      contextLoading.value = false
    }
  }

  function openContextMenu(event: MouseEvent, item: Conversation) {
    contextMenu.visible = true
    contextMenu.x = event.clientX
    contextMenu.y = event.clientY
    contextMenu.target = item
  }

  function hideContextMenu() {
    contextMenu.visible = false
  }

  function dragStart(id: string) {
    draggedId.value = id
  }

  async function dropConversation(targetId: string) {
    if (!draggedId.value || draggedId.value === targetId) return
    const ids = conversations.value.map((item) => item.id)
    const from = ids.indexOf(draggedId.value)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    const data = await apiRequest<{ conversations: Conversation[] }>('/api/llm/conversations/reorder', {
      method: 'POST',
      body: { ids }
    })
    conversations.value = data.conversations
    draggedId.value = ''
  }

  function roleLabel(role: ChatRole) {
    return role === 'user' ? '你' : '助手'
  }

  function roleTag(role: ChatRole) {
    return role === 'user' ? 'primary' : 'success'
  }

  function formatTime(value: string) {
    return new Date(value).toLocaleTimeString()
  }

  function isArrayData(value: unknown): value is Record<string, unknown>[] {
    return Array.isArray(value)
  }

  function isObjectData(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function tableRows(value: unknown) {
    if (!Array.isArray(value)) return []
    return value.map((item) => (item && typeof item === 'object' ? flattenRow(item as Record<string, unknown>) : { value: item }))
  }

  function tableColumns(action: ToolActionResult) {
    const rows = tableRows(action.data)
    if (action.tool === 'listSessions') {
      return [
        { prop: 'shortId', label: 'ID', minWidth: 95 },
        { prop: 'summary', label: '摘要', minWidth: 260 },
        { prop: 'note', label: '备注', minWidth: 160 },
        { prop: 'path', label: '路径', minWidth: 240 },
        { prop: 'status', label: '状态', minWidth: 100 },
        { prop: 'profile', label: 'Profile', minWidth: 110 },
        { prop: 'updatedAt', label: '更新时间', minWidth: 170 }
      ]
    }
    if (action.tool === 'listProfiles') {
      return [
        { prop: 'name', label: '名称', minWidth: 120 },
        { prop: 'note', label: '备注', minWidth: 220 },
        { prop: 'configPath', label: '配置文件', minWidth: 260 },
        { prop: 'markdownPath', label: 'Markdown', minWidth: 240 }
      ]
    }
    const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 6)
    return keys.map((key) => ({ prop: key, label: key, minWidth: 140 }))
  }

  function flattenRow(row: Record<string, unknown>) {
    const path = String(row.boundPath || row.cwd || row.path || '')
    return {
      ...row,
      path,
      status: row.archived ? '已归档' : row.favorite ? '已收藏' : '普通',
      updatedAt: typeof row.updatedAt === 'string' ? new Date(row.updatedAt).toLocaleString() : row.updatedAt
    }
  }

  function objectEntries(value: unknown) {
    if (!isObjectData(value)) return []
    return Object.entries(value)
      .filter(([key]) => key !== 'content')
      .slice(0, 12)
      .map(([key, item]) => ({ key, value: formatValue(item) }))
  }

  function formatValue(value: unknown) {
    if (value === undefined || value === null || value === '') return '-'
    if (typeof value === 'boolean') return value ? '是' : '否'
    if (typeof value === 'object') return Array.isArray(value) ? `${value.length} 项` : '对象'
    return String(value)
  }

  async function scrollToBottom() {
    await nextTick()
    const wrap = scrollbarRef.value?.wrapRef
    if (wrap) {
      wrap.scrollTop = wrap.scrollHeight
    }
  }
</script>

<style scoped lang="scss">
  .llm-page,
  .llm-workspace,
  .conversation-panel,
  .chat-panel,
  .side-panel {
    min-height: 0;
  }

  .llm-workspace {
    height: calc(100dvh - 118px);
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr) 310px;
    gap: 16px;
    overflow: hidden;
  }

  .conversation-panel,
  .chat-panel,
  .side-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .conversation-panel,
  .chat-panel,
  .side-panel {
    :deep(.el-card__header) {
      flex: 0 0 auto;
    }

    :deep(.el-card__body) {
      flex: 1 1 auto;
      min-height: 0;
    }
  }

  .chat-panel {
    :deep(.el-card__body) {
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 14px;
      overflow: hidden;
    }
  }

  .conversation-panel :deep(.el-card__body),
  .side-panel :deep(.el-card__body) {
    overflow: hidden;
  }

  .panel-header,
  .chat-header,
  .chat-actions,
  .composer-footer,
  .tool-result-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .panel-header,
  .chat-header {
    h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    span {
      color: var(--art-gray-500);
      font-size: 13px;
    }
  }

  .chat-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .chat-title-block {
    min-width: 240px;
    max-width: 100%;
    flex: 1 1 240px;

    h3 {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      word-break: keep-all;
    }
  }

  .chat-actions {
    justify-content: flex-start;
    flex: 0 1 auto;
    flex-wrap: wrap;
    min-width: 0;
  }

  .category-filter {
    width: 100%;
    margin-bottom: 12px;
  }

  .conversation-list {
    display: grid;
    gap: 8px;
    padding-right: 4px;
  }

  .conversation-item {
    padding: 10px;
    border: 1px solid var(--art-card-border);
    border-radius: 8px;
    background: var(--default-box-color);
    cursor: pointer;

    &.active {
      border-color: rgb(var(--theme-color-rgb) / 35%);
      background: rgb(var(--theme-color-rgb) / 8%);
    }
  }

  .conversation-title {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;

    strong {
      overflow: hidden;
      color: var(--art-gray-900);
      font-size: 13px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .conversation-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 7px;
    color: var(--art-gray-500);
    font-size: 12px;
  }

  .meta-category {
    width: 150px;
  }

  .context-number {
    width: 92px;
  }

  .message-scroll {
    min-height: 0;

    :deep(.el-scrollbar__wrap) {
      overflow-x: hidden;
    }
  }

  .message-list {
    display: grid;
    gap: 14px;
    padding: 2px 0 8px;
  }

  .message-row {
    display: flex;
  }

  .message-user {
    justify-content: flex-end;

    .message-bubble {
      border-color: rgb(var(--theme-color-rgb) / 18%);
      background: rgb(var(--theme-color-rgb) / 7%);
    }
  }

  .message-assistant {
    justify-content: flex-start;
  }

  .message-bubble {
    width: min(760px, 88%);
    padding: 14px 16px;
    border: 1px solid var(--art-card-border);
    border-radius: 8px;
    background: var(--default-box-color);

    p {
      margin: 10px 0 0;
      color: var(--art-gray-800);
      line-height: 1.7;
      white-space: pre-wrap;
    }
  }

  .message-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--art-gray-500);
    font-size: 12px;
  }

  .tool-results {
    display: grid;
    gap: 10px;
    margin-top: 12px;
  }

  .tool-result {
    min-width: 0;
    padding: 10px;
    border: 1px solid var(--el-color-success-light-7);
    border-radius: 8px;
    background: var(--el-color-success-light-9);

    &.failed {
      border-color: var(--el-color-danger-light-7);
      background: var(--el-color-danger-light-9);
    }
  }

  .tool-result-main {
    justify-content: flex-start;

    span:last-child {
      color: var(--art-gray-700);
      font-size: 13px;
    }
  }

  .result-table,
  .result-descriptions {
    margin-top: 8px;
  }

  .composer {
    display: grid;
    gap: 10px;
  }

  .composer-footer span {
    color: var(--art-gray-500);
    font-size: 12px;
  }

  .context-block {
    h4 {
      margin: 0 0 10px;
      color: var(--art-gray-900);
      font-size: 14px;
      font-weight: 600;
    }
  }

  .tag-list,
  .tool-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .context-menu {
    position: fixed;
    z-index: 2000;
    width: 132px;
    padding: 6px;
    border: 1px solid var(--art-card-border);
    border-radius: 8px;
    background: var(--default-box-color);
    box-shadow: var(--el-box-shadow-light);

    button {
      width: 100%;
      padding: 8px 10px;
      color: var(--art-gray-800);
      text-align: left;
      background: transparent;
      border: 0;
      border-radius: 6px;
      cursor: pointer;

      &:hover {
        background: var(--el-fill-color-light);
      }

      &.danger {
        color: var(--el-color-danger);
      }
    }
  }

  @media (width <= 1200px) {
    .llm-workspace {
      grid-template-columns: 240px minmax(0, 1fr);
    }

    .side-panel {
      display: none;
    }
  }

  @media (width <= 1500px) {
    .llm-workspace {
      grid-template-columns: 260px minmax(0, 1fr);
    }

    .side-panel {
      display: none;
    }
  }

  @media (width <= 1100px) {
    .llm-workspace {
      grid-template-columns: 220px minmax(0, 1fr);
      gap: 12px;
    }

    .chat-title-block {
      flex-basis: 100%;
    }

    .chat-actions {
      width: 100%;
    }

    .meta-category {
      width: 132px;
    }
  }
</style>
