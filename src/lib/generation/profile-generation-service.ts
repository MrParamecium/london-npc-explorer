import "server-only";

import { randomUUID } from "node:crypto";

import { CoordinatesSchema, type Coordinates } from "@/lib/location/contracts";
import { resolveLondonGeography } from "@/lib/location/london-geography-repository";
import { saveLocation } from "@/lib/db/queries/locations";
import {
  createOrReuseGenerationJobWithStatus,
  getGenerationJobForOwnerByIdempotency,
  markGenerationJobFailed,
  markGenerationJobRunning,
} from "@/lib/db/queries/generation-jobs";
import {
  completeProfileNpcAtomically,
  getProfileNpcForOwner,
  serializeProfileNpc,
} from "@/lib/db/queries/profile-npcs";
import type { Database } from "@/lib/db/client";
import { createDatabase } from "@/lib/db/client";
import {
  NpcV2VersionSetSchema,
  type NpcV2VersionSet,
} from "@/lib/npc/contracts";
import {
  sampleLondonNpc,
  PROBABILITY_ENGINE_VERSION,
} from "@/lib/sampling/london-npc-sampler";
import { LONDON_NPC_TEMPLATE_VERSION } from "@/lib/npc/template-library";
import { buildProbabilityBundle } from "@/lib/statistics/build-probability-bundle";
import { resolveActiveVersionSet } from "@/lib/statistics/active-version-set";
import type { ActiveStatisticalVersionSet } from "@/lib/statistics/contracts";
import { loadSpatialStatisticCandidates } from "@/lib/statistics/spatial-statistics-repository";

import {
  GenerationIdempotencyKeySchema,
  GenerationSeedSchema,
} from "./contracts";

export class ProfileGenerationError extends Error {
  readonly code:
    | "unsupported_location"
    | "statistics_unavailable"
    | "invalid_distribution"
    | "compatibility_exhausted"
    | "persistence_failed"
    | "unknown";
  readonly retryable: boolean;

