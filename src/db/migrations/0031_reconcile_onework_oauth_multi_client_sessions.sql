-- Reconcile databases where the multi-client OAuth migration was omitted
-- from the journal. Re-running this is safe whether 0028 was applied or not.
DROP INDEX IF EXISTS "onework_oauth_active_session_user_resource_unique_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onework_oauth_active_session_user_resource_client_unique_idx"
	ON "onework_oauth_active_session" ("user_id", "resource", "client_id");
