import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Printer, X } from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/taxCalc';
import { STORES } from '@/constants/mockData';
import { useAuthStore } from '@/stores/authStore';
import type { Customer, CustomerVisit, PurchaseItem, PurchaseTransaction, LabelPrintLog } from '@/types';

interface BookLabelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  visit: CustomerVisit | null;
  purchase: PurchaseTransaction | null;
  purchaseItems: PurchaseItem[];
  labelLog: LabelPrintLog | undefined;
  onPrint: () => void;
}

const ID_TYPE_LABELS: Record<string, string> = {
  'drivers-license': "Driver's License",
  'passport': 'Passport',
  'provincial-id': 'Provincial ID',
  'other': 'Other',
};

const PROVINCE_FULL: Record<string, string> = {
  AB: 'ALBERTA', BC: 'BRITISH COLUMBIA', MB: 'MANITOBA', NB: 'NEW BRUNSWICK',
  NL: 'NEWFOUNDLAND AND LABRADOR', NS: 'NOVA SCOTIA', NT: 'NORTHWEST TERRITORIES',
  NU: 'NUNAVUT', ON: 'ONTARIO', PE: 'PRINCE EDWARD ISLAND', QC: 'QUEBEC',
  SK: 'SASKATCHEWAN', YT: 'YUKON',
};

