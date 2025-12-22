'use server';

import { getSession } from '@/lib/server';
import { getDb } from '@/db';
import { tryOnHistory } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createSafeActionClient } from 'next-safe-action';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { ossClient, generateUniqueFileName, getOssUrl } from '@/lib/oss-client';

const actionClient = createSafeActionClient();

const saveTryOnHistorySchema = z.object({
  modelName: z.string().min(1),
  modelImageUrl: z.string().url(),
  clothingType: z.enum(['topAndBottom', 'onepiece']),
  topGarmentUrl: z.string().url().optional(),
  bottomGarmentUrl: z.string().url().optional(),
  originalResultUrl: z.string().url(),
  taskId: z.string().optional(),
  outfitId: z.string().optional(),
});

export const saveTryOnHistory = actionClient
  .schema(saveTryOnHistorySchema)
  .action(async ({ parsedInput }) => {
    const session = await getSession();
    if (!session?.user?.id) {
      throw new Error('用户未登录');
    }

    const {
      modelName,
      modelImageUrl,
      clothingType,
      topGarmentUrl,
      bottomGarmentUrl,
      originalResultUrl,
      taskId,
      outfitId,
    } = parsedInput;

    try {
      // 从AI结果URL下载图片并保存到我们的OSS
      const response = await fetch(originalResultUrl);
      if (!response.ok) {
        throw new Error('下载AI试衣结果失败');
      }

      const imageBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(imageBuffer);
      
      // 生成唯一的文件名
      const ossKey = generateUniqueFileName('try-on-result.jpg', 'try-on-results/');
      
      // 上传到我们的OSS
      const result = await ossClient.put(ossKey, buffer, {
        headers: {
          'Content-Type': 'image/jpeg',
        },
      });

      if (!result.res || result.res.status !== 200) {
        throw new Error('保存试衣结果到OSS失败');
      }

      // 获取我们OSS的公网URL
      const resultImageUrl = getOssUrl(ossKey);

      // 保存到数据库
      const db = await getDb();
      const historyId = nanoid();
      await db.insert(tryOnHistory).values({
        id: historyId,
        userId: session.user.id,
        modelName,
        modelImageUrl,
        clothingType,
        topGarmentUrl,
        bottomGarmentUrl,
        resultImageUrl,
        resultOssKey: ossKey,
        originalResultUrl,
        taskId,
        outfitId,
      });

      return {
        success: true,
        historyId,
        resultImageUrl,
      };
    } catch (error) {
      console.error('保存试衣历史失败:', error);
      throw new Error(error instanceof Error ? error.message : '保存试衣历史失败');
    }
  });

export const getTryOnHistory = actionClient.action(async () => {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error('用户未登录');
  }

  try {
    const db = await getDb();
    const history = await db
      .select()
      .from(tryOnHistory)
      .where(eq(tryOnHistory.userId, session.user.id))
      .orderBy(desc(tryOnHistory.createdAt));

    return history;
  } catch (error) {
    console.error('获取试衣历史失败:', error);
    throw new Error('获取试衣历史失败');
  }
});

export const deleteTryOnHistory = actionClient
  .schema(z.object({ historyId: z.string() }))
  .action(async ({ parsedInput }) => {
    const session = await getSession();
    if (!session?.user?.id) {
      throw new Error('用户未登录');
    }

    const { historyId } = parsedInput;

    try {
      const db = await getDb();
      
      // 获取要删除的记录
      const [record] = await db
        .select()
        .from(tryOnHistory)
        .where(eq(tryOnHistory.id, historyId));

      if (!record) {
        throw new Error('试衣记录不存在');
      }

      if (record.userId !== session.user.id) {
        throw new Error('无权删除此记录');
      }

      // 从OSS删除文件
      try {
        await ossClient.delete(record.resultOssKey);
      } catch (ossError) {
        console.warn('删除OSS文件失败:', ossError);
        // 不阻止数据库删除操作
      }

      // 从数据库删除记录
      await db.delete(tryOnHistory).where(eq(tryOnHistory.id, historyId));

      return { success: true };
    } catch (error) {
      console.error('删除试衣历史失败:', error);
      throw new Error(error instanceof Error ? error.message : '删除试衣历史失败');
    }
  }); 