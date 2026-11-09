import React from 'react';
import { RefreshCw } from 'lucide-react';

interface SelfHealingBoundaryProps {
  moduleId: string;
  moduleName: string;
  children: React.ReactNode;
  onDisableModule?: (id: string) => void;
}

interface SelfHealingBoundaryState {
  hasError: boolean;
  errorMsg: string;
  healCount: number;
}

export class SelfHealingBoundary extends React.Component<
  SelfHealingBoundaryProps,
  SelfHealingBoundaryState
> {
  constructor(props: SelfHealingBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMsg: '', healCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<SelfHealingBoundaryState> {
    return { hasError: true, errorMsg: error?.message || 'Undefined template state' };
  }

  componentDidCatch(error: Error) {
    console.warn(`[Self-Healing Engine] Auto-recovered module "${this.props.moduleId}":`, error);
  }

  handleSelfHeal = () => {
    this.setState((prev) => ({
      hasError: false,
      errorMsg: '',
      healCount: prev.healCount + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
            <div>
              <h4 className="text-xs font-black text-slate-900 dark:text-white">
                Self-Healing Module: {this.props.moduleName}
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Isolated module recovered safely ({this.state.errorMsg}). Other modules are unaffected.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={this.handleSelfHeal}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-black cursor-pointer"
            >
              🔧 Auto-Heal Now
            </button>
            {this.props.onDisableModule && (
              <button
                type="button"
                onClick={() => this.props.onDisableModule?.(this.props.moduleId)}
                className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                Disable Template
              </button>
            )}
          </div>
        </div>
      );
    }
    return <React.Fragment key={this.state.healCount}>{this.props.children}</React.Fragment>;
  }
}

/**
 * 2. MODULAR TEMPLATE CONFIG & UNDEFINED TEMPLATE ENABLE/DISABLE SYSTEM
 */
