import { z } from "zod";

import { AgentReplySchema } from "@/lib/agent/contracts";

export const DialogueMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(4_000),
  })
  .strict();

export const ChatRequestSchema = z
  .object({
    messages: z.array(DialogueMessageSchema).min(1).max(40),
  })
  .strict()
  .superRefine(({ messages }, context) => {
    if (messages.at(-1)?.role !== "user") {
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message: "The final message must be from the user.",
      });
    }

    const totalCharacters = messages.reduce(
      (total, message) => total + message.content.length,
      0,
    );
    if (totalCharacters > 40_000) {
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message: "The conversation is too long.",
      });
    }
  });

export const DialogueUsageSchema = z
  .object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    costUsd: z.number().finite().nonnegative().nullable(),
  })
  .strict();

export const ChatResponseSchema = z
  .object({
    reply: AgentReplySchema,
    metadata: z
      .object({
        provider: z.string().trim().min(1).max(80),
        model: z.string().trim().min(1).max(160),
        usage: DialogueUsageSchema,
      })
      .strict(),
  })
  .strict();

export const DialogueHistoryTurnSchema = z.discriminatedUnion("role", [
  z
    .object({
      id: z.string().uuid(),
      role: z.literal("user"),
      content: z.string().trim().min(1).max(4_000),
    })
    .strict(),
  z
    .object({
      id: z.string().uuid(),
      role: z.literal("assistant"),
      content: z.string().trim().min(1).max(2_000),
      action: z.string().trim().min(1).max(1_000),
      emotion: z
        .string()
        .regex(/^[a-z]+(?:_[a-z]+)*$/)
        .max(80),
    })
    .strict(),
]);

export const DialogueHistoryResponseSchema = z
  .object({
    messages: z.array(DialogueHistoryTurnSchema).max(40),
  })
  .strict();

export type DialogueMessage = z.infer<typeof DialogueMessageSchema>;
export type DialogueUsage = z.infer<typeof DialogueUsageSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
export type DialogueHistoryTurn = z.infer<typeof DialogueHistoryTurnSchema>;
export type DialogueHistoryResponse = z.infer<
  typeof DialogueHistoryResponseSchema
>;
