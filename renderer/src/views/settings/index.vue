<template>
  <div class="settings-page art-full-height">
    <ElCard class="art-table-card" shadow="never">
      <template #header>
        <div class="page-header">
          <div>
            <h2>全局设置</h2>
            <p>设置默认 Profile、默认 yolo 和 LLM 接入方式。单个会话中的配置优先级更高。</p>
          </div>
          <ElButton type="primary" :loading="loading" @click="saveSettings" v-ripple>保存</ElButton>
        </div>
      </template>

      <ElForm label-position="top" class="settings-form">
        <ElRow :gutter="18">
          <ElCol :xs="24" :md="12">
            <ElFormItem label="全局 Profile">
              <ElSelect v-model="form.globalProfile" filterable clearable placeholder="不指定 Profile">
                <ElOption v-for="profile in profiles" :key="profile.id" :label="profile.name" :value="profile.name" />
              </ElSelect>
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="12">
            <ElFormItem label="默认开启 --yolo">
              <ElSwitch v-model="form.yoloDefault" active-text="开启" inactive-text="关闭" />
            </ElFormItem>
          </ElCol>
        </ElRow>

        <ElDivider />

        <ElRow :gutter="18">
          <ElCol :xs="24" :md="8">
            <ElFormItem label="LLM 启用">
              <ElSwitch v-model="form.llm.enabled" active-text="启用" inactive-text="停用" />
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="8">
            <ElFormItem label="Provider">
              <ElInput v-model="form.llm.provider" />
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="8">
            <ElFormItem label="Model">
              <ElInput v-model="form.llm.model" />
            </ElFormItem>
          </ElCol>
        </ElRow>

        <ElFormItem label="Base URL">
          <ElInput v-model="form.llm.baseUrl" />
        </ElFormItem>

        <ElRow :gutter="18">
          <ElCol :xs="24" :md="8">
            <ElFormItem label="API Key 来源">
              <ElSelect v-model="form.llm.apiKeySource">
                <ElOption label="读取 Codex auth.json" value="codex-auth" />
                <ElOption label="环境变量" value="environment" />
                <ElOption label="手动填写" value="manual" />
              </ElSelect>
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="8">
            <ElFormItem label="环境变量名">
              <ElInput v-model="form.llm.apiKeyEnv" :disabled="form.llm.apiKeySource !== 'environment'" />
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="8">
            <ElFormItem label="手动 API Key">
              <ElInput
                v-model="form.llm.manualApiKey"
                type="password"
                show-password
                placeholder="留空则不覆盖"
                :disabled="form.llm.apiKeySource !== 'manual'"
              />
            </ElFormItem>
          </ElCol>
        </ElRow>

        <ElDescriptions v-if="codex" :column="1" border>
          <ElDescriptionsItem label="Codex Provider">{{ codex.provider }}</ElDescriptionsItem>
          <ElDescriptionsItem label="Codex Model">{{ codex.model }}</ElDescriptionsItem>
          <ElDescriptionsItem label="Codex Base URL">{{ codex.baseUrl }}</ElDescriptionsItem>
          <ElDescriptionsItem label="Codex Key">{{ codex.hasAuthKey ? '已配置' : '未配置' }}</ElDescriptionsItem>
        </ElDescriptions>
      </ElForm>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, reactive, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import { apiRequest, getErrorMessage } from '@/utils/session-manager-api'

  type ProfileRecord = { id: string; name: string; note?: string }

  const loading = ref(false)
  const profiles = ref<ProfileRecord[]>([])
  const codex = ref<any>()
  const form = reactive({
    globalProfile: '',
    yoloDefault: true,
    llm: {
      enabled: true,
      provider: 'custom',
      model: 'gpt-5.5',
      baseUrl: 'http://127.0.0.1:48760/v1',
      apiKeySource: 'codex-auth',
      apiKeyEnv: 'OPENAI_API_KEY',
      manualApiKey: ''
    }
  })

  onMounted(loadData)

  async function loadData() {
    loading.value = true
    try {
      const [settingsData, profileData] = await Promise.all([
        apiRequest<{ settings: any }>('/api/settings'),
        apiRequest<{ profiles: ProfileRecord[] }>('/api/profiles')
      ])
      Object.assign(form, {
        globalProfile: settingsData.settings.globalProfile || '',
        yoloDefault: settingsData.settings.yoloDefault,
        llm: settingsData.settings.llm
      })
      codex.value = settingsData.settings.codex
      profiles.value = profileData.profiles
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      loading.value = false
    }
  }

  async function saveSettings() {
    loading.value = true
    try {
      const payload = JSON.parse(JSON.stringify(form))
      if (payload.llm.apiKeySource !== 'manual' || !payload.llm.manualApiKey) {
        delete payload.llm.manualApiKey
      }
      await apiRequest('/api/settings', { method: 'POST', body: payload })
      ElMessage.success('已保存')
      await loadData()
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      loading.value = false
    }
  }
</script>

<style scoped lang="scss">
  .settings-page {
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

  .settings-form {
    max-width: 980px;
  }
</style>
