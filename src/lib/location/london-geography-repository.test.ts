import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveLondonGeography } from "./london-geography-repository";

describe("resolveLondonGeography", () => {
  it("returns official labels and provenance from one point lookup", async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          london_code: "E12000007",
          lsoa_code: "E01004736",
          lsoa_name: "Westminster 018A",
          lsoa_version: "LSOA December 2021 BGC V5",
          ward_code: "E05013806",
          ward_name: "West End",
          ward_version: "Wards May 2026 BGC",
          borough_code: "E09000033",
          borough_name: "Westminster",
          borough_version: "LAD May 2025 BGC V2",
        },
      ],
    });

    await expect(
      resolveLondonGeography({ execute } as never, {
        latitude: 51.5119,
        longitude: -0.123,
      }),
    ).resolves.toEqual({
      supported: true,
      geography: {
        lsoa: {
          code: "E01004736",
          name: "Westminster 018A",
          version: "LSOA December 2021 BGC V5",
        },
        ward: {
          code: "E05013806",
          name: "West End",
          version: "Wards May 2026 BGC",
        },
        borough: {
          code: "E09000033",
          name: "Westminster",
          version: "LAD May 2025 BGC V2",
        },
      },
      datasets: [
        "LSOA December 2021 BGC V5",
        "Wards May 2026 BGC",
        "LAD May 2025 BGC V2",
      ],
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("returns unsupported without inventing geography", async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          london_code: null,
          lsoa_code: null,
          lsoa_name: null,
          lsoa_version: "LSOA December 2021 BGC V5",
          ward_code: null,
          ward_name: null,
          ward_version: "Wards May 2026 BGC",
          borough_code: null,
          borough_name: null,
          borough_version: "LAD May 2025 BGC V2",
        },
      ],
    });

    await expect(
      resolveLondonGeography({ execute } as never, {
        latitude: 53.4808,
        longitude: -2.2426,
      }),
    ).resolves.toEqual({
      supported: false,
      geography: null,
      datasets: [
        "LSOA December 2021 BGC V5",
        "Wards May 2026 BGC",
        "LAD May 2025 BGC V2",
      ],
    });
  });

  it("keeps ward nullable when the active layer has a coverage gap", async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          london_code: "E12000007",
          lsoa_code: "E01000001",
          lsoa_name: "City of London 001A",
          lsoa_version: "LSOA December 2021 BGC V5",
          ward_code: null,
          ward_name: null,
          ward_version: "Wards May 2026 BGC",
          borough_code: "E09000001",
          borough_name: "City of London",
          borough_version: "LAD May 2025 BGC V2",
        },
      ],
    });

    const result = await resolveLondonGeography({ execute } as never, {
      latitude: 51.5155,
      longitude: -0.0922,
    });

    expect(result.supported).toBe(true);
    if (result.supported) {
      expect(result.geography.ward).toBeNull();
    }
  });

  it("rejects a London result without required LSOA or borough coverage", async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          london_code: "E12000007",
          lsoa_code: null,
          lsoa_name: null,
          lsoa_version: "LSOA December 2021 BGC V5",
          ward_code: "E05000001",
          ward_name: "Fixture Ward",
          ward_version: "Wards May 2026 BGC",
          borough_code: null,
          borough_name: null,
          borough_version: "LAD May 2025 BGC V2",
        },
      ],
    });

    await expect(
      resolveLondonGeography({ execute } as never, {
        latitude: 51.5155,
        longitude: -0.0922,
      }),
    ).rejects.toThrow("Official London boundary coverage is incomplete");
  });
});
