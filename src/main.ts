import { Plugin, CodeblockPostProcessor, html } from '@typora-community-plugin/core'

interface TreeNode {
  content: string
  children: TreeNode[]
  depth: number
}

export default class extends Plugin {
  floatingButton?: HTMLElement
  tocModal?: HTMLElement
  mmOfCid: Record<string, any> = {}

  onload() {
    this.showLoadStatus('🎯 开始加载 Markmap 插件', 'info')

    try {
      // 检查插件 API 可用性
      this.checkPluginAPI()

      // 初始化核心功能
      this.initCoreFeatures()

      this.showLoadStatus('🎉 Markmap 插件加载完成！', 'success')

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.showLoadStatus(`❌ 插件初始化失败: ${errorMsg}`, 'error')

      // 降级模式
      try {
        this.initBasicFeatures()
        this.showLoadStatus('⚠️ 降级模式：基础功能已启用', 'success')
      } catch (fallbackError) {
        this.showLoadStatus(`❌ 降级模式也失败了: ${fallbackError.message}`, 'error')
      }
    }
  }

  checkPluginAPI() {
    this.showLoadStatus('🔍 检查插件 API...', 'info')

    if (!this.app) {
      throw new Error('this.app 未定义')
    }

    this.showLoadStatus(`📋 app 对象存在: ${typeof this.app}`, 'info')

    // 检查新的 API 结构
    if (this.app.features) {
      this.showLoadStatus('✅ app.features 可用', 'success')

      if (this.app.features.markdownEditor) {
        this.showLoadStatus('✅ markdownEditor 可用', 'success')

        if (this.app.features.markdownEditor.postProcessor) {
          this.showLoadStatus('✅ postProcessor 可用', 'success')

          if (this.app.features.markdownEditor.postProcessor.register()) {
            this.showLoadStatus('✅ postProcessor.register 方法可用', 'success')
          } else {
            this.showLoadStatus('⚠️ postProcessor.register 方法不可用', 'error')
          }
        } else {
          this.showLoadStatus('⚠️ postProcessor 不可用', 'error')
        }
      } else {
        this.showLoadStatus('⚠️ markdownEditor 不可用', 'error')
      }
    } else {
      this.showLoadStatus('⚠️ app.features 不可用', 'error')

      // 检查旧的 API
      if (this.app.postProcessors) {
        this.showLoadStatus('✅ 旧版 postProcessors API 可用', 'success')
      } else {
        this.showLoadStatus('⚠️ 旧版 postProcessors API 也不可用', 'error')
      }
    }

    if (this.registerCommand) {
      this.showLoadStatus('✅ registerCommand API 可用', 'success')
    } else {
      this.showLoadStatus('⚠️ registerCommand API 不可用', 'error')
    }
  }

  initCoreFeatures() {
    this.showLoadStatus('🚀 初始化核心功能...', 'info')

    // 1. 创建悬浮按钮
    this.initFloatingButton()

    // 2. 注册命令
    this.tryRegisterCommands()

    // 3. 注册代码块处理器
    this.tryRegisterCodeblockProcessor()

    this.showLoadStatus('✅ 核心功能初始化完成', 'success')
  }

  initBasicFeatures() {
    this.showLoadStatus('🔧 初始化基础功能...', 'info')

    // 只创建悬浮按钮
    this.initFloatingButton()

    this.showLoadStatus('✅ 基础功能初始化完成', 'success')
  }

  tryRegisterCommands() {
    try {
      if (this.registerCommand && typeof this.registerCommand === 'function') {
        this.registerCommand({
          id: 'toggle-toc-markmap',
          title: 'Toggle TOC Markmap',
          scope: 'editor',
          hotkey: 'cmd+m',
          callback: () => {
            this.toggleTocMarkmap()
          },
        })
        this.showLoadStatus('✅ 命令注册成功', 'success')
      } else {
        this.showLoadStatus('⚠️ 跳过命令注册（API 不可用）', 'info')
      }
    } catch (error) {
      this.showLoadStatus(`⚠️ 命令注册失败: ${error.message}`, 'error')
    }
  }