export default function BookLabelDialog({
  open, onOpenChange, customer, visit, purchase, purchaseItems, labelLog, onPrint,
}: BookLabelDialogProps) {
  if (!customer || !visit) return null;

  const store = STORES.find((s) => s.id === purchase?.storeId) || STORES[0];
  const emp = useAuthStore.getState().getEmployeeById(visit.employeeId);
  const dealItems = purchaseItems.filter((i) => i.isDeal);

  // Format DOB as DD-MM-YYYY
  const formatDob = (dob: string) => {
    if (!dob) return '';
    const d = new Date(dob);
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  };

  // Format purchase date
  const formatPurchaseDate = (iso: string) => {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
    const h12 = d.getHours() % 12 || 12;
    return `${mm}/${dd}/${yyyy} ${String(h12).padStart(2, '0')}:${min} ${ampm}`;
  };

  // Extract store location code from store name (e.g. "Paymore Surrey" -> "B, A" placeholder)
  const storeLocCode = store.id === 'STR-001' ? 'B, A' : 'V, A';

  const handlePrint = () => {
    onPrint();
    setTimeout(() => {
      const printContent = document.getElementById('book-label-print');
      if (!printContent) return;
      const win = window.open('', '_blank', 'width=800,height=600');
      if (!win) return;
      win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Book Label — ${visit.visitCode}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; padding: 20px; color: #000; background: #fff; }
            .label-header { font-size: 12px; font-weight: bold; margin-bottom: 8px; }
            .cust-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
            .cust-table { border: 2px solid #000; }
            .cust-table td { padding: 3px 6px; font-size: 10px; vertical-align: top; }
            .cust-table .field-label { font-weight: bold; font-size: 9px; }
            .cust-table .field-value { font-size: 10px; }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
            .items-table th { border-bottom: 2px solid #000; text-align: left; padding: 4px 8px; font-size: 10px; font-weight: bold; text-transform: uppercase; }
            .items-table td { padding: 4px 8px; font-size: 10px; border-bottom: 1px solid #ddd; }
            .total-row { text-align: right; margin-top: 8px; }
            .total-label { font-size: 12px; font-weight: bold; }
            .total-amount { font-size: 18px; font-weight: bold; margin-left: 12px; }
            @media print {
              body { padding: 10px; }
              @page { margin: 10mm; size: landscape; }
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
            <DialogTitle className="text-[15px]">Book Label Preview</DialogTitle>
            {labelLog && (
              <Badge variant="outline" className="text-[9px] font-mono">
                Printed {labelLog.printCount}×
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Printable label content */}
        <div className="px-5 pb-2 max-h-[70vh] overflow-y-auto">
          <div id="book-label-print" className="bg-white border border-border rounded-lg p-5" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>

            {/* Header line */}
            <p style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 8, color: '#000' }}>
              Purchase : -{visit.visitCode}- @ {formatPurchaseDate(purchase?.createdAt || visit.createdAt)} - LOC: {storeLocCode}
            </p>

            {/* Customer info table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, border: '2px solid #000' }}>
              <tbody>
                {/* Row 1 */}
                <tr>
                  <td style={{ padding: '3px 6px', fontSize: 10, width: '25%' }}>
                    <span style={{ fontWeight: 'bold', fontSize: 9 }}>First Name : </span>
                    <span>{customer.firstName}</span>
                  </td>
                  <td style={{ padding: '3px 6px', fontSize: 10, width: '25%' }}>
                    <span style={{ fontWeight: 'bold', fontSize: 9 }}>Middle Initial : </span>
                    <span>{customer.middleName || ''}</span>
                  </td>
                  <td style={{ padding: '3px 6px', fontSize: 10, width: '25%' }}>
                    <span style={{ fontWeight: 'bold', fontSize: 9 }}>Last Name : </span>
                    <span>{customer.lastName}</span>
                  </td>
                  <td style={{ padding: '3px 6px', fontSize: 10, width: '25%' }}>
                    <span style={{ fontWeight: 'bold', fontSize: 9 }}>DOB : </span>
                    <span>{formatDob(customer.dob)}</span>
                  </td>
                </tr>
                {/* Row 2 */}
                <tr>
                  <td style={{ padding: '3px 6px', fontSize: 10 }}>
                    <span style={{ fontWeight: 'bold', fontSize: 9 }}>Address : </span>
                    <span>{customer.address1}</span>
                  </td>
                  <td style={{ padding: '3px 6px', fontSize: 10 }}>
                    <span style={{ fontWeight: 'bold', fontSize: 9 }}>City/Muni. : </span>
                    <span>{customer.city} {customer.province}</span>
                  </td>
                  <td style={{ padding: '3px 6px', fontSize: 10 }}>
                    <span style={{ fontWeight: 'bold', fontSize: 9 }}>Province/Territory : </span>
                    <span>{PROVINCE_FULL[customer.province] || customer.province}</span>
                  </td>
                  <td style={{ padding: '3px 6px', fontSize: 10 }}>
                    <span style={{ fontWeight: 'bold', fontSize: 9 }}>Postal Code : </span>
                    <span>{customer.postalCode}</span>
                  </td>
                </tr>
                {/* Row 3 */}
                <tr>
                  <td style={{ padding: '3px 6px', fontSize: 10 }}>
                    <span style={{ fontWeight: 'bold', fontSize: 9 }}>Address 2 : </span>
                    <span>{customer.address2 || ''}</span>
                  </td>
                  <td style={{ padding: '3px 6px', fontSize: 10 }}>
                    <span style={{ fontWeight: 'bold', fontSize: 9 }}>Phone no. : </span>
                    <span>{customer.phone}</span>
                  </td>
                  <td style={{ padding: '3px 6px', fontSize: 10 }}>
                    <span style={{ fontWeight: 'bold', fontSize: 9 }}>Race : </span>
                    <span>{customer.race || ''}</span>
                  </td>
                  <td style={{ padding: '3px 6px', fontSize: 10 }}>
                    <span style={{ fontWeight: 'bold', fontSize: 9 }}>ID# : </span>
                    <span>{customer.idNumber}</span>
                  </td>
                </tr>
                {/* Row 4 */}
                <tr>
                  <td style={{ padding: '3px 6px', fontSize: 10 }}>
                    <span style={{ fontWeight: 'bold', fontSize: 9 }}>ID Type : </span>
                    <span>{ID_TYPE_LABELS[customer.idType] || customer.idType}</span>
                  </td>
                  <td style={{ padding: '3px 6px', fontSize: 10 }}>
                    <span style={{ fontWeight: 'bold', fontSize: 9 }}>Sex : </span>
                    <span>{customer.sex || ''}</span>
                  </td>
                  <td style={{ padding: '3px 6px', fontSize: 10 }}>
                    <span style={{ fontWeight: 'bold', fontSize: 9 }}>Weight : </span>
                    <span>{customer.weight || ''}</span>
                  </td>
                  <td style={{ padding: '3px 6px', fontSize: 10 }}>
                    <span style={{ fontWeight: 'bold', fontSize: 9 }}>Height : </span>
                    <span>{customer.height || ''}</span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Items table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: '2px solid #000', textAlign: 'left', padding: '4px 8px', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' as const }}>ART#</th>
                  <th style={{ borderBottom: '2px solid #000', textAlign: 'left', padding: '4px 8px', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' as const }}>Brand</th>
                  <th style={{ borderBottom: '2px solid #000', textAlign: 'left', padding: '4px 8px', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' as const }}>Model</th>
                  <th style={{ borderBottom: '2px solid #000', textAlign: 'left', padding: '4px 8px', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' as const }}>Collection</th>
                  <th style={{ borderBottom: '2px solid #000', textAlign: 'left', padding: '4px 8px', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' as const }}>Serial/IMEI</th>
                  <th style={{ borderBottom: '2px solid #000', textAlign: 'left', padding: '4px 8px', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' as const }}>INS</th>
                  <th style={{ borderBottom: '2px solid #000', textAlign: 'right', padding: '4px 8px', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' as const }}>AMT</th>
                </tr>
              </thead>
              <tbody>
                {purchaseItems.map((item, idx) => (
                  <tr key={item.id}>
                    <td style={{ padding: '4px 8px', fontSize: 10, borderBottom: '1px solid #ddd' }}>{idx + 1}</td>
                    <td style={{ padding: '4px 8px', fontSize: 10, borderBottom: '1px solid #ddd' }}>{item.brand}</td>
                    <td style={{ padding: '4px 8px', fontSize: 10, borderBottom: '1px solid #ddd' }}>{item.model}</td>
                    <td style={{ padding: '4px 8px', fontSize: 10, borderBottom: '1px solid #ddd' }}>{item.brand} {item.category}</td>
                    <td style={{ padding: '4px 8px', fontSize: 10, borderBottom: '1px solid #ddd' }}>{item.serialImei || 'N/A'}</td>
                    <td style={{ padding: '4px 8px', fontSize: 10, borderBottom: '1px solid #ddd' }}>{item.inscription || 'N/A'}</td>
                    <td style={{ padding: '4px 8px', fontSize: 10, borderBottom: '1px solid #ddd', textAlign: 'right' }}>{formatCurrency(item.buyPrice * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Total */}
            <div style={{ textAlign: 'right', marginTop: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 'bold' }}>TOTAL PURCHASE AMOUNT:</span>
              <span style={{ fontSize: 18, fontWeight: 'bold', marginLeft: 12 }}>{formatCurrency(purchase?.totalAmount || 0)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 pb-4 pt-2 border-t border-border">
          <Button onClick={handlePrint} className="flex-1 h-10 text-[13px]">
            <Printer className="size-4 mr-1.5" />Print Label
          </Button>
          <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)}>
            <X className="size-4 mr-1.5" />Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
