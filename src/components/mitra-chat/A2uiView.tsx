'use client';

import { Component, useMemo, type ReactNode } from 'react';
import { MessageProcessor } from '@a2ui/web_core';
import { A2uiSurface } from '@a2ui/react';
import { chatCatalog } from './chatCatalog';
import styles from './A2uiView.module.css';

interface A2uiViewProps {
  /** A2UI v1.0 messages built by our own server tools (never by the model). */
  readonly messages: readonly unknown[];
  /** A button on the card was pressed: the event's name and context. Cards without buttons never call it. */
  readonly onAction?: (name: string, context: Record<string, unknown>) => void;
}

/** A card that cannot be drawn must never take the chat down with it: render nothing and let the text reply stand. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function surfacesFor(messages: readonly unknown[], onAction: (name: string, context: Record<string, unknown>) => void) {
  try {
    const processor = new MessageProcessor([chatCatalog as never], (action) => onAction(action.name, action.context));
    processor.processMessages(messages as never);
    return Array.from(processor.model.surfacesMap.values());
  } catch {
    return [];
  }
}

export default function A2uiView({ messages, onAction }: A2uiViewProps) {
  // The card is stateless, so rebuilding it when the handler changes (when a reply starts or ends) costs nothing visible.
  const surfaces = useMemo(() => surfacesFor(messages, (name, context) => onAction?.(name, context)), [messages, onAction]);
  if (surfaces.length === 0) return null;
  return (
    <Quiet>
      <div className={styles.surface}>
        {surfaces.map((surface) => (
          <A2uiSurface key={surface.id} surface={surface as never} />
        ))}
      </div>
    </Quiet>
  );
}
