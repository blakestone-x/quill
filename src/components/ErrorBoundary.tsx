import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Top-level error boundary: a render crash now shows a recoverable panel
// instead of a blank white window, and notes stay safe on disk. (Build
// directive M0.)
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Quill render error:', error, info.componentStack);
  }

  private handleReload = (): void => {
    this.setState({ error: null });
    if (typeof window !== 'undefined') window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#13100d] p-8 text-center">
        <div className="text-sm font-medium text-[#dcb05a]">Quill hit a snag</div>
        <pre className="max-w-lg overflow-auto whitespace-pre-wrap rounded border border-white/10 bg-black/30 p-3 text-left text-xs text-white/70">
          {error.message}
        </pre>
        <button
          onClick={this.handleReload}
          className="rounded bg-[#dcb05a] px-3 py-1.5 text-xs font-medium text-black hover:bg-[#e6bd6b]"
        >
          Reload
        </button>
        <div className="text-[11px] text-white/40">Your notes are safe on disk.</div>
      </div>
    );
  }
}
