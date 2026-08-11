import { z } from "zod";

export const EntityIdSchema = z.string().uuid();
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const ClerkUserIdSchema = z.string().regex(/^user_[A-Za-z0-9_-]{8,}$/);

export type EntityId = z.infer<typeof EntityIdSchema>;
