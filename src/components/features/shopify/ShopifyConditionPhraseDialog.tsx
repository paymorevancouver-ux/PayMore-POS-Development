import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ConditionPhraseOption } from '@/config/shopifyConditionPhrases';

export default function ShopifyConditionPhraseDialog<K extends string>({
  open,
  title,
  options,
  value,
  extraNotes,
  phraseText,
  onOpenChange,
  onChange,
  onNotesChange,
  footer,
}: {
  open: boolean;
  title: string;
  options: ConditionPhraseOption<K>[];
  value: string;
  extraNotes: string;
  phraseText: string;
  onOpenChange: (open: boolean) => void;
  onChange: (key: K) => void;
  onNotesChange: (notes: string) => void;
  footer?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] font-medium">Condition?</p>
        <div className="space-y-2">
          {options.map((option) => (
            <label
              key={option.key}
              className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer ${value === option.key ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              <input
                type="radio"
                name={title}
                checked={value === option.key}
                onChange={() => onChange(option.key)}
                className="mt-1 accent-primary"
              />
              <span>
                <span className="block text-[13px] font-semibold">{option.label}</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">{option.summary}</span>
              </span>
            </label>
          ))}
        </div>
        {footer}
        <div>
          <p className="text-[12px] font-semibold mb-1">Phrase Text:</p>
          <p className="text-[12px] rounded-md border bg-muted/40 p-3 leading-relaxed">{phraseText || 'Select a condition to generate the phrase.'}</p>
          <textarea
            value={extraNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            className="mt-2 w-full min-h-[72px] rounded-md border bg-background px-3 py-2 text-[12px]"
            placeholder="Optional listing-specific details, e.g. Small scratch near the rear USB port."
          />
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
