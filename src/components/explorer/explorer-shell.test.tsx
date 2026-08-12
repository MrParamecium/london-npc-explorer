import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { validResolvedLocation } from "../../../tests/fixtures/domain";
import { ExplorerShell } from "./explorer-shell";

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
    render(<ExplorerShell providerMode="mock" />);

    await user.click(screen.getByRole("button", { name: "Generate NPC" }));
    expect(
      screen.getByRole("button", { name: "Building profile" }),
    ).toBeDisabled();

    expect(
      await screen.findByRole("heading", { name: "Amara Okafor" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Museum programme coordinator")).toHaveLength(2);
  });

  it("requests authentication without starting generation", async () => {
    const user = userEvent.setup();
    const requestGenerationSignIn = vi.fn();

    render(
      <ExplorerShell
        providerMode="mock"
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

  it("restores the exact coordinate and generates once after sign-in", async () => {
    const clearResumeRequest = vi.fn();

    render(
      <ExplorerShell
        providerMode="mock"
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
      await screen.findByRole("heading", { name: "Amara Okafor" }),
    ).toBeInTheDocument();
    expect(clearResumeRequest).toHaveBeenCalledTimes(1);
  });
});
