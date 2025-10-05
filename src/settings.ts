/**
 * Typora Markmap Plus 插件设置模块
 *
 * 功能说明：
 * - 定义插件的所有配置项
 * - 提供设置界面的构建逻辑
 * - 管理默认值和约束条件
 *
 * @author util6
 * @version 1.0.3
 */

import { SettingTab } from '@typora-community-plugin/core'
import type { PluginSettings } from '@typora-community-plugin/core'

/**
 * 插件设置项的类型定义
 * 定义了所有可配置的选项及其类型
 */
export interface MarkmapSettings {
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

  /** 悬浮按钮的大小（直径） */
  floatingButtonSize: number;


  /** 悬浮按钮的自定义SVG图标 */
  floatingButtonIconSvg: string;
}

/**
 * 设置项的约束条件
 * 定义每个设置项的最小值、最大值和默认值
 */
export const SETTING_CONSTRAINTS = {
  tocWindowWidth: { min: 200, max: 1200, default: 450 },
  tocWindowHeight: { min: 200, max: 800, default: 600 },
  initialExpandLevel: { min: 1, max: 6, default: 3 },
  zoomStep: { min: 0.1, max: 1.0, default: 0.2 },
  floatingButtonSize: { min: 30, max: 100, default: 48 },
}

/**
 * 插件设置的默认值
 * 当用户首次安装插件或重置设置时使用
 */
export const DEFAULT_SETTINGS: MarkmapSettings = {
  tocWindowWidth: SETTING_CONSTRAINTS.tocWindowWidth.default,
  tocWindowHeight: SETTING_CONSTRAINTS.tocWindowHeight.default,
  initialExpandLevel: SETTING_CONSTRAINTS.initialExpandLevel.default,
  zoomStep: SETTING_CONSTRAINTS.zoomStep.default,
  enableRealTimeUpdate: true,
  floatingButtonSize: SETTING_CONSTRAINTS.floatingButtonSize.default,
  floatingButtonIconSvg: `
                           <svg t="1759578907796" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2106"><path d="M218.284617 899.677623s166.511177-8.320731 277.173394-9.333029c122.956069-1.1264 318.820937 9.333029 318.820938 9.333029l203.214262 22.97856s-317.478034 18.815269-522.0352 18.671908C294.821303 941.187657 2.864274 922.656183 2.864274 922.656183l215.420343-22.97856z" fill="#000000" opacity=".5" p-id="2107"></path><path d="M317.302491 95.685486c-17.79712-7.001234-32.607086-5.544229-39.046582-2.217692C247.808 109.193509 237.62944 134.9632 238.150217 164.825966c0.468114 27.01312 9.883063 56.349257 21.243612 81.1008 22.001371-37.566171 55.410103-76.358217 107.938377-102.1952a14.690011 14.690011 0 0 1-1.410195-2.194286c-13.1072-25.029486-31.545051-39.131429-48.61952-45.851794zM238.085851 269.1072a14.56128 14.56128 0 0 0 6.0416 6.249326c-10.412617 22.694766-17.086171 43.39712-21.963337 58.53184-3.273874 10.155154-5.740251 17.802971-7.984274 21.863863-10.146377 18.361783-32.513463 29.813029-59.017509 43.379565-58.719086 30.058789-137.742629 70.509714-149.190948 219.560229-10.713966 139.495131 125.5424 256.198949 254.191908 256.198948 68.783543 0 109.088183 11.18208 147.201463 21.755612 33.165897 9.201371 64.672914 17.94048 111.844206 18.449554 48.47616 0.520777 80.114834-7.364023 113.839543-15.772526 37.115611-9.251109 76.75904-19.131246 144.161646-19.131245 128.646583 0 254.314789-118.898103 238.729508-268.06272-14.736823-141.063314-85.106103-173.003337-138.623268-197.295543-25.474194-11.565349-47.133257-21.395749-57.153829-40.436297-1.117623-2.121143-2.425417-7.410834-4.327131-15.090835-3.724434-15.038171-9.716297-39.242606-20.962743-66.732617 0.236983-0.333531 0.462263-0.678766 0.672914-1.035703 16.290377-27.4432 33.34144-64.936229 36.963474-102.171794 3.695177-38.019657-6.711589-77.177417-46.954788-102.868114-15.444846-9.859657-39.324526-11.319589-62.528366-4.025783-23.952823 7.527863-48.900389 24.76032-67.490377 55.019086z" fill="#434343" p-id="2108"></path></svg>
                        `
}

