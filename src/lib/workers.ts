import 'server-only';

import { createHash, randomUUID } from 'crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'fs';
import { basename, join, relative, resolve } from 'path';
import { getDb } from '@/db';
import {
  knowledgePack,
  workerEmployee,
  workerEmployeeKnowledgePack,
  workerEmployeeSkill,
  workerEmployeeVersion,
  workerInstance,
  workerInstanceSkill,
  workerMemory,
  workerPushSubscription,
  workerSkill,
  workerSkillKnowledgePack,
  workerSyncRun,
  workerToolRun,
  workerUserProfile,
} from '@/db/schema';
import { websiteConfig } from '@/config/website';
import {
  and,
  desc,
  eq,
  inArray,
} from 'drizzle-orm';
import {
  getMembershipEntitlementForUser,
  type MembershipEntitlement,
} from '@/lib/entitlements';

const DEFAULT_ONE_WORKER_ROOT = '/Users/baiyang/Desktop/one-worker-os';
const DEFAULT_WORKER_PRICE_ID =
  process.env.WORKER_DEFAULT_MONTHLY_PRICE_ID ||
  process.env.NEXT_PUBLIC_STRIPE_PRICE_WORKER_MONTHLY ||
  'xorpay_worker_employee_monthly';
const DEFAULT_WORKER_AMOUNT = Number(
  process.env.WORKER_DEFAULT_MONTHLY_AMOUNT || 2900
);
const DEFAULT_COMPANION_EMPLOYEE_ID =
  process.env.WORKER_DEFAULT_COMPANION_EMPLOYEE_ID ||
  process.env.NEXT_PUBLIC_WORKER_DEFAULT_COMPANION_EMPLOYEE_ID ||
  'xhs-open-shop-coach';

export const WORKER_INSTANCE_PAID_STATUSES = [
  'active',
  'completed',
  'trialing',
] as const;

const USER_VISIBLE_SKILL_STATUSES = ['public', 'beta', 'internal'] as const;
const WORKER_SKILL_STATUSES = [
  'draft',
  'public',
  'beta',
  'internal',
  'paused',
] as const;
const WORKER_SKILL_TYPES = ['config', 'data', 'tool'] as const;
const WORKER_SKILL_RISK_LEVELS = ['low', 'medium', 'high'] as const;

export interface RosterEmployee {
  id: string;
  name: string;
  responsibility: string;
  suitableTasks: string;
  solvesProblem: string;
  employeeDir: string;
  readmePath: string;
}

export interface WorkerSyncResult {
  id: string;
  status: 'success' | 'partial' | 'failed';
  total: number;
  synced: number;
  skipped: number;
  errors: string[];
}

export interface WorkerSkillAdminInput {
  id?: string;
  name?: string;
  summary?: string;
  category?: string;
  skillType?: string;
  riskLevel?: string;
  status?: string;
  defaultEnabled?: boolean;
  requiresUserConfig?: boolean;
}

export interface WorkerSkillForInstance {
  id: string;
  name: string;
  summary: string;
  category: string;
  skillType: string;
  riskLevel: string;
  status: string;
  employeeSkillStatus: string;
  employeeDefaultEnabled: boolean;
  enabled: boolean;
  requiresUserConfig: boolean;
  knowledgePackIds: string[];
}

export interface WorkerKnowledgePackForInstance {
  id: string;
  name: string;
  description: string;
  scope: string;
  status: string;
  source: 'employee' | 'skill';
  skillId?: string | null;
}

export function getOneWorkerRoot() {
  return resolve(process.env.ONE_WORKER_OS_ROOT || DEFAULT_ONE_WORKER_ROOT);
}

