<template>
  <div class="extension-page art-full-height">
    <ElCard class="art-table-card" shadow="never">
      <template #header>
        <div class="page-header">
          <div>
            <h2>Hooks 管理</h2>
            <p>编辑 Codex 用户级或项目级 hooks.json。保存时会先做 JSON 格式校验。</p>
          </div>
          <div class="header-actions">
            <ElButton @click="loadHooks">刷新</ElButton>
            <ElButton type="primary" :loading="saving" @click="saveHooks">保存</ElButton>
          </div>
        </div>
      </template>

      <ElAlert
        class="doc-alert"
        type="warning"
        show-icon
        :closable="false"
        title="Hooks 会在 Codex 生命周期中执行命令或校验逻辑。编辑前建议确认命令可复现、可回滚，避免写入破坏性动作。"
      />

      <div class="scope-bar">
        <ElSegmented v-model="scope" :options="scopeOptions" @change="loadHooks" />
        <div v-if="scope === 'project'" class="project-picker">
          <ProjectPathPicker
            v-model="projectPath"
            placeholder="从已有会话选择项目路径，文件会写入 .codex/hooks.json"
            @change="loadHooks"
          />
        </div>
      </div>

      <ElDescriptions :column="1" border class="file-info">
        <ElDescriptionsItem label="文件路径">{{ filePath || '-' }}</ElDescriptionsItem>
        <ElDescriptionsItem label="更新时间">{{ updatedAt || '-' }}</ElDescriptionsItem>
      </ElDescriptions>

      <ElInput
        v-model="content"
        type="textarea"
        :rows="26"
        resize="none"
        placeholder='例如：&#10;{&#10;  "hooks": []&#10;}'
      />
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import ProjectPathPicker from '@/components/session-manager/ProjectPathPicker.vue'
  import { apiRequest, getErrorMessage } from '@/utils/session-manager-api'

  type HookScope = 'global' | 'project'

  const scopeOptions = [
    { label: '全局', value: 'global' },
    { label: '项目级', value: 'project' }
  ]
  const scope = ref<HookScope>('global')
  const projectPath = ref('')
  const saving = ref(false)
  const filePath = ref('')
  const updatedAt = ref('')
  const content = ref('')

  onMounted(loadHooks)

  async function loadHooks() {
    if (scope.value === 'project' && !projectPath.value) {
      filePath.value = ''
      updatedAt.value = ''
      content.value = ''
      return
    }

    try {
      const query = new URLSearchParams({ scope: scope.value })
      if (projectPath.value) query.set('projectPath', projectPath.value)
      const data = await apiRequest<{ path: string; content: string; updatedAt?: string }>(`/api/hooks?${query}`)
      filePath.value = data.path
      updatedAt.value = data.updatedAt || ''
      content.value = data.content
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    }
  }

  async function saveHooks() {
    if (scope.value === 'project' && !projectPath.value) {
      ElMessage.warning('请先选择项目路径')
      return
    }
    saving.value = true
    try {
      const data = await apiRequest<{ path: string; content: string; updatedAt?: string }>('/api/hooks', {
        method: 'POST',
        body: {
          scope: scope.value,
          projectPath: projectPath.value,
          content: content.value
        }
      })
      filePath.value = data.path
      updatedAt.value = data.updatedAt || ''
      content.value = data.content
      ElMessage.success('已保存 Hooks')
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      saving.value = false
    }
  }
</script>

<style scoped lang="scss">
  .extension-page {
    display: grid;
    gap: 16px;
  }

  .page-header,
  .scope-bar,
  .project-picker {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .page-header h2 {
    margin: 0;
    font-size: 18px;
  }

  .page-header p {
    margin: 5px 0 0;
    color: var(--art-gray-600);
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .doc-alert,
  .scope-bar,
  .file-info {
    margin-bottom: 16px;
  }

  .project-picker {
    flex: 1;
  }

  @media (max-width: 768px) {
    .page-header,
    .scope-bar,
    .project-picker {
      display: grid;
      justify-content: stretch;
    }
  }
</style>
