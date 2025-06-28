#!/bin/bash

# Markmap 插件自动化部署脚本
# 用于自动构建和部署到 Typora 插件目录

set -e  # 遇到错误立即退出

echo "🚀 开始 Markmap 插件自动化部署..."

# 定义路径
PROJECT_DIR="/Users/util6/code-space/typora插件开发/typora-plugin-markmap"
TYPORA_PLUGIN_DIR="/Users/util6/Library/Application Support/abnerworks.Typora/plugins/plugins/markmap"
RELEASE_FILE="$PROJECT_DIR/release/markmap/main.js"

# 进入项目目录
cd "$PROJECT_DIR"

echo "📁 当前工作目录: $(pwd)"

# 步骤1: 运行 yarn package
echo "📦 步骤1: 运行 yarn package..."
yarn package

# 检查构建是否成功
if [ ! -f "$RELEASE_FILE" ]; then
    echo "❌ 错误: 构建失败，找不到 $RELEASE_FILE"
    exit 1
fi

echo "✅ 构建成功，找到发布文件: $RELEASE_FILE"

# 步骤2: 创建目标目录（如果不存在）
echo "📂 步骤2: 检查目标目录..."
if [ ! -d "$TYPORA_PLUGIN_DIR" ]; then
    echo "📁 创建目标目录: $TYPORA_PLUGIN_DIR"
    mkdir -p "$TYPORA_PLUGIN_DIR"
fi

# 步骤3: 备份现有文件（如果存在）
BACKUP_FILE="$TYPORA_PLUGIN_DIR/main.js.backup.$(date +%Y%m%d_%H%M%S)"
if [ -f "$TYPORA_PLUGIN_DIR/main.js" ]; then
    echo "💾 备份现有文件到: $BACKUP_FILE"
    cp "$TYPORA_PLUGIN_DIR/main.js" "$BACKUP_FILE"
fi

# 步骤4: 复制新文件
echo "📋 步骤3: 复制新文件到 Typora 插件目录..."
cp "$RELEASE_FILE" "$TYPORA_PLUGIN_DIR/main.js"

# 验证复制是否成功
if [ -f "$TYPORA_PLUGIN_DIR/main.js" ]; then
    echo "✅ 文件复制成功!"
    
    # 显示文件信息
    echo "📊 文件信息:"
    ls -lh "$TYPORA_PLUGIN_DIR/main.js"
    
    # 检查文件大小
    FILE_SIZE=$(stat -f%z "$TYPORA_PLUGIN_DIR/main.js" 2>/dev/null || stat -c%s "$TYPORA_PLUGIN_DIR/main.js" 2>/dev/null)
    echo "📏 文件大小: $FILE_SIZE bytes"
    
    if [ "$FILE_SIZE" -lt 1000 ]; then
        echo "⚠️  警告: 文件大小异常小，可能构建有问题"
    fi
else
    echo "❌ 错误: 文件复制失败"
    exit 1
fi

# 步骤5: 重启 Typora（可选）
echo "🔄 是否需要重启 Typora? (y/n)"
read -t 10 -n 1 restart_typora || restart_typora="n"
echo

if [ "$restart_typora" = "y" ] || [ "$restart_typora" = "Y" ]; then
    echo "🔄 重启 Typora..."
    
    # 关闭 Typora
    osascript -e 'quit app "Typora"' 2>/dev/null || true
    
    # 等待一秒
    sleep 1
    
    # 重新启动 Typora
    open -a Typora
    
    echo "✅ Typora 已重启"
else
    echo "ℹ️  请手动重启 Typora 以加载新插件"
fi

echo ""
echo "🎉 部署完成!"
echo "📍 插件位置: $TYPORA_PLUGIN_DIR/main.js"
echo "💡 如果有备份文件，位置在: $TYPORA_PLUGIN_DIR/*.backup.*"
echo ""
