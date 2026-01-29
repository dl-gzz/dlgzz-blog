#!/bin/bash
set -e

echo "=== 开始构建 ==="
echo "Node version: $(node --version)"
echo "pnpm version: $(pnpm --version)"
echo "Current directory: $(pwd)"
echo "Disk space: $(df -h . | tail -1)"

# 使用淘宝镜像加速
echo "=== 配置 pnpm ==="
pnpm config set registry https://registry.npmmirror.com
pnpm config set network-timeout 300000
echo "pnpm config:"
pnpm config list

# 安装依赖
echo "=== 开始安装依赖 $(date) ==="
pnpm install --frozen-lockfile --ignore-scripts --no-optional 2>&1 | tee /tmp/pnpm-install.log
echo "=== 依赖安装完成 $(date) ==="

echo "node_modules size: $(du -sh node_modules 2>/dev/null || echo 'unknown')"
echo "Disk space after install: $(df -h . | tail -1)"

# 手动运行 fumadocs-mdx
echo "=== 运行 fumadocs-mdx $(date) ==="
pnpm run content || echo "fumadocs-mdx 失败，继续构建"

# 构建项目
echo "=== 开始构建项目 $(date) ==="
pnpm build 2>&1 | tee /tmp/pnpm-build.log
echo "=== 构建完成 $(date) ==="
