# 0079 — Eleven AI providers behind one catalogue

Status: accepted (2026-11-24, issue #332; the maintainer asked for the ten most used providers, then added Sarvam AI and Latest / Free / Other model groups).

## Context

Bring-your-own-key AI supported three providers (Gemini, Anthropic, OpenRouter) with 4 or 5 hand-picked models each. The provider list was repeated in nine
places (type, route enum, env fallback, two forms, openapi, attachment support, tests), and the settings code imported the provider SDKs into the browser
bundle. Model IDs also change faster than the file did: several in the old list had already been replaced.

## Decision

- **One catalogue**, `src/lib/ai/providerCatalog.ts`: plain data (no SDK imports) holding each provider's label, SDK kind, fixed base URL, default model,
  key link and hint, whether its models read images and PDFs, and its models tagged `latest`, `free` or `other`. The type, the route's Zod enum, the env
  fallback, both forms, `resolveModel` and the attachment check all read it; a test compares `public/openapi.json` with it.
- **Eight new providers**: OpenAI (`@ai-sdk/openai`), and Groq, Mistral, DeepSeek, xAI, Together AI, Cerebras and Sarvam AI through one `@ai-sdk/openai-compatible`
  dependency, each with a base URL fixed in the catalogue (never user-supplied, so a key cannot be sent to an arbitrary host).
- **Model groups** in both dropdowns: Latest, Free (a $0 model or a free tier), Other, then "Other (type an ID)". Existing saved keys and model IDs are
  unchanged.
- **Images and PDFs** are offered only for providers marked `files`; elsewhere the attachment is refused with a clear message instead of failing at the provider.
- **Not done here:** a live model list from each provider's `/models` (issue #333), per-model tool-support warnings, and Gemini-style search grounding for the
  new providers (Gemini keeps it).

## Consequences

- Model IDs were taken from each provider's docs and OpenRouter's public list on 2026-11-24; those I could not confirm (the Mistral `-latest` aliases,
  the Gemini free-tier labels, and every provider's real behaviour with a live key beyond the ones tested) are marked in the PR. A wrong ID shows up as
  a failed "Test & save", which is why the live list in #333 matters.
- Adding a provider is one catalogue entry plus an openapi enum line; the tests fail if the two disagree.
- Providers' structured-output and tool-call support varies; briefs already recover malformed JSON and Mitra's tools degrade to plain text, but weaker models
  will answer worse.

## Not added

AI Fiesta (aifiesta.ai) was also requested. It is a consumer subscription app that bundles other companies' models; its site shows no public API, API keys
or OpenAI-style endpoint, so there is nothing for a user to bring a key to. If it publishes one, it is a single catalogue entry.
