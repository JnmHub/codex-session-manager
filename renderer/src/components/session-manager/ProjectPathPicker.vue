<template>
  <div class="project-path-picker">
    <ElInput
      :model-value="modelValue"
      :placeholder="placeholder"
      clearable
      @update:model-value="emit('update:modelValue', String($event))"
    />
    <ElButton @click="openDialog">选择</ElButton>
  </div>

  <ElDialog v-model="visible" title="从会话选择项目路径" width="920px" append-to-body>
    <div class="picker-toolbar">
      <ElInput v-model="keyword" placeholder="搜索会话、项目、路径、备注" clearable />
      <ElButton :loading="loading" @click="loadSessions">刷新</ElButton>
    </div>
    <ElTable
      v-loading="loading"
      :data="filteredSessions"
      height="480"
      row-key="id"
      empty-text="暂无会话"
      highlight-current-row
      @row-dblclick="selectSession"
    >
      <ElTableColumn label="会话" min-width="220">
        <template #default="{ row }">
          <div class="session-cell">
            <strong>{{ row.summary || row.note || shortId(row.id) }}</strong>
            <span>{{ shortId(row.id) }} · {{ formatDate(row.updatedAt) }}</span>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="项目" min-width="180">
        <template #default="{ row }">
          <strong>{{ projectLabel(activePath(row)) }}</strong>
        </template>
      </ElTableColumn>
      <ElTableColumn label="路径" min-width="320" show-overflow-tooltip>
        <template #default="{ row }">{{ activePath(row) }}</template>
      </ElTableColumn>
      <ElTableColumn label="操作" width="96" fixed="right">
        <template #default="{ row }">
          <ElButton size="small" type="primary" plain @click="selectSession(row)">选择</ElButton>
        </template>
      </ElTableColumn>
    </ElTable>
  </ElDialog>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import { apiRequest, getErrorMessage } from '@/utils/session-manager-api'

  type SessionRecord = {
    id: string
    updatedAt: string
    cwd: string
    boundPath?: string
    summary?: string
    note?: string
    category?: string
  }

  defineProps<{
    modelValue: string
    placeholder?: string
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: string]
    change: [value: string]
  }>()

  const visible = ref(false)
  const loading = ref(false)
  const keyword = ref('')
  const sessions = ref<SessionRecord[]>([])

  const filteredSessions = computed(() => {
    const q = keyword.value.trim().toLowerCase()
    if (!q) return sessions.value
    return sessions.value.filter((session) =>
      [session.id, session.summary, session.note, session.category, session.cwd, session.boundPath, activePath(session)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    )
  })

  async function openDialog() {
    visible.value = true
    if (!sessions.value.length) {
      await loadSessions()
    }
  }

  async function loadSessions() {
    loading.value = true
    try {
      const data = await apiRequest<{ sessions: SessionRecord[] }>('/api/sessions?all=1&limit=500')
      sessions.value = data.sessions.filter((session) => Boolean(activePath(session)))
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      loading.value = false
    }
  }

  function selectSession(row: SessionRecord) {
    const value = activePath(row)
    emit('update:modelValue', value)
    emit('change', value)
    visible.value = false
  }

  function activePath(session: SessionRecord) {
    return session.boundPath || session.cwd || ''
  }

  function projectLabel(value: string) {
    if (!value) return '未绑定'
    return value.split(/[\\/]/).filter(Boolean).at(-1) || value
  }

  function shortId(id: string) {
    return id.slice(0, 8)
  }

  function formatDate(value: string) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleString()
  }
</script>

<style scoped lang="scss">
  .project-path-picker {
    display: grid;
    grid-template-columns: minmax(360px, 1fr) auto;
    gap: 10px;
    width: 100%;
  }

  .picker-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    margin-bottom: 12px;
  }

  .session-cell {
    display: grid;
    gap: 4px;

    strong,
    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span {
      color: var(--art-gray-500);
      font-size: 12px;
    }
  }

  @media (max-width: 768px) {
    .project-path-picker,
    .picker-toolbar {
      grid-template-columns: 1fr;
    }
  }
</style>
