import App from './App.vue'
import { createApp } from 'vue'
import { initStore } from './store'                 // Store
import { initRouter } from './router'               // Router
import language from './locales'                    // 国际化
import '@styles/core/tailwind.css'                  // tailwind
import '@styles/index.scss'                         // 样式
import '@utils/sys/console.ts'                      // 控制台输出内容
import { setupGlobDirectives } from './directives'
import { setupErrorHandle } from './utils/sys/error-handle'
import { useUserStore } from './store/modules/user'
import { useMenuStore } from './store/modules/menu'
import { useSettingStore } from './store/modules/setting'
import { ContainerWidthEnum, MenuTypeEnum } from './enums/appEnum'

document.addEventListener(
  'touchstart',
  function () {},
  { passive: false }
)

const app = createApp(App)
initStore(app)
bootstrapSessionManager()
initRouter(app)
setupGlobDirectives(app)
setupErrorHandle(app)

app.use(language)
app.mount('#app')

function bootstrapSessionManager() {
  const userStore = useUserStore()
  const menuStore = useMenuStore()
  const settingStore = useSettingStore()

  settingStore.switchMenuLayouts(MenuTypeEnum.LEFT)
  settingStore.setContainerWidth(ContainerWidthEnum.FULL)
  settingStore.setMenuOpen(true)
  settingStore.setWorkTab(false)
  settingStore.setWatermarkVisible(false)
  settingStore.setShowFestivalText(false)
  settingStore.hideSettingGuide()
  if (settingStore.showFastEnter) settingStore.setFastEnter()
  if (settingStore.showRefreshButton) settingStore.setShowRefreshButton()
  if (settingStore.showLanguage) settingStore.setLanguage()

  userStore.setLoginStatus(true)
  userStore.setUserInfo({
    userId: 1,
    userName: 'local',
    username: 'local',
    email: 'local@codex.session',
    userPic: '',
    roles: ['R_SUPER'],
    buttons: []
  } as unknown as Api.Auth.UserInfo)

  menuStore.setMenuList([
    {
      name: 'SessionsRoot',
      path: '/sessions',
      component: '/index/index',
      meta: {
        title: '会话管理',
        icon: 'ri:terminal-box-line'
      },
      children: [
        {
          path: '/sessions/list',
          name: 'Sessions',
          component: '/sessions/index',
          meta: {
            title: '会话管理',
            icon: 'ri:terminal-box-line',
            keepAlive: false,
            fixedTab: true
          }
        },
        {
          path: '/sessions/favorites',
          name: 'FavoriteSessions',
          component: '/sessions/index',
          meta: {
            title: '收藏会话',
            icon: 'ri:star-line',
            keepAlive: false
          }
        },
        {
          path: '/sessions/archived',
          name: 'ArchivedSessions',
          component: '/sessions/index',
          meta: {
            title: '归档会话',
            icon: 'ri:archive-line',
            keepAlive: false
          }
        },
        {
          path: '/sessions/profiles',
          name: 'Profiles',
          component: '/profiles/index',
          meta: {
            title: 'Profile 管理',
            icon: 'ri:user-settings-line',
            keepAlive: false
          }
        },
        {
          path: '/sessions/llm',
          name: 'LlmTools',
          component: '/llm/index',
          meta: {
            title: 'LLM 工具',
            icon: 'ri:sparkling-line',
            keepAlive: false
          }
        },
        {
          path: '/sessions/codex-config',
          name: 'CodexConfig',
          component: '/codex-config/index',
          meta: {
            title: 'Codex 配置',
            icon: 'ri:file-settings-line',
            keepAlive: false
          }
        },
        {
          path: '/sessions/settings',
          name: 'GlobalSettings',
          component: '/settings/index',
          meta: {
            title: '全局设置',
            icon: 'ri:settings-3-line',
            keepAlive: false
          }
        },
        {
          path: '/sessions/about',
          name: 'About',
          component: '/about/index',
          meta: {
            title: '关于系统',
            icon: 'ri:information-line',
            keepAlive: false
          }
        }
      ]
    }
  ] as any)
}
