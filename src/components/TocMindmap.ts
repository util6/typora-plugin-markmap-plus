/**
 * Typora Markmap Plus 插件 - TOC 思维导图组件
 * 
 * 功能说明：
 * - 为当前文档的标题生成交互式思维导图
 * - 支持窗口拖动和调整大小（基于 InteractJS）
 * - 支持嵌入侧边栏模式
 * - 提供实时更新和节点点击跳转功能
 * 
 * @author util6
 * @version 1.0.3
 */

// ==================== 依赖导入 ====================
import * as yaml from 'js-yaml'
import { Transformer, type ITransformPlugin, builtInPlugins } from 'markmap-lib';
import { Markmap, deriveOptions } from 'markmap-view';
import { zoomIdentity, zoomTransform } from 'd3-zoom';
import { editor } from 'typora'
import { MarkmapSettings } from '../settings';
import { logger, debounce } from '../utils';
import interact from 'interactjs';

// ==================== MARKMAP 渲染器集成 ====================

/**
 * 图片路径解析插件
 * 将 Markdown 中的相对路径图片转换为 Typora 可识别的绝对路径
 */
const resolveImagePath: ITransformPlugin = {
  name: 'resolveImagePath',
  transform(ctx) {
    ctx.parser.tap((md: any) => {
      const defaultRender = function (tokens: any, idx: number, options: any, env: any, self: any) {
        return self.renderToken(tokens, idx, options)
      }

      const defaultImageRender = md.renderer.rules.image || defaultRender

      md.renderer.rules.image = (tokens: any[], idx: number, options: any, env: any, self: any): string => {
        const token = tokens[idx]

        const src = token.attrGet('src')
        if (src) {
          token.attrSet('src', editor.imgEdit.getRealSrc(src))
        }

        return defaultImageRender(tokens, idx, options, env, self)
      }

      const defaultHtmlInlineRender = md.renderer.rules.html_inline || defaultRender

      md.renderer.rules.html_inline = (tokens: any[], idx: number, options: any, env: any, self: any): string => {
        const token = tokens[idx] as { content: string }

        if (token.content.startsWith('<img')) {
          token.content = token.content.replace(/ src=(["'])([^'"]+)\1/, (_, __, $relativePath) => {
            return ` src="${editor.imgEdit.getRealSrc($relativePath)}"`
          })
        }

        return defaultHtmlInlineRender(tokens, idx, options, env, self)
      }
    })
    return {}
  }
}

const RE_FRONT_MATTER = /^---\s*\n([\s\S]+?)\n---\s*\n?/

function parseMarkdown(md: string) {
  let frontMatter = ''

  const content = md
    .replace(RE_FRONT_MATTER, (_, $1) => {
      frontMatter = $1
      return ''
    })

  return { frontMatter, content }
}

function renderMarkmap(options: {
  globalOptions: string,
  markdown: string,
  getMarkmap(): Markmap,
}) {
  setTimeout(() => {
    const { frontMatter, content } = parseMarkdown(options.markdown)
    const globalOpts = yaml.load(options.globalOptions) ?? {}
    const fronMatterJson = yaml.load(frontMatter) ?? {} as any
    const localOpts = fronMatterJson.markmap ?? fronMatterJson
    const jsonOpts = { ...globalOpts, ...localOpts }
    const opts = deriveOptions(jsonOpts as any)
    const mm = options.getMarkmap()
    mm.setOptions(opts)

    const { root } = new Transformer([...builtInPlugins, resolveImagePath]).transform(content)
    mm.setData(root)

    // 移除自动适应视图调用，保持用户缩放状态
    // mm.fit(1)
  })
  return
}

// =======================================================
// STYLE BLOCK (等效于 <style> 标签)
// =======================================================
const COMPONENT_STYLE = `
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
    overflow: hidden;
    user-select: none;
  }

  .markmap-content, .markmap-svg {
    pointer-events: auto;
    user-select: none;
  }

  /* TOC 弹窗嵌入侧边栏时的样式 */
  .markmap-toc-modal.sidebar-embedded {
    top: 0; /* 将由JS动态设置 */
    left: 0; /* 将由JS动态设置 */
    right: auto;
    width: 100%; /* 将由JS动态设置 */
    height: 100%; /* 将由JS动态设置 */
    border-radius: 0;
    border: none;
    box-shadow: none;
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
    cursor: move; /* 添加移动光标 */
  }

  /* 嵌入状态下的标题栏样式 */
  .markmap-toc-modal.sidebar-embedded .markmap-toc-header {
    cursor: default; /* 默认为禁用移动光标，将由JS动态控制 */
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
`;

