import { Plugin, CodeblockPostProcessor, html } from '@typora-community-plugin/core'
import { Transformer, builtInPlugins } from 'markmap-lib'
import { Markmap, loadCSS, loadJS, deriveOptions } from 'markmap-view'
import * as yaml from 'js-yaml'
import { logger } from './utils'

// 定义简单的树节点接口
interface TreeNode {
  content: string
  children: TreeNode[]
  depth: number
}

// 定义 Markmap 配置接口
interface MarkmapOptions {
  zoom?: boolean
  pan?: boolean
  height?: string
  backgroundColor?: string
  spacingHorizontal?: number
  spacingVertical?: number
  fitRatio?: number
  paddingX?: number
  autoFit?: boolean
  color?: string[]
  colorFreezeLevel?: number
  initialExpandLevel?: number
  maxWidth?: number
  duration?: number
}




export default class MarkmapPlugin extends Plugin {
  // 界面元素
  floatingButton?: HTMLElement
  tocModal?: HTMLElement

  // 实例存储
  mmOfCid: Record<string, any> = {}
  tocMarkmap?: any = null

  // markmap库实例
  transformer: Transformer

  // 状态标记
  isDebugMode = true

  onload() {


    try {
      // 初始化 markmap transformer
      this.transformer = new Transformer(builtInPlugins)

      // 初始化资源
      this.initResources()
        .then(() => {


          // 创建悬浮按钮
          this.initFloatingButton()

          // 注册命令
          this.registerCommands()

          // 注册设置选项卡
          this.registerSettings()

          // 注册代码块处理器
          this.registerCodeblockProcessor()

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

  registerSettings() {
    this.registerSettingTab('markmap-settings', {
      title: 'Markmap Settings',
      icon: 'ion-md-settings',
      onRender: (container) => {
        // 创建设置面板内容
        const panel = document.createElement('div');
        panel.className = 'markmap-setting-panel';
        panel.innerHTML = `
          <h3>Markmap Settings</h3>
          <p>在这里可以放置 Markmap 插件的配置选项。</p>
          <!-- 可以在此处添加具体的设置项 -->
        `;
        
        // 将设置面板添加到容器中
        container.appendChild(panel);
      },
      onEnter: () => {
        logger('进入设置面板');
        // 当用户进入设置面板时的回调
      },
      onLeave: () => {
        logger('离开设置面板');
        // 当用户离开设置面板时的回调
      }
    });
  }

  async initResources() {
    logger('开始初始化资源')

    try {
      // 获取 markmap 所需的资源
      const { styles, scripts } = this.transformer.getAssets()

      logger('加载 CSS 资源', 'debug', styles)
      await loadCSS(styles ?? [])

      logger('加载 JS 资源', 'debug', scripts)
      await loadJS(scripts ?? [], { getMarkmap: () => ({ Markmap, loadCSS, loadJS, deriveOptions }) })

      logger('Markmap 资源加载成功')

      return true
    } catch (error) {
      logger(`加载 Markmap 资源失败: ${error.message}`, 'error', error)
      throw error
    }
  }

  initFloatingButton() {
    logger('初始化悬浮按钮')

    try {
      this.floatingButton = document.createElement('div')
      this.floatingButton.className = 'markmap-floating-button'
      this.floatingButton.title = '显示目录思维导图 (Cmd+M)'
      this.floatingButton.innerHTML = `<span style="font-size: 20px;">🗺️</span>`

      this.floatingButton.addEventListener('click', () => {
        var isWindows = () => navigator.platform.toUpperCase().indexOf('WIN') >= 0


        this.toggleTocMarkmap()
      })

      document.body.appendChild(this.floatingButton)

      const style = document.createElement('style')
      style.innerHTML = `
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
        }
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
        .markmap-toc-content {
          flex-grow: 1;
          overflow: hidden;
        }
        .markmap-svg {
          width: 100%;
          height: 100%;
        }
        .plugin-fence-markmap-svg {
          width: 100%;
          height: 300px;
          background-color: #f8f8f8;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
        }
      `
      document.head.appendChild(style)

      this.register(() => {
        this.floatingButton?.remove()
        style.remove()
      })

      logger('悬浮按钮初始化成功')
    } catch (error) {
      logger(`悬浮按钮初始化失败: ${error.message}`, 'error', error)
      throw error
    }
  }

  registerCommands() {
    logger('注册命令')

    try {
      this.registerCommand({
        id: 'toggle-toc-markmap',
        title: '显示/隐藏目录思维导图',
        scope: 'editor',
        hotkey: 'cmd+m',
        callback: () => {
          logger('执行命令: toggle-toc-markmap')
          this.toggleTocMarkmap()
        },
      })

      this.registerCommand({
        id: 'insert-markmap-fence',
        title: '插入 Markmap 代码块',
        scope: 'editor',
        callback: () => {
          logger('执行命令: insert-markmap-fence')
          this.insertMarkmapFence()
        },
      })

      logger('命令注册成功')
    } catch (error) {
      logger(`命令注册失败: ${error.message}`, 'error', error)
    }
  }

  registerCodeblockProcessor() {
    logger('注册代码块处理器')

    try {
      this.register(
        this.app.features.markdownEditor.postProcessor.register(
          CodeblockPostProcessor.from({
            lang: ['markmap', 'markdown markmap'],
            preview: async (code, pre) => {
              logger('渲染 markmap 代码块', 'debug', { code, pre })

              const svg = (pre.querySelector('.md-diagram-panel-preview svg')
                ?? html`<svg class="plugin-fence-markmap-svg"></svg>`) as SVGElement

              const cid = pre.getAttribute('cid')!

              try {
                // 解析前置参数
                const options = this.parseFrontMatter(code)
                logger('解析前置参数结果', 'debug', options)

                // 设置 SVG 样式
                if (options.height) {
                  svg.style.height = options.height
                }
                if (options.backgroundColor) {
                  svg.style.backgroundColor = options.backgroundColor
                }

                // 获取纯 markdown 内容（去除前置参数）
                const markdownContent = this.extractMarkdownContent(code)

                // 转换 Markdown 为思维导图数据
                const { root } = this.transformer.transform(markdownContent)
                logger('Markdown 转换结果', 'debug', root)

                // 合并配置项
                const mmOptions = deriveOptions({
                  spacingHorizontal: 80,
                  spacingVertical: 20,
                  fitRatio: 0.95,
                  paddingX: 20,
                  autoFit: true,
                  color: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4'],
                  ...options
                })

                // 渲染思维导图
                setTimeout(() => {
                  try {
                    logger('开始渲染思维导图', 'debug', { cid, options: mmOptions })

                    // 如果已存在实例则销毁
                    if (this.mmOfCid[cid]) {
                      this.mmOfCid[cid].destroy()
                      delete this.mmOfCid[cid]
                    }

                    // 创建新实例
                    logger('创建新的 Markmap 实例')
                    const mm = Markmap.create(svg, mmOptions, root)
                    this.mmOfCid[cid] = mm

                    // 适应视图
                    setTimeout(() => {
                      mm.fit()
                      logger('Markmap 实例创建并适应视图成功')
                    }, 100)
                  } catch (error) {
                    logger(`渲染思维导图错误: ${error.message}`, 'error', error)
                    this.renderErrorToSVG(svg, error.message)
                  }
                }, 100)
              } catch (error) {
                logger(`处理 markmap 代码块错误: ${error.message}`, 'error', error)
              }

              return svg as unknown as HTMLElement
            }
          })
        )
      )

      logger('代码块处理器注册成功')
    } catch (error) {
      logger(`代码块处理器注册失败: ${error.message}`, 'error', error)
    }
  }

  parseFrontMatter(content: string): MarkmapOptions {
    try {
      // 默认配置
      const defaultOptions: MarkmapOptions = {
        zoom: false,
        pan: false,
        height: '300px',
        backgroundColor: '#f8f8f8',
        spacingHorizontal: 80,
        spacingVertical: 20,
        fitRatio: 0.95,
        paddingX: 20,
        autoFit: true
      }

      // 检查是否有 YAML 前置内容
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
      if (!fmMatch) return defaultOptions

      try {
        // 解析 YAML
        const yamlText = fmMatch[1]
        const yamlData = yaml.load(yamlText) as any

        // 提取 markmap 配置
        const markmapConfig = yamlData?.markmap || yamlData

        return {
          ...defaultOptions,
          ...markmapConfig
        }
      } catch (yamlError) {
        logger(`YAML 解析失败，使用简单解析: ${yamlError.message}`, 'warn')

        // 简单解析 YAML（备用方案）
        const yamlText = fmMatch[1]
        const options: Record<string, any> = {}

        yamlText.split('\n').forEach(line => {
          const match = line.match(/^\s*(\w+):\s*(.+)$/)
          if (match) {
            const [, key, value] = match
            // 尝试解析值的类型
            if (value === 'true' || value === 'false') {
              options[key] = value === 'true'
            } else if (!isNaN(Number(value))) {
              options[key] = Number(value)
            } else {
              options[key] = value.replace(/["']/g, '')
            }
          }
        })

        return {
          ...defaultOptions,
          ...options
        }
      }
    } catch (error) {
      logger(`解析前置参数失败: ${error.message}`, 'error', error)
      return {
        zoom: false,
        pan: false,
        height: '300px',
        backgroundColor: '#f8f8f8',
        spacingHorizontal: 80,
        spacingVertical: 20,
        fitRatio: 0.95,
        paddingX: 20,
        autoFit: true
      }
    }
  }

  extractMarkdownContent(content: string): string {
    // 移除 YAML 前置内容，返回纯 markdown
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/)
    if (fmMatch) {
      return content.substring(fmMatch[0].length)
    }
    return content
  }

  renderErrorToSVG(svg: SVGElement, errorMessage: string) {
    svg.innerHTML = ''
    svg.style.backgroundColor = '#ffebee'
    svg.style.border = '1px solid #f44336'

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', '10')
    text.setAttribute('y', '30')
    text.setAttribute('font-size', '12')
    text.setAttribute('fill', '#f44336')
    text.textContent = `渲染错误: ${errorMessage}`
    svg.appendChild(text)
  }

  toggleTocMarkmap() {
    if (this.tocModal) {
      this.hideTocMarkmap()
    } else {
      this.showTocMarkmap()
    }
  }

  showTocMarkmap() {
    logger('显示 TOC Markmap')

    try {
      this.tocModal = document.createElement('div')
      this.tocModal.className = 'markmap-toc-modal'
      this.tocModal.innerHTML = `
        <div class="markmap-toc-header">
          <span class="markmap-toc-title">目录思维导图</span>
          <div class="markmap-toc-buttons">
            <button class="markmap-toc-btn" data-action="refresh" title="刷新">🔄</button>
            <button class="markmap-toc-btn" data-action="fit" title="适应视图">🎯</button>
            <button class="markmap-toc-btn" data-action="close" title="关闭">×</button>
          </div>
        </div>
        <div class="markmap-toc-content">
          <svg class="markmap-svg"></svg>
        </div>
      `

      document.body.appendChild(this.tocModal)

      // 绑定按钮事件
      this.tocModal.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        const action = target.getAttribute('data-action')

        switch (action) {
          case 'close':
            this.hideTocMarkmap()
            break
          case 'refresh':
            logger('刷新 TOC')
            this.updateTocMarkmap()
            break
          case 'fit':
            logger('适应视图')
            if (this.tocMarkmap) {
              this.tocMarkmap.fit()
            }
            break
        }
      })

      // 初始化 TOC 内容
      this.updateTocMarkmap()
      
      // 初始化事件监听器
      this.initTocEventListeners()
      
      logger('TOC 窗口显示成功')
    } catch (error) {
      logger(`TOC 窗口显示失败: ${error.message}`, 'error', error)
    }
  }

  updateTocMarkmap() {
    if (!this.tocModal) return

    try {
      logger('更新 TOC Markmap')

      const svg = this.tocModal.querySelector('.markmap-svg') as SVGElement
      if (!svg) return

      // 获取文档标题
      const headings = this.getDocumentHeadings()
      logger('文档标题:', 'debug', headings)

      if (headings.length === 0) {
        this.renderEmptyTOC(svg)
        return
      }

      // 构建 markdown 内容
      const markdownContent = this.buildTocMarkdown(headings)
      logger('TOC Markdown 内容:', 'debug', markdownContent)

      // 转换为 markmap 数据格式
      const { root } = this.transformer.transform(markdownContent)
      logger('Markmap 数据:', 'warn', root)

      // 渲染到 SVG
      const options = deriveOptions({
        spacingHorizontal: 80,
        spacingVertical: 20,
        fitRatio: 0.95,
        paddingX: 20,
        autoFit: true,
        color: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4'],
        colorFreezeLevel: 2,
        initialExpandLevel: 3
      })

      // 销毁旧实例
      if (this.tocMarkmap) {
        this.tocMarkmap.destroy()
      }

      // 创建新实例
      this.tocMarkmap = Markmap.create(svg, options, root)
      logger('TOC Markmap 创建成功')

      // 适应视图
      setTimeout(() => {
        this.tocMarkmap.fit()
      }, 100)
    } catch (error) {
      logger(`TOC Markmap 渲染错误: ${error.message}`, 'error', error)
      this.renderErrorToSVG(svg, error.message)
    }
  }

  buildTocMarkdown(headings: Array<{level: number, text: string, id: string}>): string {
    // 构建层级化的 markdown 内容
    let markdown = ''

    for (const heading of headings) {
      const indent = '#'.repeat(heading.level)
      markdown += `${indent} ${heading.text}\n`
    }

    return markdown
  }

  getDocumentHeadings() {
    const headings: Array<{level: number, text: string, id: string}> = []
    const write = document.querySelector('#write')
    if (!write) return []

    const hs = write.querySelectorAll('h1, h2, h3, h4, h5, h6')
    hs.forEach((h: Element) => {
      const level = parseInt(h.tagName.substring(1))
      const text = (h as HTMLElement).innerText.trim()
      const id = h.id || `heading-${headings.length}`

      if (text) {
        headings.push({ level, text, id })
      }
    })

    return headings
  }

  // 根据思维导图节点获取标题路径
  getNodeTitlePath(nodeEl: Element): { path: string[], index: number } {
    const path = nodeEl.getAttribute('data-path');
    logger('节点路径:', 'warn', path)
    if (!path) return { path: [], index: -1 };

    const pathParts = path.split('.');
    if (pathParts.length <= 1) return { path: [], index: -1 };

    const headingIndex = parseInt(pathParts[pathParts.length - 1]) - 1;
    const headings = this.getDocumentHeadings();

    if (headingIndex < 0 || headingIndex >= headings.length) {
      return { path: [], index: -1 };
    }

    const pathToNode: string[] = [];
    let currentLevel = 1;

    // 构建标题路径
    for (let i = 0; i <= headingIndex; i++) {
      if (headings[i].level >= currentLevel) {
        pathToNode.push(headings[i].text);
        currentLevel = headings[i].level + 1;
      }
    }

    return { path: pathToNode, index: headingIndex };
  }

  // 根据给定的节点元素滚动到对应的标题位置
  scrollToHeadingByNode(nodeEl: Element) {
    const { path, index } = this.getNodeTitlePath(nodeEl);

    if (path.length > 0 && index >= 0) {
      logger(`点击的节点标题路径: ${path.join(' > ')}`);

      // 获取文档中的所有标题信息
      const headings = this.getDocumentHeadings();
      if (index < headings.length) {
        const heading = headings[index];
        // 查找对应的标题元素
        const allHeadings = document.querySelectorAll(`h${heading.level}`);
        for (const el of allHeadings) {
          // 精确匹配文本内容和层级
          if (el.tagName === `H${heading.level}` && el.textContent === heading.text) {
            logger(`通过层级和文本内容找到标题: H${heading.level} ${el.textContent}`);
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            logger(`滚动到标题: ${heading.text}`);
            return;
          }
        }

        logger(`未找到匹配的标题元素: ${heading.text}`, 'error');
      }
    }
  }

  initTocEventListeners() {
    if (!this.tocModal) return;

    const svg = this.tocModal.querySelector('.markmap-svg') as SVGElement;
    if (!svg) return;

    // 绑定节点点击事件
    svg.addEventListener('click', (e) => {
      const target = e.target as Element;
      const nodeEl = target.closest('.markmap-node');

      if (nodeEl && nodeEl.getAttribute('data-path')) {
        // 调用独立的滚动函数
        this.scrollToHeadingByNode(nodeEl);
      }
    });
  }

  renderEmptyTOC(svg: SVGElement) {
    svg.innerHTML = ''
    svg.style.backgroundColor = '#f8f9fa'

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('transform', 'translate(50, 50)')

    // 图标
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    icon.setAttribute('x', '150')
    icon.setAttribute('y', '100')
    icon.setAttribute('text-anchor', 'middle')
    icon.setAttribute('font-size', '48')
    icon.textContent = '📄'

    // 提示文本
    const text1 = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text1.setAttribute('x', '150')
    text1.setAttribute('y', '140')
    text1.setAttribute('text-anchor', 'middle')
    text1.setAttribute('font-size', '14')
    text1.setAttribute('fill', '#666')
    text1.textContent = '当前文档没有标题'

    const text2 = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text2.setAttribute('x', '150')
    text2.setAttribute('y', '160')
    text2.setAttribute('text-anchor', 'middle')
    text2.setAttribute('font-size', '12')
    text2.setAttribute('fill', '#999')
    text2.textContent = '请添加一些标题来生成思维导图'

    g.appendChild(icon)
    g.appendChild(text1)
    g.appendChild(text2)
    svg.appendChild(g)
  }

  renderErrorToSVG(svg: SVGElement, errorMessage: string) {
    svg.innerHTML = ''
    svg.style.backgroundColor = '#ffebee'
    svg.style.border = '1px solid #f44336'

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', '10')
    text.setAttribute('y', '30')
    text.setAttribute('font-size', '12')
    text.setAttribute('fill', '#f44336')
    text.textContent = `渲染错误: ${errorMessage}`
    svg.appendChild(text)
  }

  hideTocMarkmap() {
    if (this.tocModal) {
      this.tocModal.remove()
      this.tocModal = undefined

      // 销毁 markmap 实例
      if (this.tocMarkmap) {
        this.tocMarkmap.destroy()
        this.tocMarkmap = undefined
      }

      logger('TOC 窗口已关闭')
    }
  }

  insertMarkmapFence() {
    const template = `\`\`\`\`markmap
---
markmap:
  zoom: false
  pan: false
  height: 300px
  backgroundColor: "#f8f8f8"
  spacingHorizontal: 80
  spacingVertical: 20
  fitRatio: 0.95
  paddingX: 20
  autoFit: true
---

# 中心主题
## 子主题 1
- 要点 1
- 要点 2
## 子主题 2
- 要点 1
  - 详细内容
- 要点 2
\`\`\`\``

    // 插入到编辑器
    try {
      logger('插入 Markmap 代码块模板')

      // 使用 typora 原生 API
      const { editor } = require('typora')
      if (editor) {
        const selection = editor.selection
        if (selection) {
          selection.insertText(template)
          logger('代码块模板已插入')
        }
      }
    } catch (error) {
      logger(`插入代码块失败: ${error.message}`, 'error', error)
    }
  }

  onunload() {
    logger('插件卸载')

    // 清理资源
    this.hideTocMarkmap()

    // 清理代码块实例
    Object.values(this.mmOfCid).forEach(mm => {
      if (mm && typeof mm.destroy === 'function') {
        mm.destroy()
      }
    })
    this.mmOfCid = {}

    logger('Markmap 插件已卸载')
  }
}
