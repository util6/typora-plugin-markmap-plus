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
import { INode, IPureNode } from 'markmap-common';
import { zoomIdentity, zoomTransform } from 'd3-zoom';
import { select } from 'd3-selection';
import { logger, debounce } from '../utils';
import interact from 'interactjs';

// ==================== 类型定义 ====================

/**
 * 编辑器适配器接口
 * 用于解耦具体编辑器实现
 */
export interface IEditorAdapter {
  /** 获取 Markdown 内容 */
  getMarkdown(): string;
  /** 获取文档中的标题元素 */
  getHeadings(): HTMLElement[];
  /** 将相对路径转换为绝对路径 */
  resolveImagePath(src: string): string;
}

/**
 * TOC 思维导图组件配置选项
 */
export interface TocMindmapOptions {
  /** 目录思维导图窗口的默认宽度（像素） */
  tocWindowWidth: number
  /** 目录思维导图窗口的默认高度（像素） */
  tocWindowHeight: number
  /** 思维导图初始展开到第几级标题 */
  initialExpandLevel: number
  /** 缩放操作的步长（每次放大/缩小的比例） */
  zoomStep: number
  /** 是否启用实时更新功能 */
  enableRealTimeUpdate: boolean
  /** 更新时是否保持节点的折叠状态 */
  keepFoldStateWhenUpdate: boolean
  /** 更新时是否自动适应视图 */
  autoFitWhenUpdate: boolean
  /** 动画持续时间（毫秒），0 表示禁用动画 */
  animationDuration: number
  /** 固定到侧边栏时是否允许拖动 */
  allowDragWhenEmbedded: boolean
  /** 点击跳转时距离视窗顶部的像素距离 */
  scrollOffsetTop: number
  /** 点击跳转后标题的背景高亮颜色 */
  highlightColor: string
  /** 高亮效果的持续时间（毫秒） */
  highlightDuration: number
  /** 导出文件的保存目录 */
  exportDirectory: string

  // 高级配置
  /** Markmap 水平间距 */
  spacingHorizontal: number
  /** Markmap 垂直间距 */
  spacingVertical: number
  /** 适应视图比例 */
  fitRatio: number
  /** 内边距 */
  paddingX: number
  /** 节点颜色方案 */
  nodeColors: string[]
  /** 颜色冻结层级 */
  colorFreezeLevel: number
  /** 视口偏移量（用于判断标题是否在视口内） */
  viewportOffset: number
  /** DOM 属性设置延迟 */
  delayAttributeSet: number
  /** 初始适应视图延迟 */
  delayInitialFit: number
  /** 缩放过渡动画时长 */
  delayZoomTransition: number
  /** 适应视图过渡动画时长 */
  delayFitTransition: number
  /** 滚动边距重置延迟 */
  delayScrollMarginReset: number
  /** 属性检查延迟 */
  delayAttributeCheck: number
}

/**
 * TOC 思维导图组件默认配置
 */
export const DEFAULT_TOC_OPTIONS: TocMindmapOptions = {
  tocWindowWidth: 450,
  tocWindowHeight: 600,
  initialExpandLevel: 3,
  zoomStep: 0.2,
  enableRealTimeUpdate: true,
  keepFoldStateWhenUpdate: true,
  autoFitWhenUpdate: false,
  animationDuration: 500,
  allowDragWhenEmbedded: false,
  scrollOffsetTop: 80,
  highlightColor: 'rgba(255, 215, 0, 0.5)',
  highlightDuration: 1500,
  exportDirectory: '',

  // 高级配置默认值
  spacingHorizontal: 80,
  spacingVertical: 20,
  fitRatio: 0.95,
  paddingX: 20,
  nodeColors: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4'],
  colorFreezeLevel: 2,
  viewportOffset: 100,
  delayAttributeSet: 100,
  delayInitialFit: 150,
  delayZoomTransition: 250,
  delayFitTransition: 500,
  delayScrollMarginReset: 1000,
  delayAttributeCheck: 50
}

