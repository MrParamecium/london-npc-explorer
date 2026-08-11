import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ExplorerShell } from "./explorer-shell";

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
    render(<ExplorerShell providerMode="mock" />);

    await user.clear(screen.getByLabelText("Latitude"));
    await user.type(screen.getByLabelText("Latitude"), "40.7128");
    await user.clear(screen.getByLabelText("Longitude"));
    await user.type(screen.getByLabelText("Longitude"), "-74.0060");
    await user.click(screen.getByRole("button", { name: "Locate" }));

    expect(
      screen.getByText("This version supports Greater London coordinates."),
    ).toBeInTheDocument();
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
});
