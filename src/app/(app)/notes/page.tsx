import { getCurrentUserId } from '@/lib/currentUserId';
import { listNotes, type UserNote } from '@/lib/notes/userNotes';
import { NotesPageClient } from './NotesPageClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface NotesPageProps {
  readonly searchParams: Promise<{ note?: string | string[] }>;
}

export default async function NotesPage({ searchParams }: NotesPageProps) {
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

  // A link such as /notes?note=<id> (from Mitra's notes card) opens that note.
  const { note } = await searchParams;
  const initialId = typeof note === 'string' && notes.some((n) => n.id === note) ? note : null;

  return <NotesPageClient notes={notes} initialId={initialId} />;
}
