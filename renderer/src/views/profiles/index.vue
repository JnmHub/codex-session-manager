<template>
  <div class="profiles-page art-full-height">
    <ElCard class="art-table-card" shadow="never">
      <ArtTableHeader layout="refresh" :loading="loading" @refresh="loadProfiles">
        <template #left>
          <div class="table-title">
            <h3>Profile 管理</h3>
            <span>{{ profiles.length }} 个</span>
          </div>
        </template>
        <template #right>
          <ElButton type="primary" @click="openEditor()" v-ripple>新增 Profile</ElButton>
        </template>
      </ArtTableHeader>

      <ElTable v-loading="loading" :data="profiles" row-key="id" height="calc(100vh - 260px)">
        <ElTableColumn prop="name" label="名称" min-width="160" />
        <ElTableColumn prop="note" label="备注" min-width="240">
          <template #default="{ row }">{{ row.note || '未备注' }}</template>
        </ElTableColumn>
        <ElTableColumn prop="configPath" label="配置文件" min-width="280">
          <template #default="{ row }">
            <span class="path-text">{{ row.configPath || `${row.name}.config.toml` }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <ElButton link type="primary" @click="openEditor(row)">编辑</ElButton>
            <ElButton link type="danger" @click="removeProfile(row)">删除</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <ElDrawer v-model="drawerVisible" title="Profile" size="860px" append-to-body>
      <ElForm label-position="top" class="profile-form">
        <ElRow :gutter="16">
          <ElCol :xs="24" :md="8">
            <ElFormItem label="名称">
              <ElInput v-model="form.name" placeholder="例如 ctf" />
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="16">
            <ElFormItem label="备注">
              <ElInput v-model="form.note" placeholder="Profile 用途说明" />
            </ElFormItem>
          </ElCol>
        </ElRow>
        <ElFormItem label="附加参数">
          <ElInput v-model="form.commandArgs" placeholder="可选，例如 --model gpt-5.5" />
        </ElFormItem>
      </ElForm>

      <ElTabs v-model="activeTab">
        <ElTabPane label="配置 TOML" name="config">
          <div class="file-bar">
            <span>{{ profileFiles?.config.path || '保存后生成配置路径' }}</span>
            <ElTag size="small" :type="profileFiles?.config.exists ? 'success' : 'info'">
              {{ profileFiles?.config.exists ? '已存在' : '新文件' }}
            </ElTag>
          </div>
          <TomlEditor
            v-model="fileForm.configContent"
            :rows="22"
            placeholder="Profile 的 toml 配置内容"
          />
        </ElTabPane>
        <ElTabPane label="Markdown" name="markdown">
          <div class="file-bar">
            <span>{{ profileFiles?.markdown.path || '保存后生成 Markdown 路径' }}</span>
            <ElTag size="small" :type="profileFiles?.markdown.exists ? 'success' : 'info'">
              {{ profileFiles?.markdown.exists ? '已存在' : '新文件' }}
            </ElTag>
          </div>
          <ElInput
            v-model="fileForm.markdownContent"
            type="textarea"
            :rows="22"
            resize="none"
            placeholder="Profile 对应的说明 Markdown，可保存为同名 .md"
          />
        </ElTabPane>
      </ElTabs>

      <template #footer>
        <ElButton @click="drawerVisible = false">取消</ElButton>
        <ElButton :loading="fileLoading" @click="reloadFiles">重载文件</ElButton>
        <ElButton type="primary" :loading="saving" @click="saveProfile">保存</ElButton>
      </template>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, reactive, ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import TomlEditor from '@/components/session-manager/TomlEditor.vue'
  import { apiRequest, getErrorMessage } from '@/utils/session-manager-api'

  type ProfileRecord = {
    id: string
    name: string
    note?: string
    commandArgs?: string
    configPath?: string
    markdownPath?: string
  }

  type ProfileFiles = {
    profile: ProfileRecord
    config: { path: string; exists: boolean; content: string }
    markdown: { path: string; exists: boolean; content: string }
  }

  const loading = ref(false)
  const saving = ref(false)
  const fileLoading = ref(false)
  const profiles = ref<ProfileRecord[]>([])
  const drawerVisible = ref(false)
  const activeTab = ref('config')
  const profileFiles = ref<ProfileFiles>()
  const form = reactive({ id: '', name: '', note: '', commandArgs: '' })
  const fileForm = reactive({ configContent: '', markdownContent: '' })

  onMounted(loadProfiles)

  async function loadProfiles() {
    loading.value = true
    try {
      profiles.value = (await apiRequest<{ profiles: ProfileRecord[] }>('/api/profiles')).profiles
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      loading.value = false
    }
  }

  async function openEditor(row?: ProfileRecord) {
    form.id = row?.id || ''
    form.name = row?.name || ''
    form.note = row?.note || ''
    form.commandArgs = row?.commandArgs || ''
    fileForm.configContent = ''
    fileForm.markdownContent = ''
    profileFiles.value = undefined
    activeTab.value = 'config'
    drawerVisible.value = true
    if (row?.id) {
      await loadFiles(row.id)
    }
  }

  async function loadFiles(id: string) {
    fileLoading.value = true
    try {
      const files = await apiRequest<ProfileFiles>(`/api/profile-files?id=${encodeURIComponent(id)}`)
      profileFiles.value = files
      fileForm.configContent = files.config.content
      fileForm.markdownContent = files.markdown.content
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      fileLoading.value = false
    }
  }

  async function reloadFiles() {
    const id = form.id || form.name
    if (!id) return
    await loadFiles(id)
  }

  async function saveProfile() {
    saving.value = true
    try {
      const saved = await apiRequest<{ profile: ProfileRecord }>('/api/profiles', {
        method: 'POST',
        body: { ...form, id: form.id || undefined }
      })
      form.id = saved.profile.id
      await apiRequest('/api/profile-files', {
        method: 'POST',
        body: {
          id: saved.profile.id,
          configContent: fileForm.configContent,
          markdownContent: fileForm.markdownContent
        }
      })
      ElMessage.success('已保存')
      drawerVisible.value = false
      await loadProfiles()
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      saving.value = false
    }
  }

  async function removeProfile(row: ProfileRecord) {
    await ElMessageBox.confirm(`删除 Profile「${row.name}」的本工具记录？不会删除 Codex 配置文件。`, '确认删除', {
      type: 'warning'
    })
    await apiRequest('/api/profiles', { method: 'DELETE', body: { id: row.id } })
    ElMessage.success('已删除')
    await loadProfiles()
  }
</script>

<style scoped lang="scss">
  .table-title {
    display: flex;
    align-items: center;
    gap: 10px;

    h3 {
      margin: 0;
      font-size: 16px;
    }

    span {
      color: var(--art-gray-500);
      font-size: 13px;
    }
  }

  .path-text {
    display: block;
    overflow: hidden;
    color: var(--art-gray-600);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-form {
    margin-bottom: 8px;
  }

  .file-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;

    span {
      overflow: hidden;
      color: var(--art-gray-500);
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
