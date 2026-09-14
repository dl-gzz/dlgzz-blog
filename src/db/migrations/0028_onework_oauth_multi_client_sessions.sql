-- Allow one account to stay connected from multiple WorkBuddy installations.
-- Re-authorizing the same dynamic client still replaces that client's token
-- family, but a different client/device no longer gets logged out.

DROP INDEX IF EXISTS "onework_oauth_active_session_user_resource_unique_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onework_oauth_active_session_user_resource_client_unique_idx"
	ON "onework_oauth_active_session" ("user_id", "resource", "client_id");
