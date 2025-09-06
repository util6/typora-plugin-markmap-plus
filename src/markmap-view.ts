import { app, DisposeFunc, html, WorkspaceLeaf, WorkspaceView } from "@typora-community-plugin/core"
import { editor } from "typora"
import { Markmap } from "markmap-view"
import type MarkmapPlugin from "./main"
import { renderMarkmap } from "./markmap-renderer"


export class MarkmapView extends WorkspaceView {
  static type = 'markmap'

  containerEl = html`<svg style="width: 100%; height: 100%"></svg>`

  private dispose: DisposeFunc

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: MarkmapPlugin
  ) {
    super(leaf)
  }

  onOpen(): void {
    this.dispose = app.features.markdownEditor.on('edit', () => this.refresh())
    this.refresh()
  }

  refresh() {
    this.containerEl.innerHTML = ''
    renderMarkmap({
      globalOptions: this.plugin.settings.get('globalOptions'),
      markdown: editor.getMarkdown(),
      getMarkmap: () => Markmap.create(this.containerEl as any),
    })
  }

  onClose() {
    this.dispose()
  }
}
