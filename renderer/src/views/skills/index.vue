<template>
  <div class="extension-page art-full-height">
    <ElCard class="art-table-card" shadow="never">
      <template #header>
        <div class="page-header">
          <div>
            <h2>Skills 管理</h2>
            <p>管理全局和项目级 Codex skills。每个 skill 对应一个目录和其中的 SKILL.md。</p>
          </div>
          <div class="header-actions">
            <ElButton @click="loadSkills">刷新</ElButton>
            <ElButton type="primary" @click="createSkill">新建 Skill</ElButton>
          </div>
        </div>
      </template>

      <div class="scope-bar">
        <ElSegmented v-model="scope" :options="scopeOptions" @change="loadSkills" />
        <div v-if="scope === 'project'" class="project-picker">
          <ProjectPathPicker
            v-model="projectPath"
            placeholder="从已有会话选择项目路径，也可手动输入"
            @change="loadSkills"
          />
        </div>
      </div>

      <ElRow :gutter="16">
        <ElCol :xs="24" :lg="8">
          <ElTable
            v-loading="loading"
            :data="skills"
            height="560"
            row-key="id"
            empty-text="暂无 Skills"
            @row-click="openSkill"
          >
            <ElTableColumn label="名称" min-width="180">
              <template #default="{ row }">
                <div class="name-cell">
                  <strong>{{ row.name }}</strong>
                  <small>{{ row.scope === 'global' ? '全局' : '项目级' }}</small>
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn prop="description" label="说明" min-width="180" show-overflow-tooltip />
          </ElTable>
        </ElCol>

        <ElCol :xs="24" :lg="16">
          <div class="editor-panel">
            <div class="editor-toolbar">
              <div>
                <h3>{{ selectedName || '选择或新建 Skill' }}</h3>
                <p v-if="selectedPath">{{ selectedPath }}</p>
              </div>
              <div class="toolbar-actions">
                <ElButton :disabled="!selectedName" type="danger" plain @click="removeSkill">删除</ElButton>
                <ElButton :disabled="!selectedName" type="primary" :loading="saving" @click="saveCurrent">保存</ElButton>
              </div>
            </div>
            <ElInput
              v-model="content"
              type="textarea"
              :rows="24"
              placeholder="SKILL.md 内容"
              resize="none"
            />
          </div>
        </ElCol>
      </ElRow>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import ProjectPathPicker from '@/components/session-manager/ProjectPathPicker.vue'
  import { apiRequest, getErrorMessage } from '@/utils/session-manager-api'

  type SkillScope = 'global' | 'project'
  type SkillRecord = {
    id: string
    name: string
    scope: SkillScope
    directory: string
    skillFile: string
    description?: string
  }

  const route = useRoute()
  const scopeOptions = [
    { label: '全局', value: 'global' },
    { label: '项目级', value: 'project' }
  ]
  const scope = ref<SkillScope>('global')
  const projectPath = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const skills = ref<SkillRecord[]>([])
  const selectedName = ref('')
  const selectedPath = ref('')
  const content = ref('')

  onMounted(() => {
    if (route.query.scope === 'project') {
      scope.value = 'project'
    }
    if (typeof route.query.projectPath === 'string') {
      projectPath.value = route.query.projectPath
    }
    void loadSkills()
  })

  async function loadSkills() {
    if (scope.value === 'project' && !projectPath.value) {
      skills.value = []
      return
    }

    loading.value = true
    try {
      const query = new URLSearchParams({ scope: scope.value })
      if (projectPath.value) query.set('projectPath', projectPath.value)
      const data = await apiRequest<{ skills: SkillRecord[] }>(`/api/skills?${query}`)
      skills.value = data.skills
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      loading.value = false
    }
  }

  async function openSkill(row: SkillRecord) {
    try {
      const query = new URLSearchParams({ scope: row.scope, name: row.name })
      if (projectPath.value) query.set('projectPath', projectPath.value)
      const data = await apiRequest<{ skill: SkillRecord; content: string }>(`/api/skill?${query}`)
      selectedName.value = data.skill.name
      selectedPath.value = data.skill.skillFile
      content.value = data.content
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    }
  }

  async function createSkill() {
    if (scope.value === 'project' && !projectPath.value) {
      ElMessage.warning('请先选择项目路径')
      return
    }

    const { value } = await ElMessageBox.prompt('请输入 Skill 目录名', '新建 Skill', {
      inputPlaceholder: 'my-skill',
      inputPattern: /^[\w.-]+$/,
      inputErrorMessage: '只能包含字母、数字、下划线、点和短横线'
    })
    selectedName.value = value
    selectedPath.value = ''
    content.value = [
      '---',
      `name: ${value}`,
      'description: 说明这个 skill 适合什么任务。',
      '---',
      '',
      '# Workflow',
      '',
      '1. 写清楚什么时候使用这个 skill。',
      '2. 写清楚需要读取哪些参考资料或运行哪些脚本。',
      '3. 写清楚输出和验证要求。',
      ''
    ].join('\n')
  }

  async function saveCurrent() {
    if (!selectedName.value) return
    saving.value = true
    try {
      const data = await apiRequest<{ skill: SkillRecord; content: string }>('/api/skill', {
        method: 'POST',
        body: {
          scope: scope.value,
          name: selectedName.value,
          projectPath: projectPath.value,
          content: content.value
        }
      })
      selectedPath.value = data.skill.skillFile
      content.value = data.content
      ElMessage.success('已保存 Skill')
      await loadSkills()
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      saving.value = false
    }
  }

  async function removeSkill() {
    if (!selectedName.value) return
    await ElMessageBox.confirm(`确认删除 ${selectedName.value}？`, '删除 Skill', { type: 'warning' })
    try {
      await apiRequest('/api/skill', {
        method: 'DELETE',
        body: {
          scope: scope.value,
          name: selectedName.value,
          projectPath: projectPath.value
        }
      })
      selectedName.value = ''
      selectedPath.value = ''
      content.value = ''
      ElMessage.success('已删除')
      await loadSkills()
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
  .editor-toolbar,
  .scope-bar,
  .project-picker {
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

  .scope-bar {
    margin-bottom: 16px;
  }

  .project-picker {
    flex: 1;
  }

  .name-cell {
    display: grid;
    gap: 2px;

    small {
      color: var(--art-gray-500);
    }
  }

  .editor-panel {
    display: grid;
    gap: 12px;
  }

  @media (max-width: 768px) {
    .page-header,
    .editor-toolbar,
    .scope-bar,
    .project-picker {
      display: grid;
      justify-content: stretch;
    }
  }
</style>