// =======================================================
// TEMPLATE BLOCK (等效于 <template> 标签)
// =======================================================
const COMPONENT_TEMPLATE = `
  <div class="markmap-toc-header">
    <span class="markmap-toc-title"></span>
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
`;


// =======================================================
// SCRIPT BLOCK (等效于 <script> 标签)
// =======================================================
export class TocMindmapComponent {

  // 依赖注入：从父组件获取所需的 "props"
  constructor(
    private settings: MarkmapSettings
  ) {
    this.transformer = new Transformer([...builtInPlugins, resolveImagePath]);
    this._injectStyle();
  }

  /**
   * 更新组件设置
   * @param newSettings 新的设置对象
   */
  public updateSettings(newSettings: MarkmapSettings) {
    this.settings = newSettings;
    // 为简单起见，如果组件可见，则执行一次完整的更新，这足以安全地覆盖所有设置更改
    if (this.isVisible) {
      this._update();
    }
  }

  // 集中化的内部状态，类似 Vue 的 data
  private state = {
    element: null as HTMLElement | null,
    markmap: null as any | null,
    isEmbedded: false,
    resizeObserver: null as ResizeObserver | null,
    contentObserver: null as MutationObserver | null,
    lastHeadingsHash: '',
    lastMarkmapData: null as any, // 保存上次的 markmap 数据用于状态保持
  };

  private transformer: Transformer;
  private debouncedUpdate = debounce(this._handleContentChange.bind(this), 200); // 适中的防抖时间

  // 模拟计算属性，类似 Vue 的 computed
  get isVisible(): boolean {
    return !!(this.state.element && this.state.element.style.display !== 'none');
  }

  // --- 公共 API ---

  public show = async () => {
    if (this.isVisible) return;

    logger('显示 TOC Markmap');
    try {
      this._createElement();
      this._attachEventListeners();
      this._initRealTimeUpdate();
      await this._update();
      logger('TOC 窗口显示成功');
    } catch (error) {
      logger(`TOC 窗口显示失败: ${error.message}`, 'error', error);
      this.destroy(); // 显示失败时自我销毁
      throw error;
    }
  }

  public hide = () => {
    if (!this.isVisible) return;

    // 清理 InteractJS 实例
    if (this.state.element) {
      interact(this.state.element).unset();
    }

    this.state.element?.remove();
    this.state.markmap?.destroy();

    // 清理所有事件监听和观察器
    this._cleanupEventListeners();
    this._cleanupRealTimeUpdate();
    this.state.resizeObserver?.disconnect();

    // 重置状态
    this.state.element = null;
    this.state.markmap = null;
    this.state.resizeObserver = null;
    this.state.contentObserver = null;
    this.state.lastHeadingsHash = '';

    logger('TOC 窗口已关闭');
  }

  public toggle = async () => {
    if (this.isVisible) {
      this.hide();
    } else {
      await this.show();
    }
  }

  public destroy = () => {
    this.hide();
    // 移除样式表
    document.getElementById('markmap-toc-component-style')?.remove();
  }

  // --- 私有方法 ---

  private _createElement() {
    const container = document.createElement('div');
    container.className = 'markmap-toc-modal';
    container.style.width = `${this.settings.tocWindowWidth}px`;
    container.style.height = `${this.settings.tocWindowHeight}px`;
    container.innerHTML = COMPONENT_TEMPLATE;
    document.body.appendChild(container);
    this.state.element = container;
    this._setupInteractJS();
  }

  private _setupInteractJS() {
    if (!this.state.element) return;

    // 初始化 InteractJS 实例
    const interactInstance = interact(this.state.element);
    
    // 设置调整大小功能（始终启用）
    interactInstance.resizable({
      edges: { left: true, right: true, bottom: true, top: true },
      listeners: {
        move: (event) => {
          const target = event.target;
          target.style.width = `${event.rect.width}px`;
          target.style.height = `${event.rect.height}px`;
          target.style.left = `${event.rect.left}px`;
          target.style.top = `${event.rect.top}px`;
          target.style.transform = 'none';
          target.removeAttribute('data-x');
          target.removeAttribute('data-y');
        }
      }
    });

    // 根据当前状态设置拖动功能
    this._updateInteractSettings();
  }

