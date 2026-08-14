import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { validResolvedLocation } from "../../../tests/fixtures/domain";
import { ExplorerShell } from "./explorer-shell";

const fixtureNpc = {
  npcId: "44444444-4444-4444-8444-444444444444",
  locationId: "11111111-1111-4111-8111-111111111111",
  seed: "fixture-npc-seed-001",
  canonicalProfile: {
    schemaVersion: 2,
    identity: {
      fictionalName: "Rowan Ellis",
      age: 72,
      ageBand: "65-plus",
      pronouns: "they/them",
      statisticalSex: "female",
      ethnicGroup: "White",
    },
    household: {
      householdType: "one_person",
      housingTenure: "owner_occupied",
    },
    work: {
      branch: "retired",
      economicActivity: "retired",
      occupationCode: null,
      occupationTitle: null,
      employerType: null,
      workPattern: null,
      annualIncomeBand: null,
    },
    dailyLife: {
      education: "higher_education",
      commute: "not_applicable",
      routine:
        "Walks to the library after breakfast and checks the local noticeboard.",
    },
    appearance: {
      presentation:
        "Comfortable layers, practical shoes, and a weatherproof coat.",
      clothing: ["navy raincoat"],
      possessions: ["canvas shopping bag"],
      portraitDescriptor:
        "Natural documentary portrait in soft London daylight.",
    },
    character: {
      personalHistory: "Has lived in the borough for more than three decades.",
      values: ["independence"],
      speechStyle: "Measured and observant.",
      boundaries: ["does not share private medical details"],
    },
  },
  currentState: {
    currentTask: "Checking the local noticeboard before the library opens.",
    reasonForLocation: "Walking to the library after breakfast.",
    mood: "calm",
    energy: "medium",
    shortTermGoal: "Borrow a history book.",
    relationshipState: "Has not met the user before.",
    recentActions: ["Checked the bus arrival time"],
  },
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
    "Rowan is taking a quiet morning walk through the neighbourhood before visiting the library.",
  portraitUrl:
    "https://store.public.blob.vercel-storage.com/npc-portraits/explorer-shell.png",
  visibleAt: "2026-08-13T00:00:00.000Z",
  createdAt: "2026-08-13T00:00:00.000Z",
} as const;

const dialogueResponse = {
  reply: {
    speech: "Only a minute. The library opens shortly.",
    action: "Rowan folds the local notice back into their canvas bag.",
    emotion: "quietly_amused",
    memory_update: null,
  },
  metadata: {
    provider: "openrouter",
    model: "openai/gpt-4.1-mini",
    usage: {
      promptTokens: 300,
      completionTokens: 42,
      totalTokens: 342,
      costUsd: 0.0001,
    },
  },
};

