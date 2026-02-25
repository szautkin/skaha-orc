import { DeployWizard } from '@/components/deploy/DeployWizard';

export function DeployPage() {
  return (
    <div className="h-full flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-gray-900">Deploy All Services</h2>
      <p className="text-sm text-neutral-gray">
        Deploy services in topological order. Dependencies are resolved automatically.
      </p>
      <div className="flex-1 min-h-0">
        <DeployWizard />
      </div>
    </div>
  );
}
