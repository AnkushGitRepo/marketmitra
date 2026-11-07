# Mitra Assistant

Mitra is the chat assistant in the bottom-right of every dashboard page. It answers questions from your portfolio, live market data and an indexed corpus of news and filings — and, within strict limits, it can *do* things for you.

## Setting it up

Mitra runs on **your own AI key** — MarketMitra charges nothing and never uses an operator key in hosted mode.

1. Open **Settings → AI provider key**.
2. Choose Google Gemini, Anthropic or OpenRouter, paste your key, and press **Test & save**.
3. The key is stored encrypted (AES-256-GCM) and is never returned to the browser again.

Self-hosters may instead set `AI_PROVIDER` / `AI_API_KEY` in the environment as a fallback.

## What you can ask

- **Facts and background:** "How did my portfolio do today?", "Why did TCS move?", "Any news on my holdings?" — answered from live data and retrieved news/filings, with the source named.
- **Navigation:** "Open the portfolio", "Show me Infosys."
- **Screening:** "Find me growth stocks I should look into." See below.
- **Alerts:** "Put a trailing stop on RELIANCE." Mitra can create, adjust, pause and resume alerts.
- **Portfolio import:** attach a broker screenshot or export with the **+** button; you review the proposed changes before anything is saved.

## Screening with Mitra

You describe a need; Mitra turns it into filters, opens the Screener with them applied, and suggests companies to look at.

1. It maps your request to criteria — for "growth stocks": 3-year sales and profit growth of roughly 15–20 % or more, plus a healthy ROE and low debt so the growth is profitable and not debt-funded, and a size floor to skip micro-caps.
2. It checks exact sector/industry names if needed, and **tunes** the screen (loosening if nothing matches, tightening if hundreds do).
3. It opens the Screener once with the final filters and lists the top matches with their key numbers and how many matched in total.
4. You can keep refining in the same conversation — "only healthcare", "make them bigger" — and the open Screener updates in place.

Mitra states its assumptions and offers to adjust them. It asks a clarifying question only when the answer would change the screen a lot.

**What it will not do:** predict which stocks will grow, or tell you what to buy. A screen uses past data, so Mitra frames results as *candidates worth researching* and says so. Ask "which stock will double?" and it will decline and offer to screen on criteria instead.

## What Mitra is allowed to do

| Can | Cannot |
| --- | --- |
| Read market data, news, filings, your holdings and notes | Change settings, security or billing |
| Open pages and the Screener | Delete anything — there is no delete tool at all |
| Create, adjust, pause and resume **alerts** | Add, edit or remove holdings |
| Run screens and look up valid sector names | Give buy/sell/hold advice, price targets or predictions |

These limits are enforced by the tools that exist, not by prompt wording: a capability with no tool simply isn't available to Mitra ([ADR 0022](Decision-Records), [ADR 0030](Decision-Records)). Alert changes by Mitra use tighter numeric bounds than the Alerts page allows a human, require a plain-language reason, and are all listed on **Mitra activity**.

## Good to know

- A reply can take 20–30 seconds when Mitra makes several tool calls (lookup, tune, open, answer).
- The conversation survives navigation while the panel is open; **Clear** wipes it.
- Every answer ends with the standard line: *"This is a synthesis of public data, not investment advice."*
- If Mitra says it can't answer, check that your key is valid — see [Troubleshooting](Troubleshooting).

## For developers

Mitra's toolset lives in `src/lib/ai/chatTools.ts` and the public-data tools in `src/lib/mcp/tools.ts` (shared with the MCP server). The screening playbook is `SCREENER_PLAYBOOK` in `src/lib/ai/prompts.ts`. Design: [ADR 0020](Decision-Records), [0022](Decision-Records), [0030](Decision-Records), [0034](Decision-Records).
