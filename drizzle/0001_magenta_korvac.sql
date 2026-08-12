CREATE TABLE "geography_boundaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"geography_level" "geography_level" NOT NULL,
	"geography_code" text NOT NULL,
	"name" text NOT NULL,
	"parent_code" text,
	"boundary" geometry(MultiPolygon,4326) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geography_boundaries_code_nonempty" CHECK (length("geography_boundaries"."geography_code") > 0),
	CONSTRAINT "geography_boundaries_name_nonempty" CHECK (length("geography_boundaries"."name") > 0)
);
--> statement-breakpoint
ALTER TABLE "geography_boundaries" ADD CONSTRAINT "geography_boundaries_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "geography_boundaries_version_code_unique" ON "geography_boundaries" USING btree ("dataset_version_id","geography_level","geography_code");--> statement-breakpoint
CREATE INDEX "geography_boundaries_level_code_idx" ON "geography_boundaries" USING btree ("geography_level","geography_code");--> statement-breakpoint
CREATE INDEX "geography_boundaries_boundary_gist_idx" ON "geography_boundaries" USING gist ("boundary");