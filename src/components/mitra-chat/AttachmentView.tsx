import { formatBytes } from '@/lib/mitra-chat/uiHelpers';
import styles from './Chat.module.css';

interface AttachmentViewProps {
  readonly url: string;
  readonly mediaType: string;
  readonly filename?: string;
}

/** Renders a stored attachment inside a transcript bubble (owner-only file URL). */
export function AttachmentView({ url, mediaType, filename }: AttachmentViewProps) {
  const name = filename ?? 'attachment';
  if (mediaType.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={styles.imageLink}>
        {/* eslint-disable-next-line @next/next/no-img-element -- owner-only dynamic file, not optimisable */}
        <img src={url} alt={name} className={styles.attachedImage} loading="lazy" />
      </a>
    );
  }
  if (mediaType.startsWith('audio/')) {
    return (
      <figure className={styles.audioFigure}>
        <figcaption className={styles.fileName}>{name}</figcaption>
        <audio controls preload="metadata" src={url} className={styles.audio} />
      </figure>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className={styles.fileChip}>
      <span className={styles.fileKind}>{mediaType === 'application/pdf' ? 'PDF' : 'FILE'}</span>
      <span className={styles.fileName}>{name}</span>
    </a>
  );
}

export function PendingAttachmentSize({ size }: { readonly size: number }) {
  return <span className={styles.fileSize}>{formatBytes(size)}</span>;
}
