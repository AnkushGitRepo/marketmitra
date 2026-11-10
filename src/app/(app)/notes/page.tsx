import { getCurrentUserId } from '@/lib/currentUserId';
import { listNotes, type UserNote } from '@/lib/notes/userNotes';
import { NotesPageClient } from './NotesPageClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function NotesPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.introNote}>Sign in to keep research notes.</p>
      </div>
    );
  }

  let notes: UserNote[] = [];
  try {
    notes = await listNotes(userId);
  } catch {
    // Mongo unreachable — render the shell with an empty list rather than 500.
  }

  return <NotesPageClient notes={notes} />;
}
