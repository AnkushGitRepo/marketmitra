import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { withRateLimit } from '@/lib/rateLimit';
import { getConversation } from '@/lib/mitra-chat/conversations';
import { getFileStore } from '@/lib/mitra-chat/gridFsFileStore';
import { MAX_FILE_BYTES } from '@/lib/mitra-chat/limits';
import { fileUrl } from '@/lib/mitra-chat/prepareMessages';
import { processUpload } from '@/lib/mitra-chat/upload';

export const dynamic = 'force-dynamic';

const err = (error: string, status: number) => NextResponse.json({ success: false, data: null, error }, { status });

async function handlePOST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return err('Not authenticated', 401);

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const conversationId = form?.get('conversationId');
  if (!(file instanceof File) || typeof conversationId !== 'string') return err('Invalid request', 422);
  // Check the declared size before buffering the body.
  if (file.size > MAX_FILE_BYTES) return err(`Files can be at most ${Math.floor(MAX_FILE_BYTES / 1_000_000)} MB.`, 413);

  const result = await processUpload(
    { userId, conversationId, filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
    {
      store: getFileStore(),
      ownsConversation: async (uid, cid) => (await getConversation(uid, cid)) !== null,
    }
  );
  if (!result.ok) return err(result.error, result.status);

  const { file: stored } = result;
  return NextResponse.json(
    {
      success: true,
      data: {
        id: stored.id,
        url: fileUrl(stored.id),
        filename: stored.filename,
        mediaType: stored.mediaType,
        kind: stored.kind,
        size: stored.size,
      },
      error: null,
    },
    { status: 201 }
  );
}

export const POST = withRateLimit(handlePOST, 'default');
