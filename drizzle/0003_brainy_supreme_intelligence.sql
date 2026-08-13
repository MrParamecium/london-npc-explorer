CREATE TYPE "public"."generation_mode" AS ENUM('profile_only', 'full');--> statement-breakpoint
ALTER TABLE "npc_generation_jobs" DROP CONSTRAINT "generation_jobs_atomic_completion";--> statement-breakpoint
ALTER TABLE "npcs" DROP CONSTRAINT "npcs_portrait_url_nonempty";--> statement-breakpoint
ALTER TABLE "npcs" ALTER COLUMN "portrait_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD COLUMN "compatibility_set_key" text;--> statement-breakpoint
ALTER TABLE "npc_generation_jobs" ADD COLUMN "mode" "generation_mode" DEFAULT 'profile_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "npc_generation_jobs" ADD COLUMN "version_set" jsonb;--> statement-breakpoint
ALTER TABLE "npcs" ADD COLUMN "field_provenance" jsonb DEFAULT '{"/legacy":{"kind":"template","datasetVersionId":null,"metric":null,"geographyLevel":null,"geographyCode":null,"sourceRelease":"legacy-v1","transformVersion":"legacy-v1"}}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "npc_generation_jobs" ADD CONSTRAINT "generation_jobs_atomic_completion" CHECK ("npc_generation_jobs"."status" <> 'completed' or ("npc_generation_jobs"."stage" = 'completed' and "npc_generation_jobs"."result_npc_id" is not null and ("npc_generation_jobs"."mode" = 'profile_only' or "npc_generation_jobs"."portrait_url" is not null) and "npc_generation_jobs"."failure" is null));--> statement-breakpoint
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_portrait_url_nonempty" CHECK ("npcs"."portrait_url" is null or length("npcs"."portrait_url") > 0);
