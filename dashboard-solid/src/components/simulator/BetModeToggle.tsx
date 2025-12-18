import { Component } from 'solid-js';
import { cn } from '../../lib/utils';
import type { BetMode } from '../../types';

interface BetModeToggleProps {
  mode: BetMode;
  onModeChange: (mode: BetMode) => void;
}

export const BetModeToggle: Component<BetModeToggleProps> = (props) => {
  return (
    <div class="flex rounded-lg overflow-hidden border border-border">
      <button
        class={cn(
          'flex-1 px-4 py-2 text-sm font-medium transition-colors',
          props.mode === 'single'
            ? 'bg-cyan text-bg-primary'
            : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
        )}
        onClick={() => props.onModeChange('single')}
      >
        Single
      </button>
      <button
        class={cn(
          'flex-1 px-4 py-2 text-sm font-medium transition-colors',
          props.mode === 'double'
            ? 'bg-cyan text-bg-primary'
            : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
        )}
        onClick={() => props.onModeChange('double')}
      >
        Double (2x+)
      </button>
    </div>
  );
};
