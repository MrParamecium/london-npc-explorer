import { describe, expect, it } from "vitest";

import { validLocation } from "../../../tests/fixtures/domain";
import { LocationSnapshotSchema } from "./contracts";

describe("LocationSnapshotSchema", () => {
  it("accepts a policy-safe London location snapshot", () => {
    expect(LocationSnapshotSchema.parse(validLocation)).toEqual(validLocation);
  });

  it("rejects coordinates outside valid latitude bounds", () => {
    const result = LocationSnapshotSchema.safeParse({
      ...validLocation,
      coordinates: { ...validLocation.coordinates, latitude: 91 },
    });

    expect(result.success).toBe(false);
  });

  it("does not accept cached Google display fields", () => {
    const result = LocationSnapshotSchema.safeParse({
      ...validLocation,
      googleDisplayName: "A permanently cached place name",
    });

    expect(result.success).toBe(false);
  });
});
