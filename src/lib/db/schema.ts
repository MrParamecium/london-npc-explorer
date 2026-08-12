import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  geometry,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import type { NpcMemory } from "@/lib/agent/contracts";
import type { GenerationJob } from "@/lib/generation/contracts";
import type {
  CanonicalNpcProfile,
  NpcCurrentState,
  NpcVersionSet,
} from "@/lib/npc/contracts";

type JsonObject = Record<string, unknown>;

const multiPolygon4326 = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(MultiPolygon,4326)";
  },
});

export const datasetStateEnum = pgEnum("dataset_state", [
  "pending",
  "active",
  "superseded",
  "failed",
]);

export const geographyLevelEnum = pgEnum("geography_level", [
  "lsoa",
  "ward",
  "borough",
  "london",
]);

export const generationStatusEnum = pgEnum("generation_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const generationStageEnum = pgEnum("generation_stage", [
  "queued",
  "location",
  "profile",
  "narrative",
  "portrait",
  "persistence",
  "completed",
]);

export const messageRoleEnum = pgEnum("message_role", ["user", "npc"]);

export const appUsers = pgTable("app_users", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const datasetVersions = pgTable(
  "dataset_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: text("source").notNull(),
    releaseLabel: text("release_label").notNull(),
    transformVersion: text("transform_version").notNull(),
    state: datasetStateEnum("state").default("pending").notNull(),
    sourcePublishedAt: timestamp("source_published_at", {
      withTimezone: true,
    }),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("dataset_versions_release_unique").on(
      table.source,
      table.releaseLabel,
      table.transformVersion,
    ),
    uniqueIndex("dataset_versions_one_active_source_unique")
      .on(table.source)
      .where(sql`${table.state} = 'active'`),
  ],
);

export const areaStatistics = pgTable(
  "area_statistics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    datasetVersionId: uuid("dataset_version_id")
      .notNull()
      .references(() => datasetVersions.id, { onDelete: "cascade" }),
    geographyLevel: geographyLevelEnum("geography_level").notNull(),
    geographyCode: text("geography_code").notNull(),
    metric: text("metric").notNull(),
    dimensions: jsonb("dimensions").$type<JsonObject>().default({}).notNull(),
    distribution: jsonb("distribution").$type<JsonObject>().notNull(),
    sampleSize: integer("sample_size"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("area_statistics_metric_unique").on(
      table.datasetVersionId,
      table.geographyLevel,
      table.geographyCode,
      table.metric,
    ),
    index("area_statistics_geography_idx").on(
      table.geographyLevel,
      table.geographyCode,
    ),
    check(
      "area_statistics_sample_size_nonnegative",
      sql`${table.sampleSize} is null or ${table.sampleSize} >= 0`,
    ),
  ],
);

export const geographyBoundaries = pgTable(
  "geography_boundaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    datasetVersionId: uuid("dataset_version_id")
      .notNull()
      .references(() => datasetVersions.id, { onDelete: "cascade" }),
    geographyLevel: geographyLevelEnum("geography_level").notNull(),
    geographyCode: text("geography_code").notNull(),
    name: text("name").notNull(),
    parentCode: text("parent_code"),
    boundary: multiPolygon4326("boundary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("geography_boundaries_version_code_unique").on(
      table.datasetVersionId,
      table.geographyLevel,
      table.geographyCode,
    ),
    index("geography_boundaries_level_code_idx").on(
      table.geographyLevel,
      table.geographyCode,
    ),
    index("geography_boundaries_boundary_gist_idx").using(
      "gist",
      table.boundary,
    ),
    check(
      "geography_boundaries_code_nonempty",
      sql`length(${table.geographyCode}) > 0`,
    ),
    check("geography_boundaries_name_nonempty", sql`length(${table.name}) > 0`),
  ],
);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    latitude: numeric("latitude", {
      precision: 9,
      scale: 6,
      mode: "number",
    }).notNull(),
    longitude: numeric("longitude", {
      precision: 9,
      scale: 6,
      mode: "number",
    }).notNull(),
    coordinate: geometry("coordinate", {
      type: "point",
      mode: "xy",
      srid: 4326,
    }).notNull(),
    lsoaCode: text("lsoa_code").notNull(),
    wardCode: text("ward_code"),
    boroughCode: text("borough_code").notNull(),
    fallbackLevel: geographyLevelEnum("fallback_level").notNull(),
    googlePlaceId: text("google_place_id"),
    panoramaId: text("panorama_id"),
    googleIdentifiersCheckedAt: timestamp("google_identifiers_checked_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("locations_coordinate_unique").on(
      table.latitude,
      table.longitude,
    ),
    index("locations_coordinate_gist_idx").using("gist", table.coordinate),
    index("locations_lsoa_idx").on(table.lsoaCode),
    check(
      "locations_latitude_bounds",
      sql`${table.latitude} between -90 and 90`,
    ),
    check(
      "locations_longitude_bounds",
      sql`${table.longitude} between -180 and 180`,
    ),
  ],
);

