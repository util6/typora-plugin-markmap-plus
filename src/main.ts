// 导入 Typora 插件核心库
import { Plugin, CodeblockPostProcessor, html, debounce, until, format, PluginSettings } from '@typora-community-plugin/core'
// 导入 markmap 核心库，用于转换 markdown 为思维导图数据
import { Transformer, builtInPlugins } from 'markmap-lib'
// 导入 markmap 视图库，用于渲染思维导图
import { Markmap, loadCSS, loadJS, deriveOptions } from 'markmap-view'
// 导入 YAML 解析库，用于解析代码块前置参数
import * as yaml from 'js-yaml'
// 导入日志工具
import { logger } from './utils'
// 导入设置相关模块
import { MarkmapSettings, DEFAULT_SETTINGS, MarkmapSettingTab } from './settings'

/**
 * Markmap 配置选项接口
 * 定义了思维导图的各种可配置参数
 */
interface MarkmapOptions {
  zoom?: boolean              // 是否启用缩放功能
  pan?: boolean               // 是否启用拖拽功能
  height?: string             // 思维导图高度
  backgroundColor?: string    // 背景颜色
  spacingHorizontal?: number  // 水平间距
  spacingVertical?: number    // 垂直间距
  fitRatio?: number          // 适应比例
  paddingX?: number          // 水平内边距
  autoFit?: boolean          // 是否自动适应
  color?: string[]           // 颜色数组
  colorFreezeLevel?: number  // 颜色冻结层级
  initialExpandLevel?: number // 初始展开层级
  maxWidth?: number          // 最大宽度
  duration?: number          // 动画持续时间
}




/**
 * Markmap 插件主类
 * 继承自 Typora 插件基类，实现思维导图功能
 */
export default class MarkmapPlugin extends Plugin<MarkmapSettings> {
  // ==================== 界面元素 ====================
  floatingButton?: HTMLElement    // 右下角悬浮按钮
  tocModal?: HTMLElement          // TOC 思维导图弹窗

  // ==================== 实例存储 ====================
  mmOfCid: Record<string, any> = {}  // 存储代码块思维导图实例，key为代码块ID
  tocMarkmap?: any = null            // TOC 思维导图实例

  // ==================== 核心组件 ====================
  transformer: Transformer          // markmap 转换器，用于将 markdown 转换为思维导图数据

  // ==================== 状态管理 ====================
  private resourcesLoaded = false              // 标记 markmap 资源是否已加载
  private eventCleanupFunctions: (() => void)[] = []  // 存储事件清理函数

  /**
   * 插件加载时的初始化方法
   * 负责设置配置、初始化组件、注册处理器等
   */
  onload() {
    try {
      // 注册插件设置实例，用于管理插件配置
      this.registerSettings(new PluginSettings(this.app, this.manifest, {
        version: 1
      }))

      // 设置默认配置并加载用户配置
      this.settings.setDefault(DEFAULT_SETTINGS)
      this.settings.load()

      // 注册设置面板，用户可通过偏好设置访问
      this.registerSettingTab(new MarkmapSettingTab(this.settings))

      // 初始化 markmap 转换器，使用内置插件
      this.transformer = new Transformer(builtInPlugins)

      // 异步初始化资源和组件
      this.initResources()
        .then(() => {
          // 创建右下角悬浮按钮
          this.initFloatingButton()

          logger('插件加载完成😯😯😯😯😯😯')
        })
        .catch(error => {
          logger(`资源初始化失败: ${error.message}`, 'error', error)
        })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger(`插件初始化失败: ${errorMsg}`, 'error', error)
    }
  }

