#!/bin/bash

# 自动发布脚本 - GitHub Actions 版本
set -e

# 检查是否提供了版本号
if [ -z "$1" ]; then
    echo "用法: ./release.sh <版本号>"
    echo "例如: ./release.sh 1.3.1"
    exit 1
fi

VERSION=$1
echo "🚀 开始发布版本 v$VERSION"

# 1. 更新 package.json 和 manifest.json 版本号
echo "📝 更新版本号到 $VERSION"
npm version $VERSION --no-git-tag-version

# 更新 manifest.json 中的版本号
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" src/manifest.json

# 2. 提交版本更改
echo "📤 提交版本更改"
git add package.json package-lock.json src/manifest.json
git commit -m "chore: bump version to v$VERSION"
git push origin main

# 3. 创建并推送 tag (触发 GitHub Actions)
echo "🏷️ 创建 tag v$VERSION (将触发自动发布)"
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin "v$VERSION"

echo "✅ 完成！GitHub Actions 将自动构建并创建 Release"
