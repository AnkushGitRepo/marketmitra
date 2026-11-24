'use client';

import { Component, useMemo, type ReactNode } from 'react';
import { MessageProcessor } from '@a2ui/web_core';
import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1';
import { A2uiSurface } from '@a2ui/react';
import styles from './A2uiView.module.css';

interface A2uiViewProps {
  /** A2UI v1.0 messages built by our own server tools (never by the model). */
  readonly messages: readonly unknown[];
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

function surfacesFor(messages: readonly unknown[]) {
  try {
    const processor = new MessageProcessor([basicCatalog]);
    processor.processMessages(messages as never);
    return Array.from(processor.model.surfacesMap.values());
  } catch {
    return [];
  }
}

export default function A2uiView({ messages }: A2uiViewProps) {
  const surfaces = useMemo(() => surfacesFor(messages), [messages]);
  if (surfaces.length === 0) return null;
  return (
    <Quiet>
      <div className={styles.surface}>
        {surfaces.map((surface) => (
          <A2uiSurface key={surface.id} surface={surface} />
        ))}
      </div>
    </Quiet>
  );
}
