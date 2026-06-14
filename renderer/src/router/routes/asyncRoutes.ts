import { AppRouteRecord } from '@/types/router'

/**
 * 会话管理器只保留本地会话页面，不再加载 upstream 的示例/系统管理动态路由。
 */
export const asyncRoutes: AppRouteRecord[] = []
