import * as yaml from 'js-yaml'
import { builtInPlugins, Transformer, type ITransformPlugin } from "markmap-lib"
import { deriveOptions, Markmap } from "markmap-view"
import { editor } from 'typora'


const resolveImagePath: ITransformPlugin = {
  name: 'resolveImagePath',
  transform(ctx) {
    ctx.parser.tap(md => {
      const defaultRender = md.renderer.rules.image || function (tokens: any, idx: number, options: any, env: any, self: any) {
        return self.renderToken(tokens, idx, options)
      }

      md.renderer.rules.image = (tokens: any[], idx: number, options: any, env: any, self: any): string => {
        const token = tokens[idx]

        const src = token.attrGet('src')
        if (src) {
          const relativePath = src.replace(/^typora:\/\/app\/typemark\//, '')
          const resolvedSrc = editor.imgEdit.getRealSrc(relativePath)

          token.attrSet('src', resolvedSrc)
        }

        return defaultRender(tokens, idx, options, env, self)
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
    const localOpts = yaml.load(frontMatter) ?? {}
    const jsonOpts = { ...globalOpts, ...localOpts }
    const opts = deriveOptions(jsonOpts)
    const mm = options.getMarkmap()
    mm.setOptions(opts)

    const { root } = transformer.transform(content)
    mm.setData(root)

    mm.fit()
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
