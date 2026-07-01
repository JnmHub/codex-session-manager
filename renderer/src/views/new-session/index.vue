<template>
  <div class="new-session-page art-full-height">
    <ElCard class="art-table-card" shadow="never">
      <template #header>
        <div class="page-header">
          <div>
            <h2>新建会话</h2>
            <p>创建一个文件夹工作区，并在该目录启动新的 Codex 会话。</p>
          </div>
          <ElButton type="primary" :loading="loading" @click="openSession" v-ripple>创建并打开</ElButton>
        </div>
      </template>

      <ElRow :gutter="18">
        <ElCol :xs="24" :lg="14">
          <ElForm label-position="top" class="session-form">
            <ElFormItem label="工作区路径">
              <ProjectPathPicker
                v-model="form.workspacePath"
                native-picker
                placeholder="例如 C:\Users\jnmgp\Desktop\new-project，或选择文件夹"
              />
            </ElFormItem>
            <ElFormItem>
              <ElCheckbox v-model="form.createFolder">路径不存在时自动创建文件夹</ElCheckbox>
            </ElFormItem>
            <ElRow :gutter="14">
              <ElCol :xs="24" :md="12">
                <ElFormItem label="Profile">
                  <ElSelect v-model="form.profile" filterable clearable placeholder="使用全局 Profile">
                    <ElOption v-for="profile in profiles" :key="profile.id" :label="profile.name" :value="profile.name" />
                  </ElSelect>
                </ElFormItem>
              </ElCol>
              <ElCol :xs="24" :md="12">
                <ElFormItem label="Yolo 模式">
                  <ElSwitch v-model="form.yolo" active-text="开启" inactive-text="关闭" />
                </ElFormItem>
              </ElCol>
            </ElRow>
            <ElFormItem label="初始提示词">
              <ElInput
                v-model="form.prompt"
                type="textarea"
                :rows="5"
                placeholder="可选。留空则只打开 Codex 交互会话。"
              />
            </ElFormItem>
          </ElForm>
        </ElCol>

        <ElCol :xs="24" :lg="10">
          <div class="result-panel">
            <h3>启动结果</h3>
            <ElEmpty v-if="!result.command" description="尚未启动" />
            <template v-else>
              <ElDescriptions :column="1" border>
                <ElDescriptionsItem label="工作区">{{ result.workspacePath }}</ElDescriptionsItem>
              </ElDescriptions>
              <ElInput v-model="result.command" type="textarea" :rows="8" readonly />
            </template>
          </div>
        </ElCol>
      </ElRow>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, reactive, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import ProjectPathPicker from '@/components/session-manager/ProjectPathPicker.vue'
  import { apiRequest, getErrorMessage } from '@/utils/session-manager-api'

  type ProfileRecord = { id: string; name: string }

  const loading = ref(false)
  const profiles = ref<ProfileRecord[]>([])
  const form = reactive({
    workspacePath: '',
    createFolder: true,
    profile: '',
    yolo: true,
    prompt: ''
  })
  const result = reactive({
    workspacePath: '',
    command: ''
  })

  onMounted(loadProfiles)

  async function loadProfiles() {
    try {
      const data = await apiRequest<{ profiles: ProfileRecord[] }>('/api/profiles')
      profiles.value = data.profiles
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    }
  }

  async function openSession() {
    if (!form.workspacePath.trim()) {
      ElMessage.warning('请填写或选择工作区路径')
      return
    }

    loading.value = true
    try {
      const data = await apiRequest<{ workspacePath: string; command: string }>('/api/new-session', {
        method: 'POST',
        body: {
          workspacePath: form.workspacePath,
          createFolder: form.createFolder,
          profile: form.profile,
          yolo: form.yolo,
          prompt: form.prompt
        }
      })
      result.workspacePath = data.workspacePath
      result.command = data.command
      ElMessage.success('已打开新 Codex 会话窗口')
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      loading.value = false
    }
  }
</script>

<style scoped lang="scss">
  .new-session-page {
    display: grid;
    gap: 16px;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;

    h2 {
      margin: 0;
      font-size: 18px;
    }

    p {
      margin: 5px 0 0;
      color: var(--art-gray-600);
    }
  }

  .session-form {
    max-width: 760px;
  }

  .result-panel {
    display: grid;
    gap: 14px;

    h3 {
      margin: 0;
      font-size: 16px;
    }
  }

  @media (max-width: 768px) {
    .page-header,
    :deep(.project-path-picker) {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .page-header {
      display: grid;
    }
  }
</style>
