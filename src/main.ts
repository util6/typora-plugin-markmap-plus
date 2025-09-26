// 导入 Typora 插件核心库
import { Plugin, PluginSettings } from '@typora-community-plugin/core'
// 导入 markmap 核心库
import { Transformer, builtInPlugins } from 'markmap-lib'
import { loadCSS, loadJS } from 'markmap-view'
// 导入日志和设置
import { logger } from './utils'
import { MarkmapSettings, DEFAULT_SETTINGS, MarkmapSettingTab } from './settings'
// 导入我们新建的组件
import { TocMindmapComponent } from './components/TocMindmap'



/**
 * Markmap 插件主类
 * 现在作为父组件，负责初始化和协调子组件
 */
export default class MarkmapPlugin extends Plugin<MarkmapSettings> {

  // ==================== 核心组件 ====================
  private transformer: Transformer;
  private tocMindmapComponent: TocMindmapComponent;

  // ==================== 界面元素 ====================
  private floatingButton?: HTMLElement;

  // ==================== 状态管理 ====================
  private resourcesLoaded = false;

  /**
   * 插件加载时的初始化方法
   */
  async onload() {
    try {
      logger('开始加载 Markmap 插件');

      // 1. 初始化设置
      this.registerSettings(new PluginSettings(this.app, this.manifest, { version: 1 }));
      this.settings.setDefault(DEFAULT_SETTINGS);
      this.settings.load();
      this.registerSettingTab(new MarkmapSettingTab(this.settings));

      // 2. 初始化核心转换器
      this.transformer = new Transformer(builtInPlugins);

      // 3. 异步加载 Markmap 核心资源
      await this.initResources();

      // 4. 初始化 TOC 思维导图组件 (子组件)
      this.tocMindmapComponent = new TocMindmapComponent(this.settings, this.transformer);
      this.register(() => this.tocMindmapComponent.destroy()); // 注册卸载时的清理

      // 5. 初始化悬浮按钮 (父组件的 UI)
      this.initFloatingButton();

      logger('插件加载完成 🚀');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger(`插件初始化失败: ${errorMsg}`, 'error', error);
    }
  }

  /**
   * 初始化 markmap 所需的 CSS 和 JS 资源
   */
  async initResources() {
    if (this.resourcesLoaded) return;

    logger('开始初始化 Markmap 资源');
    try {
      const { styles, scripts } = this.transformer.getAssets();
      if (styles) await loadCSS(styles);
      if (scripts) await loadJS(scripts);
      this.resourcesLoaded = true;
      logger('Markmap 资源加载成功');
    } catch (error) {
      logger(`加载 Markmap 资源失败: ${error.message}`, 'error', error);
      throw error; // 抛出错误，由 onload 的 catch 统一处理
    }
  }

  /**
   * 初始化右下角悬浮按钮
   */
  initFloatingButton() {
    logger('初始化悬浮按钮');

    // 创建悬浮按钮元素
    this.floatingButton = document.createElement('div');
    this.floatingButton.className = 'markmap-floating-button';
    this.floatingButton.title = '显示/隐藏目录思维导图 (Cmd+M)';
    this.floatingButton.innerHTML = `<span style="font-size: 20px;">🗺️</span>`;

    // 点击按钮时，调用子组件的 toggle 方法
    this.floatingButton.addEventListener('click', () => {
      this.tocMindmapComponent.toggle();
    });

    document.body.appendChild(this.floatingButton);

    // 注入按钮所需的样式
    const style = document.createElement('style');
    style.id = 'markmap-plugin-styles';
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
    `;
    if (!document.getElementById(style.id)) {
      document.head.appendChild(style);
    }

    // 注册清理函数，插件卸载时移除元素和样式
    this.register(() => {
      this.floatingButton?.remove();
      style.remove();
    });
  }

  /**
   * 插件卸载时的清理方法
   */
  onunload() {
    logger('Markmap 插件已卸载');
    // this.register 中注册的清理函数会自动执行
    // 包括 this.tocMindmapComponent.destroy()
  }
}
