<template>
  <div class="extension-page art-full-height">
    <ElCard class="art-table-card" shadow="never">
      <template #header>
        <div class="page-header">
          <div>
            <h2>MCP 管理</h2>
            <p>管理 Codex config.toml 中的 [mcp_servers.&lt;name&gt;] 配置块。</p>
          </div>
          <div class="header-actions">
            <ElButton @click="loadServers">刷新</ElButton>
            <ElButton type="primary" @click="newServer">新增 MCP</ElButton>
          </div>
        </div>
      </template>

      <ElAlert
        class="doc-alert"
        type="info"
        show-icon
        :closable="false"
        title="常用写法：stdio 服务通常配置 command、args、env；HTTP 服务通常配置 url。也可以继续使用 codex mcp add/list/remove 命令管理。"
      />

      <ElRow :gutter="16">
        <ElCol :xs="24" :lg="8">
          <ElTable
            v-loading="loading"
            :data="servers"
            height="560"
            row-key="name"
            empty-text="暂无 MCP Server"
            @row-click="selectServer"
          >
            <ElTableColumn prop="name" label="名称" min-width="150" />
            <ElTableColumn label="类型" width="90">
              <template #default="{ row }">{{ row.url ? 'HTTP' : 'stdio' }}</template>
            </ElTableColumn>
            <ElTableColumn prop="command" label="命令/URL" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">{{ row.url || row.command || '-' }}</template>
            </ElTableColumn>
          </ElTable>
        </ElCol>

        <ElCol :xs="24" :lg="16">
          <div class="editor-panel">
            <div class="editor-toolbar">
              <div>
                <h3>{{ form.name || '新增 MCP Server' }}</h3>
                <p>{{ configPath }}</p>
              </div>
              <div class="toolbar-actions">
                <ElButton :disabled="!form.name" type="danger" plain @click="removeServer">删除</ElButton>
                <ElButton type="primary" :loading="saving" @click="saveServer">保存</ElButton>
              </div>
            </div>

            <ElForm label-position="top">
              <ElFormItem label="名称">
                <ElInput v-model="form.name" placeholder="例如 github、filesystem、browser" />
              </ElFormItem>
              <ElFormItem label="TOML 内容（不包含 [mcp_servers.name] 标题）">
                <ElInput
                  v-model="form.body"
                  type="textarea"
                  :rows="22"
                  resize="none"
                  placeholder='command = "npx"&#10;args = ["-y", "@modelcontextprotocol/server-filesystem", "C:/workspace"]'
                />
              </ElFormItem>
            </ElForm>
          </div>
        </ElCol>
      </ElRow>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, reactive, ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { apiRequest, getErrorMessage } from '@/utils/session-manager-api'

  type McpServer = {
    name: string
    body: string
    command?: string
    url?: string
    transport?: string
    cwd?: string
  }

  const loading = ref(false)
  const saving = ref(false)
  const configPath = ref('')
  const servers = ref<McpServer[]>([])
  const form = reactive({
    name: '',
    body: ''
  })

  onMounted(loadServers)

  async function loadServers() {
    loading.value = true
    try {
      const data = await apiRequest<{ configPath: string; servers: McpServer[] }>('/api/mcp')
      configPath.value = data.configPath
      servers.value = data.servers
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      loading.value = false
    }
  }

  function selectServer(row: McpServer) {
    form.name = row.name
    form.body = row.body
  }

  function newServer() {
    form.name = ''
    form.body = [
      '# stdio 示例',
      'command = "npx"',
      'args = ["-y", "your-mcp-server"]',
      '',
      '# HTTP 示例可改为：',
      '# url = "http://127.0.0.1:3000/mcp"'
    ].join('\n')
  }

  async function saveServer() {
    if (!form.name.trim()) {
      ElMessage.warning('请填写 MCP 名称')
      return
    }
    saving.value = true
    try {
      await apiRequest('/api/mcp', {
        method: 'POST',
        body: {
          name: form.name,
          body: form.body
        }
      })
      ElMessage.success('已保存 MCP 配置')
      await loadServers()
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      saving.value = false
    }
  }

  async function removeServer() {
    if (!form.name) return
    await ElMessageBox.confirm(`确认删除 MCP Server ${form.name}？`, '删除 MCP', { type: 'warning' })
    try {
      await apiRequest('/api/mcp', {
        method: 'DELETE',
        body: { name: form.name }
      })
      form.name = ''
      form.body = ''
      ElMessage.success('已删除')
      await loadServers()
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    }
  }
</script>

<style scoped lang="scss">
  .extension-page {
    display: grid;
    gap: 16px;
  }

  .page-header,
  .editor-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .page-header h2,
  .editor-toolbar h3 {
    margin: 0;
    font-size: 18px;
  }

  .page-header p,
  .editor-toolbar p {
    margin: 5px 0 0;
    color: var(--art-gray-600);
  }

  .header-actions,
  .toolbar-actions {
    display: flex;
    gap: 8px;
  }

  .doc-alert {
    margin-bottom: 16px;
  }

  .editor-panel {
    display: grid;
    gap: 12px;
  }

  @media (max-width: 768px) {
    .page-header,
    .editor-toolbar {
      display: grid;
      justify-content: stretch;
    }
  }
</style>
