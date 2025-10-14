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
import { logger } from '../utils';

// =======================================================
// 类型定义
// =======================================================

/**
 * 悬浮按钮组件配置选项
 */
export interface FloatingButtonOptions {
  /** 悬浮按钮的大小（直径） */
  floatingButtonSize: number;
  /** 悬浮按钮的自定义SVG图标 */
  floatingButtonIconSvg: string;
}

/**
 * 悬浮按钮组件默认配置
 */
export const DEFAULT_FLOATING_BUTTON_OPTIONS: FloatingButtonOptions = {
  floatingButtonSize: 48,
  floatingButtonIconSvg: `
    <svg t="1759578907796" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2106"><path d="M218.284617 899.677623s166.511177-8.320731 277.173394-9.333029c122.956069-1.1264 318.820937 9.333029 318.820938 9.333029l203.214262 22.97856s-317.478034 18.815269-522.0352 18.671908C294.821303 941.187657 2.864274 922.656183 2.864274 922.656183l215.420343-22.97856z" fill="#000000" opacity=".5" p-id="2107"></path><path d="M317.302491 95.685486c-17.79712-7.001234-32.607086-5.544229-39.046582-2.217692C247.808 109.193509 237.62944 134.9632 238.150217 164.825966c0.468114 27.01312 9.883063 56.349257 21.243612 81.1008 22.001371-37.566171 55.410103-76.358217 107.938377-102.1952a14.690011 14.690011 0 0 1-1.410195-2.194286c-13.1072-25.029486-31.545051-39.131429-48.61952-45.851794zM238.085851 269.1072a14.56128 14.56128 0 0 0 6.0416 6.249326c-10.412617 22.694766-17.086171 43.39712-21.963337 58.53184-3.273874 10.155154-5.740251 17.802971-7.984274 21.863863-10.146377 18.361783-32.513463 29.813029-59.017509 43.379565-58.719086 30.058789-137.742629 70.509714-149.190948 219.560229-10.713966 139.495131 125.5424 256.198949 254.191908 256.198948 68.783543 0 109.088183 11.18208 147.201463 21.755612 33.165897 9.201371 64.672914 17.94048 111.844206 18.449554 48.47616 0.520777 80.114834-7.364023 113.839543-15.772526 37.115611-9.251109 76.75904-19.131246 144.161646-19.131245 128.646583 0 254.314789-118.898103 238.729508-268.06272-14.736823-141.063314-85.106103-173.003337-138.623268-197.295543-25.474194-11.565349-47.133257-21.395749-57.153829-40.436297-1.117623-2.121143-2.425417-7.410834-4.327131-15.090835-3.724434-15.038171-9.716297-39.242606-20.962743-66.732617 0.236983-0.333531 0.462263-0.678766 0.672914-1.035703 16.290377-27.4432 33.34144-64.936229 36.963474-102.171794 3.695177-38.019657-6.711589-77.177417-46.954788-102.868114-15.444846-9.859657-39.324526-11.319589-62.528366-4.025783-23.952823 7.527863-48.900389 24.76032-67.490377 55.019086z" fill="#434343" p-id="2108"></path></svg>
  `
}

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

  /** 组件配置选项 */
  private options: FloatingButtonOptions;

  /**
   * 构造函数
   * @param options 组件配置选项（可选，未提供的选项使用默认值）
   * @param onClick 点击按钮时的回调函数
   */
  constructor(
    options: Partial<FloatingButtonOptions> = {},
    private onClick: () => void,
  ) {
    // 合并默认配置和用户配置
    this.options = { ...DEFAULT_FLOATING_BUTTON_OPTIONS, ...options };
    // 注入CSS样式到页面
    this._injectStyle();
  }

  /** 组件状态 */
  private state = {
    element: null as HTMLElement | null, // 按钮DOM元素
  };

  /**
   * 更新组件配置
   * @param newOptions 新的配置选项（部分或全部）
   */
  public updateOptions(newOptions: Partial<FloatingButtonOptions>) {
    // 合并新配置到当前配置
    this.options = { ...this.options, ...newOptions };
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
    const size = this.options.floatingButtonSize;
    this.state.element.style.width = `${size}px`;
    this.state.element.style.height = `${size}px`;

    // 从设置中获取SVG图标代码并直接插入
    // 让SVG直接成为flex容器的子元素，确保正确居中
    this.state.element.innerHTML = this.options.floatingButtonIconSvg;
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
