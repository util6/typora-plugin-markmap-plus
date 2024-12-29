import { SettingTab } from "@typora-community-plugin/core"
import type MarkmapPlugin from "./main"


export class MarkmapSettingTab extends SettingTab {

  get name() {
    return 'MarkMap'
  }

  constructor(private plugin: MarkmapPlugin) {
    super()

    this.render()
  }

  render() {
    const { plugin } = this
    const { t } = this.plugin.i18n

    this.addSetting(setting => {
      setting.addName(t.globalOptions)
      setting.addTextArea(el=> {
        el.value = plugin.settings.get('globalOptions')
        el.onchange = () => {
          plugin.settings.set('globalOptions', el.value)
        }
      })
    })
  }
}
