import { Outlet } from 'react-router-dom'
import { useSyncExternalStore } from 'react'
import Sidebar from './Sidebar'
import Wordmark from './components/Wordmark'
import styles from './NotesLayout.module.css'
import type { Note, User } from './api'
import type { Theme } from './App'

const NOTES_VIEWPORT_QUERY = '(min-width: 1025px) and (min-height: 550px)'

function subscribeToViewport(onChange: () => void) {
  const query = window.matchMedia(NOTES_VIEWPORT_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getViewportSnapshot() {
  return window.matchMedia(NOTES_VIEWPORT_QUERY).matches
}

type NotesLayoutProps = {
  user: User | null
  notes: Note[]
  notesLoading: boolean
  notesError: boolean
  creating: boolean
  submitting: boolean
  onCreate: () => void
  onDelete: (id: string) => Promise<void>
  onLogout: () => void
  onRename: (id: string, newTitle: string) => Promise<void>
  onToggleTheme: () => void
  theme: Theme
}

const NotesLayout = ({ user, notes, notesLoading, notesError, creating, submitting, onCreate, onDelete, onLogout, onRename, onToggleTheme, theme }: NotesLayoutProps) => {
  const hasRoom = useSyncExternalStore(subscribeToViewport, getViewportSnapshot, () => false)

  return (
    <>
      {!hasRoom && (
        <main className={styles.viewportGate} aria-labelledby="notes-size-title">
          <div className={styles.message}>
            <Wordmark size={24} />
            <h1 id="notes-size-title" className="heading-24">Draftpad needs a little more room</h1>
            <p className="copy-16 text-muted">Open it on a larger screen or resize your window to continue.</p>
            <p className="copy-12 text-muted">At least 1025 pixels wide and 550 pixels tall.</p>
          </div>
        </main>
      )}
      {/* Keep the editor and its pending saves alive while the layout is hidden. */}
      <div className={styles.shell} hidden={!hasRoom} inert={!hasRoom}>
        {/* Unmount the sidebar so its modal dialogs cannot cover the size gate. */}
        {hasRoom && (
          <Sidebar
            user={user}
            notes={notes}
            notesLoading={notesLoading}
            notesError={notesError}
            creating={creating}
            submitting={submitting}
            onCreate={onCreate}
            onDelete={onDelete}
            onLogout={onLogout}
            onRename={onRename}
            onToggleTheme={onToggleTheme}
            theme={theme}
          />
        )}
        <main className={styles.editorPane}>
          <Outlet />
        </main>
      </div>
    </>
  )
}

export default NotesLayout
