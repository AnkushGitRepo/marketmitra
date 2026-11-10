'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppHeader } from './AppHeader';
import { AiWidget, sectionFromPathname } from './AiWidget';
import { MobileTabBar } from './MobileTabBar';
import { ShortcutsDialog } from './ShortcutsDialog';
import { Sidebar } from './Sidebar';
import { useIsMac, useKeyboardShortcuts } from './useKeyboardShortcuts';
import { MaskProvider, useMask } from '@/lib/dashboard/MaskContext';
import { PageContextProvider } from '@/lib/dashboard/PageContext';
import styles from './AppShell.module.css';

function AppShellInner({ children, advisorEnabled }: { children: ReactNode; advisorEnabled: boolean }) {
  const { toggleMask } = useMask();
  const pathname = usePathname();
  const section = sectionFromPathname(pathname);
  const isMac = useIsMac();
  const [helpOpen, setHelpOpen] = useState(false);
  const toggleHelp = useCallback(() => setHelpOpen((open) => !open), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  useKeyboardShortcuts({ helpOpen, onToggleHelp: toggleHelp });

  return (
    <div className={styles.shell}>
      <Sidebar advisorEnabled={advisorEnabled} />
      <div className={styles.contentArea}>
        <AppHeader onToggleMask={toggleMask} />
        <main className={styles.main}>{children}</main>
      </div>
      {pathname !== '/dashboard/mitra' && <AiWidget section={section} />}
      <MobileTabBar />
      <ShortcutsDialog open={helpOpen} isMac={isMac} onClose={closeHelp} />
    </div>
  );
}

export function AppShell({ children, advisorEnabled = false }: { children: ReactNode; advisorEnabled?: boolean }) {
  return (
    <MaskProvider>
      <PageContextProvider>
        <AppShellInner advisorEnabled={advisorEnabled}>{children}</AppShellInner>
      </PageContextProvider>
    </MaskProvider>
  );
}
