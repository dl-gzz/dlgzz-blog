import { requireSameOrigin, requireSession } from '@/lib/api-security';
import {
  createHealthMeasurement,
  getHealthDashboardForUser,
} from '@/lib/health';
import { type NextRequest, NextResponse } from 'next/server';

class ValidationError extends Error {}

export async function GET() {
  const auth = await requireSession('请先登录后再查看三高记录');
  if ('response' in auth) return auth.response;

  const dashboard = await getHealthDashboardForUser(auth.session.user.id);

  return NextResponse.json({
    success: true,
    ...dashboard,
  });
}

export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  const auth = await requireSession('请先登录后再记录三高数据');
  if ('response' in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '请求体不是有效 JSON' },
      { status: 400 }
    );
  }

  try {
    const measuredAt = parseMeasuredAt(body.measuredAt);
    const input = {
      measuredAt,
      entryType: parseText(body.entryType, 'daily').slice(0, 40),
      systolic: parseInteger(body.systolic, '收缩压', 40, 260),
      diastolic: parseInteger(body.diastolic, '舒张压', 30, 180),
      heartRate: parseInteger(body.heartRate, '心率', 30, 220),
      fastingGlucoseMmol: parseDecimal(
        body.fastingGlucoseMmol,
        '空腹血糖',
        0,
        50
      ),
      postprandialGlucoseMmol: parseDecimal(
        body.postprandialGlucoseMmol,
        '餐后血糖',
        0,
        50
      ),
      totalCholesterolMmol: parseDecimal(
        body.totalCholesterolMmol,
        '总胆固醇',
        0,
        50
      ),
      triglyceridesMmol: parseDecimal(
        body.triglyceridesMmol,
        '甘油三酯',
        0,
        50
      ),
      hdlMmol: parseDecimal(body.hdlMmol, 'HDL-C', 0, 50),
      ldlMmol: parseDecimal(body.ldlMmol, 'LDL-C', 0, 50),
      weightKg: parseDecimal(body.weightKg, '体重', 0, 500),
      waistCm: parseDecimal(body.waistCm, '腰围', 0, 300),
      notes: parseText(body.notes, '').slice(0, 1000),
      source: 'manual',
    };

    if (
      ![
        input.systolic,
        input.diastolic,
        input.heartRate,
        input.fastingGlucoseMmol,
        input.postprandialGlucoseMmol,
        input.totalCholesterolMmol,
        input.triglyceridesMmol,
        input.hdlMmol,
        input.ldlMmol,
        input.weightKg,
        input.waistCm,
      ].some((value) => value !== null)
    ) {
      throw new ValidationError('至少填写一项三高或体重数据');
    }

    const measurement = await createHealthMeasurement(
      auth.session.user.id,
      input
    );
    const dashboard = await getHealthDashboardForUser(auth.session.user.id);

    return NextResponse.json({
      success: true,
      measurement,
      ...dashboard,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', error: error.message },
        { status: 400 }
      );
    }

    throw error;
  }
}

function parseMeasuredAt(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return new Date();

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('记录时间无效');
  }

  return date;
}

function parseText(value: unknown, fallback: string) {
  return typeof value === 'string' ? value.trim() : fallback;
}

function parseInteger(value: unknown, label: string, min: number, max: number) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${label}数值不在可记录范围内`);
  }

  return parsed;
}

function parseDecimal(value: unknown, label: string, min: number, max: number) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${label}数值不在可记录范围内`);
  }

  return parsed.toFixed(2);
}
