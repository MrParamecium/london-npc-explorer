CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TYPE "public"."dataset_state" AS ENUM('pending', 'active', 'superseded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."generation_stage" AS ENUM('queued', 'location', 'profile', 'narrative', 'portrait', 'persistence', 'completed');--> statement-breakpoint
CREATE TYPE "public"."generation_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."geography_level" AS ENUM('lsoa', 'ward', 'borough', 'london');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'npc');--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "area_statistics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"geography_level" "geography_level" NOT NULL,
	"geography_code" text NOT NULL,
	"metric" text NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"distribution" jsonb NOT NULL,
	"sample_size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "area_statistics_sample_size_nonnegative" CHECK ("area_statistics"."sample_size" is null or "area_statistics"."sample_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"npc_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dataset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"release_label" text NOT NULL,
	"transform_version" text NOT NULL,
	"state" "dataset_state" DEFAULT 'pending' NOT NULL,
	"source_published_at" timestamp with time zone,
	"imported_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "npc_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"location_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"seed" text NOT NULL,
	"status" "generation_status" DEFAULT 'queued' NOT NULL,
	"stage" "generation_stage" DEFAULT 'queued' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" numeric(10, 4) DEFAULT 0 NOT NULL,
	"failure" jsonb,
	"result_npc_id" uuid,
	"portrait_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_jobs_retry_range" CHECK ("npc_generation_jobs"."retry_count" between 0 and 1),
	CONSTRAINT "generation_jobs_cost_nonnegative" CHECK ("npc_generation_jobs"."estimated_cost_usd" >= 0),
	CONSTRAINT "generation_jobs_atomic_completion" CHECK ("npc_generation_jobs"."status" <> 'completed' or ("npc_generation_jobs"."stage" = 'completed' and "npc_generation_jobs"."result_npc_id" is not null and "npc_generation_jobs"."portrait_url" is not null and "npc_generation_jobs"."failure" is null)),
	CONSTRAINT "generation_jobs_no_partial_visibility" CHECK ("npc_generation_jobs"."status" = 'completed' or "npc_generation_jobs"."result_npc_id" is null)
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"coordinate" geometry(Point,4326) NOT NULL,
	"lsoa_code" text NOT NULL,
	"ward_code" text,
	"borough_code" text NOT NULL,
	"fallback_level" "geography_level" NOT NULL,
	"google_place_id" text,
	"panorama_id" text,
	"google_identifiers_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_latitude_bounds" CHECK ("locations"."latitude" between -90 and 90),
	CONSTRAINT "locations_longitude_bounds" CHECK ("locations"."longitude" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"action" text,
	"emotion" text,
	"memory_update" text,
	"provider_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_sequence_positive" CHECK ("messages"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "npc_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"npc_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"summary" text NOT NULL,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "npc_memories_version_positive" CHECK ("npc_memories"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "npcs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"location_id" uuid NOT NULL,
	"generation_job_id" uuid NOT NULL,
	"seed" text NOT NULL,
	"canonical_profile" jsonb NOT NULL,
	"current_state" jsonb NOT NULL,
	"version_set" jsonb NOT NULL,
	"narrative" text NOT NULL,
	"portrait_url" text NOT NULL,
	"visible_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "npcs_portrait_url_nonempty" CHECK (length("npcs"."portrait_url") > 0)
);
--> statement-breakpoint
ALTER TABLE "area_statistics" ADD CONSTRAINT "area_statistics_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_npc_id_npcs_id_fk" FOREIGN KEY ("npc_id") REFERENCES "public"."npcs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc_generation_jobs" ADD CONSTRAINT "npc_generation_jobs_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc_generation_jobs" ADD CONSTRAINT "npc_generation_jobs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc_generation_jobs" ADD CONSTRAINT "npc_generation_jobs_result_npc_id_npcs_id_fk" FOREIGN KEY ("result_npc_id") REFERENCES "public"."npcs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc_memories" ADD CONSTRAINT "npc_memories_npc_id_npcs_id_fk" FOREIGN KEY ("npc_id") REFERENCES "public"."npcs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc_memories" ADD CONSTRAINT "npc_memories_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_generation_job_id_npc_generation_jobs_id_fk" FOREIGN KEY ("generation_job_id") REFERENCES "public"."npc_generation_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "area_statistics_metric_unique" ON "area_statistics" USING btree ("dataset_version_id","geography_level","geography_code","metric");--> statement-breakpoint
CREATE INDEX "area_statistics_geography_idx" ON "area_statistics" USING btree ("geography_level","geography_code");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_owner_npc_unique" ON "conversations" USING btree ("owner_id","npc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_versions_release_unique" ON "dataset_versions" USING btree ("source","release_label","transform_version");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_jobs_owner_idempotency_unique" ON "npc_generation_jobs" USING btree ("owner_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "generation_jobs_owner_created_idx" ON "npc_generation_jobs" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_coordinate_unique" ON "locations" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "locations_coordinate_gist_idx" ON "locations" USING gist ("coordinate");--> statement-breakpoint
CREATE INDEX "locations_lsoa_idx" ON "locations" USING btree ("lsoa_code");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conversation_sequence_unique" ON "messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "npc_memories_npc_version_unique" ON "npc_memories" USING btree ("npc_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "npc_memories_one_current_unique" ON "npc_memories" USING btree ("npc_id") WHERE "npc_memories"."is_current" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "npcs_generation_job_unique" ON "npcs" USING btree ("generation_job_id");--> statement-breakpoint
CREATE INDEX "npcs_owner_created_idx" ON "npcs" USING btree ("owner_id","created_at");
