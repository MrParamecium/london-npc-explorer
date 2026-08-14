import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ids,
  validCanonicalProfileV2,
  validCurrentState,
  validResolvedLocation,
} from "../../../tests/fixtures/domain";

const mocks = vi.hoisted(() => ({
  saveLocation: vi.fn(),
  getGenerationJobForOwnerByIdempotency: vi.fn(),
  createOrReuseGenerationJobWithStatus: vi.fn(),
  markGenerationJobRunning: vi.fn(),
  markGenerationJobStage: vi.fn(),
  markGenerationJobFailed: vi.fn(),
  completeFullNpcAtomically: vi.fn(),
  getProfileNpcForOwner: vi.fn(),
  serializeProfileNpc: vi.fn((npc: unknown) => npc),
  resolveActiveVersionSet: vi.fn(),
  loadSpatialStatisticCandidates: vi.fn(),
  buildProbabilityBundle: vi.fn(),
  sampleLondonNpc: vi.fn(),
}));

vi.mock("@/lib/location/london-geography-repository", () => ({
  resolveLondonGeography: vi.fn(),
}));
vi.mock("@/lib/db/queries/locations", () => ({
  saveLocation: mocks.saveLocation,
}));
vi.mock("@/lib/db/queries/generation-jobs", () => ({
  createOrReuseGenerationJobWithStatus:
    mocks.createOrReuseGenerationJobWithStatus,
  getGenerationJobForOwnerByIdempotency:
    mocks.getGenerationJobForOwnerByIdempotency,
  markGenerationJobFailed: mocks.markGenerationJobFailed,
  markGenerationJobRunning: mocks.markGenerationJobRunning,
  markGenerationJobStage: mocks.markGenerationJobStage,
}));
vi.mock("@/lib/db/queries/profile-npcs", () => ({
  completeFullNpcAtomically: mocks.completeFullNpcAtomically,
  getProfileNpcForOwner: mocks.getProfileNpcForOwner,
  serializeProfileNpc: mocks.serializeProfileNpc,
}));
vi.mock("@/lib/statistics/active-version-set", () => ({
  resolveActiveVersionSet: mocks.resolveActiveVersionSet,
}));
vi.mock("@/lib/statistics/spatial-statistics-repository", () => ({
  loadSpatialStatisticCandidates: mocks.loadSpatialStatisticCandidates,
}));
vi.mock("@/lib/statistics/build-probability-bundle", () => ({
  buildProbabilityBundle: mocks.buildProbabilityBundle,
}));
vi.mock("@/lib/sampling/london-npc-sampler", () => ({
  PROBABILITY_ENGINE_VERSION: "london-conditional-v1",
  sampleLondonNpc: mocks.sampleLondonNpc,
}));

import {
  generateProfileNpc,
  type ProfileGenerationDependencies,
} from "./profile-generation-service";
import { PortraitGenerationError } from "./portrait-types";

const database = {} as never;
const resolveGeography: NonNullable<
  ProfileGenerationDependencies["resolveGeography"]
> = async () => ({
  supported: true,
  geography: validResolvedLocation.geography,
  datasets: [...validResolvedLocation.provenance.geographyDatasets],
});
const input = {
  ownerId: ids.user,
  coordinates: { latitude: 51.5202, longitude: -0.0979 },
  idempotencyKey: "portrait-service-001",
};

const activeVersionSet = {
  compatibilitySetKey: "london-v1",
  datasetVersionIds: [ids.dataset],
  versions: [
    {
      id: ids.dataset,
      source: "ons",
      releaseLabel: "2025",
      transformVersion: "v1",
      compatibilitySetKey: "london-v1",
      metricIds: ["adult_age_sex"],
    },
  ],
};

const queuedJob = {
  id: ids.job,
  ownerId: ids.user,
  locationId: ids.location,
  idempotencyKey: input.idempotencyKey,
  seed: "seed-00000001",
  mode: "full",
  status: "queued",
  stage: "queued",
  resultNpcId: null,
  failure: null,
};

const runningJob = {
  ...queuedJob,
  status: "running",
  stage: "location",
};

const publicNpc = {
  npcId: ids.npc,
  portraitUrl:
    "https://store.public.blob.vercel-storage.com/npc-portraits/job.png",
};

function createRuntime() {
  return {
    imageModel: "openai/gpt-image-2",
    generate: vi.fn(),
    store: vi.fn(),
    remove: vi.fn(),
  };
}

