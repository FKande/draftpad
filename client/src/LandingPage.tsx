import { Link } from 'react-router-dom'
import { ArrowUpRight, Moon, Sun } from 'lucide-react'
import type { Theme } from './App'
import Wordmark from './components/Wordmark'
import Button from './components/ui/Button'
import editorStyles from './NoteEditor.module.css'
import styles from './LandingPage.module.css'

type LandingPageProps = {
  theme: Theme
  onToggleTheme: () => void
}

const LandingPage = ({ theme, onToggleTheme }: LandingPageProps) => (
  <div className={styles.page}>
    <div className={styles.container}>
      <header className={styles.navbar}>
        <Link to="/" className="link-plain" aria-label="Draftpad home">
          <Wordmark size={24} />
        </Link>
        <nav className={styles.navActions} aria-label="Main navigation">
          <Link to="/login" className="label-14">Log in</Link>
          <Link to="/signup" className={`button-14 ${styles.navCta}`}>Sign up</Link>
        </nav>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.intro}>
            <p className="label-14 text-muted">A focused place to write</p>
            <h1 id="landing-title" className={`heading-48 ${styles.headline}`}>
              Notes that<br />stay with you.
            </h1>
            <p className={`copy-16 text-muted ${styles.description}`}>
              Write things down. Draftpad saves as you go, keeps your notes in sync
              across devices, and holds the files that belong with them.
            </p>
            <div className={styles.heroActions}>
              <Link to="/signup" className={`button-16 ${styles.primaryCta}`}>
                Get started
                <ArrowUpRight className={styles.icon} aria-hidden="true" />
              </Link>
              <span className="copy-14 text-muted">A blank page is a good place to start.</span>
            </div>
          </div>

          <figure className={styles.preview} aria-labelledby="preview-caption">
            <div className={styles.previewToolbar}>
              <span className="label-12 text-muted">A look inside Draftpad</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onToggleTheme}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                iconLeft={theme === 'dark'
                  ? <Sun className={styles.icon} aria-hidden="true" />
                  : <Moon className={styles.icon} aria-hidden="true" />}
              >
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </Button>
            </div>

            {/* An empty, static preview: no invented notes or live account data. */}
            <div className={styles.previewWindow}>
              <div className={styles.previewSidebar}>
                <Wordmark size={20} />
                <div className={styles.previewNoteList}>
                  <span className="label-12 text-muted">Your notes</span>
                  <p className="copy-12 text-muted">A little room for whatever comes to mind.</p>
                </div>
              </div>
              <div className={styles.previewEditor}>
                <div className={editorStyles.header}>
                  <span className="label-12 text-muted">Note title</span>
                  <span className="heading-32 text-subtle">Untitled</span>
                </div>
                <div className={styles.previewBody}>
                  <p className="copy-16 text-muted">Your next thought starts here.</p>
                </div>
                <div className={editorStyles.attachments}>
                  <span className="heading-14">Attachments</span>
                  <span className="copy-12 text-muted">No attachments yet.</span>
                </div>
              </div>
            </div>

            <figcaption id="preview-caption" className={`copy-12 text-muted ${styles.previewCaption}`}>
              An empty editor preview. Light or dark, the same space to think.
            </figcaption>
          </figure>
        </section>

        <section className={styles.details} aria-labelledby="details-title">
          <div className={styles.detailIntro}>
            <p className="label-12 text-muted">Thoughtfully kept</p>
            <h2 id="details-title" className="heading-24">Your notes. Your account.</h2>
          </div>
          <div className={styles.detail}>
            <h3 className="heading-16">A place of your own</h3>
            <p className="copy-14 text-muted">
              Sign in to access your notes. Each request checks that the note belongs to your account.
            </p>
          </div>
          <div className={styles.detail}>
            <h3 className="heading-16">Files stay with the note</h3>
            <p className="copy-14 text-muted">
              File access is checked against your account, too. Download links are temporary and expire after five minutes.
            </p>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerIdentity}>
          <Wordmark size={20} />
          <p className="copy-12 text-muted">A solo-built note-taking app.</p>
        </div>
        <a
          href="https://github.com/FKande/Draftpad"
          className={`label-14 ${styles.sourceLink}`}
          target="_blank"
          rel="noreferrer"
          aria-label="View Draftpad on GitHub (opens in a new tab)"
        >
          View the source <ArrowUpRight className={styles.icon} aria-hidden="true" />
        </a>
      </footer>
    </div>
  </div>
)

export default LandingPage
