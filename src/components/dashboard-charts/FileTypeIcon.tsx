import styles from './FileTypeIcon.module.css';

interface FileTypeIconProps {
  /** The document's own URL — the file extension drives which glyph/badge
   * renders, so a new document type (XBRL filing, credit rating PDF, an
   * XLSX export, ...) picks up a correct-enough icon automatically rather
   * than needing a new case added here. */
  url: string;
  size?: number;
}

function extensionFromUrl(url: string): string {
  const withoutQuery = url.split(/[?#]/, 1)[0];
  const match = /\.([a-z0-9]{1,5})$/i.exec(withoutQuery);
  return match ? match[1].toLowerCase() : '';
}

export function FileTypeIcon({ url, size = 30 }: FileTypeIconProps) {
  const ext = extensionFromUrl(url);
  const badgeLabel = ext ? ext.slice(0, 4).toUpperCase() : 'FILE';

  return (
    <span className={styles.tile} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24" className={styles.glyph}>
        <path
          d="M6 2h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M14 2v4h4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <line x1="8" y1="12.5" x2="16" y2="12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="8" y1="15.5" x2="14" y2="15.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span className={styles.badge}>{badgeLabel}</span>
    </span>
  );
}
