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

function AppShellInner({ children, advisorEnabled, shortcutsEnabled }: { children: ReactNode; advisorEnabled: boolean; shortcutsEnabled: boolean }) {
  const { toggleMask } = useMask();
  const pathname = usePathname();
  const section = sectionFromPathname(pathname);
  const isMac = useIsMac();
  const [helpOpen, setHelpOpen] = useState(false);
  const toggleHelp = useCallback(() => setHelpOpen((open) => !open), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  useKeyboardShortcuts({ enabled: shortcutsEnabled, helpOpen, onToggleHelp: toggleHelp });

  return (
    <div className={styles.shell}>
      <Sidebar advisorEnabled={advisorEnabled} />
      <div className={styles.contentArea}>
        <AppHeader onToggleMask={toggleMask} />
        <main className={styles.main}>{children}</main>
      </div>
      {pathname !== '/mitra' && <AiWidget section={section} />}
      <MobileTabBar />
      <ShortcutsDialog open={helpOpen} isMac={isMac} onClose={closeHelp} />
    </div>
  );
}

interface AppShellProps {
  children: ReactNode;
  advisorEnabled?: boolean;
  /** Resolved per-user preferences (Settings); defaults apply when omitted. */
  shortcutsEnabled?: boolean;
  hideValuesByDefault?: boolean;
}

export function AppShell({ children, advisorEnabled = false, shortcutsEnabled = true, hideValuesByDefault = false }: AppShellProps) {
  return (
    <MaskProvider initialMasked={hideValuesByDefault}>
      <PageContextProvider>
        <AppShellInner advisorEnabled={advisorEnabled} shortcutsEnabled={shortcutsEnabled}>
          {children}
        </AppShellInner>
      </PageContextProvider>
    </MaskProvider>
  );
}
