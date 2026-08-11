import { z } from "zod";

import { IsoDateTimeSchema } from "@/lib/domain/primitives";

export const AgentReplySchema = z
  .object({
    speech: z.string().trim().min(1).max(2_000),
    action: z.string().trim().min(1).max(1_000),
    emotion: z
      .string()
      .regex(/^[a-z]+(?:_[a-z]+)*$/)
      .max(80),
    memory_update: z.string().trim().min(1).max(1_000).nullable(),
  })
  .strict();

const DurableFactSchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-z]+(?:_[a-z]+)*$/)
      .max(80),
    value: z.string().trim().min(1).max(500),
    learnedAt: IsoDateTimeSchema,
  })
  .strict();

export const NpcMemorySchema = z
  .object({
    version: z.number().int().positive(),
    durableSummary: z.string().trim().min(1).max(4_000),
    facts: z.array(DurableFactSchema).max(100),
  })
  .strict();

export type AgentReply = z.infer<typeof AgentReplySchema>;
export type NpcMemory = z.infer<typeof NpcMemorySchema>;
