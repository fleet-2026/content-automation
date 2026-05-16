"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-helpers";
import {
  listNotes,
  createNote,
  updateNote,
  deleteNote,
  type NoteSummary,
} from "@/lib/notes";

export async function getNotes(query?: string): Promise<NoteSummary[]> {
  const userId = await requireUser();
  return listNotes(userId, query);
}

export async function newNote(
  input: { title?: string; content?: string; tags?: string[] } = {},
): Promise<NoteSummary> {
  const userId = await requireUser();
  const note = await createNote(userId, {
    title: input.title,
    content: input.content ?? "",
    tags: input.tags,
  });
  revalidatePath("/notes");
  return note as NoteSummary;
}

export async function saveNote(
  id: string,
  input: { title?: string | null; content?: string; tags?: string[]; pinned?: boolean },
): Promise<void> {
  const userId = await requireUser();
  await updateNote(userId, id, input);
  // NOTE: do NOT revalidatePath("/notes") here. This is hit on every
  // debounced keystroke. A revalidate causes Next to refetch RSC payload
  // which overwrites client state with server-trimmed data — that strips
  // mid-typing trailing spaces, gluing the next word onto the previous.
  // Persistence is still happening (DB has the latest state); the client
  // doesn't need a fresh render. revalidate stays on newNote/removeNote
  // which actually change the list structure.
}

export async function removeNote(id: string): Promise<void> {
  const userId = await requireUser();
  await deleteNote(userId, id);
  revalidatePath("/notes");
}
