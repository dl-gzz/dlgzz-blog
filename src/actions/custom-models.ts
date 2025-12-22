'use server';

import { getDb } from '@/db';
import { customModel } from '@/db/schema';
import { getSession } from '@/lib/server';
import { eq, and, desc } from 'drizzle-orm';
import { createSafeActionClient } from 'next-safe-action';
import { z } from 'zod';
import { Routes } from '@/routes';

// Create a safe action client
const actionClient = createSafeActionClient();

// Schema for creating custom model
const createModelSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  height: z.string().min(1, 'Height is required'),
  weight: z.string().min(1, 'Weight is required'),
  bodyType: z.string().min(1, 'Body type is required'),
  style: z.string().min(1, 'Style is required'),
  imageUrl: z.string().url('Valid image URL is required'),
  ossKey: z.string().min(1, 'OSS key is required'),
});

// Schema for updating custom model
const updateModelSchema = z.object({
  modelId: z.string().min(1, 'Model ID is required'),
  name: z.string().optional(),
  height: z.string().optional(),
  weight: z.string().optional(),
  bodyType: z.string().optional(),
  style: z.string().optional(),
  imageUrl: z.string().url().optional(),
  ossKey: z.string().optional(),
});

// Schema for deleting custom model
const deleteModelSchema = z.object({
  modelId: z.string().min(1, 'Model ID is required'),
});

/**
 * 创建自定义模特
 */
export const createCustomModelAction = actionClient
  .schema(createModelSchema)
  .action(async ({ parsedInput }) => {
    const session = await getSession();
    
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    try {
      const db = await getDb();
      const newModel = await db.insert(customModel).values({
        id: `model_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        name: parsedInput.name,
        height: parsedInput.height,
        weight: parsedInput.weight,
        bodyType: parsedInput.bodyType,
        style: parsedInput.style,
        imageUrl: parsedInput.imageUrl,
        ossKey: parsedInput.ossKey,
        userId: session.user.id,
        isActive: true,
      }).returning();

      return {
        success: true,
        data: newModel[0],
      };
    } catch (error) {
      console.error('Failed to create custom model:', error);
      return {
        success: false,
        error: 'Failed to create custom model',
      };
    }
  });

/**
 * 获取用户的自定义模特列表
 */
export async function getUserCustomModels() {
  const session = await getSession();
  
  if (!session?.user?.id) {
    return [];
  }

  try {
    const db = await getDb();
    const models = await db
      .select()
      .from(customModel)
      .where(
        and(
          eq(customModel.userId, session.user.id),
          eq(customModel.isActive, true)
        )
      )
      .orderBy(desc(customModel.createdAt));

    return models;
  } catch (error) {
    console.error('Failed to fetch custom models:', error);
    return [];
  }
}

/**
 * 删除自定义模特（软删除）
 */
export const deleteCustomModelAction = actionClient
  .schema(deleteModelSchema)
  .action(async ({ parsedInput }) => {
    const session = await getSession();
    
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    try {
      const db = await getDb();
      await db
        .update(customModel)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(customModel.id, parsedInput.modelId),
            eq(customModel.userId, session.user.id)
          )
        );

      return {
        success: true,
      };
    } catch (error) {
      console.error('Failed to delete custom model:', error);
      return {
        success: false,
        error: 'Failed to delete custom model',
      };
    }
  });

/**
 * 更新自定义模特信息
 */
export const updateCustomModelAction = actionClient
  .schema(updateModelSchema)
  .action(async ({ parsedInput }) => {
    const session = await getSession();
    
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    try {
      const db = await getDb();
      const { modelId, ...updateData } = parsedInput;
      
      const updatedModel = await db
        .update(customModel)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(customModel.id, modelId),
            eq(customModel.userId, session.user.id)
          )
        )
        .returning();

      return {
        success: true,
        data: updatedModel[0],
      };
    } catch (error) {
      console.error('Failed to update custom model:', error);
      return {
        success: false,
        error: 'Failed to update custom model',
      };
    }
  }); 