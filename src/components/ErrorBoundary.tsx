"use client";

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-10 text-center bg-white rounded-xl border border-red-100">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <p className="font-semibold text-slate-700">Something went wrong rendering this view.</p>
          <p className="text-xs text-slate-400 font-mono max-w-md">{this.state.error?.message}</p>
          <button
            onClick={this.reset}
            className="mt-2 px-4 py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
