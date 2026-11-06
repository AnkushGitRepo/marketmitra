import type { DrawingTool } from '@/lib/chart/drawings';

const P = { width: 22, height: 22, viewBox: '0 0 22 22', fill: 'none', 'aria-hidden': true } as const;
const S = { stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function ToolIcon({ tool }: { tool: DrawingTool | 'trash' }) {
  switch (tool) {
    case 'cursor':
      return (
        <svg {...P}>
          <path d="M11 3v5M11 14v5M3 11h5M14 11h5" {...S} />
        </svg>
      );
    case 'trend':
      return (
        <svg {...P}>
          <path d="M4 17 18 5" {...S} />
          <circle cx="4" cy="17" r="2" {...S} />
          <circle cx="18" cy="5" r="2" {...S} />
        </svg>
      );
    case 'hline':
      return (
        <svg {...P}>
          <path d="M3 11h16" {...S} strokeDasharray="3 3" />
          <circle cx="11" cy="11" r="2" {...S} />
        </svg>
      );
    case 'fib':
      return (
        <svg {...P}>
          <path d="M3 4h16M3 9h16M3 14h16M3 19h16" {...S} />
          <circle cx="5" cy="19" r="1.4" {...S} />
          <circle cx="17" cy="4" r="1.4" {...S} />
        </svg>
      );
    case 'measure':
      return (
        <svg {...P}>
          <rect x="3" y="7" width="16" height="8" rx="1.5" {...S} transform="rotate(-35 11 11)" />
          <path d="M8 9.5v2M11 8v3M14 6.5v2" {...S} transform="rotate(-35 11 11)" />
        </svg>
      );
    case 'text':
      return (
        <svg {...P}>
          <path d="M5 5h12M11 5v12M8 17h6" {...S} />
        </svg>
      );
    case 'trash':
      return (
        <svg {...P}>
          <path d="M5 7h12M9 7V5h4v2M7 7l1 11h6l1-11" {...S} />
        </svg>
      );
  }
}
