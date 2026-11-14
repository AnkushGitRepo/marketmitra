// Bounds shared by the analyst sweep and the local catch-up loop (ADR 0058, ADR 0062).

/** Dossiers built in one sweep. */
export const MAX_INITIATIONS = 4;
/** End-of-day checks in one sweep. */
export const MAX_HEARTBEATS = 12;
/** Catch-up passes after the app starts, so a long queue cannot spin forever. */
export const MAX_CATCHUP_PASSES = 15;
