'use client';

import { InfoPopover } from '@/components/common/InfoPopover';

interface ScreenerInfoProps {
  readonly intro: string;
  readonly coverage: string | null;
}

/** The screener's long explanatory notes, tucked behind an (i) button beside the page title. */
export function ScreenerInfo({ intro, coverage }: ScreenerInfoProps) {
  return (
    <InfoPopover label="About this data">
      <p>{intro}</p>
      {coverage && <p data-testid="screener-coverage">{coverage}</p>}
    </InfoPopover>
  );
}
