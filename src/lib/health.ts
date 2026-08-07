import 'server-only';

import { getDb } from '@/db/index';
import { healthMeasurement, healthUserProfile } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const DEFAULT_HEALTH_TARGETS = {
  bloodPressure: {
    systolic: 130,
    diastolic: 80,
  },
  glucoseMmol: {
    fasting: 7.0,
    postprandial: 10.0,
  },
  lipidsMmol: {
    ldl: 2.6,
    triglycerides: 1.7,
  },
};

type HealthProfileRow = typeof healthUserProfile.$inferSelect;
type HealthMeasurementRow = typeof healthMeasurement.$inferSelect;

export interface CreateHealthMeasurementInput {
  measuredAt: Date;
  entryType?: string;
  systolic?: number | null;
  diastolic?: number | null;
  heartRate?: number | null;
  fastingGlucoseMmol?: string | null;
  postprandialGlucoseMmol?: string | null;
  totalCholesterolMmol?: string | null;
  triglyceridesMmol?: string | null;
  hdlMmol?: string | null;
  ldlMmol?: string | null;
  weightKg?: string | null;
  waistCm?: string | null;
  notes?: string;
  source?: string;
}

export interface UpdateHealthAssistantInput {
  assistantId?: string | null;
  activationId?: string | null;
  profileName?: string | null;
  connectionMode?: string | null;
  status?: string | null;
}

export async function ensureHealthProfile(userId: string) {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(healthUserProfile)
    .where(eq(healthUserProfile.userId, userId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(healthUserProfile)
    .values({
      id: nanoid(),
      userId,
      targets: DEFAULT_HEALTH_TARGETS,
    })
    .onConflictDoUpdate({
      target: healthUserProfile.userId,
      set: {
        updatedAt: new Date(),
      },
    })
    .returning();

  return created;
}

export async function getHealthDashboardForUser(userId: string) {
  const db = await getDb();
  const profile = await ensureHealthProfile(userId);
  const measurements = await db
    .select()
    .from(healthMeasurement)
    .where(eq(healthMeasurement.userId, userId))
    .orderBy(desc(healthMeasurement.measuredAt))
    .limit(50);

  return {
    profile: serializeHealthProfile(profile),
    measurements: measurements.map(serializeHealthMeasurement),
    summary: buildHealthSummary(measurements),
  };
}

export async function createHealthMeasurement(
  userId: string,
  input: CreateHealthMeasurementInput
) {
  const db = await getDb();
  const profile = await ensureHealthProfile(userId);
  const [created] = await db
    .insert(healthMeasurement)
    .values({
      id: nanoid(),
      userId,
      profileId: profile.id,
      measuredAt: input.measuredAt,
      entryType: input.entryType || 'daily',
      systolic: input.systolic ?? null,
      diastolic: input.diastolic ?? null,
      heartRate: input.heartRate ?? null,
      fastingGlucoseMmol: input.fastingGlucoseMmol ?? null,
      postprandialGlucoseMmol: input.postprandialGlucoseMmol ?? null,
      totalCholesterolMmol: input.totalCholesterolMmol ?? null,
      triglyceridesMmol: input.triglyceridesMmol ?? null,
      hdlMmol: input.hdlMmol ?? null,
      ldlMmol: input.ldlMmol ?? null,
      weightKg: input.weightKg ?? null,
      waistCm: input.waistCm ?? null,
      notes: input.notes?.trim() || '',
      source: input.source || 'manual',
    })
    .returning();

  return serializeHealthMeasurement(created);
}

export async function updateHealthAssistantForUser(
  userId: string,
  input: UpdateHealthAssistantInput
) {
  const db = await getDb();
  await ensureHealthProfile(userId);
  const [updated] = await db
    .update(healthUserProfile)
    .set({
      hermesAssistantId:
        input.assistantId === undefined ? undefined : input.assistantId,
      hermesActivationId:
        input.activationId === undefined ? undefined : input.activationId,
      hermesProfileName:
        input.profileName === undefined ? undefined : input.profileName,
      hermesConnectionMode:
        input.connectionMode === undefined ? undefined : input.connectionMode,
      hermesStatus: input.status || 'active',
      updatedAt: new Date(),
    })
    .where(eq(healthUserProfile.userId, userId))
    .returning();

  return updated ? serializeHealthProfile(updated) : null;
}

function buildHealthSummary(measurements: HealthMeasurementRow[]) {
  const latestBloodPressure = measurements.find(
    (item) => item.systolic || item.diastolic
  );
  const latestGlucose = measurements.find(
    (item) => item.fastingGlucoseMmol || item.postprandialGlucoseMmol
  );
  const latestLipids = measurements.find(
    (item) =>
      item.ldlMmol || item.triglyceridesMmol || item.totalCholesterolMmol
  );
  const latestWeight = measurements.find((item) => item.weightKg);

  return {
    totalRecords: measurements.length,
    latestMeasuredAt: measurements[0]?.measuredAt?.toISOString() || null,
    bloodPressure: latestBloodPressure
      ? {
          measuredAt: latestBloodPressure.measuredAt.toISOString(),
          systolic: latestBloodPressure.systolic,
          diastolic: latestBloodPressure.diastolic,
          heartRate: latestBloodPressure.heartRate,
        }
      : null,
    glucose: latestGlucose
      ? {
          measuredAt: latestGlucose.measuredAt.toISOString(),
          fastingGlucoseMmol: latestGlucose.fastingGlucoseMmol,
          postprandialGlucoseMmol: latestGlucose.postprandialGlucoseMmol,
        }
      : null,
    lipids: latestLipids
      ? {
          measuredAt: latestLipids.measuredAt.toISOString(),
          totalCholesterolMmol: latestLipids.totalCholesterolMmol,
          triglyceridesMmol: latestLipids.triglyceridesMmol,
          hdlMmol: latestLipids.hdlMmol,
          ldlMmol: latestLipids.ldlMmol,
        }
      : null,
    weight: latestWeight
      ? {
          measuredAt: latestWeight.measuredAt.toISOString(),
          weightKg: latestWeight.weightKg,
          waistCm: latestWeight.waistCm,
        }
      : null,
  };
}

function serializeHealthProfile(profile: HealthProfileRow) {
  return {
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function serializeHealthMeasurement(measurement: HealthMeasurementRow) {
  return {
    ...measurement,
    measuredAt: measurement.measuredAt.toISOString(),
    createdAt: measurement.createdAt.toISOString(),
    updatedAt: measurement.updatedAt.toISOString(),
  };
}
