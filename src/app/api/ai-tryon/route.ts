import { getSession } from '@/lib/server';
import { getSubscriptions } from '@/payment';
import { getLifetimeStatusAction } from '@/actions/get-lifetime-status';
import { NextRequest, NextResponse } from 'next/server';

interface TryOnRequest {
  personImageUrl: string;
  topGarmentUrl?: string;
  bottomGarmentUrl?: string;
}

interface DashScopeResponse {
  output: {
    task_id: string;
    task_status: string;
  };
  request_id: string;
}

interface TaskStatusResponse {
  request_id: string;
  output: {
    task_id: string;
    task_status: string;
    submit_time?: string;
    scheduled_time?: string;
    end_time?: string;
    image_url?: string;
    code?: string;
    message?: string;
  };
  usage?: {
    image_count: number;
  };
}

/**
 * Check if user has access to AI try-on feature (subscription or lifetime)
 */
async function checkUserAccess(userId: string): Promise<{ hasAccess: boolean; reason?: string }> {
  try {
    // Check if user is a lifetime member
    const lifetimeResult = await getLifetimeStatusAction({ userId });
    if (lifetimeResult?.data?.success && lifetimeResult.data.isLifetimeMember) {
      return { hasAccess: true };
    }

    // Check for active subscription
    const subscriptions = await getSubscriptions({ userId });
    
    if (subscriptions && subscriptions.length > 0) {
      // Find the most recent active subscription
      const activeSubscription = subscriptions.find(
        (sub) => sub.status === 'active' || sub.status === 'trialing'
      );

      if (activeSubscription) {
        // Check if subscription is still within valid period
        const now = new Date();
        const periodEnd = activeSubscription.currentPeriodEnd;
        
        if (periodEnd && periodEnd > now) {
          return { hasAccess: true };
        } else {
          return { hasAccess: false, reason: 'subscription_expired' };
        }
      }
    }

    return { hasAccess: false, reason: 'no_subscription' };
  } catch (error) {
    console.error('Check user access error:', error);
    return { hasAccess: false, reason: 'check_failed' };
  }
}

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

    // Check if user has access to AI try-on feature
    const accessCheck = await checkUserAccess(session.user.id);
    if (!accessCheck.hasAccess) {
      const errorMessages = {
        no_subscription: 'AI虚拟试衣功能仅限付费用户使用，请升级您的套餐',
        subscription_expired: '您的订阅已过期，请续费以继续使用AI虚拟试衣功能',
        check_failed: '无法验证您的订阅状态，请稍后重试'
      };
      
      return NextResponse.json(
        { 
          error: errorMessages[accessCheck.reason as keyof typeof errorMessages] || errorMessages.no_subscription,
          code: 'SUBSCRIPTION_REQUIRED',
          reason: accessCheck.reason
        },
        { status: 403 }
      );
    }

    const body: TryOnRequest = await request.json();
    const { personImageUrl, topGarmentUrl, bottomGarmentUrl } = body;

    // Validate required fields
    if (!personImageUrl) {
      return NextResponse.json(
        { error: 'Person image URL is required' },
        { status: 400 }
      );
    }

    if (!topGarmentUrl && !bottomGarmentUrl) {
      return NextResponse.json(
        { error: 'At least one garment image is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 500 }
      );
    }

    // Prepare request data
    const requestData = {
      model: 'aitryon-plus',
      input: {
        person_image_url: personImageUrl,
        ...(topGarmentUrl && { top_garment_url: topGarmentUrl }),
        ...(bottomGarmentUrl && { bottom_garment_url: bottomGarmentUrl }),
      },
      parameters: {
        resolution: -1,
        restore_face: true,
      },
    };

    // Submit AI try-on task
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DashScope API error:', errorText);
      return NextResponse.json(
        { error: 'AI service request failed' },
        { status: response.status }
      );
    }

    const result: DashScopeResponse = await response.json();

    return NextResponse.json({
      success: true,
      taskId: result.output.task_id,
      status: result.output.task_status,
      requestId: result.request_id,
    });

  } catch (error) {
    console.error('AI try-on error:', error);
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

    // Check if user has access to AI try-on feature
    const accessCheck = await checkUserAccess(session.user.id);
    if (!accessCheck.hasAccess) {
      const errorMessages = {
        no_subscription: 'AI虚拟试衣功能仅限付费用户使用，请升级您的套餐',
        subscription_expired: '您的订阅已过期，请续费以继续使用AI虚拟试衣功能',
        check_failed: '无法验证您的订阅状态，请稍后重试'
      };
      
      return NextResponse.json(
        { 
          error: errorMessages[accessCheck.reason as keyof typeof errorMessages] || errorMessages.no_subscription,
          code: 'SUBSCRIPTION_REQUIRED',
          reason: accessCheck.reason
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 500 }
      );
    }

    // Query task status
    const response = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DashScope task query error:', errorText);
      return NextResponse.json(
        { error: 'Task status query failed' },
        { status: response.status }
      );
    }

    const result: TaskStatusResponse = await response.json();

    return NextResponse.json({
      success: true,
      taskId: result.output.task_id,
      status: result.output.task_status,
      imageUrl: result.output.image_url,
      submitTime: result.output.submit_time,
      endTime: result.output.end_time,
      error: result.output.code ? {
        code: result.output.code,
        message: result.output.message,
      } : undefined,
      usage: result.usage,
    });

  } catch (error) {
    console.error('Task status query error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 