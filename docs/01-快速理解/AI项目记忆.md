# AI 项目记忆

这篇文档不是面向普通用户的功能说明，而是给 AI / 新接手开发者快速建立项目上下文的高密度记忆文档。

目标：

- 让一个刚接手的 AI 先知道什么是这个项目真正重要的
- 让 AI 避开这个项目里最容易踩的坑
- 把项目独有的技术决策、调试方式、部署链路和平台约束压缩成一份记忆

如果你是 AI，建议先读这篇，再读代码。

## 1. 项目本质

项目是一个 Typora 插件。

它做的事不是“单纯渲染一个 markmap”，而是同时处理两套系统：

1. `markmap`
   负责 `Markdown -> 思维导图树 -> SVG`
2. `Typora`
   负责 `文档块模型 -> 编辑区 DOM -> 标题定位 / 滚动 / 编辑态`

真正复杂的部分不在 markmap 本身，而在：

- 导图节点和 Typora 标题块之间如何建立稳定映射
- 文档编辑态变化时如何保持跳转、定位、高亮仍然成立
- macOS 下 Typora 调试能力弱时，怎么观察运行时状态

## 2. 当前架构结论

当前项目采用的是：

**装配层 + 核心大组件 + 弱 Adapter 增强层**

对应关系：

- `src/main.ts`
  装配层、插件入口、Typora 增强实现
- `src/components/TocMindmap.ts`
  核心大组件，包含绝大部分主逻辑
- `src/components/FloatingButton.ts`
  悬浮按钮组件

不要把当前架构理解成“彻底平台解耦”。

真实情况是：

- 默认逻辑仍然在 `TocMindmap.ts`
- `TyporaAdapter` 只提供 Typora 专属增强
- 缺少强 adapter 能力时，组件内部仍然能 fallback

这是一种有意保留迁移弹性的设计。

## 3. 最重要的技术决策

### 3.1 不让系统只认强 Adapter

项目曾经向“强 Adapter 中心化”方向走过，但当前最终选择是：

- 默认逻辑保留在 `TocMindmap.ts`
- `TyporaAdapter` 只覆盖 Typora 独有优化
- 没有强 adapter 能力时，也还能跑基础版

原因：

- 如果把所有平台相关逻辑都下沉到 adapter，Typora 代码会更干净
- 但迁移到 VSCode / Obsidian 时，往往就要先重写整套 adapter
- 当前项目更重视“未来快速迁移时，`TocMindmap.ts` 还能整体复用”

所以现在的原则是：

> adapter 是增强层，不是唯一前提。

### 3.2 Typora 下标题身份优先走 `headingId`，不是只靠文本

当前点击跳转、高亮、fit 的关键不是“标题文本相等”，而是：

- 导图侧用 `state.path`
- 标题侧优先用 `headingId`

在 Typora 下，`headingId` 主要由 `cid` 提供。

也就是说：

- `state.path` 负责导图内部节点索引
- `headingId` 负责正文标题身份

不要再把这个项目理解成“完全靠文本路径匹配”。

### 3.3 Typora 下 `cid` 是有效增强，但不是通用 Markdown 能力

`cid` 不是 Markdown 标准的一部分，也不是跨编辑器通用能力。

它只是 Typora 这种带内部块模型的编辑器给出的块标识。

所以架构上正确的抽象是：

- core 只认 `headingId`
- Typora 上由 `cid` 提供 `headingId`
- 其他平台以后可以用 range / block key / position 替代

结论：

- 在 Typora 里要善用 `cid`
- 但不要让 `cid` 污染整个 core 的抽象边界

### 3.4 代码块必须在 Markdown 预处理阶段统一剔除

这个项目里一个很典型的坑是：

- 代码块里的 `#`、`-`、普通文本
- 会被误识别成 markmap 节点

这个 bug 曾经被误修成“只在 `initialExpandLevel > 5` 时处理”，但这是错的。

正确边界是：

- 无论展示策略是什么
- 代码块都必须先被统一排除

也就是说：

> “代码块不参与结构提取” 是公共前置步骤，不应该挂在 `initialExpandLevel` 这种展示策略条件下面。

### 3.5 多窗口问题先怀疑“配置一致性”，不要先怀疑 SVG 渲染

最近一个典型案例是悬浮按钮图标：

- 一个窗口显示猫
- 一个窗口显示黑色默认图标

这类问题第一反应容易是：

- SVG 被样式污染
- Shadow DOM 隔离失效

但实际排查后发现更可能是：

- 一个窗口拿到了持久化设置
- 另一个窗口回退到了代码默认值

所以项目里遇到“同一功能不同窗口表现不一致”时，优先排查：

1. 当前窗口实际加载了什么设置
2. 当前窗口实际渲染时使用了什么值
3. 是渲染错了，还是根本拿到的不是同一个输入

## 4. 这个项目最值得记住的运行时映射

`TocMindmap.ts` 里最关键的是三张表：

- `headingElements: Map<string, HTMLElement>`
- `headingIds: Map<string, string>`
- `elementToPath: Map<HTMLElement, string>`

理解方式：

- `state.path -> 标题元素`
- `state.path -> 稳定标题 ID`
- `标题元素 -> state.path`