export const generationJobs = pgTable(
  "npc_generation_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    seed: text("seed").notNull(),
    status: generationStatusEnum("status").default("queued").notNull(),
    stage: generationStageEnum("stage").default("queued").notNull(),
    retryCount: integer("retry_count").default(0).notNull(),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 10,
      scale: 4,
      mode: "number",
    })
      .default(0)
      .notNull(),
    failure: jsonb("failure").$type<GenerationJob["failure"]>(),
    resultNpcId: uuid("result_npc_id").references((): AnyPgColumn => npcs.id, {
      onDelete: "set null",
    }),
    portraitUrl: text("portrait_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("generation_jobs_owner_idempotency_unique").on(
      table.ownerId,
      table.idempotencyKey,
    ),
    index("generation_jobs_owner_created_idx").on(
      table.ownerId,
      table.createdAt,
    ),
    check(
      "generation_jobs_retry_range",
      sql`${table.retryCount} between 0 and 1`,
    ),
    check(
      "generation_jobs_cost_nonnegative",
      sql`${table.estimatedCostUsd} >= 0`,
    ),
    check(
      "generation_jobs_atomic_completion",
      sql`${table.status} <> 'completed' or (${table.stage} = 'completed' and ${table.resultNpcId} is not null and ${table.portraitUrl} is not null and ${table.failure} is null)`,
    ),
    check(
      "generation_jobs_no_partial_visibility",
      sql`${table.status} = 'completed' or ${table.resultNpcId} is null`,
    ),
  ],
);

export const npcs = pgTable(
  "npcs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    generationJobId: uuid("generation_job_id")
      .notNull()
      .references(() => generationJobs.id, { onDelete: "restrict" }),
    seed: text("seed").notNull(),
    canonicalProfile: jsonb("canonical_profile")
      .$type<CanonicalNpcProfile>()
      .notNull(),
    currentState: jsonb("current_state").$type<NpcCurrentState>().notNull(),
    versionSet: jsonb("version_set").$type<NpcVersionSet>().notNull(),
    narrative: text("narrative").notNull(),
    portraitUrl: text("portrait_url").notNull(),
    visibleAt: timestamp("visible_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("npcs_generation_job_unique").on(table.generationJobId),
    index("npcs_owner_created_idx").on(table.ownerId, table.createdAt),
    check("npcs_portrait_url_nonempty", sql`length(${table.portraitUrl}) > 0`),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    npcId: uuid("npc_id")
      .notNull()
      .references(() => npcs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("conversations_owner_npc_unique").on(
      table.ownerId,
      table.npcId,
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    action: text("action"),
    emotion: text("emotion"),
    memoryUpdate: text("memory_update"),
    providerMetadata: jsonb("provider_metadata").$type<JsonObject>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("messages_conversation_sequence_unique").on(
      table.conversationId,
      table.sequence,
    ),
    check("messages_sequence_positive", sql`${table.sequence} > 0`),
  ],
);

export const npcMemories = pgTable(
  "npc_memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    npcId: uuid("npc_id")
      .notNull()
      .references(() => npcs.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    summary: text("summary").notNull(),
    facts: jsonb("facts").$type<NpcMemory["facts"]>().default([]).notNull(),
    isCurrent: boolean("is_current").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("npc_memories_npc_version_unique").on(
      table.npcId,
      table.version,
    ),
    uniqueIndex("npc_memories_one_current_unique")
      .on(table.npcId)
      .where(sql`${table.isCurrent} = true`),
    check("npc_memories_version_positive", sql`${table.version} > 0`),
  ],
);

export const appUsersRelations = relations(appUsers, ({ many }) => ({
  generationJobs: many(generationJobs),
  npcs: many(npcs),
  conversations: many(conversations),
}));

export const datasetVersionsRelations = relations(
  datasetVersions,
  ({ many }) => ({
    statistics: many(areaStatistics),
    geographyBoundaries: many(geographyBoundaries),
  }),
);

export const areaStatisticsRelations = relations(areaStatistics, ({ one }) => ({
  datasetVersion: one(datasetVersions, {
    fields: [areaStatistics.datasetVersionId],
    references: [datasetVersions.id],
  }),
}));

export const geographyBoundariesRelations = relations(
  geographyBoundaries,
  ({ one }) => ({
    datasetVersion: one(datasetVersions, {
      fields: [geographyBoundaries.datasetVersionId],
      references: [datasetVersions.id],
    }),
  }),
);

export const locationsRelations = relations(locations, ({ many }) => ({
  generationJobs: many(generationJobs),
  npcs: many(npcs),
}));

export const generationJobsRelations = relations(generationJobs, ({ one }) => ({
  owner: one(appUsers, {
    fields: [generationJobs.ownerId],
    references: [appUsers.id],
  }),
  location: one(locations, {
    fields: [generationJobs.locationId],
    references: [locations.id],
  }),
  resultNpc: one(npcs, {
    fields: [generationJobs.resultNpcId],
    references: [npcs.id],
  }),
}));

export const npcsRelations = relations(npcs, ({ one, many }) => ({
  owner: one(appUsers, {
    fields: [npcs.ownerId],
    references: [appUsers.id],
  }),
  location: one(locations, {
    fields: [npcs.locationId],
    references: [locations.id],
  }),
  generationJob: one(generationJobs, {
    fields: [npcs.generationJobId],
    references: [generationJobs.id],
  }),
  conversations: many(conversations),
  memories: many(npcMemories),
}));

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    owner: one(appUsers, {
      fields: [conversations.ownerId],
      references: [appUsers.id],
    }),
    npc: one(npcs, {
      fields: [conversations.npcId],
      references: [npcs.id],
    }),
    messages: many(messages),
    memories: many(npcMemories),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const npcMemoriesRelations = relations(npcMemories, ({ one }) => ({
  npc: one(npcs, {
    fields: [npcMemories.npcId],
    references: [npcs.id],
  }),
  conversation: one(conversations, {
    fields: [npcMemories.conversationId],
    references: [conversations.id],
  }),
}));
