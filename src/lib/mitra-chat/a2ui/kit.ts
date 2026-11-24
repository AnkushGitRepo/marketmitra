// Small helpers shared by the A2UI card builders (#326, #329). Pure.

/** The basic catalog's id (A2UI v1.0); a test checks it against `@a2ui/web_core`. */
export const BASIC_CATALOG_ID = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';
export const UNAVAILABLE = 'n/a';

export type A2uiMessage = Readonly<Record<string, unknown>>;
export type Component = Readonly<Record<string, unknown>>;

export const text = (id: string, value: string, variant: 'body' | 'caption' = 'body', weight?: number): Component => ({
  id,
  component: 'Text',
  text: value,
  variant,
  ...(weight ? { weight } : {}),
});
export const column = (id: string, children: readonly string[]): Component => ({ id, component: 'Column', children });
export const row = (id: string, children: readonly string[]): Component => ({ id, component: 'Row', children });
export const divider = (id: string): Component => ({ id, component: 'Divider' });

/** One surface: create it, then fill it. The component with id `root` is the card. */
export function surfaceMessages(surfaceId: string, components: readonly Component[]): A2uiMessage[] {
  return [
    { version: '1.0', createSurface: { surfaceId, catalogId: BASIC_CATALOG_ID } },
    { version: '1.0', updateComponents: { surfaceId, components } },
  ];
}

/** One line of text, cut to `max` characters. For model- or news-derived strings, which are shown as plain text and never as markup. */
export function clip(value: string, max: number): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
