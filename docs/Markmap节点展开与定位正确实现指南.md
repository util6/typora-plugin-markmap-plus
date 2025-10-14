# Markmap 节点展开与定位的正确实现指南

本文档总结了在 `markmap-view` 库中，以编程方式实现“展开指定节点”和“定位到指定节点”这两个核心功能的正确实现思路与API用法。本文的结论基于多次失败的尝试和对 `markmap-view` 源码的深入分析。

## 核心问题

开发过程中遇到的主要问题有两个，本质上是同一个原因：

1.  **点击跳转失败**：当用户点击一个在折叠分支深处的节点时，无法自动展开其父节点，导致跳转失败。
2.  **适应视图失败**：当“适应视图”功能需要定位到一个当前在折叠分支中的节点时，由于该节点未在DOM中渲染，导致查找失败，无法定位。

## 失败尝试的根源：错误的API与假设

在找到正确方案之前，一系列的失败尝试均源于以下几个核心错误：

1.  **错误的刷新API**：我们曾长期试图使用 `markmap.setData()` 来刷新视图。然而，`setData()` 是一个“重”方法，它内部包含多种性能优化（如哈希检查、对象引用检查），当我们仅修改数据对象的内部属性时，`setData()` 会认为“数据未变”，从而**跳过刷新**，这是导致所有“修改无效”的根本原因。
2.  **错误的数据源**：我们曾试图从 `markmap.state.data` 中读取和修改数据。但该数据可能是 `markmap-view` 内部未经完全处理的“原始数据”，缺少我们需要的 `payload` 和 `parent` 引用等关键信息。
3.  **破坏性的克隆**：为了绕过 `setData()` 的引用检查，我们曾尝试用 `JSON.parse(JSON.stringify())` 来深克隆数据。但这破坏了节点间的 `parent` 循环引用，导致逻辑链中断。
4.  **不完整的变通方案**：我们曾尝试通过修改 `initialExpandLevel` 并调用 `_update()` 来强制重绘。但这同样被 `_update()` 内部的哈希检查所阻止。

## 正确的实现策略

通过对 `markmap-view` 源码的分析，我们找到了最关键的API：`markmap.renderData()`。它是一个轻量级的、直接的重绘方法，不包含 `setData()` 的那些复杂检查。

正确的实现策略分为三步：**获取正确数据 -> 修改数据 -> 调用正确API**。

### 1. 获取正确的数据源

必须使用我们在 `_update` 方法中自己构建并保存的、最完整的数据对象：
`this.state.lastMarkmapData`

这个对象包含了所有节点的 `payload`、`path`、以及最重要的 `parent` 循环引用。

### 2. 修改节点的折叠状态

要展开一个节点，必须向上遍历，将其所有父节点的 `payload.fold` 属性设置为 `0`。

```typescript
// nodeData: 目标节点的数据对象
let parent = nodeData.parent;
let changed = false;
while (parent) {
  if (parent.payload?.fold) {
    parent.payload.fold = 0; // 0 表示展开
    changed = true;
  }
  parent = parent.parent;
}
```

### 3. 调用正确的刷新API

如果 `changed` 标志为 `true`，说明有节点被展开，此时**必须**调用 `renderData()` 来重绘视图。

```typescript
if (changed && this.state.markmap) {
  // 调用 renderData() 而不是 setData()
  await this.state.markmap.renderData();
}
```
`renderData()` 会接受一个可选的 `originData` 参数，用于实现优雅的动画效果。我们可以传入被展开的最高层级的父节点。

## 最终代码实现

### 修复“点击跳转”

在 `_scrollToHeadingByNode` 方法中应用以上策略：

```typescript
private async _scrollToHeadingByNode(nodeEl: Element) {
  const nodeData = (nodeEl as any).__data__;
  if (!nodeData) return;

  // 1. & 2. 向上遍历并修改 payload.fold
  let topParentToRender: any | undefined;
  let parent = nodeData.parent;
  let changed = false;
  while (parent) {
    if (parent.payload?.fold) {
      parent.payload.fold = 0;
      changed = true;
      topParentToRender = parent; // 记录最顶层的被展开节点，用于动画
    }
    parent = parent.parent;
  }

  // 3. 如果有变动，调用 renderData() 刷新
  if (changed && this.state.markmap) {
    await this.state.markmap.renderData(topParentToRender);
  }

  // 后续逻辑...
  const path = nodeData.payload?.path;
  // ...根据 path 滚动
}
```
同时，需要将调用此方法的 `_handleModalClick` 也标记为 `async`。

### 修复“适应视图”

对于“适应视图”，在 `_fitToView` 方法中，当发现节点未在DOM中渲染时，执行类似的逻辑：

```typescript
// 在 _fitToView 中...
let targetElement = this._findNodeByPath(currentPath);

if (!targetElement) {
  // 节点未渲染，需要先展开
  const targetDataNode = this._findDataNodeByPath(currentPath, this.state.lastMarkmapData);
  if (targetDataNode) {
    // ...同样执行向上遍历、修改fold、调用renderData的逻辑...
    // await this.state.markmap.renderData(...);

    // renderData 后，节点已在DOM中，再次查找
    targetElement = this._findNodeByPath(currentPath);
  }
}

if (targetElement) {
  // 执行定位和缩放
  this._panAndZoomToNode(targetElement, currentHeadingObj);
}
```

## 潜在的陷阱：路径不匹配

在整个调试过程中，我们发现的另一个核心问题是“路径不匹配”。从编辑器 `innerText` 获取的路径，和 Markmap 内部渲染后生成的路径，可能存在细微差异（如空格、特殊字符转义等）。

最稳妥的解决方案是**路径标准化**：
1.  创建一个 `_normalizePath(text: string)` 函数，将输入的字符串移除所有空白并转为小写。
2.  在 `_getDocumentHeadings` 生成编辑器路径时，对每一级标题都使用此函数。
3.  在 `_addNodePath` 生成 Markmap 节点路径时，也对每一级标题使用此函数。

这样可以从根本上保证两边生成的路径字符串完全一致。
