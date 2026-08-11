import { describe, expect, it } from "vitest";

import { validCanonicalProfile } from "../../../tests/fixtures/domain";
import { CanonicalNpcProfileSchema } from "./contracts";

describe("CanonicalNpcProfileSchema", () => {
  it("accepts a complete canonical NPC profile", () => {
    expect(CanonicalNpcProfileSchema.parse(validCanonicalProfile)).toEqual(
      validCanonicalProfile,
    );
  });

  it("rejects an age that conflicts with its age band", () => {
    const result = CanonicalNpcProfileSchema.safeParse({
      ...validCanonicalProfile,
      identity: { ...validCanonicalProfile.identity, age: 52 },
    });

    expect(result.success).toBe(false);
  });

  it("requires visible appearance facts to remain structured", () => {
    const result = CanonicalNpcProfileSchema.safeParse({
      ...validCanonicalProfile,
      appearance: { ...validCanonicalProfile.appearance, clothing: [] },
    });

    expect(result.success).toBe(false);
  });
});
