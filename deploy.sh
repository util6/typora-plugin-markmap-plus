#!/bin/bash

# 快速、健壮的 Typora 插件部署脚本
#
# 该脚本会自动完成以下操作:
# 1. 运行构建命令。
# 2. 从 `manifest.json` 读取插件名称，并生成符合规范的目录名 (例如, "My Plugin" -> "my-plugin")。
# 3. 在 Typora 插件目录中创建该目录。
# 4. 将 `release/markmap` 目录下的所有构建产物复制到目标目录。
# 5. 重启 Typora 应用。
#
# 使用方法:
# ./deploy.sh          # 开发模式 (保留 logger)
# ./deploy.sh --prod    # 生产模式 (移除 logger)

set -e # 如果任何命令失败，立即退出脚本

# 检查模式参数
PRODUCTION_MODE=false
if [ "$1" = "--prod" ] || [ "$1" = "-p" ]; then
    PRODUCTION_MODE=true
    echo "🚀 开始生产模式部署 Markmap 插件 (无 logger)..."
else
    echo "🚀 开始开发模式部署 Markmap 插件 (保留 logger)..."
fi

# --- 路径定义 ---
# 使用 `cd` 和 `pwd` 来获取脚本所在的绝对路径，增强可移植性
PROJECT_DIR=$(cd "$(dirname "$0")" && pwd)
RELEASE_DIR="$PROJECT_DIR/dist"
# 使用 ~ 代替 /Users/username，提高可移植性
TYPORA_PLUGINS_ROOT_DIR=~/"Library/Application Support/abnerworks.Typora/plugins/plugins"

# --- 1. 构建项目 ---
cd "$PROJECT_DIR"
if [ "$PRODUCTION_MODE" = true ]; then
    echo "📦 正在构建项目 (生产模式)..."
    yarn build:prod # 生产构建，移除 logger
else
    echo "📦 正在构建项目 (开发模式)..."
    yarn build # 开发构建，保留 logger
fi

# --- 2. 获取插件名称并确定目标路径 ---
MANIFEST_FILE="$RELEASE_DIR/manifest.json"
echo "🔍 正在从 $MANIFEST_FILE 读取插件信息..."

if [ ! -f "$MANIFEST_FILE" ]; then
    echo "❌ 错误: 构建产物 'manifest.json' 未找到！请检查构建过程。"
    exit 1
fi

# 从 manifest.json 中提取 "name" 字段的值
# 使用 grep 和 sed，无需 jq 等外部依赖
PLUGIN_NAME=$(grep '"name"' "$MANIFEST_FILE" | head -1 | sed -e 's/.*: *//' -e 's/[",]//g')

if [ -z "$PLUGIN_NAME" ]; then
    echo "❌ 错误: 无法从 'manifest.json' 中解析插件名称。"
    exit 1
fi

# 将插件名称转换为 kebab-case (例如 "My Plugin" -> "my-plugin")
PLUGIN_DIR_NAME=$(echo "$PLUGIN_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
TARGET_DIR="$TYPORA_PLUGINS_ROOT_DIR/$PLUGIN_DIR_NAME"

echo "✔️ 插件名称: '$PLUGIN_NAME'"
echo "📂 目标目录: '$TARGET_DIR'"
if [ "$PRODUCTION_MODE" = true ]; then
    echo "🔧 构建模式: 生产模式 (无调试日志)"
else
    echo "🔧 构建模式: 开发模式 (包含调试日志)"
fi

# --- 3. 部署文件 ---
echo "📋 正在准备部署..."

# 创建目标目录，-p 可以确保父目录也存在
mkdir -p "$TARGET_DIR"

echo "📑 正在将所有构建文件从 '$RELEASE_DIR' 复制到 '$TARGET_DIR'..."
# 使用 -R 递归复制，使用 /。确保复制目录内容而不是目录本身
cp -R "$RELEASE_DIR/." "$TARGET_DIR/"

echo "✅ 文件复制完成。"

# --- 4. 重启 Typora ---
echo "🔄 正在重启 Typora..."
# 使用 osascript 平滑地退出和重启应用
osascript -e 'quit app "Typora"' 2>/dev/null || true
sleep 1 # 等待1秒确保应用完全退出
open -a Typora

if [ "$PRODUCTION_MODE" = true ]; then
    echo "🎉 生产模式部署成功! (无调试日志)"
else
    echo "🎉 开发模式部署成功! (包含调试日志)"
fi