// ==================== MARKMAP 渲染器集成 ====================

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
    z-index: 100;
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

  /* 导出菜单样式 */
  .markmap-export-menu {
    position: absolute;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    z-index: 101;
    padding: 4px 0;
    min-width: 120px;
  }

  .markmap-export-item {
    padding: 8px 16px;
    cursor: pointer;
    font-size: 14px;
    color: #333;
  }

  .markmap-export-item:hover {
    background-color: #f5f5f5;
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
      <button class="markmap-toc-btn" data-action="fit" title="适应视图">🎯</button>
      <button class="markmap-toc-btn" data-action="export" title="导出">💾</button>
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

  // ==================== 依赖注入与初始化 ====================

  /** 组件配置选项 */
  private options: TocMindmapOptions;

  /**
   * 创建图片路径解析插件
   */
  private _createImagePlugin(): ITransformPlugin {
    const adapter = this.editorAdapter;
    return {
      name: 'resolveImagePath',
      transform(ctx) {
        ctx.parser.tap((md: any) => {
          const defaultRender = (tokens: any, idx: number, options: any, env: any, self: any) =>
            self.renderToken(tokens, idx, options);

          const defaultImageRender = md.renderer.rules.image || defaultRender;
          md.renderer.rules.image = (tokens: any[], idx: number, options: any, env: any, self: any) => {
            const token = tokens[idx];
            const src = token.attrGet('src');
            if (src) token.attrSet('src', adapter.resolveImagePath(src));
            return defaultImageRender(tokens, idx, options, env, self);
          };

          const defaultHtmlInlineRender = md.renderer.rules.html_inline || defaultRender;
          md.renderer.rules.html_inline = (tokens: any[], idx: number, options: any, env: any, self: any) => {
            const token = tokens[idx] as { content: string };
            if (token.content.startsWith('<img')) {
              token.content = token.content.replace(/ src=(["'])([^'"]+)\1/, (_, __, $relativePath) =>
                ` src="${adapter.resolveImagePath($relativePath)}"`);
            }
            return defaultHtmlInlineRender(tokens, idx, options, env, self);
          };
        });
        return {};
      }
    };
  }

  /**
   * 构造函数
   *
   * 初始化组件所需的核心依赖：
   * 1. 合并用户配置和默认配置
   * 2. 创建 Markmap 转换器（包含内置插件和图片路径解析插件）
   * 3. 注入组件样式到页面
   * 4. 初始化高亮样式
   *
   * @param options 组件配置选项（可选，未提供的选项使用默认值）
   * @param editorAdapter 编辑器适配器，提供编辑器相关功能
   */
  constructor(
    options: Partial<TocMindmapOptions> = {},
    private editorAdapter: IEditorAdapter
  ) {
    // 合并默认配置和用户配置
    this.options = { ...DEFAULT_TOC_OPTIONS, ...options };
    // 创建 Markmap 转换器，使用适配器的图片路径解析
    const imagePlugin = this._createImagePlugin();
    this.transformer = new Transformer([...builtInPlugins, imagePlugin]);
    // 将组件样式注入到页面 <head> 中
    this._injectStyle();
    // 根据用户设置初始化高亮样式
    this._updateHighlightStyle();
  }

  /**
   * 更新组件配置
   *
   * 当配置发生变化时调用此方法来同步更新组件的配置。
  /**
   * 更新组件配置
   *
   * 当配置发生变化时调用此方法来同步更新组件的配置。
   * 这确保了配置变化能够立即生效。
   *
   * @param newOptions 新的配置选项（部分或全部）
   */
  public updateOptions(newOptions: Partial<TocMindmapOptions>) {
    // 合并新配置到当前配置
    this.options = { ...this.options, ...newOptions };
    this._updateHighlightStyle(); // 更新高亮样式

    // 为简单起见，如果组件可见，则执行一次完整的更新
    // 这足以安全地覆盖所有设置更改，确保新设置立即生效
    if (this.isVisible) {
      this._update();
    }
  }

  // ==================== 组件状态管理 ====================

  /**
   * 组件内部状态
   * 集中管理所有可变状态，类似 Vue 的 data 选项
   */
  private state = {
    /** 组件的根 DOM 元素 */
    element: null as HTMLElement | null,
    /** Markmap 实例，用于渲染和控制思维导图 */
    markmap: null as any | null,
    /** 是否处于侧边栏嵌入模式 */
    isEmbedded: false,
    /** 监听侧边栏尺寸变化的观察器 */
    resizeObserver: null as ResizeObserver | null,
    /** 监听文档内容变化的观察器 */
    contentObserver: null as MutationObserver | null,
    /** 上次标题内容的哈希值，用于检测变化 */
    lastHeadingsHash: '',
    /** 双向索引：从 state.path 到 HTMLElement */
    headingElements: new Map<string, HTMLElement>(),
    /** 双向索引：从 HTMLElement 到 state.path */
    elementToPath: new Map<HTMLElement, string>(),
  };

  /** Markmap 转换器实例，用于将 Markdown 转换为思维导图数据 */
  private transformer: Transformer;

  /** 防抖处理的更新函数，避免频繁更新导致性能问题 */
  private debouncedUpdate = debounce(this._handleContentChange.bind(this), 200);

  // ==================== 计算属性 ====================

  /**
   * 组件是否可见
   * 类似 Vue 的 computed 属性，根据 DOM 状态动态计算
   */
  get isVisible(): boolean {
    return !!(this.state.element && this.state.element.style.display !== 'none');
  }

  // ==================== 公共 API ====================

  /**
   * 显示思维导图窗口
   *
   * 执行流程：
   * 1. 检查是否已显示，避免重复创建
   * 2. 创建 DOM 元素并添加到页面
   * 3. 绑定事件监听器
   * 4. 初始化实时更新功能
   * 5. 渲染思维导图内容
   *
   * @throws 如果显示失败会抛出错误并自动清理
   */
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

  /**
   * 隐藏思维导图窗口
   *
   * 执行清理工作：
   * 1. 清理 InteractJS 实例（拖动和调整大小功能）
   * 2. 从 DOM 中移除元素
   * 3. 销毁 Markmap 实例
   * 4. 清理所有事件监听器和观察器
   * 5. 重置内部状态
   */
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
    this.state.headingElements.clear();
    this.state.elementToPath.clear();

    logger('TOC 窗口已关闭');
  }

  /**
   * 切换思维导图窗口的显示/隐藏状态
   */
  public toggle = async () => {
    if (this.isVisible) {
      this.hide();
    } else {
      await this.show();
    }
  }

  /**
   * 销毁组件
   *
   * 完全清理组件，包括：
   * 1. 隐藏窗口并清理所有资源
   * 2. 从页面中移除注入的样式表
   */
  public destroy = () => {
    this.hide();
    // 移除样式表
    document.getElementById('markmap-toc-component-style')?.remove();
  }

  // ==================== 私有方法：DOM 操作 ====================

  /**
   * 创建组件的 DOM 元素
   *
   * 1. 创建容器元素并设置样式类
   * 2. 根据用户设置设置初始宽高
   * 3. 填充 HTML 模板内容
   * 4. 添加到页面 body
   * 5. 初始化 InteractJS（拖动和调整大小功能）
   */
  private _createElement() {
    const container = document.createElement('div');
    container.className = 'markmap-toc-modal';
    container.style.width = `${this.options.tocWindowWidth}px`;
    container.style.height = `${this.options.tocWindowHeight}px`;
    container.innerHTML = COMPONENT_TEMPLATE;
    document.body.appendChild(container);
    this.state.element = container;
    this._setupInteractJS();
  }

  /**
   * 设置 InteractJS 交互功能
   *
   * 配置两个核心功能：
   * 1. 调整大小（resizable）：允许从四个边缘调整窗口大小
   * 2. 拖动（draggable）：根据嵌入状态和设置动态启用/禁用
   */
  private _setupInteractJS() {
    if (!this.state.element) return;

    // 初始化 InteractJS 实例
    const interactInstance = interact(this.state.element);

    // 设置调整大小功能（始终启用）
    interactInstance.resizable({
      // 允许从四个边缘调整大小
      edges: { left: true, right: true, bottom: true, top: true },
      listeners: {
        move: (event) => {
          const target = event.target;
          // 更新元素的尺寸和位置
          target.style.width = `${event.rect.width}px`;
          target.style.height = `${event.rect.height}px`;
          target.style.left = `${event.rect.left}px`;
          target.style.top = `${event.rect.top}px`;
          // 清除 transform，使用绝对定位
          target.style.transform = 'none';
          target.removeAttribute('data-x');
          target.removeAttribute('data-y');
        }
      }
    });

    // 根据当前状态设置拖动功能
    this._updateInteractSettings();
  }

  /**
   * 更新 InteractJS 拖动设置
   *
   * 根据嵌入状态和用户设置动态调整拖动功能：
   * - 嵌入状态且不允许拖动：禁用拖动，光标显示为默认
   * - 其他情况：启用拖动，光标显示为移动图标
   */
  private _updateInteractSettings() {
    if (!this.state.element) return;

    const interactInstance = interact(this.state.element);
    const header = this.state.element.querySelector('.markmap-toc-header') as HTMLElement;

    if (this.state.isEmbedded && !this.options.allowDragWhenEmbedded) {
      // 嵌入状态且设置为不允许拖动：禁用拖动
      interactInstance.draggable(false);
      if (header) header.style.cursor = 'default';
    } else {
      // 悬浮状态或设置为允许拖动：启用拖动
      interactInstance.draggable({
        // 只允许从标题栏拖动
        allowFrom: '.markmap-toc-header',
        // 忽略 SVG 和内容区域的拖动
        ignoreFrom: '.markmap-svg, .markmap-content',
        listeners: {
          move: (event) => {
            const target = event.target;
            // 累加拖动距离
            const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
            const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;

            // 使用 transform 实现拖动，性能更好
            target.style.transform = `translate(${x}px, ${y}px)`;
            target.setAttribute('data-x', x.toString());
            target.setAttribute('data-y', y.toString());
          }
        }
      });
      if (header) header.style.cursor = 'move';
    }
  }

  /**
   * 注入组件样式到页面
   *
   * 检查样式是否已存在，避免重复注入
   */
  private _injectStyle() {
    const styleId = 'markmap-toc-component-style';
    if (document.getElementById(styleId)) return;

    const styleTag = document.createElement('style');
    styleTag.id = styleId;
    styleTag.textContent = COMPONENT_STYLE;
    document.head.appendChild(styleTag);
  }

  /**
   * 动态更新高亮样式
   *
   * 根据用户在设置中选择的颜色，动态创建或更新一个 <style> 标签，
   * 其中包含高亮动画的 @keyframes 规则。
   * 这使得高亮颜色可以由用户自定义。
   */
  private _updateHighlightStyle() {
    const styleId = 'markmap-highlight-style';
    let styleTag = document.getElementById(styleId) as HTMLStyleElement;

    // 如果样式标签不存在，则创建一个
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }

    const color = this.options.highlightColor;
    const duration = this.options.highlightDuration / 1000; // 转换为秒
    // 动态生成 keyframes，将用户自定义颜色和持续时间注入
    styleTag.textContent = `
      @keyframes markmap-highlight-animation {
        from { background-color: ${color}; }
        to { background-color: transparent; }
      }

      .markmap-highlight {
        animation: markmap-highlight-animation ${duration}s ease-out;
      }
    `;
  }

  // ==================== 事件处理 ====================

  /** 事件清理函数数组，用于统一管理和清理所有事件监听器 */
  private _eventCleanupFunctions: (() => void)[] = [];

  /**
   * 绑定事件监听器
   *
   * 使用事件委托模式，在组件根元素上监听所有点击事件
   * 这样只需要一个监听器就能处理所有按钮和节点的点击
   */
  private _attachEventListeners() {
    if (!this.state.element) return;

    // 绑定点击事件处理器
    const boundHandler = this._handleModalClick.bind(this);
    this.state.element.addEventListener('click', boundHandler);

    // 保存清理函数，用于后续移除监听器
    this._eventCleanupFunctions.push(() => this.state.element!.removeEventListener('click', boundHandler));
  }

  /**
   * 清理所有事件监听器
   *
   * 遍历执行所有保存的清理函数，确保没有内存泄漏
   */
  private _cleanupEventListeners() {
    this._eventCleanupFunctions.forEach(cleanup => cleanup());
    this._eventCleanupFunctions = [];
  }

  /**
   * 统一的点击事件处理器
   *
   * 使用事件委托模式在组件根元素上监听所有点击事件，
   * 然后根据点击目标的不同执行相应的操作：
   * - 功能按钮点击：关闭、固定、刷新、缩放等操作
   * - 思维导图节点点击：跳转到对应的文档标题
   *
   * @param e 点击事件对象
   */
  private _handleModalClick = async (e: Event) => {
    const target = e.target as HTMLElement;

    // 检查是否点击了功能按钮（通过 data-action 属性识别）
    const actionBtn = target.closest('[data-action]');
    if (actionBtn) {
      const action = actionBtn.getAttribute('data-action');
      try {
        // 根据按钮的 action 属性执行相应的功能
        switch (action) {
          case 'close': this.hide(); break;           // 关闭思维导图窗口
          case 'dock-left': this._toggleEmbed(); break; // 切换侧边栏嵌入状态
          case 'zoom-in': this._zoomIn(); break;         // 放大思维导图
          case 'zoom-out': this._zoomOut(); break;       // 缩小思维导图
          case 'fit': this._fitToView(e as MouseEvent); break; // 适应视图大小
          case 'export': this._exportMarkmap('svg'); break; // 显示导出菜单
        }
      } catch (error) {
        logger(`按钮操作失败: ${error.message}`, 'error', error);
      }
      return; // 处理完按钮点击后结束，避免继续处理其他点击逻辑
    }

    // 检查是否点击了思维导图节点（向上查找 .markmap-node）
    let nodeEl: Element | null = target;
    while (nodeEl && nodeEl !== this.state.element) {
      if (nodeEl.classList?.contains('markmap-node')) {
        this._scrollToHeadingByNode(nodeEl);
        return;
      }
      nodeEl = nodeEl.parentElement;
    }

    // 如果既不是按钮也不是节点，不执行任何操作
  }
  /**
   * 更新思维导图内容
   */
  private _update = async () => {
    if (!this.state.element) return;

    const markdownContent = this.editorAdapter.getMarkdown();
    const contentHash = markdownContent;

    if (contentHash === this.state.lastHeadingsHash) return;

    logger('更新 TOC Markmap');
    this.state.lastHeadingsHash = contentHash;
    const svg = this.state.element.querySelector('.markmap-svg') as SVGElement;
    if (!svg) return;

    if (!markdownContent.trim()) {
      this._renderEmpty(svg);
      return;
    }

    const { root } = this.transformer.transform(markdownContent);

    const options = deriveOptions({
      spacingHorizontal: this.options.spacingHorizontal,
      spacingVertical: this.options.spacingVertical,
      fitRatio: this.options.fitRatio,
      paddingX: this.options.paddingX,
      color: this.options.nodeColors,
      colorFreezeLevel: this.options.colorFreezeLevel,
      initialExpandLevel: this.options.initialExpandLevel,
      duration: this.options.animationDuration,
    });

    if (this.state.markmap) {
      this.state.markmap.setData(root, options);
    } else {
      svg.innerHTML = '';
      this.state.markmap = Markmap.create(svg, options, root);
      setTimeout(() => this.state.markmap?.fit(), this.options.delayInitialFit);
    }

    const headings = this.editorAdapter.getHeadings();
    this._syncMapsAfterRender(root, headings);
  }

  // --- 工具方法：标题处理 ---

  /**
   * 获取文档中的所有标题元素
   * @returns 标题元素数组
   */
  private _getDocumentHeadings(): HTMLElement[] {
    return this.editorAdapter.getHeadings();
  }

  /**
   * 处理思维导图节点点击跳转到对应标题
   * @param nodeEl 节点元素
   */
  private _scrollToHeadingByNode(nodeEl: Element) {
    const nodeData = (nodeEl as any).__data__;
    const path = nodeData?.state?.path;

    if (!path) {
      logger('无法从节点获取state.path', 'warn');
      return;
    }

    const element = this.state.headingElements.get(path);
    if (element) {
      logger(`跳转到标题: ${path}`);
      this._scrollToElement(element);
    } else {
      logger(`未找到路径对应的元素: ${path}`, 'warn');
    }
  }

  /**
   * 滚动到指定元素
   *
   * @param element 目标元素
   */
  private _scrollToElement(element: HTMLElement) {
    const originalMargin = element.style.scrollMarginTop;
    element.style.scrollMarginTop = `${this.options.scrollOffsetTop}px`;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 添加高亮效果
    element.classList.add('markmap-highlight');

    // 动画结束后移除类并恢复margin，以便下次可以重新触发
    setTimeout(() => {
      element.style.scrollMarginTop = originalMargin;
      element.classList.remove('markmap-highlight');
    }, this.options.highlightDuration); // 持续时间应与动画时间一致
  }



  //----------------思维导图节点处理相关方法---------------------
  /**
   * 从 state.path 计算祖先路径数组
   * @param path 节点的 state.path (如 "0.1.2.3")
   * @returns 祖先路径数组 (如 ["0", "0.1", "0.1.2"])
   */
  private _getAncestorPaths(path: string): string[] {
    const parts = path.split('.');
    const ancestors: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      ancestors.push(parts.slice(0, i).join('.'));
    }
    return ancestors;
  }

  /**
   * 同步双向索引Map
   * 在setData后调用，清空并重建headingElements和elementToPath
   * @param root INode树根节点
   * @param headings HTMLElement数组
   */
  private _syncMapsAfterRender(root: INode | IPureNode, headings: HTMLElement[]): void {
    this.state.headingElements.clear();
    this.state.elementToPath.clear();

    const nodeList: INode[] = [];
    const collectNodes = (node: INode | IPureNode, isRoot = false) => {
      if (!isRoot && 'state' in node && node.state?.path) nodeList.push(node as INode);
      node.children?.forEach(child => collectNodes(child, false));
    };
    collectNodes(root, true);

    for (let i = 0; i < Math.min(nodeList.length, headings.length); i++) {
      const path = nodeList[i].state.path;
      const element = headings[i];
      this.state.headingElements.set(path, element);
      this.state.elementToPath.set(element, path);
    }
  }

  /**
   * 根据state.path在INode树中查找节点
   * @param node 当前节点
   * @param path 目标state.path
   * @returns 匹配的INode或null
   */
  private _findNodeByStatePath(node: INode, path: string): INode | null {
    if (node.state?.path === path) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = this._findNodeByStatePath(child, path);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * 确保节点可见（展开所有祖先）
   * @param path 目标节点的state.path
   */
  private async _ensureNodeVisible(path: string): Promise<void> {
    const ancestorPaths = this._getAncestorPaths(path);
    for (const ancestorPath of ancestorPaths) {
      const ancestorNode = this._findNodeByStatePath(this.state.markmap.state.data, ancestorPath);
      if (ancestorNode && ancestorNode.payload?.fold) {
        await this.state.markmap.toggleNode(ancestorNode);
      }
    }
  }

  /**
   * 根据标题内容查找 Markmap 数据节点（用于调试 toggleNode API）
   * @param content 标题文本内容（支持部分匹配）
   * @param recursive 是否递归搜索子节点，默认为 true
   * @returns 匹配的数据节点，如果未找到则返回 null
   */
  public findNodeByContent(content: string, recursive: boolean = true): any | null {
    if (!this.state.markmap?.state?.data) {
      logger('Markmap 数据未初始化', 'warn');
      return null;
    }

    const searchNode = (node: any): any | null => {
      // 解码节点内容并检查是否匹配
      const textarea = document.createElement('textarea');
      textarea.innerHTML = node.content || '';
      const nodeContent = textarea.value;
      if (nodeContent.includes(content)) {
        logger(`找到匹配节点: "${nodeContent}"`);
        return node;
      }

      // 递归搜索子节点
      if (recursive && node.children) {
        for (const child of node.children) {
          const found = searchNode(child);
          if (found) return found;
        }
      }

      return null;
    };

    return searchNode(this.state.markmap.state.data);
  }

  /**
   * 获取当前视口中可见的标题
   * @returns 标题元素或null
   */
  private _getCurrentVisibleHeading(): HTMLElement | null {
    // 获取文档中的所有标题元素
    const headings = this._getDocumentHeadings();
    if (headings.length === 0) return null;

    // 计算当前视口的上下边界
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;

    // 初始化最接近的标题元素和最小距离
    let closestHeading: HTMLElement | null = null;
    let minDistance = Infinity;

    // 遍历所有标题元素，查找在视口内或最接近视口顶部的标题
    for (const heading of headings) {
      const rect = heading.getBoundingClientRect();
      const elementTop = rect.top + window.scrollY;

      // 如果标题元素在视口内（考虑偏移量），直接返回该元素
      if (elementTop >= viewportTop - this.options.viewportOffset && elementTop <= viewportBottom) {
        return heading;
      }

      // 计算标题元素与视口顶部的距离，更新最接近的标题
      const distance = Math.abs(elementTop - viewportTop);
      if (distance < minDistance) {
        minDistance = distance;
        closestHeading = heading;
      }
    }

    // 返回最接近视口顶部的标题元素
    return closestHeading;
  }




  //---------------------------思维导图相关方法结束------------------


  /**
   * 放大思维导图
   *
   * 使用D3的缩放功能，按照设置中的zoomStep比例放大视图
   * 带有平滑的过渡动画效果
   */
  private _zoomIn() {
    if (!this.state.markmap) return;
    // 获取缩放步长，默认0.2表示每次放大20%
    const zoomStep = this.options.zoomStep ?? 0.2;
    this.state.markmap.svg
      .transition()
      .duration(this.options.delayZoomTransition)
      .call(this.state.markmap.zoom.scaleBy, 1 + zoomStep);
  }

  /**
   * 缩小思维导图
   *
   * 使用D3的缩放功能，按照设置中的zoomStep比例缩小视图
   * 带有平滑的过渡动画效果
   */
  private _zoomOut() {
    if (!this.state.markmap) return;
    // 获取缩放步长，使用倒数实现缩小效果
    const zoomStep = this.options.zoomStep ?? 0.2;
    this.state.markmap.svg
      .transition()
      .duration(this.options.delayZoomTransition)
      .call(this.state.markmap.zoom.scaleBy, 1 / (1 + zoomStep));
  }


  /**
   * 导出思维导图为SVG文件
   *
   * 工作流程：
   * 1. 克隆当前SVG元素避免影响显示
   * 2. 计算并设置SVG的实际尺寸（添加边距）
   * 3. 内联必要的CSS样式到SVG中
   * 4. 调用下载方法保存文件
   *
   * @param format 导出格式 (目前只支持svg)
   */
  private async _exportMarkmap(format: 'svg' | 'png') {
    if (!this.state.element) return;

    const svg = this.state.element.querySelector('.markmap-svg') as SVGSVGElement;
    if (!svg) return;

    try {
      // 克隆SVG以避免影响原始显示
      const clonedSvg = svg.cloneNode(true) as SVGSVGElement;

      // 获取SVG的实际尺寸（包含所有内容的边界框）
      const bbox = (svg as any).getBBox();
      // 设置宽高，添加40px边距使导出更美观
      clonedSvg.setAttribute('width', String(bbox.width + 40));
      clonedSvg.setAttribute('height', String(bbox.height + 40));
      // 设置viewBox，减去20px偏移以居中内容
      clonedSvg.setAttribute('viewBox', `${bbox.x - 20} ${bbox.y - 20} ${bbox.width + 40} ${bbox.height + 40}`);

      // 内联样式到SVG中，确保导出的文件样式正确
      const styles = this._getMarkmapStyles();
      const styleElement = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      styleElement.textContent = styles;
      clonedSvg.insertBefore(styleElement, clonedSvg.firstChild);

      // 执行下载
      await this._downloadSvg(clonedSvg);
    } catch (error) {
      logger(`导出失败: ${error.message}`, 'error', error);
    }
  }

  /**
   * 获取思维导图的CSS样式
   * 这些样式会被内联到导出的SVG文件中
   * @returns CSS样式字符串
   */
  private _getMarkmapStyles(): string {
    return `
      .markmap-node circle { cursor: pointer; }
      .markmap-node text { fill: #000; font: 300 16px/20px sans-serif; }
      .markmap-node > g { cursor: pointer; }
      .markmap-link { fill: none; }
    `;
  }

  /**
   * 下载SVG文件到文件系统
   *
   * 保存策略：
   * 1. 优先使用用户在设置中配置的导出目录
   * 2. 如果未配置，则保存到当前文档所在目录
   * 3. 如果都不可用，保存到/tmp目录
   *
   * macOS实现：使用bridge.callHandler执行shell命令写入文件
   * 其他平台：降级到浏览器下载
   *
   * @param svg 要保存的SVG元素
   */
  private async _downloadSvg(svg: SVGSVGElement) {
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);

    // 确定保存目录：优先使用设置中的导出目录
    const exportDir = this.options.exportDirectory;
    const currentPath = (File as any).filePath || '';
    const defaultDir = typeof currentPath === 'string' && currentPath.includes('/')
      ? currentPath.substring(0, currentPath.lastIndexOf('/'))
      : '/tmp';
    const saveDir = exportDir || defaultDir;
    const savePath = `${saveDir}/markmap.svg`;

    // 使用bridge写入文件（macOS特有）
    if ((window as any).bridge) {
      // 转义单引号以避免shell命令注入
      (window as any).bridge.callHandler('controller.runCommand', {
        args: `echo '${svgString.replace(/'/g, "'\\''")}' > '${savePath}'`,
        cwd: saveDir
      }, (result: any) => {
        if (result[0]) {
          logger(`✅ SVG已保存: ${savePath}`);
        } else {
          logger(`保存失败: ${result[2]}`, 'error');
        }
      });
    } else {
      // 降级到浏览器下载（非macOS平台）
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      await this._triggerDownload(blob, 'markmap.svg');
      logger(`✅ SVG已下载到浏览器下载目录`);
    }
  }

  /**
   * 触发浏览器文件下载（降级方案）
   *
   * 当bridge API不可用时使用此方法
   * 通过创建临时<a>标签并模拟点击来触发下载
   *
   * @param blob 要下载的文件数据
   * @param filename 文件名
   * @returns Promise，在下载开始后resolve
   */
  private async _triggerDownload(blob: Blob, filename: string): Promise<void> {
    return new Promise((resolve) => {
      // 创建临时URL
      const url = URL.createObjectURL(blob);
      // 创建隐藏的下载链接
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);

      // 触发下载
      a.click();

      // 延迟清理，确保下载已开始
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        resolve();
      }, 100);
    });
  }

  /**
   * 切换侧边栏嵌入模式
   *
   * 功能说明：
   * - 嵌入模式：窗口固定在侧边栏位置，尺寸跟随侧边栏变化
   * - 悬浮模式：窗口可自由拖动和调整大小
   *
   * 实现细节：
   * 1. 切换 CSS 类名
   * 2. 更新内部状态标志
   * 3. 更新拖动设置（根据用户配置决定是否允许拖动）
   * 4. 调整窗口位置和尺寸
   * 5. 设置或移除 ResizeObserver（监听侧边栏尺寸变化）
   */
  private _toggleEmbed() {
    if (!this.state.element) return;

    const sidebar = document.getElementById('typora-sidebar');
    if (!sidebar) return;

    // 切换嵌入状态
    this.state.element.classList.toggle('sidebar-embedded');
    this.state.isEmbedded = this.state.element.classList.contains('sidebar-embedded');

    // 更新拖动设置（根据嵌入状态和用户设置）
    this._updateInteractSettings();

    const embedBtn = this.state.element.querySelector('[data-action="dock-left"]') as HTMLElement;

    if (this.state.isEmbedded) {
      // 进入嵌入模式
      const rect = sidebar.getBoundingClientRect();
      // 设置窗口位置和尺寸与侧边栏一致
      this.state.element.style.top = `${rect.top}px`;
      this.state.element.style.left = `${rect.left}px`;
      this.state.element.style.width = `${rect.width}px`;
      this.state.element.style.height = `${rect.height}px`;
      // 更新按钮图标和提示
      if (embedBtn) {
        embedBtn.innerHTML = '🔗';
        embedBtn.title = '取消嵌入';
      }

      // 监听侧边栏尺寸变化，实时同步窗口尺寸
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
      // 退出嵌入模式，恢复悬浮状态
      // 恢复用户设置的默认尺寸
      this.state.element.style.width = `${this.options.tocWindowWidth}px`;
      this.state.element.style.height = `${this.options.tocWindowHeight}px`;
      // 清除位置样式，使用 CSS 默认定位
      this.state.element.style.top = '';
      this.state.element.style.left = '';
      // 更新按钮图标和提示
      if (embedBtn) {
        embedBtn.innerHTML = '📌';
        embedBtn.title = '嵌入侧边栏';
      }
      // 停止监听侧边栏尺寸变化
      this.state.resizeObserver?.disconnect();
      this.state.resizeObserver = null;
    }
    // 注意：不自动执行适应视图，保持用户当前的缩放状态
  }

  private async _fitToView(event?: MouseEvent) {
    if (!this.state.markmap || !this.state.element) return;

    const svg = this.state.element.querySelector('.markmap-svg') as SVGElement;
    if (!svg) return;

    const isUserClick = event && event.type === 'click';

    if (isUserClick) {
      const currentElement = this._getCurrentVisibleHeading();

    logger('进入 _fitToView，开始适应视图。')
    logger(`当前标题内容:${currentElement?.textContent}`)

      if (!currentElement) {
        this.state.markmap.fit();
        return;
      }

      const path = this.state.elementToPath.get(currentElement);
      if (!path) {
        this.state.markmap.fit();
        return;
      }

      await this._ensureNodeVisible(path);
      await new Promise(resolve => setTimeout(resolve, 150));

      const targetElement = svg.querySelector(`[data-path="${path}"].markmap-node`);
      if (targetElement) {
        this._panAndZoomToNode(targetElement, currentElement);
      } else {
        this.state.markmap.fit();
      }
    } else {
      if (this.options.autoFitWhenUpdate) {
        this.state.markmap.fit();
      }
    }
  }

    /**
   * 平移并缩放视图以聚焦于指定节点
   * @param targetElement 目标 SVG 元素，用于定位和计算变换
   * @param headingObj 对应的标题对象，用于辅助计算最优缩放比例
   */
  private _panAndZoomToNode(targetElement: Element, headingObj: any) {
    if (!this.state.markmap || !this.state.element) return;

    logger('进入 _panAndZoomToNode，开始高亮和动画。');
    logger(`targetElement 结构:${ targetElement.outerHTML}`);
    const nodeSelection = select(targetElement);
    const foDivSelection = nodeSelection.select('foreignObject > div > div');
    // 高亮目标节点的文本背景
    if (!foDivSelection.empty()) {
      const originalBg = foDivSelection.style('background-color');
      const highlightColor = this.options.highlightColor;
      const duration = this.options.highlightDuration;
      logger(`高亮节点文本背景：原始颜色=${originalBg}, 高亮色=${highlightColor}, 持续时间=${duration}ms`);

      foDivSelection.transition('highlight')
        .duration(duration / 2)
        .style('background-color', highlightColor)
        .transition()
        .duration(duration / 2)
        .style('background-color', originalBg);
    } else {
      logger('在节点内未找到 foreignObject>div>div 元素进行高亮。');
    }

    const svg = this.state.element.querySelector('.markmap-svg') as SVGElement;
    if (!svg) return;

    const transform = zoomTransform(svg);
    // 计算聚焦节点时的最优缩放比例
    const scale = this._calculateOptimalScale(targetElement, headingObj, transform.k);

    const svgRect = svg.getBoundingClientRect();
    const nodeRect = targetElement.getBoundingClientRect();

    // 计算节点在 SVG 坐标系中的中心位置
    const originalNodeX =
      (nodeRect.left - svgRect.left - transform.x) / transform.k +
      nodeRect.width / (2 * transform.k);
    const originalNodeY =
      (nodeRect.top - svgRect.top - transform.y) / transform.k +
      nodeRect.height / (2 * transform.k);

    // 构造新的变换矩阵，使节点居中并应用缩放
    const newTransform = zoomIdentity
      .translate(svg.clientWidth / 2, svg.clientHeight / 2)
      .scale(scale)
      .translate(-originalNodeX, -originalNodeY);

    // 应用变换动画到 SVG 视图
    this.state.markmap.svg
      .transition()
      .duration(this.options.delayFitTransition)
      .call(this.state.markmap.zoom.transform, newTransform);

    logger(`适应视图完成，缩放比例: ${scale.toFixed(2)}`);
  }


    /**
   * 计算最优缩放比例，使节点元素的高度与文档字体大小匹配
   * @param nodeElement - 需要计算缩放比例的节点元素
   * @param headingObj - 标题对象（未使用）
   * @param currentScale - 当前缩放比例
   * @returns 计算得到的最优缩放比例，失败时返回默认值2.0
   */
  private _calculateOptimalScale(nodeElement: Element, headingObj: any, currentScale: number): number {
    try {
      // 获取文档写入区域元素
      const writeElement = document.querySelector('#write');
      if (!writeElement) return 2.0;

      // 获取文档段落元素或写入区域元素的字体大小
      const paragraph = writeElement.querySelector('p') || writeElement;
      const documentFontSize = window.getComputedStyle(paragraph).fontSize;
      const documentSize = parseFloat(documentFontSize);

      // 计算节点元素在当前缩放比例下的实际高度
      const nodeRect = nodeElement.getBoundingClientRect();
      const nodeHeight = nodeRect.height;

      // 基于文档字体大小计算最优缩放比例
      const nodeHeightAtScale1 = nodeHeight / currentScale;
      const scale = documentSize / nodeHeightAtScale1;

      return scale;
    } catch (error) {
      logger(`计算缩放比例失败: ${error.message}`, 'error');
      return 2.0;
    }
  }





  /**
   * 渲染空状态提示
   *
   * 当文档中没有标题时显示提示信息
   *
   * @param svg SVG 元素
   */
  private _renderEmpty(svg: SVGElement) {
    svg.innerHTML = '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle">当前文档没有标题</text>';
  }


  // ==================== 实时更新功能 ====================

  /**
   * 初始化实时更新功能
   *
   * 策略：
   * 1. 首先尝试使用 Typora 的原生事件系统（性能最优）
   * 2. 如果失败，回退到 MutationObserver（兼容性方案）
   */
  private _initRealTimeUpdate() {
    if (!this.options.enableRealTimeUpdate) return;

    // 尝试使用 Typora 的事件系统，失败则回退到 MutationObserver
    if (!this._tryInitTyporaEventSystem()) {
      this._initMutationObserver();
    }
  }

  /**
   * 尝试初始化 Typora 事件系统
   *
   * 遍历可能的事件中心位置，寻找可用的事件监听接口
   * 优先监听 outlineUpdated 事件，其次尝试其他文档变化事件
   *
   * @returns 是否成功初始化
   */
  private _tryInitTyporaEventSystem(): boolean {
    try {
      // 可能的事件中心位置
      const possibleEventHubs = [
        (window as any).eventHub,
        (window as any).File?.eventHub,
        (window as any).typora?.eventHub,
        (window as any).editor?.eventHub
      ];

      for (const eventHub of possibleEventHubs) {
        // 检查事件中心是否可用
        if (eventHub && eventHub.addEventListener && eventHub.eventType) {
          // 优先使用 outlineUpdated 事件（最精确）
          if (eventHub.eventType.outlineUpdated) {
            eventHub.addEventListener(eventHub.eventType.outlineUpdated, () => {
              if (!this.isVisible) return;
              this._handleContentChange();
            });
            return true;
          }

          // 尝试其他可能的文档变化事件
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
   * 初始化 MutationObserver（高性能优化版本）
   *
   * 性能优化策略：
   * 1. 只监听标题元素的变化，忽略其他内容
   * 2. 使用防抖处理，避免频繁更新
   * 3. 不监听属性变化，只关注结构和文本变化
   */
  private _initMutationObserver() {
    const writeElement = document.querySelector('#write');
    if (!writeElement) return;

    this.state.contentObserver = new MutationObserver((mutations) => {
      // 只检查与标题相关的变化
      const hasHeadingChanges = mutations.some(mutation => {
        const target = mutation.target as HTMLElement;

        /**
         * 检查节点是否与标题相关
         * @param node 要检查的节点
         * @returns 是否与标题相关
         */
        const isHeadingRelated = (node: Node): boolean => {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            // 如果是文本节点，检查其父元素是否是标题
            return !!node.parentElement && !!node.parentElement.tagName.match(/^H[1-6]$/);
          }
          const element = node as HTMLElement;
          // 检查是否是标题元素
          if (element.tagName.match(/^H[1-6]$/)) return true;
          // 检查子元素中是否包含标题
          return !!element.querySelector('h1, h2, h3, h4, h5, h6');
        };

        // 只关注标题相关的变化
        if (mutation.type === 'childList') {
          // 检查新增或删除的节点是否包含标题
          const addedHasHeading = Array.from(mutation.addedNodes).some(isHeadingRelated);
          const removedHasHeading = Array.from(mutation.removedNodes).some(isHeadingRelated);
          return addedHasHeading || removedHasHeading;
        }

        if (mutation.type === 'characterData') {
          // 只关注标题内的文本变化
          return isHeadingRelated(target);
        }

        return false;
      });

      // 如果有标题相关的变化，触发防抖更新
      if (hasHeadingChanges) {
        this.debouncedUpdate();
      }
    });

    // 配置观察器：只监听必要的变化类型
    this.state.contentObserver.observe(writeElement, {
      childList: true,      // 监听子节点的添加和删除
      subtree: true,        // 监听所有后代节点
      characterData: true,  // 监听文本内容变化
    });

  }

  /**
   * 清理实时更新监听器
   *
   * 断开 MutationObserver 连接，释放资源
   */
  private _cleanupRealTimeUpdate() {
    if (this.state.contentObserver) {
      this.state.contentObserver.disconnect();
      this.state.contentObserver = null;
      logger('实时更新监听器已清理');
    }
  }

  /**
   * 处理内容变化
   *
   * 当检测到文档内容变化时调用此方法
   * 执行思维导图的更新操作
   */
  private async _handleContentChange() {
    if (!this.isVisible) return;

    try {
      await this._update();
    } catch (error) {
      logger(`处理内容变化时出错: ${error.message}`, 'error', error);
    }
  }

}
