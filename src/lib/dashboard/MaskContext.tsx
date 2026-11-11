'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface MaskContextValue {
  masked: boolean;
  toggleMask: () => void;
  /** Sets the mask directly (the Settings preview of "hide values by default"). */
  setMasked: (masked: boolean) => void;
}

const MaskContext = createContext<MaskContextValue | null>(null);

export function MaskProvider({ children, initialMasked = false }: { children: ReactNode; initialMasked?: boolean }) {
  const [masked, setMasked] = useState(initialMasked);
  return (
    <MaskContext.Provider value={{ masked, toggleMask: () => setMasked((m) => !m), setMasked }}>
      {children}
    </MaskContext.Provider>
  );
}

export function useMask(): MaskContextValue {
  const ctx = useContext(MaskContext);
  if (!ctx) throw new Error('useMask must be used within a MaskProvider');
  return ctx;
}
