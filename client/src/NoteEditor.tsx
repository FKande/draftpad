import { useState, useEffect } from 'react'
import styles from './NoteEditor.module.css'
import type { Note, Attachment } from './api'
import { updateNote, getAttachments, uploadAttachment, getAttachmentDownloadUrl } from './api'

type NoteEditorProps = {
  note: Note
  onContentChange: (newContent: string) => void
  onTitleChange: (newTitle: string) => void
  onDirtyChange: (id: string | null) => void
}

const NoteEditor = ({ note, onContentChange, onTitleChange, onDirtyChange }: NoteEditorProps) => {

  const [attachments, setAttachments] =  useState<Attachment[]>([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(true)
  const [attachmentsError, setAttachmentsError] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(false)

  const [downloadError, setDownloadError] = useState(false)

  const loadAttachments = async () => {
    setAttachmentsLoading(true)
    setAttachmentsError(false)

    try {
      const attachments = await getAttachments(note.id)
      setAttachments(attachments)
    } catch {
      setAttachmentsError(true)
    } finally {
      setAttachmentsLoading(false)
    }

  }

  useEffect(() => {
    loadAttachments()
  }, [note.id])

  const handleUpload = async (file: File) => {
    setUploading(true)
    setUploadError(false)

    try {
      const newAttachment = await uploadAttachment(note.id, file)
      setAttachments((current) => [...current, newAttachment])
    } catch {
      setUploadError(true)
    } finally {
      setUploading(false)
    }
  }

  const handleOpenAttachment = async (attachmentId: string) => {
    try {
      const download = await getAttachmentDownloadUrl(note.id, attachmentId)
      window.open(download.url, '_blank')
    } catch {
      setDownloadError(true)
    }
  }

  const content = note.content ?? ''
  const title = note.title ?? ''

  const [lastSavedContent, setLastSavedContent] = useState(content)
  const [lastSavedTitle, setLastSavedTitle] = useState(title)

  const [saveError, setSaveError] = useState(false)
  const [titleSaveError, setTitleSaveError] = useState(false)

  const saveContent = async () => {
    try {
      setSaveError(false)
      await updateNote(note.id, { content })
      setLastSavedContent(content)
    } catch {
      setSaveError(true)
    }
  }

  useEffect(() => {
    if (content === lastSavedContent) return

    const timerId = setTimeout(() => {
      saveContent()
    }, 500)

    return () => clearTimeout(timerId)
    // saveContent is recreated every render, so including it here would reset
    // the debounce timer on every render and the save would never fire.
    // Proper fix is useCallback; filed as a follow-up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, note.id, lastSavedContent])

  const saveTitle = async () => {
    try {
      setTitleSaveError(false)
      await updateNote(note.id, { title })
      setLastSavedTitle(title)
    } catch {
      setTitleSaveError(true)
    }
  }

  useEffect(() => {
    if (title === lastSavedTitle) return

    const timerId = setTimeout(() => {
      saveTitle()
    }, 500)

    return () => clearTimeout(timerId)
    // Same as above: saveTitle changes identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, note.id, lastSavedTitle])

  const unsaved = content !== lastSavedContent
  const unsavedTitle = title !== lastSavedTitle

  // Tells App which note is holding unsent keystrokes, so a refetch knows
  // not to overwrite it. The cleanup clears it: on a re-run the effect
  // immediately sets it back, and on unmount it stays cleared.
  useEffect(() => {
    onDirtyChange(unsaved || unsavedTitle ? note.id : null)
    return () => onDirtyChange(null)
  }, [unsaved, unsavedTitle, onDirtyChange, note.id])

  // Flush pending saves before the window loses focus, so switching away
  // mid-debounce does not leave work unsent.
  useEffect(() => {
    const handleBlur = () => {
      if (unsaved) saveContent()
      if (unsavedTitle) saveTitle()
    }

    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
    // saveContent and saveTitle are omitted deliberately: they change identity
    // every render, so including them would re-attach the listener constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsaved, unsavedTitle])

  return (
    <article className={styles.editor}>
      <div className={styles.column}>
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <p className="label-14 text-muted">
              {titleSaveError
                ? "Couldn't save your title"
                : unsavedTitle
                  ? 'Saving title...'
                  : 'Saved title'}
            </p>
            <input
              value={title}
              className={`heading-32 ${styles.title}`}
              maxLength={50}
              onChange={(e) => onTitleChange(e.target.value)}
            />
          </div>
          <p className="label-14 text-muted">
            {saveError
              ? "Couldn't save your content"
              : unsaved
                ? 'Saving note content...'
                : 'Saved note content'}
          </p>
        </header>
        <textarea
          autoFocus
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          className={`copy-16 ${styles.body}`}
        />

        <input
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            handleUpload(file)
          }}
        />

        {attachmentsLoading && <p>Loading attachments...</p>}

        {attachmentsError && (
          <p className={styles.error}>Couldn't load attachments</p>
        )}

        {uploadError && (
          <p className={styles.error}>There was an issue with uploading</p>
        )}

        {uploading && <p>Uploading attachment...</p>}

        {!attachmentsLoading && attachments.map((attachment) => (
          <div key={attachment.id}>
            <p>{attachment.fileName}</p>
          </div>
        ))}

      </div>
    </article>
  )
}

export default NoteEditor