  constructor(
    code: ProfileGenerationError["code"],
    message: string,
    retryable = true,
  ) {
    super(message);
    this.name = "ProfileGenerationError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type ProfileGenerationInput = {
  ownerId: string;
  coordinates: Coordinates;
  idempotencyKey: string;
};

export type ProfileGenerationDependencies = {
  database?: Database;
  resolveGeography?: typeof resolveLondonGeography;
  randomSeed?: () => string;
};

function makeVersionSet(
  versionSet: ActiveStatisticalVersionSet,
): NpcV2VersionSet {
  return NpcV2VersionSetSchema.parse({
    datasetVersionIds: versionSet.datasetVersionIds,
    probabilityEngineVersion: PROBABILITY_ENGINE_VERSION,
    templateVersion: LONDON_NPC_TEMPLATE_VERSION,
    textModel: null,
    imageModel: null,
  });
}

function safeSeed(randomSeed: () => string) {
  return GenerationSeedSchema.parse(randomSeed().replaceAll("-", ""));
}

function safeFailure(error: unknown): ProfileGenerationError {
  if (error instanceof ProfileGenerationError) return error;
  if (
    error instanceof Error &&
    (error.name === "SpatialStatisticsUnavailableError" ||
      error.name === "ActiveStatisticsUnavailableError")
  ) {
    return new ProfileGenerationError(
      "statistics_unavailable",
      "London statistics are temporarily unavailable.",
    );
  }
  if (error instanceof Error && error.name === "CompatibilityExhaustedError") {
    return new ProfileGenerationError(
      "compatibility_exhausted",
      "No compatible fictional profile could be sampled.",
    );
  }
  if (
    error instanceof Error &&
    (error.name === "ProfileNpcCompletionConflict" ||
      error.name === "NeonDbError")
  ) {
    return new ProfileGenerationError(
      "persistence_failed",
      "NPC generation could not be saved.",
    );
  }
  if (
    error instanceof Error &&
    /distribution|category|weight/i.test(error.message)
  ) {
    return new ProfileGenerationError(
      "invalid_distribution",
      "The active statistics could not produce a valid profile.",
      false,
    );
  }
  return new ProfileGenerationError(
    "unknown",
    "NPC generation failed. Please try again.",
  );
}

function responseForJob(job: {
  id: string;
  status: string;
  stage: string;
  resultNpcId: string | null;
  failure: unknown;
}) {
  const failure =
    job.failure && typeof job.failure === "object"
      ? (() => {
          const candidate = job.failure as {
            code?: string;
            retryable?: boolean;
          };
          const code = [
            "provider_timeout",
            "invalid_output",
            "portrait_failed",
            "budget_exceeded",
            "statistics_unavailable",
            "invalid_distribution",
            "compatibility_exhausted",
            "authentication_required",
            "persistence_failed",
            "unknown",
          ].includes(candidate.code ?? "")
            ? candidate.code
            : "unknown";
          return {
            code,
            message: "NPC generation failed. Please try again.",
            retryable: candidate.retryable === true,
          };
        })()
      : null;
  return {
    jobId: job.id,
    status: job.status,
    stage: job.stage,
    npcId: job.resultNpcId,
    failure,
  };
}

export async function generateProfileNpc(
  input: ProfileGenerationInput,
  dependencies: ProfileGenerationDependencies = {},
) {
  const ownerId = input.ownerId;
  const coordinates = CoordinatesSchema.parse(input.coordinates);
  const idempotencyKey = GenerationIdempotencyKeySchema.parse(
    input.idempotencyKey,
  );
  const database = dependencies.database ?? createDatabase();
  const resolveGeography =
    dependencies.resolveGeography ?? resolveLondonGeography;
  const randomSeed = dependencies.randomSeed ?? (() => randomUUID());

  const existingJob = await getGenerationJobForOwnerByIdempotency(
    database,
    ownerId,
    idempotencyKey,
  );
  if (existingJob) {
    if (existingJob.status === "completed" && existingJob.resultNpcId) {
      const npc = await getProfileNpcForOwner(
        database,
        ownerId,
        existingJob.resultNpcId,
      );
      if (!npc) {
        throw new ProfileGenerationError(
          "persistence_failed",
          "The completed NPC could not be reloaded.",
        );
      }
      return {
        ...responseForJob(existingJob),
        status: "completed" as const,
        npc: serializeProfileNpc(npc),
      };
    }
    return responseForJob(existingJob);
  }

  const geographyResult = await resolveGeography(database, coordinates);
  if (!geographyResult.supported) {
    throw new ProfileGenerationError(
      "unsupported_location",
      "This coordinate is outside the supported Greater London area.",
      false,
    );
  }

  const location = await saveLocation(database, {
    coordinates,
    geography: {
      lsoaCode: geographyResult.geography.lsoa.code,
      wardCode: geographyResult.geography.ward?.code ?? null,
      boroughCode: geographyResult.geography.borough.code,
      fallbackLevel: "lsoa",
    },
  });

  let activeVersionSet: ActiveStatisticalVersionSet;
  try {
    activeVersionSet = await resolveActiveVersionSet(database);
  } catch (error) {
    throw safeFailure(error);
  }
  const versionSet = makeVersionSet(activeVersionSet);
  const created = await createOrReuseGenerationJobWithStatus(database, {
    ownerId,
    locationId: location.id,
    idempotencyKey,
    seed: safeSeed(randomSeed),
    mode: "profile_only",
    versionSet,
    estimatedCostUsd: 0,
  });
  const job = created.job;

  if (!created.created) {
    if (job.status === "completed" && job.resultNpcId) {
      const npc = await getProfileNpcForOwner(
        database,
        ownerId,
        job.resultNpcId,
      );
      if (npc) {
        return {
          ...responseForJob(job),
          status: "completed" as const,
          npc: serializeProfileNpc(npc),
        };
      }
      throw new ProfileGenerationError(
        "persistence_failed",
        "The completed NPC could not be reloaded.",
      );
    }
    return responseForJob(job);
  }

  const running = await markGenerationJobRunning(database, ownerId, job.id);
  if (!running) return responseForJob(job);

  try {
    const rows = await loadSpatialStatisticCandidates(database, {
      geography: {
        lsoaCode: geographyResult.geography.lsoa.code,
        wardCode: geographyResult.geography.ward?.code ?? null,
        boroughCode: geographyResult.geography.borough.code,
        fallbackLevel: "lsoa",
      },
      versionSet: activeVersionSet,
    });
    const bundle = buildProbabilityBundle({
      geography: {
        lsoaCode: geographyResult.geography.lsoa.code,
        wardCode: geographyResult.geography.ward?.code ?? null,
        boroughCode: geographyResult.geography.borough.code,
        fallbackLevel: "lsoa",
      },
      versionSet: activeVersionSet,
      rows,
    });
    const sampled = sampleLondonNpc({ seed: running.seed, bundle });
    const completion = await completeProfileNpcAtomically(database, {
      jobId: running.id,
      ownerId,
      locationId: location.id,
      seed: running.seed,
      canonicalProfile: sampled.canonicalProfile,
      currentState: sampled.currentState,
      versionSet,
      fieldProvenance: sampled.fieldProvenance,
      narrative: sampled.narrative,
    });
    const npc = await getProfileNpcForOwner(
      database,
      ownerId,
      completion.npcId,
    );
    if (!npc)
      throw new ProfileGenerationError(
        "persistence_failed",
        "NPC could not be reloaded after generation.",
      );
    return {
      jobId: completion.jobId,
      status: "completed" as const,
      stage: "completed" as const,
      npcId: completion.npcId,
      failure: null,
      npc: serializeProfileNpc(npc),
    };
  } catch (error) {
    const failure = safeFailure(error);
    const failed = await markGenerationJobFailed(
      database,
      ownerId,
      running.id,
      {
        code:
          failure.code === "unsupported_location"
            ? "statistics_unavailable"
            : failure.code,
        message: failure.message,
        retryable: failure.retryable,
      },
    );
    if (!failed)
      throw new ProfileGenerationError(
        "persistence_failed",
        "Generation status could not be saved.",
      );
    return responseForJob(failed);
  }
}
