/**
 * Typora 插件工具函数集合
 * 专门处理跨平台差异和调试功能
 */

// 平台检测
export const isMacOS = () => navigator.platform.includes('Mac')
export const isWindows = () => navigator.platform.includes('Win')

// 调试配置
const DEBUG_CONFIG = {
  enabled: true,
  showInPage: isMacOS(),
  showTimestamp: true,
  autoRemoveDelay: {
    info: 10000,
    warn: 4000,
    error: 6000,
    debug: 2000
  },
  colors: {
    info: '#2196F3',
    warn: '#FF9800',
    error: '#f44336',
    debug: '#9C27B0'
  },
  copySuccessColor: '#4CAF50',
  logLevel: 'info' as 'debug' | 'info' | 'warn' | 'error'
}

/**
 * 跨平台日志输出
 * 在 macOS 下使用页面显示，Windows 下使用 console
 */
export function logger(message: string, level: 'debug' | 'info' | 'warn' | 'error' = 'info', data?: any) {
  if (!DEBUG_CONFIG.enabled) return

  const timestamp = DEBUG_CONFIG.showTimestamp ? new Date().toLocaleTimeString() : ''
  const fullMessage = timestamp ? `[${timestamp}] [MARKMAP-${level.toUpperCase()}] ${message}` : `[MARKMAP-${level.toUpperCase()}] ${message}`

  // 始终输出到 console（即使在 macOS 下可能看不到）
  const consoleFn = console[level] || console.log
  if (data) {
    consoleFn(fullMessage, data)
  } else {
    consoleFn(fullMessage)
  }

  // 在 macOS 下额外显示页面消息
  if (DEBUG_CONFIG.showInPage && (level === 'info' || level === 'warn' || level === 'error')) {
    showPageMessage(message, level)
  }
}

/**
 * 页面消息显示（主要用于 macOS 调试）
 */
function showPageMessage(message: string, type: 'info' | 'warn' | 'error' = 'info') {
  const messageDiv = document.createElement('div')
  const existingMessages = document.querySelectorAll('[data-debug-message]')
  const topOffset = 10 + (existingMessages.length * 40)

  messageDiv.style.cssText = `
    position: fixed;
    top: ${topOffset}px;
    right: 10px;
    background: ${DEBUG_CONFIG.colors[type]};
    color: white;
    padding: 6px 10px;
    border-radius: 4px;
    z-index: 10000;
    font-size: 12px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    max-width: 300px;
    word-wrap: break-word;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    line-height: 1.4;
    cursor: pointer;
  `
  messageDiv.setAttribute('data-debug-message', 'true')
  messageDiv.textContent = message

  // 点击复制功能
  messageDiv.addEventListener('click', () => {
    navigator.clipboard.writeText(message).then(() => {
      messageDiv.style.background = DEBUG_CONFIG.copySuccessColor
      messageDiv.textContent = '已复制到剪贴板'
      setTimeout(() => {
        messageDiv.textContent = message
        messageDiv.style.background = DEBUG_CONFIG.colors[type]
      }, 1000)
    })
  })

  document.body.appendChild(messageDiv)

  // 自动移除
  const timeout = DEBUG_CONFIG.autoRemoveDelay[type]
  setTimeout(() => {
    if (messageDiv.parentNode) {
      messageDiv.remove()
    }
  }, timeout)
}

/**
 * 性能监控工具
 */
export class PerformanceMonitor {
  private timers: Map<string, number> = new Map()

  start(label: string) {
    this.timers.set(label, performance.now())
    logger(`⏱️ 开始计时: ${label}`, 'debug')
  }

  end(label: string) {
    const startTime = this.timers.get(label)
    if (startTime) {
      const duration = performance.now() - startTime
      this.timers.delete(label)
      logger(`⏱️ 结束计时: ${label} - ${duration.toFixed(2)}ms`, 'debug')
      return duration
    }
    logger(`⚠️ 未找到计时器: ${label}`, 'warn')
    return 0
  }
}

/**
 * 错误处理工具
 */
export function handleError(error: unknown, context: string) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  logger(`❌ ${context}: ${errorMessage}`, 'error', error)

  // 在 macOS 下可能需要更明显的错误提示
  if (isMacOS()) {
    showPageMessage(`${context}: ${errorMessage}`, 'error')
  }
}

/**
 * 调试断点工具（针对 macOS 调试困难的解决方案）
 */
export function debugBreakpoint(label: string, data?: any) {
  logger(`🔍 调试断点: ${label}`, 'debug', data)

  // 在 macOS 下，由于 debugger 可能无效，使用页面显示
  if (isMacOS()) {
    showPageMessage(`调试断点: ${label}`, 'info')
  }

  // 仍然尝试使用 debugger，在 Windows 下有效
  if (DEBUG_CONFIG.enabled && !isMacOS()) {
    debugger
  }
}

/**
 * 状态检查工具
 */
export function checkState(condition: boolean, message: string) {
  if (!condition) {
    logger(`⚠️ 状态检查失败: ${message}`, 'warn')
    return false
  }
  logger(`✅ 状态检查通过: ${message}`, 'debug')
  return true
}

/**
 * DOM 元素检查工具
 */
export function checkElement(selector: string, context: string = '未知'): HTMLElement | null {
  const element = document.querySelector(selector) as HTMLElement
  if (!element) {
    logger(`❌ 元素未找到: ${selector} (上下文: ${context})`, 'error')
    return null
  }
  logger(`✅ 元素已找到: ${selector}`, 'debug')
  return element
}

/**
 * 配置调试开关
 */
export function setDebugMode(enabled: boolean) {
  DEBUG_CONFIG.enabled = enabled
  logger(`🔧 调试模式${enabled ? '开启' : '关闭'}`, 'info')
}

/**
 * 获取调试信息
 */
export function getDebugInfo() {
  return {
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    isMacOS: isMacOS(),
    isWindows: isWindows(),
    debugEnabled: DEBUG_CONFIG.enabled,
    timestamp: new Date().toISOString()
  }
}
