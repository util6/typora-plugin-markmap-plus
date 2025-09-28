import * as yaml from 'js-yaml'
import { builtInPlugins, Transformer, type ITransformPlugin } from "markmap-lib"
import { deriveOptions, Markmap } from "markmap-view"
import { editor } from 'typora'


const resolveImagePath: ITransformPlugin = {
  name: 'resolveImagePath',
  transform(ctx) {
    ctx.parser.tap(md => {
      const defaultRender = function (tokens: any, idx: number, options: any, env: any, self: any) {
        return self.renderToken(tokens, idx, options)
      }

      const defaultImageRender = md.renderer.rules.image || defaultRender

      md.renderer.rules.image = (tokens: any[], idx: number, options: any, env: any, self: any): string => {
        const token = tokens[idx]

        const src = token.attrGet('src')
        if (src) {
          token.attrSet('src', editor.imgEdit.getRealSrc(src))
        }

        return defaultImageRender(tokens, idx, options, env, self)
      }

      const defaultHtmlInlineRender = md.renderer.rules.html_inline || defaultRender

      md.renderer.rules.html_inline = (tokens: any[], idx: number, options: any, env: any, self: any): string => {
        const token = tokens[idx] as { content: string }

        if (token.content.startsWith('<img')) {
          token.content = token.content.replace(/ src=(["'])([^'"]+)\1/, (_, __, $relativePath) => {
            return ` src="${editor.imgEdit.getRealSrc($relativePath)}"`
          })
        }

        return defaultHtmlInlineRender(tokens, idx, options, env, self)
      }
    })
    return {}
  }
}

const transformer = new Transformer([...builtInPlugins, resolveImagePath])

type Options = {
  globalOptions: string,
  markdown: string,
  getMarkmap(): Markmap,
}

export function renderMarkmap(options: Options) {
  // Waiting <svg> append to DOM
  setTimeout(() => {
    const { frontMatter, content } = parseMarkdown(options.markdown)
    const globalOpts = yaml.load(options.globalOptions) ?? {}
    const fronMatterJson = yaml.load(frontMatter) ?? {} as any
    const localOpts = fronMatterJson.markmap ?? fronMatterJson
    const jsonOpts = { ...globalOpts, ...localOpts }
    const opts = deriveOptions(jsonOpts)
    const mm = options.getMarkmap()
    mm.setOptions(opts)

    const { root } = transformer.transform(content)
    mm.setData(root)

    mm.fit(1)
  })
  return
}

const RE_FRONT_MATTER = /^---\s*\n([\s\S]+?)\n---\s*\n?/

function parseMarkdown(md: string) {
  let frontMatter = ''

  const content = md
    .replace(RE_FRONT_MATTER, (_, $1) => {
      frontMatter = $1
      return ''
    })

  return { frontMatter, content }
}
