import { describe, expect, it } from "vitest";

import {
  buildTemplateProfileFields,
  pickFictionalName,
  pickOccupation,
} from "./template-library";

describe("London NPC template library", () => {
  it("is deterministic and independent of statistical identity", () => {
    expect(pickFictionalName("seed-00000001")).toBe(
      pickFictionalName("seed-00000001"),
    );
    expect(buildTemplateProfileFields("seed-00000001")).toEqual(
      buildTemplateProfileFields("seed-00000001"),
    );
  });

  it("maps an official major group to a concrete fictional occupation", () => {
    expect(pickOccupation("seed-00000001", "soc2_professional").code).toMatch(
      /^SOC-2/,
    );
  });
});
