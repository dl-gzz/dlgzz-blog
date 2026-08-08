-- OneWorkOS 设备授权去重。
-- 同一账号在同一台电脑重复安装时，复用一条设备记录，不再累计“绑定电脑”数量。

CREATE TEMP TABLE "onework_device_dedup" ON COMMIT DROP AS
SELECT
  id,
  api_key_id,
  FIRST_VALUE(id) OVER (
    PARTITION BY user_id, device_hash
    ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, created_at DESC, id DESC
  ) AS keep_id
FROM "onework_device";
--> statement-breakpoint

UPDATE "api_key" AS key_row
SET
  status = 'revoked',
  revoked_at = COALESCE(key_row.revoked_at, now()),
  updated_at = now()
FROM "onework_device_dedup" AS duplicate
WHERE duplicate.id <> duplicate.keep_id
  AND key_row.id = duplicate.api_key_id;
--> statement-breakpoint

DELETE FROM "onework_device" AS device
USING "onework_device_dedup" AS duplicate
WHERE device.id = duplicate.id
  AND duplicate.id <> duplicate.keep_id;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "onework_device_user_hash_unique_idx"
  ON "onework_device" ("user_id", "device_hash");
