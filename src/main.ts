import { Transformer, builtInPlugins } from 'markmap-lib'
import { deriveOptions, Markmap } from 'markmap-view'
import * as yaml from 'js-yaml'
import { CodeblockPostProcessor, path, Plugin, PluginSettings, html } from '@typora-community-plugin/core'
import { i18n } from './i18n'
import { MarkmapSettingTab } from './setting-tab'


interface MarkmapSettings {
  globalOptions: string
}

const DEFAULT_SETTINGS: MarkmapSettings = {
  globalOptions: '',
}

const RE_FRONT_MATTER = /^---\s*\n([\s\S]+?)\n---\s*\n?/

export default class extends Plugin<MarkmapSettings> {

  i18n = i18n

  transformer: Transformer

  mmOfCid: Record<string, Markmap> = {}

  onload() {

    this.registerCss('./katex.min.css')

    this.registerSettings(
      new PluginSettings(this.app, this.manifest, {
        version: 1,
      }))

    this.settings.setDefault(DEFAULT_SETTINGS)

    this.registerSettingTab(new MarkmapSettingTab(this))

    this.transformer = new Transformer([...builtInPlugins])

    this.register(
      this.app.workspace.on('file:open', () => this.reset()))

    this.registerMarkdownPostProcessor(
      CodeblockPostProcessor.from({
        lang: ['markmap', 'markdown markmap'],
        preview: async (code, pre) => {
          const { frontMatter, content } = parseMarkdown(code)

          const svg = (pre.querySelector('.md-diagram-panel-preview svg')
            ?? html`<svg style="width: 100%; max-height: 50vh"></svg>`) as any as SVGElement

          svg.style.height = pre.offsetHeight + 'px'

          // Waiting <svg> append to DOM
          setTimeout(() => {
            const cid = pre.getAttribute('cid')!
            const mm = this.mmOfCid[cid]
              ?? (this.mmOfCid[cid] = Markmap.create(svg as SVGElement))

            const globalOpts = yaml.load(this.settings.get('globalOptions')) ?? {}
            const localOpts = yaml.load(frontMatter) ?? {}
            const jsonOpts = { ...globalOpts, ...localOpts }
            const opts = deriveOptions(jsonOpts)
            mm.setOptions(opts)

            const { root } = this.transformer.transform(content)
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

  registerCss(url: string) {
    this.register(this.importCss(url))
  }

  importCss(url: string) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.dataset.by = this.manifest.id
    link.href = 'file://' + path.join(this.manifest.dir!, url)
    document.head.appendChild(link)
    return () => link.remove()
  }

  reset() {
    Object.values(this.mmOfCid).forEach(v => v.destroy())
    this.mmOfCid = {}
  }
}

function parseMarkdown(md: string) {
  let frontMatter = ''

  const content = md
    .replace(RE_FRONT_MATTER, (_, $1) => {
      frontMatter = $1
      return ''
    })

  return { frontMatter, content }
}
