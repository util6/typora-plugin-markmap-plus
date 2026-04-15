# Markmap 库使用指导文档

本文档详细说明 `markmap-lib` 和 `markmap-view` 的核心 API、函数、参数和属性。

---

## 目录

1. [Markmap 工作原理](#markmap-工作原理)
2. [markmap-lib - Markdown 转换库](#markmap-lib)
3. [markmap-view - 可视化渲染库](#markmap-view)
4. [完整使用示例](#完整使用示例)

---

## Markmap 工作原理

### 核心架构

Markmap 由三个核心库组成：

1. **markmap-common**: 提供通用类型定义和工具函数
2. **markmap-lib**: Markdown 解析和转换引擎
3. **markmap-view**: D3.js 可视化渲染引擎

### 数据流转过程

```
Markdown 文本
    ↓
[markmap-lib] Transformer.transform()
    ↓
IPureNode 树形结构 (纯数据)
    ↓
[markmap-view] Markmap.create()
    ↓
INode 树形结构 (带渲染状态)
    ↓
SVG 思维导图
```

### 核心数据结构

#### IPureNode (markmap-lib 输出)

```typescript
interface IPureNode {
  content: string;           // 节点的 HTML 内容
  payload?: {                // 自定义数据
    [key: string]: unknown;
    fold?: number;           // 折叠状态: 0=展开, 1=折叠, 2=递归折叠
  };
  children: IPureNode[];     // 子节点数组
}
```

**关键特性：**
- `content` 存储的是 **HTML 格式** 的内容（已经过 markdown-it 解析）
- `children` 数组维护树形层级关系
- `payload.fold` 控制节点的折叠状态（**数据层面**）

**⚠️ 重要：fold 属性的含义**

在 `IPureNode` 中，`payload.fold` 的值：
- `undefined` 或 `0`：节点展开
- `1`：节点折叠（隐藏直接子节点）
- `2`：递归折叠（隐藏所有后代节点）

#### INode (markmap-view 使用)

```typescript
interface INode extends IPureNode {
  state: INodeState;         // 渲染状态
  children: INode[];
}

interface INodeState {
  id: number;                // 自增唯一ID
  path: string;              // 点分隔的路径 (如 "0.1.2")
  key: string;               // 基于内容的唯一标识
  depth: number;             // 节点深度
  el: HTMLElement;           // DOM 元素引用
  x0: number;                // 上一次渲染的 x 坐标
  y0: number;                // 上一次渲染的 y 坐标
  size: [number, number];    // [宽度, 高度]
}
```

**关键特性：**
- 继承 `IPureNode` 的所有属性（包括 `payload.fold`）
- 添加 `state` 对象存储渲染相关的临时数据
- `state.path` 用于追踪节点在树中的位置
- `state.el` 用于 DOM 操作和事件绑定

**⚠️ 重要：fold 属性在 INode 中的使用**

在 `markmap-view` 中：
- **读取** `payload.fold` 来判断节点是否折叠
- **修改** `payload.fold` 来改变折叠状态
- 折叠状态会影响 `children` 的渲染（但不会删除 children 数组）

```typescript
// 判断节点是否折叠
const isFolded = node.payload?.fold;  // truthy 表示折叠

// 切换折叠状态
if (node.payload?.fold) {
  delete node.payload.fold;  // 展开
} else {
  node.payload = { ...node.payload, fold: 1 };  // 折叠
}
```

### 折叠状态详解

#### 三种折叠状态

| fold 值 | 状态 | 行为 | 使用场景 |
|---------|------|------|----------|
| `undefined` 或 `0` | 展开 | 显示所有子节点 | 默认状态 |
| `1` | 折叠 | 隐藏直接子节点 | 用户点击折叠 |
| `2` | 递归折叠 | 隐藏所有后代节点 | 初始化时折叠深层节点 |

#### 折叠状态的存储位置

```typescript
// ❌ 错误：fold 不在 state 中
node.state.fold = 1;  // 这不会生效！

// ✅ 正确：fold 在 payload 中
node.payload = { ...node.payload, fold: 1 };
```

#### 操作折叠状态的正确方式

```typescript
// 方式 1: 使用 Markmap 的 API（推荐）
markmap.toggleNode(node);           // 切换单个节点
markmap.toggleNode(node, true);     // 递归切换所有子节点

// 方式 2: 直接修改 payload（需要手动重新渲染）
node.payload = { ...node.payload, fold: 1 };
markmap.renderData();  // 触发重新渲染

// 方式 3: 修改数据后重新设置
node.payload = { ...node.payload, fold: 1 };
markmap.setData(root);  // 重新设置数据
```

#### 常见错误和解决方案

**错误 1：混淆 IPureNode 和 INode**

```typescript
// ❌ 错误：在 transform 后尝试访问 state
const { root } = transformer.transform(markdown);
console.log(root.state);  // undefined! root 是 IPureNode

// ✅ 正确：只在 markmap-view 中访问 state
const mm = Markmap.create('#svg', {}, root);
// 现在内部的节点是 INode，有 state 属性
```

**错误 2：直接修改 children 数组来实现折叠**

```typescript
// ❌ 错误：删除 children
if (shouldFold) {
  node.children = [];  // 数据丢失！
}

// ✅ 正确：使用 fold 属性
node.payload = { ...node.payload, fold: 1 };
// children 数组保持不变，只是不渲染
```

**错误 3：忘记触发重新渲染**

```typescript
// ❌ 错误：修改后没有重新渲染
node.payload.fold = 1;
// 视图不会更新！

// ✅ 正确：修改后触发渲染
node.payload = { ...node.payload, fold: 1 };
markmap.renderData();  // 或 markmap.setData(root)
```

#### 实用示例

```typescript
// 展开所有节点
function expandAll(node: INode) {
  delete node.payload?.fold;
  node.children?.forEach(expandAll);
}
expandAll(root);
markmap.renderData();

// 折叠所有节点
function collapseAll(node: INode, depth: number = 0) {
  if (depth > 0 && node.children?.length) {
    node.payload = { ...node.payload, fold: 1 };
  }
  node.children?.forEach(child => collapseAll(child, depth + 1));
}
collapseAll(root);
markmap.renderData();

// 折叠到指定层级
function collapseToLevel(node: INode, maxLevel: number, currentLevel: number = 0) {
  if (currentLevel >= maxLevel && node.children?.length) {
    node.payload = { ...node.payload, fold: 1 };
  } else {
    delete node.payload?.fold;
    node.children?.forEach(child => 
      collapseToLevel(child, maxLevel, currentLevel + 1)
    );
  }
}
collapseToLevel(root, 2);  // 只展开到第2层
markmap.renderData();

// 切换节点折叠状态（手动实现）
function toggleFold(node: INode, recursive: boolean = false) {
  const isFolded = node.payload?.fold;
  
  if (isFolded) {
    delete node.payload.fold;
  } else {
    node.payload = { ...node.payload, fold: recursive ? 2 : 1 };
  }
  
  markmap.renderData();
}
```

### 详细工作流程

#### 阶段 1: Markdown 解析 (markmap-lib)

```typescript
const transformer = new Transformer();
const result = transformer.transform(`
# 第一章
## 第一节
正文内容会被忽略
### 小节
`);

// result.root 的结构：
{
  content: '<strong>第一章</strong>',
  children: [
    {
      content: '<strong>第一节</strong>',
      children: [
        {
          content: '<strong>小节</strong>',
          children: []
        }
      ]
    }
  ]
}
```

**解析规则：**
1. **只提取标题行**（`#` 开头）
2. 根据 `#` 数量确定层级（`#` = 1级，`##` = 2级）
3. 标题内容通过 markdown-it 转换为 HTML
4. 正文内容被忽略（不会出现在 `content` 中）
5. 通过 `children` 数组维护父子关系

#### 阶段 2: 树形结构构建

**层级关系维护：**
- 每个节点的 `children` 数组包含其直接子节点
- 子节点的层级 = 父节点层级 + 1
- 同级节点按出现顺序排列在同一个 `children` 数组中

**示例：**
```markdown
# A
## B
### C
## D
```

转换为：
```typescript
{
  content: 'A',
  children: [
    {
      content: 'B',
      children: [
        { content: 'C', children: [] }
      ]
    },
    {
      content: 'D',
      children: []
    }
  ]
}
```

#### 阶段 3: 可视化渲染 (markmap-view)

```typescript
const mm = Markmap.create('#svg', options, root);
```

**渲染过程：**
1. 将 `IPureNode` 转换为 `INode`（添加 `state` 属性）
2. 使用 D3.js 的层级布局算法计算节点位置
3. 为每个节点创建 SVG 元素
4. 绑定交互事件（点击折叠/展开、缩放、拖拽）
5. 应用动画效果

### 关键理解

#### 1. 标题 vs 正文

- **Markmap 只处理标题**（`#` 开头的行）
- 正文内容会被完全忽略
- 如果需要显示正文，必须将其作为标题的一部分

#### 2. 数据结构的演变

```
Markdown 文本
    ↓ (markdown-it 解析)
HTML 片段
    ↓ (层级分析)
IPureNode 树 (纯数据)
    ↓ (添加渲染状态)
INode 树 (带状态)
    ↓ (D3.js 布局)
SVG 元素
```

#### 3. children 数组的作用

- **维护树形结构**：通过嵌套的 `children` 数组表达层级关系
- **遍历访问**：可以递归遍历整棵树
- **动态更新**：可以动态添加/删除子节点

#### 4. 扩展性

如果需要存储额外信息（如正文内容），可以使用 `payload`：

```typescript
{
  content: '<strong>标题</strong>',
  payload: {
    rawContent: '标题',
    bodyText: '这是正文内容',
    customData: { /* 任意数据 */ }
  },
  children: []
}
```

---

## 插件系统

### 内置插件

markmap-lib 提供了多个内置插件来扩展 Markdown 功能：

```typescript
import { Transformer, builtInPlugins } from 'markmap-lib';

// 内置插件包括：
// - frontmatter: 解析 YAML frontmatter
// - katex: 数学公式支持
// - prism: 代码高亮
// - hljs: 代码高亮（highlight.js）
```

### 插件接口

```typescript
interface ITransformPlugin {
  name: string;
  config?: {
    styles?: CSSItem[];
    scripts?: JSItem[];
    versions?: Record<string, string>;
    preloadScripts?: JSItem[];
    resources?: string[];
  };
  transform: (hooks: ITransformHooks) => IAssets;
}
```

### 自定义插件示例

```typescript
const myPlugin: ITransformPlugin = {
  name: 'my-plugin',
  config: {
    styles: [
      { type: 'stylesheet', data: { href: 'https://example.com/style.css' } }
    ]
  },
  transform(hooks) {
    // 在解析前修改 markdown-it 实例
    hooks.parser.tap((md) => {
      md.use(someMarkdownItPlugin);
    });
    
    // 在解析前后执行自定义逻辑
    hooks.beforeParse.tap((md, context) => {
      console.log('Before parsing:', context.content);
    });
    
    hooks.afterParse.tap((md, context) => {
      console.log('After parsing:', context.root);
    });
    
    return {
      styles: this.config.styles,
      scripts: []
    };
  }
};

// 使用自定义插件
const transformer = new Transformer([...builtInPlugins, myPlugin]);
```

### Hook 系统

```typescript
interface ITransformHooks {
  transformer: ITransformer;
  parser: Hook<[md: MarkdownIt]>;           // 创建解析器时触发
  beforeParse: Hook<[md, context]>;         // 解析前触发
  afterParse: Hook<[md, context]>;          // 解析后触发
  retransform: Hook<[]>;                    // 强制重新渲染
}
```

---

## 高级用法

### 1. 自定义节点数据

```typescript
// 在 transform 后添加自定义数据
function enrichNode(node: IPureNode, parentPath = '') {
  const currentPath = parentPath ? `${parentPath}/${node.content}` : node.content;
  
  node.payload = {
    ...node.payload,
    fullPath: currentPath,
    timestamp: Date.now(),
    customData: { /* 任意数据 */ }
  };
  
  node.children.forEach(child => enrichNode(child, currentPath));
}

const { root } = transformer.transform(markdown);
enrichNode(root);
```

### 2. 动态更新节点

```typescript
// 更新节点内容
function updateNode(node: IPureNode, newContent: string) {
  node.content = newContent;
  // 触发重新渲染
  markmap.setData(root);
}

// 添加子节点
function addChild(parent: IPureNode, content: string) {
  parent.children.push({
    content,
    children: []
  });
  markmap.setData(root);
}

// 删除节点
function removeNode(parent: IPureNode, index: number) {
  parent.children.splice(index, 1);
  markmap.setData(root);
}
```

### 3. 节点事件监听

```typescript
// 监听节点点击
const svg = document.querySelector('#markmap');
svg.addEventListener('click', (e) => {
  const nodeEl = e.target.closest('.markmap-node');
  if (nodeEl) {
    const nodeData = nodeEl.__data__ as INode;
    console.log('Clicked node:', {
      content: nodeData.content,
      depth: nodeData.state.depth,
      path: nodeData.state.path,
      payload: nodeData.payload
    });
  }
});

// 监听折叠/展开
svg.addEventListener('click', (e) => {
  const circleEl = e.target.closest('circle');
  if (circleEl) {
    const nodeData = circleEl.parentElement.__data__ as INode;
    const isFolded = nodeData.payload?.fold;
    console.log('Toggle node:', nodeData.content, 'folded:', isFolded);
  }
});
```

### 4. 自定义样式

```typescript
// 通过 CSS 自定义样式
const style = document.createElement('style');
style.textContent = `
  /* 自定义节点样式 */
  .markmap-node > circle {
    fill: #4CAF50;
    stroke: #2E7D32;
    stroke-width: 2px;
  }
  
  /* 自定义连线样式 */
  .markmap-link {
    stroke: #2196F3;
    stroke-width: 2px;
  }
  
  /* 自定义文本样式 */
  .markmap-foreign {
    font-family: 'Arial', sans-serif;
    font-size: 14px;
  }
  
  /* 根据深度自定义样式 */
  .markmap-node[data-depth="0"] > circle {
    fill: #FF5722;
  }
  
  .markmap-node[data-depth="1"] > circle {
    fill: #4CAF50;
  }
`;
document.head.appendChild(style);
```

### 5. 导出功能

```typescript
// 导出为 SVG
function exportSVG() {
  const svg = document.querySelector('#markmap');
  const svgData = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgData], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'markmap.svg';
  a.click();
}

// 导出为 PNG
async function exportPNG() {
  const svg = document.querySelector('#markmap');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const svgData = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  
  await new Promise(resolve => img.onload = resolve);
  
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'markmap.png';
    a.click();
  });
}

// 导出为 JSON
function exportJSON() {
  const data = JSON.stringify(root, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'markmap.json';
  a.click();
}
```

### 6. 搜索和过滤

```typescript
// 搜索节点
function searchNodes(root: IPureNode, keyword: string): IPureNode[] {
  const results: IPureNode[] = [];
  
  function search(node: IPureNode) {
    if (node.content.toLowerCase().includes(keyword.toLowerCase())) {
      results.push(node);
    }
    node.children.forEach(search);
  }
  
  search(root);
  return results;
}

// 高亮搜索结果
function highlightNodes(nodes: IPureNode[]) {
  const svg = document.querySelector('#markmap');
  
  // 清除之前的高亮
  svg.querySelectorAll('.highlight').forEach(el => {
    el.classList.remove('highlight');
  });
  
  // 添加新的高亮
  nodes.forEach(node => {
    const nodeEl = svg.querySelector(`[data-path="${node.state.path}"]`);
    if (nodeEl) {
      nodeEl.classList.add('highlight');
    }
  });
}

// 过滤节点
function filterNodes(root: IPureNode, predicate: (node: IPureNode) => boolean): IPureNode {
  function filter(node: IPureNode): IPureNode | null {
    if (!predicate(node)) return null;
    
    return {
      ...node,
      children: node.children
        .map(filter)
        .filter(Boolean) as IPureNode[]
    };
  }
  
  return filter(root) || { content: '', children: [] };
}
```

### 7. 性能优化

```typescript
// 延迟加载大型树
function lazyLoadTree(root: IPureNode, maxDepth: number = 2) {
  function truncate(node: IPureNode, depth: number): IPureNode {
    if (depth >= maxDepth && node.children.length > 0) {
      return {
        ...node,
        payload: {
          ...node.payload,
          fold: 1,
          hasMore: true
        },
        children: []
      };
    }
    
    return {
      ...node,
      children: node.children.map(child => truncate(child, depth + 1))
    };
  }
  
  return truncate(root, 0);
}

// 虚拟滚动（大量节点时）
function enableVirtualScroll(markmap: Markmap) {
  const svg = markmap.svg.node();
  const viewport = svg.getBoundingClientRect();
  
  // 只渲染可见区域的节点
  markmap.svg.selectAll('.markmap-node').each(function(d: INode) {
    const el = this as SVGElement;
    const rect = el.getBoundingClientRect();
    
    if (rect.top > viewport.bottom || rect.bottom < viewport.top) {
      el.style.display = 'none';
    } else {
      el.style.display = '';
    }
  });
}
```

---

## markmap-lib

### 概述
`markmap-lib` 负责将 Markdown 文本转换为思维导图的数据结构。

### 安装
```bash
npm install markmap-lib
```

### 核心类：Transformer

#### 构造函数
```typescript
new Transformer(plugins?: ITransformPlugin[])
```

**参数：**
- `plugins` (可选): 插件数组，用于扩展转换功能
  - 默认值：`builtInPlugins`（内置插件）
  - 类型：`ITransformPlugin[]`

**内置插件：**
```typescript
import { Transformer, builtInPlugins } from 'markmap-lib';

// 使用默认插件
const transformer = new Transformer();

// 使用自定义插件
const transformer = new Transformer([...builtInPlugins, myPlugin]);

// 不使用任何插件
import { Transformer } from 'markmap-lib/no-plugins';
const transformer = new Transformer();
```

#### 方法：transform()

将 Markdown 文本转换为思维导图数据。

```typescript
transformer.transform(markdown: string): TransformResult
```

**参数：**
- `markdown`: Markdown 文本字符串

**返回值：** `TransformResult` 对象
```typescript
{
  root: INode,      // 根节点数据
  features: object  // 使用的功能特性
}
```

**INode 节点结构：**
```typescript
interface INode {
  content: string;           // 节点的 HTML 内容
  children?: INode[];        // 子节点数组
  payload?: {                // 自定义数据
    [key: string]: any;
  };
  depth?: number;            // 节点深度
  state?: {                  // 节点状态
    path?: string;
    fold?: number;           // 0=展开, 1=折叠
  };
}
```

**示例：**
```typescript
const markdown = `
# 第一章
## 第一节
### 小节1
## 第二节
`;

const { root, features } = transformer.transform(markdown);
console.log(root); // 树形数据结构
```

#### 方法：getUsedAssets()

获取当前使用的功能所需的外部资源（CSS/JS）。

```typescript
transformer.getUsedAssets(features: object): Assets
```

**参数：**
- `features`: `transform()` 返回的 features 对象

**返回值：** `Assets` 对象
```typescript
{
  styles: Array<{ type: 'stylesheet', data: { href: string } }>,
  scripts: Array<{ type: 'script', data: { src: string } }>
}
```

**示例：**
```typescript
const { root, features } = transformer.transform(markdown);
const assets = transformer.getUsedAssets(features);

// 加载 CSS
assets.styles?.forEach(style => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = style.data.href;
  document.head.appendChild(link);
});
```

#### 方法：getAssets()

获取所有可能使用的资源（不考虑当前文档实际使用了哪些功能）。

```typescript
transformer.getAssets(): Assets
```

**返回值：** 同 `getUsedAssets()`

---

## markmap-view

### 概述
`markmap-view` 负责将数据渲染为交互式的 SVG 思维导图。

### 安装
```bash
npm install markmap-view
```

### 核心类：Markmap

#### 静态方法：create()

创建并初始化一个 Markmap 实例。

```typescript
Markmap.create(
  container: string | SVGElement,
  options?: IMarkmapOptions,
  root?: INode
): Markmap
```

**参数：**

1. **container**: SVG 容器
   - 类型：`string | SVGElement`
   - 说明：CSS 选择器字符串（如 `'#markmap'`）或 SVG DOM 元素

2. **options** (可选): 配置选项
   - 类型：`IMarkmapOptions`
   - 说明：低级配置对象，包含函数，不可序列化
   - 推荐：使用 `deriveOptions(jsonOptions)` 生成

3. **root** (可选): 数据根节点
   - 类型：`INode`
   - 说明：由 `markmap-lib` 的 `transform()` 生成

**返回值：** `Markmap` 实例

**示例：**
```typescript
import { Markmap } from 'markmap-view';

// 方式1：使用选择器
const mm = Markmap.create('#markmap', options, root);

// 方式2：使用 DOM 元素
const svg = document.querySelector('#markmap');
const mm = Markmap.create(svg, options, root);
```

#### 实例方法：setData()

更新思维导图的数据。

```typescript
markmap.setData(root: INode, options?: IMarkmapOptions): void
```

**参数：**
- `root`: 新的根节点数据
- `options` (可选): 新的配置选项

**特性：**
- 保持当前的缩放和平移状态
- 保持节点的折叠/展开状态

**示例：**
```typescript
const { root: newRoot } = transformer.transform(newMarkdown);
markmap.setData(newRoot);
```

#### 实例方法：fit()

自动调整视图以适应所有内容。

```typescript
markmap.fit(): void
```

**示例：**
```typescript
markmap.fit(); // 缩放并平移以显示完整思维导图
```

#### 实例方法：destroy()

销毁 Markmap 实例，清理资源。

```typescript
markmap.destroy(): void
```

#### 实例属性

```typescript
markmap.svg        // D3 selection 对象
markmap.zoom       // D3 zoom 行为对象
markmap.state      // 当前状态
markmap.state.data // 当前的根节点数据
```

### 工具函数：deriveOptions()

将可序列化的 JSON 配置转换为 Markmap 所需的低级选项对象。

```typescript
deriveOptions(jsonOptions: IMarkmapJSONOptions): IMarkmapOptions
```

**参数：**
- `jsonOptions`: JSON 格式的配置对象

**返回值：** `IMarkmapOptions` 对象

**示例：**
```typescript
import { deriveOptions } from 'markmap-view';

const jsonOptions = {
  color: ['#4CAF50', '#2196F3', '#FF9800'],
  duration: 500,
  maxWidth: 300,
  initialExpandLevel: 2
};

const options = deriveOptions(jsonOptions);
const mm = Markmap.create('#markmap', options, root);
```

### 工具函数：loadCSS() / loadJS()

动态加载外部资源。

```typescript
loadCSS(styles: Array<{ data: { href: string } }>): void
loadJS(scripts: Array<{ data: { src: string } }>, options?: object): void
```

**示例：**
```typescript
import { loadCSS, loadJS } from 'markmap-view';

const { root, features } = transformer.transform(markdown);
const assets = transformer.getUsedAssets(features);

if (assets.styles) loadCSS(assets.styles);
if (assets.scripts) {
  loadJS(assets.scripts, {
    getMarkmap: () => markmap
  });
}
```

---

## JSON 配置选项 (IMarkmapJSONOptions)

这些选项可以序列化为 JSON，适合存储在配置文件或 Markdown frontmatter 中。

### 颜色配置

#### color
- **类型：** `string | string[]`
- **默认值：** `d3.schemeCategory10`
- **说明：** 节点分支和圆圈的颜色列表

```typescript
color: ['#4CAF50', '#2196F3', '#FF9800']
```

#### colorFreezeLevel
- **类型：** `number`
- **默认值：** `0`
- **说明：** 冻结颜色的层级，子分支将使用祖先节点的颜色
  - `0`: 不冻结
  - `2`: 从第2层开始，所有子节点使用相同颜色

```typescript
colorFreezeLevel: 2
```

### 动画配置

#### duration
- **类型：** `number`
- **默认值：** `500`
- **说明：** 折叠/展开动画的持续时间（毫秒）

```typescript
duration: 300
```

### 布局配置

#### spacingHorizontal
- **类型：** `number`
- **默认值：** `80`
- **说明：** 节点之间的水平间距

#### spacingVertical
- **类型：** `number`
- **默认值：** `5`
- **说明：** 节点之间的垂直间距

#### maxWidth
- **类型：** `number`
- **默认值：** `0`
- **说明：** 节点内容的最大宽度，`0` 表示无限制

```typescript
maxWidth: 300
```

#### lineWidth
- **类型：** `number`
- **默认值：** 未指定
- **说明：** 节点之间连线的宽度（v0.18.8+）

### 初始状态配置

#### initialExpandLevel
- **类型：** `number`
- **默认值：** `-1`
- **说明：** 初始渲染时展开的最大层级
  - `-1`: 展开所有层级
  - `0`: 全部折叠
  - `2`: 展开到第2层

```typescript
initialExpandLevel: 2
```

### 交互配置

#### zoom
- **类型：** `boolean`
- **默认值：** `true`
- **说明：** 是否允许缩放

#### pan
- **类型：** `boolean`
- **默认值：** `true`
- **说明：** 是否允许平移

### 外部资源

#### extraJs
- **类型：** `string[]`
- **说明：** 额外的 JavaScript URL 列表
- **特殊前缀：** `npm:` 开头会被解析为 npm 包

```typescript
extraJs: ['npm:katex@0.16.0/dist/katex.min.js']
```

#### extraCss
- **类型：** `string[]`
- **说明：** 额外的 CSS URL 列表

```typescript
extraCss: ['npm:katex@0.16.0/dist/katex.min.css']
```

---

## 完整使用示例

### 基础示例

```typescript
import { Transformer } from 'markmap-lib';
import { Markmap, deriveOptions } from 'markmap-view';

// 1. 创建转换器
const transformer = new Transformer();

// 2. 转换 Markdown
const markdown = `
# 项目
## 前端
### React
### Vue
## 后端
### Node.js
### Python
`;

const { root, features } = transformer.transform(markdown);

// 3. 获取资源
const assets = transformer.getUsedAssets(features);

// 4. 加载资源（如果需要）
// loadCSS(assets.styles);
// loadJS(assets.scripts);

// 5. 配置选项
const options = deriveOptions({
  color: ['#4CAF50', '#2196F3', '#FF9800'],
  duration: 500,
  initialExpandLevel: -1,
  spacingHorizontal: 80,
  spacingVertical: 20
});

// 6. 创建思维导图
const mm = Markmap.create('#markmap', options, root);

// 7. 适应视图
setTimeout(() => mm.fit(), 100);
```

### 更新数据示例

```typescript
// 监听内容变化
function updateMarkmap(newMarkdown: string) {
  const { root: newRoot } = transformer.transform(newMarkdown);
  mm.setData(newRoot); // 保持当前缩放和折叠状态
}
```

### 自定义插件示例

```typescript
import { Transformer, builtInPlugins } from 'markmap-lib';

// 自定义插件：解析图片路径
const resolveImagePath = {
  name: 'resolveImagePath',
  transform(ctx) {
    ctx.parser.tap((md) => {
      const defaultRender = md.renderer.rules.image || 
        ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
      
      md.renderer.rules.image = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const src = token.attrGet('src');
        if (src && !src.startsWith('http')) {
          token.attrSet('src', `/absolute/path/${src}`);
        }
        return defaultRender(tokens, idx, options, env, self);
      };
    });
    return {};
  }
};

// 使用自定义插件
const transformer = new Transformer([...builtInPlugins, resolveImagePath]);
```

### 节点操作示例

```typescript
// 添加自定义路径信息
function addNodePath(node: INode, parentPath = '') {
  if (node.content) {
    const currentPath = parentPath 
      ? `${parentPath}\n${node.content}` 
      : node.content;
    
    node.payload = node.payload || {};
    node.payload.path = currentPath;
  }
  
  if (node.children) {
    node.children.forEach(child => 
      addNodePath(child, node.payload?.path || '')
    );
  }
}

const { root } = transformer.transform(markdown);
addNodePath(root);
```

---

## 常见问题

### Q: 如何保持节点折叠状态？
A: 使用 `setData()` 而不是重新创建实例：
```typescript
markmap.setData(newRoot); // 保持状态
```

### Q: 如何监听节点点击？
A: 使用事件委托：
```typescript
svg.addEventListener('click', (e) => {
  const nodeEl = e.target.closest('.markmap-node');
  if (nodeEl) {
    const nodeData = nodeEl.__data__; // D3 绑定的数据
    console.log(nodeData);
  }
});
```

### Q: 如何自定义样式？
A: 使用 CSS 覆盖：
```css
.markmap-node > circle {
  stroke-width: 2px;
}

.markmap-link {
  stroke-width: 1.5px;
}
```

---

## 工作流程总结

### 你的理解是正确的！

**markmap-lib 的工作流程：**

1. **提取标题**：从 Markdown 文本中提取所有标题行（`#` 开头）
2. **解析内容**：使用 markdown-it 将标题内容转换为 HTML
3. **分析层级**：根据 `#` 的数量确定标题的层级关系
4. **构建树形结构**：创建 `IPureNode` 对象，通过 `children` 数组维护父子关系
5. **返回根节点**：返回包含完整树形结构的根节点

**关键点：**
- ✅ 提取所有标题（`#` 开头的行）
- ✅ 根据标题层级（`#` 数量）确定结构关系
- ✅ 转换为 `IPureNode` 大对象
- ✅ `children?: IPureNode[]` 维护结构关系

**markmap-view 的工作流程：**

1. **接收数据**：接收 `IPureNode` 树形结构
2. **添加状态**：为每个节点添加 `state` 属性，转换为 `INode`
3. **计算布局**：使用 D3.js 的层级布局算法计算节点位置
4. **渲染 SVG**：创建 SVG 元素并绑定数据
5. **添加交互**：绑定点击、缩放、拖拽等事件
6. **应用动画**：添加过渡动画效果

**关键点：**
- ✅ 通过 `INode` 构建思维导图
- ✅ `children` 数组维护树形结构
- ✅ 使用 D3.js 进行可视化渲染

### 完整示例

```typescript
// ========== 阶段 1: markmap-lib 解析 ==========
import { Transformer } from 'markmap-lib';

const markdown = `
# 根节点
## 子节点 1
### 孙节点 1.1
### 孙节点 1.2
## 子节点 2
`;

const transformer = new Transformer();
const { root } = transformer.transform(markdown);

// root 的结构：
// {
//   content: '<strong>根节点</strong>',
//   children: [
//     {
//       content: '<strong>子节点 1</strong>',
//       children: [
//         { content: '<strong>孙节点 1.1</strong>', children: [] },
//         { content: '<strong>孙节点 1.2</strong>', children: [] }
//       ]
//     },
//     {
//       content: '<strong>子节点 2</strong>',
//       children: []
//     }
//   ]
// }

// ========== 阶段 2: markmap-view 渲染 ==========
import { Markmap } from 'markmap-view';

const mm = Markmap.create('#svg', {
  color: ['#4CAF50', '#2196F3', '#FF9800'],
  duration: 500,
  initialExpandLevel: -1
}, root);

// Markmap 内部会：
// 1. 将 IPureNode 转换为 INode（添加 state）
// 2. 使用 D3.js 计算节点位置
// 3. 创建 SVG 元素
// 4. 绑定交互事件
// 5. 渲染思维导图
```

### 数据结构对比

| 属性 | IPureNode (markmap-lib) | INode (markmap-view) |
|------|------------------------|---------------------|
| `content` | ✅ HTML 内容 | ✅ 继承 |
| `children` | ✅ 子节点数组 | ✅ 继承 |
| `payload` | ✅ 自定义数据 | ✅ 继承 |
| `payload.fold` | ✅ 折叠状态（数据） | ✅ 继承（控制渲染） |
| `state` | ❌ 无 | ✅ 渲染状态 |
| `state.id` | ❌ 无 | ✅ 唯一ID |
| `state.path` | ❌ 无 | ✅ 节点路径 |
| `state.depth` | ❌ 无 | ✅ 节点深度 |
| `state.el` | ❌ 无 | ✅ DOM 元素 |

**⚠️ 关键区别：**
- `payload.fold` 在两种类型中都存在，但用途不同：
  - 在 `IPureNode` 中：**数据持久化**（可序列化保存）
  - 在 `INode` 中：**控制渲染**（决定是否显示子节点）
- `state` 只在 `INode` 中存在，**不可序列化**（包含 DOM 引用）

### 关键概念

1. **children 数组是核心**
   - 维护树形结构的唯一方式
   - 通过嵌套实现层级关系
   - 可以递归遍历整棵树
   - **永远不要删除 children 来实现折叠**

2. **fold 属性的正确使用**
   - ✅ 存储在 `payload.fold` 中（不是 `state.fold`）
   - ✅ 值为 `1` 或 `2` 表示折叠，`undefined` 或 `0` 表示展开
   - ✅ 修改后需要调用 `markmap.renderData()` 或 `markmap.setData()`
   - ❌ 不要直接修改 `children` 数组来实现折叠

3. **IPureNode vs INode**
   - `IPureNode`: 纯数据，可序列化，由 markmap-lib 生成
   - `INode`: 带渲染状态，不可序列化，由 markmap-view 使用
   - 两者都有 `payload.fold`，但 `INode` 额外有 `state` 对象

4. **单向数据流**
   - Markdown → IPureNode → INode → SVG
   - 每个阶段都是单向转换
   - 不能从 SVG 反向生成 Markdown

5. **扩展性**
   - 使用 `payload` 存储自定义数据
   - 使用插件系统扩展功能
   - 使用 Hook 系统拦截处理流程

---

## 参考资源

- [官方文档](https://markmap.js.org/)
- [GitHub 仓库](https://github.com/markmap/markmap)
- [API 文档](https://markmap.js.org/api/)
