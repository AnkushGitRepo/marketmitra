'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  /** Rendered instead of the chart if anything under it throws while rendering. */
  readonly fallback: (reset: () => void) => ReactNode;
  readonly children: ReactNode;
}

/** A chart exception must never blank the stock page. */
export class ChartErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  reset = () => this.setState({ failed: false });

  render() {
    return this.state.failed ? this.props.fallback(this.reset) : this.props.children;
  }
}