  private _updateInteractSettings() {
    if (!this.state.element) return;

    const interactInstance = interact(this.state.element);
    const header = this.state.element.querySelector('.markmap-toc-header') as HTMLElement;
    
    if (this.state.isEmbedded && !this.settings.allowDragWhenEmbedded) {
      // 嵌入状态且设置为不允许拖动：禁用拖动
      interactInstance.draggable(false);
      if (header) header.style.cursor = 'default';
    } else {
      // 悬浮状态或设置为允许拖动：启用拖动
      interactInstance.draggable({
        allowFrom: '.markmap-toc-header',
        ignoreFrom: '.markmap-svg, .markmap-content',
        listeners: {
          move: (event) => {
            const target = event.target;
            const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
            const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
            
            target.style.transform = `translate(${x}px, ${y}px)`;
            target.setAttribute('data-x', x.toString());
            target.setAttribute('data-y', y.toString());
          }
        }
      });
      if (header) header.style.cursor = 'move';
    }
  }

  private _injectStyle() {
    const styleId = 'markmap-toc-component-style';
    if (document.getElementById(styleId)) return;

    const styleTag = document.createElement('style');
    styleTag.id = styleId;
    styleTag.textContent = COMPONENT_STYLE;
    document.head.appendChild(styleTag);
  }

  private _eventCleanupFunctions: (() => void)[] = [];

    private _attachEventListeners() {
      if (!this.state.element) return;

      // 使用单一事件委托模式，在组件根元素上监听所有点击
      const boundHandler = this._handleModalClick.bind(this);
      this.state.element.addEventListener('click', boundHandler);
      this._eventCleanupFunctions.push(() => this.state.element!.removeEventListener('click', boundHandler));
    }

    private _cleanupEventListeners() {
      this._eventCleanupFunctions.forEach(cleanup => cleanup());
      this._eventCleanupFunctions = [];
    }

    // 统一的点击事件处理器
    private _handleModalClick = async (e: Event) => {
      const target = e.target as HTMLElement;

      // 检查是否点击了功能按钮
      const actionBtn = target.closest('[data-action]');
      if (actionBtn) {
        const action = actionBtn.getAttribute('data-action');
        try {
          switch (action) {
            case 'close': this.hide(); break;
            case 'dock-left': this._toggleEmbed(); break;
            case 'refresh': await this._update(); break;
            case 'zoom-in': this._zoomIn(); break;
            case 'zoom-out': this._zoomOut(); break;
            case 'fit': this._fitToView(e as MouseEvent); break;
          }
        } catch (error) {
          logger(`按钮操作失败: ${error.message}`, 'error', error);
        }
        return; // 处理完按钮点击后结束
      }

      // 检查是否点击了思维导图节点
      const nodeEl = target.closest('.markmap-node');
      if (nodeEl) {
        this._scrollToHeadingByNode(nodeEl);
        return; // 处理完节点点击后结束
      }
    }
  private _update = async () => {
    if (!this.state.element) return;

    logger('更新 TOC Markmap');
    const svg = this.state.element.querySelector('.markmap-svg') as SVGElement;
    if (!svg) return;

    const headings = await this._getDocumentHeadings();
    this.state.lastHeadingsHash = this._getHeadingsHash(headings);

    if (headings.length === 0) {
      this._renderEmpty(svg);
      return;
    }

    const markdownContent = this._buildTocMarkdown(headings);
    const { root } = this.transformer.transform(markdownContent);
    const options = deriveOptions({
      spacingHorizontal: 80,
      spacingVertical: 20,
      fitRatio: 0.95,
      paddingX: 20,
      color: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4'],
      colorFreezeLevel: 2,
      initialExpandLevel: this.settings.initialExpandLevel,
      duration: this.settings.animationDuration, // 使用用户配置的动画持续时间
    });

    if (this.state.markmap) {
      // 保持折叠状态
      this._preserveFoldState(root);

      // 更新数据，这将自动保留当前的缩放和平移状态，实现平滑更新
      this.state.markmap.setData(root, options);
    } else {
      // 首次创建
      svg.innerHTML = '';
      this.state.markmap = Markmap.create(svg, options, root);
      // 只在首次创建时自动适应视图
      setTimeout(() => this.state.markmap?.fit(), 100);
    }

    // 保存当前数据用于下次状态保持
    this.state.lastMarkmapData = root;
  }

