'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppHeader } from './AppHeader';
import { AiWidget, sectionFromPathname } from './AiWidget';
import { MobileTabBar } from './MobileTabBar';
import { Sidebar } from './Sidebar';
import { MaskProvider, useMask } from '@/lib/dashboard/MaskContext';
import { PageContextProvider } from '@/lib/dashboard/PageContext';
import styles from './AppShell.module.css';

function AppShellInner({ children }: { children: ReactNode }) {
  const { toggleMask } = useMask();
  const pathname = usePathname();
  const section = sectionFromPathname(pathname);

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.contentArea}>
        <AppHeader onToggleMask={toggleMask} />
        <main className={styles.main}>{children}</main>
      </div>
      <AiWidget section={section} />
      <MobileTabBar />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <MaskProvider>
      <PageContextProvider>
        <AppShellInner>{children}</AppShellInner>
      </PageContextProvider>
    </MaskProvider>
  );
}