  /**
   * 初始化 markmap 所需的 CSS 和 JS 资源
   * 确保思维导图能够正常渲染
   * @returns Promise<boolean> 是否成功加载资源
   */
  async initResources() {
    // 避免重复加载资源
    if (this.resourcesLoaded) {
      logger('资源已加载，跳过重复加载')
      return true
    }

    logger('开始初始化资源')

    try {
      // 从 transformer 获取 markmap 所需的样式和脚本资源
      const { styles, scripts } = this.transformer.getAssets()

      // 加载 CSS 样式文件
      logger('加载 CSS 资源', 'debug', styles)
      await loadCSS(styles ?? [])

      // 加载 JavaScript 脚本文件
      logger('加载 JS 资源', 'debug', scripts)
      await loadJS(scripts ?? [], { getMarkmap: () => ({ Markmap, loadCSS, loadJS, deriveOptions }) })

      // 标记资源已加载
      this.resourcesLoaded = true
      logger('Markmap 资源加载成功')

      return true
    } catch (error) {
      logger(`加载 Markmap 资源失败: ${error.message}`, 'error', error)
      throw error
    }
  }

  /**
   * 初始化右下角悬浮按钮
   * 用户可以通过点击此按钮快速打开 TOC 思维导图
   */
  initFloatingButton() {
    logger('初始化悬浮按钮')

    try {
      // 创建悬浮按钮元素
      this.floatingButton = document.createElement('div')
      this.floatingButton.className = 'markmap-floating-button'
      this.floatingButton.title = '显示目录思维导图 (Cmd+M)'
      this.floatingButton.innerHTML = `<span style="font-size: 20px;">🗺️</span>`

      // 绑定点击事件，点击时切换 TOC 思维导图显示状态
      this.floatingButton.addEventListener('click', () => {
        this.toggleTocMarkmap()
      })

      // 将按钮添加到页面
      document.body.appendChild(this.floatingButton)

      // 创建并添加样式
      const style = document.createElement('style')
      style.innerHTML = `
        /* 悬浮按钮样式 */
        .markmap-floating-button {
          position: fixed;
          right: 20px;
          bottom: 20px;
          width: 48px;
          height: 48px;
          background-color: #ffffff;
          border: 1px solid #e0e0e0;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 9998;
          transition: background-color 0.2s;
        }
        .markmap-floating-button:hover {
          background-color: #f5f5f5;
        }

        /* TOC 弹窗样式 */
        .markmap-toc-modal {
          position: fixed;
          top: 50px;
          right: 20px;
          width: 450px;
          height: 500px;
          background-color: #ffffff;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          z-index: 9999;
          display: flex;
          flex-direction: column;
          font-family: system-ui, -apple-system, sans-serif;
          resize: both;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        /* 左侧固定样式 */
        .markmap-toc-modal.docked-left {
          top: 0;
          left: 0;
          right: auto;
          width: 350px;
          height: 100vh;
          border-radius: 0;
          border-left: none;
          resize: horizontal;
        }

        /* TOC 弹窗头部样式 */
        .markmap-toc-header {
          padding: 10px;
          border-bottom: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #f8f9fa;
        }
        .markmap-toc-title {
          font-weight: bold;
          color: #333;
        }
        .markmap-toc-buttons {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .markmap-toc-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          border-radius: 3px;
        }
        .markmap-toc-btn:hover {
          background-color: #e9ecef;
        }

        /* TOC 弹窗内容区域样式 */
        .markmap-toc-content {
          flex-grow: 1;
          overflow: hidden;
        }
        .markmap-svg {
          width: 100%;
          height: 100%;
        }

        /* 代码块思维导图样式 */
        .plugin-fence-markmap-svg {
          width: 100%;
          height: 300px;
          background-color: #f8f8f8;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
        }
      `
      document.head.appendChild(style)

      // 注册清理函数，插件卸载时移除元素和样式
      this.register(() => {
        this.floatingButton?.remove()
        style.remove()
        this.eventCleanupFunctions.forEach(cleanup => cleanup())
        this.eventCleanupFunctions = []
      })

      logger('悬浮按钮初始化成功')
    } catch (error) {
      logger(`悬浮按钮初始化失败: ${error.message}`, 'error', error)
      throw error
    }
  }


