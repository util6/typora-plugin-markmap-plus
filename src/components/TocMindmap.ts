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
import { select } from 'd3-selection';
import { editor } from 'typora'
import { MarkmapSettings } from '../settings';
import { logger, debounce } from '../utils';
import interact from 'interactjs';

// ==================== 类型定义 ====================

/**
 * 标题信息类型
 * 包含标题的所有必要信息，用于生成思维导图和跳转定位
 */
type HeadingInfo = {
  /** 标题级别 (1-6) */
  level: number;
  /** 标题文本内容 */
  text: string;
  /** 标题 ID */
  id: string;
  /** 标题在文档中的索引 */
  index: number;
  /** 从根到当前节点的完整路径，用于唯一标识 */
  path: string;
  /** 标题元素引用 */
  element: HTMLElement;
};

// ==================== MARKMAP 渲染器集成 ====================

/**
 * 图片路径解析插件
 * 将 Markdown 中的相对路径图片转换为 Typora 可识别的绝对路径
 */
const resolveImagePath: ITransformPlugin = {
  name: 'resolveImagePath',
  transform(ctx) {
    // 注入自定义渲染规则到 markdown-it 解析器
    ctx.parser.tap((md: any) => {
      // 默认的 token 渲染函数
      const defaultRender = function (tokens: any, idx: number, options: any, env: any, self: any) {
        return self.renderToken(tokens, idx, options)
      }

      // 保存原始的图片渲染规则
      const defaultImageRender = md.renderer.rules.image || defaultRender

      // 重写图片渲染规则：将相对路径转换为绝对路径
      md.renderer.rules.image = (tokens: any[], idx: number, options: any, env: any, self: any): string => {
        const token = tokens[idx]

        // 获取图片的 src 属性
        const src = token.attrGet('src')
        if (src) {
          // 使用 Typora 的 API 将相对路径转换为绝对路径
          token.attrSet('src', editor.imgEdit.getRealSrc(src))
        }

        // 调用原始渲染函数完成渲染
        return defaultImageRender(tokens, idx, options, env, self)
      }

      // 保存原始的内联 HTML 渲染规则
      const defaultHtmlInlineRender = md.renderer.rules.html_inline || defaultRender

      // 重写内联 HTML 渲染规则：处理 <img> 标签中的相对路径
      md.renderer.rules.html_inline = (tokens: any[], idx: number, options: any, env: any, self: any): string => {
        const token = tokens[idx] as { content: string }

        // 检查是否是 <img> 标签
        if (token.content.startsWith('<img')) {
          // 使用正则表达式替换 src 属性中的相对路径
          token.content = token.content.replace(/ src=(["'])([^'"]+)\1/, (_, __, $relativePath) => {
            return ` src="${editor.imgEdit.getRealSrc($relativePath)}"`
          })
        }

        // 调用原始渲染函数完成渲染
        return defaultHtmlInlineRender(tokens, idx, options, env, self)
      }
    })
    return {}
  }
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

  // ==================== 常量定义 ====================

  /**
   * 延迟时间常量（单位：毫秒）
   * 用于控制各种异步操作的时间间隔
   */
  private readonly DELAYS = {
    /** DOM 属性设置延迟 - 等待 DOM 更新完成 */
    ATTRIBUTE_SET: 100,
    /** 初始适应视图延迟 - 等待初始渲染完成 */
    INITIAL_FIT: 150,
    /** 缩放过渡动画时长 */
    ZOOM_TRANSITION: 250,
    /** 适应视图过渡动画时长 */
    FIT_TRANSITION: 500,
    /** 滚动边距重置延迟 - 等待滚动动画完成 */
    SCROLL_MARGIN_RESET: 1000,
    /** 属性检查延迟 - 等待属性设置完成 */
    ATTRIBUTE_CHECK: 50,
  } as const;

  /**
   * Markmap 默认配置选项
   * 控制思维导图的视觉样式和行为
   */
  private readonly MARKMAP_OPTIONS = {
    /** 水平间距 */
    spacingHorizontal: 80,
    /** 垂直间距 */
    spacingVertical: 20,
    /** 适应视图比例 */
    fitRatio: 0.95,
    /** 内边距 */
    paddingX: 20,
    /** 节点颜色方案 */
    color: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4'] as string[],
    /** 颜色冻结层级 */
    colorFreezeLevel: 2,
  };

  /**
   * 视口偏移量（单位：像素）
   * 用于判断标题是否在视口内
   */
  private readonly VIEWPORT_OFFSET = 100;

  // ==================== 依赖注入与初始化 ====================

  /**
   * 构造函数
   *
   * 初始化组件所需的核心依赖：
   * 1. 创建 Markmap 转换器（包含内置插件和图片路径解析插件）
   * 2. 注入组件样式到页面
   * 3. 初始化高亮样式
   *
   * @param settings 插件设置对象，包含所有用户配置
   */
  constructor(
    private settings: MarkmapSettings
  ) {
    // 创建 Markmap 转换器，集成所有必要的插件
    this.transformer = new Transformer([...builtInPlugins, resolveImagePath]);
    // 将组件样式注入到页面 <head> 中
    this._injectStyle();
    // 根据用户设置初始化高亮样式
    this._updateHighlightStyle();
  }

  /**
   * 更新组件设置
   *
   * 当用户在 Typora 设置界面中修改插件配置时，主插件会调用此方法
   * 来同步更新组件的设置。这确保了设置变化能够立即生效。
   *
   * 特别重要的是 scrollOffsetTop 设置，它控制点击跳转时标题距离
   * 视窗顶部的像素距离，用户可以在设置中配置 0-500px 的值。
   *
   * @param newSettings 新的设置对象，包含所有用户配置的参数
   */
  public updateSettings(newSettings: MarkmapSettings) {
    // 直接替换当前设置对象
    this.settings = newSettings;
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
    /** 上次的 markmap 数据，用于保持节点折叠状态 */
    lastMarkmapData: null as any,
    /** 标题信息缓存，key 为路径，value 为标题信息 */
    headingsMap: new Map<string, HeadingInfo>(),
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
    this.state.headingsMap.clear();

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
    container.style.width = `${this.settings.tocWindowWidth}px`;
    container.style.height = `${this.settings.tocWindowHeight}px`;
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

    if (this.state.isEmbedded && !this.settings.allowDragWhenEmbedded) {
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

    const color = this.settings.highlightColor;
    const duration = this.settings.highlightDuration / 1000; // 转换为秒
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
          case 'export': this._showExportMenu(e as MouseEvent); break; // 显示导出菜单
        }
      } catch (error) {
        logger(`按钮操作失败: ${error.message}`, 'error', error);
      }
      return; // 处理完按钮点击后结束，避免继续处理其他点击逻辑
    }

    // 检查是否点击了思维导图节点（通过 CSS 类名识别）
    const nodeEl = target.closest('.markmap-node');
    if (nodeEl) {
      // 调用跳转方法，实现点击节点跳转到对应标题的功能
      this._scrollToHeadingByNode(nodeEl);
      return; // 处理完节点点击后结束
    }

    // 如果既不是按钮也不是节点，不执行任何操作
  }
  /**
   * 更新思维导图内容
   *
   * 核心渲染流程：
   * 1. 获取文档中的所有标题
   * 2. 计算标题哈希值，检查是否有变化
   * 3. 如果没有变化则跳过更新（性能优化）
   * 4. 将标题转换为 Markdown 格式
   * 5. 使用 Markmap 转换器生成思维导图数据
   * 6. 为节点添加路径信息（用于跳转匹配）
   * 7. 如果是首次渲染，创建 Markmap 实例
   * 8. 如果是更新，保持节点折叠状态并更新数据
   */
  private _update = async () => {
    if (!this.state.element) return;

    // 保存旧的哈希值用于比较
    const oldHash = this.state.lastHeadingsHash;
    // 获取最新的标题信息
    await this._getDocumentHeadings();
    const headings = Array.from(this.state.headingsMap.values());
    // 计算新的哈希值
    const newHash = this._getHeadingsHash(headings);

    // 如果内容没有变化，跳过更新
    if (newHash === oldHash) return;

    logger('更新 TOC Markmap');
    this.state.lastHeadingsHash = newHash;
    const svg = this.state.element.querySelector('.markmap-svg') as SVGElement;
    if (!svg) return;

    // 如果没有标题，显示空状态提示
    if (this.state.headingsMap.size === 0) {
      this._renderEmpty(svg);
      return;
    }

    // 构建 Markdown 内容
    const markdownContent = this._buildTocMarkdown(headings);
    // 转换为思维导图数据结构
    const { root } = this.transformer.transform(markdownContent);

    // 为每个节点添加路径信息，用于点击跳转时的精确匹配
    this._addNodePath(root);

    // 合并用户设置和默认选项
    const options = deriveOptions({
      ...this.MARKMAP_OPTIONS,
      initialExpandLevel: this.settings.initialExpandLevel,
      duration: this.settings.animationDuration,
    });

    if (this.state.markmap) {
      // 已存在实例，执行更新
      // 保持用户手动折叠的节点状态
      this._preserveFoldState(root);

      // 更新数据，Markmap 会自动保留当前的缩放和平移状态
      this.state.markmap.setData(root, options);
    } else {
      // 首次创建实例
      svg.innerHTML = '';
      this.state.markmap = Markmap.create(svg, options, root);
      // 延迟执行初始适应视图，等待渲染完成
      setTimeout(() => {
        this.state.markmap?.fit();
      }, this.DELAYS.INITIAL_FIT);
    }

    // 保存当前数据，用于下次更新时保持状态
    this.state.lastMarkmapData = root;
  }

  // --- 工具方法：标题处理 ---

  /**
   * 构建用于渲染思维导图的 Markdown 内容
   *
   * 将标题数组转换为 Markdown 格式
   * 例如：
   * # 第一章
   * ## 第一节
   * ### (2)项目文件
   *
   * @param headings 包含标题信息的数组
   * @returns 格式化的 Markdown 字符串
   */
  private _buildTocMarkdown(headings: HeadingInfo[]): string {
    return headings.map(h => `${'#'.repeat(h.level)} ${h.text}`).join('\n');
  }

  /**
   * 获取文档中的所有标题元素
   *
   * @returns 标题元素数组，如果文档编辑区不存在则返回空数组
   */
  private _getAllHeadingElements(): HTMLElement[] {
    const write = document.querySelector('#write');
    if (!write) return [];
    return Array.from(write.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  }

  /**
   * 获取文档中的所有标题，并为每个标题构建完整路径
   *
   * 路径格式：从根节点到当前节点的文本拼接，用换行符分隔
   * 例如：`第一章\n第一节\n(2)项目文件`
   *
   * @returns 包含标题信息和路径的数组
   */
  private async _getDocumentHeadings(): Promise<void> {
    this.state.headingsMap.clear();
    const headingElements = this._getAllHeadingElements();
    const pathStack: (string | null)[] = []; // 路径栈，用于构建层级路径，允许null表示跳过的层级

    for (let i = 0; i < headingElements.length; i++) {
      const h = headingElements[i];
      const text = h.innerText.trim();
      if (!text) continue;

      const level = parseInt(h.tagName.substring(1));

      // 调整路径栈到当前层级，保持层级跳跃时的完整性
      if (pathStack.length >= level) {
        pathStack.length = level - 1;
      } else {
        // 填充中间跳过的层级为null
        while (pathStack.length < level - 1) {
          pathStack.push(null);
        }
      }
      pathStack.push(text);

      // 构建路径时过滤掉null值
      const path = pathStack.filter(p => p !== null).join('\n');

      const headingInfo = {
        level,
        text,
        id: h.id || `heading-${i}`,
        index: i,
        path,
        element: h
      };
      this.state.headingsMap.set(path, headingInfo);
    }
  }

  /**
   * 处理思维导图节点点击跳转到对应标题
   *
   * 通过完整路径精确匹配标题，路径格式：`第一章\n第一节\n标题`
   * 即使有相同文本的标题，路径也能保证唯一性
   */
  private _scrollToHeadingByNode(nodeEl: Element) {
    // d3.js 会将节点数据绑定到 __data__ 属性上
    const nodeData = (nodeEl as any).__data__;
    const path = nodeData?.payload?.path; // 直接从数据对象读取路径

    if (!path) {
      logger('无法从节点数据中获取路径', 'warn');
      return;
    }

    const heading = this.state.headingsMap.get(path);

    if (heading) {
      logger(`跳转到标题: ${path.split('\n').join(' > ')}`);
      this._scrollToElement(heading.element);
    } else {
      logger(`\n=== 路径匹配失败 ===`);
      logger(`节点路径: "${path}"`);
      logger(`\n文档中的所有路径:`);
      this.state.headingsMap.forEach((h, p) => {
        const match = p === path ? '✓' : '✗';
        logger(`[${match}] "${p}"`);
      });
      logger(`===================\n`);
    }
  }

  /**
   * 滚动到指定元素
   *
   * @param element 目标元素
   */
  private _scrollToElement(element: HTMLElement) {
    const originalMargin = element.style.scrollMarginTop;
    element.style.scrollMarginTop = `${this.settings.scrollOffsetTop}px`;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 添加高亮效果
    element.classList.add('markmap-highlight');

    // 动画结束后移除类并恢复margin，以便下次可以重新触发
    setTimeout(() => {
      element.style.scrollMarginTop = originalMargin;
      element.classList.remove('markmap-highlight');
    }, this.settings.highlightDuration); // 持续时间应与动画时间一致
  }

  /**
   * 为思维导图节点添加完整路径信息
   *
   * 递归遍历节点树，为每个节点构建从根到当前节点的完整路径
   *
   * @param node 当前处理的节点
   * @param parentPath 父节点的路径
   */
  private _addNodePath(node: any, parentPath = ''): void {
    if (node.content) {
      // 解码 HTML 实体，确保路径与文档标题一致
      const decodedContent = this._decodeHtmlEntities(node.content);
      const currentPath = parentPath ? `${parentPath}\n${decodedContent}` : decodedContent;
      node.payload = node.payload || {};
      node.payload.path = currentPath;
    }

    if (node.children) {
      for (const child of node.children) {
        this._addNodePath(child, node.payload?.path || '');
      }
    }
  }



  /**
   * 解码 HTML 实体
   *
   * 将 HTML 实体（如 &lt; &gt; &amp;）转换为对应的字符
   *
   * @param text 包含 HTML 实体的文本
   * @returns 解码后的文本
   */
  private _decodeHtmlEntities(text: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }

  /**
   * 放大思维导图
   *
   * 使用D3的缩放功能，按照设置中的zoomStep比例放大视图
   * 带有平滑的过渡动画效果
   */
  private _zoomIn() {
    if (!this.state.markmap) return;
    // 获取缩放步长，默认0.2表示每次放大20%
    const zoomStep = this.settings.zoomStep ?? 0.2;
    this.state.markmap.svg
      .transition()
      .duration(this.DELAYS.ZOOM_TRANSITION)
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
    const zoomStep = this.settings.zoomStep ?? 0.2;
    this.state.markmap.svg
      .transition()
      .duration(this.DELAYS.ZOOM_TRANSITION)
      .call(this.state.markmap.zoom.scaleBy, 1 / (1 + zoomStep));
  }

  /**
   * 显示导出菜单
   * 直接导出SVG文件，不再显示格式选择菜单
   * @param event 鼠标点击事件
   */
  private _showExportMenu(event: MouseEvent) {
    // 直接导出SVG，不显示菜单
    this._exportMarkmap('svg');
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
    const exportDir = this.settings.exportDirectory;
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
      this.state.element.style.width = `${this.settings.tocWindowWidth}px`;
      this.state.element.style.height = `${this.settings.tocWindowHeight}px`;
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

      const currentPath = currentHeadingObj.path;
      logger(`当前可见标题: ${currentPath.split('\n').join(' > ')}`);

      const targetElement = this._findNodeByPath(currentPath);

      if (targetElement) {
        logger('找到目标节点，准备平移、缩放和高亮。');
        this._panAndZoomToNode(targetElement, currentHeadingObj);
      } else {
        logger('未在思维导图中找到匹配的节点，使用默认适应视图。');
        this.state.markmap.fit();
      }
    } else {
      // 如果不是用户主动点击，则根据设置决定是否执行 fit
      if (this.settings.autoFitWhenUpdate) {
        logger('根据设置自动适应视图。');
        this.state.markmap.fit();
      } else {
        logger('非用户主动操作，且未开启自动适应，跳过适应视图');
      }
    }
  }

  /**
   * 平移并缩放视图以聚焦于指定节点
   * @param targetElement 目标 SVG 元素
   * @param headingObj 对应的标题对象
   */
  private _panAndZoomToNode(targetElement: Element, headingObj: any) {
    if (!this.state.markmap || !this.state.element) return;

    logger('进入 _panAndZoomToNode，开始高亮和动画。');
    // 添加节点高亮效果
    const nodeSelection = select(targetElement);
    // 尝试高亮 foreignObject 内部的 div，效果更好
    const foDivSelection = nodeSelection.select('foreignObject > div > div');
    if (!foDivSelection.empty()) {
      const originalBg = foDivSelection.style('background-color');
      const highlightColor = this.settings.highlightColor;
      const duration = this.settings.highlightDuration;
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
    const scale = this._calculateOptimalScale(targetElement, headingObj, transform.k);

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
      .duration(this.DELAYS.FIT_TRANSITION)
      .call(this.state.markmap.zoom.transform, newTransform);

    logger(`适应视图完成，缩放比例: ${scale.toFixed(2)}`);
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

      return scale;
    } catch (error) {
      logger(`计算缩放比例失败: ${error.message}`, 'error');
      return 2.0;
    }
  }

  /**
   * 获取当前视口中可见的标题
   *
   * 优先返回视口内的第一个标题，如果没有则返回距离视口最近的标题
   *
   * @returns 标题信息对象，包含文本、层级、元素、索引和路径
   */
  private _getCurrentVisibleHeading() {
    const headings = this._getAllHeadingElements();
    if (headings.length === 0) return null;

    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;

    // 用于构建路径
    const pathStack: string[] = [];

    let closestHeading = null;
    let minDistance = Infinity;
    let validIndex = 0;

    for (const heading of headings) {
      const text = heading.textContent?.trim() || '';
      if (!text) continue;

      const level = parseInt(heading.tagName.substring(1));

      // 构建路径
      pathStack.length = level - 1;
      pathStack.push(text);
      const path = pathStack.join('\n');

      const rect = heading.getBoundingClientRect();
      const elementTop = rect.top + window.scrollY;

      // 优先选择在视口内的第一个标题
      if (elementTop >= viewportTop - this.VIEWPORT_OFFSET && elementTop <= viewportBottom) {
        return {
          text,
          level,
          element: heading,
          index: validIndex,
          path,
        };
      }

      // 如果不在视口内，则计算与视口顶部的距离，用于后续备选
      const distance = Math.abs(elementTop - viewportTop);
      if (distance < minDistance) {
        minDistance = distance;
        closestHeading = {
          text,
          level,
          element: heading,
          index: validIndex,
          path,
        };
      }

      validIndex++;
    }

    return closestHeading;
  }

  /**
   * 根据路径查找 SVG 节点
   * @param path 节点的完整路径
   * @returns 匹配的 SVG 元素，如果未找到则返回 null
   */
  private _findNodeByPath(path: string): Element | null {
    if (!this.state.element) return null;
    const svg = this.state.element.querySelector('.markmap-svg') as SVGElement;
    if (!svg) return null;

    const nodeElements = svg.querySelectorAll('g.markmap-node');
    for (const nodeEl of Array.from(nodeElements)) {
      const nodeData = (nodeEl as any).__data__;
      const nodePath = nodeData?.payload?.path;
      if (nodePath === path) {
        return nodeEl;
      }
    }
    return null;
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
    if (!this.settings.enableRealTimeUpdate) return;

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

    logger('MutationObserver 已启动（优化模式：仅监听标题变化）');
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

  /**
   * 生成标题数组的哈希值
   *
   * 用于检测标题内容是否发生变化，避免不必要的重新渲染
   * 哈希值包含：层级、文本内容、索引和路径
   *
   * @param headings 标题数组
   * @returns 哈希字符串
   */
  private _getHeadingsHash(headings: HeadingInfo[]): string {
    return headings.map(h => `${h.index}:${h.path}`).join('|');
  }

  /**
   * 保持节点的折叠状态
   * 基于节点路径匹配来恢复之前的折叠状态
   */
  private _preserveFoldState(newRoot: any) {
    if (!this.settings.keepFoldStateWhenUpdate || !this.state.lastMarkmapData) return;

    const foldedPaths = new Set<string>();

    // 简单的递归遍历函数，用于收集路径
    const collectFoldedPaths = (node: any) => {
      if (node.payload?.fold && node.payload?.path) {
        foldedPaths.add(node.payload.path);
      }
      if (node.children) {
        for (const child of node.children) {
          collectFoldedPaths(child);
        }
      }
    };

    // 从旧数据中收集折叠节点的路径
    collectFoldedPaths(this.state.lastMarkmapData);

    if (foldedPaths.size === 0) return; // 如果没有需要恢复的折叠状态，则提前退出

    // 简单的递归遍历函数，用于应用状态
    const applyFoldState = (node: any) => {
      if (node.payload?.path && foldedPaths.has(node.payload.path)) {
        node.payload.fold = 1;
      }
      if (node.children) {
        for (const child of node.children) {
          applyFoldState(child);
        }
      }
    };

    // 在新数据上恢复折叠状态
    applyFoldState(newRoot);

    logger(`恢复了 ${foldedPaths.size} 个节点的折叠状态`);
  }
}