export async function syncWorkerEmployees(createdBy?: string | null) {
  const db = await getDb();
  const sourceRoot = getOneWorkerRoot();
  const runId = `wsr_${randomUUID()}`;
  const errors: string[] = [];
  let synced = 0;
  let skipped = 0;

  try {
    const roster = readRoster(sourceRoot);

    for (const item of roster) {
      try {
        if (
          !isPathInside(sourceRoot, item.employeeDir) ||
          !isPathInside(sourceRoot, item.readmePath)
        ) {
          skipped += 1;
          errors.push(`${item.id}: 员工目录或 README 不在 one-worker-os 根目录内`);
          continue;
        }

        const readmeSnapshot = readOptionalText(item.readmePath);
        const soulPath = findSoulPath(item.employeeDir, item.id);
        const soulSnapshot = soulPath ? readOptionalText(soulPath) : '';
        const skillsSummary = readSkillsSummary(item.employeeDir);
        const sourceHash = hashText(
          JSON.stringify({
            item,
            soulPath,
            soulSnapshot,
            readmeSnapshot,
            skillsSummary,
          })
        );

        const [existing] = await db
          .select()
          .from(workerEmployee)
          .where(eq(workerEmployee.id, item.id))
          .limit(1);

        const hasSoul = Boolean(soulPath && soulSnapshot.trim());
        const status = hasSoul ? existing?.status || 'draft' : 'draft';
        const monthlyPriceId =
          existing?.monthlyPriceId || getDefaultWorkerMonthlyPrice().priceId;
        const monthlyAmount =
          existing?.monthlyAmount || getDefaultWorkerMonthlyPrice().amount;
        const currency =
          existing?.currency || getDefaultWorkerMonthlyPrice().currency;
        const now = new Date();

        await db
          .insert(workerEmployee)
          .values({
            id: item.id,
            name: item.name,
            responsibility: item.responsibility,
            suitableTasks: item.suitableTasks,
            solvesProblem: item.solvesProblem,
            employeeDir: item.employeeDir,
            readmePath: item.readmePath,
            soulPath,
            status,
            monthlyPriceId,
            monthlyAmount,
            currency,
            sourceHash,
            latestVersionId: existing?.latestVersionId || null,
            syncedAt: now,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: workerEmployee.id,
            set: {
              name: item.name,
              responsibility: item.responsibility,
              suitableTasks: item.suitableTasks,
              solvesProblem: item.solvesProblem,
              employeeDir: item.employeeDir,
              readmePath: item.readmePath,
              soulPath,
              status,
              monthlyPriceId,
              monthlyAmount,
              currency,
              sourceHash,
              syncedAt: now,
              updatedAt: now,
            },
          });

        if (!hasSoul || !soulPath) {
          synced += 1;
          errors.push(`${item.id}: 缺少灵魂文档，已同步为 draft，不能上架`);
          continue;
        }

        const soulHash = hashText(soulSnapshot);
        const readmeHash = hashText(readmeSnapshot);
        const skillsHash = hashText(JSON.stringify(skillsSummary));
        const versionId = buildEmployeeVersionId(
          item.id,
          hashText(`${soulHash}:${readmeHash}:${skillsHash}`)
        );

        await db
          .insert(workerEmployeeVersion)
          .values({
            id: versionId,
            employeeId: item.id,
            soulPath,
            soulHash,
            readmeHash,
            skillsHash,
            soulSnapshot,
            readmeSnapshot,
            skillsSummary,
            createdAt: now,
          })
          .onConflictDoNothing();

        await db
          .update(workerEmployee)
          .set({
            latestVersionId: versionId,
            updatedAt: now,
          })
          .where(eq(workerEmployee.id, item.id));

        synced += 1;
      } catch (error) {
        skipped += 1;
        errors.push(
          `${item.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const status = errors.length
      ? synced > 0
        ? 'partial'
        : 'failed'
      : 'success';
    const result: WorkerSyncResult = {
      id: runId,
      status,
      total: roster.length,
      synced,
      skipped,
      errors,
    };

    await db.insert(workerSyncRun).values({
      id: runId,
      sourceRoot,
      status,
      total: roster.length,
      synced,
      skipped,
      errors,
      createdBy: createdBy || null,
      completedAt: new Date(),
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: WorkerSyncResult = {
      id: runId,
      status: 'failed',
      total: 0,
      synced: 0,
      skipped: 0,
      errors: [message],
    };

    await db.insert(workerSyncRun).values({
      id: runId,
      sourceRoot,
      status: 'failed',
      errors: [message],
      createdBy: createdBy || null,
      completedAt: new Date(),
    });

    return result;
  }
}

export async function listWorkerCatalog() {
  const db = await getDb();
  const rows = await db
    .select()
    .from(workerEmployee)
    .where(eq(workerEmployee.status, 'active'))
    .orderBy(workerEmployee.name);

  return Promise.all(rows.map(serializeWorkerEmployee));
}

export async function listAdminWorkerEmployees() {
  const db = await getDb();
  const rows = await db
    .select()
    .from(workerEmployee)
    .orderBy(desc(workerEmployee.updatedAt));

  return Promise.all(rows.map(serializeWorkerEmployee));
}

export async function updateWorkerEmployeeAdmin({
  employeeId,
  status,
  monthlyPriceId,
  monthlyAmount,
  currency,
}: {
  employeeId: string;
  status?: string;
  monthlyPriceId?: string;
  monthlyAmount?: number;
  currency?: string;
}) {
  const db = await getDb();
  const [employee] = await db
    .select()
    .from(workerEmployee)
    .where(eq(workerEmployee.id, employeeId))
    .limit(1);

  if (!employee) return null;

  const nextStatus = status || employee.status;
  if (nextStatus === 'active' && !employee.latestVersionId) {
    throw new Error('缺少灵魂文档版本，不能上架');
  }

  const [updated] = await db
    .update(workerEmployee)
    .set({
      status: nextStatus,
      monthlyPriceId: monthlyPriceId || employee.monthlyPriceId,
      monthlyAmount: monthlyAmount ?? employee.monthlyAmount,
      currency: currency || employee.currency,
      updatedAt: new Date(),
    })
    .where(eq(workerEmployee.id, employeeId))
    .returning();

  return updated ? serializeWorkerEmployee(updated) : null;
}

export async function listAdminWorkerSkills() {
  const db = await getDb();
  const [skills, assignments] = await Promise.all([
    db.select().from(workerSkill).orderBy(desc(workerSkill.updatedAt)),
    db.select().from(workerEmployeeSkill),
  ]);

  return skills.map((skill) => ({
    ...serializeWorkerSkill(skill),
    employeeSkills: assignments
      .filter((assignment) => assignment.skillId === skill.id)
      .map(serializeWorkerEmployeeSkill),
  }));
}

export async function createWorkerSkillAdmin(input: WorkerSkillAdminInput) {
  const db = await getDb();
  const name = cleanText(input.name);
  const summary = cleanText(input.summary);

  if (!name) throw new Error('技能名称不能为空');
  if (!summary) throw new Error('技能说明不能为空');

  const id = normalizeSkillId(input.id) || buildWorkerSkillId(name);
  const now = new Date();

  const [existing] = await db
    .select()
    .from(workerSkill)
    .where(eq(workerSkill.id, id))
    .limit(1);

  if (existing) {
    throw new Error('技能 ID 已存在，请换一个 ID');
  }

  const [created] = await db
    .insert(workerSkill)
    .values({
      id,
      name,
      summary,
      category: cleanText(input.category) || 'professional',
      skillType: normalizeSkillType(input.skillType),
      riskLevel: normalizeSkillRiskLevel(input.riskLevel),
      status: normalizeWorkerSkillStatus(input.status),
      defaultEnabled: Boolean(input.defaultEnabled),
      requiresUserConfig: Boolean(input.requiresUserConfig),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created ? serializeWorkerSkill(created) : null;
}

export async function updateWorkerSkillAdmin(
  skillId: string,
  input: WorkerSkillAdminInput
) {
  const db = await getDb();
  const [skill] = await db
    .select()
    .from(workerSkill)
    .where(eq(workerSkill.id, skillId))
    .limit(1);

  if (!skill) return null;

  const [updated] = await db
    .update(workerSkill)
    .set({
      name: cleanText(input.name) || skill.name,
      summary: cleanText(input.summary) || skill.summary,
      category: cleanText(input.category) || skill.category,
      skillType: input.skillType
        ? normalizeSkillType(input.skillType)
        : skill.skillType,
      riskLevel: input.riskLevel
        ? normalizeSkillRiskLevel(input.riskLevel)
        : skill.riskLevel,
      status: input.status
        ? normalizeWorkerSkillStatus(input.status)
        : skill.status,
      defaultEnabled:
        typeof input.defaultEnabled === 'boolean'
          ? input.defaultEnabled
          : skill.defaultEnabled,
      requiresUserConfig:
        typeof input.requiresUserConfig === 'boolean'
          ? input.requiresUserConfig
          : skill.requiresUserConfig,
      updatedAt: new Date(),
    })
    .where(eq(workerSkill.id, skillId))
    .returning();

  return updated ? serializeWorkerSkill(updated) : null;
}

export async function setEmployeeWorkerSkillAdmin({
  employeeId,
  skillId,
  status = 'allowed',
  defaultEnabled,
}: {
  employeeId: string;
  skillId: string;
  status?: string;
  defaultEnabled?: boolean;
}) {
  const db = await getDb();
  const [employee] = await db
    .select()
    .from(workerEmployee)
    .where(eq(workerEmployee.id, employeeId))
    .limit(1);
  const [skill] = await db
    .select()
    .from(workerSkill)
    .where(eq(workerSkill.id, skillId))
    .limit(1);

  if (!employee) throw new Error('员工不存在');
  if (!skill) throw new Error('技能不存在');

  const now = new Date();
  const mappingId = buildScopedId('wes', employeeId, skillId);
  const normalizedStatus = status === 'paused' ? 'paused' : 'allowed';
  const nextDefaultEnabled =
    typeof defaultEnabled === 'boolean'
      ? defaultEnabled
      : skill.defaultEnabled;

  const [assignment] = await db
    .insert(workerEmployeeSkill)
    .values({
      id: mappingId,
      employeeId,
      skillId,
      status: normalizedStatus,
      defaultEnabled: nextDefaultEnabled,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: workerEmployeeSkill.id,
      set: {
        status: normalizedStatus,
        defaultEnabled: nextDefaultEnabled,
        updatedAt: now,
      },
    })
    .returning();

  return assignment ? serializeWorkerEmployeeSkill(assignment) : null;
}

export async function listWorkerInstanceSkillsForUser(
  instanceId: string,
  userId: string,
  options: { allowAdmin?: boolean } = {}
) {
  const target = await getWorkerInstanceForUser(instanceId, userId, options);
  if (!target) return null;

  return listWorkerInstanceSkillsByTarget({
    instance: target.instance,
    employee: target.employee,
  });
}

export async function listWorkerInstanceKnowledgePacksForUser(
  instanceId: string,
  userId: string,
  options: { allowAdmin?: boolean } = {}
) {
  const target = await getWorkerInstanceForUser(instanceId, userId, {
    allowAdmin: options.allowAdmin,
  });

  if (!target) return null;
  return listWorkerInstanceKnowledgePacksByTarget({
    instance: target.instance,
    employee: target.employee,
  });
}

export async function setWorkerInstanceSkillForUser({
  instanceId,
  userId,
  skillId,
  enabled,
  allowAdmin,
}: {
  instanceId: string;
  userId: string;
  skillId: string;
  enabled: boolean;
  allowAdmin?: boolean;
}) {
  const target = await getWorkerInstanceForUser(instanceId, userId, {
    allowAdmin,
  });

  if (!target) return null;
  if (!isPaidWorkerInstance(target.instance)) {
    throw new Error('请先完成员工月租付款，再配置技能');
  }

  const skills = await listWorkerInstanceSkillsByTarget({
    instance: target.instance,
    employee: target.employee,
  });
  const skill = skills.find((item) => item.id === skillId);

  if (!skill) {
    throw new Error('这个技能没有分配给该员工，不能开启');
  }

  const db = await getDb();
  const now = new Date();
  await db
    .insert(workerInstanceSkill)
    .values({
      id: buildScopedId('wis', instanceId, skillId),
      instanceId,
      skillId,
      enabled,
      source: 'user',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: workerInstanceSkill.id,
      set: {
        enabled,
        source: 'user',
        updatedAt: now,
      },
    });

  return listWorkerInstanceSkillsByTarget({
    instance: target.instance,
    employee: target.employee,
  });
}

export async function recordWorkerToolRun({
  instanceId,
  skillId,
  status,
  inputSummary,
  outputSummary,
  error,
  completedAt,
}: {
  instanceId: string;
  skillId?: string | null;
  status: string;
  inputSummary?: string | null;
  outputSummary?: string | null;
  error?: string | null;
  completedAt?: Date | null;
}) {
  const db = await getDb();
  const [run] = await db
    .insert(workerToolRun)
    .values({
      id: `wtr_${randomUUID()}`,
      instanceId,
      skillId: skillId || null,
      status,
      inputSummary: inputSummary || null,
      outputSummary: outputSummary || null,
      error: error || null,
      completedAt: completedAt || null,
    })
    .returning();

  return run || null;
}

export async function getWorkerUserProfile({
  userId,
  scope = 'global',
}: {
  userId: string;
  scope?: string;
}) {
  const db = await getDb();
  const [profile] = await db
    .select()
    .from(workerUserProfile)
    .where(
      and(eq(workerUserProfile.userId, userId), eq(workerUserProfile.scope, scope))
    )
    .limit(1);

  return profile || null;
}

export async function upsertWorkerUserProfile({
  userId,
  scope = 'global',
  summary,
  facts,
  source = 'system',
}: {
  userId: string;
  scope?: string;
  summary?: string | null;
  facts?: Record<string, unknown> | null;
  source?: string;
}) {
  const db = await getDb();
  const now = new Date();
  const profileId = buildScopedId('wup', userId, scope);
  const [profile] = await db
    .insert(workerUserProfile)
    .values({
      id: profileId,
      userId,
      scope,
      summary: summary || '',
      facts: facts || {},
      source,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [workerUserProfile.userId, workerUserProfile.scope],
      set: {
        summary: summary || '',
        facts: facts || {},
        source,
        updatedAt: now,
      },
    })
    .returning();

  return profile || null;
}

export async function recordWorkerMemory({
  userId,
  instanceId,
  skillId,
  visibility = 'instance',
  memoryType = 'fact',
  content,
  metadata,
}: {
  userId: string;
  instanceId?: string | null;
  skillId?: string | null;
  visibility?: 'shared' | 'instance' | 'skill';
  memoryType?: string;
  content: string;
  metadata?: Record<string, unknown> | null;
}) {
  const db = await getDb();
  const now = new Date();
  const [memory] = await db
    .insert(workerMemory)
    .values({
      id: `wm_${randomUUID()}`,
      userId,
      instanceId: instanceId || null,
      skillId: skillId || null,
      visibility,
      memoryType,
      content,
      metadata: metadata || {},
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return memory || null;
}

export async function setWorkerPushSubscriptionForUser({
  userId,
  topic,
  enabled,
  channel = 'weixin',
  skillId,
  knowledgePackId,
  frequency = 'normal',
}: {
  userId: string;
  topic: string;
  enabled: boolean;
  channel?: string;
  skillId?: string | null;
  knowledgePackId?: string | null;
  frequency?: string;
}) {
  const db = await getDb();
  const now = new Date();
  const subscriptionId = buildScopedId('wps', userId, topic, channel);
  const [subscription] = await db
    .insert(workerPushSubscription)
    .values({
      id: subscriptionId,
      userId,
      skillId: skillId || null,
      knowledgePackId: knowledgePackId || null,
      topic,
      channel,
      enabled,
      frequency,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        workerPushSubscription.userId,
        workerPushSubscription.topic,
        workerPushSubscription.channel,
      ],
      set: {
        skillId: skillId || null,
        knowledgePackId: knowledgePackId || null,
        enabled,
        frequency,
        updatedAt: now,
      },
    })
    .returning();

  return subscription || null;
}

export async function getActiveWorkerEmployee(employeeId: string) {
  const db = await getDb();
  const [employee] = await db
    .select()
    .from(workerEmployee)
    .where(
      and(eq(workerEmployee.id, employeeId), eq(workerEmployee.status, 'active'))
    )
    .limit(1);

  if (!employee?.latestVersionId) return null;

  const [version] = await db
    .select()
    .from(workerEmployeeVersion)
    .where(eq(workerEmployeeVersion.id, employee.latestVersionId))
    .limit(1);

  if (!version) return null;
  return { employee, version };
}

export async function createWorkerInstance({
  userId,
  employeeId,
  personaId,
  personaPrompt,
  accessSource = 'direct_purchase',
  paymentStatus = 'unpaid',
  status = 'pending_payment',
  priceId,
  membershipPriceId,
}: {
  userId: string;
  employeeId: string;
  personaId?: string | null;
  personaPrompt?: string | null;
  accessSource?: string;
  paymentStatus?: string;
  status?: string;
  priceId?: string | null;
  membershipPriceId?: string | null;
}) {
  const target = await getActiveWorkerEmployee(employeeId);
  if (!target) return null;

  const db = await getDb();
  const instanceId = `wi_${randomUUID()}`;
  const now = new Date();

  const [instance] = await db
    .insert(workerInstance)
    .values({
      id: instanceId,
      userId,
      employeeId: target.employee.id,
      employeeVersionId: target.version.id,
      personaId: personaId || null,
      personaPrompt: personaPrompt || null,
      status,
      paymentStatus,
      priceId: priceId || target.employee.monthlyPriceId,
      accessSource,
      membershipPriceId: membershipPriceId || null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!instance) return null;

  await syncDefaultWorkerInstanceSkills({
    instanceId: instance.id,
    employeeId: target.employee.id,
  });

  return {
    instance,
    employee: target.employee,
    version: target.version,
  };
}

export function getDefaultCompanionEmployeeId() {
  return DEFAULT_COMPANION_EMPLOYEE_ID;
}

export async function ensureMembershipCompanionForUser({
  userId,
  employeeId = DEFAULT_COMPANION_EMPLOYEE_ID,
  personaId,
  personaPrompt,
}: {
  userId: string;
  employeeId?: string | null;
  personaId?: string | null;
  personaPrompt?: string | null;
}): Promise<{
  instance: Awaited<ReturnType<typeof serializeWorkerInstance>>;
  entitlement: MembershipEntitlement;
  created: boolean;
}> {
  const requireMembership = isCompanionMembershipRequired();
  const entitlement = requireMembership
    ? await getMembershipEntitlementForUser(userId)
    : getOpenCompanionEntitlement();

  if (requireMembership && !entitlement.active) {
    throw new Error('请先开通会员，再激活长期陪伴者');
  }

  const target = await getActiveWorkerEmployee(
    employeeId || DEFAULT_COMPANION_EMPLOYEE_ID
  );
  if (!target) {
    throw new Error('默认陪伴者尚未上架或缺少灵魂文档');
  }

  const db = await getDb();
  const now = new Date();
  const existing = await db
    .select()
    .from(workerInstance)
    .where(
      and(
        eq(workerInstance.userId, userId),
        eq(workerInstance.employeeId, target.employee.id)
      )
    )
    .orderBy(desc(workerInstance.updatedAt))
    .limit(1)
    .then((rows) => rows[0] || null);

  if (existing) {
    const [updated] = await db
      .update(workerInstance)
      .set({
        paymentStatus: 'active',
        status:
          existing.status === 'active' ||
          existing.status === 'qr_ready' ||
          existing.status === 'scanned'
            ? existing.status
            : 'ready_to_activate',
        priceId: entitlement.priceId || existing.priceId,
        accessSource: requireMembership ? 'membership' : 'open_test',
        membershipPriceId: requireMembership ? entitlement.priceId || null : null,
        personaId: personaId ?? existing.personaId,
        personaPrompt: personaPrompt ?? existing.personaPrompt,
        error: null,
        updatedAt: now,
      })
      .where(eq(workerInstance.id, existing.id))
      .returning();

    return {
      instance: await serializeWorkerInstance(updated || existing),
      entitlement,
      created: false,
    };
  }

  const created = await createWorkerInstance({
    userId,
    employeeId: target.employee.id,
    personaId,
    personaPrompt,
    accessSource: requireMembership ? 'membership' : 'open_test',
    paymentStatus: 'active',
    status: 'ready_to_activate',
    priceId: entitlement.priceId || target.employee.monthlyPriceId,
    membershipPriceId: requireMembership ? entitlement.priceId || null : null,
  });

  if (!created) {
    throw new Error('创建长期陪伴者失败');
  }

  return {
    instance: await serializeWorkerInstance(created.instance),
    entitlement,
    created: true,
  };
}

function isCompanionMembershipRequired() {
  const value = (process.env.WORKER_COMPANION_REQUIRE_MEMBERSHIP || '')
    .trim()
    .toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;

  return false;
}

function getOpenCompanionEntitlement(): MembershipEntitlement {
  return {
    active: true,
    source: null,
    priceId: process.env.WORKER_COMPANION_FREE_PRICE_ID || 'open_test',
    periodEnd: null,
  };
}

export async function attachCheckoutToWorkerInstance({
  instanceId,
  checkoutSessionId,
  subscriptionId,
}: {
  instanceId: string;
  checkoutSessionId?: string | null;
  subscriptionId?: string | null;
}) {
  const db = await getDb();
  const [updated] = await db
    .update(workerInstance)
    .set({
      checkoutSessionId: checkoutSessionId || null,
      subscriptionId: subscriptionId || null,
      paymentStatus: 'processing',
      updatedAt: new Date(),
    })
    .where(eq(workerInstance.id, instanceId))
    .returning();

  return updated || null;
}

export async function markWorkerInstancePayment({
  workerInstanceId,
  subscriptionId,
  checkoutSessionId,
  paymentStatus,
}: {
  workerInstanceId?: string | null;
  subscriptionId?: string | null;
  checkoutSessionId?: string | null;
  paymentStatus: string;
}) {
  const db = await getDb();
  const current = await findWorkerInstanceForPayment({
    workerInstanceId,
    subscriptionId,
    checkoutSessionId,
  });

  if (!current) return null;

  const paid = isPaidStatus(paymentStatus);
  const nextStatus = paid
    ? current.status === 'active'
      ? 'active'
      : 'ready_to_activate'
    : paymentStatus === 'canceled' || paymentStatus === 'failed'
      ? 'payment_failed'
      : current.status;

  const [updated] = await db
    .update(workerInstance)
    .set({
      subscriptionId: subscriptionId || current.subscriptionId || null,
      checkoutSessionId: checkoutSessionId || current.checkoutSessionId || null,
      paymentStatus,
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(workerInstance.id, current.id))
    .returning();

  return updated || null;
}

export async function getWorkerInstanceForUser(
  instanceId: string,
  userId: string,
  options: { allowAdmin?: boolean } = {}
) {
  const db = await getDb();
  const [instance] = await db
    .select()
    .from(workerInstance)
    .where(eq(workerInstance.id, instanceId))
    .limit(1);

  if (!instance) return null;
  if (!options.allowAdmin && instance.userId !== userId) return null;

  const [employee] = await db
    .select()
    .from(workerEmployee)
    .where(eq(workerEmployee.id, instance.employeeId))
    .limit(1);
  const [version] = await db
    .select()
    .from(workerEmployeeVersion)
    .where(eq(workerEmployeeVersion.id, instance.employeeVersionId))
    .limit(1);

  if (!employee || !version) return null;
  return { instance, employee, version };
}

export async function listWorkerInstancesForUser(userId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(workerInstance)
    .where(eq(workerInstance.userId, userId))
    .orderBy(desc(workerInstance.updatedAt));

  return Promise.all(rows.map(serializeWorkerInstance));
}

export async function listAdminWorkerInstances() {
  const db = await getDb();
  const rows = await db
    .select()
    .from(workerInstance)
    .orderBy(desc(workerInstance.updatedAt));

  return Promise.all(rows.map(serializeWorkerInstance));
}

export async function upgradeWorkerInstanceToLatestVersion(instanceId: string) {
  const db = await getDb();
  const [instance] = await db
    .select()
    .from(workerInstance)
    .where(eq(workerInstance.id, instanceId))
    .limit(1);

  if (!instance) return null;

  const [employee] = await db
    .select()
    .from(workerEmployee)
    .where(eq(workerEmployee.id, instance.employeeId))
    .limit(1);

  if (!employee?.latestVersionId) {
    throw new Error('这个员工还没有可用的灵魂文档版本');
  }

  const [updated] = await db
    .update(workerInstance)
    .set({
      employeeVersionId: employee.latestVersionId,
      status:
        instance.status === 'active'
          ? 'version_upgrade_pending_activation'
          : instance.status,
      updatedAt: new Date(),
    })
    .where(eq(workerInstance.id, instanceId))
    .returning();

  return updated || null;
}

export async function updateWorkerInstanceActivation({
  instanceId,
  status,
  profileName,
  activationId,
  qrPayload,
  qrImageUrl,
  expiresAt,
  weixinAccountId,
  weixinUserId,
  gatewayStatus,
  error,
}: {
  instanceId: string;
  status?: string | null;
  profileName?: string | null;
  activationId?: string | null;
  qrPayload?: string | null;
  qrImageUrl?: string | null;
  expiresAt?: string | null;
  weixinAccountId?: string | null;
  weixinUserId?: string | null;
  gatewayStatus?: string | null;
  error?: string | null;
}) {
  const db = await getDb();
  const nextStatus =
    status === 'activated'
      ? 'active'
      : status === 'expired'
        ? 'activation_expired'
        : status === 'failed'
          ? 'activation_failed'
          : status || undefined;

  const [updated] = await db
    .update(workerInstance)
    .set({
      status: nextStatus,
      profileName: profileName || undefined,
      activationId: activationId || undefined,
      qrPayload: qrPayload || undefined,
      qrImageUrl: qrImageUrl || undefined,
      activationExpiresAt: expiresAt ? new Date(expiresAt) : undefined,
      weixinAccountId: weixinAccountId || undefined,
      weixinUserId: weixinUserId || undefined,
      gatewayStatus: gatewayStatus || undefined,
      error: error || null,
      activatedAt: status === 'activated' ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(workerInstance.id, instanceId))
    .returning();

  return updated || null;
}

export function isPaidWorkerInstance(instance: {
  paymentStatus: string;
  status: string;
}) {
  return isPaidStatus(instance.paymentStatus) || instance.status === 'active';
}

export function serializeEmployeeVersion(version: typeof workerEmployeeVersion.$inferSelect) {
  return {
    id: version.id,
    employeeId: version.employeeId,
    soulPath: version.soulPath,
    soulHash: version.soulHash,
    readmeHash: version.readmeHash,
    skillsHash: version.skillsHash,
    skillsSummary: version.skillsSummary,
    createdAt: toIsoString(version.createdAt),
  };
}

function readRoster(sourceRoot: string) {
  const rosterPath = join(sourceRoot, 'employee-roster.md');
  if (!existsSync(rosterPath)) {
    throw new Error(`找不到员工花名册：${rosterPath}`);
  }

  const content = readFileSync(rosterPath, 'utf8');
  const sections = splitRosterSections(content);
  return sections
    .map((section) => parseRosterSection(section, sourceRoot))
    .filter((item): item is RosterEmployee => Boolean(item?.employeeDir));
}

function splitRosterSections(content: string) {
  const sections: Array<{ title: string; body: string }> = [];
  const lines = content.split(/\r?\n/);
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(/^###\s+(.+?)\s*$/);
    if (match) {
      if (current) {
        sections.push({ title: current.title, body: current.lines.join('\n') });
      }
      current = { title: match[1]!.trim(), lines: [] };
      continue;
    }

    if (current) current.lines.push(line);
  }

  if (current) {
    sections.push({ title: current.title, body: current.lines.join('\n') });
  }

  return sections;
}

function parseRosterSection(
  section: { title: string; body: string },
  sourceRoot: string
): RosterEmployee | null {
  const employeeDir = resolveRosterPath(
    readChineseListValue(section.body, '员工目录'),
    sourceRoot
  );
  const readmePath = resolveRosterPath(
    readChineseListValue(section.body, '使用手册'),
    sourceRoot
  );

  if (!employeeDir || !readmePath) return null;

  const id = basename(employeeDir);
  return {
    id,
    name: readEmployeeName(section.title, id),
    responsibility: readChineseListValue(section.body, '职责') || '',
    suitableTasks: readChineseListValue(section.body, '适用任务') || '',
    solvesProblem: readChineseListValue(section.body, '解决问题') || '',
    employeeDir,
    readmePath,
  };
}

function readChineseListValue(body: string, label: string) {
  const pattern = new RegExp(`^-\\s*${label}：\\s*(.+?)\\s*$`, 'm');
  const match = body.match(pattern);
  if (!match) return '';
  return stripMarkdownPath(match[1]!.trim());
}

function stripMarkdownPath(value: string) {
  return value.replace(/^`/, '').replace(/`$/, '').trim();
}

function resolveRosterPath(value: string, sourceRoot: string) {
  if (!value) return '';
  if (value.startsWith('/')) return resolve(value);
  return resolve(sourceRoot, value);
}

function readEmployeeName(title: string, id: string) {
  const alias = title.match(/^[A-Za-z0-9_-]+[（(](.+?)[）)]$/)?.[1];
  if (alias) return alias.trim();
  if (title === id) return id;
  return title.trim();
}

function findSoulPath(employeeDir: string, employeeId: string) {
  const candidates = [
    join(employeeDir, 'SOUL.md'),
    join(employeeDir, `${employeeId}.md`),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  const markdownFiles = existsSync(employeeDir)
    ? readdirSync(employeeDir)
        .filter((name) => name.endsWith('.md') && name !== 'README.md')
        .map((name) => join(employeeDir, name))
    : [];

  return markdownFiles[0] || null;
}

function readSkillsSummary(employeeDir: string) {
  const skillsDir = join(employeeDir, 'skills');
  if (!existsSync(skillsDir)) return [];

  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function readOptionalText(path: string) {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : '';
  } catch {
    return '';
  }
}

function isPathInside(rootPath: string, targetPath: string) {
  const rel = relative(resolve(rootPath), resolve(targetPath));
  return Boolean(rel) && !rel.startsWith('..') && !rel.startsWith('/');
}

function hashText(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function buildEmployeeVersionId(employeeId: string, hash: string) {
  const safeEmployeeId = employeeId.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return `wev_${safeEmployeeId}_${hash.slice(0, 16)}`;
}

function getDefaultWorkerMonthlyPrice() {
  const configured = Object.values(websiteConfig.price.plans)
    .flatMap((plan) => plan.prices)
    .find((price) => price.priceId === DEFAULT_WORKER_PRICE_ID);

  return {
    priceId: configured?.priceId || DEFAULT_WORKER_PRICE_ID,
    amount:
      typeof configured?.amount === 'number'
        ? configured.amount
        : Number.isFinite(DEFAULT_WORKER_AMOUNT)
          ? DEFAULT_WORKER_AMOUNT
          : 2900,
    currency: configured?.currency || 'CNY',
  };
}

function isPaidStatus(status: string) {
  return WORKER_INSTANCE_PAID_STATUSES.includes(
    status as (typeof WORKER_INSTANCE_PAID_STATUSES)[number]
  );
}

async function findWorkerInstanceForPayment({
  workerInstanceId,
  subscriptionId,
  checkoutSessionId,
}: {
  workerInstanceId?: string | null;
  subscriptionId?: string | null;
  checkoutSessionId?: string | null;
}) {
  const db = await getDb();

  if (workerInstanceId) {
    const [instance] = await db
      .select()
      .from(workerInstance)
      .where(eq(workerInstance.id, workerInstanceId))
      .limit(1);
    if (instance) return instance;
  }

  if (subscriptionId) {
    const [instance] = await db
      .select()
      .from(workerInstance)
      .where(eq(workerInstance.subscriptionId, subscriptionId))
      .limit(1);
    if (instance) return instance;
  }

  if (checkoutSessionId) {
    const [instance] = await db
      .select()
      .from(workerInstance)
      .where(eq(workerInstance.checkoutSessionId, checkoutSessionId))
      .limit(1);
    if (instance) return instance;
  }

  return null;
}

async function serializeWorkerEmployee(
  employee: typeof workerEmployee.$inferSelect
) {
  const db = await getDb();
  const [version, skills] = await Promise.all([
    employee.latestVersionId
      ? db
          .select()
          .from(workerEmployeeVersion)
          .where(eq(workerEmployeeVersion.id, employee.latestVersionId))
          .limit(1)
          .then((rows) => rows[0] || null)
      : Promise.resolve(null),
    listEmployeeSkillsForEmployee(employee.id),
  ]);

  return {
    id: employee.id,
    name: employee.name,
    responsibility: employee.responsibility,
    suitableTasks: employee.suitableTasks,
    solvesProblem: employee.solvesProblem,
    status: employee.status,
    employeeDir: employee.employeeDir,
    readmePath: employee.readmePath,
    soulPath: employee.soulPath,
    monthlyPriceId: employee.monthlyPriceId,
    monthlyAmount: employee.monthlyAmount,
    currency: employee.currency,
    sourceHash: employee.sourceHash,
    latestVersionId: employee.latestVersionId,
    syncedAt: toIsoString(employee.syncedAt),
    createdAt: toIsoString(employee.createdAt),
    updatedAt: toIsoString(employee.updatedAt),
    version: version ? serializeEmployeeVersion(version) : null,
    skills,
  };
}

async function serializeWorkerInstance(
  instance: typeof workerInstance.$inferSelect
) {
  const db = await getDb();
  const [employee] = await db
    .select()
    .from(workerEmployee)
    .where(eq(workerEmployee.id, instance.employeeId))
    .limit(1);
  const skills = employee
    ? await listWorkerInstanceSkillsByTarget({ instance, employee })
    : [];

  return {
    id: instance.id,
    userId: instance.userId,
    employeeId: instance.employeeId,
    employeeVersionId: instance.employeeVersionId,
    employee: employee
      ? {
          id: employee.id,
          name: employee.name,
          responsibility: employee.responsibility,
          suitableTasks: employee.suitableTasks,
          solvesProblem: employee.solvesProblem,
          monthlyAmount: employee.monthlyAmount,
          currency: employee.currency,
        }
      : null,
    personaId: instance.personaId,
    status: instance.status,
    paymentStatus: instance.paymentStatus,
    priceId: instance.priceId,
    accessSource: instance.accessSource,
    membershipPriceId: instance.membershipPriceId,
    subscriptionId: instance.subscriptionId,
    checkoutSessionId: instance.checkoutSessionId,
    profileName: instance.profileName,
    activationId: instance.activationId,
    qrPayload: instance.qrPayload,
    qrImageUrl: instance.qrImageUrl,
    activationExpiresAt: toIsoString(instance.activationExpiresAt),
    weixinAccountId: instance.weixinAccountId,
    weixinUserId: instance.weixinUserId,
    gatewayStatus: instance.gatewayStatus,
    error: instance.error,
    skills,
    activatedAt: toIsoString(instance.activatedAt),
    createdAt: toIsoString(instance.createdAt),
    updatedAt: toIsoString(instance.updatedAt),
  };
}

async function syncDefaultWorkerInstanceSkills({
  instanceId,
  employeeId,
}: {
  instanceId: string;
  employeeId: string;
}) {
  const db = await getDb();
  const rows = await db
    .select({
      skill: workerSkill,
      employeeSkill: workerEmployeeSkill,
    })
    .from(workerEmployeeSkill)
    .innerJoin(workerSkill, eq(workerEmployeeSkill.skillId, workerSkill.id))
    .where(
      and(
        eq(workerEmployeeSkill.employeeId, employeeId),
        eq(workerEmployeeSkill.status, 'allowed')
      )
    );

  const defaults = rows.filter(
    ({ skill, employeeSkill }) =>
      employeeSkill.defaultEnabled && isSkillVisibleToUser(skill.status)
  );

  if (!defaults.length) return;

  const now = new Date();
  await db
    .insert(workerInstanceSkill)
    .values(
      defaults.map(({ skill }) => ({
        id: buildScopedId('wis', instanceId, skill.id),
        instanceId,
        skillId: skill.id,
        enabled: true,
        source: 'default',
        createdAt: now,
        updatedAt: now,
      }))
    )
    .onConflictDoNothing();
}

async function listEmployeeSkillsForEmployee(employeeId: string) {
  const db = await getDb();
  const rows = await db
    .select({
      skill: workerSkill,
      employeeSkill: workerEmployeeSkill,
    })
    .from(workerEmployeeSkill)
    .innerJoin(workerSkill, eq(workerEmployeeSkill.skillId, workerSkill.id))
    .where(eq(workerEmployeeSkill.employeeId, employeeId))
    .orderBy(workerSkill.name);

  return rows
    .filter(
      ({ skill, employeeSkill }) =>
        employeeSkill.status === 'allowed' && isSkillVisibleToUser(skill.status)
    )
    .map(({ skill, employeeSkill }) => ({
      ...serializeWorkerSkill(skill),
      employeeSkill: serializeWorkerEmployeeSkill(employeeSkill),
    }));
}

async function listWorkerInstanceSkillsByTarget({
  instance,
  employee,
}: {
  instance: typeof workerInstance.$inferSelect;
  employee: typeof workerEmployee.$inferSelect;
}): Promise<WorkerSkillForInstance[]> {
  const db = await getDb();
  const rows = await db
    .select({
      skill: workerSkill,
      employeeSkill: workerEmployeeSkill,
      instanceSkill: workerInstanceSkill,
    })
    .from(workerEmployeeSkill)
    .innerJoin(workerSkill, eq(workerEmployeeSkill.skillId, workerSkill.id))
    .leftJoin(
      workerInstanceSkill,
      and(
        eq(workerInstanceSkill.instanceId, instance.id),
        eq(workerInstanceSkill.skillId, workerSkill.id)
      )
    )
    .where(
      and(
        eq(workerEmployeeSkill.employeeId, employee.id),
        eq(workerEmployeeSkill.status, 'allowed')
      )
    )
    .orderBy(workerSkill.name);

  const visibleRows = rows.filter(({ skill }) =>
    isSkillVisibleToUser(skill.status)
  );
  const skillIds = visibleRows.map(({ skill }) => skill.id);
  const packRows = skillIds.length
    ? await db
        .select({
          skillId: workerSkillKnowledgePack.skillId,
          knowledgePackId: workerSkillKnowledgePack.knowledgePackId,
        })
        .from(workerSkillKnowledgePack)
        .where(
          and(
            inArray(workerSkillKnowledgePack.skillId, skillIds),
            eq(workerSkillKnowledgePack.status, 'enabled')
          )
        )
    : [];
  const packIdsBySkill = new Map<string, string[]>();

  for (const row of packRows) {
    const current = packIdsBySkill.get(row.skillId) || [];
    current.push(row.knowledgePackId);
    packIdsBySkill.set(row.skillId, current);
  }

  return visibleRows.map(({ skill, employeeSkill, instanceSkill }) => ({
      id: skill.id,
      name: skill.name,
      summary: skill.summary,
      category: skill.category,
      skillType: skill.skillType,
      riskLevel: skill.riskLevel,
      status: skill.status,
      employeeSkillStatus: employeeSkill.status,
      employeeDefaultEnabled: employeeSkill.defaultEnabled,
      enabled: instanceSkill?.enabled ?? employeeSkill.defaultEnabled,
      requiresUserConfig: skill.requiresUserConfig,
      knowledgePackIds: packIdsBySkill.get(skill.id) || [],
    }));
}

async function listWorkerInstanceKnowledgePacksByTarget({
  instance,
  employee,
}: {
  instance: typeof workerInstance.$inferSelect;
  employee: typeof workerEmployee.$inferSelect;
}): Promise<WorkerKnowledgePackForInstance[]> {
  const db = await getDb();
  const skills = await listWorkerInstanceSkillsByTarget({ instance, employee });
  const enabledSkillIds = skills
    .filter((skill) => skill.enabled)
    .map((skill) => skill.id);
  const rows: WorkerKnowledgePackForInstance[] = [];

  const employeePackRows = await db
    .select({
      pack: knowledgePack,
      mapping: workerEmployeeKnowledgePack,
    })
    .from(workerEmployeeKnowledgePack)
    .innerJoin(
      knowledgePack,
      eq(workerEmployeeKnowledgePack.knowledgePackId, knowledgePack.id)
    )
    .where(
      and(
        eq(workerEmployeeKnowledgePack.employeeId, employee.id),
        eq(workerEmployeeKnowledgePack.status, 'enabled')
      )
    );

  for (const { pack } of employeePackRows) {
    rows.push({
      ...serializeKnowledgePackForInstance(pack),
      source: 'employee',
      skillId: null,
    });
  }

  if (enabledSkillIds.length) {
    const skillPackRows = await db
      .select({
        pack: knowledgePack,
        mapping: workerSkillKnowledgePack,
      })
      .from(workerSkillKnowledgePack)
      .innerJoin(
        knowledgePack,
        eq(workerSkillKnowledgePack.knowledgePackId, knowledgePack.id)
      )
      .where(
        and(
          inArray(workerSkillKnowledgePack.skillId, enabledSkillIds),
          eq(workerSkillKnowledgePack.status, 'enabled')
        )
      );

    for (const { pack, mapping } of skillPackRows) {
      rows.push({
        ...serializeKnowledgePackForInstance(pack),
        source: 'skill',
        skillId: mapping.skillId,
      });
    }
  }

  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.id}:${row.source}:${row.skillId || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return row.status === 'active' || row.status === 'published';
  });
}

function serializeKnowledgePackForInstance(
  pack: typeof knowledgePack.$inferSelect
) {
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    scope: pack.scope,
    status: pack.status,
  };
}

function serializeWorkerSkill(skill: typeof workerSkill.$inferSelect) {
  return {
    id: skill.id,
    name: skill.name,
    summary: skill.summary,
    category: skill.category,
    skillType: skill.skillType,
    riskLevel: skill.riskLevel,
    status: skill.status,
    defaultEnabled: skill.defaultEnabled,
    requiresUserConfig: skill.requiresUserConfig,
    createdAt: toIsoString(skill.createdAt),
    updatedAt: toIsoString(skill.updatedAt),
  };
}

function serializeWorkerEmployeeSkill(
  assignment: typeof workerEmployeeSkill.$inferSelect
) {
  return {
    id: assignment.id,
    employeeId: assignment.employeeId,
    skillId: assignment.skillId,
    status: assignment.status,
    defaultEnabled: assignment.defaultEnabled,
    createdAt: toIsoString(assignment.createdAt),
    updatedAt: toIsoString(assignment.updatedAt),
  };
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSkillId(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildWorkerSkillId(name: string) {
  const slug = normalizeSkillId(name).slice(0, 36);
  const suffix = hashText(name).slice(0, 10);
  return slug ? `skill_${slug}_${suffix}` : `skill_${suffix}`;
}

function buildScopedId(prefix: string, ...parts: string[]) {
  return `${prefix}_${hashText(parts.join(':')).slice(0, 24)}`;
}

function normalizeWorkerSkillStatus(value: unknown) {
  return WORKER_SKILL_STATUSES.includes(
    value as (typeof WORKER_SKILL_STATUSES)[number]
  )
    ? (value as string)
    : 'draft';
}

function normalizeSkillType(value: unknown) {
  return WORKER_SKILL_TYPES.includes(
    value as (typeof WORKER_SKILL_TYPES)[number]
  )
    ? (value as string)
    : 'config';
}

function normalizeSkillRiskLevel(value: unknown) {
  return WORKER_SKILL_RISK_LEVELS.includes(
    value as (typeof WORKER_SKILL_RISK_LEVELS)[number]
  )
    ? (value as string)
    : 'low';
}

function isSkillVisibleToUser(status: string) {
  return USER_VISIBLE_SKILL_STATUSES.includes(
    status as (typeof USER_VISIBLE_SKILL_STATUSES)[number]
  );
}

function toIsoString(value?: Date | null) {
  return value instanceof Date ? value.toISOString() : null;
}
