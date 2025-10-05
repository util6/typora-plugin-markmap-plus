/**
 * Typora Markmap Plus 插件主入口文件
 * 
 * 功能说明：
 * - 为 Typora 添加交互式思维导图功能
 * - 提供目录思维导图（TOC Mindmap）
 * - 支持窗口拖动和调整大小
 * - 提供悬浮按钮快速访问
 * 
 * @author util6
 * @version 1.0.3
 */

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
import { FloatingButtonComponent } from './components/FloatingButton'

/**
 * Markmap 插件主类
 * 作为父组件，负责初始化和协调子组件
 */
export default class MarkmapPlugin extends Plugin<MarkmapSettings> {

  // ==================== 核心组件 ====================
  /** TOC 思维导图组件实例 */
  private tocMindmapComponent: TocMindmapComponent;

  /** 悬浮按钮组件实例 */
  private floatingButtonComponent: FloatingButtonComponent;

  // ==================== 状态管理 ====================
  /** 标记 Markmap 资源是否已加载 */
  private resourcesLoaded = false;

  /**
   * 插件加载时的初始化方法
   * 在 Typora 启动时自动调用
   */
  async onload() {
    try {
      logger('开始加载 Markmap 插件');

      // 1. 初始化插件设置系统
      this.registerSettings(new PluginSettings(this.app, this.manifest, { version: 1 }));
      this.settings.setDefault(DEFAULT_SETTINGS);
      await this.settings.load();
      this.registerSettingTab(new MarkmapSettingTab(this.settings));

      // 2. 异步加载 Markmap 核心资源（CSS 和 JS）
      await this.initResources();

      // 3. 初始化 TOC 思维导图组件（子组件）
      const settingsObj = {} as MarkmapSettings;
      for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof MarkmapSettings>) {
        (settingsObj as any)[key] = this.settings.get(key);
      }
      this.tocMindmapComponent = new TocMindmapComponent(settingsObj);
      this.register(() => this.tocMindmapComponent.destroy()); // 注册卸载时的清理

      // 4. 初始化悬浮按钮组件
      this.floatingButtonComponent = new FloatingButtonComponent(settingsObj, () => {
        this.tocMindmapComponent.toggle();
      });
      this.floatingButtonComponent.show();
      this.register(() => this.floatingButtonComponent.destroy());

      // 5. 监听设置变化并通知子组件
      const settingsUpdateHandler = () => {
        logger('检测到设置变化，正在更新组件...');
        const newSettings = {} as MarkmapSettings;
        for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof MarkmapSettings>) {
          (newSettings as any)[key] = this.settings.get(key);
        }
        this.tocMindmapComponent.updateSettings(newSettings);
        this.floatingButtonComponent.updateSettings(newSettings);
      };

      for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof MarkmapSettings>) {
        this.register(this.settings.onChange(key, settingsUpdateHandler));
      }

      logger('插件加载完成 🚀');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger(`插件初始化失败: ${errorMsg}`, 'error', error);
    }
  }

  /**
   * 初始化 markmap 所需的 CSS 和 JS 资源
   * 这些资源是渲染思维导图必需的
   */
  async initResources() {
    // 避免重复加载资源
    if (this.resourcesLoaded) return;

    logger('开始初始化 Markmap 资源');
    try {
      // 创建 Markmap 转换器，获取所需的样式和脚本
      const transformer = new Transformer(builtInPlugins);
      const { styles, scripts } = transformer.getAssets();
      
      // 异步加载 CSS 样式
      if (styles) await loadCSS(styles);
      
      // 异步加载 JavaScript 脚本
      if (scripts) await loadJS(scripts);
      
      this.resourcesLoaded = true;
      logger('Markmap 资源加载成功');
    } catch (error) {
      logger(`加载 Markmap 资源失败: ${error.message}`, 'error', error);
      throw error; // 抛出错误，由 onload 的 catch 统一处理
    }
  }

  /**
   * 插件卸载时的清理方法
   * 在 Typora 关闭或插件被禁用时调用
   */
  onunload() {
    logger('Markmap 插件已卸载');
    // this.register 中注册的清理函数会自动执行
    // 包括 this.tocMindmapComponent.destroy()
  }
}
