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

  console.info(
    JSON.stringify(
      {
        status: "ok",
        jobId: completed.jobId,
        npcId: completed.npcId,
        conversationId: completed.conversationId,
        memoryVersion: encounter.memory.version,
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
