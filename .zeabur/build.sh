#!/bin/bash
set -e

echo "开始构建..."

# 使用淘宝镜像加速
export PNPM_REGISTRY=https://registry.npmmirror.com

# 安装依赖（使用--frozen-lockfile确保一致性）
echo "安装依赖..."
pnpm install --frozen-lockfile --prefer-offline

# 构建项目
echo "构建项目..."
pnpm build

echo "构建完成!"
