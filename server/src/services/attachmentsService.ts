import { findNoteByIdForUser } from "../repositories/notesRepository.js";
import crypto from 'crypto'
import { getUploadUrl, getObjectMetadata, deleteObject, getDownloadUrl } from "../lib/s3.js";
import { db } from '../db/index.js'
import { attachments } from '../db/schema.js'
import { eq, and } from "drizzle-orm";

export async function createUploadUrl(userId: string, noteId: string, fileName: string, mimeType: string) {
  const note = await findNoteByIdForUser(userId, noteId)

  if (!note) {
    throw new Error('Note does not exist')
  }

  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const uniqueId = crypto.randomUUID()
  const key = `notes/${noteId}/${uniqueId}-${sanitizedName}`

  const presignedURL = await getUploadUrl(key, mimeType)
  return { url: presignedURL, key: key }

}

export async function confirmAttachmentUpload(userId: string, noteId: string, s3Key: string, fileName: string) {
  const note = await findNoteByIdForUser(userId, noteId)

  if (!note) {
    throw new Error('Note does not exist')
  }

  const expectedPrefix = `notes/${noteId}/`
  const hasExpectedPrefix = s3Key.startsWith(expectedPrefix)

  if (!hasExpectedPrefix) {
    throw new Error('Attachment does not belong to this note')
  }

  const metadata = await getObjectMetadata(s3Key)
  const size = metadata.size
  const mimeType = metadata.contentType

  const [attachment] = await db
    .insert(attachments)
    .values({
      noteId,
      fileName,
      s3Key,
      mimeType,
      size
    })
    .returning()

    return attachment

}


export async function listAttachments(userId: string, noteId: string) {
  const note = await findNoteByIdForUser(userId, noteId)

  if (!note) {
    throw new Error('Note does not exist')
  }

  const noteAttachments = await db
    .select()
    .from(attachments)
    .where(eq(attachments.noteId, noteId))

  return noteAttachments

}


export async function getAttachmentById(userId: string, noteId: string, attachmentId: string) {
  const note = await findNoteByIdForUser(userId, noteId)

  if (!note) {
    throw new Error('Note does not exist')
  }

  const attachment = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.noteId, noteId)
      )
    )

  return attachment[0]

}


export async function deleteAttachment(userId: string, noteId: string, attachmentId: string) {

  const attachment = await getAttachmentById(userId, noteId, attachmentId)

  if (!attachment) {
    throw new Error('Attachment does not exist')
  }

  await deleteObject(attachment.s3Key)

  await db
    .delete(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.noteId, noteId)
      )
    )

}


export async function getAttachmentDownloadUrl(userId: string, noteId: string, attachmentId: string) {

  const attachment = await getAttachmentById(userId, noteId, attachmentId)

  if (!attachment) {
    throw new Error('Attachment does not exist')
  }

  return getDownloadUrl(attachment.s3Key)

}


export async function deleteAttachmentsForNote(noteId: string) {

  const noteAttachments = await db
    .select()
    .from(attachments)
    .where(eq(attachments.noteId, noteId))

    await Promise.all(
      noteAttachments.map((attachment) => {
        return deleteObject(attachment.s3Key)
      })
    )

}
