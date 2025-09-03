import type { ITransformPlugin } from "markmap-lib"
import { editor } from 'typora'


export const imageTransformer: ITransformPlugin = {
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
