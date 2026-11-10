import { buildSparkline } from '@/lib/dashboard/chartMath';

interface SparklineProps {
  readonly values: readonly number[] | undefined;
  readonly up: boolean;
  readonly className?: string;
}

/** A tiny trend line; renders nothing when there are fewer than two points rather than a flat fake. */
export function Sparkline({ values, up, className }: SparklineProps) {
  if (!values || values.length < 2) return <span className={className} aria-hidden="true" />;
  return (
    <svg viewBox="0 0 120 34" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path
        d={buildSparkline([...values])}
        fill="none"
        stroke={up ? 'var(--app-teal)' : 'var(--app-loss-soft)'}
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
