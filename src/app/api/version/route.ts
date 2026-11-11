import { NextResponse } from 'next/server';
import { getVersionInfo } from '@/lib/version';

export const dynamic = 'force-dynamic';

/** Public: the running product version and the commit it was built from (also the API reference version). */
export async function GET() {
  return NextResponse.json({ success: true, data: getVersionInfo() });
}
