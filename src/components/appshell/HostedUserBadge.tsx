'use client';

import { UserButton } from '@clerk/nextjs';
import { ACCOUNT_MENU_ITEMS } from './accountMenuItems';
import styles from './AppHeader.module.css';

// Split out so its Clerk hook/component is only ever mounted in hosted mode
// — see src/components/dashboard/HostedUserFooter.tsx for the same pattern
// (ADR 0010): rendering Clerk components with no ClerkProvider in the tree
// throws. `showName` lets Clerk's own avatar+name trigger stand in for the
// design's user pill, so account-menu access comes for free.
export function HostedUserBadge() {
  return (
    <div className={styles.userBadge}>
      <UserButton
        showName
        appearance={{
          elements: {
            // `minWidth: 0` is required for the identifier text below to
            // actually truncate inside this flex row instead of overflowing
            // past the pill and visually spilling onto the avatar image.
            userButtonBox: { flexDirection: 'row-reverse', gap: '9px', minWidth: 0 },
            userButtonOuterIdentifier: {
              fontSize: '13.5px',
              fontWeight: 500,
              color: 'var(--app-ink)',
              fontFamily: 'var(--font-sans)',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
            avatarBox: {
              width: '30px',
              height: '30px',
              flexShrink: 0,
              borderRadius: '50%',
              overflow: 'hidden',
            },
            avatarImage: { width: '100%', height: '100%', objectFit: 'cover' },
          },
        }}
      >
        {/* The same destinations as the self-host menu, added to Clerk's own account items. */}
        <UserButton.MenuItems>
          {ACCOUNT_MENU_ITEMS.map((i) => (
            <UserButton.Link key={i.href} label={i.label} href={i.href} labelIcon={<span aria-hidden="true">›</span>} />
          ))}
        </UserButton.MenuItems>
      </UserButton>
    </div>
  );
}
