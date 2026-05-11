import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { featureChatMessages } from "./db/schema";

export type FeatureChatMessageRecord = typeof featureChatMessages.$inferSelect;

/** Return all chat messages for a feature, oldest first. */
export function listChatMessagesForFeature(
  featureId: number,
): FeatureChatMessageRecord[] {
  return db
    .select()
    .from(featureChatMessages)
    .where(eq(featureChatMessages.featureId, featureId))
    .all()
    .sort((a, b) => a.id - b.id);
}

/** Append a single chat message and return the inserted record. */
export function appendChatMessage(
  featureId: number,
  role: "user" | "assistant",
  content: string,
): FeatureChatMessageRecord {
  return db
    .insert(featureChatMessages)
    .values({ featureId, role, content })
    .returning()
    .get();
}

/** Delete all chat messages for a feature. */
export function clearChatMessagesForFeature(featureId: number): void {
  db.delete(featureChatMessages)
    .where(eq(featureChatMessages.featureId, featureId))
    .run();
}
