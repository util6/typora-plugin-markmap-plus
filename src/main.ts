import { Transformer, builtInPlugins } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import { CodeblockPostProcessor, Plugin, html } from '@typora-community-plugin/core'


export default class extends Plugin {

  transformer: Transformer

  mmOfCid: Record<string, Markmap> = {}

  onload() {

    this.transformer = new Transformer([...builtInPlugins])

    this.register(
      this.app.workspace.on('file:open', () => this.reset()))

    this.registerMarkdownPostProcessor(
      CodeblockPostProcessor.from({
        lang: ['markmap', 'markdown markmap'],
        preview: async (code, pre) => {
          const svg = (pre.querySelector('.md-diagram-panel-preview svg')
            ?? html`<svg style="width: 100%; max-height: 50vh"></svg>`) as any as SVGElement

          svg.style.height = pre.offsetHeight + 'px'

          // Waiting <svg> append to DOM
          setTimeout(() => {
            const cid = pre.getAttribute('cid')!
            const mm = this.mmOfCid[cid]
              ?? (this.mmOfCid[cid] = Markmap.create(svg as SVGElement))

            const { root } = this.transformer.transform(code)
            mm.setData(root)

            mm.fit()
          })

          return svg as any
        }
      }))
  }

  onunload() {
    this.transformer = null as any
    this.reset()
  }

  reset() {
    Object.values(this.mmOfCid).forEach(v => v.destroy())
    this.mmOfCid = {}
  }
}
