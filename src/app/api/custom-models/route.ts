import { getDb } from '@/db';
import { customModel } from '@/db/schema';
import { getSession } from '@/lib/server';
import { eq, and, desc } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Get current session
    const session = await getSession();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, height, weight, bodyType, style, imageUrl, ossKey } = body;

    // Validate required fields
    if (!name || !height || !weight || !bodyType || !style || !imageUrl || !ossKey) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const db = await getDb();
    
    // Create new custom model
    const newModel = await db.insert(customModel).values({
      id: `model_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      name,
      height,
      weight,
      bodyType,
      style,
      imageUrl,
      ossKey,
      userId: session.user.id,
      isActive: true,
    }).returning();

    return NextResponse.json({
      success: true,
      data: newModel[0],
    });

  } catch (error) {
    console.error('Failed to create custom model:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get current session
    const session = await getSession();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const db = await getDb();
    
    // Get user's custom models
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

    return NextResponse.json({
      success: true,
      data: models,
    });

  } catch (error) {
    console.error('Failed to fetch custom models:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Get current session
    const session = await getSession();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get('id');

    if (!modelId) {
      return NextResponse.json(
        { error: 'Model ID is required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    
    // Soft delete the model (set isActive to false)
    await db
      .update(customModel)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customModel.id, modelId),
          eq(customModel.userId, session.user.id)
        )
      );

    return NextResponse.json({
      success: true,
    });

  } catch (error) {
    console.error('Failed to delete custom model:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 