  /**
   * 切换 TOC 思维导图的显示状态
   * 如果当前显示则隐藏，如果隐藏则显示
   */
  async toggleTocMarkmap() {
    try {
      if (this.tocModal && this.tocModal.style.display !== 'none') {
        this.hideTocMarkmap()
      } else {
        await this.showTocMarkmap()
      }
    } catch (error) {
      logger(`切换 TOC Markmap 失败: ${error.message}`, 'error', error)
    }
  }

  /**
   * 显示 TOC 思维导图弹窗
   * 创建弹窗界面，提取文档标题，生成思维导图
   */
  async showTocMarkmap() {
    logger('显示 TOC Markmap')

    try {
      // 创建弹窗容器
      this.tocModal = document.createElement('div')
      this.tocModal.className = 'markmap-toc-modal'
      // 从设置中获取窗口尺寸
      this.tocModal.style.width = `${this.settings.get('tocWindowWidth')}px`
      this.tocModal.style.height = `${this.settings.get('tocWindowHeight')}px`

      // 设置弹窗HTML结构
      this.tocModal.innerHTML = `
        <div class="markmap-toc-header">
          <span class="markmap-toc-title">目录思维导图</span>
          <div class="markmap-toc-buttons">
            <button class="markmap-toc-btn" data-action="dock-left" title="嵌入侧边栏">📌</button>
            <button class="markmap-toc-btn" data-action="zoom-in" title="放大">🔍+</button>
            <button class="markmap-toc-btn" data-action="zoom-out" title="缩小">🔍-</button>
            <button class="markmap-toc-btn" data-action="refresh" title="刷新">🔄</button>
            <button class="markmap-toc-btn" data-action="fit" title="适应视图">🎯</button>
            <button class="markmap-toc-btn" data-action="close" title="关闭">×</button>
          </div>
        </div>
        <div class="markmap-toc-content">
          <svg class="markmap-svg"></svg>
        </div>
      `

      // 将弹窗添加到页面
      document.body.appendChild(this.tocModal)

      // 绑定工具栏按钮事件
      const buttonClickHandler = async (e: Event) => {
        const target = e.target as HTMLElement
        const action = target.getAttribute('data-action')

        try {
          switch (action) {
            case 'close':
              this.hideTocMarkmap()
              break
            case 'dock-left':
              this.toggleSidebarEmbed()
              break
            case 'refresh':
              logger('刷新 TOC')
              await this.updateTocMarkmap()
              break
            case 'zoom-in':
              this.zoomIn()
              break
            case 'zoom-out':
              this.zoomOut()
              break
            case 'fit':
              this.fitToMousePosition(event as MouseEvent)
              break
          }
        } catch (error) {
          logger(`按钮操作失败: ${error.message}`, 'error', error)
        }
      }

      // 添加事件监听器并记录清理函数
      this.tocModal.addEventListener('click', buttonClickHandler)
      this.eventCleanupFunctions.push(() => {
        this.tocModal?.removeEventListener('click', buttonClickHandler)
      })

      // 初始化 TOC 内容
      await this.updateTocMarkmap()

      // 初始化其他事件监听器（如节点点击）
      this.initTocEventListeners()

      logger('TOC 窗口显示成功')
    } catch (error) {
      logger(`TOC 窗口显示失败: ${error.message}`, 'error', error)
      // 清理可能创建的元素
      if (this.tocModal) {
        this.tocModal.remove()
        this.tocModal = undefined
      }
      throw error
    }
  }