这三张表把两套系统连起来：

- markmap 节点树
- Typora 标题块

所以你排查“点了节点为什么跳不到正文”这类问题时，应该先问：

1. 当前节点有 `state.path` 吗
2. `state.path` 有没有进 `headingIds`
3. `headingId` 能不能解析到真实标题元素
4. fallback 文本匹配有没有接上

## 5. 调试方式是项目特性，不是普通 Web 项目套路

### 5.1 macOS 下不要过度依赖 `console.log` / `debugger`

Typora 在 macOS 下不是 Electron DevTools 那套常规体验，调试天然更麻烦。

这个项目专门为这个现实做了一层自己的调试体系，在：

- `src/utils.ts`

关键事实：

- macOS 下页面内浮层日志是默认开启的
- `logger()` 不只是打 console，也会把重要日志显示在页面上
- 页面右上角有“复制所有日志 / 清除所有日志”按钮
- `debugBreakpoint()` 在 macOS 下会退化成页面提示，而不是单纯依赖 `debugger`

所以这个项目里正确的调试习惯不是：

- 只看终端
- 只看浏览器控制台

而是：

- 直接看页面内 logger 输出
- 必要时复制页面日志

### 5.2 日志要打在项目自己的 logger 体系里

如果只是临时加 `console.log`，在这个项目里价值很有限。

应该优先使用：

- `logger(...)`
- `handleError(...)`
- `debugBreakpoint(...)`
- `checkState(...)`

原因：

- 这些日志能同时适配 macOS 页面浮层和 console
- 更符合当前项目的调试习惯
- 便于在真实 Typora 环境里看结果

### 5.3 多窗口问题尽量打“摘要日志”，不要直接打大对象全文

例如 SVG 图标这种长字符串，正确打法不是把完整字符串一直打印出来，而是打印：

- `length`
- `hash`
- 是否默认值
- 截断前缀

这样才能快速比较两个窗口是不是拿到了同一个输入值。

## 6. 部署与验证方式是项目专有约定

这个项目里，**真正的验证链路不是 `npm run build`**。

正确做法是：

- `./deploy.sh`

原因：

- 它不只是构建
- 还会把 `dist` 复制到 Typora 插件目录
- 然后自动重启 Typora

实际链路：

1. 开发模式默认运行 `yarn build`
2. 生产模式运行 `yarn build:prod`
3. 从 `dist/manifest.json` 读取插件名
4. 把产物复制到：
   `~/Library/Application Support/abnerworks.Typora/plugins/plugins/<plugin-dir>`
5. 重启 Typora

因此在这个项目里：

- 改完代码只跑 `npm run build` 不算真正完成验证
- 正确说法应该是“已经通过 `./deploy.sh` 部署验证”

## 7. 新人 / AI 最容易踩的坑

### 7.1 把旧文档当成当前架构

这个仓库历史文档很多，很多旧方案仍有参考价值，但已经不代表当前真实实现。

如果要看架构，优先看：

- `docs/02-架构重构/当前架构总览.md`

不要先从历史重构计划开始。

### 7.2 以为问题出在 markmap，其实出在 Typora 集成层

很多问题表面看起来像：

- markmap 节点没了
- markmap 定位不准
- markmap 图标渲染异常

但实际往往是：

- 标题块身份映射失效
- Typora 编辑态 DOM 变化
- 多窗口配置不一致
- 平台样式污染

所以这个项目里排错时一定要先分层：

1. 是 markmap 数据树问题？
2. 还是 Typora 标题块 / 设置 / DOM / 编辑态问题？

### 7.3 把展示策略条件误写成结构正确性的边界

最典型例子就是 `initialExpandLevel`。

它影响的是：

- 展示多少层
- 是否把正文也渲染进导图

它不应该影响：

- 代码块是否参与解析
- bug 是否成立

这类边界要分清。

### 7.4 在 Typora 环境里过早做“过度抽象”

这个项目已经吃过一轮教训：

- 纯度很高的 adapter 架构看起来很漂亮
- 但会直接抬高迁移和维护成本

当前策略是务实优先：

- 先保证 Typora 下可用
- 再保留迁移弹性
- 不为抽象牺牲太多可维护性

## 8. 现在最推荐的阅读顺序

如果一个 AI 现在刚接手项目，建议按这个顺序建立上下文：

1. `docs/01-快速理解/AI项目记忆.md`
2. `docs/01-快速理解/插件移植与架构指南.md`
3. `docs/02-架构重构/当前架构总览.md`
4. `docs/01-快速理解/Typora-cid与Markmap跳转机制说明.md`
5. `src/main.ts`
6. `src/components/TocMindmap.ts`
7. `src/components/FloatingButton.ts`
8. `src/utils.ts`

## 9. 一句话工作守则

以后在这个项目里继续开发，优先记住这几条：

- 先分清是 markmap 问题还是 Typora 集成问题
- 调试优先用项目自己的 `logger`
- 验证优先走 `./deploy.sh`
- `TyporaAdapter` 是增强层，不是唯一前提
- `cid` 很重要，但只能作为 Typora 实现细节，不是跨平台真理
- 遇到多窗口差异，先查输入值和配置一致性，不要先怀疑渲染
