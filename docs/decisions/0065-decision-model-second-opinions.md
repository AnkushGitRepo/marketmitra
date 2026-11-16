# 0065 — Decision models as second opinions on two safety checks

**Status:** accepted (#206). First slice only.

## Context
A decision model (a "System One" model) answers typed questions about an input with probabilities and writes no text. Google's Gemini Decisions API (`gemini-decision-1`, `POST /v1beta/decisions`) is one; TypeSafe's Jev is another. Two checks in the code use regexes that miss ordinary phrasing, shown by probing them: `isDipRequest` missed "Nifty is bleeding today, is this the bottom?" and three more; `scanForTradeActions` missed "It would be wise to pick up more shares of Laurus on weakness" and three more.

## Decision
- A small client (`src/lib/ai/decisions/client.ts`) for the yes/no question type, over plain REST with Zod-checked replies and an injectable `fetch`; no new dependency. A short timeout (4 s), because callers wait on it.
- **Gemini only.** It uses the user's own Gemini key (ADR 0018), so it is unavailable to Anthropic and OpenRouter users. Jev is not used: it is a separate paid vendor with its own key, which sits badly with the no-paid-tier rule.
- **A second opinion, never the only gate.** The model can add a flag and cannot remove one the regex raised. If the call is unavailable, refused, slow or malformed, the result is the regex alone, exactly as before; refusals and failures are logged as a warning (`ai:decisions`) with no input text, key or provider error body.
- Used in three places: the Advisor chat dip detector (regex first, no call when it hits), the agent synthesis (a draft the regex passes but the model flags is regenerated, as for a regex hit), and the Advisor memo (a memo that is grounded but reads as advice goes to the existing repair attempt, and is rejected if it still does).
- Thresholds are named constants (`DIP_THRESHOLD` 0.7, `TRADE_ADVICE_THRESHOLD` 0.8) and are **not calibrated**: nothing has been run against a real key. Both are deliberately high until they are.

## Consequences
- Dip and advice detection improves for Gemini users and is unchanged for everyone else.
- Each Advisor chat message that the regex misses costs one small call; the memo and synthesis cost one more call each. Output tokens are free; input is billed. Context caching and the Batch API are not supported by the model.
- A false positive on the memo can reject a good memo after the repair attempt; this is the thing to watch once a key is available.
- Deliberately not done here, each needing its own labelled evaluation: replacing the VADER headline sentiment, materiality gating for the Analyst Desk, prompt-injection screens on filing text, and cost routing.