  /**
   * 更新 TOC 思维导图内容
   * 重新扫描文档标题，生成新的思维导图
   */
  async updateTocMarkmap() {
    if (!this.tocModal) return

    try {
      logger('更新 TOC Markmap')

      // 获取 SVG 容器元素
      const svg = this.tocModal.querySelector('.markmap-svg') as SVGElement
      if (!svg) return

      // 销毁旧的思维导图实例
      if (this.tocMarkmap) {
        this.tocMarkmap.destroy()
        this.tocMarkmap = null
      }

      // 重置 SVG 状态，清除之前的内容和变换
      svg.innerHTML = ''
      svg.style.transform = ''
      svg.style.transformOrigin = ''
      svg.removeAttribute('data-scale')

      // 重置 SVG 尺寸为容器大小
      const container = svg.parentElement
      if (container) {
        svg.style.width = '100%'
        svg.style.height = '100%'
      }

      // 扫描文档，获取所有标题
      const headings = await this.getDocumentHeadings()
      logger('文档标题:', 'debug', headings)

      // 如果没有标题，显示空状态
      if (headings.length === 0) {
        this.renderEmptyTOC(svg)
        return
      }

      // 将标题数组转换为 Markdown 格式
      const markdownContent = this.buildTocMarkdown(headings)
      logger('TOC Markdown 内容:', 'debug', markdownContent)

      // 使用 transformer 转换为 markmap 数据格式
      const { root } = this.transformer.transform(markdownContent)
      logger('Markmap 数据:', 'warn', root)

      // 配置思维导图选项
      const options = deriveOptions({
        spacingHorizontal: 80,                    // 水平间距
        spacingVertical: 20,                      // 垂直间距
        fitRatio: 0.95,                          // 适应比例
        paddingX: 20,                            // 水平内边距
        color: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4'], // 配色方案
        colorFreezeLevel: 2,                     // 颜色冻结层级
        initialExpandLevel: this.settings.get('initialExpandLevel') // 初始展开层级
      })

      // 创建新的思维导图实例
      this.tocMarkmap = Markmap.create(svg, options, root)
      logger('TOC Markmap 创建成功')

      // 延迟适应视图，确保渲染完成
      setTimeout(() => {
        this.tocMarkmap.fit()
      }, 100)
    } catch (error) {
      logger(`TOC Markmap 渲染错误: ${error.message}`, 'error', error)
      // 渲染错误信息到 SVG
      const svg = this.tocModal?.querySelector('.markmap-svg') as SVGElement
      if (svg) {
        this.renderErrorToSVG(svg, error.message)
      }
    }
  }

  /**
   * 将标题数组转换为层级化的 Markdown 内容
   * @param headings 标题数组，包含层级、文本和ID信息
   * @returns string 格式化的 Markdown 内容
   */
  buildTocMarkdown(headings: Array<{level: number, text: string, id: string}>): string {
    let markdown = ''

    // 遍历所有标题，根据层级生成对应的 Markdown 格式
    for (const heading of headings) {
      // 根据标题层级生成对应数量的 # 符号
      const indent = '#'.repeat(heading.level)
      markdown += `${indent} ${heading.text}\n`
    }

    return markdown
  }

  /**
   * 获取当前文档中的所有标题
   * 扫描编辑器内容，提取 h1-h6 标题元素
   * @returns Promise<Array> 标题信息数组
   */
  async getDocumentHeadings() {
    const headings: Array<{level: number, text: string, id: string}> = []

    // 获取 Typora 编辑器的内容容器
    const write = document.querySelector('#write')
    if (!write) return []

    // 查找所有标题元素（h1 到 h6）
    const hs = write.querySelectorAll('h1, h2, h3, h4, h5, h6')
    hs.forEach((h: Element) => {
      // 提取标题层级（从标签名获取数字）
      const level = parseInt(h.tagName.substring(1))
      // 获取标题文本内容
      const text = (h as HTMLElement).innerText.trim()
      // 获取或生成标题ID
      const id = h.id || `heading-${headings.length}`

      // 只添加有文本内容的标题
      if (text) {
        headings.push({ level, text, id })
      }
    })

    return headings
  }

