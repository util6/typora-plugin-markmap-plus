import { SettingTab } from '@typora-community-plugin/core'
import type { PluginSettings } from '@typora-community-plugin/core'

export interface MarkmapSettings {
  tocWindowWidth: number
  tocWindowHeight: number
  initialExpandLevel: number
  zoomStep: number
}

export const SETTING_CONSTRAINTS = {
  tocWindowWidth: { min: 200, max: 1200, default: 450 },
  tocWindowHeight: { min: 200, max: 800, default: 600 },
  initialExpandLevel: { min: 1, max: 6, default: 3 },
  zoomStep: { min: 0.1, max: 1.0, default: 0.2 }
}

export const DEFAULT_SETTINGS: MarkmapSettings = {
  tocWindowWidth: SETTING_CONSTRAINTS.tocWindowWidth.default,
  tocWindowHeight: SETTING_CONSTRAINTS.tocWindowHeight.default,
  initialExpandLevel: SETTING_CONSTRAINTS.initialExpandLevel.default,
  zoomStep: SETTING_CONSTRAINTS.zoomStep.default
}

export class MarkmapSettingTab extends SettingTab {
  private settings: PluginSettings<MarkmapSettings>

  constructor(settings: PluginSettings<MarkmapSettings>) {
    super()
    this.settings = settings
  }

  get name(): string {
    return 'Markmap'
  }

  onshow(): void {
    this.addSetting(item => {
      item.addName('窗口宽度')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.tocWindowWidth
        input.value = this.settings.get('tocWindowWidth').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        input.onchange = () => this.settings.set('tocWindowWidth', parseInt(input.value) || config.default)
      })
    })

    this.addSetting(item => {
      item.addName('窗口高度')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.tocWindowHeight
        input.value = this.settings.get('tocWindowHeight').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        input.onchange = () => this.settings.set('tocWindowHeight', parseInt(input.value) || config.default)
      })
    })

    this.addSetting(item => {
      item.addName('默认展开层级')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.initialExpandLevel
        input.value = this.settings.get('initialExpandLevel').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        input.onchange = () => {
          const value = parseInt(input.value)
          if (value >= config.min && value <= config.max) {
            this.settings.set('initialExpandLevel', value)
          }
        }
      })
    })

    this.addSetting(item => {
      item.addName('缩放步长')
      item.addDescription('放大和缩小的单次比例')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.zoomStep
        input.value = this.settings.get('zoomStep').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        input.step = '0.1'
        input.onchange = () => {
          const value = parseFloat(input.value)
          if (value >= config.min && value <= config.max) {
            this.settings.set('zoomStep', value)
          }
        }
      })
    })
  }
}
