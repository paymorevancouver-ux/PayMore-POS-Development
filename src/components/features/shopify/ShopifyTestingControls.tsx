import type { ShopifyTestResult } from '@/types/shopify';

const STATES: { value: ShopifyTestResult; label: string; active: string }[] = [
  { value: 'pass', label: 'Pass', active: 'bg-emerald-600 text-white border-emerald-600' },
  { value: 'fail', label: 'Fail', active: 'bg-red-600 text-white border-red-600' },
  { value: 'not-tested', label: 'Not Tested', active: 'bg-slate-600 text-white border-slate-600' },
  { value: 'not-applicable', label: 'N/A', active: 'bg-stone-500 text-white border-stone-500' },
];

export default function ShopifyTestingControls({
  tests,
  results,
  onChange,
}: {
  tests: Array<{ id: string; label: string }>;
  results: Record<string, ShopifyTestResult>;
  onChange: (next: Record<string, ShopifyTestResult>) => void;
}) {
  return (
    <div className="space-y-1.5">
      {tests.map((test) => {
        const current = results[test.id] || 'not-tested';
        return (
          <div key={test.id} className="flex items-center justify-between gap-2">
            <span className="text-[12px]">{test.label}</span>
            <div className="flex gap-1">
              {STATES.map((state) => (
                <button
                  key={state.value}
                  type="button"
                  onClick={() => onChange({ ...results, [test.id]: state.value })}
                  className={`h-7 px-2 rounded-md text-[10px] font-semibold border ${
                    current === state.value ? state.active : 'bg-background text-muted-foreground border-border'
                  }`}
                >
                  {state.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
