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
    this.registerScript('./katex.min.js')

    this.registerSettings(
      new PluginSettings(this.app, this.manifest, {
        version: 1,
      }))

    this.settings.setDefault(DEFAULT_SETTINGS)

    this.registerSettingTab(new MarkmapSettingTab(this))

    this.transformer = new Transformer([...builtInPlugins])

    this.register(
      this.app.workspace.on('file:open', () => this.reset()))

    this.registerCommand({
      id: 'insert-markmap-template',
      name: this.i18n.t('command.insert-markmap-template.name'),
      callback: () => {
        const editor = this.app.workspace.activeEditor
        if (!editor) return

        const template =
`\`\`\`markmap
---
height: 300px
backgroundColor: "#f8f8f8"
---

# markmap

- branch 1
  - sub-branch 1.1
  - sub-branch 1.2
- branch 2
\`\`\``
        editor.replaceSelection(template)
      }
    })

    this.registerMarkdownPostProcessor(
      CodeblockPostProcessor.from({
        lang: ['markmap', 'markdown markmap'],
        preview: async (code, pre) => {
          const { frontMatter, content } = parseMarkdown(code)

          const localOpts = yaml.load(frontMatter) ?? {}

          const svg = (pre.querySelector('.md-diagram-panel-preview svg')
            ?? html`<svg style="width: 100%"></svg>`) as any as SVGElement

          svg.style.height = localOpts.height || '300px'
          if (localOpts.backgroundColor) {
            svg.style.backgroundColor = localOpts.backgroundColor
          }

          // Waiting <svg> append to DOM
          setTimeout(() => {
            const cid = pre.getAttribute('cid')!
            const mm = this.mmOfCid[cid]
              ?? (this.mmOfCid[cid] = Markmap.create(svg as SVGElement))

            const globalOpts = yaml.load(this.settings.get('globalOptions')) ?? {}
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

  registerScript(url: string) {
    this.register(this.importScript(url))
  }

  importScript(url: string) {
    const script = document.createElement('script')
    script.dataset.by = this.manifest.id
    script.src = 'file://' + path.join(this.manifest.dir!, url)
    document.head.appendChild(script)
    return () => script.remove()
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
