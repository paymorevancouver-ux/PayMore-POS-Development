import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MapPin, Package, ArrowRight, AlertCircle } from 'lucide-react';
import type { InventoryItem } from '@/types';

interface LocationAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem | null;
  mode?: 'assign' | 'move';
  onSave: (location: string, rack: string, row: string, notes: string) => void;
}

const RACKS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9'];
const ROW_TYPES = [
  { value: 'R', label: 'Row (R)', desc: 'Standard pickable row' },
  { value: 'B', label: 'Bin (B)', desc: 'Storage bin' },
];
const ROW_NUMBERS = Array.from({ length: 10 }, (_, i) => i + 1);

export default function LocationAssignmentDialog({
  open, onOpenChange, item, mode = 'assign', onSave,
}: LocationAssignmentDialogProps) {
  const [rack, setRack] = useState('R1');
  const [rowType, setRowType] = useState('R');
  const [rowNumber, setRowNumber] = useState('1');
  const [notes, setNotes] = useState('');

  // Pre-fill from existing location when opening in move mode
  useEffect(() => {
    if (!open) return;
    if (item?.storageLocation && mode === 'move') {
      // Support legacy SR (Shelf Row) codes and new B (Bin) codes
      const m = item.storageLocation.match(/^(R\d+)-(SR|B|R)(\d+)$/);
      if (m) {
        setRack(m[1]);
        // Auto-migrate legacy SR values to B on display
        setRowType(m[2] === 'SR' ? 'B' : m[2]);
        setRowNumber(m[3]);
      }
      setNotes('');
    } else {
      setRack('R1');
      setRowType('R');
      setRowNumber('1');
      setNotes('');
    }
  }, [open, item, mode]);

  if (!item) return null;

  const row = `${rowType}${rowNumber}`;
  const locationCode = `${rack}-${row}`;
  const oldLocation = item.storageLocation;
  const isMove = mode === 'move' && !!oldLocation;
  const isSameAsCurrent = isMove && oldLocation === locationCode;

  const handleSave = () => {
    onSave(locationCode, rack, row, notes);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <MapPin className="size-5 text-primary" />
            {isMove ? 'Move Storage Location' : 'Assign Storage Location'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Item Info */}
          <div className="bg-secondary/40 rounded-lg p-3">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
              <Package className="size-3.5" />
              <span className="font-mono font-semibold">{item.deviceCode}</span>
            </div>
            <p className="text-[13px] font-semibold leading-tight">{item.brand} {item.model}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{item.category}{item.serialImei ? ` · ${item.serialImei}` : ''}</p>
          </div>

          {/* Workflow notice */}
          {!isMove && (
            <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <AlertCircle className="size-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-800 leading-snug">
                <span className="font-semibold">Required:</span> Select a storage location before this item can be moved to Live Products.
              </p>
            </div>
          )}

          {/* Current → New */}
          {isMove && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg flex-wrap">
              <span className="text-[10px] text-amber-700 font-medium">From</span>
              <Badge variant="outline" className="text-[10px] font-mono bg-white">{oldLocation}</Badge>
              <ArrowRight className="size-3 text-amber-600" />
              <span className="text-[10px] text-amber-700 font-medium">To</span>
              <Badge className="text-[10px] font-mono bg-amber-600 text-white border-0">{locationCode}</Badge>
            </div>
          )}

          {/* Rack Selector */}
          <div>
            <Label className="text-[11px] font-medium">Rack *</Label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {RACKS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRack(r)}
                  className={`px-3 py-2.5 rounded-lg border-2 font-mono text-[13px] font-bold transition-all cursor-pointer ${
                    rack === r
                      ? 'border-primary bg-primary text-white shadow-sm'
                      : 'border-border bg-secondary/30 text-foreground hover:border-primary/40'
                  }`}
                >
                  Rack {r.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Row Type + Row Number */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-medium">Row Type *</Label>
              <Select value={rowType} onValueChange={setRowType}>
                <SelectTrigger className="mt-1 h-10 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROW_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      <div>
                        <div className="font-medium">{t.label}</div>
                        <div className="text-[9px] text-muted-foreground">{t.desc}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium">{rowType === 'B' ? 'Bin Number *' : 'Row Number *'}</Label>
              <Select value={rowNumber} onValueChange={setRowNumber}>
                <SelectTrigger className="mt-1 h-10 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROW_NUMBERS.map(n => (
                    <SelectItem key={n} value={String(n)}>
                      {rowType === 'B' ? `Bin ${n}` : `Row ${n}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Live Preview */}
          <div className="px-4 py-3 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg border border-primary/20">
            <p className="text-[9px] text-muted-foreground uppercase font-semibold tracking-wider mb-1">Location Code</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-primary leading-none">{locationCode}</p>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Rack {rack.slice(1)} · {rowType === 'B' ? `Bin ${rowNumber}` : `Row ${rowNumber}`}
            </p>
          </div>

          {/* Notes for move */}
          {isMove && (
            <div>
              <Label className="text-[11px] font-medium">Reason / Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why is this item being moved?"
                className="mt-1 text-[12px] min-h-[60px]"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button onClick={handleSave} disabled={isSameAsCurrent} className="flex-1 h-10 text-[13px]">
              <MapPin className="size-4 mr-1.5" />
              {isMove ? `Move to ${locationCode}` : `Save & Continue to Label`}
            </Button>
            <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
