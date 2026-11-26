import { Catalog } from '@a2ui/web_core';
import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1';

/**
 * The basic catalog with one change: a Button whose action reaches the chat.
 *
 * The library's Button calls `props.action()`, a function its binder builds by inspecting the action's Zod schema. This repo runs the
 * A2UI packages on Zod 4 (ADR 0077), the binder does not recognise the action there, `props.action` stays the plain object
 * `{ event: { name, context } }`, and a click throws "props.action is not a function". This subclass turns that object into the call it
 * stands for (dispatching it through the component's own context) and then lets the library draw the button as before.
 */
const base = basicCatalog.components.get('Button') as { name: string; schema: unknown; element: new () => unknown } | undefined;

interface ButtonElement {
  render(): unknown;
  controller?: { props?: Record<string, unknown> };
  context: { dispatchAction(action: Record<string, unknown>): Promise<void> };
}

const TAG = 'a2ui-chat-button';

function chatButton() {
  if (!base) return null;
  const Base = base.element as unknown as new () => ButtonElement & HTMLElement;
  class ChatButtonElement extends Base {
    static tagName = TAG;
    render(): unknown {
      const props = this.controller?.props;
      const raw = props?.action;
      if (props && raw && typeof raw === 'object') {
        try {
          props.action = () => void this.context.dispatchAction(raw as Record<string, unknown>);
        } catch {
          // props are read-only in this build: the button then stays as the library draws it.
        }
      }
      return super.render();
    }
  }
  if (typeof customElements !== 'undefined' && !customElements.get(TAG)) customElements.define(TAG, ChatButtonElement);
  return { name: base.name, schema: base.schema, tagName: TAG, element: ChatButtonElement };
}

const replacement = chatButton();
const others = [...basicCatalog.components.values()].filter((c) => c.name !== 'Button');

export const chatCatalog = new Catalog(
  basicCatalog.id,
  basicCatalog.protocolVersion,
  [...others, ...(replacement ? [replacement] : [])] as never,
  [...basicCatalog.functions.values()] as never
);
