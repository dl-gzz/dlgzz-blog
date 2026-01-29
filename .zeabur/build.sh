#!/bin/bash
set -e

echo "=== 开始构建 ==="
echo "Node version: $(node --version)"
echo "pnpm version: $(pnpm --version)"

# 使用淘宝镜像加速
export PNPM_REGISTRY=https://registry.npmmirror.com

# 安装依赖（跳过 postinstall 脚本）
echo "=== 安装依赖 ==="
pnpm install --frozen-lockfile --ignore-scripts --prefer-offline

echo "=== 依赖安装完成 ==="
echo "node_modules size: $(du -sh node_modules 2>/dev/null || echo 'unknown')"

# 手动运行 fumadocs-mdx
echo "=== 运行 fumadocs-mdx ==="
pnpm run content || echo "fumadocs-mdx 失败，继续构建"

# 构建项目
echo "=== 构建项目 ==="
pnpm build

echo "=== 构建完成! ==="