  tryRegisterCodeblockProcessor() {
    try {
      // 尝试新的 API
      if (this.app?.features?.markdownEditor?.postProcessor?.register) {
        this.showLoadStatus('📝 使用新版 API 注册代码块处理器...', 'info')

        this.register(
          this.app.features.markdownEditor.postProcessor.register(
            CodeblockPostProcessor.from({
              lang: ['markmap', 'markdown markmap'],
              preview: async (code, pre) => {
                this.showLoadStatus('🎨 渲染 markmap 代码块', 'info')

                const svg = (pre.querySelector('.md-diagram-panel-preview svg')
                  ?? html`<svg style="width: 100%; height: 300px;"></svg>`) as any as SVGElement

                setTimeout(() => {
                  try {
                    const cid = pre.getAttribute('cid')!

                    // 解析 markdown 内容
                    const tree = this.parseMarkdownToTree(code)

                    // 渲染到 SVG
                    this.renderTreeToSVG(svg, tree)

                    // 存储实例
                    this.mmOfCid[cid] = { svg, tree }

                    this.showLoadStatus('✅ 代码块渲染成功', 'success')
                  } catch (error) {
                    this.showLoadStatus(`❌ 渲染失败: ${error.message}`, 'error')
                    this.renderErrorToSVG(svg, error.message)
                  }
                }, 0)

                return svg as any
              }
            })
          )
        )

        this.showLoadStatus('✅ 新版 API 代码块处理器注册成功', 'success')
        return
      }

      // 尝试旧的 API
      if (this.app?.postProcessors?.register) {
        this.showLoadStatus('📝 使用旧版 API 注册代码块处理器...', 'info')

        this.app.postProcessors.register(
          CodeblockPostProcessor.from({
            lang: ['markmap', 'markdown markmap'],
            preview: async (code, pre) => {
              this.showLoadStatus('🎨 渲染 markmap 代码块', 'info')

              const svg = (pre.querySelector('.md-diagram-panel-preview svg')
                ?? html`<svg style="width: 100%; height: 300px;"></svg>`) as any as SVGElement

              setTimeout(() => {
                try {
                  const cid = pre.getAttribute('cid')!

                  // 解析 markdown 内容
                  const tree = this.parseMarkdownToTree(code)

                  // 渲染到 SVG
                  this.renderTreeToSVG(svg, tree)

                  // 存储实例
                  this.mmOfCid[cid] = { svg, tree }

                  this.showLoadStatus('✅ 代码块渲染成功', 'success')
                } catch (error) {
                  this.showLoadStatus(`❌ 渲染失败: ${error.message}`, 'error')
                  this.renderErrorToSVG(svg, error.message)
                }
              }, 0)

              return svg as any
            }
          })
        )

        this.showLoadStatus('✅ 旧版 API 代码块处理器注册成功', 'success')
        return
      }

      // 如果都不可用
      this.showLoadStatus('⚠️ 跳过代码块处理器（API 不可用）', 'info')

    } catch (error) {
      this.showLoadStatus(`⚠️ 代码块处理器注册失败: ${error.message}`, 'error')
    }
  }

