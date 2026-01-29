#!/bin/bash
set -e

echo "=== 开始构建 ==="
echo "Node version: $(node --version)"
echo "pnpm version: $(pnpm --version)"
echo "Available memory: $(free -h 2>/dev/null | grep Mem || echo 'unknown')"

# 使用淘宝镜像加速
export PNPM_REGISTRY=https://registry.npmmirror.com

# 先只安装生产依赖，减少内存占用
echo "=== 安装生产依赖 ==="
pnpm install --frozen-lockfile --ignore-scripts --prefer-offline --prod

echo "=== 生产依赖安装完成 ==="
echo "node_modules size: $(du -sh node_modules 2>/dev/null || echo 'unknown')"

# 再安装开发依赖（构建需要）
echo "=== 安装开发依赖 ==="
pnpm install --frozen-lockfile --ignore-scripts --prefer-offline

echo "=== 所有依赖安装完成 ==="
echo "node_modules size: $(du -sh node_modules 2>/dev/null || echo 'unknown')"

# 手动运行 fumadocs-mdx
echo "=== 运行 fumadocs-mdx ==="
pnpm run content || echo "fumadocs-mdx 失败，继续构建"

# 构建项目
echo "=== 构建项目 ==="
pnpm build

echo "=== 构建完成! ==="
