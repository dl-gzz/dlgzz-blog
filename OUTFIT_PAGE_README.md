# OutfitAI - Virtual Try-On Page

## 功能概述
OutfitAI的虚拟试衣页面基于提供的数据结构，实现了完整的AI虚拟试衣展示功能。

## 主要功能

### 1. 筛选器功能
- **位置**: 页面右上角
- **选项**: 全部 / 男性 / 女性
- **图标**: Users (全部), User (男性), UserCheck (女性)
- **默认**: 全部
- **功能**: 根据服装性别分类筛选展示内容

### 2. 卡片展示
- **数据源**: `/mock/data.json`
- **展示**: 网格布局的服装套装卡片
- **卡片内容**:
  - 主图片 (`url` 字段)
  - 单品数量徽章 (`split_images.length`)
  - 性别分类标签
  - 查看搭配按钮

### 3. 轮播图模态框
**触发**: 点击任意卡片
**内容**:
- 左侧: 轮播图展示 `split_images` 中的单品
- 导航: 左右箭头按钮 + 底部指示器
- 缩略图: 3列网格显示所有单品，支持点击切换

### 4. 操作按钮
**购买按钮**:
- 功能: 跳转到对应的 `amazon_url`
- 行为: 新标签页打开
- 样式: 紫色渐变背景

**虚拟试衣按钮**:
- 功能: 在控制台打印当前图片URL
- 行为: `console.log('Try on image URL:', imageUrl)`
- 样式: 边框样式，紫色主题

### 5. 国际化支持
**翻译文件**:
- `messages/en.json` - 英文翻译
- `messages/zh.json` - 中文翻译

**翻译字段**:
```json
{
  "OutfitPage": {
    "title": "AI虚拟试衣",
    "description": "通过AI驱动的虚拟试衣技术发现您的完美风格",
    "filters": {
      "all": "全部",
      "male": "男装", 
      "female": "女装"
    },
    "buttons": {
      "buyNow": "立即购买",
      "tryOn": "虚拟试衣",
      "viewOutfit": "查看搭配"
    },
    "modal": {
      "outfitDetails": "搭配详情"
    }
  }
}
```

## 技术实现

### 1. 组件架构
- **页面组件**: `/src/app/[locale]/(marketing)/outfit/page.tsx`
- **类型定义**: `/src/types/outfit.ts`
- **数据源**: `/mock/data.json`

### 2. 主要依赖
- `next-intl`: 国际化支持
- `lucide-react`: 图标库
- `@/components/ui`: UI组件库

### 3. 数据结构
```typescript
interface OutfitData {
  id: string;
  url: string;          // 主图片URL
  type: number;         // 类型标识
  sex: 'male' | 'female'; // 性别分类
  split_images: SplitImage[]; // 单品数组
}

interface SplitImage {
  id: string;
  amazon_url: string;   // 购买链接
  type: string;         // 单品类型 (top/bottom)
  url: string;          // 单品图片URL
}
```

### 4. 响应式设计
- **移动端**: 1列布局
- **中等屏幕**: 2-3列布局  
- **大屏幕**: 4列布局
- **模态框**: 自适应布局，大屏时左右分栏

## 使用说明

1. **启动开发服务器**:
   ```bash
   pnpm run dev
   ```

2. **访问页面**:
   - 英文: `http://localhost:3000/en/outfit`
   - 中文: `http://localhost:3000/zh/outfit`

3. **测试功能**:
   - 使用右上角筛选器切换不同分类
   - 点击卡片查看详细轮播图
   - 测试购买和虚拟试衣按钮

## 扩展功能

该页面为AI虚拟试衣功能提供了完整的UI基础，可以方便地集成：
- 实际的AI试衣接口
- 更多筛选选项（品牌、风格、价格等）
- 用户收藏和分享功能
- 个性化推荐算法

---

*OutfitAI - 用AI重新定义时尚购物体验*
