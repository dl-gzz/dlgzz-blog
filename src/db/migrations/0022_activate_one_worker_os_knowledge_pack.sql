UPDATE "knowledge_packs"
SET
  "name" = 'one-worker-os · 独立工作者 WorkBuddy 知识包',
  "status" = 'active',
  "updated_at" = now()
WHERE "id" = 'onework-workbuddy-v1'
  AND (
    "name" IS DISTINCT FROM 'one-worker-os · 独立工作者 WorkBuddy 知识包'
    OR "status" IS DISTINCT FROM 'active'
  );
