import { Suspense } from 'react';
import { getCurrentUserId } from '@/lib/currentUserId';
import { MitraChatClient } from '@/components/mitra-chat/MitraChatClient';
import { getPreferences } from '@/lib/preferences/store';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Mitra chat' };

export default async function MitraChatPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.note}>Sign in to chat with Mitra.</p>
      </div>
    );
  }
  const prefs = await getPreferences(userId);
  return (
    <Suspense fallback={null}>
      <MitraChatClient chatPrefs={prefs.chat} />
    </Suspense>
  );
}
