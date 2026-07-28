import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Printer, X } from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/taxCalc';
import { STORES } from '@/constants/mockData';
import { useAuthStore } from '@/stores/authStore';
import type { Customer, SaleTransaction, SaleItem, TransactionPayment } from '@/types';

interface SalesInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: SaleTransaction | null;
  saleItems: SaleItem[];
  salePayments: TransactionPayment[];
  customer?: Customer | null;
  onPrint?: () => void;
}

const formatInvoiceDate = (iso: string) => {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const h12 = d.getHours() % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
  return `${mm}/${dd}/${yyyy} ${String(h12).padStart(2, '0')}:${min} ${ampm}`;
};

export default function SalesInvoiceDialog({
  open, onOpenChange, sale, saleItems, salePayments, customer, onPrint,
}: SalesInvoiceDialogProps) {
  if (!sale) return null;

  const store = STORES.find((s) => s.id === sale.storeId) || STORES[0];
  const emp = useAuthStore.getState().getEmployeeById(sale.employeeId);

  const handlePrint = () => {
    onPrint?.();
    setTimeout(() => {
      const printContent = document.getElementById('sales-invoice-print');
      if (!printContent) return;
      const win = window.open('', '_blank', 'width=800,height=600');
      if (!win) return;
      win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Sales Invoice — ${sale.saleCode}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; padding: 24px; color: #000; background: #fff; max-width: 800px; margin: 0 auto; }
            .inv-header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 12px; }
            .inv-header h1 { font-size: 20px; font-weight: bold; margin-bottom: 2px; }
            .inv-header p { font-size: 10px; color: #555; }
            .inv-meta { display: flex; justify-content: space-between; margin-bottom: 16px; }
            .inv-meta-col { font-size: 10px; }
            .inv-meta-col .label { font-weight: bold; display: inline-block; width: 80px; }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
            .items-table th { border-top: 2px solid #000; border-bottom: 2px solid #000; text-align: left; padding: 6px 8px; font-size: 10px; font-weight: bold; text-transform: uppercase; background: #f5f5f5; }
            .items-table td { padding: 5px 8px; font-size: 10px; border-bottom: 1px solid #ddd; }
            .items-table .text-right { text-align: right; }
            .items-table .text-center { text-align: center; }
            .totals-section { margin-left: auto; width: 260px; margin-bottom: 16px; }
            .totals-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px; }
            .totals-row.grand { border-top: 2px solid #000; padding-top: 6px; margin-top: 4px; font-size: 14px; font-weight: bold; }
            .payments-section { margin-bottom: 16px; }
            .payments-section h3 { font-size: 11px; font-weight: bold; margin-bottom: 6px; text-transform: uppercase; }
            .payment-row { display: flex; justify-content: space-between; padding: 3px 8px; font-size: 10px; background: #fafafa; margin-bottom: 2px; border-radius: 2px; }
            .inv-footer { text-align: center; border-top: 1px solid #ccc; padding-top: 12px; font-size: 9px; color: #777; }
            @media print {
              body { padding: 12px; }
              @page { margin: 10mm; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
          <script>window.onload = function(){ window.print(); window.onafterprint = function(){ window.close(); }; }<\/script>
        </body>
        </html>
      `);
      win.document.close();
    }, 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[15px]">Sales Invoice Preview</DialogTitle>
            <Badge variant="outline" className="text-[9px] font-mono">{sale.saleCode}</Badge>
          </div>
        </DialogHeader>

        <div className="px-5 pb-2 max-h-[70vh] overflow-y-auto">
          <div id="sales-invoice-print" className="bg-white border border-border rounded-lg p-6" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 16, borderBottom: '2px solid #000', paddingBottom: 12 }}>
              <h1 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 2, color: '#000' }}>SALES INVOICE</h1>
              <p style={{ fontSize: 13, fontWeight: 'bold', color: '#000' }}>{store.name}</p>
              <p style={{ fontSize: 10, color: '#555' }}>{store.address}</p>
              <p style={{ fontSize: 10, color: '#555' }}>{store.phone} · GST Number: {store.gstNumber}</p>
            </div>

            {/* Meta row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 10 }}>
                <div><span style={{ fontWeight: 'bold', display: 'inline-block', width: 80 }}>Invoice #:</span> {sale.saleCode}</div>
                <div><span style={{ fontWeight: 'bold', display: 'inline-block', width: 80 }}>Date:</span> {formatInvoiceDate(sale.completedAt || sale.createdAt)}</div>
                <div><span style={{ fontWeight: 'bold', display: 'inline-block', width: 80 }}>Cashier:</span> {emp?.fullName || '—'}</div>
                <div><span style={{ fontWeight: 'bold', display: 'inline-block', width: 80 }}>Channel:</span> {sale.salesChannel}</div>
              </div>
              <div style={{ fontSize: 10, textAlign: 'right' }}>
                {customer ? (
                  <>
                    <div style={{ fontWeight: 'bold', marginBottom: 2 }}>Customer</div>
                    <div>{customer.firstName} {customer.lastName}</div>
                    <div>{customer.phone}</div>
                    {customer.email && <div>{customer.email}</div>}
                  </>
                ) : (
                  <div style={{ color: '#999' }}>Walk-in Customer</div>
                )}
              </div>
            </div>

            {/* Items table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
              <thead>
                <tr>
                  <th style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000', textAlign: 'left', padding: '6px 8px', fontSize: 10, fontWeight: 'bold', background: '#f5f5f5' }}>#</th>
                  <th style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000', textAlign: 'left', padding: '6px 8px', fontSize: 10, fontWeight: 'bold', background: '#f5f5f5' }}>ITEM</th>
                  <th style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000', textAlign: 'left', padding: '6px 8px', fontSize: 10, fontWeight: 'bold', background: '#f5f5f5' }}>SERIAL/IMEI</th>
                  <th style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000', textAlign: 'center', padding: '6px 8px', fontSize: 10, fontWeight: 'bold', background: '#f5f5f5' }}>QTY</th>
                  <th style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000', textAlign: 'right', padding: '6px 8px', fontSize: 10, fontWeight: 'bold', background: '#f5f5f5' }}>UNIT PRICE</th>
                  <th style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000', textAlign: 'right', padding: '6px 8px', fontSize: 10, fontWeight: 'bold', background: '#f5f5f5' }}>TAX</th>
                  <th style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000', textAlign: 'right', padding: '6px 8px', fontSize: 10, fontWeight: 'bold', background: '#f5f5f5' }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {saleItems.map((item, idx) => (
                  <tr key={item.id}>
                    <td style={{ padding: '5px 8px', fontSize: 10, borderBottom: '1px solid #ddd' }}>{idx + 1}</td>
                    <td style={{ padding: '5px 8px', fontSize: 10, borderBottom: '1px solid #ddd' }}>
                      <span style={{ fontWeight: 600 }}>{item.brand} {item.model}</span>
                      <br />
                      <span style={{ fontSize: 9, color: '#777' }}>{item.category}</span>
                    </td>
                    <td style={{ padding: '5px 8px', fontSize: 10, borderBottom: '1px solid #ddd', fontFamily: 'monospace' }}>{item.serialImei || '—'}</td>
                    <td style={{ padding: '5px 8px', fontSize: 10, borderBottom: '1px solid #ddd', textAlign: 'center' }}>{item.quantity}</td>
                    <td style={{ padding: '5px 8px', fontSize: 10, borderBottom: '1px solid #ddd', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(item.unitPrice)}</td>
                    <td style={{ padding: '5px 8px', fontSize: 10, borderBottom: '1px solid #ddd', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(item.gstAmount + item.pstAmount)}</td>
                    <td style={{ padding: '5px 8px', fontSize: 10, borderBottom: '1px solid #ddd', textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>{formatCurrency(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ marginLeft: 'auto', width: 260, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11 }}>
                <span>Subtotal</span>
                <span style={{ fontFamily: 'monospace' }}>{formatCurrency(sale.subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11 }}>
                <span>GST (5%)</span>
                <span style={{ fontFamily: 'monospace' }}>{formatCurrency(sale.gstTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11 }}>
                <span>PST (7%)</span>
                <span style={{ fontFamily: 'monospace' }}>{formatCurrency(sale.pstTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 3px 0', fontSize: 14, fontWeight: 'bold', borderTop: '2px solid #000', marginTop: 4 }}>
                <span>TOTAL</span>
                <span style={{ fontFamily: 'monospace' }}>{formatCurrency(sale.totalAmount)}</span>
              </div>
            </div>

            {/* Payment method(s) */}
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 6, textTransform: 'uppercase' as const }}>Payment</h3>
              {salePayments.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', fontSize: 10, background: '#fafafa', marginBottom: 2, borderRadius: 2 }}>
                  <span style={{ textTransform: 'capitalize' }}>{p.method}{p.reference ? ` (${p.reference})` : ''}</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ textAlign: 'center', borderTop: '1px solid #ccc', paddingTop: 12, fontSize: 9, color: '#777' }}>
              <p>Thank you for shopping at {store.name}!</p>
              <p>{store.address} · {store.phone}</p>
              <p style={{ marginTop: 4 }}>All sales are final. Items may be returned within 7 days with original receipt.</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 pb-4 pt-2 border-t border-border">
          <Button onClick={handlePrint} className="flex-1 h-10 text-[13px]">
            <Printer className="size-4 mr-1.5" />Print Invoice
          </Button>
          <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)}>
            <X className="size-4 mr-1.5" />Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
