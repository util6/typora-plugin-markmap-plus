# 从零开始搭建 GitHub Actions 自动化发布流程

本文档是一份详细的教程，记录了如何为一个项目从零开始，设计并实现一套完整的 GitHub Actions 自动化发布流程。它涵盖了从最初的需求分析、方案设计，到具体的文件创建、问题排错和最终方案的形成的全过程。

## 1. 目标

项目的核心需求是：当需要发布新版本时，能够将项目编译产物（`dist` 目录）自动打包，并创建一个对应的 GitHub Release，将打包好的文件作为 "Asset" 供用户下载。

## 2. 设计思路

为了实现这个目标，我们设计了一个两阶段的方案：

1.  **本地脚本 (`release.sh`)**：负责处理所有在本地机器上应该完成的、需要人工确认的操作。这主要包括：
    *   更新 `package.json` 中的版本号。
    *   提交版本号变更到 Git。
    *   创建一个 Git 标签来标记这个版本。
    *   将标签推送到 GitHub。

2.  **远程 GitHub Actions 工作流 (`.github/workflows/release.yml`)**：负责处理所有在云端服务器上可以自动完成的、无需人工干预的操作。它的触发器是接收到新的 Git 标签推送。
    *   检出代码。
    *   安装依赖、运行构建（`npm run package`）。
    *   将 `dist` 目录打包成 `.zip` 文件。
    *   利用这个标签，自动创建一个 GitHub Release，并上传 `.zip` 包。

这种设计将“决策”（发布哪个版本）和“执行”（构建、打包、上传）分离开，流程清晰且易于管理。

## 3. 实现步骤

我们首先创建了这两个文件的初始版本。

### 步骤 3.1: 创建 GitHub Actions 工作流 (`release.yml`)

在项目根目录下创建 `.github/workflows/` 文件夹，并在其中创建 `release.yml` 文件。这是我们设想的初始版本：

```yaml
# .github/workflows/release.yml (初始版本)
name: Release

on:
  push:
    tags:
      - 'v*' # 当一个 v 开头的标签被推送到仓库时触发

jobs:
  release:
    runs-on: ubuntu-latest # 在最新的 Ubuntu 服务器上运行
    
    steps:
    - uses: actions/checkout@v4 # 第一步：检出代码
    
    - name: Setup Node.js # 第二步：设置 Node.js 环境
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies # 第三步：安装依赖
      run: npm ci # 使用 npm ci 进行快速、干净的安装
    
    - name: Build # 第四步：运行打包命令
      run: npm run package
    
    - name: Create release package # 第五步：压缩产物
      run: |
        cd dist
        zip -r ../typora-plugin-markmap-plus-${{ github.ref_name }}.zip .
        cd ..
    
    - name: Create Release # 第六步：创建 Release 并上传
      uses: softprops/action-gh-release@v2
      with:
        files: typora-plugin-markmap-plus-${{ github.ref_name }}.zip
        generate_release_notes: true
```

### 步骤 3.2: 创建本地发布脚本 (`release.sh`)

在项目根目录下创建 `release.sh` 文件，用于简化本地操作。

```bash
# release.sh (初始版本)
#!/bin/bash
set -e # 任何命令失败则立即退出

# 检查是否提供了版本号
if [ -z "$1" ]; then
    echo "用法: ./release.sh <版本号>"
    exit 1
fi

VERSION=$1

# 1. 更新 package.json 版本号
npm version $VERSION --no-git-tag-version

# 2. 提交版本更改
git add package.json package-lock.json
git commit -m "chore: bump version to v$VERSION"
git push origin main

# 3. 创建并推送 tag (这将触发 GitHub Actions)
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin "v$VERSION"
```

## 4. 首次运行与排错

当我们带着这两个文件首次尝试运行 `./release.sh 1.0.0` 时，遇到了一系列问题，这揭示了我们初始设计中的缺陷。

- **问题一：`package-lock.json` 被 `.gitignore` 忽略**
  - **现象与原因**：`release.sh` 脚本在 `git add` 步骤失败，因为 `.gitignore` 文件忽略了 `package-lock.json`。
  - **解决方案**：从 `.gitignore` 中移除 `package-lock.json`。

- **问题二：脚本非幂等性导致 `Version not changed`**
  - **现象与原因**：第一次运行失败后，版本号已被修改。再次运行时，`npm version` 命令因版本未变而报错。
  - **解决方案**：手动完成第一次运行未完成的 Git 操作，然后继续。

- **问题三：Action 构建失败 - `Cannot find module @rollup/rollup-linux-x64-gnu`**
  - **现象与原因**：这是一个典型的跨平台依赖问题。在 macOS 上生成的 `package-lock.json` 在 Linux 环境下使用 `npm ci` 时，未能正确安装平台相关的可选依赖。
  - **最终解决方案**：修改 `release.yml`，在 `npm install` 前强制删除 `package-lock.json`，迫使 `npm` 根据当前系统环境（Linux）重新生成依赖树。

