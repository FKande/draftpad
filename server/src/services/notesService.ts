import { db } from '../db/index.js'
import { notes } from '../db/schema.js'
import { findNoteByIdForUser } from '../repositories/notesRepository.js'
import { eq, and, sql, desc } from 'drizzle-orm'
import { deleteAttachmentsForNote } from './attachmentsService.js'

export async function createNote(userId: string, title?: string, content?: string) {
  const [note] = await db
    .insert(notes)
    .values({ userId, title, content })
    .returning()
  return note
}

export async function getNotes(userId: string) {
  const userNotesArray = await db
    .select()
    .from(notes)
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt))
  return userNotesArray
}

export async function updateNote(userId: string, noteId: string, title?: string, content?: string) {

  const [updatedNote] =  await db.update(notes)
    .set({ title, content, updatedAt: sql`now()` })
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .returning()

  return updatedNote
}

export async function deleteNote(userId: string, noteId: string) {

  const note = await findNoteByIdForUser(userId, noteId)

  if (!note) {
    return undefined
  }

  await deleteAttachmentsForNote(noteId)

  const [deletedNote] = await db.delete(notes)
  .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
  .returning()

  return deletedNote
}

export async function getNoteById(userId: string, noteId: string) {
  return findNoteByIdForUser(userId, noteId)
}
