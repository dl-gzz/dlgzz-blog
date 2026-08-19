-- Normalize user-facing one-worker-os labels without changing stable IDs,
-- OAuth grants, token hashes, entitlements, or knowledge-pack relationships.

UPDATE "knowledge_packs"
SET
  "name" = 'one-worker-os · 独立工作者 WorkBuddy 知识包',
  "updated_at" = now()
WHERE "id" = 'onework-workbuddy-v1'
  AND "name" IS DISTINCT FROM 'one-worker-os · 独立工作者 WorkBuddy 知识包';
--> statement-breakpoint

UPDATE "api_key"
SET
  "name" = replace(replace(replace(replace("name", 'OneWork OS', 'one-worker-os'), 'OneWorkOS', 'one-worker-os'), 'OneWorkerOS', 'one-worker-os'), 'onework-os', 'one-worker-os'),
  "updated_at" = now()
WHERE "name" LIKE '%OneWork OS%'
   OR "name" LIKE '%OneWorkOS%'
   OR "name" LIKE '%OneWorkerOS%'
   OR "name" LIKE '%onework-os%';
--> statement-breakpoint

UPDATE "onework_install_token"
SET "device_name" = replace(replace(replace(replace("device_name", 'OneWork OS', 'one-worker-os'), 'OneWorkOS', 'one-worker-os'), 'OneWorkerOS', 'one-worker-os'), 'onework-os', 'one-worker-os')
WHERE "device_name" LIKE '%OneWork OS%'
   OR "device_name" LIKE '%OneWorkOS%'
   OR "device_name" LIKE '%OneWorkerOS%'
   OR "device_name" LIKE '%onework-os%';
--> statement-breakpoint

UPDATE "onework_oauth_client"
SET
  "client_name" = replace(replace(replace(replace("client_name", 'OneWork OS', 'one-worker-os'), 'OneWorkOS', 'one-worker-os'), 'OneWorkerOS', 'one-worker-os'), 'onework-os', 'one-worker-os'),
  "updated_at" = now()
WHERE "client_name" LIKE '%OneWork OS%'
   OR "client_name" LIKE '%OneWorkOS%'
   OR "client_name" LIKE '%OneWorkerOS%'
   OR "client_name" LIKE '%onework-os%';
--> statement-breakpoint

UPDATE "onework_capability"
SET
  "name" = replace(replace(replace(replace("name", 'OneWork OS', 'one-worker-os'), 'OneWorkOS', 'one-worker-os'), 'OneWorkerOS', 'one-worker-os'), 'onework-os', 'one-worker-os'),
  "description" = replace(replace(replace(replace("description", 'OneWork OS', 'one-worker-os'), 'OneWorkOS', 'one-worker-os'), 'OneWorkerOS', 'one-worker-os'), 'onework-os', 'one-worker-os'),
  "updated_at" = now()
WHERE "name" LIKE '%OneWork OS%'
   OR "name" LIKE '%OneWorkOS%'
   OR "name" LIKE '%OneWorkerOS%'
   OR "name" LIKE '%onework-os%'
   OR "description" LIKE '%OneWork OS%'
   OR "description" LIKE '%OneWorkOS%'
   OR "description" LIKE '%OneWorkerOS%'
   OR "description" LIKE '%onework-os%';
--> statement-breakpoint

UPDATE "semantic_model"
SET
  "name" = replace(replace(replace(replace("name", 'OneWork OS', 'one-worker-os'), 'OneWorkOS', 'one-worker-os'), 'OneWorkerOS', 'one-worker-os'), 'onework-os', 'one-worker-os'),
  "description" = replace(replace(replace(replace("description", 'OneWork OS', 'one-worker-os'), 'OneWorkOS', 'one-worker-os'), 'OneWorkerOS', 'one-worker-os'), 'onework-os', 'one-worker-os'),
  "updated_at" = now()
WHERE "name" LIKE '%OneWork OS%'
   OR "name" LIKE '%OneWorkOS%'
   OR "name" LIKE '%OneWorkerOS%'
   OR "name" LIKE '%onework-os%'
   OR "description" LIKE '%OneWork OS%'
   OR "description" LIKE '%OneWorkOS%'
   OR "description" LIKE '%OneWorkerOS%'
   OR "description" LIKE '%onework-os%';
--> statement-breakpoint

UPDATE "worker_skill"
SET
  "name" = replace(replace(replace(replace("name", 'OneWork OS', 'one-worker-os'), 'OneWorkOS', 'one-worker-os'), 'OneWorkerOS', 'one-worker-os'), 'onework-os', 'one-worker-os'),
  "summary" = replace(replace(replace(replace("summary", 'OneWork OS', 'one-worker-os'), 'OneWorkOS', 'one-worker-os'), 'OneWorkerOS', 'one-worker-os'), 'onework-os', 'one-worker-os'),
  "updated_at" = now()
WHERE "name" LIKE '%OneWork OS%'
   OR "name" LIKE '%OneWorkOS%'
   OR "name" LIKE '%OneWorkerOS%'
   OR "name" LIKE '%onework-os%'
   OR "summary" LIKE '%OneWork OS%'
   OR "summary" LIKE '%OneWorkOS%'
   OR "summary" LIKE '%OneWorkerOS%'
   OR "summary" LIKE '%onework-os%';