  initFloatingButton() {
    try {
      this.floatingButton = document.createElement('div')
      this.floatingButton.className = 'markmap-floating-button'
      this.floatingButton.title = 'Toggle TOC Markmap (Cmd+M)'
      this.floatingButton.innerHTML = `<span style="font-size: 20px;">🗺️</span>`

      this.floatingButton.addEventListener('click', () => {
        this.showLoadStatus('🖱️ 悬浮按钮被点击', 'info')
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
      `
      document.head.appendChild(style)

      this.register(() => {
        this.floatingButton?.remove()
        style.remove()
      })

      this.showLoadStatus('✅ 悬浮按钮创建成功', 'success')

    } catch (error) {
      this.showLoadStatus(`❌ 悬浮按钮创建失败: ${error.message}`, 'error')
      throw error
    }
  }

  toggleTocMarkmap() {
    if (this.tocModal) {
      this.hideTocMarkmap()
    } else {
      this.showTocMarkmap()
    }
  }

  parseMarkdownToTree(markdown: string): TreeNode {
    const lines = markdown.split('\n').filter(line => line.trim())
    const root: TreeNode = { content: 'Root', children: [], depth: 0 }
    const stack: TreeNode[] = [root]

    for (const line of lines) {
      // 解析标题
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
      if (headingMatch) {
        const [, hashes, content] = headingMatch
        const depth = hashes.length

        const node: TreeNode = {
          content: content.trim(),
          children: [],
          depth
        }

        // 找到正确的父节点
        while (stack.length > depth) {
          stack.pop()
        }

        const parent = stack[stack.length - 1]
        parent.children.push(node)
        stack.push(node)
        continue
      }

      // 解析列表项
      const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/)
      if (listMatch) {
        const [, indent, , content] = listMatch
        const depth = Math.floor(indent.length / 2) + 1

        const node: TreeNode = {
          content: content.trim(),
          children: [],
          depth
        }

        // 找到正确的父节点
        while (stack.length > depth) {
          stack.pop()
        }

        const parent = stack[stack.length - 1]
        parent.children.push(node)
        stack.push(node)
      }
    }

    return root
  }

  renderTreeToSVG(svg: SVGElement, tree: TreeNode) {
    // 清空 SVG
    svg.innerHTML = ''

    // 设置 SVG 属性
    svg.setAttribute('viewBox', '0 0 800 600')
    svg.style.width = '100%'
    svg.style.height = '300px'
    svg.style.backgroundColor = '#fafafa'
    svg.style.border = '1px solid #e0e0e0'
    svg.style.borderRadius = '4px'

    // 创建样式
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = `
      .markmap-node { cursor: pointer; }
      .markmap-node:hover .markmap-circle { fill-opacity: 0.8; }
      .markmap-text { font-family: system-ui, -apple-system, sans-serif; }
      .markmap-link { stroke: #999; stroke-width: 1.5; fill: none; }
    `
    svg.appendChild(style)

    // 创建主容器
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('transform', 'translate(50, 50)')
    svg.appendChild(g)

    // 渲染树
    if (tree.children.length > 0) {
      this.renderNodes(g, tree.children, 0, 0, 0)
    } else {
      // 如果没有子节点，显示提示
      this.renderEmptyState(g)
    }
  }

  renderNodes(parent: SVGElement, nodes: TreeNode[], startX: number, startY: number, level: number) {
    const colors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4']
    const nodeHeight = 40
    const levelWidth = 200

    nodes.forEach((node, index) => {
      const x = startX + level * levelWidth
      const y = startY + index * nodeHeight * (1 + node.children.length * 0.3)

      // 创建节点组
      const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      nodeGroup.setAttribute('class', 'markmap-node')
      nodeGroup.setAttribute('transform', `translate(${x}, ${y})`)

      // 创建圆圈
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      circle.setAttribute('class', 'markmap-circle')
      circle.setAttribute('r', '8')
      circle.setAttribute('fill', colors[level % colors.length])
      circle.setAttribute('stroke', '#fff')
      circle.setAttribute('stroke-width', '2')

      // 创建文本
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      text.setAttribute('class', 'markmap-text')
      text.setAttribute('x', '15')
      text.setAttribute('y', '5')
      text.setAttribute('font-size', '12')
      text.setAttribute('fill', '#333')
      text.textContent = node.content.length > 30 ? node.content.substring(0, 30) + '...' : node.content

      nodeGroup.appendChild(circle)
      nodeGroup.appendChild(text)
      parent.appendChild(nodeGroup)

      // 渲染子节点
      if (node.children.length > 0) {
        // 连接线
        const childStartY = y + 30
        node.children.forEach((child, childIndex) => {
          const childY = childStartY + childIndex * nodeHeight * 0.8
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          line.setAttribute('class', 'markmap-link')
          line.setAttribute('d', `M ${x + 8} ${y} Q ${x + levelWidth/2} ${y} ${x + levelWidth - 8} ${childY}`)
          parent.appendChild(line)
        })

        this.renderNodes(parent, node.children, startX, childStartY, level + 1)
      }
    })
  }

  renderEmptyState(parent: SVGElement) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', '200')
    text.setAttribute('y', '150')
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('font-size', '14')
    text.setAttribute('fill', '#666')
    text.textContent = '请添加标题或列表项来生成思维导图'
    parent.appendChild(text)
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

  showTocMarkmap() {
    this.showLoadStatus('📋 显示 TOC Markmap', 'info')

    try {
      this.tocModal = document.createElement('div')
      this.tocModal.innerHTML = `
        <div style="padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; background: #f8f9fa;">
          <span style="font-weight: bold; color: #333;">TOC Markmap</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="toc-btn" data-action="refresh" title="刷新" style="background: none; border: none; cursor: pointer; padding: 4px; border-radius: 3px;">🔄</button>
            <button class="toc-btn" data-action="fit" title="适应视图" style="background: none; border: none; cursor: pointer; padding: 4px; border-radius: 3px;">🎯</button>
            <button class="toc-btn" data-action="close" title="关闭" style="background: none; border: none; cursor: pointer; padding: 4px; border-radius: 3px; font-size: 16px;">×</button>
          </div>
        </div>
        <div style="flex-grow: 1; overflow: hidden;">
          <svg class="toc-svg" style="width: 100%; height: 100%;"></svg>
        </div>
      `

      Object.assign(this.tocModal.style, {
        position: 'fixed',
        top: '50px',
        right: '20px',
        width: '450px',
        height: '500px',
        backgroundColor: '#ffffff',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        zIndex: '9999',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        resize: 'both',
        overflow: 'hidden'
      })

      this.tocModal.className = 'markmap-toc-modal'
      document.body.appendChild(this.tocModal)

      // 绑定事件
      this.tocModal.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        const action = target.getAttribute('data-action')

        switch (action) {
          case 'close':
            this.hideTocMarkmap()
            break
          case 'refresh':
            this.showLoadStatus('🔄 刷新 TOC', 'info')
            this.updateTocMarkmap()
            break
          case 'fit':
            this.showLoadStatus('🎯 适应视图', 'info')
            this.updateTocMarkmap()
            break
        }
      })

      // 按钮悬停效果
      this.tocModal.addEventListener('mouseover', (e) => {
        const target = e.target as HTMLElement
        if (target.classList.contains('toc-btn')) {
          target.style.backgroundColor = '#e9ecef'
        }
      })

      this.tocModal.addEventListener('mouseout', (e) => {
        const target = e.target as HTMLElement
        if (target.classList.contains('toc-btn')) {
          target.style.backgroundColor = 'transparent'
        }
      })

      // 初始化 TOC 内容
      this.updateTocMarkmap()

      this.showLoadStatus('✅ TOC 窗口显示成功', 'success')

    } catch (error) {
      this.showLoadStatus(`❌ TOC 窗口显示失败: ${error.message}`, 'error')
    }
  }

  updateTocMarkmap() {
    if (!this.tocModal) return

    try {
      const svg = this.tocModal.querySelector('.toc-svg') as SVGElement
      if (!svg) return

      // 获取文档标题
      const headings = this.getDocumentHeadings()

      if (headings.length === 0) {
        this.renderEmptyTOC(svg)
      } else {
        // 转换为树结构
        const tree = this.buildHeadingTree(headings)

        // 渲染到 SVG
        this.renderTreeToSVG(svg, tree)
      }

      this.showLoadStatus('✅ TOC 更新成功', 'success')

    } catch (error) {
      this.showLoadStatus(`❌ TOC 更新失败: ${error.message}`, 'error')
    }
  }

  getDocumentHeadings() {
    const headings: Array<{level: number, text: string}> = []
    const write = document.querySelector('#write')
    if (!write) return []

    const hs = write.querySelectorAll('h1, h2, h3, h4, h5, h6')
    hs.forEach((h: Element) => {
      const level = parseInt(h.tagName.substring(1))
      const text = (h as HTMLElement).innerText.trim()
      if (text) {
        headings.push({ level, text })
      }
    })

    return headings
  }

  buildHeadingTree(headings: Array<{level: number, text: string}>): TreeNode {
    const root: TreeNode = { content: '文档目录', children: [], depth: 0 }
    const stack: TreeNode[] = [root]

    for (const heading of headings) {
      const node: TreeNode = {
        content: heading.text,
        children: [],
        depth: heading.level
      }

      // 找到正确的父节点
      while (stack.length > heading.level) {
        stack.pop()
      }

      const parent = stack[stack.length - 1]
      parent.children.push(node)
      stack.push(node)
    }

    return root
  }

  renderEmptyTOC(svg: SVGElement) {
    svg.innerHTML = ''
    svg.style.backgroundColor = '#f8f9fa'
    svg.style.border = '1px dashed #dee2e6'

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

  hideTocMarkmap() {
    if (this.tocModal) {
      this.tocModal.remove()
      this.tocModal = undefined
      this.showLoadStatus('✅ TOC 窗口已关闭', 'info')
    }
  }

  showLoadStatus(message: string, type: 'info' | 'success' | 'error' = 'info') {
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

  onunload() {
    this.showLoadStatus('🔄 插件卸载', 'info')
    this.hideTocMarkmap()
    Object.values(this.mmOfCid).forEach(v => v.destroy?.())
    this.mmOfCid = {}
    document.querySelectorAll('[data-status-message]').forEach(el => el.remove())
  }
}
