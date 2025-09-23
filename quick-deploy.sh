#!/bin/bash

# 快速部署脚本 - 无交互版本
set -e

echo "🚀 快速部署 Markmap 插件..."

cd "/Users/util6/code-space/typora插件开发/typora-plugin-markmap"

# 构建
echo "📦 构建中..."
yarn package > /dev/null 2>&1

# 部署
echo "📋 部署中..."
cp "release/markmap/main.js" "/Users/util6/Library/Application Support/abnerworks.Typora/plugins/plugins/markmap-plus/main.js"
cp "release/markmap/manifest.json" "/Users/util6/Library/Application Support/abnerworks.Typora/plugins/plugins/markmap-plus/manifest.json"



# 重启 Typora
echo "🔄 重启 Typora..."
osascript -e 'quit app "Typora"' 2>/dev/null || true
sleep 1
open -a Typora

echo "✅ 部署完成!"