  /**
   * 根据思维导图节点滚动到对应的文档标题位置
   * 实现思维导图与文档内容的联动
   * @param nodeEl 被点击的思维导图节点元素
   */
  scrollToHeadingByNode(nodeEl: Element) {
    // 获取节点的文本内容
    const nodeText = nodeEl.textContent?.trim();
    if (!nodeText) return;

    logger(`点击的节点文本: ${nodeText}`);

    // 在文档中查找匹配的标题
    const write = document.querySelector('#write');
    if (!write) return;

    // 获取所有标题元素
    const allHeadings = write.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (const heading of Array.from(allHeadings)) {
      // 比较标题文本是否匹配
      if (heading.textContent?.trim() === nodeText) {
        logger(`找到匹配的标题: ${heading.tagName} ${heading.textContent}`);
        // 平滑滚动到对应标题
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }

    logger(`未找到匹配的标题: ${nodeText}`, 'warn');
  }

  /**
   * 放大思维导图
   * 通过 CSS transform 实现简单的缩放功能
   */
  zoomIn() {
    const svg = this.tocModal?.querySelector('.markmap-svg') as SVGElement
    if (!svg) return

    // 获取当前缩放比例，默认为1
    const currentScale = parseFloat(svg.dataset.scale || '1')
    const zoomStep = this.settings.get('zoomStep')
    const newScale = currentScale + zoomStep

    // 应用新的缩放比例
    svg.style.transform = `scale(${newScale})`
    svg.style.transformOrigin = 'center center'
    svg.dataset.scale = newScale.toString()

    logger(`放大到: ${newScale}倍`)
  }

  /**
   * 缩小思维导图
   * 通过 CSS transform 实现简单的缩放功能
   */
  zoomOut() {
    const svg = this.tocModal?.querySelector('.markmap-svg') as SVGElement
    if (!svg) return

    // 获取当前缩放比例，默认为1
    const currentScale = parseFloat(svg.dataset.scale || '1')
    const zoomStep = this.settings.get('zoomStep')
    // 设置最小缩放比例为0.1，避免过度缩小
    const newScale = Math.max(currentScale - zoomStep, 0.1)

    // 应用新的缩放比例
    svg.style.transform = `scale(${newScale})`
    svg.style.transformOrigin = 'center center'
    svg.dataset.scale = newScale.toString()

    logger(`缩小到: ${newScale}倍`)
  }

  /**
   * 切换侧边栏嵌入模式
   */
  toggleSidebarEmbed() {
    if (!this.tocModal) return

    const isEmbedded = this.tocModal.classList.contains('sidebar-embedded')
    const sidebar = document.getElementById('typora-sidebar')

    if (isEmbedded) {
      // 恢复悬浮模式
      this.tocModal.classList.remove('sidebar-embedded')
      this.tocModal.style.cssText = `
        position: fixed !important;
        top: 50px !important;
        right: 20px !important;
        width: ${this.settings.get('tocWindowWidth')}px !important;
        height: ${this.settings.get('tocWindowHeight')}px !important;
        z-index: 9999 !important;
        background: white !important;
        border: 1px solid #e0e0e0 !important;
        border-radius: 8px !important;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
        display: flex !important;
        flex-direction: column !important;
        resize: both !important;
        overflow: hidden !important;
      `
      // 更新按钮
      const embedBtn = this.tocModal.querySelector('[data-action="dock-left"]') as HTMLElement
      if (embedBtn) {
        embedBtn.innerHTML = '📌'
        embedBtn.title = '嵌入侧边栏'
      }
      logger('思维导图已恢复悬浮窗口')
    } else {
      // 嵌入侧边栏 - 与 typora-sidebar 完全重合
      this.tocModal.classList.add('sidebar-embedded')
      
      if (sidebar) {
        const rect = sidebar.getBoundingClientRect()
        const computedStyle = window.getComputedStyle(sidebar)
        
        this.tocModal.style.cssText = `
          position: fixed !important;
          top: ${rect.top}px !important;
          left: ${rect.left}px !important;
          width: ${rect.width}px !important;
          height: ${rect.height}px !important;
          z-index: 9999 !important;
          background: white !important;
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          display: flex !important;
          flex-direction: column !important;
        `
        
        // 监听侧边栏尺寸变化
        const resizeObserver = new ResizeObserver(() => {
          if (this.tocModal?.classList.contains('sidebar-embedded')) {
            const newRect = sidebar.getBoundingClientRect()
            this.tocModal.style.width = `${newRect.width}px`
            this.tocModal.style.height = `${newRect.height}px`
            this.tocModal.style.top = `${newRect.top}px`
            this.tocModal.style.left = `${newRect.left}px`
          }
        })
        resizeObserver.observe(sidebar)
        
        // 保存观察器以便清理
        this.tocModal.setAttribute('data-resize-observer', 'active')
      }
      
      // 更新按钮
      const embedBtn = this.tocModal.querySelector('[data-action="dock-left"]') as HTMLElement
      if (embedBtn) {
        embedBtn.innerHTML = '🔗'
        embedBtn.title = '取消嵌入'
      }
      logger('思维导图已嵌入侧边栏')
    }

    // 重新适应视图
    setTimeout(() => {
      if (this.tocMarkmap) {
        this.tocMarkmap.fit()
      }
    }, 100)
  }

  /**
   * 智能适应视图功能
   * 以当前编辑器中可见的标题为中心进行缩放和定位
   * @param event 鼠标事件（可选）
   */
  fitToMousePosition(event?: MouseEvent) {
    if (!this.tocModal) return

    const svg = this.tocModal.querySelector('.markmap-svg') as SVGElement
    if (!svg) return

    // 获取当前编辑器中可见的标题
    const currentHeadingObj = this.getCurrentVisibleHeading()
    if (!currentHeadingObj) {
      // 没有找到当前标题，使用默认适应
      svg.style.transform = 'scale(10.0)'
      svg.style.transformOrigin = 'center center'
      svg.dataset.scale = '10.0'
      logger('未找到当前标题，使用默认适应视图')
      return
    }

    const currentHeading = currentHeadingObj.text
    logger(`当前可见标题: "${currentHeading}"`)

    // 在思维导图中找到对应的节点
    const nodeElements = svg.querySelectorAll('g > foreignObject')
    let targetElement = null

    // 遍历所有节点，查找匹配的标题
    for (const nodeEl of Array.from(nodeElements)) {
      const textContent = nodeEl.textContent?.trim() || ''
      if (textContent === currentHeading) {
        targetElement = nodeEl.parentElement
        logger(`找到匹配节点: "${textContent}"`)
        break
      }
    }

    if (targetElement) {
      // 计算合适的缩放比例，使节点文字大小与正文相匹配
      const scale = this.calculateOptimalScale(targetElement, currentHeadingObj)
      logger(`计算出的缩放比例: ${scale}`)

      // 获取节点在SVG中的实际位置
      const svgRect = svg.getBoundingClientRect()
      const nodeRect = targetElement.getBoundingClientRect()

      // 计算节点相对于SVG的中心位置
      const nodeX = nodeRect.left - svgRect.left + nodeRect.width / 2
      const nodeY = nodeRect.top - svgRect.top + nodeRect.height / 2

      // 设置缩放和变换原点
      svg.style.transform = `scale(${scale})`
      svg.style.transformOrigin = `${nodeX}px ${nodeY}px`
      svg.dataset.scale = scale.toString()

      logger(`以当前标题节点适应视图: "${currentHeading}"，缩放比例: ${scale}，中心点: (${nodeX}, ${nodeY})`)
    }
  }

  /**
   * 计算最佳缩放比例
   * 使思维导图节点的文字大小与正文文字大小相匹配
   * @param nodeElement 目标节点元素
   * @param headingObj 标题对象信息
   * @returns number 计算出的缩放比例
   */
  calculateOptimalScale(nodeElement: Element, headingObj: any) {
    try {
      // 获取正文内容区域
      const writeElement = document.querySelector('#write')
      if (!writeElement) return 2.0

      // 查找正文段落元素，用于获取基准字体大小
      const paragraph = writeElement.querySelector('p') || writeElement
      const documentFontSize = window.getComputedStyle(paragraph).fontSize
      const documentSize = parseFloat(documentFontSize)

      // 获取思维导图节点的实际渲染高度
      const nodeRect = nodeElement.getBoundingClientRect()
      const nodeHeight = nodeRect.height

      // 节点高度通常比字体大小大一些（包含行高、padding等）
      // 经验值：节点高度约为字体大小的1.2-1.5倍
      const estimatedNodeFontSize = nodeHeight

      // 计算缩放比例：正文字体大小 / 节点字体大小
      const scale = documentSize / estimatedNodeFontSize

      logger(`正文字体大小: ${documentSize}px, 节点高度: ${nodeHeight}px, 推算字体大小: ${estimatedNodeFontSize.toFixed(1)}px, 计算缩放: ${scale.toFixed(2)}, 最终缩放: ${scale.toFixed(2)}`)

      return scale
    } catch (error) {
      logger(`计算缩放比例失败: ${error.message}`, 'error')
      return 2.0 // 默认缩放比例
    }
  }

  /**
   * 获取当前编辑器视口中可见的标题
   * 用于智能适应视图功能，找到用户当前关注的内容
   * @returns object|null 当前可见的标题信息，包含文本、层级和元素引用
   */
  getCurrentVisibleHeading() {
    const write = document.querySelector('#write')
    if (!write) return null

    const headings = write.querySelectorAll('h1, h2, h3, h4, h5, h6')
    const viewportTop = window.scrollY
    const viewportBottom = viewportTop + window.innerHeight

    // 找到第一个在视口中的标题
    for (const heading of Array.from(headings)) {
      const rect = heading.getBoundingClientRect()
      const elementTop = rect.top + window.scrollY

      // 如果标题在视口中或刚好在视口上方一点（容错范围100px）
      if (elementTop >= viewportTop - 100 && elementTop <= viewportBottom) {
        return {
          text: heading.textContent?.trim() || '',
          level: parseInt(heading.tagName.substring(1)),
          element: heading
        }
      }
    }

    // 如果没有找到在视口中的标题，返回最接近视口顶部的标题
    let closestHeading = null
    let minDistance = Infinity

    for (const heading of Array.from(headings)) {
      const rect = heading.getBoundingClientRect()
      const elementTop = rect.top + window.scrollY
      const distance = Math.abs(elementTop - viewportTop)

      // 记录距离最近的标题
      if (distance < minDistance) {
        minDistance = distance
        closestHeading = {
          text: heading.textContent?.trim() || '',
          level: parseInt(heading.tagName.substring(1)),
          element: heading
        }
      }
    }

    return closestHeading
  }






  /**
   * 初始化 TOC 思维导图的事件监听器
   * 主要处理节点点击事件，实现思维导图与文档的联动
   */
  initTocEventListeners() {
    if (!this.tocModal) return;

    const svg = this.tocModal.querySelector('.markmap-svg') as SVGElement;
    if (!svg) return;

    // 绑定节点点击事件处理器
    const clickHandler = (e: Event) => {
      const target = e.target as Element;
      // 查找最近的思维导图节点元素
      const nodeEl = target.closest('.markmap-node');

      if (nodeEl) {
        // 点击节点时滚动到对应的文档标题
        this.scrollToHeadingByNode(nodeEl);
      }
    };

    // 添加事件监听器
    svg.addEventListener('click', clickHandler);
    // 记录清理函数，用于插件卸载时移除事件监听器
    this.eventCleanupFunctions.push(() => {
      svg.removeEventListener('click', clickHandler);
    });
  }

  /**
   * 渲染空状态的 TOC 提示
   * 当文档中没有标题时显示友好的提示信息
   * @param svg SVG 容器元素
   */
  renderEmptyTOC(svg: SVGElement) {
    // 清空 SVG 内容并设置样式
    svg.innerHTML = ''
    svg.style.backgroundColor = '#f8f9fa'

    // 创建 SVG 组元素，用于包含所有提示内容
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('transform', 'translate(50, 50)')

    // 创建文档图标
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    icon.setAttribute('x', '150')
    icon.setAttribute('y', '100')
    icon.setAttribute('text-anchor', 'middle')
    icon.setAttribute('font-size', '48')
    icon.textContent = '📄'

    // 创建主提示文本
    const text1 = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text1.setAttribute('x', '150')
    text1.setAttribute('y', '140')
    text1.setAttribute('text-anchor', 'middle')
    text1.setAttribute('font-size', '14')
    text1.setAttribute('fill', '#666')
    text1.textContent = '当前文档没有标题'

    // 创建辅助提示文本
    const text2 = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text2.setAttribute('x', '150')
    text2.setAttribute('y', '160')
    text2.setAttribute('text-anchor', 'middle')
    text2.setAttribute('font-size', '12')
    text2.setAttribute('fill', '#999')
    text2.textContent = '请添加一些标题来生成思维导图'

    // 将所有元素添加到组中，再添加到 SVG
    g.appendChild(icon)
    g.appendChild(text1)
    g.appendChild(text2)
    svg.appendChild(g)
  }

  /**
   * 在 SVG 中渲染错误信息
   * 当思维导图渲染失败时显示错误提示
   * @param svg SVG 容器元素
   * @param errorMessage 错误信息文本
   */
  renderErrorToSVG(svg: SVGElement, errorMessage: string) {
    // 清空 SVG 内容并设置错误样式
    svg.innerHTML = ''
    svg.style.backgroundColor = '#ffebee'  // 浅红色背景
    svg.style.border = '1px solid #f44336'  // 红色边框

    // 创建错误文本元素
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', '10')
    text.setAttribute('y', '30')
    text.setAttribute('font-size', '12')
    text.setAttribute('fill', '#f44336')  // 红色文字
    text.textContent = `渲染错误: ${errorMessage}`

    svg.appendChild(text)
  }

  /**
   * 隐藏 TOC 思维导图弹窗
   * 清理相关资源和事件监听器
   */
  hideTocMarkmap() {
    if (this.tocModal) {
      // 从 DOM 中移除弹窗元素
      this.tocModal.remove()
      this.tocModal = undefined

      // 销毁思维导图实例，释放内存
      if (this.tocMarkmap) {
        this.tocMarkmap.destroy()
        this.tocMarkmap = undefined
      }

      logger('TOC 窗口已关闭')
    }
  }



  /**
   * 插件卸载时的清理方法
   * 负责清理所有资源、事件监听器和实例，防止内存泄漏
   */
  onunload() {
    logger('插件卸载')

    try {
      // 隐藏并清理 TOC 弹窗
      this.hideTocMarkmap()

      // 清理所有代码块思维导图实例
      Object.values(this.mmOfCid).forEach(mm => {
        if (mm && typeof mm.destroy === 'function') {
          mm.destroy()
        }
      })
      this.mmOfCid = {}

      // 清理所有事件监听器
      this.eventCleanupFunctions.forEach(cleanup => cleanup())
      this.eventCleanupFunctions = []

      // 重置资源加载状态
      this.resourcesLoaded = false

      logger('Markmap 插件已卸载')
    } catch (error) {
      logger(`插件卸载时出错: ${error.message}`, 'error', error)
    }
  }
}
