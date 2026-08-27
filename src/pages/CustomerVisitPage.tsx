import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Plus, UserCheck, Edit2, ChevronRight, Printer, Trash2,
  Check, X, DollarSign, ScanLine, Package, ArrowRight, ShoppingBag, AlertCircle, ImageIcon,
} from 'lucide-react';
import { formatCurrency, formatDateTime, round2 } from '@/lib/taxCalc';
import { DEVICE_CONDITIONS, CATEGORIES, PAYMENT_METHODS, ID_TYPES, PROVINCES } from '@/constants/config';
import BookLabelDialog from '@/components/features/BookLabelDialog';
import IdScanner from '@/components/features/IdScanner';
import type { ScanResult } from '@/components/features/IdScanner';
import QrIdScanner from '@/components/features/QrIdScanner';
import DevicePhotoCapture from '@/components/features/DevicePhotoCapture';
import CustomerHistoryPanel from '@/components/features/CustomerHistoryPanel';
import type { Customer, CustomerVisit, PurchaseTransaction, PurchaseItem, DeviceCondition, PaymentMethod, IdType } from '@/types';

// ── Validation helpers ──
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

function calculateAge(dob: string): number | null {
  if (!dob || !dob.trim()) return null;
  const cleaned = dob.split(' ')[0].trim();
  const birthDate = new Date(cleaned);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

interface CustomerFormErrors {
  firstName?: string;
  lastName?: string;
  idNumber?: string;
  phone?: string;
  email?: string;
  dob?: string;
}

function validateCustomerData(data: {
  firstName: string;
  lastName: string;
  idNumber: string;
  phone: string;
  email: string;
  dob: string;
}): CustomerFormErrors {
  const errors: CustomerFormErrors = {};
  if (!data.firstName.trim()) errors.firstName = 'First name is required.';
  if (!data.lastName.trim()) errors.lastName = 'Last name is required.';
  if (!data.idNumber.trim()) errors.idNumber = 'ID number is required.';
  if (!data.phone.trim()) {
    errors.phone = 'Phone number is required to continue.';
  }
  if (!data.email.trim()) {
    errors.email = 'Valid email address is required to continue.';
  } else if (!isValidEmail(data.email)) {
    errors.email = 'Valid email address is required to continue.';
  }
  if (!data.dob || !data.dob.trim()) {
    errors.dob = 'Date of birth is required.';
  } else {
    const age = calculateAge(data.dob);
    if (age === null) {
      errors.dob = 'Date of birth is invalid.';
    } else if (age < 18) {
      errors.dob = 'Customer must be at least 18 years old to complete this transaction.';
    }
  }
  return errors;
}

type Step = 'search' | 'customer-form' | 'devices' | 'payment' | 'complete';

export default function CustomerVisitPage() {
  const { employee, store, getEmployeeById } = useAuthStore();
  const pos = usePosStore();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectHandled = useRef(false);
  const fromBuyTrade = searchParams.get('from') === 'buy-trade';
  const actingEmployee = (fromBuyTrade && pos.actingEmployeeId
    ? getEmployeeById(pos.actingEmployeeId)
    : undefined) || employee;

  // Wizard state
  const [step, setStep] = useState<Step>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [showDeviceDialog, setShowDeviceDialog] = useState(false);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);

  // Reprint state
  const [showReprintDialog, setShowReprintDialog] = useState(false);
  const [reprintCustomer, setReprintCustomer] = useState<Customer | null>(null);
  const [reprintVisit, setReprintVisit] = useState<CustomerVisit | null>(null);
  const [reprintPurchase, setReprintPurchase] = useState<PurchaseTransaction | null>(null);
  const [reprintItems, setReprintItems] = useState<PurchaseItem[]>([]);
  const [visitSearchQuery, setVisitSearchQuery] = useState('');

  // Customer form
  const emptyCust = {
    idType: 'drivers-license' as IdType, idNumber: '', firstName: '', middleName: '',
    lastName: '', dob: '', address1: '', address2: '', city: '', province: 'BC',
    postalCode: '', phone: '', email: '', sex: '', race: '', weight: '', height: '', notes: '',
  };
  const [custForm, setCustForm] = useState(emptyCust);

  // Device form
  const emptyDevice = {
    category: 'Smartphones', brand: '', model: '', serialImei: '',
    quantity: 1, buyPrice: 0, isDeal: true, conditionNotes: '',
    condition: 'good' as DeviceCondition, estimatedPrice: 0, inscription: '', photos: [] as string[],
  };
  const [deviceForm, setDeviceForm] = useState(emptyDevice);

  // Payment
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payAmount, setPayAmount] = useState(0);
  const [payRef, setPayRef] = useState('');

  // Derived data
  const purchaseItems = useMemo(
    () => (purchaseId ? pos.purchaseItems.filter((i) => i.purchaseTransactionId === purchaseId) : []),
    [pos.purchaseItems, purchaseId]
  );
  const purchasePayments = useMemo(
    () => (purchaseId ? pos.purchasePayments.filter((p) => p.transactionId === purchaseId) : []),
    [pos.purchasePayments, purchaseId]
  );
  const purchase = purchaseId ? pos.purchases.find((p) => p.id === purchaseId) : null;
  const paidTotal = round2(purchasePayments.reduce((s, p) => s + p.amount, 0));
  const remaining = round2((purchase?.totalAmount || 0) - paidTotal);

  // ID number match detection (for new customer form)
  const idMatch = useMemo(() => {
    if (!custForm.idNumber.trim() || (selectedCustomer && isEditing)) return null;
    const q = custForm.idNumber.trim().toLowerCase();
    return pos.customers.find((c) => c.idNumber.toLowerCase() === q) || null;
  }, [pos.customers, custForm.idNumber, selectedCustomer, isEditing]);

  // Form validation — block save & continuation until phone, email, valid DOB (18+) are filled
  const formErrors = useMemo(() => validateCustomerData({
    firstName: custForm.firstName,
    lastName: custForm.lastName,
    idNumber: custForm.idNumber,
    phone: custForm.phone,
    email: custForm.email,
    dob: custForm.dob,
  }), [custForm.firstName, custForm.lastName, custForm.idNumber, custForm.phone, custForm.email, custForm.dob]);
  const isFormValid = Object.keys(formErrors).length === 0;
  const customerAge = useMemo(() => calculateAge(custForm.dob), [custForm.dob]);

  // Customer search results
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return pos.customers.slice(0, 12);
    const q = searchQuery.toLowerCase();
    return pos.customers.filter((c) =>
      c.idNumber.toLowerCase().includes(q) ||
      c.customerCode.toLowerCase().includes(q) ||
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      c.phone.includes(q)
    ).slice(0, 20);
  }, [pos.customers, searchQuery]);



  // Recent completed visits for reprint
  const recentCompletedVisits = useMemo(() => {
    const completedPurchaseVisitIds = new Set(pos.purchases.filter((p) => p.status === 'completed').map((p) => p.visitId));
    let visits = pos.visits.filter((v) => completedPurchaseVisitIds.has(v.id));
    if (visitSearchQuery.trim()) {
      const q = visitSearchQuery.toLowerCase();
      visits = visits.filter((v) => {
        const cust = pos.customers.find((c) => c.id === v.customerId);
        return v.visitCode.toLowerCase().includes(q) ||
          (cust && `${cust.firstName} ${cust.lastName}`.toLowerCase().includes(q)) ||
          (cust && cust.idNumber.toLowerCase().includes(q));
      });
    }
    return visits.slice(0, 10);
  }, [pos.visits, pos.purchases, pos.customers, visitSearchQuery]);

  // ── Handlers ──

  const handleScanResult = (data: ScanResult) => {
    // Check if scanned ID matches an existing customer
    if (data.idNumber) {
      const existingMatch = pos.customers.find((c) => c.idNumber.toLowerCase() === data.idNumber.toLowerCase());
      if (existingMatch) {
        selectCustomer(existingMatch);
        toast({ title: 'Existing customer found', description: `${existingMatch.firstName} ${existingMatch.lastName} — starting visit` });
        return;
      }
    }
    // Pre-fill new customer form
    setCustForm({
      ...emptyCust,
      idType: data.idType || 'other',
      idNumber: data.idNumber,
      firstName: data.firstName,
      middleName: data.middleName,
      lastName: data.lastName,
      dob: data.dob,
      address1: data.address1,
      address2: data.address2 || '',
      city: data.city,
      province: data.province,
      postalCode: data.postalCode,
      sex: data.sex,
      height: data.height,
      weight: data.weight,
    });
    setSelectedCustomer(null);
    setIsEditing(false);
    setStep('customer-form');
    toast({ title: 'ID scanned', description: 'Customer form pre-filled from ID. Review and save.' });
  };

  const selectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setCustForm({
      idType: c.idType, idNumber: c.idNumber, firstName: c.firstName, middleName: c.middleName,
      lastName: c.lastName, dob: c.dob, address1: c.address1, address2: c.address2,
      city: c.city, province: c.province, postalCode: c.postalCode, phone: c.phone,
      email: c.email, sex: c.sex, race: c.race, weight: c.weight, height: c.height, notes: c.notes,
    });

    // Validate existing customer data — block visit start if missing or invalid
    const existingErrors = validateCustomerData({
      firstName: c.firstName, lastName: c.lastName, idNumber: c.idNumber,
      phone: c.phone, email: c.email, dob: c.dob,
    });
    if (Object.keys(existingErrors).length > 0) {
      setIsEditing(true);
      setStep('customer-form');
      const missing: string[] = [];
      if (existingErrors.phone) missing.push('phone number');
      if (existingErrors.email) missing.push('email');
      if (existingErrors.dob) missing.push('valid date of birth (18+)');
      toast({
        variant: 'destructive',
        title: 'Customer info incomplete',
        description: `Please update missing or invalid fields (${missing.join(', ')}) before continuing.`,
      });
      return;
    }

    // Automatically start the visit and go to devices
    startVisitForCustomer(c);
  };

  const startVisitForCustomer = (customer: Customer) => {
    if (!actingEmployee || !store) return;
    const vId = pos.createVisit(customer.id, actingEmployee.id, store.id, 'buy', '');
    setVisitId(vId);
    const pId = pos.createPurchase(vId, customer.id, actingEmployee.id, store.id);
    setPurchaseId(pId);
    pos.logAction(actingEmployee.id, actingEmployee.fullName, 'Customer', 'VISIT_START', 'visit', vId,
      `Started visit for ${customer.firstName} ${customer.lastName} — Customer wants to sell`);
    setStep('devices');
    toast({ title: 'Visit started', description: `Now add the devices ${customer.firstName} wants to sell` });
  };

  useEffect(() => {
    const customerId = searchParams.get('customerId');
    if (!customerId) return;
    const token = searchParams.get('t') || customerId;
    const guardKey = `pm-preselect-visit:${token}`;
    if (sessionStorage.getItem(guardKey) === '1' || preselectHandled.current) {
      if (searchParams.get('customerId')) setSearchParams({}, { replace: true });
      return;
    }
    const c = pos.customers.find((x) => x.id === customerId);
    if (!c) {
      if (pos.customers.length > 0) {
        preselectHandled.current = true;
        setSearchParams({}, { replace: true });
      }
      return;
    }
    preselectHandled.current = true;
    sessionStorage.setItem(guardKey, '1');
    setSearchParams({}, { replace: true });
    selectCustomer(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, pos.customers, setSearchParams]);

  const handleSaveCustomer = () => {
    if (!isFormValid) {
      const firstError = Object.values(formErrors)[0];
      toast({
        variant: 'destructive',
        title: 'Please fix the highlighted fields',
        description: firstError || 'Some required fields are missing or invalid.',
      });
      return;
    }
    if (selectedCustomer && isEditing) {
      pos.updateCustomer(selectedCustomer.id, custForm);
      const updated = { ...selectedCustomer, ...custForm, updatedAt: new Date().toISOString() };
      setSelectedCustomer(updated);
      setIsEditing(false);
      toast({ title: 'Customer updated' });
      // If we already have a visit, go back to devices
      if (visitId) {
        setStep('devices');
      } else {
        startVisitForCustomer(updated);
      }
    } else {
      const id = pos.addCustomer(custForm);
      const c = pos.customers.find((cu) => cu.id === id);
      if (c) {
        setSelectedCustomer(c);
        toast({ title: 'Customer created' });
        // Automatically start visit after customer creation
        startVisitForCustomer(c);
      }
    }
  };

  const handleAddDevice = () => {
    if (!purchaseId || !deviceForm.brand || !deviceForm.model) {
      toast({ variant: 'destructive', title: 'Required', description: 'Brand and model are required.' });
      return;
    }
    if (!deviceForm.estimatedPrice || deviceForm.estimatedPrice <= 0) {
      toast({ variant: 'destructive', title: 'Estimated Sell Price required', description: 'Please enter the expected selling price before adding the device.' });
      return;
    }
    const { estimatedPrice, ...itemData } = deviceForm;
    pos.addPurchaseItem(purchaseId, { ...itemData, estimatedSalePrice: estimatedPrice });
    setShowDeviceDialog(false);
    setDeviceForm(emptyDevice);
    toast({ title: 'Device added' });
  };

  const handleRemoveDevice = (itemId: string) => {
    if (!purchaseId) return;
    pos.removePurchaseItem(purchaseId, itemId);
  };

  const handleAddPayment = () => {
    if (!purchaseId || payAmount <= 0) {
      toast({ variant: 'destructive', title: 'Enter a valid amount' });
      return;
    }
    pos.addPurchasePayment(purchaseId, payMethod, payAmount, payRef);
    setPayAmount(0);
    setPayRef('');
    toast({ title: 'Payment line added' });
  };

  const handleFillRemaining = () => {
    if (remaining > 0) setPayAmount(remaining);
  };

  const handleCompletePurchase = () => {
    if (!purchaseId || !actingEmployee || !store) return;
    if (remaining > 0.01) {
      toast({ variant: 'destructive', title: 'Payment incomplete', description: `Still owed: ${formatCurrency(remaining)}` });
      return;
    }
    pos.completePurchase(purchaseId, actingEmployee.fullName, store.id);
    setStep('complete');
    toast({ title: 'Purchase completed!' });
  };

  const handlePrintLabel = () => {
    if (!visitId || !actingEmployee) return;
    setShowLabelDialog(true);
  };

  const handleReprintVisit = (visit: CustomerVisit) => {
    const cust = pos.customers.find((c) => c.id === visit.customerId) || null;
    const purch = pos.purchases.find((p) => p.visitId === visit.id) || null;
    const items = purch ? pos.purchaseItems.filter((i) => i.purchaseTransactionId === purch.id) : [];
    setReprintCustomer(cust);
    setReprintVisit(visit);
    setReprintPurchase(purch);
    setReprintItems(items);
    setShowReprintDialog(true);
  };

  const handleReprintConfirm = () => {
    if (!reprintVisit || !actingEmployee) return;
    pos.printLabel(reprintVisit.id, actingEmployee.id);
    toast({ title: 'Book label printed', description: `Visit ${reprintVisit.visitCode}` });
  };

  const handleConfirmPrint = () => {
    if (!visitId || !actingEmployee) return;
    pos.printLabel(visitId, actingEmployee.id);
    toast({ title: 'Book label printed', description: `Visit ${visitId}` });
  };

  const handleNewVisit = () => {
    setStep('search');
    setSelectedCustomer(null);
    setVisitId(null);
    setPurchaseId(null);
    setSearchQuery('');
    setCustForm(emptyCust);
    setIsEditing(false);
  };

  // ── Stepper ──
  const steps = [
    { key: 'search', label: 'Customer', icon: UserCheck },
    { key: 'devices', label: 'Devices to Sell', icon: Package },
    { key: 'payment', label: 'Payment', icon: DollarSign },
    { key: 'complete', label: 'Done', icon: Check },
  ];
  const activeIdx = steps.findIndex((s) => s.key === step || (step === 'customer-form' && s.key === 'search'));

  return (
    <div className="space-y-4 h-[calc(100vh-112px)] flex flex-col">
      {/* Stepper bar */}
      <Card>
        <CardContent className="py-3 px-5">
          <div className="flex items-center gap-2">
            {steps.map((s, idx) => {
              const Icon = s.icon;
              const isActive = idx === activeIdx;
              const isDone = idx < activeIdx;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  {idx > 0 && <div className={`w-8 h-px ${isDone ? 'bg-primary' : 'bg-border'}`} />}
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                    isActive ? 'bg-primary text-white' : isDone ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
                  }`}>
                    <Icon className="size-3.5" />
                    {s.label}
                  </div>
                </div>
              );
            })}
            <div className="ml-auto flex items-center gap-2 text-[11px]">
              {actingEmployee && (
                <Badge variant="outline" className="text-[9px]">
                  Employee: {actingEmployee.fullName}
                </Badge>
              )}
              {selectedCustomer && step !== 'search' && step !== 'customer-form' && (
                <>
                  <Badge variant="outline" className="text-[9px] font-mono">{selectedCustomer.customerCode}</Badge>
                  <span className="font-semibold text-foreground">{selectedCustomer.firstName} {selectedCustomer.lastName}</span>
                  <span className="text-muted-foreground">· {selectedCustomer.phone}</span>
                  {selectedCustomer.notes && (
                    <span className="text-amber-600 text-[10px] max-w-[200px] truncate">Note: {selectedCustomer.notes}</span>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">

        {/* ════════════ STEP: SEARCH ════════════ */}
        {step === 'search' && (
          <div className="grid grid-cols-12 gap-5 h-full">
            {/* Left: Search */}
            <div className="col-span-5 flex flex-col gap-4 overflow-y-auto">
              <Card className="flex-1">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-[14px]">Who is selling today?</CardTitle>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]"
                      onClick={() => { setCustForm(emptyCust); setSelectedCustomer(null); setIsEditing(false); setStep('customer-form'); }}>
                      <Plus className="size-3 mr-1" />New Customer
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input placeholder="Search by ID, name, phone, or code…" value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-10 text-[13px]" autoFocus />
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => setShowQrScanner(true)}>
                      <ScanLine className="size-3 mr-1" />Scan ID via Phone
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => setShowScanner(true)}>
                      <ScanLine className="size-3 mr-1" />Scan ID (Direct)
                    </Button>
                  </div>
                  <div className="space-y-1 max-h-[calc(100vh-380px)] overflow-y-auto">
                    {filtered.map((c) => (
                      <button key={c.id} onClick={() => selectCustomer(c)}
                        className="w-full text-left px-3 py-3 rounded-lg hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all cursor-pointer group">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[13px] group-hover:text-primary transition-colors">
                            {c.firstName} {c.middleName ? `${c.middleName} ` : ''}{c.lastName}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-muted-foreground">{c.customerCode}</span>
                            <ArrowRight className="size-3.5 text-muted-foreground/0 group-hover:text-primary transition-all" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                          <span>ID: {c.idNumber}</span>
                          <span>·</span>
                          <span>{c.phone}</span>
                          {c.notes && (
                            <>
                              <span>·</span>
                              <span className="text-amber-600 truncate max-w-[180px]">{c.notes}</span>
                            </>
                          )}
                        </div>
                      </button>
                    ))}
                    {filtered.length === 0 && (
                      <div className="text-center py-8">
                        <p className="text-[12px] text-muted-foreground mb-2">No customers found</p>
                        <Button size="sm" variant="outline" className="text-[11px]"
                          onClick={() => { setCustForm(emptyCust); setSelectedCustomer(null); setStep('customer-form'); }}>
                          <Plus className="size-3 mr-1" />Create New Customer
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: Instructions + Visit History Reprint */}
            <div className="col-span-7 flex flex-col gap-4">
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <ShoppingBag className="size-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-[14px] font-bold text-foreground">Customer Buy/Sell Visit</h3>
                      <p className="text-[11px] text-muted-foreground">Search or create a customer, then enter devices they want to sell.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <div className="size-5 rounded bg-primary/10 flex items-center justify-center"><span className="text-[9px] font-bold text-primary">1</span></div>
                      Customer Info
                    </div>
                    <ChevronRight className="size-3" />
                    <div className="flex items-center gap-1.5">
                      <div className="size-5 rounded bg-primary/10 flex items-center justify-center"><span className="text-[9px] font-bold text-primary">2</span></div>
                      Devices to Sell
                    </div>
                    <ChevronRight className="size-3" />
                    <div className="flex items-center gap-1.5">
                      <div className="size-5 rounded bg-primary/10 flex items-center justify-center"><span className="text-[9px] font-bold text-primary">3</span></div>
                      Payment
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Reprint from Visit History */}
              <Card className="flex-1 overflow-hidden flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-[13px]">Reprint Book Label — Visit History</CardTitle>
                    <Badge variant="outline" className="text-[9px] font-mono">{recentCompletedVisits.length} visits</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden flex flex-col">
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input placeholder="Search by Visit ID, customer name, or ID number…" value={visitSearchQuery}
                      onChange={(e) => setVisitSearchQuery(e.target.value)} className="pl-9 h-8 text-[11px]" />
                  </div>
                  <div className="space-y-1 flex-1 overflow-y-auto">
                    {recentCompletedVisits.map((v) => {
                      const cust = pos.customers.find((c) => c.id === v.customerId);
                      const purch = pos.purchases.find((p) => p.visitId === v.id);
                      const itemCount = purch ? pos.purchaseItems.filter((i) => i.purchaseTransactionId === purch.id).length : 0;
                      const labelLog = pos.labels.find((l) => l.visitId === v.id);
                      return (
                        <div key={v.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border hover:border-primary/20 hover:bg-primary/[0.02] transition-all">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] font-semibold text-primary">{v.visitCode}</span>
                              {labelLog && <Badge variant="secondary" className="text-[8px]">Printed {labelLog.printCount}×</Badge>}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                              <span className="font-medium text-foreground">{cust ? `${cust.firstName} ${cust.lastName}` : 'Unknown'}</span>
                              <span>·</span>
                              <span>{itemCount} device{itemCount !== 1 ? 's' : ''}</span>
                              <span>·</span>
                              <span className="font-mono">{purch ? formatCurrency(purch.totalAmount) : '$0.00'}</span>
                              <span>·</span>
                              <span>{formatDateTime(v.createdAt)}</span>
                            </div>
                          </div>
                          <Button size="sm" variant="outline" className="h-7 text-[10px] shrink-0 ml-3"
                            onClick={() => handleReprintVisit(v)}>
                            <Printer className="size-3 mr-1" />Reprint
                          </Button>
                        </div>
                      );
                    })}
                    {recentCompletedVisits.length === 0 && (
                      <div className="text-center py-8">
                        <p className="text-[11px] text-muted-foreground">No completed visits found</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ════════════ STEP: CUSTOMER FORM ════════════ */}
        {step === 'customer-form' && (
          <div className="max-w-3xl mx-auto h-full overflow-y-auto">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[15px]">
                    {selectedCustomer && isEditing ? 'Edit Customer Information' : 'New Customer — Selling Devices'}
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px]"
                    onClick={() => setStep(selectedCustomer && visitId ? 'devices' : 'search')}>
                    Cancel
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* ID Match Banner */}
                {idMatch && !isEditing && (
                  <div className="mb-4">
                    <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-amber-50 border-2 border-amber-300">
                      <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-amber-800">Existing customer found with this ID number</p>
                        <div className="flex items-center gap-2 mt-1.5 text-[12px] text-amber-700">
                          <span className="font-semibold">{idMatch.firstName} {idMatch.middleName ? `${idMatch.middleName} ` : ''}{idMatch.lastName}</span>
                          <span className="text-amber-400">·</span>
                          <span className="font-mono text-[10px]">{idMatch.customerCode}</span>
                          <span className="text-amber-400">·</span>
                          <span>{idMatch.phone}</span>
                        </div>
                        {idMatch.notes && (
                          <p className="text-[10px] text-amber-600 mt-1">Note: {idMatch.notes}</p>
                        )}
                        <Button size="sm" className="mt-2.5 h-8 text-[12px] bg-amber-600 hover:bg-amber-700 text-white"
                          onClick={() => selectCustomer(idMatch)}>
                          <UserCheck className="size-3.5 mr-1.5" />Use This Customer & Start Visit
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                  <div>
                    <Label className="text-[11px] font-medium">ID Type *</Label>
                    <Select value={custForm.idType} onValueChange={(v) => setCustForm({ ...custForm, idType: v as IdType })}>
                      <SelectTrigger className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{ID_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">ID Number *</Label>
                    <Input value={custForm.idNumber} onChange={(e) => setCustForm({ ...custForm, idNumber: e.target.value })}
                      className={`mt-1 h-9 text-[12px] ${
                        formErrors.idNumber ? 'border-destructive focus-visible:ring-destructive' :
                        idMatch && !isEditing ? 'border-amber-400 ring-1 ring-amber-300' : ''
                      }`}
                      placeholder="e.g. BC-1234-5678" />
                    {formErrors.idNumber && <p className="text-[10px] text-destructive mt-1 font-medium">{formErrors.idNumber}</p>}
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">First Name *</Label>
                    <Input value={custForm.firstName} onChange={(e) => setCustForm({ ...custForm, firstName: e.target.value })}
                      className={`mt-1 h-9 text-[12px] ${formErrors.firstName ? 'border-destructive focus-visible:ring-destructive' : ''}`} />
                    {formErrors.firstName && <p className="text-[10px] text-destructive mt-1 font-medium">{formErrors.firstName}</p>}
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">Middle Name</Label>
                    <Input value={custForm.middleName} onChange={(e) => setCustForm({ ...custForm, middleName: e.target.value })} className="mt-1 h-9 text-[12px]" />
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">Last Name *</Label>
                    <Input value={custForm.lastName} onChange={(e) => setCustForm({ ...custForm, lastName: e.target.value })}
                      className={`mt-1 h-9 text-[12px] ${formErrors.lastName ? 'border-destructive focus-visible:ring-destructive' : ''}`} />
                    {formErrors.lastName && <p className="text-[10px] text-destructive mt-1 font-medium">{formErrors.lastName}</p>}
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">Date of Birth *</Label>
                    <Input type="date" value={custForm.dob} onChange={(e) => setCustForm({ ...custForm, dob: e.target.value })}
                      className={`mt-1 h-9 text-[12px] ${formErrors.dob ? 'border-destructive focus-visible:ring-destructive' : ''}`} />
                    {formErrors.dob ? (
                      <p className="text-[10px] text-destructive mt-1 font-medium">{formErrors.dob}</p>
                    ) : customerAge !== null && customerAge >= 18 ? (
                      <p className="text-[10px] text-emerald-600 mt-1">Age: {customerAge}</p>
                    ) : null}
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">Phone *</Label>
                    <Input value={custForm.phone} onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })}
                      className={`mt-1 h-9 text-[12px] ${formErrors.phone ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                      placeholder="(604) 555-0000" />
                    {formErrors.phone && <p className="text-[10px] text-destructive mt-1 font-medium">{formErrors.phone}</p>}
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">Email *</Label>
                    <Input type="email" value={custForm.email} onChange={(e) => setCustForm({ ...custForm, email: e.target.value })}
                      className={`mt-1 h-9 text-[12px] ${formErrors.email ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                      placeholder="customer@example.com" />
                    {formErrors.email && <p className="text-[10px] text-destructive mt-1 font-medium">{formErrors.email}</p>}
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[11px] font-medium">Address Line 1</Label>
                    <Input value={custForm.address1} onChange={(e) => setCustForm({ ...custForm, address1: e.target.value })} className="mt-1 h-9 text-[12px]" placeholder="Street address" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[11px] font-medium">Address Line 2</Label>
                    <Input value={custForm.address2} onChange={(e) => setCustForm({ ...custForm, address2: e.target.value })} className="mt-1 h-9 text-[12px]" placeholder="Unit, Suite, Apt #…" />
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">City</Label>
                    <Input value={custForm.city} onChange={(e) => setCustForm({ ...custForm, city: e.target.value })} className="mt-1 h-9 text-[12px]" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] font-medium">Province</Label>
                      <Select value={custForm.province} onValueChange={(v) => setCustForm({ ...custForm, province: v })}>
                        <SelectTrigger className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[11px] font-medium">Postal Code</Label>
                      <Input value={custForm.postalCode} onChange={(e) => setCustForm({ ...custForm, postalCode: e.target.value })} className="mt-1 h-9 text-[12px]" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">Sex</Label>
                    <Select value={custForm.sex} onValueChange={(v) => setCustForm({ ...custForm, sex: v })}>
                      <SelectTrigger className="mt-1 h-9 text-[12px]"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">Race</Label>
                    <Input value={custForm.race} onChange={(e) => setCustForm({ ...custForm, race: e.target.value })} className="mt-1 h-9 text-[12px]" />
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">Weight</Label>
                    <Input value={custForm.weight} onChange={(e) => setCustForm({ ...custForm, weight: e.target.value })} className="mt-1 h-9 text-[12px]" placeholder="e.g. 75" />
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">Height</Label>
                    <Input value={custForm.height} onChange={(e) => setCustForm({ ...custForm, height: e.target.value })} className="mt-1 h-9 text-[12px]" placeholder="e.g. 72" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[11px] font-medium">Staff Notes</Label>
                    <Textarea value={custForm.notes} onChange={(e) => setCustForm({ ...custForm, notes: e.target.value })} className="mt-1 text-[12px] min-h-[50px]" placeholder="Any notes about this customer…" />
                  </div>
                </div>

                {/* Validation summary — shown when any required field is missing or invalid */}
                {!isFormValid && (
                  <div className="mt-5 px-3 py-2.5 rounded-lg bg-destructive/5 border border-destructive/30">
                    <p className="text-[11px] font-semibold text-destructive mb-1">Please complete the required fields before continuing:</p>
                    <ul className="space-y-0.5 text-[10px] text-destructive/90">
                      {Object.entries(formErrors).map(([key, msg]) => (
                        <li key={key}>• {msg}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-2 mt-5">
                  <Button onClick={handleSaveCustomer} className="flex-1 h-10 text-[13px]"
                    disabled={(!!idMatch && !isEditing) || !isFormValid}>
                    <ChevronRight className="size-4 mr-1.5" />
                    {selectedCustomer && isEditing ? 'Save & Continue' : 'Create Customer & Continue'}
                  </Button>
                  <Button variant="outline" className="h-10"
                    onClick={() => setStep(selectedCustomer && visitId ? 'devices' : 'search')}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ════════════ STEP: DEVICES ════════════ */}
        {step === 'devices' && selectedCustomer && (
          <div className="grid grid-cols-12 gap-5 h-full">
            {/* Left: Customer summary + visit history */}
            <div className="col-span-4 flex flex-col gap-4 overflow-y-auto">
              {/* Customer info card */}
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <UserCheck className="size-4 text-primary" />
                      <span className="text-[13px] font-semibold">Customer</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]"
                      onClick={() => { setIsEditing(true); setCustForm({
                        idType: selectedCustomer.idType, idNumber: selectedCustomer.idNumber,
                        firstName: selectedCustomer.firstName, middleName: selectedCustomer.middleName,
                        lastName: selectedCustomer.lastName, dob: selectedCustomer.dob,
                        address1: selectedCustomer.address1, address2: selectedCustomer.address2,
                        city: selectedCustomer.city, province: selectedCustomer.province,
                        postalCode: selectedCustomer.postalCode, phone: selectedCustomer.phone,
                        email: selectedCustomer.email, sex: selectedCustomer.sex, race: selectedCustomer.race, weight: selectedCustomer.weight, height: selectedCustomer.height, notes: selectedCustomer.notes,
                      }); setStep('customer-form'); }}>
                      <Edit2 className="size-3 mr-1" />Edit
                    </Button>
                  </div>
                  <div className="space-y-1.5 text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[14px]">{selectedCustomer.firstName} {selectedCustomer.middleName ? `${selectedCustomer.middleName} ` : ''}{selectedCustomer.lastName}</span>
                      <Badge variant="outline" className="text-[9px] font-mono">{selectedCustomer.customerCode}</Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-1 text-[11px] mt-2">
                      <div><span className="text-muted-foreground w-12 inline-block">ID:</span> <span className="font-mono">{selectedCustomer.idNumber}</span></div>
                      <div><span className="text-muted-foreground w-12 inline-block">Phone:</span> {selectedCustomer.phone}</div>
                      {selectedCustomer.email && <div><span className="text-muted-foreground w-12 inline-block">Email:</span> {selectedCustomer.email}</div>}
                      {selectedCustomer.address1 && <div><span className="text-muted-foreground w-12 inline-block">Addr:</span> {selectedCustomer.address1}, {selectedCustomer.city} {selectedCustomer.province}</div>}
                    </div>
                    {selectedCustomer.notes && (
                      <div className="mt-2 px-2.5 py-1.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px]">
                        <span className="font-semibold">Note:</span> {selectedCustomer.notes}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Visit info */}
              {visitId && (
                <Card>
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground">Visit:</span>
                      <Badge variant="outline" className="text-[9px] font-mono">{visitId}</Badge>
                      <span className="text-muted-foreground">·</span>
                      <Badge className="text-[9px] bg-primary/10 text-primary border-0">Buy/Sell</Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Customer History Panel */}
              <CustomerHistoryPanel
                customer={selectedCustomer}
                currentVisitId={visitId}
                onPrintLabel={(vId) => {
                  if (actingEmployee) pos.printLabel(vId, actingEmployee.id);
                  toast({ title: 'Book label printed' });
                }}
              />
            </div>

            {/* Right: Device list */}
            <div className="col-span-8 flex flex-col gap-4 overflow-y-auto">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-[15px]">What does {selectedCustomer.firstName} want to sell?</CardTitle>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Add each device the customer is offering</p>
                    </div>
                    <Button size="sm" className="h-8 text-[12px]" onClick={() => setShowDeviceDialog(true)}>
                      <Plus className="size-3.5 mr-1.5" />Add Device
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {purchaseItems.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                      <Package className="size-10 mx-auto text-muted-foreground/20 mb-2" />
                      <p className="text-[13px] text-muted-foreground font-medium mb-1">No devices added yet</p>
                      <p className="text-[11px] text-muted-foreground mb-4">Click "Add Device" to enter the items the customer wants to sell</p>
                      <Button size="sm" variant="outline" onClick={() => setShowDeviceDialog(true)}>
                        <Plus className="size-3 mr-1" />Add First Device
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {purchaseItems.map((item, idx) => (
                        <div key={item.id} className="p-3 rounded-lg border border-border hover:border-primary/20 transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="size-8 rounded-lg bg-secondary flex items-center justify-center text-[11px] font-bold text-muted-foreground shrink-0">
                                {idx + 1}
                              </div>
                              <div>
                                <p className="text-[13px] font-semibold">{item.brand} {item.model}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <Badge variant="outline" className="text-[9px] capitalize">{item.condition}</Badge>
                                  <Badge variant={item.isDeal ? 'default' : 'secondary'} className="text-[9px]">
                                    {item.isDeal ? 'DEAL' : 'NO DEAL'}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">{item.category}</span>
                                  {item.quantity > 1 && <span className="text-[10px] text-muted-foreground">× {item.quantity}</span>}
                                  {item.serialImei && <span className="text-[9px] font-mono text-muted-foreground">IMEI: {item.serialImei}</span>}
                                  {item.photos && item.photos.length > 0 && (
                                    <span className="text-[9px] text-muted-foreground flex items-center gap-0.5"><ImageIcon className="size-3" />{item.photos.length} photo{item.photos.length > 1 ? 's' : ''}</span>
                                  )}
                                </div>
                                {item.conditionNotes && <p className="text-[10px] text-muted-foreground mt-1">{item.conditionNotes}</p>}
                                {item.photos && item.photos.length > 0 && (
                                  <div className="flex gap-1.5 mt-1.5">
                                    {item.photos.map((photo, pIdx) => (
                                      <div key={pIdx} className="size-10 rounded border border-border overflow-hidden bg-secondary">
                                        <img src={photo} alt={`Photo ${pIdx + 1}`} className="w-full h-full object-cover" />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-right">
                                <p className="text-[10px] text-muted-foreground">Offer Price</p>
                                <p className="font-mono text-[16px] font-bold tabular-nums text-primary">{formatCurrency(item.buyPrice)}</p>
                              </div>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => handleRemoveDevice(item.id)}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Total + proceed */}
              {purchaseItems.length > 0 && (
                <Card>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Total Offer Amount ({purchaseItems.length} item{purchaseItems.length > 1 ? 's' : ''})</p>
                        <p className="text-2xl font-bold font-mono tabular-nums text-primary">{formatCurrency(purchase?.totalAmount || 0)}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowDeviceDialog(true)} className="h-9">
                          <Plus className="size-3.5 mr-1" />Add More
                        </Button>
                        <Button onClick={() => setStep('payment')} className="h-9 text-[12px]">
                          <DollarSign className="size-4 mr-1" />Proceed to Payment
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ════════════ STEP: PAYMENT ════════════ */}
        {step === 'payment' && selectedCustomer && (
          <div className="grid grid-cols-12 gap-5 h-full">
            {/* Left: Device summary */}
            <div className="col-span-5 flex flex-col gap-4 overflow-y-auto">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-[13px]">Devices Being Purchased</CardTitle>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setStep('devices')}>
                      <Edit2 className="size-3 mr-1" />Edit
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {purchaseItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between px-3 py-2 bg-secondary/40 rounded-lg text-[12px]">
                        <div>
                          <span className="font-medium">{item.brand} {item.model}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant={item.isDeal ? 'default' : 'secondary'} className="text-[8px]">{item.isDeal ? 'DEAL' : 'NO DEAL'}</Badge>
                            <span className="text-[10px] text-muted-foreground">{item.category}</span>
                          </div>
                        </div>
                        <span className="font-mono font-bold tabular-nums">{formatCurrency(item.buyPrice)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-3 px-3 py-2 bg-primary/5 rounded-lg border border-primary/20">
                    <span className="text-[13px] font-semibold">Total</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-primary">{formatCurrency(purchase?.totalAmount || 0)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-3 pb-3">
                  <div className="text-[11px] text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground text-[12px] mb-1.5">Payment Info</p>
                    <p>Only the <span className="font-semibold text-foreground">cash</span> portion will affect the cash drawer.</p>
                    <p>Split payments are supported — add multiple payment lines.</p>
                    <p>Total payments must equal <span className="font-mono font-semibold text-primary">{formatCurrency(purchase?.totalAmount || 0)}</span>.</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: Payment form */}
            <div className="col-span-7 flex flex-col gap-4 overflow-y-auto">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[14px]">Pay {selectedCustomer.firstName} for their devices</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Add payment line */}
                  <div className="flex gap-2 items-end mb-4">
                    <div className="flex-1">
                      <Label className="text-[10px]">Method</Label>
                      <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PaymentMethod)}>
                        <SelectTrigger className="h-9 text-[12px] mt-0.5"><SelectValue /></SelectTrigger>
                        <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="w-32">
                      <Label className="text-[10px]">Amount</Label>
                      <Input type="number" value={payAmount || ''} step="0.01"
                        onChange={(e) => setPayAmount(Number(e.target.value))}
                        className="h-9 text-[12px] font-mono mt-0.5" placeholder="0.00" />
                    </div>
                    <div className="w-28">
                      <Label className="text-[10px]">Reference</Label>
                      <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} className="h-9 text-[12px] mt-0.5" placeholder="optional" />
                    </div>
                    <Button size="sm" className="h-9 px-3" onClick={handleAddPayment}><Plus className="size-3.5" /></Button>
                  </div>

                  {remaining > 0 && (
                    <Button variant="ghost" size="sm" className="h-7 text-[10px] mb-3 text-primary" onClick={handleFillRemaining}>
                      Fill remaining {formatCurrency(remaining)}
                    </Button>
                  )}

                  {/* Payment lines */}
                  {purchasePayments.length > 0 && (
                    <div className="space-y-1.5 mb-4">
                      {purchasePayments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between px-3 py-2.5 bg-secondary/40 rounded-lg text-[12px]">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[9px] capitalize">{p.method}</Badge>
                            {p.reference && <span className="text-muted-foreground font-mono text-[10px]">{p.reference}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => pos.removePurchasePayment(p.id)}>
                              <X className="size-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Remaining + Complete */}
                  <div className="space-y-3 mt-4">
                    <div className="flex items-center justify-between px-4 py-3 bg-secondary rounded-lg">
                      <span className="text-[12px] font-medium">Paid</span>
                      <span className="font-mono font-semibold tabular-nums">{formatCurrency(paidTotal)}</span>
                    </div>
                    <div className={`flex items-center justify-between px-4 py-3 rounded-lg border-2 ${
                      remaining <= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-destructive/5 border-destructive/20'
                    }`}>
                      <span className="text-[12px] font-semibold">{remaining <= 0 ? 'Fully Paid' : 'Remaining'}</span>
                      <span className={`font-mono font-bold text-lg tabular-nums ${remaining <= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                        {formatCurrency(remaining)}
                      </span>
                    </div>

                    <Button onClick={handleCompletePurchase} disabled={remaining > 0.01} className="w-full h-11 text-[13px]">
                      <Check className="size-4 mr-1.5" />Complete Purchase
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ════════════ STEP: COMPLETE ════════════ */}
        {step === 'complete' && (
          <Card className="h-full flex items-center justify-center">
            <div className="text-center py-12 max-w-md">
              <div className="size-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
                <Check className="size-10 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Purchase Completed!</h3>
              <p className="text-[14px] text-muted-foreground mb-1">
                Bought {purchaseItems.length} device{purchaseItems.length > 1 ? 's' : ''} from{' '}
                <span className="font-semibold text-foreground">{selectedCustomer?.firstName} {selectedCustomer?.lastName}</span>
              </p>
              <p className="text-2xl font-bold font-mono text-primary mb-1">{formatCurrency(purchase?.totalAmount || 0)}</p>
              <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground mb-6">
                <span>{purchaseItems.filter((i) => i.isDeal).length} deal device(s) added to inventory</span>
                <span>·</span>
                <span className="font-mono">{visitId}</span>
              </div>
              <div className="flex gap-3 justify-center">
                <Button onClick={handlePrintLabel} variant="outline" className="h-10">
                  <Printer className="size-4 mr-1.5" />Print Book Label
                </Button>
                <Button onClick={handleNewVisit} className="h-10">
                  <Plus className="size-4 mr-1.5" />New Visit
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* ════════════ BOOK LABEL DIALOG ════════════ */}
      <BookLabelDialog
        open={showLabelDialog}
        onOpenChange={setShowLabelDialog}
        customer={selectedCustomer}
        visit={visitId ? pos.visits.find((v) => v.id === visitId) || null : null}
        purchase={purchase || null}
        purchaseItems={purchaseItems}
        labelLog={visitId ? pos.labels.find((l) => l.visitId === visitId) : undefined}
        onPrint={handleConfirmPrint}
      />

      {/* ════════════ REPRINT LABEL DIALOG ════════════ */}
      <BookLabelDialog
        open={showReprintDialog}
        onOpenChange={setShowReprintDialog}
        customer={reprintCustomer}
        visit={reprintVisit}
        purchase={reprintPurchase}
        purchaseItems={reprintItems}
        labelLog={reprintVisit ? pos.labels.find((l) => l.visitId === reprintVisit.id) : undefined}
        onPrint={handleReprintConfirm}
      />

      {/* ════════════ ID SCANNER (DIRECT) ════════════ */}
      <IdScanner
        open={showScanner}
        onOpenChange={setShowScanner}
        onScan={handleScanResult}
      />

      {/* ════════════ QR ID SCANNER (WIRELESS) ════════════ */}
      <QrIdScanner
        open={showQrScanner}
        onOpenChange={setShowQrScanner}
        onScan={handleScanResult}
      />

      {/* ════════════ ADD DEVICE DIALOG ════════════ */}
      <Dialog open={showDeviceDialog} onOpenChange={setShowDeviceDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Device — What is the customer selling?</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-2">
            <div>
              <Label className="text-[11px] font-medium">Category</Label>
              <Select value={deviceForm.category} onValueChange={(v) => setDeviceForm({ ...deviceForm, category: v })}>
                <SelectTrigger className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium">Condition</Label>
              <Select value={deviceForm.condition} onValueChange={(v) => setDeviceForm({ ...deviceForm, condition: v as DeviceCondition })}>
                <SelectTrigger className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>{DEVICE_CONDITIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium">Brand *</Label>
              <Input value={deviceForm.brand} onChange={(e) => setDeviceForm({ ...deviceForm, brand: e.target.value })} className="mt-1 h-9 text-[12px]" placeholder="e.g. Apple" />
            </div>
            <div>
              <Label className="text-[11px] font-medium">Model *</Label>
              <Input value={deviceForm.model} onChange={(e) => setDeviceForm({ ...deviceForm, model: e.target.value })} className="mt-1 h-9 text-[12px]" placeholder="e.g. iPhone 14 Pro" />
            </div>
            <div>
              <Label className="text-[11px] font-medium">Serial / IMEI</Label>
              <Input value={deviceForm.serialImei} onChange={(e) => setDeviceForm({ ...deviceForm, serialImei: e.target.value })} className="mt-1 h-9 text-[12px] font-mono" />
            </div>
            <div>
              <Label className="text-[11px] font-medium">Quantity</Label>
              <div className="flex items-center gap-1 mt-1">
                <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setDeviceForm({ ...deviceForm, quantity: Math.max(1, deviceForm.quantity - 1) })}>-</Button>
                <Input type="number" value={deviceForm.quantity} min={1}
                  onChange={(e) => setDeviceForm({ ...deviceForm, quantity: Math.max(1, Number(e.target.value)) })}
                  className="h-9 text-center text-[12px] font-mono w-16" />
                <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setDeviceForm({ ...deviceForm, quantity: deviceForm.quantity + 1 })}>+</Button>
              </div>
            </div>

            {/* Price section */}
            <div className="col-span-2 grid grid-cols-2 gap-4 p-3 bg-secondary/50 rounded-lg">
              <div>
                <Label className="text-[11px] font-medium text-primary">Offer Price ($) *</Label>
                <p className="text-[9px] text-muted-foreground mb-1">What we pay the customer</p>
                <Input type="number" value={deviceForm.buyPrice || ''} step="0.01"
                  onChange={(e) => setDeviceForm({ ...deviceForm, buyPrice: Number(e.target.value) })}
                  className="h-10 text-[14px] font-mono font-semibold border-primary/30 focus-visible:ring-primary" />
              </div>
              <div>
                <Label className="text-[11px] font-medium">Estimated Sell Price ($) *</Label>
                <p className="text-[9px] text-muted-foreground mb-1">Expected resale value</p>
                <Input type="number" value={deviceForm.estimatedPrice || ''} step="0.01"
                  onChange={(e) => setDeviceForm({ ...deviceForm, estimatedPrice: Number(e.target.value) })}
                  className="h-10 text-[14px] font-mono" />
              </div>
            </div>

            <div className="col-span-2 flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={deviceForm.isDeal}
                  onChange={(e) => setDeviceForm({ ...deviceForm, isDeal: e.target.checked })} className="rounded" />
                <span className="text-[12px] font-medium">Deal — Accept & add to inventory</span>
              </label>
              {!deviceForm.isDeal && (
                <Badge variant="secondary" className="text-[9px]">No Deal — Will not be inventoried</Badge>
              )}
            </div>

            <div className="col-span-2">
              <DevicePhotoCapture
                photos={deviceForm.photos}
                onChange={(photos) => setDeviceForm({ ...deviceForm, photos })}
              />
            </div>

            <div className="col-span-2">
              <Label className="text-[11px] font-medium">Inscription</Label>
              <Input value={deviceForm.inscription}
                onChange={(e) => setDeviceForm({ ...deviceForm, inscription: e.target.value })}
                className="mt-1 h-9 text-[12px]" placeholder="Any inscription or engraving on the device…" />
            </div>

            <div className="col-span-2">
              <Label className="text-[11px] font-medium">Staff Notes / Condition Details</Label>
              <Textarea value={deviceForm.conditionNotes}
                onChange={(e) => setDeviceForm({ ...deviceForm, conditionNotes: e.target.value })}
                className="mt-1 text-[12px] min-h-[50px]" placeholder="Screen condition, battery health, accessories included…" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button onClick={handleAddDevice} className="flex-1 h-10 text-[13px]" disabled={!deviceForm.brand || !deviceForm.model}>
              <Plus className="size-4 mr-1.5" />Add Device
            </Button>
            <Button variant="outline" className="h-10" onClick={() => setShowDeviceDialog(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
