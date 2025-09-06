# Typora Plugin Markmap

English | [简体中文](./README.zh-CN.md)

This a plugin based on [typora-community-plugin][core] for [Typora](https://typora.io).

Use Markmap in Typora:

- [x] codeblock type: `markmap`
- [x] custom options
  - local options in the front matter inside a codeblock
    > ```markmap
    > ---
    > colorFreezeLevel: 2
    > ---
    >
    > (markdown content ...)
    > ```
  - global options in Settings Modal
    > ```yaml
    > colorFreezeLevel: 2
    > ```
- [x] Use command to `View the editing markdown with Markmap on right`
  - local options in the front matter
    > ```markdown
    > ---
    > markmap:
    >   colorFreezeLevel: 2
    > ---
    >
    > (markdown content ...)
    > ```



## Preview

![](./docs/assets/base.png)



## Install

1. Install [typora-community-plugin][core]
2. Open "Settings -> Plugin Marketplace" search "Markmap" then install it.



[core]: https://github.com/typora-community-plugin/typora-community-plugin
