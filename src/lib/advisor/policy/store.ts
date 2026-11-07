import { getDb } from '@/lib/mongodb';
import { DISCLAIMER_VERSION } from '../disclaimer';
import { policySchema, type InvestmentPolicy } from './schema';

interface PolicyDocument {
  userId: string;
  policy: InvestmentPolicy;
  updatedAt: Date;
}

interface AcknowledgementDocument {
  userId: string;
  version: number;
  acceptedAt: Date;
}

async function policies() {
  return (await getDb()).collection<PolicyDocument>('advisor_policies');
}
async function acknowledgements() {
  return (await getDb()).collection<AcknowledgementDocument>('advisor_acknowledgements');
}

export async function getPolicy(userId: string): Promise<InvestmentPolicy | null> {
  const doc = await (await policies()).findOne({ userId });
  if (!doc) return null;
  // Re-validate on read: a hand-edited document must not bypass the rulebook.
  const parsed = policySchema.safeParse(doc.policy);
  return parsed.success ? parsed.data : null;
}

export async function savePolicy(userId: string, policy: InvestmentPolicy): Promise<void> {
  await (await policies()).updateOne(
    { userId },
    { $set: { policy, updatedAt: new Date() } },
    { upsert: true },
  );
}

export async function hasAcknowledged(userId: string): Promise<boolean> {
  const doc = await (await acknowledgements()).findOne({ userId });
  return !!doc && doc.version >= DISCLAIMER_VERSION;
}

export async function recordAcknowledgement(userId: string): Promise<void> {
  await (await acknowledgements()).updateOne(
    { userId },
    { $set: { version: DISCLAIMER_VERSION, acceptedAt: new Date() } },
    { upsert: true },
  );
}
