import type { AgentReply } from "@/lib/agent/contracts";

import type { DialogueMessage, DialogueUsage } from "./contracts";

export type DialogueCompletionInput = {
  systemPrompt: string;
  messages: DialogueMessage[];
};

export type DialogueCompletion = {
  reply: AgentReply;
  provider: string;
  model: string;
  usage: DialogueUsage;
};

export interface DialogueProvider {
  complete(input: DialogueCompletionInput): Promise<DialogueCompletion>;
}

export type DialogueProviderErrorCode =
  "provider_timeout" | "provider_unavailable" | "invalid_response";

const SAFE_PROVIDER_ERROR_MESSAGES: Record<DialogueProviderErrorCode, string> =
  {
    provider_timeout: "The dialogue provider timed out.",
    provider_unavailable: "The dialogue provider is unavailable.",
    invalid_response: "The dialogue provider returned an invalid response.",
  };

export class DialogueProviderError extends Error {
  readonly code: DialogueProviderErrorCode;
  readonly retryable: boolean;

  constructor(code: DialogueProviderErrorCode, retryable = true) {
    super(SAFE_PROVIDER_ERROR_MESSAGES[code]);
    this.name = "DialogueProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}
