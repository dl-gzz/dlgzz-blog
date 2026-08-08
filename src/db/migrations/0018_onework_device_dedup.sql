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
--> statement-breakpoint

-- 兼容尚未切换到新后端的旧安装器：重复插入时更新原记录，而不是触发唯一约束错误。
CREATE OR REPLACE FUNCTION "onework_device_dedup_before_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  existing_device_id text;
  existing_api_key_id text;
BEGIN
  SELECT id, api_key_id
    INTO existing_device_id, existing_api_key_id
    FROM "onework_device"
   WHERE user_id = NEW.user_id
     AND device_hash = NEW.device_hash
   FOR UPDATE;

  IF existing_device_id IS NOT NULL THEN
    UPDATE "api_key"
       SET status = 'revoked',
           revoked_at = COALESCE(revoked_at, now()),
           updated_at = now()
     WHERE id = existing_api_key_id
       AND id <> NEW.api_key_id;

    UPDATE "onework_device"
       SET api_key_id = NEW.api_key_id,
           device_name = NEW.device_name,
           platform = NEW.platform,
           status = 'active',
           last_seen_at = NEW.last_seen_at,
           updated_at = now()
     WHERE id = existing_device_id;
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "onework_device_dedup_before_insert_trigger" ON "onework_device";
--> statement-breakpoint

CREATE TRIGGER "onework_device_dedup_before_insert_trigger"
BEFORE INSERT ON "onework_device"
FOR EACH ROW
EXECUTE FUNCTION "onework_device_dedup_before_insert"();
