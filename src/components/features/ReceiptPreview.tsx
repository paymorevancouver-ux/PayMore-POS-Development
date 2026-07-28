import type { SaleTransaction, SaleItem } from '@/types';
import { formatCurrency, formatDateTime } from '@/lib/taxCalc';
import { STORES } from '@/constants/mockData';

interface ReceiptPreviewProps {
  sale: SaleTransaction;
  saleItems: SaleItem[];
  onPrint: () => void;
}

export default function ReceiptPreview({ sale, saleItems, onPrint }: ReceiptPreviewProps) {
  const store = STORES.find((s) => s.id === sale.storeId);

  return (
    <div>
      <div id="print-area" className="bg-white text-foreground p-6 rounded-lg border border-border font-mono text-[13px] max-w-sm mx-auto">
        <div className="text-center mb-4">
          <p className="font-bold text-base">PAYMORE</p>
          <p className="text-[11px] text-muted-foreground">{store?.address}</p>
          <p className="text-[11px] text-muted-foreground">Tel: {store?.phone}</p>
          <p className="text-[11px] text-muted-foreground">GST Number: {store?.gstNumber}</p>
          <div className="border-t border-dashed border-border mt-3 pt-2">
            <p className="font-bold">SALES RECEIPT</p>
            <p className="text-[11px]">{sale.saleCode}</p>
            <p className="text-[11px] text-muted-foreground">{formatDateTime(sale.completedAt || sale.createdAt)}</p>
          </div>
        </div>

        <div className="border-t border-dashed border-border py-2 space-y-1.5">
          {saleItems.map((line) => (
            <div key={line.id} className="flex justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="truncate text-[12px]">{line.brand} {line.model}</p>
                {line.quantity > 1 && <p className="text-[10px] text-muted-foreground">{line.quantity} × {formatCurrency(line.unitPrice)}</p>}
              </div>
              <span className="tabular-nums whitespace-nowrap">{formatCurrency(line.lineTotal)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-border pt-2 space-y-1">
          <div className="flex justify-between text-[12px]"><span>Subtotal</span><span className="tabular-nums">{formatCurrency(sale.subtotal)}</span></div>
          <div className="flex justify-between text-[12px]"><span>GST (5%)</span><span className="tabular-nums">{formatCurrency(sale.gstTotal)}</span></div>
          <div className="flex justify-between text-[12px]"><span>PST (7%)</span><span className="tabular-nums">{formatCurrency(sale.pstTotal)}</span></div>
          <div className="flex justify-between font-bold text-sm pt-1 border-t border-border"><span>TOTAL</span><span className="tabular-nums">{formatCurrency(sale.totalAmount)}</span></div>
        </div>

        <div className="border-t border-dashed border-border mt-3 pt-3 text-center">
          <p className="text-[10px] text-muted-foreground">Thank you for choosing PayMore!</p>
          <p className="text-[10px] text-muted-foreground">Returns accepted within 14 days with receipt.</p>
        </div>
      </div>

      <div className="flex justify-center mt-4">
        <button onClick={onPrint} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer">
          Print Receipt
        </button>
      </div>
    </div>
  );
}
