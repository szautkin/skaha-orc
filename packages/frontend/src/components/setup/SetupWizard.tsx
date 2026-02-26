import { Terminal, CheckCircle, AlertTriangle, XCircle, RefreshCw, Loader2 } from 'lucide-react';
import type { PreflightResult, PreflightCheck } from '@skaha-orc/shared';

interface SetupWizardProps {
  result: PreflightResult;
  onDismiss: () => void;
  onRecheck: () => void;
  isRechecking: boolean;
}

const statusIcon: Record<PreflightCheck['status'], React.ReactNode> = {
  ok: <CheckCircle className="w-5 h-5 text-success-green flex-shrink-0" />,
  warn: <AlertTriangle className="w-5 h-5 text-buttercup-yellow flex-shrink-0" />,
  fail: <XCircle className="w-5 h-5 text-tall-poppy-red flex-shrink-0" />,
};

export function SetupWizard({ result, onDismiss, onRecheck, isRechecking }: SetupWizardProps) {
  return (
    <div className="flex items-start justify-center h-full pt-12">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <Terminal className="w-5 h-5 text-congress-blue" />
          <h2 className="text-lg font-semibold text-gray-900">Platform Setup</h2>
        </div>

        {/* Checklist */}
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-neutral-gray mb-4">
            Some prerequisites are missing. Resolve the items below, then re-check.
          </p>

          {result.checks.map((check) => (
            <div key={check.id} className="flex items-start gap-3">
              {statusIcon[check.status]}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{check.label}</p>
                <p className="text-xs text-neutral-gray">{check.message}</p>
                {check.remedy && (
                  <p className="text-xs text-neutral-gray mt-0.5 italic">{check.remedy}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* CLI hint */}
        <div className="px-6 py-3 border-t border-gray-100">
          <p className="text-xs text-neutral-gray">
            Or run the interactive setup from your terminal:
          </p>
          <code className="block mt-1 text-xs bg-gray-50 text-gray-800 px-3 py-1.5 rounded font-mono">
            npm run setup
          </code>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 text-sm font-medium text-neutral-gray border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={onRecheck}
            disabled={isRechecking}
            className="flex items-center gap-1.5 bg-congress-blue text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-prussian-blue transition-colors disabled:opacity-50"
          >
            {isRechecking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Re-check
          </button>
        </div>
      </div>
    </div>
  );
}
