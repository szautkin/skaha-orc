import type { ReadinessLevel } from '@skaha-orc/shared';

const styles: Record<ReadinessLevel, string> = {
  healthy: 'bg-success-green',
  deployed: 'ring-2 ring-success-green bg-transparent',
  warnings: 'bg-buttercup-yellow animate-pulse',
  blocked: 'bg-tall-poppy-red',
  idle: 'bg-gray-300',
  testing: 'bg-congress-blue animate-pulse',
  failed: 'bg-tall-poppy-red',
};

interface ReadinessDotProps {
  level: ReadinessLevel;
  tooltip?: string;
}

export function ReadinessDot({ level, tooltip }: ReadinessDotProps) {
  return (
    <span
      className={`w-2.5 h-2.5 rounded-full inline-block ${styles[level]}`}
      title={tooltip}
    />
  );
}
