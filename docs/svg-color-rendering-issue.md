# SVG 颜色渲染问题解决方案

## 问题描述

悬浮按钮中的 SVG 图标无法正确渲染颜色，显示为空白或默认颜色，而不是 SVG 代码中定义的原始颜色。

## 问题原因

CSS 样式对 SVG 元素的 `fill` 和 `stroke` 属性进行了不当的覆盖，导致 SVG 原始的颜色属性被清除。

## 错误的解决尝试

### 尝试 1：使用 `!important` 强制重置
```css
.markmap-floating-button svg {
  color: initial !important;
}

.markmap-floating-button svg * {
  fill: unset !important;
  stroke: unset !important;
}
```
**结果**：失败，`unset` 会移除所有 fill 属性，包括 SVG 原始定义的颜色。

### 尝试 2：使用 `currentColor` 继承
```css
.markmap-floating-button svg {
  color: currentColor;
}

.markmap-floating-button svg path[fill] {
  fill: currentColor;
}
```
**结果**：失败，强制所有路径使用相同颜色，丢失了 SVG 的多色设计。

## 正确解决方案

**完全移除 CSS 对 SVG 颜色的干扰**：

```css
/* 让SVG使用原始颜色 */
.markmap-floating-button svg {
  width: 60%;
  height: 60%;
  max-width: 100%;
  max-height: 100%;
}
```

## 核心原则

1. **不要覆盖 SVG 的 fill/stroke 属性**：让 SVG 使用其内联定义的颜色
2. **只设置尺寸相关的 CSS**：width、height、max-width、max-height
3. **避免使用 `unset` 或 `initial`**：这些会清除 SVG 的原始属性
4. **避免强制继承颜色**：除非确实需要单色图标

## 最佳实践

- SVG 图标应该在其源码中定义好所有颜色
- CSS 只负责控制 SVG 的尺寸和位置
- 如需主题适配，考虑使用多套 SVG 而不是 CSS 覆盖
- 测试时要重新构建和部署插件才能看到效果

## 相关文件

- `src/components/FloatingButton.ts` - 悬浮按钮组件
- `src/settings.ts` - SVG 图标配置
