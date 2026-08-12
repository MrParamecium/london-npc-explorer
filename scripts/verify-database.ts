import { randomUUID } from "node:crypto";

import { createDatabase } from "../src/lib/db/client";
import {
  completeEncounterAtomically,
  getEncounterForOwner,
} from "../src/lib/db/queries/encounters";
import {
  createOrReuseGenerationJob,
  markGenerationJobRunning,
} from "../src/lib/db/queries/generation-jobs";
import { saveLocation } from "../src/lib/db/queries/locations";
import { ensureAppUser } from "../src/lib/db/queries/users";
import { datasetVersions } from "../src/lib/db/schema";
import { CompleteEncounterInputSchema } from "../src/lib/generation/encounter-contracts";
import { resolveLondonGeography } from "../src/lib/location/london-geography-repository";
import {
  ids,
  validCanonicalProfile,
  validCurrentState,
  validMemory,
  validVersionSet,
} from "../tests/fixtures/domain";

async function verifyDatabase() {
  const database = createDatabase();
  const runId = randomUUID();
  const ownerId = `user_dbCheckpoint_${runId.replaceAll("-", "")}`;

  await ensureAppUser(database, ownerId);
  await database
    .insert(datasetVersions)
    .values({
      id: ids.dataset,
      source: "checkpoint-fixture",
      releaseLabel: "2026-08-11",
      transformVersion: "fixture-v1",
      state: "active",
      importedAt: new Date(),
      metadata: { purpose: "Loop 1 database verification" },
    })
    .onConflictDoNothing({ target: datasetVersions.id });

  const location = await saveLocation(database, {
    coordinates: { latitude: 51.5202, longitude: -0.0979 },
    geography: {
      lsoaCode: "E01000001",
      wardCode: "E05000001",
      boroughCode: "E09000001",
      fallbackLevel: "lsoa",
    },
    googlePlaceId: null,
    panoramaId: null,
  });

  const job = await createOrReuseGenerationJob(database, {
    ownerId,
    locationId: location.id,
    idempotencyKey: `checkpoint:${runId}`,
    seed: runId,
    estimatedCostUsd: 0,
  });

  const runningJob = await markGenerationJobRunning(database, ownerId, job.id);
  if (!runningJob) {
    throw new Error("The checkpoint job could not enter the running state.");
  }

  const completed = await completeEncounterAtomically(
    database,
    CompleteEncounterInputSchema.parse({
      jobId: job.id,
      ownerId,
      locationId: location.id,
      seed: runId,
      canonicalProfile: validCanonicalProfile,
      currentState: validCurrentState,
      versionSet: validVersionSet,
      narrative:
        "Amara is preparing to meet a school group near the museum entrance.",
      portraitUrl: "https://example.com/checkpoint/am-okafor.webp",
      initialMemory: validMemory,
    }),
  );

  const encounter = await getEncounterForOwner(
    database,
    ownerId,
    completed.npcId,
  );
  if (!encounter || encounter.conversation.id !== completed.conversationId) {
    throw new Error("The linked encounter could not be read back.");
  }

  const londonFixtures = [
    ["Westminster", 51.5119, -0.123],
    ["Camden", 51.5416, -0.1433],
    ["Croydon", 51.3724, -0.0983],
    ["City of London", 51.5155, -0.0922],
  ] as const;
  const resolvedFixtures = [];
  for (const [expectedBorough, latitude, longitude] of londonFixtures) {
    const result = await resolveLondonGeography(database, {
      latitude,
      longitude,
    });
    if (
      !result.supported ||
      result.geography.borough.name !== expectedBorough
    ) {
      throw new Error(
        `London geography fixture failed for ${expectedBorough}.`,
      );
    }
    resolvedFixtures.push({
      borough: result.geography.borough.name,
      lsoa: result.geography.lsoa.code,
      ward: result.geography.ward?.code ?? null,
    });
  }

  const outsideLondon = await resolveLondonGeography(database, {
    latitude: 53.4808,
    longitude: -2.2426,
  });
  if (outsideLondon.supported) {
    throw new Error("The outside-London geography fixture was accepted.");
  }

  console.info(
    JSON.stringify(
      {
        status: "ok",
        jobId: completed.jobId,
        npcId: completed.npcId,
        conversationId: completed.conversationId,
        memoryVersion: encounter.memory.version,
        geographyFixtures: resolvedFixtures,
        outsideLondonRejected: true,
      },
      null,
      2,
    ),
  );
}

verifyDatabase().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