function npcResponse(status = 200) {
  return jsonResponse(
    {
      jobId: "33333333-3333-4333-8333-333333333333",
      status: "completed",
      stage: "completed",
      npcId: fixtureNpc.npcId,
      failure: null,
      npc: fixtureNpc,
    },
    status,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ExplorerShell", () => {
  it("renders the London coordinate workbench", () => {
    render(<ExplorerShell providerMode="mock" />);

    expect(
      screen.getByRole("heading", { name: "London NPC Atlas" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Latitude")).toHaveValue("51.5202");
    expect(screen.getByLabelText("Longitude")).toHaveValue("-0.0979");
    expect(screen.getByRole("button", { name: "Generate NPC" })).toBeEnabled();
  });

  it("switches between map and Street View modes", async () => {
    const user = userEvent.setup();
    render(<ExplorerShell providerMode="mock" />);

    const mapButton = screen.getByRole("button", { name: "Map" });
    const streetButton = screen.getByRole("button", { name: "Street" });
    expect(mapButton).toHaveAttribute("aria-pressed", "true");
    expect(streetButton).toHaveAttribute("aria-pressed", "false");

    await user.click(streetButton);

    expect(streetButton).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("Street View is unavailable in mock mode"),
    ).toBeInTheDocument();

    await user.click(mapButton);

    expect(mapButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/Clickable map preview/)).toBeInTheDocument();
  });

  it("rejects a coordinate outside Greater London", async () => {
    const user = userEvent.setup();
    const unsupported = {
      coordinates: { latitude: 40.7128, longitude: -74.006 },
      supported: false,
      geography: null,
      address: null,
      nearbyPlaces: [],
      provenance: {
        geographyDatasets: ["LAD May 2025 BGC V2"],
        googleResolvedAt: null,
      },
    };
    const locationFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(unsupported));
    render(<ExplorerShell providerMode="mock" locationFetch={locationFetch} />);

    await user.clear(screen.getByLabelText("Latitude"));
    await user.type(screen.getByLabelText("Latitude"), "40.7128");
    await user.clear(screen.getByLabelText("Longitude"));
    await user.type(screen.getByLabelText("Longitude"), "-74.0060");
    await user.click(screen.getByRole("button", { name: "Locate" }));

    expect(
      await screen.findAllByRole("heading", {
        name: "Outside Greater London",
      }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Outside V1 coverage" }),
    ).toBeDisabled();
  });

  it("shows official geography and nearby places after locating", async () => {
    const user = userEvent.setup();
    const locationFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(validResolvedLocation));
    render(<ExplorerShell providerMode="mock" locationFetch={locationFetch} />);

    await user.click(screen.getByRole("button", { name: "Locate" }));

    expect(
      await screen.findAllByRole("heading", { name: "Barbican" }),
    ).toHaveLength(2);
    expect(screen.getByText("City of London 001A")).toBeInTheDocument();
    expect(screen.getByText("Aldersgate")).toBeInTheDocument();
    expect(screen.getByText("Barbican Centre")).toBeInTheDocument();
    expect(locationFetch).toHaveBeenCalledTimes(1);
  });

  it("reveals a complete mock NPC after generation", async () => {
    const user = userEvent.setup();
    let resolveNpcResponse: ((response: Response) => void) | undefined;
    const npcFetch = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveNpcResponse = resolve;
        }),
    );
    const dialogueFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(dialogueResponse));
    render(
      <ExplorerShell
        providerMode="mock"
        npcFetch={npcFetch}
        dialogueFetch={dialogueFetch}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Generate NPC" }));
    expect(
      screen.getByRole("button", { name: "Building profile" }),
    ).toBeDisabled();
    resolveNpcResponse?.(npcResponse());

    expect(
      await screen.findByRole("heading", { name: "Rowan Ellis" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fictional local sample")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Talk with Rowan" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Message Rowan Ellis")).toBeInTheDocument();
    expect(
      screen.queryByText("Dialogue connects in the next loop"),
    ).not.toBeInTheDocument();
    expect(npcFetch).toHaveBeenCalledWith(
      "/api/npcs/generate",
      expect.objectContaining({ method: "POST" }),
    );

    await user.type(
      screen.getByLabelText("Message Rowan Ellis"),
      "Are you waiting long?",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(dialogueFetch).toHaveBeenCalledWith(
      `/api/chat/${fixtureNpc.npcId}`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("requests authentication without starting generation", async () => {
    const user = userEvent.setup();
    const requestGenerationSignIn = vi.fn();

    render(
      <ExplorerShell
        providerMode="mock"
        npcFetch={vi.fn<typeof fetch>()}
        authentication={{
          status: "signed_out",
          error: null,
          requestGenerationSignIn,
          requestAccountSignIn: vi.fn(),
          accountControl: <button type="button">Sign in</button>,
          resumeRequest: null,
          clearResumeRequest: vi.fn(),
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Generate NPC" }));

    expect(requestGenerationSignIn).toHaveBeenCalledWith({
      latitude: 51.5202,
      longitude: -0.0979,
    });
    expect(
      screen.queryByRole("button", { name: "Building profile" }),
    ).not.toBeInTheDocument();
  });

  it("offers a fresh manual retry after portrait generation fails", async () => {
    const user = userEvent.setup();
    const npcFetch = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "portrait_failed",
            message: "Portrait generation failed.",
            retryable: true,
          },
        },
        503,
      ),
    );
    render(<ExplorerShell providerMode="mock" npcFetch={npcFetch} />);

    await user.click(screen.getByRole("button", { name: "Generate NPC" }));
    await user.click(
      await screen.findByRole("button", { name: "Generate again" }),
    );

    expect(npcFetch).toHaveBeenCalledTimes(2);
  });

  it("restores the exact coordinate and generates once after sign-in", async () => {
    const clearResumeRequest = vi.fn();

    render(
      <ExplorerShell
        providerMode="mock"
        npcFetch={vi.fn<typeof fetch>().mockResolvedValue(npcResponse())}
        authentication={{
          status: "ready",
          error: null,
          requestGenerationSignIn: vi.fn(),
          requestAccountSignIn: vi.fn(),
          accountControl: <span>Account</span>,
          resumeRequest: {
            id: "2026-08-12T08:00:00.000Z",
            coordinates: { latitude: 51.5014, longitude: -0.1419 },
          },
          clearResumeRequest,
        }}
      />,
    );

    expect(screen.getByLabelText("Latitude")).toHaveValue("51.5014");
    expect(screen.getByLabelText("Longitude")).toHaveValue("-0.1419");
    expect(
      await screen.findByRole("heading", { name: "Rowan Ellis" }),
    ).toBeInTheDocument();
    expect(clearResumeRequest).toHaveBeenCalledTimes(1);
  });
});
