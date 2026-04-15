# Typora `cid` 与 Markmap 跳转机制说明

## 背景

在 `markmapplus` 插件里，Markmap 负责把 Markdown 转成思维导图数据，再把数据渲染成 SVG 节点。

但“点击思维导图节点后跳回 Typora 正文标题”这件事，并不是 Markmap 自己完成的，而是插件额外实现的一层“节点到正文位置”的映射逻辑。

因此这里其实有两套系统：

1. Markmap 系统
   负责 `Markdown -> 树数据 -> SVG 节点`
2. Typora 系统
   负责 `文档块模型 -> 编辑区 DOM -> 滚动定位`

本次问题就出在第二层，而不是第一层。

## 什么是 `cid`

`cid` 可以理解为 Typora 给编辑区块分配的一个内部块标识。

在 Typora 的编辑 DOM 中，很多块元素都带有类似下面的属性：

```html
<p cid="n123" mdtype="heading">...</p>
```

对标题来说，`cid` 的意义是：

- 它表示“这是文档里的哪个块”
- 它比当前这块的具体 HTML 结构更稳定
- Typora 内部很多功能都基于它工作，而不是基于 `h1/h2/h3` 这种浏览器语义标签

在现有代码和同目录其他插件里，也能看到这种用法：

- [main.ts](/Users/util6/code-space/typora插件开发/typora-plugin-markmap-plus/src/main.ts:35) 现在已经从 `h1..h6` 改成查 `[mdtype="heading"]`
- `typora_plugin/plugin/collapse_paragraph.js` 使用 `#write > [mdtype="heading"]` 和 `[cid=...]`
- `typora_plugin/plugin/easy_modify.js` 使用 `File.editor.nodeMap.toc.headers`

所以 `cid` 不是这个插件发明的概念，而是 Typora 自己的块级标识。

## 为什么原来的 DOM 方案会失效

旧逻辑的核心假设是：

- 正文标题在编辑区里稳定表现为某个 `HTMLElement`
- 这个元素的 `textContent` 能和 Markmap 节点文本稳定一一对应

但 Typora 在标题进入编辑态时，会临时改变该标题块的表现形式。常见现象包括：

- 标题文本里出现 Markdown 前缀，比如 `## 执行规则`
- 原先用于查询的标题 DOM 结构发生变化
- 某些时刻你能看到“这块还在”，但插件之前缓存的那个具体元素已经不再可靠

于是原先这条链路会断：

```text
SVG 节点 -> state.path -> cached HTMLElement -> scrollIntoView()
```

一旦 `cached HTMLElement` 不再有效，跳转就会失败。

## 为什么 `cid` 理论上更适合解决这个问题

`cid` 的思路不是缓存“某个具体 DOM 元素”，而是缓存“文档块身份”。

也就是把链路改成：

```text
SVG 节点 -> state.path -> cid -> 运行时重新查找当前 DOM -> scrollIntoView()
```

这个变化的关键点是：

- 旧方案缓存的是“元素对象”
- 新方案缓存的是“块身份”

只要同一个标题块在编辑态和非编辑态之间仍然保有同一个 `cid`，插件就能在点击时重新查到它当前对应的 DOM 元素。

这就是为什么 `cid` 方案看起来像“换了底层”，但实际上没有替换 Markmap 的底层逻辑。它替换的不是渲染层，而是“跳转定位层”。

## 这和 Markmap 操作 DOM 有什么关系

Markmap 当然也操作 DOM，但它操作的是它自己的 SVG DOM，而不是 Typora 正文区的块 DOM。

这里要分清两件事：

### 1. Markmap 渲染

Markmap 做的是：

```text
Markdown -> root tree -> SVG .markmap-node
```

插件里对应的是：

- `Transformer.transform(markdown)` 生成树数据
- `Markmap.create(...)` 或 `markmap.setData(...)` 渲染 SVG

这部分并没有被 `cid` 方案替换。

### 2. 正文跳转

点击 SVG 节点以后，插件要自己决定：

- 这个 SVG 节点对应正文里的哪个标题块
- 如何找到那个标题块
- 如何滚动过去

这部分才是本次修复试图替换的对象。

所以准确说法不是“把 Markmap 底层换掉了”，而是：

> Markmap 仍然负责生成和渲染导图；插件把“导图节点到 Typora 正文块”的定位机制，从基于瞬时 DOM 的映射，改成了基于 Typora 块身份的映射。

## 当前代码里 `cid` 方案落在什么位置

### 标题采集层

[main.ts](/Users/util6/code-space/typora插件开发/typora-plugin-markmap-plus/src/main.ts:35)

现在优先采集 Typora 原生标题块：

```ts
return Array.from(write.querySelectorAll('[mdtype="heading"]'))
```

这已经不再把浏览器语义标题标签当作唯一依据。

### 状态层

[TocMindmap.ts](/Users/util6/code-space/typora插件开发/typora-plugin-markmap-plus/src/components/TocMindmap.ts:459)

增加了：

```ts
headingCids: new Map<string, string>()
```

它的含义是：

- key: Markmap 节点的 `state.path`
- value: Typora 标题块的 `cid`

### Typora 数据源层

[TocMindmap.ts](/Users/util6/code-space/typora插件开发/typora-plugin-markmap-plus/src/components/TocMindmap.ts:1009)

这里开始读取：

```ts
window.File?.editor?.nodeMap?.toc?.headers
```

也就是直接使用 Typora 自己维护的目录数据，而不是只相信当前可见 DOM。

### 运行时定位层

[TocMindmap.ts](/Users/util6/code-space/typora插件开发/typora-plugin-markmap-plus/src/components/TocMindmap.ts:1025)

这里根据 `cid` 回查正文区当前 DOM：

```ts
write.querySelector(`[cid="${cid}"]`)
```

这个思路的核心是“点击时实时解析”，不是“渲染后永久缓存”。

## 为什么这版改了以后仍然可能失败

如果这版仍然失败，通常意味着问题比“标题 HTML 结构变化”更深，可能包括：

1. 标题进入编辑态时，对应块的 `cid` 本身发生了替换
2. `nodeMap.toc.headers` 在编辑态和展示态之间存在时序延迟
3. 当前激活标题其实被 Typora 临时拆成了另一个可编辑块，导致 `[cid="..."]` 已经不再指向视觉上的那个标题
4. Typora 在编辑态下真正滚动定位的目标不是标题块本身，而是编辑光标所在的内部容器

也就是说，`cid` 是比直接缓存 DOM 元素更合理的一层，但它不是数学上保证正确的终点，只是更接近 Typora 内部模型。

## 这次问题的本质结论

这次问题的关键结论是：

- 问题不在 Markmap 是否“操作 DOM”
- 问题在于插件曾经把“正文定位”建立在不稳定的 DOM 表象上
- `cid` 方案不是替换 Markmap，而是把“定位依据”切换到更接近 Typora 内部文档模型的一层

换句话说：

> Markmap 解决的是“导图怎么画出来”，`cid` 解决的是“画出来以后如何回到 Typora 文档中的正确块”。

## 后续建议

如果要继续把这个问题真正做稳，下一步应当做的不是继续猜 DOM，而是加运行时探针，直接在“标题编辑态”采集以下三类信息：

1. `File.editor.nodeMap.toc.headers` 当前内容
2. 当前光标所在块的 `cid`
3. 编辑区内 `[cid]` 与 `[mdtype="heading"]` 的实际对应关系

只有把这三层在出问题瞬间采出来，才能判断最终该基于：

- `cid`
- source line
- Typora selection / active block
- 或 Typora 内部的 node 引用

哪一层做最终定位。

