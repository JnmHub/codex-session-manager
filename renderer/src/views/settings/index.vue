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
        <section class="settings-block">
          <div class="block-title">
            <h3>外观主题</h3>
            <p>切换应用的亮色、暗色和主色风格，设置会立即生效。</p>
          </div>
          <ElRow :gutter="18">
            <ElCol :xs="24" :md="12">
              <ElFormItem label="主题模式">
                <ElSegmented
                  v-model="systemThemeMode"
                  :options="themeOptions"
                  @change="changeTheme"
                />
              </ElFormItem>
            </ElCol>
            <ElCol :xs="24" :md="12">
              <ElFormItem label="主题主色">
                <div class="theme-color-list">
                  <button
                    v-for="color in AppConfig.systemMainColor"
                    :key="color"
                    class="theme-color-item"
                    :class="{ active: color === systemThemeColor }"
                    :style="{ backgroundColor: color }"
                    type="button"
                    :aria-label="`切换主题色 ${color}`"
                    @click="changeThemeColor(color)"
                  >
                    <ElIcon v-if="color === systemThemeColor"><Check /></ElIcon>
                  </button>
                </div>
              </ElFormItem>
            </ElCol>
          </ElRow>
        </section>

        <ElDivider />

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
  import { storeToRefs } from 'pinia'
  import { Check } from '@element-plus/icons-vue'
  import { ElMessage } from 'element-plus'
  import AppConfig from '@/config'
  import { SystemThemeEnum } from '@/enums/appEnum'
  import { useTheme } from '@/hooks/core/useTheme'
  import { useSettingStore } from '@/store/modules/setting'
  import { apiRequest, getErrorMessage } from '@/utils/session-manager-api'

  type ProfileRecord = { id: string; name: string; note?: string }

  const settingStore = useSettingStore()
  const { systemThemeMode, systemThemeColor } = storeToRefs(settingStore)
  const { switchThemeStyles } = useTheme()
  const loading = ref(false)
  const profiles = ref<ProfileRecord[]>([])
  const codex = ref<any>()
  const themeOptions = [
    { label: '亮色', value: SystemThemeEnum.LIGHT },
    { label: '暗色', value: SystemThemeEnum.DARK },
    { label: '跟随系统', value: SystemThemeEnum.AUTO }
  ]
  const form = reactive({
    globalProfile: '',
    yoloDefault: true,
    llm: {
      enabled: true,
      provider: '',
      model: '',
      baseUrl: '',
      apiKeySource: 'codex-auth',
      apiKeyEnv: 'OPENAI_API_KEY',
      manualApiKey: ''
    }
  })

  onMounted(loadData)

  function changeTheme(value: string | number | boolean) {
    switchThemeStyles(value as SystemThemeEnum)
  }

  function changeThemeColor(color: string) {
    settingStore.setElementTheme(color)
  }

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

  .settings-block {
    display: grid;
    gap: 14px;
  }

  .block-title {
    h3 {
      margin: 0;
      color: var(--art-gray-900);
      font-size: 16px;
      font-weight: 600;
      line-height: 24px;
    }

    p {
      margin: 4px 0 0;
      color: var(--art-gray-500);
      font-size: 13px;
      line-height: 20px;
    }
  }

  .theme-color-list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    min-height: 32px;
  }

  .theme-color-item {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 2px solid transparent;
    border-radius: 50%;
    color: #fff;
    cursor: pointer;
    outline: none;
    box-shadow: 0 4px 12px rgb(0 0 0 / 12%);

    &:focus-visible {
      border-color: var(--art-gray-900);
    }

    &.active {
      border-color: var(--art-main-bg-color);
      box-shadow:
        0 0 0 2px var(--theme-color),
        0 4px 12px rgb(0 0 0 / 12%);
    }
  }
</style>