- **问题四（预判）：Action 发布权限不足**
  - **分析**：`softprops/action-gh-release` 操作需要向仓库写入（创建 Release），默认的 token 权限可能不足。
  - **解决方案**：在 `release.yml` 的 job 中主动声明写入权限：`permissions: { contents: write }`。

## 5. 最终方案

在经历了上述排错后，我们得到了最终稳定可用的版本。

### `release.sh` (最终版 - 无变化)

本地脚本的设计没有变化，但我们知道了它的脆弱性（非幂等）。

### `.github/workflows/release.yml` (最终版)

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions: # <-- 增加了权限声明
      contents: write
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies # <-- 修改了安装步骤
      run: |
        rm -f package-lock.json
        npm install
    
    - name: Build
      run: npm run package
    
    - name: Create release package
      run: |
        cd dist
        zip -r ../typora-plugin-markmap-plus-${{ github.ref_name }}.zip .
        cd ..
        ls -la *.zip
    
    - name: Create Release
      uses: softprops/action-gh-release@v2
      with:
        files: typora-plugin-markmap-plus-${{ github.ref_name }}.zip
        generate_release_notes: true
```

## 6. 使用指南

在完成所有功能开发和测试，并确保代码都已提交到 `main` 分支后，在项目根目录执行以下命令即可完成一次新版本的发布：

```bash
./release.sh <新版本号>
# 例如: ./release.sh 1.0.1
```

## 附录：相关工具对比

在讨论自动化流程时，经常会提到 Jenkins、SkyWalking 等工具。这里对它们的定位和作用进行简单对比。

### GitHub Actions vs. Jenkins

这两者是同类工具，都属于 **CI/CD (持续集成/持续部署)** 领域。

-   **共同点**：核心目标都是自动化软件的构建、测试和部署流程。我们在这个项目中用 GitHub Actions 来“自动打包并创建Release”，这正是 CI/CD 的一种典型应用。

-   **不同点**：
    -   **托管方式**：**GitHub Actions** 是与 GitHub 深度集成的 SaaS（软件即服务）产品，你无需管理服务器，开箱即用。而 **Jenkins** 是一个开源的、需要**自托管**的工具，你需要自己准备服务器并负责其安装、配置和维护。
    -   **配置方式**：**GitHub Actions** 完全通过代码（存储在仓库中的 `.yml` 文件）来定义工作流，这被称为 "Pipeline as Code"。而 **Jenkins** 虽然也支持 `Jenkinsfile` 进行代码化配置，但传统上更多地依赖其 Web 界面进行点击操作。
    -   **集成度**：**GitHub Actions** 作为 GitHub 的“亲儿子”，与代码仓库、Pull Request、Releases 等功能无缝集成。而 **Jenkins** 需要通过安装各种插件来与 GitHub 或其他系统进行集成。

-   **小结**：GitHub Actions 更现代、更轻量，与 GitHub 生态结合紧密，适合大多数托管在 GitHub 上的项目。Jenkins 更传统、功能更强大、插件生态更丰富，提供了极高的定制性，但维护成本也更高。

### GitHub Actions vs. SkyWalking

这两者是**完全不同领域**的工具，它们在软件生命周期中所处的阶段也完全不同。

-   **GitHub Actions (CI/CD 工具)**：
    -   **作用于“开发和部署”阶段**。它是一个**“工人”**，负责将你的源代码（原材料）通过一系列加工（编译、打包），最终变成可交付的产品（软件 Release 版本）。
    -   **关心的是**：代码能否成功编译？测试是否通过？版本是否成功发布？

-   **SkyWalking (APM 工具)**：
    -   **作用于“运行和维护”阶段**。它是一个**“医生”或“监控系统”**，负责监控**已经发布上线**的应用程序的健康状况。
    -   **关心的是**：线上服务的响应时间是多少？哪个方法的调用最慢？当一个请求失败时，问题出在哪个微服务上？系统的实时性能（CPU、内存）如何？

-   **一个比喻**：如果把开发一个软件比作“建造一栋大楼”：
    -   **GitHub Actions** 就是自动化的**“建筑流水线”**，负责吊装、焊接、装修，直到大楼竣工交付。
    -   **SkyWalking** 则是大楼交付使用后，遍布在水、电、网络、电梯系统里的**“监控探头和警报系统”**，它实时监控大楼的运行状态，并在出现问题时（如水管爆裂、电梯故障）发出警报。

**总结：我们使用 GitHub Actions 来“建造”我们的软件，而 SkyWalking 这类工具则用来“监控”我们已经建好的软件。**
