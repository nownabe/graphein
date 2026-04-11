import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { members } from "../db/schema";

export async function findOrCreateMember(data: {
  slackUserId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  const existing = await db.query.members.findFirst({
    where: eq(members.slackUserId, data.slackUserId),
  });

  if (existing) {
    const [updated] = await db
      .update(members)
      .set({
        email: data.email,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(members.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(members).values(data).returning();
  return created;
}

export async function findMemberById(id: string) {
  return db.query.members.findFirst({
    where: eq(members.id, id),
  });
}

export async function findMemberBySlackUserId(slackUserId: string) {
  return db.query.members.findFirst({
    where: eq(members.slackUserId, slackUserId),
  });
}

export async function findMembersBySlackUserIds(slackUserIds: string[]) {
  if (slackUserIds.length === 0) return [];
  return db.query.members.findMany({
    where: inArray(members.slackUserId, slackUserIds),
  });
}
