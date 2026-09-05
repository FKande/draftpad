import Button from './components/ui/Button'
import styles from './NotesLayout.module.css'

type NotesEmptyStateProps = {
  onCreate: () => void
  creating: boolean
}

const NotesEmptyState = ({ onCreate, creating }: NotesEmptyStateProps) => (
  <section className={styles.emptyState} aria-labelledby="notes-empty-title">
    <div className={styles.message}>
      <h1 id="notes-empty-title" className="heading-24">No note open yet</h1>
      <p className="copy-16 text-muted">Choose a note from the sidebar, or start a new one.</p>
      <Button type="button" onClick={onCreate} loading={creating}>
        {creating ? 'Creating note...' : 'Create a note'}
      </Button>
    </div>
  </section>
)

export default NotesEmptyState