/**
 * 插件设置页面类
 * 负责在 Typora 的设置界面中显示插件的配置选项
 */
export class MarkmapSettingTab extends SettingTab {
  /** 插件设置实例 */
  private settings: PluginSettings<MarkmapSettings>

  /**
   * 构造函数
   * @param settings 插件设置实例
   */
  constructor(settings: PluginSettings<MarkmapSettings>) {
    super()
    this.settings = settings
  }

  /**
   * 获取设置页面的显示名称
   * 在 Typora 设置界面的侧边栏中显示
   */
  get name(): string {
    return 'Markmap'
  }

  /**
   * 显示设置页面内容
   * 当用户点击设置页面时调用此方法
   */
  onshow(): void {
    // 窗口宽度设置
    this.addSetting(item => {
      item.addName('窗口宽度')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.tocWindowWidth
        input.value = this.settings.get('tocWindowWidth').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        // 当用户修改值时，保存到设置中
        input.onchange = () => this.settings.set('tocWindowWidth', parseInt(input.value) || config.default)
      })
    })

    // 窗口高度设置
    this.addSetting(item => {
      item.addName('窗口高度')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.tocWindowHeight
        input.value = this.settings.get('tocWindowHeight').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        // 当用户修改值时，保存到设置中
        input.onchange = () => this.settings.set('tocWindowHeight', parseInt(input.value) || config.default)
      })
    })

    // 默认展开层级设置
    this.addSetting(item => {
      item.addName('默认展开层级')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.initialExpandLevel
        input.value = this.settings.get('initialExpandLevel').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        // 验证输入值的有效性
        input.onchange = () => {
          const value = parseInt(input.value)
          if (value >= config.min && value <= config.max) {
            this.settings.set('initialExpandLevel', value)
          }
        }
      })
    })

    // 缩放步长设置
    this.addSetting(item => {
      item.addName('缩放步长')
      item.addDescription('放大和缩小的单次比例')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.zoomStep
        input.value = this.settings.get('zoomStep').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        input.step = '0.1' // 设置步长为 0.1
        // 验证输入值的有效性
        input.onchange = () => {
          const value = parseFloat(input.value)
          if (value >= config.min && value <= config.max) {
            this.settings.set('zoomStep', value)
          }
        }
      })
    })

    // 实时更新开关设置
    this.addSetting(item => {
      item.addName('实时更新')
      item.addDescription('编辑文档时自动更新思维导图')
      item.addCheckbox((checkbox) => {
        checkbox.checked = this.settings.get('enableRealTimeUpdate')
        // 当用户切换开关时，保存到设置中
        checkbox.onchange = () => this.settings.set('enableRealTimeUpdate', checkbox.checked)
      })
    })

    // 悬浮按钮大小设置
    this.addSetting(item => {
      item.addName('悬浮按钮大小')
      item.addDescription('设置悬浮按钮的直径大小（像素）')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.floatingButtonSize
        input.value = this.settings.get('floatingButtonSize').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        // 当用户修改值时，保存到设置中
        input.onchange = () => {
          const newSize = parseInt(input.value) || config.default
          this.settings.set('floatingButtonSize', newSize)
        }
      })
    })

    // 自定义悬浮按钮SVG图标
    this.addSetting(item => {
      item.addName('悬浮按钮图标')
      item.addDescription('为悬浮按钮提供自定义的SVG代码。')
      item.addTextArea((textarea: HTMLTextAreaElement) => {
        textarea.value = this.settings.get('floatingButtonIconSvg')
        textarea.onchange = () => {
          this.settings.set('floatingButtonIconSvg', textarea.value)
        }
      })
    })
  }
}
