import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Printer, Download, Package, MapPin, CheckCircle2, Tag, RefreshCw, Loader2, AlertCircle,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { usePosStore } from '@/stores/posStore';
import { useToast } from '@/hooks/use-toast';
import {
  buildProductCode, buildDescription, generateBarcodeSvg,
  printLabels, downloadLabelsPdf,
} from '@/lib/barcode';
import { formatDateTime } from '@/lib/taxCalc';
import type { InventoryItem } from '@/types';

interface BarcodeLabelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem | null;
  /** If true, generating a label will also mark item as 'listed' (workflow context) */
  markAsListedOnGenerate?: boolean;
  /** Called after label is successfully generated */
  onGenerated?: () => void;
}

export default function BarcodeLabelDialog({
  open, onOpenChange, item, markAsListedOnGenerate, onGenerated,
}: BarcodeLabelDialogProps) {
  const { employee } = useAuthStore();
  const pos = usePosStore();
  const { toast } = useToast();
  const [includeLocation, setIncludeLocation] = useState(true);
  const [barcodeSvg, setBarcodeSvg] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Always work with the latest version of the item from the store
  const currentItem = item ? pos.inventory.find((i) => i.id === item.id) || item : null;
  const productCode = currentItem ? buildProductCode(currentItem, includeLocation) : '';
  const description = currentItem ? buildDescription(currentItem, 42) : '';
  const isGenerated = !!currentItem?.labelGenerated;
  const requiresGenerate = markAsListedOnGenerate && !isGenerated;

  // Generate preview barcode whenever code changes
  useEffect(() => {
    let cancelled = false;
    if (!productCode) {
      setBarcodeSvg('');
      return;
    }
    (async () => {
      const svg = await generateBarcodeSvg(productCode, { width: 1.8, height: 50 });
      if (!cancelled) setBarcodeSvg(svg);
    })();
    return () => { cancelled = true; };
  }, [productCode]);

  // Reset includeLocation on open
  useEffect(() => {
    if (open) setIncludeLocation(true);
  }, [open]);

  if (!currentItem || !employee) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await pos.generateInventoryLabel(currentItem.id, employee.id, employee.fullName);
      if (markAsListedOnGenerate && currentItem.status === 'available') {
        await pos.updateInventoryItem(currentItem.id, { status: 'listed' });
        pos.logAction(employee.id, employee.fullName, 'Inventory', 'MARK_AVAILABLE', 'inventory', currentItem.id,
          `${currentItem.brand} ${currentItem.model} (${currentItem.deviceCode}) — moved to Live Products at ${currentItem.storageLocation || 'N/A'}`);
        toast({ title: 'Label generated & item is now Live', description: currentItem.deviceCode });
      } else {
        toast({ title: 'Label generated', description: currentItem.deviceCode });
      }
      if (onGenerated) onGenerated();
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      await printLabels([currentItem], { appendLocation: includeLocation });
      await pos.recordInventoryLabelPrint(currentItem.id, employee.id, employee.fullName);
      toast({ title: 'Print job sent', description: currentItem.deviceCode });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadPdf = async () => {
    setIsDownloading(true);
    try {
      await downloadLabelsPdf([currentItem], { appendLocation: includeLocation });
      toast({ title: 'PDF downloaded', description: `label-${currentItem.deviceCode}.pdf` });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRegenerate = async () => {
    setIsGenerating(true);
    try {
      await pos.generateInventoryLabel(currentItem.id, employee.id, employee.fullName);
      toast({ title: 'Label regenerated' });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => requiresGenerate && e.preventDefault()}
        onEscapeKeyDown={(e) => requiresGenerate && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Tag className="size-5 text-primary" />
            {requiresGenerate ? 'Generate Label to Continue' : 'Product Label'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          {/* Item Info */}
          <div className="bg-secondary/40 rounded-lg p-3 flex items-start gap-3">
            <Package className="size-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate">{currentItem.brand} {currentItem.model}</p>
              <p className="text-[10px] text-muted-foreground truncate">{currentItem.category}</p>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <Badge variant="outline" className="text-[9px] font-mono">{currentItem.deviceCode}</Badge>
                {currentItem.storageLocation && (
                  <Badge variant="outline" className="text-[9px] font-mono bg-blue-50 text-blue-700 border-blue-200">
                    <MapPin className="size-2.5 mr-0.5" />{currentItem.storageLocation}
                  </Badge>
                )}
                {isGenerated && (
                  <Badge className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="size-2.5 mr-0.5" />Generated
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Label Preview — White bg, Black text, 2:1 ratio */}
          <div>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1.5">Label Preview (2 × 1 in)</p>
            <div
              className="border-2 border-dashed border-border rounded-lg bg-white shadow-sm"
              style={{ aspectRatio: '2 / 1' }}
            >
              <div className="h-full flex flex-col items-center justify-center text-black px-2 py-1">
                {/* Line 1: Product Code (large bold) */}
                <p className="font-black font-mono leading-none tracking-wider text-center truncate w-full"
                   style={{ fontSize: 'clamp(11px, 3.5vw, 18px)' }}>
                  {productCode}
                </p>
                {/* Line 2: Code128 Barcode */}
                <div className="w-[94%] h-[42%] my-1 flex items-center justify-center">
                  {barcodeSvg ? (
                    <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
                  ) : (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {/* Line 3: Description (small) */}
                <p className="leading-none truncate w-full text-center"
                   style={{ fontSize: 'clamp(7px, 1.6vw, 9px)' }}>
                  {description}
                </p>
              </div>
            </div>
          </div>

          {/* Include Location Toggle */}
          {currentItem.storageLocation && (
            <label className="flex items-center gap-2 cursor-pointer px-1">
              <input
                type="checkbox"
                checked={includeLocation}
                onChange={(e) => setIncludeLocation(e.target.checked)}
                className="rounded cursor-pointer"
              />
              <span className="text-[11px] text-muted-foreground">
                Append storage location to product code
              </span>
            </label>
          )}

          {/* Print History */}
          {isGenerated && (
            <div className="bg-secondary/40 rounded-lg px-3 py-2 grid grid-cols-3 gap-2 text-[10px]">
              <div>
                <p className="text-muted-foreground uppercase font-semibold mb-0.5">Print Count</p>
                <p className="font-mono font-bold text-[12px]">{currentItem.labelPrintCount}<span className="text-[9px] text-muted-foreground ml-0.5">×</span></p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground uppercase font-semibold mb-0.5">Last Printed</p>
                <p className="font-medium text-[10px]">{currentItem.lastLabelPrintAt ? formatDateTime(currentItem.lastLabelPrintAt) : 'Never'}</p>
                {currentItem.lastLabelPrintBy && (
                  <p className="text-muted-foreground text-[9px]">by {currentItem.lastLabelPrintBy}</p>
                )}
              </div>
              <div className="col-span-3">
                <p className="text-muted-foreground uppercase font-semibold mb-0.5">Generated</p>
                <p className="font-medium text-[10px]">
                  {currentItem.labelGeneratedAt ? formatDateTime(currentItem.labelGeneratedAt) : '—'}
                  {currentItem.labelGeneratedBy && <span className="ml-1 text-muted-foreground">by {currentItem.labelGeneratedBy}</span>}
                </p>
              </div>
            </div>
          )}

          {/* Workflow Required Notice */}
          {requiresGenerate && (
            <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <AlertCircle className="size-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-800 leading-snug">
                <span className="font-semibold">Required:</span> Generate the label to move this item to Live Products.
              </p>
            </div>
          )}

          {/* Actions */}
          {!isGenerated ? (
            <div className="flex gap-2 pt-1">
              <Button onClick={handleGenerate} disabled={isGenerating} className="flex-1 h-10 text-[13px]">
                {isGenerating ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Tag className="size-4 mr-1.5" />}
                Generate Label
              </Button>
              {!requiresGenerate && (
                <Button variant="ghost" className="h-10" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button onClick={handlePrint} disabled={isPrinting} className="h-10 text-[12px]">
                  {isPrinting ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Printer className="size-4 mr-1" />}
                  Print Label
                </Button>
                <Button onClick={handleDownloadPdf} disabled={isDownloading} variant="outline" className="h-10 text-[12px]">
                  {isDownloading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Download className="size-4 mr-1" />}
                  Download PDF
                </Button>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleRegenerate} disabled={isGenerating} variant="outline" className="flex-1 h-9 text-[11px]">
                  {isGenerating ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <RefreshCw className="size-3.5 mr-1" />}
                  Regenerate
                </Button>
                <Button variant="ghost" className="h-9 text-[11px]" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
