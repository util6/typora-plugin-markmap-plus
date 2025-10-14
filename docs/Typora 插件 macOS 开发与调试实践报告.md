# Typora 插件 macOS 开发与调试实践报告

本文档旨在总结在 macOS 环境下开发和调试 Typora 插件，特别是涉及与 Typora 核心 API 交互、UI 构建及打包流程时所遇到的常见问题与核心策略。本文基于一次真实的插件迁移项目（将旧版 Markmap 功能迁移至新版插件框架）的经验编写。

## Typora在WIn和mac中的核心差异

**mac中 Typora ，不是一个基于 Chromium 内核的 Electron 应用，而是使用了苹果 macOS 系统原生的 WKWebView 作为渲染引擎。**

所以，在mac中开发和调试Typora有以下困难：

1. 没有内置开发工具：WKWebView 不自带 Chrome DevTools，必须从外部的 Safari 连接进行调试。
2. console.log 可能被抑制：在 WKWebView 的特定实现中，来自 file:// 协议脚本的 console.log 输出可能会因为安全策略或日志系统的不同而被丢弃或重定向，导致我们在 Safari 的控制台看不到它。
3. debugger; 不暂停：这是一个经典的竞争条件 (Race Condition) 问题。插件的 main.js 文件是在 Typora 启动的瞬间被加载和执行的。而您打开 Safari 并连接到 Typora 的调试器需要几秒钟的时间。当您的调试器“连接”上的那一刻，我们的 debugger; 语句早就已经执行完毕了。您看到的只是一个已经被加载、但早已执行结束的脚本。