function setSuccessfulFlow(runtime: ReturnType<typeof createRuntime>) {
  mocks.getGenerationJobForOwnerByIdempotency.mockResolvedValue(null);
  mocks.saveLocation.mockResolvedValue({ id: ids.location });
  mocks.resolveActiveVersionSet.mockResolvedValue(activeVersionSet);
  mocks.loadSpatialStatisticCandidates.mockResolvedValue([]);
  mocks.buildProbabilityBundle.mockReturnValue({});
  mocks.sampleLondonNpc.mockReturnValue({
    canonicalProfile: validCanonicalProfileV2,
    currentState: validCurrentState,
    fieldProvenance: {
      "/identity/age": {
        kind: "statistical",
        datasetVersionId: ids.dataset,
        metric: "adult_age_sex",
        geographyLevel: "lsoa",
        geographyCode: "E01000001",
        sourceRelease: "2025",
        transformVersion: "v1",
      },
    },
    narrative:
      "A fictional London resident is walking towards a scheduled museum programme.",
  });
  mocks.createOrReuseGenerationJobWithStatus.mockResolvedValue({
    job: queuedJob,
    created: true,
  });
  mocks.markGenerationJobRunning.mockResolvedValue(runningJob);
  mocks.markGenerationJobStage.mockResolvedValue(runningJob);
  runtime.generate.mockResolvedValue({
    bytes: new Uint8Array([137, 80, 78, 71]),
    contentType: "image/png",
    extension: "png",
    model: runtime.imageModel,
    costUsd: 0.08,
  });
  runtime.store.mockResolvedValue({
    url: publicNpc.portraitUrl,
    pathname: "npc-portraits/job.png",
  });
  mocks.completeFullNpcAtomically.mockResolvedValue({
    jobId: ids.job,
    npcId: ids.npc,
  });
  mocks.getProfileNpcForOwner.mockResolvedValue(publicNpc);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.serializeProfileNpc.mockImplementation((npc: unknown) => npc);
});

