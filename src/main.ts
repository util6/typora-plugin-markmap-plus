import { Plugin, CodeblockPostProcessor, html } from '@typora-community-plugin/core'
import { Transformer, builtInPlugins } from 'markmap-lib'
import { Markmap, loadCSS, loadJS, deriveOptions } from 'markmap-view'
import * as yaml from 'js-yaml'

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

// 显示状态消息的工具函数
function showStatus(message: string, type: 'info' | 'success' | 'error' = 'info') {
  const statusDiv = document.createElement('div')

  const colors = {
    info: '#2196F3',
    success: '#4CAF50',
    error: '#f44336'
  }

  const existingMessages = document.querySelectorAll('[data-status-message]')
  const topOffset = 10 + (existingMessages.length * 45)

  statusDiv.style.cssText = `
    position: fixed;
    top: ${topOffset}px;
    right: 10px;
    background: ${colors[type]};
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    z-index: 10000;
    font-size: 11px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    max-width: 350px;
    word-wrap: break-word;
    font-family: monospace;
    line-height: 1.3;
  `
  statusDiv.setAttribute('data-status-message', 'true')
  statusDiv.textContent = message
  document.body.appendChild(statusDiv)

  const timeout = type === 'error' ? 8000 : (type === 'success' ? 4000 : 3000)
  setTimeout(() => {
    if (statusDiv.parentNode) {
      statusDiv.remove()
    }
  }, timeout)
}

