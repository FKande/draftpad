import express from 'express'
import { z } from 'zod'
import {
  createNote,
  getNotes,
  updateNote,
  deleteNote,
  getNoteById,
} from '../services/notesService.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { validateUuidParam } from '../middleware/validateUuidParam.js'
import { createUploadUrl, confirmAttachmentUpload, listAttachments, deleteAttachment, getAttachmentDownloadUrl } from '../services/attachmentsService.js'

const router = express.Router()

const noteSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
})

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
})

const uploadUrlSchema = z.object({
  fileName: z.string(),
  mimeType: z.string(),
})

const confirmAttachmentSchema = z.object({
  s3Key: z.string(),
  fileName: z.string(),
})

router.post('/', requireAuth, async (req, res) => {
  const result = noteSchema.safeParse(req.body)

  if (!result.success) {
    return res.status(400).json({ error: result.error })
  }

  const title = result.data.title
  const content = result.data.content

  const createdNote = await createNote(req.user!.id, title, content)
  return res.status(201).json(createdNote)
})

router.get('/', requireAuth, async (req, res) => {
  const userNotesArray = await getNotes(req.user!.id)
  return res.status(200).json(userNotesArray)
})

router.patch('/:id', requireAuth, validateUuidParam('id'), async (req, res) => {
  const result = updateSchema.safeParse(req.body)

  if (!result.success) {
    return res.status(400).json({ error: result.error })
  }

  const title = result.data.title
  const content = result.data.content
  const noteId = req.params.id as string
  const userId = req.user!.id

  const updated = await updateNote(userId, noteId, title, content)
  if (!updated) {
    return res.status(404).json({ error: 'Note does not exist' })
  }
  return res.status(200).json(updated)
})

router.delete('/:id', requireAuth, validateUuidParam('id'), async (req, res) => {
  const noteId = req.params.id as string
  const userId = req.user!.id

  const deleted = await deleteNote(userId, noteId)

  if (!deleted) {
    return res.status(404).json({ error: 'Note does not exist' })
  }

  return res.status(204).end()
})

router.get('/:id', requireAuth, validateUuidParam('id'), async (req, res) => {
  const noteId = req.params.id as string
  const userId = req.user!.id

  const note = await getNoteById(userId, noteId)

  if (!note) {
    return res.status(404).json({ error: 'Note does not exist' })
  }

  return res.status(200).json(note)
})

router.post('/:id/attachments/upload-url', requireAuth, validateUuidParam('id'), async (req, res) => {
  const result = uploadUrlSchema.safeParse(req.body)

  if (!result.success) {
    return res.status(400).json({ error: result.error })
  }

  const fileName = result.data.fileName
  const mimeType = result.data.mimeType

  const noteId = req.params.id as string
  const userId = req.user!.id

  try {
    const presigned = await createUploadUrl(userId, noteId, fileName, mimeType)
    return res.status(200).json(presigned)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong'
    return res.status(404).json({ error: message })
  }

})

router.post('/:id/attachments', requireAuth, validateUuidParam('id'), async (req, res) => {
  const result = confirmAttachmentSchema.safeParse(req.body)

  if (!result.success) {
    return res.status(400).json({ error: result.error })
  }

  const s3Key = result.data.s3Key
  const fileName = result.data.fileName

  const noteId = req.params.id as string
  const userId = req.user!.id

  try {
    const attachment = await confirmAttachmentUpload(userId, noteId, s3Key, fileName)
    return res.status(201).json(attachment)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong'
    return res.status(404).json({ error: message })
  }

})

router.get('/:id/attachments', requireAuth, validateUuidParam('id'), async (req, res) => {

  const noteId = req.params.id as string
  const userId = req.user!.id

  try {
    const attachments = await listAttachments(userId, noteId)
    return res.status(200).json(attachments)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong'
    return res.status(404).json({ error: message })
  }


})

router.delete('/:id/attachments/:attachmentId', requireAuth, validateUuidParam('id'), validateUuidParam('attachmentId'), async (req, res) => {
  const noteId = req.params.id as string
  const userId = req.user!.id
  const attachmentId = req.params.attachmentId as string

  try {
    await deleteAttachment(userId, noteId, attachmentId)
    return res.status(204).end()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong'

    if (message === 'Note does not exist' || message === 'Attachment does not exist') {
      return res.status(404).json({ error: message })
    }

    return res.status(500).json({ error: 'Something went wrong' })
  }

})


router.get('/:id/attachments/:attachmentId/download-url', requireAuth, validateUuidParam('id'), validateUuidParam('attachmentId'), async (req, res) => {
  const noteId = req.params.id as string
  const userId = req.user!.id
  const attachmentId = req.params.attachmentId as string

  try {
    const downloadUrl = await getAttachmentDownloadUrl(userId, noteId, attachmentId)
    return res.status(200).json({ url: downloadUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong'

    if (message === 'Note does not exist' || message === 'Attachment does not exist') {
      return res.status(404).json({ error: message })
    }

    return res.status(500).json({ error: 'Something went wrong' })
  }



})



export default router
