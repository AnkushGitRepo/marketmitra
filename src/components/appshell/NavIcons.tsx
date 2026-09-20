const ICON_PROPS = {
  width: 21,
  height: 21,
  viewBox: '0 0 22 22',
  fill: 'none',
  'aria-hidden': true,
} as const;

export function DashboardIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="2.5" y="2.5" width="7" height="7" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="12.5" y="2.5" width="7" height="7" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="2.5" y="12.5" width="7" height="7" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="12.5" y="12.5" width="7" height="7" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function PortfolioIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M11 3 A8 8 0 0 1 19 11 L11 11 Z" fill="currentColor" />
    </svg>
  );
}

export function MarketsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="12" width="4" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.7" />
      <rect x="9" y="8" width="4" height="11" rx="1.4" stroke="currentColor" strokeWidth="1.7" />
      <rect x="15" y="4" width="4" height="15" rx="1.4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function ScreenerIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path
        d="M3.5 4h15l-5.5 7v5.5l-4 2V11L3.5 4Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AlertsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path
        d="M11 3a5 5 0 0 0-5 5v3l-1.4 2.7a1 1 0 0 0 .9 1.5h11a1 1 0 0 0 .9-1.5L16 11V8a5 5 0 0 0-5-5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9 17.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function NewsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="4" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <line x1="6.5" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <line x1="6.5" y1="11" x2="15.5" y2="11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <line x1="6.5" y1="14" x2="15.5" y2="14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function IposIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path
        d="M11 2.5c2.4 1.8 3.8 4.6 3.8 7.8 0 2.1-.6 3.9-1.6 5.4h-4.4c-1-1.5-1.6-3.3-1.6-5.4 0-3.2 1.4-6 3.8-7.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="11" cy="9.3" r="1.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.8 15.7 6.5 19.2M13.2 15.7 15.5 19.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ResearchIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="12" height="15" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <line x1="6" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="10.5" x2="12" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="15.5" cy="15.5" r="3.3" stroke="currentColor" strokeWidth="1.7" />
      <line x1="17.7" y1="17.7" x2="19.5" y2="19.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function AgentsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="4.5" y="8.5" width="13" height="9.5" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="8.5" cy="13" r="1.3" fill="currentColor" />
      <circle cx="13.5" cy="13" r="1.3" fill="currentColor" />
      <path d="M11 8.5V5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="11" cy="4" r="1.3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function NotesIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="4" y="3" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <line x1="7.3" y1="7.5" x2="14.7" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="7.3" y1="11" x2="14.7" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="7.3" y1="14.5" x2="12" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ApiIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M8 6 3.5 11 8 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 6 18.5 11 14 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const NAV_ICONS = {
  '/dashboard': DashboardIcon,
  '/dashboard/portfolio': PortfolioIcon,
  '/dashboard/markets': MarketsIcon,
  '/dashboard/screener': ScreenerIcon,
  '/dashboard/alerts': AlertsIcon,
  '/dashboard/news': NewsIcon,
  '/dashboard/ipos': IposIcon,
  '/dashboard/research': ResearchIcon,
  '/dashboard/agents': AgentsIcon,
  '/dashboard/notes': NotesIcon,
  '/dashboard/api': ApiIcon,
} as const;