  private _buildTocMarkdown(headings: Array<{level: number, text: string, id: string}>): string {
    return headings.map(h => `${'#'.repeat(h.level)} ${h.text}`).join('\n');
  }

  private async _getDocumentHeadings() {
    const headings: Array<{level: number, text: string, id: string}> = [];
    const write = document.querySelector('#write');
    if (!write) return [];

    const headingElements = Array.from(write.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    for (const h of headingElements) {
      const text = (h as HTMLElement).innerText.trim();
      if (text) {
        headings.push({
          level: parseInt(h.tagName.substring(1)),
          text,
          id: h.id || `heading-${headings.length}`,
        });
      }
    }
    return headings;
  }

  private _scrollToHeadingByNode(nodeEl: Element) {
    const nodeText = nodeEl.textContent?.trim();
    if (!nodeText) return;

    const write = document.querySelector('#write');
    if (!write) return;

    const allHeadings = write.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (const heading of Array.from(allHeadings)) {
      if (heading.textContent?.trim() === nodeText) {
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
  }

  private _zoomIn() {
    if (!this.state.markmap) return;
    const zoomStep = this.settings.zoomStep ?? 0.2;
    this.state.markmap.svg.transition().duration(250).call(this.state.markmap.zoom.scaleBy, 1 + zoomStep);
  }

  private _zoomOut() {
    if (!this.state.markmap) return;
    const zoomStep = this.settings.zoomStep ?? 0.2;
    this.state.markmap.svg.transition().duration(250).call(this.state.markmap.zoom.scaleBy, 1 / (1 + zoomStep));
  }

  private _toggleEmbed() {
    if (!this.state.element) return;

    const sidebar = document.getElementById('typora-sidebar');
    if (!sidebar) return;

    this.state.element.classList.toggle('sidebar-embedded');
    this.state.isEmbedded = this.state.element.classList.contains('sidebar-embedded');

    // 更新拖动设置
    this._updateInteractSettings();

    const embedBtn = this.state.element.querySelector('[data-action="dock-left"]') as HTMLElement;

    if (this.state.isEmbedded) {
      const rect = sidebar.getBoundingClientRect();
      this.state.element.style.top = `${rect.top}px`;
      this.state.element.style.left = `${rect.left}px`;
      this.state.element.style.width = `${rect.width}px`;
      this.state.element.style.height = `${rect.height}px`;
      if (embedBtn) {
        embedBtn.innerHTML = '🔗';
        embedBtn.title = '取消嵌入';
      }

      this.state.resizeObserver = new ResizeObserver(() => {
        if (this.state.isEmbedded && this.state.element) {
          const newRect = sidebar.getBoundingClientRect();
          this.state.element.style.width = `${newRect.width}px`;
          this.state.element.style.height = `${newRect.height}px`;
          this.state.element.style.top = `${newRect.top}px`;
          this.state.element.style.left = `${newRect.left}px`;
        }
      });
      this.state.resizeObserver.observe(sidebar);
    } else {
      this.state.element.style.width = `${this.settings.tocWindowWidth}px`;
      this.state.element.style.height = `${this.settings.tocWindowHeight}px`;
      this.state.element.style.top = '';
      this.state.element.style.left = '';
      if (embedBtn) {
        embedBtn.innerHTML = '📌';
        embedBtn.title = '嵌入侧边栏';
      }
      this.state.resizeObserver?.disconnect();
      this.state.resizeObserver = null;
    }
    // 移除自动适应视图调用，保持用户当前的缩放状态
  }

  private _fitToView(event?: MouseEvent) {
    if (!this.state.markmap || !this.state.element) return;

    const svg = this.state.element.querySelector('.markmap-svg') as SVGElement;
    if (!svg) return;

    // 检查是否是用户主动点击适应视图按钮
    const isUserClick = event && event.type === 'click';
    
    if (isUserClick) {
      // 用户主动点击时，提供智能适应视图
      const currentHeadingObj = this._getCurrentVisibleHeading();
      if (!currentHeadingObj) {
        this.state.markmap.fit();
        logger('未找到当前标题，使用默认适应视图');
        return;
      }

      const currentHeading = currentHeadingObj.text;
      logger(`当前可见标题: "${currentHeading}"`);

      const nodeElements = svg.querySelectorAll('g > foreignObject');
      let targetElement = null;

      for (const nodeEl of Array.from(nodeElements)) {
        const textContent = nodeEl.textContent?.trim() || '';
        if (textContent === currentHeading) {
          targetElement = nodeEl.parentElement;
          logger(`找到匹配节点: "${textContent}"`);
          break;
        }
      }

      if (targetElement) {
        const transform = zoomTransform(svg);
        const scale = this._calculateOptimalScale(targetElement, currentHeadingObj, transform.k);
        logger(`计算出的缩放比例: ${scale}`);

        const svgRect = svg.getBoundingClientRect();
        const nodeRect = targetElement.getBoundingClientRect();

        const originalNodeX =
          (nodeRect.left - svgRect.left - transform.x) / transform.k +
          nodeRect.width / (2 * transform.k);
        const originalNodeY =
          (nodeRect.top - svgRect.top - transform.y) / transform.k +
          nodeRect.height / (2 * transform.k);

        const newTransform = zoomIdentity
          .translate(svg.clientWidth / 2, svg.clientHeight / 2)
          .scale(scale)
          .translate(-originalNodeX, -originalNodeY);

        this.state.markmap.svg
          .transition()
          .duration(500)
          .call(this.state.markmap.zoom.transform, newTransform);

        logger(`以当前标题节点适应视图: "${currentHeading}"，缩放比例: ${scale}`);
      } else {
        // 如果在思维导图中未找到匹配节点，则使用默认适应视图
        this.state.markmap.fit();
      }
    } else {
      // 非用户主动点击时，不执行任何适应视图操作
      logger('非用户主动操作，跳过适应视图');
    }
  }

  private _calculateOptimalScale(nodeElement: Element, headingObj: any, currentScale: number): number {
    try {
      const writeElement = document.querySelector('#write');
      if (!writeElement) return 2.0;

      const paragraph = writeElement.querySelector('p') || writeElement;
      const documentFontSize = window.getComputedStyle(paragraph).fontSize;
      const documentSize = parseFloat(documentFontSize);

      const nodeRect = nodeElement.getBoundingClientRect();
      const nodeHeight = nodeRect.height;

      const nodeHeightAtScale1 = nodeHeight / currentScale;
      const scale = documentSize / nodeHeightAtScale1;

      logger(
        `正文字体: ${documentSize.toFixed(1)}px, 节点测量高度: ${nodeHeight.toFixed(1)}px, 当前缩放: ${currentScale.toFixed(2)}, 节点真实高度: ${nodeHeightAtScale1.toFixed(1)}px, 计算新缩放: ${scale.toFixed(2)}`
      );

      return scale;
    } catch (error) {
      logger(`计算缩放比例失败: ${error.message}`, 'error');
      return 2.0;
    }
  }

  private _getCurrentVisibleHeading() {
    const write = document.querySelector('#write');
    if (!write) return null;

    const headings = Array.from(write.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;

    let closestHeading = null;
    let minDistance = Infinity;

    for (const heading of headings) {
      const rect = heading.getBoundingClientRect();
      const elementTop = rect.top + window.scrollY;
      const text = heading.textContent?.trim() || '';

      if (!text) continue;

      // 优先选择在视口内的第一个标题
      if (elementTop >= viewportTop - 100 && elementTop <= viewportBottom) {
        return {
          text,
          level: parseInt(heading.tagName.substring(1)),
          element: heading,
        };
      }

      // 如果不在视口内，则计算与视口顶部的距离，用于后续备选
      const distance = Math.abs(elementTop - viewportTop);
      if (distance < minDistance) {
        minDistance = distance;
        closestHeading = {
          text,
          level: parseInt(heading.tagName.substring(1)),
          element: heading,
        };
      }
    }

    // 如果循环结束都没有找到视口内的标题，则返回距离最近的那个
    return closestHeading;
  }

  private _renderEmpty(svg: SVGElement) {
    svg.innerHTML = '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle">当前文档没有标题</text>';
  }

  private _renderError(svg: SVGElement, message: string) {
    svg.innerHTML = `<text x="10" y="20" fill="red">渲染错误: ${message}</text>`;
  }

  // --- 实时更新相关方法 ---

  private _initRealTimeUpdate() {
    if (!this.settings.enableRealTimeUpdate) return;

    // 尝试使用 Typora 的事件系统，失败则回退到 MutationObserver
    if (!this._tryInitTyporaEventSystem()) {
      this._initMutationObserver();
    }
  }

  /**
   * 尝试初始化 Typora 事件系统
   * 基于参考实现中的事件监听机制
   */
  private _tryInitTyporaEventSystem(): boolean {
    try {
      const possibleEventHubs = [
        (window as any).eventHub,
        (window as any).File?.eventHub,
        (window as any).typora?.eventHub,
        (window as any).editor?.eventHub
      ];

      for (const eventHub of possibleEventHubs) {
        if (eventHub && eventHub.addEventListener && eventHub.eventType) {
          if (eventHub.eventType.outlineUpdated) {
            eventHub.addEventListener(eventHub.eventType.outlineUpdated, () => {
              if (!this.isVisible) return;
              this._handleContentChange();
            });
            return true;
          }

          const possibleEvents = ['contentChanged', 'documentChanged', 'tocUpdated', 'fileContentChanged'];
          for (const eventName of possibleEvents) {
            if (eventHub.eventType[eventName]) {
              eventHub.addEventListener(eventHub.eventType[eventName], () => {
                if (!this.isVisible) return;
                this.debouncedUpdate();
              });
              return true;
            }
          }
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * 初始化 MutationObserver（优化版本）
   */
  private _initMutationObserver() {
    const writeElement = document.querySelector('#write');
    if (!writeElement) return;

    this.state.contentObserver = new MutationObserver((mutations) => {
      // 检查是否有任何可能影响标题的变化
      const hasRelevantChanges = mutations.some(mutation => {
        // 检查子节点变化（新增/删除元素）
        if (mutation.type === 'childList') {
          return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
        }
        
        // 检查文本内容变化
        if (mutation.type === 'characterData') {
          return true;
        }
        
        // 检查属性变化
        if (mutation.type === 'attributes') {
          return true;
        }
        
        return false;
      });

      if (hasRelevantChanges) {
        logger('检测到文档内容变化，准备更新思维导图');
        this.debouncedUpdate();
      }
    });

    this.state.contentObserver.observe(writeElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeOldValue: true,
      characterDataOldValue: true
    });

    logger('MutationObserver 已启动，监听范围：childList, subtree, characterData, attributes');
  }

  private _cleanupRealTimeUpdate() {
    if (this.state.contentObserver) {
      this.state.contentObserver.disconnect();
      this.state.contentObserver = null;
      logger('实时更新监听器已清理');
    }
  }

  private async _handleContentChange() {
    if (!this.isVisible) return;

    try {
      const headings = await this._getDocumentHeadings();
      const currentHash = this._getHeadingsHash(headings);

      if (currentHash !== this.state.lastHeadingsHash) {
        this.state.lastHeadingsHash = currentHash;
        await this._update();
      }
    } catch (error) {
      logger(`处理内容变化时出错: ${error.message}`, 'error', error);
    }
  }

  private _getHeadingsHash(headings: Array<{level: number, text: string, id: string}>): string {
    return headings.map(h => `${h.level}:${h.text}`).join('|');
  }

  /**
   * 保持节点的折叠状态
   * 基于节点路径匹配来恢复之前的折叠状态
   */
  private _preserveFoldState(newRoot: any) {
    if (!this.settings.keepFoldStateWhenUpdate || !this.state.lastMarkmapData) return;

    // 构建路径映射函数
    const buildPath = (node: any, parent?: any): string => {
      const parentPath = (parent && parent.__path) || '';
      return `${parentPath}\n${node.content}`;
    };

    // 遍历函数
    const traverse = (node: any, fn: (node: any) => void, parent?: any) => {
      node.__path = buildPath(node, parent);
      fn(node);
      if (node.children) {
        for (const child of node.children) {
          traverse(child, fn, node);
        }
      }
    };

    // 收集需要折叠的节点路径
    const foldedPaths = new Set<string>();
    traverse(this.state.lastMarkmapData, (node) => {
      if (node.payload && node.payload.fold) {
        foldedPaths.add(node.__path);
      }
    });

    // 恢复折叠状态
    traverse(newRoot, (node) => {
      if (node.payload && foldedPaths.has(node.__path)) {
        node.payload.fold = 1;
      }
    });

    logger(`恢复了 ${foldedPaths.size} 个节点的折叠状态`);
  }
}
