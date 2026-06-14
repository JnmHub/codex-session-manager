<template>
  <div class="codex-config-page art-full-height">
    <ElCard class="art-table-card editor-card" shadow="never">
      <template #header>
        <div class="page-header">
          <div>
            <h2>Codex 配置</h2>
            <p>编辑 CODEX_HOME 下的主配置文件。保存前请确认内容格式正确。</p>
          </div>
          <div class="header-actions">
            <ElButton :loading="loading" @click="loadFile" v-ripple>
              <template #icon><Refresh /></template>
              重载
            </ElButton>
            <ElButton type="primary" :loading="saving" @click="saveFile" v-ripple>
              <template #icon><Check /></template>
              保存
            </ElButton>
          </div>
        </div>
      </template>

      <ElTabs v-model="activeFile" @tab-change="loadFile">
        <ElTabPane label="config.toml" name="config.toml" />
        <ElTabPane label="auth.json" name="auth.json" />
        <ElTabPane label="AGENTS.md" name="AGENTS.md" />
      </ElTabs>

      <ElAlert
        v-if="activeFile === 'auth.json'"
        title="auth.json 包含 API Key 等敏感字段。这个页面只在本机使用，不会把内容发送给 Codex会话管家之外的接口。"
        type="warning"
        show-icon
        :closable="false"
      />

      <div class="file-meta">
        <span>{{ currentFile?.path }}</span>
        <span>{{ currentFile?.updatedAt ? `更新于 ${formatDate(currentFile.updatedAt)}` : '文件不存在时保存会创建' }}</span>
      </div>

      <TomlEditor
        v-if="activeFile === 'config.toml'"
        v-model="content"
        class="file-editor"
        placeholder="Codex config.toml"
      />
      <ElInput
        v-else
        v-model="content"
        type="textarea"
        resize="none"
        class="file-editor"
        :autosize="false"
        spellcheck="false"
      />
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import { Check, Refresh } from '@element-plus/icons-vue'
  import { apiRequest, getErrorMessage } from '@/utils/session-manager-api'
  import TomlEditor from '@/components/session-manager/TomlEditor.vue'

  type CodexFile = {
    name: string
    path: string
    content: string
    updatedAt?: string
  }

  const activeFile = ref<'config.toml' | 'auth.json' | 'AGENTS.md'>('config.toml')
  const currentFile = ref<CodexFile>()
  const content = ref('')
  const loading = ref(false)
  const saving = ref(false)

  onMounted(loadFile)

  async function loadFile() {
    loading.value = true
    try {
      const file = await apiRequest<CodexFile>(`/api/codex-file?name=${encodeURIComponent(activeFile.value)}`)
      currentFile.value = file
      content.value = file.content
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      loading.value = false
    }
  }

  async function saveFile() {
    saving.value = true
    try {
      if (activeFile.value === 'auth.json') {
        JSON.parse(content.value)
      }
      const file = await apiRequest<CodexFile>('/api/codex-file', {
        method: 'POST',
        body: {
          name: activeFile.value,
          content: content.value
        }
      })
      currentFile.value = file
      content.value = file.content
      ElMessage.success('已保存')
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      saving.value = false
    }
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleString()
  }
</script>

<style scoped lang="scss">
  .codex-config-page {
    display: grid;
    min-height: 0;
  }

  .editor-card {
    min-height: 0;

    :deep(.el-card__body) {
      display: grid;
      grid-template-rows: auto auto auto minmax(0, 1fr);
      gap: 12px;
      height: calc(100vh - 170px);
    }
  }

  .page-header,
  .header-actions,
  .file-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .page-header {
    h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    p {
      margin: 5px 0 0;
      color: var(--art-gray-600);
    }
  }

  .file-meta {
    color: var(--art-gray-500);
    font-size: 12px;

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .file-editor {
    min-height: 0;

    :deep(.el-textarea__inner) {
      height: 100%;
      min-height: 520px !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      line-height: 1.6;
      white-space: pre;
    }
  }
</style>
