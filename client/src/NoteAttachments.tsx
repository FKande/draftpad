import { useEffect, useId, useRef, useState } from 'react'
import type { Attachment } from './api'
import { deleteAttachment, getAttachmentDownloadUrl, getAttachments, uploadAttachment } from './api'
import Button from './components/ui/Button'
import styles from './NoteEditor.module.css'

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return null
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`

  const units = ['KB', 'MB', 'GB', 'TB']
  let size = bytes / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${Number(size.toFixed(1))} ${units[unit]}`
}

type AttachmentRequests = {
  active: boolean
  uploading: boolean
  deletingId: string | null
  openingId: string | null
  pendingTab: Window | null
}

// The editor keys this section by note ID so each note starts with fresh state.
const NoteAttachments = ({ noteId }: { noteId: string }) => {
  const headingId = useId()
  const inputId = useId()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(true)
  const [attachmentsError, setAttachmentsError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const requests = useRef<AttachmentRequests | null>(null)

  useEffect(() => {
    // Each effect run owns its responses, including during StrictMode replay.
    const current: AttachmentRequests = {
      active: true, uploading: false, deletingId: null, openingId: null, pendingTab: null,
    }
    requests.current = current

    async function loadAttachments() {
      try {
        const loaded = await getAttachments(noteId)
        if (current.active) setAttachments(loaded)
      } catch {
        if (current.active) setAttachmentsError(true)
      } finally {
        if (current.active) setAttachmentsLoading(false)
      }
    }

    void loadAttachments()
    return () => {
      current.active = false
      current.pendingTab?.close()
    }
  }, [noteId])

  const handleUpload = async (file: File) => {
    const current = requests.current
    if (!current?.active || current.uploading || attachmentsLoading) return
    current.uploading = true
    setUploading(true)
    setUploadError(null)

    try {
      const attachment = await uploadAttachment(noteId, file)
      if (current.active) setAttachments((items) => [...items, attachment])
    } catch {
      if (current.active) setUploadError(`Couldn't upload "${file.name}". Please try again.`)
    } finally {
      current.uploading = false
      if (current.active) setUploading(false)
    }
  }

  const handleOpenAttachment = async (attachment: Attachment) => {
    const current = requests.current
    if (!current?.active || current.openingId || current.deletingId === attachment.id) return
    setDownloadError(null)
    current.openingId = attachment.id
    setOpeningId(attachment.id)

    try {
      // Reserve a tab in the click event, before awaiting the signed URL.
      const tab = window.open('about:blank', '_blank')
      if (!tab) {
        setDownloadError('Your browser blocked the attachment tab. Allow pop-ups for Draftpad and try again.')
        return
      }
      current.pendingTab = tab
      tab.opener = null
      const download = await getAttachmentDownloadUrl(noteId, attachment.id)
      if (current.active && !tab.closed) tab.location.replace(download.url)
    } catch {
      current.pendingTab?.close()
      if (current.active) setDownloadError(`Couldn't open "${attachment.fileName}". Please try again.`)
    } finally {
      current.pendingTab = null
      current.openingId = null
      if (current.active) setOpeningId(null)
    }
  }

  const handleDeleteAttachment = async (attachment: Attachment) => {
    const current = requests.current
    if (!current?.active || current.deletingId || current.openingId === attachment.id) return
    // The ref also guards clicks before React has rendered the disabled state.
    current.deletingId = attachment.id
    setDeletingId(attachment.id)
    setDeleteError(null)

    try {
      await deleteAttachment(noteId, attachment.id)
      if (current.active) setAttachments((items) => items.filter((item) => item.id !== attachment.id))
    } catch {
      if (current.active) setDeleteError(`Couldn't delete "${attachment.fileName}". Please try again.`)
    } finally {
      current.deletingId = null
      if (current.active) setDeletingId(null)
    }
  }

  return (
    <section className={styles.attachments} aria-labelledby={headingId}>
      <h2 id={headingId} className="heading-16">Attachments</h2>
      <div className={styles.attachmentUpload}>
        <label htmlFor={inputId} className="label-14">Add a file</label>
        <input
          id={inputId}
          className={`label-14 text-muted ${styles.attachmentInput}`}
          type="file"
          disabled={uploading || attachmentsLoading}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void handleUpload(file)
          }}
        />
      </div>

      <div role="status" className="copy-14 text-muted">
        {attachmentsLoading ? 'Loading attachments...' : uploading ? 'Uploading attachment...' : null}
        {!attachmentsLoading && !attachmentsError && !uploading && attachments.length === 0
          ? 'No attachments yet.' : null}
      </div>
      {attachmentsError && (
        <p role="alert" className="copy-14 text-danger">Couldn't load attachments. Reopen this note to try again.</p>
      )}
      {uploadError && <p role="alert" className={`copy-14 text-danger ${styles.attachmentError}`}>{uploadError}</p>}
      {downloadError && <p role="alert" className={`copy-14 text-danger ${styles.attachmentError}`}>{downloadError}</p>}
      {deleteError && <p role="alert" className={`copy-14 text-danger ${styles.attachmentError}`}>{deleteError}</p>}

      {attachments.length > 0 && (
        <ul className={styles.attachmentList}>
          {attachments.map((attachment) => (
            <li key={attachment.id} className={styles.attachmentRow}>
              <div className={styles.attachmentDetails}>
                <button
                  type="button"
                  className={`label-14 ${styles.attachmentName}`}
                  disabled={openingId !== null || deletingId === attachment.id}
                  aria-label={`Open ${attachment.fileName} in a new tab`}
                  onClick={() => void handleOpenAttachment(attachment)}
                >
                  {attachment.fileName}
                </button>
                <span className="copy-12 text-muted">{formatFileSize(attachment.size)}</span>
                {openingId === attachment.id && <span role="status" className="copy-12 text-muted">Opening...</span>}
              </div>
              <Button
                type="button"
                variant="dangerGhost"
                size="sm"
                disabled={deletingId !== null || openingId === attachment.id}
                loading={deletingId === attachment.id}
                aria-label={`Delete ${attachment.fileName}`}
                onClick={() => void handleDeleteAttachment(attachment)}
              >
                {deletingId === attachment.id ? 'Deleting...' : 'Delete'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default NoteAttachments
