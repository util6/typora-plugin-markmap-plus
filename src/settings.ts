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
}

/**
 * 设置项的约束条件
 * 定义每个设置项的最小值、最大值和默认值
 */
export const SETTING_CONSTRAINTS = {
  tocWindowWidth: { min: 200, max: 1200, default: 450 },
  tocWindowHeight: { min: 200, max: 800, default: 600 },
  initialExpandLevel: { min: 1, max: 6, default: 3 },
  zoomStep: { min: 0.1, max: 1.0, default: 0.2 }
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
  enableRealTimeUpdate: true
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
  }
}
