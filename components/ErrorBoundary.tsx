import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full bg-white rounded-2xl p-6 shadow-xl border border-slate-200 text-center">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">界面加载遇到异常</h2>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              组件渲染时发生意外错误，可能是由于浏览器沙箱限制或状态异常导致。
            </p>
            {this.state.error && (
              <div className="bg-slate-100 p-3 rounded-lg text-left text-xs text-slate-700 font-mono mb-4 overflow-x-auto max-h-32">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                重置组件
              </button>
              <button
                onClick={this.handleReload}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition-colors shadow-md shadow-teal-600/20 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> 刷新页面
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
