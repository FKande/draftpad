import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import styles from './NoteEditor.module.css'
import type { Note } from './api'
import { updateNote } from './api'
import NoteAttachments from './NoteAttachments'

type SaveField = 'content' | 'title'

// Keep writes ordered even if a note is reopened before its final save finishes.
// Entries are removed when that note's last queued request settles.
const saveQueues = new Map<string, Promise<void>>()

type NoteEditorProps = {
  note: Note
  onContentChange: (newContent: string) => void
  onTitleChange: (newTitle: string) => void
  onDirtyChange: (id: string | null) => void
}

const NoteEditor = ({ note, onContentChange, onTitleChange, onDirtyChange }: NoteEditorProps) => {

  const content = note.content ?? ''
  const title = note.title ?? ''

  const [lastSavedContent, setLastSavedContent] = useState(content)
  const [lastSavedTitle, setLastSavedTitle] = useState(title)

  const [saveError, setSaveError] = useState(false)
  const [titleSaveError, setTitleSaveError] = useState(false)

  // NoteEditorRoute keys this component by note ID. Each editor instance owns
  // its values; an old request must never read the newly selected note's data.
  const latestValues = useRef({ content, title })
  const savedValues = useRef({ content, title })
  const pending = useRef<Partial<Record<SaveField, { value: string; request: Promise<void> }>>>({})
  const mounted = useRef(false)

  useLayoutEffect(() => {
    latestValues.current = { content, title }
  }, [content, title])

  const saveField = useCallback((field: SaveField) => {
    const value = latestValues.current[field]
    const previous = pending.current[field]
    if (previous ? previous.value === value : savedValues.current[field] === value) return

    const setError = field === 'content' ? setSaveError : setTitleSaveError
    const setSaved = field === 'content' ? setLastSavedContent : setLastSavedTitle
    if (mounted.current) setError(false)

    // Capture the value now, then wait for older writes to this note. In
    // particular, reverting to the saved value still needs a write if an older
    // edit is in flight. Recheck the saved value only after that write settles.
    const request = (saveQueues.get(note.id) ?? Promise.resolve()).then(async () => {
      if (savedValues.current[field] === value) return
      try {
        await updateNote(note.id, { [field]: value })
        savedValues.current[field] = value
        if (mounted.current) {
          setSaved(value)
          setError(false)
        }
      } catch {
        if (mounted.current) setError(true)
      }
    })

    pending.current[field] = { value, request }
    saveQueues.set(note.id, request)
    void request.then(() => {
      if (pending.current[field]?.request === request) delete pending.current[field]
      if (saveQueues.get(note.id) === request) saveQueues.delete(note.id)
    })
  }, [note.id])

  useEffect(() => {
    mounted.current = true
    const flush = () => {
      saveField('content')
      saveField('title')
    }

    window.addEventListener('blur', flush)
    return () => {
      mounted.current = false
      window.removeEventListener('blur', flush)
      // Timer cleanups cancel the debounce, not these final queued requests.
      flush()
    }
  }, [saveField])

  useEffect(() => {
    if (content === lastSavedContent) return

    const timerId = setTimeout(() => {
      saveField('content')
    }, 500)

    return () => clearTimeout(timerId)
  }, [content, lastSavedContent, saveField])

  useEffect(() => {
    if (title === lastSavedTitle) return

    const timerId = setTimeout(() => {
      saveField('title')
    }, 500)

    return () => clearTimeout(timerId)
  }, [title, lastSavedTitle, saveField])

  const unsaved = content !== lastSavedContent
  const unsavedTitle = title !== lastSavedTitle

  // Tells App which note is holding unsent keystrokes, so a refetch knows
  // not to overwrite it. The cleanup clears it: on a re-run the effect
  // immediately sets it back, and on unmount it stays cleared.
  useEffect(() => {
    onDirtyChange(unsaved || unsavedTitle ? note.id : null)
    return () => onDirtyChange(null)
  }, [unsaved, unsavedTitle, onDirtyChange, note.id])

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

        <NoteAttachments key={note.id} noteId={note.id} />
      </div>
    </article>
  )
}

export default NoteEditor
