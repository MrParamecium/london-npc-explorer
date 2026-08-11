import { describe, expect, it } from "vitest";

import { validAgentReply, validMemory } from "../../../tests/fixtures/domain";
import { AgentReplySchema, NpcMemorySchema } from "./contracts";

describe("AgentReplySchema", () => {
  it("accepts the locked response shape", () => {
    expect(AgentReplySchema.parse(validAgentReply)).toEqual(validAgentReply);
  });

  it("rejects model output with undeclared fields", () => {
    const result = AgentReplySchema.safeParse({
      ...validAgentReply,
      rewritten_profile: { annualIncomeBand: "GBP 90k+" },
    });

    expect(result.success).toBe(false);
  });
});

describe("NpcMemorySchema", () => {
  it("accepts versioned durable memory", () => {
    expect(NpcMemorySchema.parse(validMemory)).toEqual(validMemory);
  });

  it("rejects an empty durable fact", () => {
    const result = NpcMemorySchema.safeParse({
      ...validMemory,
      facts: [{ ...validMemory.facts[0], value: "" }],
    });

    expect(result.success).toBe(false);
  });
});
