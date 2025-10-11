/**
 * Typora Markmap Plus 插件 - 悬浮按钮组件
 *
 * 功能说明：
 * - 创建一个可拖动的悬浮按钮，默认位置在右下角
 * - 按钮大小和图标可通过设置自定义
 * - 点击按钮时触发回调函数（显示/隐藏思维导图）
 * - 支持拖拽移动，但不保存位置（重启后回到默认位置）
 *
 * @author util6
 * @version 1.0.6
 */

import interact from 'interactjs';
import { MarkmapSettings } from '../settings';
import { logger } from '../utils';

// =======================================================
// 样式定义 - 悬浮按钮的CSS样式
// =======================================================
const COMPONENT_STYLE = `
  .markmap-floating-button {
    /* 固定定位，默认在右下角 */
    position: fixed;
    right: 20px;
    bottom: 20px;

    /* 按钮尺寸（会被JS动态覆盖） */
    width: 48px;
    height: 48px;

    /* 按钮外观 */
    background-color: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 50%;

    /* 内容居中 */
    display: flex;
    align-items: center;
    justify-content: center;

    /* 交互样式 */
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 9998;
    transition: background-color 0.2s;
    user-select: none;
  }

  /* SVG图标样式 */
  .markmap-floating-button svg {
    width: 60%;
    height: 60%;
    max-width: 100%;
    max-height: 100%;
  }

  /* 悬停效果 */
  .markmap-floating-button:hover {
    background-color: #f5f5f5;
  }
`;

// =======================================================
// 悬浮按钮组件类
// =======================================================
export class FloatingButtonComponent {

  /**
   * 构造函数
   * @param settings 插件设置实例，用于获取按钮配置
   * @param onClick 点击按钮时的回调函数
   */
  constructor(
    private settings: MarkmapSettings,
    private onClick: () => void,
  ) {
    // 注入CSS样式到页面
    this._injectStyle();
  }

  /** 组件状态 */
  private state = {
    element: null as HTMLElement | null, // 按钮DOM元素
  };

  /**
   * 更新组件设置
   * @param newSettings 新的设置对象
   */
  public updateSettings(newSettings: MarkmapSettings) {
    this.settings = newSettings;
    this.render();
  }

  /**
   * 显示悬浮按钮
   * 创建按钮元素并设置所有必要的功能
   */
  public show = () => {
    // 如果按钮已存在，直接返回
    if (this.state.element) return;

    logger('初始化悬浮按钮');

    // 创建按钮DOM元素
    this._createElement();

    // 绑定事件监听器（点击事件）
    this._attachEventListeners();

    // 设置拖拽功能
    this._setupInteractJS();
  }

  /**
   * 隐藏悬浮按钮
   * 清理所有资源和事件监听器
   */
  public hide = () => {
    if (!this.state.element) return;

    // 清理拖拽功能
    interact(this.state.element).unset();

    // 移除DOM元素
    this.state.element?.remove();
    this.state.element = null;
  }

  /**
   * 销毁组件
   * 隐藏按钮并移除注入的CSS样式
   */
  public destroy = () => {
    this.hide();
    // 移除注入的CSS样式
    document.getElementById('markmap-floating-button-style')?.remove();
  }

  /**
   * 根据设置重新渲染按钮
   * 更新按钮的大小和SVG图标
   */
  private render = () => {
    if (!this.state.element) return;

    // 从设置中获取按钮大小并应用
    const size = this.settings.floatingButtonSize;
    this.state.element.style.width = `${size}px`;
    this.state.element.style.height = `${size}px`;

    // 从设置中获取SVG图标代码并直接插入
    // 让SVG直接成为flex容器的子元素，确保正确居中
    this.state.element.innerHTML = this.settings.floatingButtonIconSvg;
  }

  /**
   * 创建按钮DOM元素
   * 设置基本属性并添加到页面中
   */
  private _createElement() {
    // 创建按钮容器
    const container = document.createElement('div');
    container.className = 'markmap-floating-button';
    container.title = '显示/隐藏目录思维导图 (Cmd+M)';

    // 添加到页面body中
    document.body.appendChild(container);
    this.state.element = container;

    // 执行初始渲染（设置大小和图标）
    this.render();
  }

  /**
   * 设置拖拽功能
   * 使用InteractJS库实现按钮的拖拽移动
   */
  private _setupInteractJS() {
    if (!this.state.element) return;

    interact(this.state.element)
      .draggable({
        listeners: {
          // 拖拽开始事件 - 修复瞬移问题
          start: (event) => {
            const target = event.target;

            // 如果还没有设置left/top，先获取当前实际位置
            if (!target.style.left || !target.style.top) {
              const rect = target.getBoundingClientRect();
              target.style.left = `${rect.left}px`;
              target.style.top = `${rect.top}px`;
              target.style.right = 'auto';
              target.style.bottom = 'auto';
            }
          },

          // 拖拽移动事件
          move: (event) => {
            const target = event.target;

            // 计算新位置
            const left = (parseFloat(target.style.left) || 0) + event.dx;
            const top = (parseFloat(target.style.top) || 0) + event.dy;

            // 应用新位置
            target.style.left = `${left}px`;
            target.style.top = `${top}px`;
          }
        }
      });
  }

  /**
   * 注入CSS样式到页面
   * 确保样式只注入一次
   */
  private _injectStyle() {
    const styleId = 'markmap-floating-button-style';

    // 如果样式已存在，直接返回
    if (document.getElementById(styleId)) return;

    // 创建style标签并注入样式
    const styleTag = document.createElement('style');
    styleTag.id = styleId;
    styleTag.textContent = COMPONENT_STYLE;
    document.head.appendChild(styleTag);
  }

  /**
   * 绑定事件监听器
   * 处理点击事件，区分拖拽和点击操作
   */
  private _attachEventListeners() {
    if (!this.state.element) return;

    // 用于区分拖拽和点击的标志
    let isDragging = false;

    // 监听拖拽开始事件
    interact(this.state.element).on('dragmove', () => {
      isDragging = true;
    });

    // 监听拖拽结束事件
    interact(this.state.element).on('dragend', () => {
      // 延迟重置标志，避免拖拽结束后立即触发点击
      setTimeout(() => { isDragging = false; }, 0);
    });

    // 监听点击事件
    this.state.element.addEventListener('click', (e) => {
      // 只有在非拖拽状态下才触发点击回调
      if (!isDragging) {
        this.onClick();
      }
    });
  }
}
