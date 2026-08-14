import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  validCanonicalProfileV2,
  validCurrentState,
} from "../../../tests/fixtures/domain";

import type { PublicProfileNpc } from "@/lib/generation/public-profile-contracts";

import { NpcHistory } from "./npc-history";

const npc: PublicProfileNpc = {
  npcId: "44444444-4444-4444-8444-444444444444",
  locationId: "11111111-1111-4111-8111-111111111111",
  seed: "fixture-npc-seed-001",
  canonicalProfile: validCanonicalProfileV2,
  currentState: validCurrentState,
  versionSet: {
    datasetVersionIds: ["22222222-2222-4222-8222-222222222222"],
    probabilityEngineVersion: "london-conditional-v1",
    templateVersion: "london-fiction-v1",
    textModel: null,
    imageModel: "openai/gpt-image-2",
  },
  fieldProvenance: {
    "/identity/age": {
      kind: "statistical",
      datasetVersionId: "22222222-2222-4222-8222-222222222222",
      metric: "adult_age_sex",
      geographyLevel: "lsoa",
      geographyCode: "E01000001",
      sourceRelease: "mid-2024",
      transformVersion: "statistics-v1",
    },
  },
  narrative:
    "A fictional London resident is walking towards a scheduled museum programme.",
  portraitUrl:
    "https://store.public.blob.vercel-storage.com/npc-portraits/job.png",
  visibleAt: "2026-08-14T08:00:00.000Z",
  createdAt: "2026-08-14T08:00:00.000Z",
};

describe("NpcHistory", () => {
  it("shows the same portrait and keeps history selection working", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <NpcHistory
        items={[npc]}
        state="ready"
        error={null}
        hasMore={false}
        onSelect={onSelect}
        onLoadMore={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Fictional portrait of Amara Okafor" }),
    ).toHaveAttribute("src", expect.stringContaining("npc-portraits"));
    await user.click(screen.getByRole("button", { name: /Amara Okafor/ }));
    expect(onSelect).toHaveBeenCalledWith(npc.npcId);
  });
});
