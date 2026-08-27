import { useMemo, useState, Fragment } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, ArrowRight, User, Phone, Mail, Calendar, Store, StickyNote,
  Printer, Pencil, ChevronDown, ChevronRight, Package, FileText, CreditCard, MapPin, History,
} from 'lucide-react';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/taxCalc';
import { getInventoryLifecycleLabel } from '@/lib/inventorySearch';
import {
  appendCustomerNote,
  buildCustomerTimeline,
  getCustomerDeviceHistory,
  getCustomerLifetimeStats,
  getCustomerPurchases,
  getCustomerReturns,
  getCustomerSales,
  getCustomerVisits,
  parseCustomerNotes,
} from '@/lib/customer360';
import { ID_TYPES, PAYMENT_METHODS, PROVINCES } from '@/constants/config';
import type { Customer, IdType } from '@/types';

function paymentLabel(method: string): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label || method;
}

function idTypeLabel(type: string): string {
  return ID_TYPES.find((t) => t.value === type)?.label || type || '—';
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
      <p className="text-[13px] text-foreground break-words">{value?.trim() ? value : '—'}</p>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] text-muted-foreground font-medium leading-tight">{label}</p>
      <p className="text-[16px] font-bold font-mono tabular-nums mt-1">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function CustomerProfilePage() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const pos = usePosStore();
  const { employee, store, employees, hasPermission } = useAuthStore();
  const { toast } = useToast();

  const [tab, setTab] = useState('overview');
  const [expandedPurchase, setExpandedPurchase] = useState<string | null>(null);
  const [expandedSale, setExpandedSale] = useState<string | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [showEditNotes, setShowEditNotes] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editForm, setEditForm] = useState<Partial<Customer>>({});

  const customer = pos.customers.find((c) => c.id === customerId);
  const canStartVisit = hasPermission('customer');
  const canEditNotes = employee?.role === 'admin' || employee?.role === 'manager';

  const employeesById = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((e) => map.set(e.id, e.fullName));
    return map;
  }, [employees]);

  const input = useMemo(() => {
    if (!customer) return null;
    return {
      customer,
      visits: pos.visits,
      purchases: pos.purchases,
      purchaseItems: pos.purchaseItems,
      purchasePayments: pos.purchasePayments,
      inventory: pos.inventory,
      sales: pos.sales,
      saleItems: pos.saleItems,
      salePayments: pos.salePayments,
      returns: pos.returns,
      auditLog: pos.auditLog,
      employeesById,
    };
  }, [customer, pos, employeesById]);

  const stats = useMemo(() => (input ? getCustomerLifetimeStats(input) : null), [input]);
  const visits = useMemo(() => (input ? getCustomerVisits(input) : []), [input]);
  const purchases = useMemo(() => (input ? getCustomerPurchases(input) : []), [input]);
  const sales = useMemo(() => (input ? getCustomerSales(input) : []), [input]);
  const returns = useMemo(() => (input ? getCustomerReturns(input) : []), [input]);
  const devices = useMemo(() => (input ? getCustomerDeviceHistory(input) : []), [input]);
  const timeline = useMemo(() => (input ? buildCustomerTimeline(input) : []), [input]);
  const noteBlocks = useMemo(() => parseCustomerNotes(customer?.notes || ''), [customer?.notes]);
  const lastVisit = visits[0]?.visit.createdAt ?? null;

  if (!customer || !stats) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground mb-3">Customer not found in this store.</p>
        <Button variant="outline" onClick={() => navigate('/pos/customers')}>Back to Customers</Button>
      </div>
    );
  }

  const fullName = `${customer.firstName}${customer.middleName ? ` ${customer.middleName}` : ''} ${customer.lastName}`.trim();

  const openEdit = () => {
    setEditForm({
      firstName: customer.firstName,
      middleName: customer.middleName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      dob: customer.dob,
      sex: customer.sex,
      height: customer.height,
      weight: customer.weight,
      address1: customer.address1,
      address2: customer.address2,
      city: customer.city,
      province: customer.province,
      postalCode: customer.postalCode,
      idType: customer.idType,
      idNumber: customer.idNumber,
    });
    setShowEdit(true);
  };

  const saveEdit = () => {
    if (!employee) return;
    pos.updateCustomer(customer.id, editForm);
    pos.logAction(employee.id, employee.fullName, 'Customers', 'CUSTOMER_UPDATE', 'customer', customer.id, 'Updated customer profile');
    setShowEdit(false);
    toast({ title: 'Customer updated' });
  };

  const addNote = () => {
    if (!employee || !noteText.trim()) return;
    const next = appendCustomerNote(customer.notes, noteText, employee.fullName);
    pos.updateCustomer(customer.id, { notes: next });
    pos.logAction(employee.id, employee.fullName, 'Customers', 'CUSTOMER_NOTE', 'customer', customer.id, 'Added customer note');
    setNoteText('');
    setShowNote(false);
    toast({ title: 'Note added' });
  };

  const saveNotes = () => {
    if (!employee) return;
    pos.updateCustomer(customer.id, { notes: editNotes });
    pos.logAction(employee.id, employee.fullName, 'Customers', 'CUSTOMER_UPDATE', 'customer', customer.id, 'Edited customer notes');
    setShowEditNotes(false);
    toast({ title: 'Notes saved' });
  };

  const startVisit = () => {
    navigate(`/pos/customer?customerId=${encodeURIComponent(customer.id)}&t=${Date.now()}`);
  };

  const printHistory = () => {
    const html = `<!DOCTYPE html><html><head><title>${fullName} — Customer History</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:left}</style>
      </head><body>
      <h1>${fullName}</h1>
      <p>${customer.customerCode} · ${store?.name || ''} · Printed ${new Date().toLocaleString('en-CA')}</p>
      <p>Phone: ${customer.phone || '—'} · Email: ${customer.email || '—'}</p>
      <h3>Visits</h3>
      <table><tr><th>Visit</th><th>Date</th><th>Status</th><th>Amount</th></tr>
      ${visits.map((v) => `<tr><td>${v.visit.visitCode}</td><td>${formatDateTime(v.visit.createdAt)}</td><td>${v.status}</td><td>${formatCurrency(v.amount)}</td></tr>`).join('')}
      </table>
      <h3>Devices</h3>
      <table><tr><th>Device</th><th>Product</th><th>Type</th><th>Status</th><th>Location</th></tr>
      ${devices.map((d) => `<tr><td>${d.deviceId}</td><td>${d.productName}</td><td>${d.transactionType}</td><td>${d.currentStatus}</td><td>${d.currentLocation || '—'}</td></tr>`).join('')}
      </table>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" className="h-8 px-2 text-[12px] -ml-2" onClick={() => navigate('/pos/customers')}>
        <ArrowLeft className="size-3.5 mr-1" />Customers
      </Button>

      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-foreground">{fullName}</h1>
                <Badge variant="outline" className="font-mono text-[10px]">{customer.customerCode}</Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5 text-[12px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><Phone className="size-3.5" />{customer.phone || '—'}</span>
                <span className="flex items-center gap-1.5"><Mail className="size-3.5" />{customer.email || '—'}</span>
                <span className="flex items-center gap-1.5"><Calendar className="size-3.5" />Since {formatDate(customer.createdAt)}</span>
                <span className="flex items-center gap-1.5"><History className="size-3.5" />Last visit {formatDate(lastVisit)}</span>
                <span className="flex items-center gap-1.5"><Store className="size-3.5" />{store?.name || '—'}</span>
                <span className="flex items-center gap-1.5 font-mono"><User className="size-3.5" />{customer.id}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {canStartVisit && (
                <Button size="sm" className="h-8 text-[12px]" onClick={startVisit}>
                  <ArrowRight className="size-3.5 mr-1" />Start New Visit
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-8 text-[12px]" onClick={openEdit}>
                <Pencil className="size-3.5 mr-1" />Edit Customer
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-[12px]" onClick={() => { setNoteText(''); setShowNote(true); }}>
                <StickyNote className="size-3.5 mr-1" />Add Note
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-[12px]" onClick={printHistory}>
                <Printer className="size-3.5 mr-1" />Print History
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Selling to PayMore</p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard label="Total Devices Sold to Store" value={String(stats.devicesSoldToStore)} />
          <StatCard label="Total Purchase Transactions" value={String(stats.purchaseTransactions)} />
          <StatCard label="Total Amount Paid to Customer" value={formatCurrency(stats.amountPaidToCustomer)} />
          <StatCard label="Average Buy Percentage" value={stats.averageBuyPercentage == null ? '—' : `${stats.averageBuyPercentage.toFixed(1)}%`} />
          <StatCard label="Last Purchase Date" value={formatDate(stats.lastPurchaseAt)} />
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Buying from PayMore</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Items Purchased by Customer" value={String(stats.itemsPurchasedByCustomer)} />
          <StatCard label="Total Sales Transactions" value={String(stats.salesTransactions)} />
          <StatCard label="Total Customer Spend" value={formatCurrency(stats.customerSpend)} />
          <StatCard label="Last Sale Date" value={formatDate(stats.lastSaleAt)} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Visits" value={String(stats.visitCount)} />
        <StatCard label="Total Returns" value={String(stats.returnCount)} />
        <StatCard label="Current Open Transactions" value={String(stats.openTransactions)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] flex items-center gap-2"><User className="size-3.5 text-primary" />Customer Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <InfoField label="Full Name" value={fullName} />
            <InfoField label="First Name" value={customer.firstName} />
            <InfoField label="Middle Name" value={customer.middleName} />
            <InfoField label="Last Name" value={customer.lastName} />
            <InfoField label="Email" value={customer.email} />
            <InfoField label="Phone" value={customer.phone} />
            <InfoField label="Date of Birth" value={customer.dob} />
            <InfoField label="Sex" value={customer.sex} />
            <InfoField label="Height" value={customer.height} />
            <InfoField label="Weight" value={customer.weight} />
            <InfoField label="Address 1" value={customer.address1} />
            <InfoField label="Address 2" value={customer.address2} />
            <InfoField label="City" value={customer.city} />
            <InfoField label="Province" value={customer.province} />
            <InfoField label="Postal Code" value={customer.postalCode} />
            <InfoField label="Customer Created Date" value={formatDateTime(customer.createdAt)} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px] flex items-center gap-2"><CreditCard className="size-3.5 text-primary" />Documents / Identification</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <InfoField label="ID Type" value={idTypeLabel(customer.idType)} />
              <InfoField label="ID Number" value={customer.idNumber} />
              <InfoField label="Province / Country" value={customer.province} />
              <InfoField label="ID verification" value={customer.idNumber ? 'On file from customer record' : 'Not on file'} />
              <div className="col-span-2 text-[11px] text-muted-foreground">
                No ID image is stored for this customer in the current POS records. ID photos remain private and are not exposed as public URLs.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[13px] flex items-center gap-2"><StickyNote className="size-3.5 text-primary" />Customer Notes</CardTitle>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => { setNoteText(''); setShowNote(true); }}>Add Note</Button>
                  {canEditNotes && (
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => { setEditNotes(customer.notes); setShowEditNotes(true); }}>Edit</Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {noteBlocks.length === 0 && <p className="text-[12px] text-muted-foreground">No notes yet.</p>}
              {noteBlocks.map((n, i) => (
                <div key={i} className="rounded-md bg-secondary/50 px-3 py-2">
                  {n.stamp && <p className="text-[10px] text-muted-foreground mb-0.5">{n.stamp}</p>}
                  <p className="text-[12px] whitespace-pre-wrap">{n.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview" className="text-[12px]">Overview</TabsTrigger>
          <TabsTrigger value="visits" className="text-[12px]">Visits</TabsTrigger>
          <TabsTrigger value="purchases" className="text-[12px]">Purchases From Customer</TabsTrigger>
          <TabsTrigger value="sales" className="text-[12px]">Sales To Customer</TabsTrigger>
          <TabsTrigger value="returns" className="text-[12px]">Returns</TabsTrigger>
          <TabsTrigger value="devices" className="text-[12px]">Device History</TabsTrigger>
          <TabsTrigger value="activity" className="text-[12px]">Customer Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[13px]">Recent activity</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {timeline.slice(0, 8).map((e) => (
                <div key={e.id} className="flex items-start gap-3 text-[12px]">
                  <span className="font-mono text-[10px] text-muted-foreground w-[150px] shrink-0">{formatDateTime(e.at)}</span>
                  <span className="font-medium">{e.label}</span>
                  <span className="text-muted-foreground truncate">{e.detail}</span>
                </div>
              ))}
              {timeline.length === 0 && <p className="text-[12px] text-muted-foreground">No activity yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visits">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Visit ID</TableHead>
                    <TableHead className="text-[11px]">Date</TableHead>
                    <TableHead className="text-[11px]">Employee</TableHead>
                    <TableHead className="text-[11px] text-right">Devices</TableHead>
                    <TableHead className="text-[11px]">Status</TableHead>
                    <TableHead className="text-[11px] text-right">Amount</TableHead>
                    <TableHead className="text-[11px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visits.map((row) => (
                    <TableRow key={row.visit.id}>
                      <TableCell className="font-mono text-[12px]">{row.visit.visitCode}</TableCell>
                      <TableCell className="text-[12px]">{formatDateTime(row.visit.createdAt)}</TableCell>
                      <TableCell className="text-[12px]">{row.employeeName}</TableCell>
                      <TableCell className="text-right font-mono text-[12px]">{row.deviceCount}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[9px]">{row.status}</Badge></TableCell>
                      <TableCell className="text-right font-mono text-[12px]">{formatCurrency(row.amount)}</TableCell>
                      <TableCell className="text-right">
                        {row.purchaseId && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => { setTab('purchases'); setExpandedPurchase(row.purchaseId!); }}>
                            Open
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {visits.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-[12px] text-muted-foreground">No visits.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="purchases">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead className="text-[11px]">Purchase ID</TableHead>
                    <TableHead className="text-[11px]">Date</TableHead>
                    <TableHead className="text-[11px]">Employee</TableHead>
                    <TableHead className="text-[11px] text-right">Products</TableHead>
                    <TableHead className="text-[11px] text-right">Total Paid</TableHead>
                    <TableHead className="text-[11px]">Payment</TableHead>
                    <TableHead className="text-[11px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((row) => {
                    const open = expandedPurchase === row.purchase.id;
                    return (
                      <Fragment key={row.purchase.id}>
                        <TableRow key={row.purchase.id} className="cursor-pointer" onClick={() => setExpandedPurchase(open ? null : row.purchase.id)}>
                          <TableCell>{open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</TableCell>
                          <TableCell className="font-mono text-[12px]">{row.purchase.id}</TableCell>
                          <TableCell className="text-[12px]">{formatDateTime(row.purchase.createdAt)}</TableCell>
                          <TableCell className="text-[12px]">{row.employeeName}</TableCell>
                          <TableCell className="text-right font-mono text-[12px]">{row.productCount}</TableCell>
                          <TableCell className="text-right font-mono text-[12px]">{formatCurrency(row.purchase.totalAmount)}</TableCell>
                          <TableCell className="text-[11px]">{row.paymentMethods.map(paymentLabel).join(', ') || '—'}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[9px] capitalize">{row.purchase.status}</Badge></TableCell>
                        </TableRow>
                        {open && (
                          <TableRow key={`${row.purchase.id}-items`}>
                            <TableCell colSpan={8} className="bg-secondary/30">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-[10px]">Device ID</TableHead>
                                    <TableHead className="text-[10px]">Brand</TableHead>
                                    <TableHead className="text-[10px]">Model</TableHead>
                                    <TableHead className="text-[10px]">IMEI / Serial</TableHead>
                                    <TableHead className="text-[10px]">Estimated Value</TableHead>
                                    <TableHead className="text-[10px]">Offer Price</TableHead>
                                    <TableHead className="text-[10px]">Staff Notes</TableHead>
                                    <TableHead className="text-[10px]">Current Status</TableHead>
                                    <TableHead className="text-[10px]">Location</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {row.items.map((item) => (
                                    <TableRow key={item.id}>
                                      <TableCell className="font-mono text-[11px]">{item.inventory?.deviceCode || '—'}</TableCell>
                                      <TableCell className="text-[11px]">{item.brand}</TableCell>
                                      <TableCell className="text-[11px]">{item.model}</TableCell>
                                      <TableCell className="font-mono text-[11px]">{item.serialImei || '—'}</TableCell>
                                      <TableCell className="font-mono text-[11px]">{formatCurrency(item.estimatedSalePrice)}</TableCell>
                                      <TableCell className="font-mono text-[11px]">{formatCurrency(item.buyPrice)}</TableCell>
                                      <TableCell className="text-[11px] max-w-[180px] truncate">{item.conditionNotes || '—'}</TableCell>
                                      <TableCell>
                                        <Badge variant="outline" className="text-[9px]">
                                          {item.inventory ? getInventoryLifecycleLabel(item.inventory.status) : (row.purchase.status === 'draft' ? 'Draft' : 'Not inventoried')}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-[11px]">
                                        {item.inventory?.storageRack
                                          ? `Rack ${item.inventory.storageRack.replace(/^R/i, '')} / ${item.inventory.storageRow || '—'}`
                                          : item.inventory?.storageLocation || '—'}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                  {purchases.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-[12px] text-muted-foreground">No purchases from this customer.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead className="text-[11px]">Sale ID</TableHead>
                    <TableHead className="text-[11px]">Date</TableHead>
                    <TableHead className="text-[11px]">Product</TableHead>
                    <TableHead className="text-[11px] text-right">Qty</TableHead>
                    <TableHead className="text-[11px] text-right">Sale Price</TableHead>
                    <TableHead className="text-[11px]">Payment</TableHead>
                    <TableHead className="text-[11px]">Employee</TableHead>
                    <TableHead className="text-[11px]">Return Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((row) => {
                    const open = expandedSale === row.sale.id;
                    const first = row.items[0];
                    return (
                      <Fragment key={row.sale.id}>
                        <TableRow key={row.sale.id} className="cursor-pointer" onClick={() => setExpandedSale(open ? null : row.sale.id)}>
                          <TableCell>{open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</TableCell>
                          <TableCell className="font-mono text-[12px]">{row.sale.saleCode}</TableCell>
                          <TableCell className="text-[12px]">{formatDateTime(row.sale.completedAt || row.sale.createdAt)}</TableCell>
                          <TableCell className="text-[12px]">{first ? `${first.brand} ${first.model}` : '—'}{row.items.length > 1 ? ` +${row.items.length - 1}` : ''}</TableCell>
                          <TableCell className="text-right font-mono text-[12px]">{row.items.reduce((n, i) => n + i.quantity, 0)}</TableCell>
                          <TableCell className="text-right font-mono text-[12px]">{formatCurrency(row.sale.totalAmount)}</TableCell>
                          <TableCell className="text-[11px]">{row.paymentMethods.map(paymentLabel).join(', ') || '—'}</TableCell>
                          <TableCell className="text-[12px]">{row.employeeName}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[9px]">{row.returnStatus}</Badge></TableCell>
                        </TableRow>
                        {open && (
                          <TableRow key={`${row.sale.id}-items`}>
                            <TableCell colSpan={9} className="bg-secondary/30">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-[10px]">Product</TableHead>
                                    <TableHead className="text-[10px]">IMEI / Serial</TableHead>
                                    <TableHead className="text-[10px] text-right">Qty</TableHead>
                                    <TableHead className="text-[10px] text-right">Unit Price</TableHead>
                                    <TableHead className="text-[10px] text-right">Line Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {row.items.map((item) => (
                                    <TableRow key={item.id}>
                                      <TableCell className="text-[11px]">{item.brand} {item.model}</TableCell>
                                      <TableCell className="font-mono text-[11px]">{item.serialImei || '—'}</TableCell>
                                      <TableCell className="text-right font-mono text-[11px]">{item.quantity}</TableCell>
                                      <TableCell className="text-right font-mono text-[11px]">{formatCurrency(item.unitPrice)}</TableCell>
                                      <TableCell className="text-right font-mono text-[11px]">{formatCurrency(item.lineTotal)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                  {sales.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-[12px] text-muted-foreground">No sales to this customer.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="returns">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Return ID</TableHead>
                    <TableHead className="text-[11px]">Original Sale ID</TableHead>
                    <TableHead className="text-[11px]">Product</TableHead>
                    <TableHead className="text-[11px] text-right">Qty</TableHead>
                    <TableHead className="text-[11px]">Return Date</TableHead>
                    <TableHead className="text-[11px] text-right">Refund Amount</TableHead>
                    <TableHead className="text-[11px]">Reason</TableHead>
                    <TableHead className="text-[11px]">Employee</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returns.map((row) => (
                    <TableRow key={row.ret.id}>
                      <TableCell className="font-mono text-[12px]">{row.ret.returnCode}</TableCell>
                      <TableCell className="font-mono text-[12px]">{row.originalSaleCode}</TableCell>
                      <TableCell className="text-[12px]">{row.product}</TableCell>
                      <TableCell className="text-right font-mono text-[12px]">{row.quantity}</TableCell>
                      <TableCell className="text-[12px]">{formatDateTime(row.ret.completedAt || row.ret.createdAt)}</TableCell>
                      <TableCell className="text-right font-mono text-[12px]">{formatCurrency(row.ret.returnAmount)}</TableCell>
                      <TableCell className="text-[12px]">{row.ret.reason || '—'}</TableCell>
                      <TableCell className="text-[12px]">{row.employeeName}</TableCell>
                    </TableRow>
                  ))}
                  {returns.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-[12px] text-muted-foreground">No returns.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px] flex items-center gap-2"><Package className="size-3.5 text-primary" />Device History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Device ID</TableHead>
                    <TableHead className="text-[11px]">Brand</TableHead>
                    <TableHead className="text-[11px]">Model</TableHead>
                    <TableHead className="text-[11px]">Product Name</TableHead>
                    <TableHead className="text-[11px]">IMEI / Serial</TableHead>
                    <TableHead className="text-[11px]">Category</TableHead>
                    <TableHead className="text-[11px]">Transaction Type</TableHead>
                    <TableHead className="text-[11px]">Date</TableHead>
                    <TableHead className="text-[11px]">Original ID</TableHead>
                    <TableHead className="text-[11px] text-right">Cost / Offer</TableHead>
                    <TableHead className="text-[11px] text-right">Sale Price</TableHead>
                    <TableHead className="text-[11px]">Current Status</TableHead>
                    <TableHead className="text-[11px]">Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((d) => (
                    <TableRow key={d.key}>
                      <TableCell className="font-mono text-[11px]">{d.deviceId}</TableCell>
                      <TableCell className="text-[11px]">{d.brand || '—'}</TableCell>
                      <TableCell className="text-[11px]">{d.model || '—'}</TableCell>
                      <TableCell className="text-[11px]">{d.productName}</TableCell>
                      <TableCell className="font-mono text-[11px]">{d.serialImei || '—'}</TableCell>
                      <TableCell className="text-[11px]">{d.category || '—'}</TableCell>
                      <TableCell className="text-[11px]">{d.transactionType}</TableCell>
                      <TableCell className="text-[11px]">{formatDate(d.transactionDate)}</TableCell>
                      <TableCell className="font-mono text-[11px]">{d.transactionId}</TableCell>
                      <TableCell className="text-right font-mono text-[11px]">{d.costOrOffer == null ? '—' : formatCurrency(d.costOrOffer)}</TableCell>
                      <TableCell className="text-right font-mono text-[11px]">{d.salePrice == null ? '—' : formatCurrency(d.salePrice)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[9px]">{d.currentStatus}</Badge></TableCell>
                      <TableCell className="text-[11px]">
                        {d.currentLocation ? <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{d.currentLocation}</span> : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {devices.length === 0 && (
                    <TableRow><TableCell colSpan={13} className="text-center py-8 text-[12px] text-muted-foreground">No devices connected to this customer.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px] flex items-center gap-2"><FileText className="size-3.5 text-primary" />Customer Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {timeline.map((e) => (
                <div key={e.id} className="flex items-start gap-3 border-b border-border/60 pb-2 last:border-0">
                  <span className="font-mono text-[10px] text-muted-foreground w-[160px] shrink-0">{formatDateTime(e.at)}</span>
                  <div>
                    <p className="text-[12px] font-medium">{e.label}</p>
                    <p className="text-[11px] text-muted-foreground">{e.detail}</p>
                  </div>
                </div>
              ))}
              {timeline.length === 0 && <p className="text-[12px] text-muted-foreground">No activity recorded.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showNote} onOpenChange={setShowNote}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-[15px]">Add Note</DialogTitle></DialogHeader>
          <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a customer note…" className="min-h-[100px] text-[13px]" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNote(false)}>Cancel</Button>
            <Button onClick={addNote} disabled={!noteText.trim()}>Save Note</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditNotes} onOpenChange={setShowEditNotes}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-[15px]">Edit Notes</DialogTitle></DialogHeader>
          <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="min-h-[160px] text-[13px]" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowEditNotes(false)}>Cancel</Button>
            <Button onClick={saveNotes}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-[15px]">Edit Customer</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-[11px]">First Name</Label><Input className="h-9 mt-1" value={editForm.firstName || ''} onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))} /></div>
            <div><Label className="text-[11px]">Last Name</Label><Input className="h-9 mt-1" value={editForm.lastName || ''} onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))} /></div>
            <div className="col-span-2"><Label className="text-[11px]">Middle Name</Label><Input className="h-9 mt-1" value={editForm.middleName || ''} onChange={(e) => setEditForm((f) => ({ ...f, middleName: e.target.value }))} /></div>
            <div><Label className="text-[11px]">Phone</Label><Input className="h-9 mt-1" value={editForm.phone || ''} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label className="text-[11px]">Email</Label><Input className="h-9 mt-1" value={editForm.email || ''} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div><Label className="text-[11px]">Date of Birth</Label><Input className="h-9 mt-1" value={editForm.dob || ''} onChange={(e) => setEditForm((f) => ({ ...f, dob: e.target.value }))} /></div>
            <div><Label className="text-[11px]">Sex</Label><Input className="h-9 mt-1" value={editForm.sex || ''} onChange={(e) => setEditForm((f) => ({ ...f, sex: e.target.value }))} /></div>
            <div><Label className="text-[11px]">Height</Label><Input className="h-9 mt-1" value={editForm.height || ''} onChange={(e) => setEditForm((f) => ({ ...f, height: e.target.value }))} /></div>
            <div><Label className="text-[11px]">Weight</Label><Input className="h-9 mt-1" value={editForm.weight || ''} onChange={(e) => setEditForm((f) => ({ ...f, weight: e.target.value }))} /></div>
            <div className="col-span-2"><Label className="text-[11px]">Address 1</Label><Input className="h-9 mt-1" value={editForm.address1 || ''} onChange={(e) => setEditForm((f) => ({ ...f, address1: e.target.value }))} /></div>
            <div className="col-span-2"><Label className="text-[11px]">Address 2</Label><Input className="h-9 mt-1" value={editForm.address2 || ''} onChange={(e) => setEditForm((f) => ({ ...f, address2: e.target.value }))} /></div>
            <div><Label className="text-[11px]">City</Label><Input className="h-9 mt-1" value={editForm.city || ''} onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))} /></div>
            <div>
              <Label className="text-[11px]">Province</Label>
              <Select value={editForm.province || 'BC'} onValueChange={(v) => setEditForm((f) => ({ ...f, province: v }))}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-[11px]">Postal Code</Label><Input className="h-9 mt-1" value={editForm.postalCode || ''} onChange={(e) => setEditForm((f) => ({ ...f, postalCode: e.target.value }))} /></div>
            <div>
              <Label className="text-[11px]">ID Type</Label>
              <Select value={editForm.idType || 'drivers-license'} onValueChange={(v) => setEditForm((f) => ({ ...f, idType: v as IdType }))}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{ID_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-[11px]">ID Number</Label><Input className="h-9 mt-1" value={editForm.idNumber || ''} onChange={(e) => setEditForm((f) => ({ ...f, idNumber: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={saveEdit}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
