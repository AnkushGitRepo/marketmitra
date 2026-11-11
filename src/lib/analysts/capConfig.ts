// The daily AI cap for analysts on this deployment (#142): the small hosted cap, or a high one for a local or self-hosted instance.

import { isHosted } from '@/lib/deployment-mode';
import { resolveDailyCap } from './caps';

export const dailyAiCap = (): number => resolveDailyCap(isHosted(), process.env.ANALYST_DAILY_AI_CAP);
