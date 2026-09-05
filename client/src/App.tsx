import { useState, useEffect, useRef } from 'react'
import {
  getMe,
  logout,
  getNotes,
  createNote,
  deleteNote,
  updateNote,
} from './api'
import LoginForm from './LoginForm'
import SignupForm from './SignupForm'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import RequireAuth from './RequireAuth'
import NoteEditorRoute from './NoteEditorRoute'
import NotesLayout from './NotesLayout'
import NotesEmptyState from './NotesEmptyState'
import AuthLayout from './components/AuthLayout'
import { useToast } from './components/ui/ToastProvider'
import { isApiError } from './api'
import type { Note, User } from './api'
import LandingPage from './LandingPage'

export type Theme = 'light' | 'dark'

function App() {

  const { addToast } = useToast()

  const navigate = useNavigate()
  const { pathname } = useLocation()

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const [submitting, setSubmitting] = useState(false)

  const [authError, setAuthError] = useState(false)

  const [notes, setNotes] = useState<Note[]>([])
  const [notesLoading, setNotesLoading] = useState(true)
  const [notesError, setNotesError] = useState(false)

  const [creating, setCreating] = useState(false)
  const createInFlight = useRef(false)

  // Cast rather than validate: anything but 'dark' in storage already behaved
  // as whatever theme it named, and validating here would change that.
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('theme') ?? 'light') as Theme,
  )

  // Which note, if any, is holding keystrokes the server has not received.
  // Set by NoteEditor, read by loadNotes so a refetch does not overwrite it.
  const [dirtyNoteId, setDirtyNoteId] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  const handleAuthSuccess = (loggedInUser: User) => {
    setUser(loggedInUser)
    navigate('/notes')
  }

  useEffect(() => {
    async function checkAuth() {
      try {
        const me = await getMe()
        setUser(me)
      } catch (err) {
        if (isApiError(err) && err.status === 401) {
          setUser(null)
        } else {
          setAuthError(true)
        }
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
  }, [])

  // isFirstLoad distinguishes the initial fetch (nothing on screen, so show a
  // spinner) from a refetch (data already on screen, so leave it alone until
  // the new data arrives).
  const loadNotes = async (isFirstLoad = false) => {
    if (isFirstLoad) {
      setNotesLoading(true)
      setNotes([])
    }
    setNotesError(false)

    try {
      const fetchedNotes = await getNotes()

      // Take the server's version of everything except the note currently
      // holding unsent keystrokes, where the local copy is newer.
      // prev rather than notes: the fetch took time, and notes was captured
      // before it started.
      setNotes((prev) =>
        fetchedNotes.map((serverNote) =>
          serverNote.id === dirtyNoteId
            ? prev.find((note) => note.id === dirtyNoteId) ?? serverNote
            : serverNote,
        ),
      )
    } catch {
      setNotesError(true)
    } finally {
      setNotesLoading(false)
    }
  }

  // Refetch when the tab regains focus. This is the sync: each device catches
  // up the moment you look at it.
  useEffect(() => {
    const handleFocus = () => {
      if (!user) return
      loadNotes()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
    // loadNotes is recreated every render, so including it would re-attach the
    // listener constantly. Proper fix is useCallback; filed as a follow-up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    if (!user) return
    // Fetching on mount with a loading state is the correct use of an effect.
    // React's own answer to this rule is "use a data library", deferred to
    // TanStack Query.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNotes(true)
    // loadNotes is recreated every render; including it would refetch forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const handleNoteFetched = (fetchedNote: Note) => {
     setNotes((prev) =>
      prev.map((note) =>
        note.id === fetchedNote.id
        ? fetchedNote
        : note
      )
    )
  }

  const handleLogout = async () => {
    setSubmitting(true)

    try {
      await logout()
      setUser(null)
      setNotes([])
    } catch {
      addToast('Could not log out, try again')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateNote = async () => {
    // Both create buttons share this lock, including before the next render.
    if (createInFlight.current) return
    createInFlight.current = true
    setCreating(true)

    try {
      const newNote = await createNote()
      setNotes((prev) => [...prev, newNote])
      navigate(`/notes/${newNote.id}`)
    } catch {
      addToast('Could not create note, try again')
    } finally {
      createInFlight.current = false
      setCreating(false)
    }
  }

  const handleDeleteNote = async (id: string) => {
    await deleteNote(id)
    setNotes((prev) => prev.filter((note) => note.id !== id))
  }

  // State only, no network. The editor calls this on every keystroke and its
  // own debounced effect handles the save.
  const handleTitleChange = (id: string, newTitle: string) => {
    setNotes((prev) =>
      prev.map((note) =>
        note.id === id ? { ...note, title: newTitle } : note,
      ),
    )
  }

  // Saves and then updates state, for renaming from the sidebar where no
  // editor is mounted to run the debounced save.
  const handleRenameNote = async (id: string, newTitle: string) => {
    await updateNote(id, { title: newTitle })
    handleTitleChange(id, newTitle)
  }

  const handleContentChange = (id: string, newContent: string) => {
    setNotes((prev) =>
      prev.map((note) =>
        note.id === id ? { ...note, content: newContent } : note,
      ),
    )
  }

  // The public page remains available while auth loads or the API is unavailable.
  if (pathname !== '/') {
    if (loading) return <p>loading...</p>
    if (authError) return <p>Something went wrong. Please refresh.</p>
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage theme={theme} onToggleTheme={toggleTheme} />} />
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to="/notes" replace />
          ) : (
            <AuthLayout>
              <LoginForm onLogin={handleAuthSuccess} />
            </AuthLayout>
          )
        }
      />
      <Route
        path="/signup"
        element={
          user ? (
            <Navigate to="/notes" replace />
          ) : (
            <AuthLayout>
              <SignupForm onSignup={handleAuthSuccess} />
            </AuthLayout>
          )
        }
      />
      <Route
        path="/notes"
        element={
          <RequireAuth user={user}>
            <NotesLayout
              user={user}
              notes={notes}
              notesLoading={notesLoading}
              notesError={notesError}
              creating={creating}
              submitting={submitting}
              onCreate={handleCreateNote}
              onDelete={handleDeleteNote}
              onLogout={handleLogout}
              onRename={handleRenameNote}
              onToggleTheme={toggleTheme}
              theme={theme}
            />
          </RequireAuth>
        }
      >
        <Route index element={<NotesEmptyState onCreate={handleCreateNote} creating={creating} />} />
        <Route
          path=":id"
          element={
            <NoteEditorRoute
              notes={notes}
              notesLoading={notesLoading}
              onContentChange={handleContentChange}
              onTitleChange={handleTitleChange}
              onDirtyChange={setDirtyNoteId}
              onNoteFetched={handleNoteFetched}
            />
          }
        />
      </Route>
    </Routes>
  )
}

export default App
