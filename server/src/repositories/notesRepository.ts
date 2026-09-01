import { db } from '../db/index.js'
import { notes } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'

/**
 * Loads a note only when it belongs to the given user.
 * Returns undefined when the note does not exist or is owned by someone else.
 */
export async function findNoteByIdForUser(userId: string, noteId: string) {
  const [singleNote] = await db.select()
  .from(notes)
  .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))

  return singleNote
}
