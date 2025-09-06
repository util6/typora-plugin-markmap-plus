# Typora Plugin Markmap

[English](./README.md) | 简体中文

这是一个基于 [typora-community-plugin][core] 开发的，适用于 [Typora](https://typora.io) 的插件。

在 Typora 中使用 Markmap：

- [x] `markmap` 类型代码块
- [x] 自定义配置
  - 在代码块中的 Front Matter 可配置本地配置
    > ```markmap
    > ---
    > colorFreezeLevel: 2
    > ---
    >
    > (这里是 Markdown 内容……)
    > ```
  - 在插件配置对话框中可配置全局配置
    > ```yaml
    > colorFreezeLevel: 2
    > ```
- [x] 使用命令 `在右侧打开正在编辑的 Markdown 的 Markmap 视图`
  - 在 Markdown 文件中的 Front Matter 可配置本地配置
    > ```markdown
    > ---
    > markmap:
    >   colorFreezeLevel: 2
    > ---
    >
    > (markdown content ...)
    > ```



## 预览

![](./docs/assets/base.png)



## 安装

1. 安装 [typora-community-plugin][core]
2. 在 “设置 -> 插件市场” 中搜索 “Markmap” 并安装



[core]: https://github.com/typora-community-plugin/typora-community-plugin
