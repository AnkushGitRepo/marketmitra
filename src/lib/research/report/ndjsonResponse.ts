import type { ReportEvent } from './chapters';

/** The report as newline-delimited JSON events (`application/x-ndjson`), one per chapter as it finishes. */
export function ndjsonResponse(events: AsyncGenerator<ReportEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      } catch {
        const event: ReportEvent = { type: 'error', message: 'The report stopped unexpectedly. Try again.' };
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