// 调试工具函数
function debug(message: string, data?: any) {
  if (data) {
    console.log(`[MARKMAP DEBUG] ${message}`, data)
  } else {
    console.log(`[MARKMAP DEBUG] ${message}`)
  }
  
  // 在页面上显示调试信息
  showStatus(`DEBUG: ${message}${data ? ' (check console)' : ''}`, 'info')
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
    debug('插件开始加载')
    
    try {
      // 初始化 markmap transformer
      this.transformer = new Transformer(builtInPlugins)
      
      // 初始化资源
      this.initResources()
        .then(() => {
          debug('资源初始化成功')
          
          // 创建悬浮按钮
          this.initFloatingButton()
          
          // 注册命令
          this.registerCommands()
          
          // 注册代码块处理器
          this.registerCodeblockProcessor()
          
          debug('插件加载完成')
        })
        .catch(error => {
          debug(`资源初始化失败: ${error.message}`, error)
        })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      debug(`插件初始化失败: ${errorMsg}`, error)
    }
  }

  async initResources() {
    debug('开始初始化资源')
    
    try {
      // 获取 markmap 所需的资源
      const { styles, scripts } = this.transformer.getAssets()
      
      debug('加载 CSS 资源', styles)
      await loadCSS(styles)
      
      debug('加载 JS 资源', scripts)
      await loadJS(scripts, { getMarkmap: () => ({ Markmap, loadCSS, loadJS, deriveOptions }) })
      
      debug('Markmap 资源加载成功')
      
      return true
    } catch (error) {
      debug(`加载 Markmap 资源失败: ${error.message}`, error)
      throw error
    }
  }

  initFloatingButton() {
    debug('初始化悬浮按钮')
    
    try {
      this.floatingButton = document.createElement('div')
      this.floatingButton.className = 'markmap-floating-button'
      this.floatingButton.title = '显示目录思维导图 (Cmd+M)'
      this.floatingButton.innerHTML = `<span style="font-size: 20px;">🗺️</span>`

      this.floatingButton.addEventListener('click', () => {
        debug('悬浮按钮被点击')
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
      
      debug('悬浮按钮初始化成功')
    } catch (error) {
      debug(`悬浮按钮初始化失败: ${error.message}`, error)
      throw error
    }
  }

  registerCommands() {
    debug('注册命令')
    
    try {
      this.registerCommand({
        id: 'toggle-toc-markmap',
        title: '显示/隐藏目录思维导图',
        scope: 'editor',
        hotkey: 'cmd+m',
        callback: () => {
          debug('执行命令: toggle-toc-markmap')
          this.toggleTocMarkmap()
        },
      })
      
      this.registerCommand({
        id: 'insert-markmap-fence',
        title: '插入 Markmap 代码块',
        scope: 'editor',
        callback: () => {
          debug('执行命令: insert-markmap-fence')
          this.insertMarkmapFence()
        },
      })
      
      debug('命令注册成功')
    } catch (error) {
      debug(`命令注册失败: ${error.message}`, error)
    }
  }

  registerCodeblockProcessor() {
    debug('注册代码块处理器')
    
    try {
      this.register(
        this.app.features.markdownEditor.postProcessor.register(
          CodeblockPostProcessor.from({
            lang: ['markmap', 'markdown markmap'],
            preview: async (code, pre) => {
              debug('渲染 markmap 代码块', { code, pre })
              
              const svg = (pre.querySelector('.md-diagram-panel-preview svg')
                ?? html`<svg class="plugin-fence-markmap-svg"></svg>`) as SVGElement
  
              const cid = pre.getAttribute('cid')!
              
              try {
                // 解析前置参数
                const options = this.parseFrontMatter(code)
                debug('解析前置参数结果', options)
                
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
                debug('Markdown 转换结果', root)
                
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
                    debug('开始渲染思维导图', { cid, options: mmOptions })
                    
                    // 如果已存在实例则销毁
                    if (this.mmOfCid[cid]) {
                      this.mmOfCid[cid].destroy()
                      delete this.mmOfCid[cid]
                    }
                    
                    // 创建新实例
                    debug('创建新的 Markmap 实例')
                    const mm = Markmap.create(svg, mmOptions, root)
                    this.mmOfCid[cid] = mm
                    
                    // 适应视图
                    setTimeout(() => {
                      mm.fit()
                      debug('Markmap 实例创建并适应视图成功')
                    }, 100)
                  } catch (error) {
                    debug(`渲染思维导图错误: ${error.message}`, error)
                    this.renderErrorToSVG(svg, error.message)
                  }
                }, 100)
              } catch (error) {
                debug(`处理 markmap 代码块错误: ${error.message}`, error)
                this.renderErrorToSVG(svg, error.message)
              }
  
              return svg as unknown as HTMLElement
            }
          })
        )
      )
      
      debug('代码块处理器注册成功')
    } catch (error) {
      debug(`代码块处理器注册失败: ${error.message}`, error)
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
        debug(`YAML 解析失败，使用简单解析: ${yamlError.message}`)
        
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
              options[key] = value.replace(/['"]/g, '')
            }
          }
        })
        
        return {
          ...defaultOptions,
          ...options
        }
      }
    } catch (error) {
      debug(`解析前置参数失败: ${error.message}`, error)
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
    debug('显示 TOC Markmap')
    
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
            debug('刷新 TOC')
            this.updateTocMarkmap()
            break
          case 'fit':
            debug('适应视图')
            if (this.tocMarkmap) {
              this.tocMarkmap.fit()
            }
            break
        }
      })
      
      // 初始化 TOC 内容
      this.updateTocMarkmap()
      
      debug('TOC 窗口显示成功')
    } catch (error) {
      debug(`TOC 窗口显示失败: ${error.message}`, error)
    }
  }
  
  updateTocMarkmap() {
    if (!this.tocModal) return
    
    try {
      debug('更新 TOC Markmap')
      
      const svg = this.tocModal.querySelector('.markmap-svg') as SVGElement
      if (!svg) return
      
      // 获取文档标题
      const headings = this.getDocumentHeadings()
      debug('文档标题:', headings)
      
      if (headings.length === 0) {
        this.renderEmptyTOC(svg)
        return
      }
      
      // 构建 markdown 内容
      const markdownContent = this.buildTocMarkdown(headings)
      debug('TOC Markdown 内容:', markdownContent)
      
      // 转换为 markmap 数据格式
      const { root } = this.transformer.transform(markdownContent)
      debug('Markmap 数据:', root)
      
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
      debug('TOC Markmap 创建成功')
      
      // 适应视图
      setTimeout(() => {
        this.tocMarkmap.fit()
      }, 100)
      
      // 点击节点时滚动到对应标题
      svg.addEventListener('click', (e) => {
        const target = e.target as Element
        const nodeEl = target.closest('.markmap-node')
        
        if (nodeEl && nodeEl.getAttribute('data-path')) {
          const path = nodeEl.getAttribute('data-path')
          const pathParts = path ? path.split('.') : []
          
          // 根据路径找到对应的标题
          if (pathParts.length > 1) {
            const headingIndex = parseInt(pathParts[pathParts.length - 1]) - 1
            if (headings[headingIndex]) {
              const heading = headings[headingIndex]
              const headingEl = document.querySelector(`h${heading.level}[id="${heading.id}"]`) ||
                               document.querySelector(`h${heading.level}:contains("${heading.text}")`)
              
              if (headingEl) {
                headingEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
                debug(`滚动到标题: ${heading.text}`)
              }
            }
          }
        }
      })
    } catch (error) {
      debug(`TOC Markmap 渲染错误: ${error.message}`, error)
      this.renderErrorToSVG(svg, error.message)
    }
  }
  
  buildTocMarkdown(headings: Array<{level: number, text: string, id: string}>): string {
    // 构建层级化的 markdown 内容
    let markdown = '# 文档目录\n\n'
    
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
      
      debug('TOC 窗口已关闭')
    }
  }
  
  insertMarkmapFence() {
    const template = `\`\`\`markmap
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
\`\`\``
    
    // 插入到编辑器
    try {
      debug('插入 Markmap 代码块模板')
      
      // 使用 typora 原生 API
      const { editor } = require('typora')
      if (editor) {
        const selection = editor.selection
        if (selection) {
          selection.insertText(template)
          debug('代码块模板已插入')
        }
      }
    } catch (error) {
      debug(`插入代码块失败: ${error.message}`, error)
    }
  }

  onunload() {
    debug('插件卸载')
    
    // 清理资源
    this.hideTocMarkmap()
    
    // 清理代码块实例
    Object.values(this.mmOfCid).forEach(mm => {
      if (mm && typeof mm.destroy === 'function') {
        mm.destroy()
      }
    })
    this.mmOfCid = {}
    
    debug('Markmap 插件已卸载')
  }
}
