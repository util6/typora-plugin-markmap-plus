import { Transformer, builtInPlugins } from 'markmap-lib'
import { deriveOptions, Markmap } from 'markmap-view'
import * as yaml from 'js-yaml'
import { CodeblockPostProcessor, path, Plugin, PluginSettings, html, Toc } from '@typora-community-plugin/core'
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

  tocMarkmap?: Markmap
  tocModal?: HTMLElement
  isTocPinned = false
  tocModalRect?: {
    width: number
    height: number
    top: number
    left: number
  }

  debouncedUpdateTocMarkmap = debounce(() => this.updateTocMarkmap(), 300)

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

    this.register(
      this.app.workspace.on('change', () => {
        if (this.tocModal) {
          this.debouncedUpdateTocMarkmap()
        }
      }))

    this.register(
      this.app.on('resize', () => {
        if (this.isTocPinned) {
          this.pinTocMarkmap(false)
        }
      })
    )

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

    this.registerCommand({
      id: 'toggle-toc-markmap',
      name: this.i18n.t('command.toggle-toc-markmap.name'),
      hotkey: 'ctrl+m',
      callback: () => this.toggleTocMarkmap(),
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
    this.hideTocMarkmap()
  }

  toggleTocMarkmap() {
    this.tocModal ? this.hideTocMarkmap() : this.showTocMarkmap()
  }

  async showTocMarkmap() {
    if (this.tocModal) return

    this.tocModal = document.createElement('div')
    this.tocModal.className = 'markmap-toc-modal'
    this.tocModal.innerHTML = `
      <div class="markmap-toc-header">
        <span class="markmap-toc-title">TOC Markmap</span>
        <div class="markmap-toc-actions">
          <span class="markmap-toc-action" data-action="pin" title="${this.i18n.t('tooltip.pin')}">📌</span>
          <span class="markmap-toc-action" data-action="refresh" title="${this.i18n.t('tooltip.refresh')}">⟳</span>
          <span class="markmap-toc-action" data-action="fit" title="${this.i18n.t('tooltip.fit')}">⛶</span>
          <span class="markmap-toc-action markmap-toc-close" data-action="close" title="${this.i18n.t('tooltip.close')}">&times;</span>
        </div>
      </div>
      <svg class="markmap-toc-svg"></svg>
    `
    document.body.appendChild(this.tocModal)

    this.tocModal.querySelector('.markmap-toc-actions')!
      .addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const action = target.closest<HTMLElement>('.markmap-toc-action')?.dataset.action;
        switch (action) {
          case 'close': return this.hideTocMarkmap();
          case 'refresh': return this.updateTocMarkmap();
          case 'fit': return this.tocMarkmap?.fit();
          case 'pin': return this.togglePin();
        }
      })

    const style = document.createElement('style')
    style.dataset.by = this.manifest.id
    style.innerHTML = `
      .markmap-toc-modal {
        position: fixed;
        top: 50px;
        right: 20px;
        width: 400px;
        height: 500px;
        background-color: var(--bg-color);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        resize: both;
        overflow: hidden;
      }
      .markmap-toc-modal.pinned-right {
        top: 0 !important;
        right: 0 !important;
        left: unset !important;
        height: 100% !important;
        border-radius: 0;
        border-right: none;
        resize: horizontal;
        direction: rtl;
      }
      .markmap-toc-modal.pinned-right > * {
        direction: ltr;
      }
      .markmap-toc-modal.pinned-right .markmap-toc-header {
        cursor: default;
      }
      .markmap-toc-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
        border-bottom: 1px solid var(--border-color);
        cursor: move;
        flex-shrink: 0;
      }
      .markmap-toc-title {
        font-weight: bold;
      }
      .markmap-toc-actions {
        display: flex;
        align-items: center;
      }
      .markmap-toc-action {
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
        margin-left: 8px;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
      }
      .markmap-toc-action:hover {
        background-color: var(--item-hover-bg-color);
      }
      .markmap-toc-close {
        font-size: 20px;
      }
      .markmap-toc-svg {
        flex-grow: 1;
        width: 100%;
      }
    `
    document.head.appendChild(style)
    this.register(() => style.remove())

    this.makeDraggable(this.tocModal, this.tocModal.querySelector('.markmap-toc-header') as HTMLElement)

    if (this.isTocPinned) {
      this.pinTocMarkmap(false)
    }

    const svg = this.tocModal.querySelector('.markmap-toc-svg') as SVGElement
    this.tocMarkmap = Markmap.create(svg)
    this.updateTocMarkmap()
  }

  hideTocMarkmap() {
    if (this.isTocPinned) {
      this.unpinTocMarkmap(false)
    }
    if (!this.tocModal) return
    this.tocMarkmap?.destroy()
    this.tocModal.remove()
    this.tocMarkmap = undefined
    this.tocModal = undefined
  }

  togglePin() {
    this.isTocPinned ? this.unpinTocMarkmap() : this.pinTocMarkmap()
  }

  pinTocMarkmap(saveRect = true) {
    if (!this.tocModal) return

    if (saveRect) {
      const { top, left, width, height } = this.tocModal.getBoundingClientRect()
      this.tocModalRect = { top, left, width, height }
    }

    this.isTocPinned = true
    this.tocModal.classList.add('pinned-right')
    this.tocModal.style.width = this.tocModalRect?.width ? `${this.tocModalRect.width}px` : '400px'

    const button = this.tocModal.querySelector('[data-action="pin"]')
    if (button) {
      button.textContent = '=>'
      button.setAttribute('title', this.i18n.t('tooltip.unpin'))
    }

    const editor = document.querySelector<HTMLElement>('#write-book')
    if (editor) {
      const modalWidth = this.tocModal.getBoundingClientRect().width
      editor.style.paddingRight = `${modalWidth}px`
    }
  }

  unpinTocMarkmap(restoreRect = true) {
    if (!this.tocModal) return

    this.isTocPinned = false
    this.tocModal.classList.remove('pinned-right')

    if (restoreRect && this.tocModalRect) {
      this.tocModal.style.width = `${this.tocModalRect.width}px`
      this.tocModal.style.height = `${this.tocModalRect.height}px`
      this.tocModal.style.top = `${this.tocModalRect.top}px`
      this.tocModal.style.left = `${this.tocModalRect.left}px`
    }

    const button = this.tocModal.querySelector('[data-action="pin"]')
    if (button) {
      button.textContent = '📌'
      button.setAttribute('title', this.i18n.t('tooltip.pin'))
    }

    const editor = document.querySelector<HTMLElement>('#write-book')
    if (editor) {
      editor.style.paddingRight = ''
    }
  }

  async updateTocMarkmap() {
    if (!this.tocMarkmap) return
    const toc = await this.app.workspace.getToc()
    const md = this.tocToMarkdown(toc)
    const { root } = this.transformer.transform(md)
    this.tocMarkmap.setData(root)
    this.tocMarkmap.fit()
  }

  tocToMarkdown(toc: Toc[], depth = 0): string {
    let md = ''
    const indent = '  '.repeat(depth)
    for (const heading of toc) {
      md += `${indent}- ${heading.text}\n`
      if (heading.children?.length) {
        md += this.tocToMarkdown(heading.children, depth + 1)
      }
    }
    return md
  }

  makeDraggable(elmnt: HTMLElement, dragZone: HTMLElement) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    const dragMouseDown = (e: MouseEvent) => {
      if (this.isTocPinned) return;
      e = e || window.event;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    dragZone.onmousedown = dragMouseDown;

    const elementDrag = (e: MouseEvent) => {
      e = e || window.event;
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
      elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    }

    const closeDragElement = () => {
      document.onmouseup = null;
      document.onmousemove = null;
    }
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
    if (this.tocModal) this.hideTocMarkmap()
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

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timeoutId: number | null = null;
  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}
