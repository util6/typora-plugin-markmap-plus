# 版本发布指南

本文档说明如何触发 GitHub Actions 自动构建和发布新版本。

## 发布流程

### 1. 更新版本号

首先更新 `package.json` 中的版本号：

```bash
# 手动编辑 package.json，将 version 从 "1.0.0" 改为 "1.1.0"
# 或使用 npm 命令自动更新
npm version patch   # 1.0.0 -> 1.0.1 (修复版本)
npm version minor   # 1.0.0 -> 1.1.0 (功能版本)
npm version major   # 1.0.0 -> 2.0.0 (重大版本)
```

### 2. 提交代码

```bash
git add .
git commit -m "feat: 添加实时渲染功能

- 新增实时更新开关设置
- 实现内容变化监听和防抖更新
- 支持标题结构差异检测
- 优化用户体验"
```

### 3. 创建并推送标签

**关键步骤**：GitHub Actions 通过 **git tag** 触发，标签格式必须是 `v*`：

```bash
# 创建标签（版本号要与 package.json 一致）
git tag v1.1.0

# 推送代码和标签到远程仓库
git push origin main
git push origin v1.1.0
```

### 4. 自动构建发布

推送标签后，GitHub Actions 会自动：

1. ✅ 检出代码
2. ✅ 安装 Node.js 和依赖
3. ✅ 执行 `npm run package` 构建
4. ✅ 创建 `typora-plugin-markmap-plus-v1.1.0.zip` 发布包
5. ✅ 在 GitHub Releases 页面创建新版本
6. ✅ 自动生成发布说明

## 快速命令

```bash
# 一键发布补丁版本
npm version patch && git push origin main && git push origin --tags

# 一键发布功能版本  
npm version minor && git push origin main && git push origin --tags

# 一键发布重大版本
npm version major && git push origin main && git push origin --tags
```

## 注意事项

- 🏷️ **标签格式**：必须是 `v1.0.0` 格式，不能是 `1.0.0`
- 📦 **package.json**：版本号要与标签一致
- 🚀 **推送标签**：必须推送标签才能触发 workflow
- 📝 **发布说明**：GitHub 会自动生成，基于提交信息

## 检查发布状态

1. 访问 [GitHub Actions](https://github.com/util6/typora-plugin-markmap-plus/actions)
2. 查看 "Release" workflow 运行状态
3. 发布完成后在 [Releases](https://github.com/util6/typora-plugin-markmap-plus/releases) 页面查看

## 当前版本

当前版本：`v1.0.0` → 建议升级到 `v1.1.0`（新增实时渲染功能）
