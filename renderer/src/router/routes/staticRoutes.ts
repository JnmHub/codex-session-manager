import { AppRouteRecordRaw } from '@/utils/router'

export const staticRoutes: AppRouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/sessions'
  },
  {
    path: '/sessions',
    name: 'SessionsRoot',
    component: () => import('@views/index/index.vue'),
    redirect: '/sessions/list',
    meta: { title: '会话管理', icon: 'ri:terminal-box-line' },
    children: [
      {
        path: 'list',
        name: 'Sessions',
        component: () => import('@views/sessions/index.vue'),
        meta: {
          title: '会话管理',
          icon: 'ri:terminal-box-line',
          keepAlive: false,
          fixedTab: true
        }
      },
      {
        path: 'favorites',
        name: 'FavoriteSessions',
        component: () => import('@views/sessions/index.vue'),
        meta: {
          title: '收藏会话',
          icon: 'ri:star-line',
          keepAlive: false
        }
      },
      {
        path: 'archived',
        name: 'ArchivedSessions',
        component: () => import('@views/sessions/index.vue'),
        meta: {
          title: '归档会话',
          icon: 'ri:archive-line',
          keepAlive: false
        }
      },
      {
        path: 'new',
        name: 'NewSession',
        component: () => import('@views/new-session/index.vue'),
        meta: {
          title: '新建会话',
          icon: 'ri:add-box-line',
          keepAlive: false
        }
      },
      {
        path: 'profiles',
        name: 'Profiles',
        component: () => import('@views/profiles/index.vue'),
        meta: {
          title: 'Profile 管理',
          icon: 'ri:user-settings-line',
          keepAlive: false
        }
      },
      {
        path: 'llm',
        name: 'LlmTools',
        component: () => import('@views/llm/index.vue'),
        meta: {
          title: 'LLM 工具',
          icon: 'ri:sparkling-line',
          keepAlive: false
        }
      },
      {
        path: 'skills',
        name: 'Skills',
        component: () => import('@views/skills/index.vue'),
        meta: {
          title: 'Skills 管理',
          icon: 'ri:booklet-line',
          keepAlive: false
        }
      },
      {
        path: 'mcp',
        name: 'Mcp',
        component: () => import('@views/mcp/index.vue'),
        meta: {
          title: 'MCP 管理',
          icon: 'ri:server-line',
          keepAlive: false
        }
      },
      {
        path: 'hooks',
        name: 'Hooks',
        component: () => import('@views/hooks/index.vue'),
        meta: {
          title: 'Hooks 管理',
          icon: 'ri:git-branch-line',
          keepAlive: false
        }
      },
      {
        path: 'codex-config',
        name: 'CodexConfig',
        component: () => import('@views/codex-config/index.vue'),
        meta: {
          title: 'Codex 配置',
          icon: 'ri:file-settings-line',
          keepAlive: false
        }
      },
      {
        path: 'settings',
        name: 'GlobalSettings',
        component: () => import('@views/settings/index.vue'),
        meta: {
          title: '全局设置',
          icon: 'ri:settings-3-line',
          keepAlive: false
        }
      },
      {
        path: 'about',
        name: 'About',
        component: () => import('@views/about/index.vue'),
        meta: {
          title: '关于系统',
          icon: 'ri:information-line',
          keepAlive: false
        }
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/sessions/list'
  }
]
