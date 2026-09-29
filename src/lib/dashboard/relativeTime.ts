/** Short relative-time label ("just now", "5m", "3h", "2d") for a timestamp. */
export function relativeTime(date: Date | string): string {
  const then = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}
