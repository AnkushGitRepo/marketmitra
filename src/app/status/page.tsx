import type { Metadata } from 'next';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import { getSystemStatus } from '@/lib/system/health';
import { StatusPageClient } from './StatusPageClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'System status',
  description: 'Live status of MarketMitra’s infrastructure.',
};

export default async function StatusPage() {
  const status = await getSystemStatus();
  return (
    <>
      <Navbar />
      <StatusPageClient initialStatus={status} />
      <Footer />
    </>
  );
}