describe("generateProfileNpc portrait orchestration", () => {
  it("generates, stores, and atomically completes one portrait-backed NPC", async () => {
    const events: string[] = [];
    const runtime = createRuntime();
    setSuccessfulFlow(runtime);
    mocks.markGenerationJobStage.mockImplementation(
      async (_db, _owner, _job, stage) => {
        events.push(`stage:${stage}`);
        return runningJob;
      },
    );
    runtime.generate.mockImplementation(async () => {
      events.push("generate");
      return {
        bytes: new Uint8Array([137, 80, 78, 71]),
        contentType: "image/png",
        extension: "png",
        model: runtime.imageModel,
        costUsd: 0.08,
      };
    });
    runtime.store.mockImplementation(async () => {
      events.push("store");
      return { url: publicNpc.portraitUrl, pathname: "npc-portraits/job.png" };
    });
    mocks.completeFullNpcAtomically.mockImplementation(async () => {
      events.push("complete");
      return { jobId: ids.job, npcId: ids.npc };
    });

    const result = await generateProfileNpc(input, {
      database,
      resolveGeography,
      randomSeed: () => "seed-00000001",
      portraitRuntime: runtime,
    });

    expect(events).toEqual([
      "stage:profile",
      "stage:portrait",
      "generate",
      "store",
      "stage:persistence",
      "complete",
    ]);
    expect(runtime.generate).toHaveBeenCalledTimes(1);
    expect(runtime.store).toHaveBeenCalledTimes(1);
    expect(runtime.remove).not.toHaveBeenCalled();
    expect(mocks.createOrReuseGenerationJobWithStatus).toHaveBeenCalledWith(
      database,
      expect.objectContaining({
        mode: "full",
        estimatedCostUsd: 0,
        versionSet: expect.objectContaining({ imageModel: runtime.imageModel }),
      }),
    );
    expect(mocks.completeFullNpcAtomically).toHaveBeenCalledWith(
      database,
      expect.objectContaining({
        portraitUrl: publicNpc.portraitUrl,
        estimatedCostUsd: 0.08,
        versionSet: expect.objectContaining({ imageModel: runtime.imageModel }),
      }),
    );
    expect(result).toMatchObject({
      status: "completed",
      npc: { portraitUrl: expect.stringContaining("vercel-storage.com") },
    });
  });

  it("does not upload or clean up when the provider fails", async () => {
    const runtime = createRuntime();
    setSuccessfulFlow(runtime);
    runtime.generate.mockRejectedValue(
      new PortraitGenerationError(
        "provider_timeout",
        "The portrait provider timed out.",
        true,
      ),
    );
    const failedJob = {
      ...runningJob,
      status: "failed",
      failure: { code: "provider_timeout", retryable: true },
    };
    mocks.markGenerationJobFailed.mockResolvedValue(failedJob);

    const result = await generateProfileNpc(input, {
      database,
      resolveGeography,
      randomSeed: () => "seed-00000001",
      portraitRuntime: runtime,
    });

    expect(runtime.generate).toHaveBeenCalledTimes(1);
    expect(runtime.store).not.toHaveBeenCalled();
    expect(runtime.remove).not.toHaveBeenCalled();
    expect(mocks.markGenerationJobFailed).toHaveBeenCalledWith(
      database,
      ids.user,
      ids.job,
      expect.objectContaining({ code: "provider_timeout", retryable: true }),
    );
    expect(result.status).toBe("failed");
  });

  it("does not spend on a portrait when the pre-call stage is ineligible", async () => {
    const runtime = createRuntime();
    setSuccessfulFlow(runtime);
    mocks.markGenerationJobStage.mockImplementation(
      async (_database, _ownerId, _jobId, stage) =>
        stage === "portrait" ? null : runningJob,
    );
    mocks.markGenerationJobFailed.mockResolvedValue({
      ...runningJob,
      status: "failed",
      failure: { code: "persistence_failed", retryable: true },
    });

    const result = await generateProfileNpc(input, {
      database,
      resolveGeography,
      randomSeed: () => "seed-00000001",
      portraitRuntime: runtime,
    });

    expect(result.status).toBe("failed");
    expect(runtime.generate).not.toHaveBeenCalled();
    expect(runtime.store).not.toHaveBeenCalled();
    expect(runtime.remove).not.toHaveBeenCalled();
  });

  it("removes exactly once when storage succeeded but database completion failed", async () => {
    const runtime = createRuntime();
    setSuccessfulFlow(runtime);
    mocks.completeFullNpcAtomically.mockRejectedValue(new Error("db down"));
    runtime.remove.mockResolvedValue(undefined);
    mocks.markGenerationJobFailed.mockResolvedValue({
      ...runningJob,
      status: "failed",
      failure: { code: "persistence_failed", retryable: true },
    });

    await generateProfileNpc(input, {
      database,
      resolveGeography,
      randomSeed: () => "seed-00000001",
      portraitRuntime: runtime,
    });

    expect(runtime.generate).toHaveBeenCalledTimes(1);
    expect(runtime.store).toHaveBeenCalledTimes(1);
    expect(runtime.remove).toHaveBeenCalledTimes(1);
    expect(runtime.remove).toHaveBeenCalledWith(publicNpc.portraitUrl);
  });

  it("removes exactly once when the persistence stage fails after upload", async () => {
    const runtime = createRuntime();
    setSuccessfulFlow(runtime);
    mocks.markGenerationJobStage.mockImplementation(
      async (_database, _ownerId, _jobId, stage) => {
        if (stage === "persistence") throw new Error("stage write failed");
        return runningJob;
      },
    );
    runtime.remove.mockResolvedValue(undefined);
    mocks.markGenerationJobFailed.mockResolvedValue({
      ...runningJob,
      status: "failed",
      failure: { code: "persistence_failed", retryable: true },
    });

    const result = await generateProfileNpc(input, {
      database,
      resolveGeography,
      randomSeed: () => "seed-00000001",
      portraitRuntime: runtime,
    });

    expect(result.status).toBe("failed");
    expect(runtime.generate).toHaveBeenCalledTimes(1);
    expect(runtime.store).toHaveBeenCalledTimes(1);
    expect(mocks.completeFullNpcAtomically).not.toHaveBeenCalled();
    expect(runtime.remove).toHaveBeenCalledTimes(1);
    expect(runtime.remove).toHaveBeenCalledWith(publicNpc.portraitUrl);
  });

  it.each([
    ["completed", { ...queuedJob, status: "completed", resultNpcId: ids.npc }],
    ["running", runningJob],
    ["failed", { ...queuedJob, status: "failed", failure: {} }],
  ])(
    "reuses an existing %s idempotency job without paid calls",
    async (_label, job) => {
      const runtime = createRuntime();
      mocks.getGenerationJobForOwnerByIdempotency.mockResolvedValue(job);
      mocks.getProfileNpcForOwner.mockResolvedValue(publicNpc);

      const result = await generateProfileNpc(input, {
        database,
        portraitRuntime: runtime,
      });

      expect(result.status).toBe(job.status);
      expect(runtime.generate).not.toHaveBeenCalled();
      expect(runtime.store).not.toHaveBeenCalled();
      expect(runtime.remove).not.toHaveBeenCalled();
    },
  );
});
