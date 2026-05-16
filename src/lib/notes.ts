import { prisma } from "@/lib/db";

/**
 * Notes — free-form scratchpad for course links, swipe ideas, references.
 * Sorted with pinned-first then by updatedAt desc.
 */

export type NoteSummary = {
  id: string;
  title: string | null;
  content: string;
  pinned: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
};

export async function listNotes(userId: string, query?: string): Promise<NoteSummary[]> {
  const q = query?.trim();
  return prisma.note.findMany({
    where: {
      userId,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { content: { contains: q, mode: "insensitive" } },
              { tags: { has: q.toLowerCase() } },
            ],
          }
        : {}),
    },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    take: 200,
  });
}

export async function createNote(
  userId: string,
  input: { title?: string; content: string; tags?: string[] },
) {
  return prisma.note.create({
    data: {
      userId,
      title: input.title?.trim() || null,
      content: input.content,
      tags: (input.tags ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean),
    },
  });
}

export async function updateNote(
  userId: string,
  id: string,
  input: { title?: string | null; content?: string; tags?: string[]; pinned?: boolean },
) {
  // Scope by userId to prevent cross-user writes.
  return prisma.note.updateMany({
    where: { id, userId },
    data: {
      ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.tags !== undefined
        ? { tags: input.tags.map((t) => t.toLowerCase().trim()).filter(Boolean) }
        : {}),
      ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
    },
  });
}

export async function deleteNote(userId: string, id: string) {
  return prisma.note.deleteMany({ where: { id, userId } });
}
