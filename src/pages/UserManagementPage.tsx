import { useState, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { usePosStore } from '@/stores/posStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Users, Plus, Shield, Key, Search, UserCheck, UserX,
  Activity, Clock, LogIn, LogOut, AlertTriangle, Edit,
  BarChart3, DollarSign, ShoppingCart, TrendingUp, Hash,
  Calendar, ArrowUpRight,
} from 'lucide-react';
import { formatDateTime, formatCurrency } from '@/lib/taxCalc';
import type { EmployeeRole } from '@/types';

const ROLES: { value: EmployeeRole; label: string; description: string; color: string }[] = [
  { value: 'admin', label: 'Admin', description: 'Full system access including user management', color: 'bg-red-50 text-red-700 border-red-200' },
  { value: 'manager', label: 'Manager', description: 'Access to all modules except user management', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'cashier', label: 'Cashier', description: 'Sales, customer visits, cash drawer, returns', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'buyer', label: 'Buyer', description: 'Customer visits, purchases, inventory', color: 'bg-amber-50 text-amber-700 border-amber-200' },
];

type DateRange = 'today' | 'week' | 'month' | 'last-month' | '30-days' | 'all';

function getDateRange(range: DateRange): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start: Date;
  switch (range) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week': {
      const day = now.getDay();
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      break;
    }
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'last-month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start, end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999) };
    case '30-days':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'all':
    default:
      start = new Date(2000, 0, 1);
      break;
  }
  return { start, end };
}

export default function UserManagementPage() {
  const auth = useAuthStore();
  const pos = usePosStore();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('employees');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showResetPin, setShowResetPin] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // Add form
  const [form, setForm] = useState({
    fullName: '', email: '', pin: '', role: 'cashier' as EmployeeRole,
  });

  // Edit form
  const [editForm, setEditForm] = useState({
    fullName: '', email: '', role: 'cashier' as EmployeeRole,
  });

  // Pin reset
  const [newPin, setNewPin] = useState('');

  // Activity search
  const [activitySearch, setActivitySearch] = useState('');

  // Performance dashboard state
  const [perfDateRange, setPerfDateRange] = useState<DateRange>('month');

  const filteredEmployees = useMemo(() => {
    return auth.employees.filter((e) => {
      if (!showInactive && !e.isActive) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return e.fullName.toLowerCase().includes(q) || e.email.toLowerCase().includes(q) || e.role.includes(q);
      }
      return true;
    });
  }, [auth.employees, search, showInactive]);

  const filteredActivity = useMemo(() => {
    let logs = auth.loginActivity;
    if (activitySearch.trim()) {
      const q = activitySearch.toLowerCase();
      logs = logs.filter((l) =>
        l.employeeName.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q)
      );
    }
    return logs.slice(0, 100);
  }, [auth.loginActivity, activitySearch]);

  const stats = useMemo(() => ({
    total: auth.employees.length,
    active: auth.employees.filter((e) => e.isActive).length,
    admins: auth.employees.filter((e) => e.isActive && e.role === 'admin').length,
    managers: auth.employees.filter((e) => e.isActive && e.role === 'manager').length,
    cashiers: auth.employees.filter((e) => e.isActive && e.role === 'cashier').length,
    buyers: auth.employees.filter((e) => e.isActive && e.role === 'buyer').length,
  }), [auth.employees]);

  // ── Performance Dashboard Data ──
  const performanceData = useMemo(() => {
    const { start, end } = getDateRange(perfDateRange);
    const inRange = (iso: string | null | undefined) => {
      if (!iso) return false;
      const d = new Date(iso);
      return d >= start && d <= end;
    };

    return auth.employees
      .filter((e) => e.isActive)
      .map((emp) => {
        // Sales
        const empSales = pos.sales.filter(
          (s) => s.employeeId === emp.id && s.status === 'completed' && inRange(s.completedAt || s.createdAt)
        );
        const salesCount = empSales.length;
        const salesRevenue = empSales.reduce((s, sl) => s + sl.totalAmount, 0);
        const avgSaleValue = salesCount > 0 ? salesRevenue / salesCount : 0;

        // Purchases
        const empPurchases = pos.purchases.filter(
          (p) => p.employeeId === emp.id && p.status === 'completed' && inRange(p.createdAt)
        );
        const purchaseCount = empPurchases.length;
        const purchaseTotal = empPurchases.reduce((s, p) => s + p.totalAmount, 0);

        // Returns
        const empReturns = pos.returns.filter(
          (r) => r.employeeId === emp.id && r.status === 'completed' && inRange(r.completedAt || r.createdAt)
        );
        const returnCount = empReturns.length;
        const returnTotal = empReturns.reduce((s, r) => s + r.returnAmount, 0);

        // Total transactions
        const totalTransactions = salesCount + purchaseCount + returnCount;

        // Logins
        const empLogins = auth.loginActivity.filter(
          (l) => l.employeeId === emp.id && l.action === 'login' && inRange(l.createdAt)
        );
        const loginCount = empLogins.length;

        // Last active
        const allActivity = auth.loginActivity
          .filter((l) => l.employeeId === emp.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const lastActive = allActivity.length > 0 ? allActivity[0].createdAt : null;

        // Customer visits
        const empVisits = pos.visits.filter(
          (v) => v.employeeId === emp.id && inRange(v.createdAt)
        );

        return {
          employee: emp,
          salesCount,
          salesRevenue,
          avgSaleValue,
          purchaseCount,
          purchaseTotal,
          returnCount,
          returnTotal,
          totalTransactions,
          loginCount,
          lastActive,
          visitCount: empVisits.length,
        };
      })
      .sort((a, b) => b.salesRevenue - a.salesRevenue);
  }, [auth.employees, auth.loginActivity, pos.sales, pos.purchases, pos.returns, pos.visits, perfDateRange]);

  // Performance totals
  const perfTotals = useMemo(() => {
    return performanceData.reduce(
      (acc, d) => ({
        totalTransactions: acc.totalTransactions + d.totalTransactions,
        totalRevenue: acc.totalRevenue + d.salesRevenue,
        totalPurchases: acc.totalPurchases + d.purchaseTotal,
        totalLogins: acc.totalLogins + d.loginCount,
      }),
      { totalTransactions: 0, totalRevenue: 0, totalPurchases: 0, totalLogins: 0 }
    );
  }, [performanceData]);

  const handleAdd = () => {
    if (!form.fullName || !form.email || !form.pin || form.pin.length < 4) {
      toast({ variant: 'destructive', title: 'Fill all fields. PIN must be at least 4 digits.' });
      return;
    }
    if (auth.employees.some((e) => e.isActive && e.pin === form.pin)) {
      toast({ variant: 'destructive', title: 'PIN already in use by another employee' });
      return;
    }
    auth.addEmployee({ ...form, isActive: true });
    setShowAdd(false);
    setForm({ fullName: '', email: '', pin: '', role: 'cashier' });
    toast({ title: 'Employee created' });
  };

  const openEdit = (empId: string) => {
    const emp = auth.getEmployeeById(empId);
    if (!emp) return;
    setSelectedEmpId(empId);
    setEditForm({ fullName: emp.fullName, email: emp.email, role: emp.role });
    setShowEdit(true);
  };

  const handleEdit = () => {
    if (!selectedEmpId || !editForm.fullName || !editForm.email) return;
    auth.updateEmployee(selectedEmpId, editForm);
    setShowEdit(false);
    toast({ title: 'Employee updated' });
  };

  const openResetPin = (empId: string) => {
    setSelectedEmpId(empId);
    setNewPin('');
    setShowResetPin(true);
  };

  const handleResetPin = () => {
    if (!selectedEmpId || newPin.length < 4) {
      toast({ variant: 'destructive', title: 'PIN must be at least 4 digits' });
      return;
    }
    if (auth.employees.some((e) => e.isActive && e.id !== selectedEmpId && e.pin === newPin)) {
      toast({ variant: 'destructive', title: 'PIN already in use' });
      return;
    }
    auth.resetPin(selectedEmpId, newPin);
    setShowResetPin(false);
    toast({ title: 'PIN reset successful' });
  };

  const handleDeactivate = (empId: string) => {
    if (empId === auth.employee?.id) {
      toast({ variant: 'destructive', title: "You can't deactivate yourself" });
      return;
    }
    auth.deactivateEmployee(empId);
    toast({ title: 'Employee deactivated' });
  };

  const handleReactivate = (empId: string) => {
    auth.updateEmployee(empId, { isActive: true });
    toast({ title: 'Employee reactivated' });
  };

  const activityIcon = (action: string) => {
    switch (action) {
      case 'login': return <LogIn className="size-3 text-emerald-600" />;
      case 'logout': return <LogOut className="size-3 text-slate-500" />;
      case 'timeout': return <Clock className="size-3 text-amber-600" />;
      case 'pin-change': return <Key className="size-3 text-blue-600" />;
      case 'employee-create': return <Plus className="size-3 text-emerald-600" />;
      case 'employee-update': return <Edit className="size-3 text-blue-600" />;
      case 'employee-deactivate': return <UserX className="size-3 text-red-600" />;
      default: return <Activity className="size-3 text-muted-foreground" />;
    }
  };

  const activityColor = (action: string) => {
    switch (action) {
      case 'login': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'logout': return 'bg-slate-50 text-slate-600 border-slate-200';
      case 'timeout': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'pin-change': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'employee-create': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'employee-deactivate': return 'bg-red-50 text-red-700 border-red-200';
      default: return 'bg-secondary text-secondary-foreground border-border';
    }
  };

  const roleColor = (role: string) => ROLES.find((r) => r.value === role)?.color || '';

  const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'last-month', label: 'Last Month' },
    { value: '30-days', label: 'Last 30 Days' },
    { value: 'all', label: 'All Time' },
  ];

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: 'Total', value: stats.total, icon: Users },
          { label: 'Active', value: stats.active, icon: UserCheck },
          { label: 'Admins', value: stats.admins, icon: Shield },
          { label: 'Managers', value: stats.managers, icon: Shield },
          { label: 'Cashiers', value: stats.cashiers, icon: Shield },
          { label: 'Buyers', value: stats.buyers, icon: Shield },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="pt-3 pb-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="size-3.5 text-muted-foreground" />
                  <p className="text-[10px] text-muted-foreground font-medium">{s.label}</p>
                </div>
                <p className="text-lg font-bold font-mono tabular-nums">{s.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="employees" className="text-[11px] h-7 px-3">
            <Users className="size-3 mr-1.5" />Employees
          </TabsTrigger>
          <TabsTrigger value="performance" className="text-[11px] h-7 px-3">
            <BarChart3 className="size-3 mr-1.5" />Performance
          </TabsTrigger>
          <TabsTrigger value="roles" className="text-[11px] h-7 px-3">
            <Shield className="size-3 mr-1.5" />Roles & Permissions
          </TabsTrigger>
          <TabsTrigger value="activity" className="text-[11px] h-7 px-3">
            <Activity className="size-3 mr-1.5" />Login Activity
          </TabsTrigger>
        </TabsList>

        {/* ═══ EMPLOYEES TAB ═══ */}
        <TabsContent value="employees" className="mt-3 space-y-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input placeholder="Search by name, email, or role…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-[12px]" />
                </div>
                <Button size="sm" variant={showInactive ? 'default' : 'outline'} className="h-9 text-[11px]" onClick={() => setShowInactive(!showInactive)}>
                  <UserX className="size-3.5 mr-1" />{showInactive ? 'Showing Inactive' : 'Show Inactive'}
                </Button>
                <Button size="sm" className="h-9 ml-auto" onClick={() => setShowAdd(true)}>
                  <Plus className="size-3.5 mr-1.5" />Add Employee
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {filteredEmployees.map((emp) => (
              <Card key={emp.id} className={!emp.isActive ? 'opacity-60' : ''}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`size-10 rounded-full flex items-center justify-center ${emp.isActive ? 'bg-primary/10' : 'bg-muted'}`}>
                        <span className={`text-[11px] font-bold ${emp.isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                          {emp.fullName.split(' ').map((n) => n[0]).join('')}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-semibold">{emp.fullName}</p>
                          {emp.id === auth.employee?.id && <Badge className="text-[8px] bg-primary/10 text-primary border-0">You</Badge>}
                          {!emp.isActive && <Badge variant="destructive" className="text-[8px]">Inactive</Badge>}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <span>{emp.email}</span>
                          <span>·</span>
                          <span className="font-mono">{emp.id}</span>
                          <span>·</span>
                          <span>Since {formatDateTime(emp.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-semibold px-2 py-0.5 rounded border capitalize ${roleColor(emp.role)}`}>
                        {emp.role}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                        PIN: {'•'.repeat(emp.pin.length)}
                      </span>
                      <div className="flex gap-1 ml-2">
                        <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => openEdit(emp.id)}>
                          <Edit className="size-3 mr-1" />Edit
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => openResetPin(emp.id)}>
                          <Key className="size-3 mr-1" />Reset PIN
                        </Button>
                        {emp.isActive && emp.id !== auth.employee?.id && (
                          <Button size="sm" variant="ghost" className="h-7 text-[10px] text-destructive hover:text-destructive" onClick={() => handleDeactivate(emp.id)}>
                            <UserX className="size-3 mr-1" />Deactivate
                          </Button>
                        )}
                        {!emp.isActive && (
                          <Button size="sm" variant="ghost" className="h-7 text-[10px] text-emerald-600 hover:text-emerald-700" onClick={() => handleReactivate(emp.id)}>
                            <UserCheck className="size-3 mr-1" />Reactivate
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredEmployees.length === 0 && (
              <Card>
                <CardContent className="pt-12 pb-12">
                  <div className="text-center">
                    <Users className="size-10 mx-auto text-muted-foreground/20 mb-2" />
                    <p className="text-[13px] text-muted-foreground">No employees found</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ═══ PERFORMANCE TAB ═══ */}
        <TabsContent value="performance" className="mt-3 space-y-4">
          {/* Date range + summary KPIs */}
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-primary" />
              <span className="text-[12px] font-semibold">Date Range:</span>
            </div>
            <div className="flex gap-1">
              {DATE_RANGE_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  size="sm"
                  variant={perfDateRange === opt.value ? 'default' : 'outline'}
                  className="h-7 text-[10px] px-2.5"
                  onClick={() => setPerfDateRange(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total Transactions', value: String(perfTotals.totalTransactions), icon: Hash, color: 'text-blue-600 bg-blue-50' },
              { label: 'Sales Revenue', value: formatCurrency(perfTotals.totalRevenue), icon: DollarSign, color: 'text-emerald-600 bg-emerald-50' },
              { label: 'Purchase Spend', value: formatCurrency(perfTotals.totalPurchases), icon: ShoppingCart, color: 'text-orange-600 bg-orange-50' },
              { label: 'Total Logins', value: String(perfTotals.totalLogins), icon: LogIn, color: 'text-purple-600 bg-purple-50' },
            ].map((kpi) => {
              const Icon = kpi.icon;
              return (
                <Card key={kpi.label}>
                  <CardContent className="pt-3 pb-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] text-muted-foreground font-medium">{kpi.label}</p>
                      <div className={`size-7 rounded-lg flex items-center justify-center ${kpi.color}`}><Icon className="size-3.5" /></div>
                    </div>
                    <p className="text-xl font-bold font-mono tabular-nums">{kpi.value}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Per-employee breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[14px] flex items-center gap-2">
                  <TrendingUp className="size-4 text-primary" />Employee Performance
                </CardTitle>
                <Badge variant="outline" className="text-[9px]">{performanceData.length} active employees</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pr-3 text-muted-foreground font-semibold">Employee</th>
                      <th className="pb-2 px-2 text-muted-foreground font-semibold text-center">Role</th>
                      <th className="pb-2 px-2 text-muted-foreground font-semibold text-right">Sales</th>
                      <th className="pb-2 px-2 text-muted-foreground font-semibold text-right">Revenue</th>
                      <th className="pb-2 px-2 text-muted-foreground font-semibold text-right">Avg Sale</th>
                      <th className="pb-2 px-2 text-muted-foreground font-semibold text-right">Purchases</th>
                      <th className="pb-2 px-2 text-muted-foreground font-semibold text-right">Purch. Total</th>
                      <th className="pb-2 px-2 text-muted-foreground font-semibold text-right">Returns</th>
                      <th className="pb-2 px-2 text-muted-foreground font-semibold text-right">Visits</th>
                      <th className="pb-2 px-2 text-muted-foreground font-semibold text-right">Logins</th>
                      <th className="pb-2 pl-2 text-muted-foreground font-semibold text-right">Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performanceData.map((d, idx) => {
                      const isTop = idx === 0 && d.salesRevenue > 0;
                      return (
                        <tr key={d.employee.id} className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${isTop ? 'bg-emerald-50/40' : ''}`}>
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-2">
                              <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-[9px] font-bold text-primary">
                                  {d.employee.fullName.split(' ').map((n) => n[0]).join('')}
                                </span>
                              </div>
                              <div>
                                <div className="flex items-center gap-1">
                                  <span className="font-semibold text-[12px]">{d.employee.fullName}</span>
                                  {isTop && <ArrowUpRight className="size-3 text-emerald-600" />}
                                </div>
                                <span className="text-[9px] text-muted-foreground font-mono">{d.employee.id}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded border capitalize ${roleColor(d.employee.role)}`}>
                              {d.employee.role}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-semibold tabular-nums">
                            {d.salesCount}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-semibold tabular-nums text-emerald-700">
                            {formatCurrency(d.salesRevenue)}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-muted-foreground">
                            {d.avgSaleValue > 0 ? formatCurrency(d.avgSaleValue) : '—'}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-semibold tabular-nums">
                            {d.purchaseCount}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-orange-700">
                            {formatCurrency(d.purchaseTotal)}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                            {d.returnCount > 0 ? (
                              <span className="text-red-600">{d.returnCount}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                            {d.visitCount}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                            {d.loginCount}
                          </td>
                          <td className="py-2.5 pl-2 text-right text-[10px] text-muted-foreground">
                            {d.lastActive ? formatDateTime(d.lastActive) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Totals row */}
                  <tfoot>
                    <tr className="border-t-2 font-bold">
                      <td className="pt-2.5 pr-3 text-[12px]" colSpan={2}>Totals</td>
                      <td className="pt-2.5 px-2 text-right font-mono tabular-nums">
                        {performanceData.reduce((s, d) => s + d.salesCount, 0)}
                      </td>
                      <td className="pt-2.5 px-2 text-right font-mono tabular-nums text-emerald-700">
                        {formatCurrency(perfTotals.totalRevenue)}
                      </td>
                      <td className="pt-2.5 px-2 text-right font-mono tabular-nums text-muted-foreground">
                        {perfTotals.totalRevenue > 0 && performanceData.reduce((s, d) => s + d.salesCount, 0) > 0
                          ? formatCurrency(perfTotals.totalRevenue / performanceData.reduce((s, d) => s + d.salesCount, 0))
                          : '—'}
                      </td>
                      <td className="pt-2.5 px-2 text-right font-mono tabular-nums">
                        {performanceData.reduce((s, d) => s + d.purchaseCount, 0)}
                      </td>
                      <td className="pt-2.5 px-2 text-right font-mono tabular-nums text-orange-700">
                        {formatCurrency(perfTotals.totalPurchases)}
                      </td>
                      <td className="pt-2.5 px-2 text-right font-mono tabular-nums text-red-600">
                        {performanceData.reduce((s, d) => s + d.returnCount, 0)}
                      </td>
                      <td className="pt-2.5 px-2 text-right font-mono tabular-nums">
                        {performanceData.reduce((s, d) => s + d.visitCount, 0)}
                      </td>
                      <td className="pt-2.5 px-2 text-right font-mono tabular-nums">
                        {perfTotals.totalLogins}
                      </td>
                      <td className="pt-2.5 pl-2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Per-employee detail cards */}
          <div className="grid grid-cols-3 gap-3">
            {performanceData.slice(0, 6).map((d) => (
              <Card key={d.employee.id} className="hover:border-primary/20 transition-colors">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-primary">
                        {d.employee.fullName.split(' ').map((n) => n[0]).join('')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold truncate">{d.employee.fullName}</p>
                      <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded border capitalize ${roleColor(d.employee.role)}`}>
                        {d.employee.role}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-emerald-50/60 rounded-md p-2">
                      <p className="text-[9px] text-muted-foreground">Revenue</p>
                      <p className="text-[12px] font-bold font-mono tabular-nums text-emerald-700">{formatCurrency(d.salesRevenue)}</p>
                    </div>
                    <div className="bg-blue-50/60 rounded-md p-2">
                      <p className="text-[9px] text-muted-foreground">Transactions</p>
                      <p className="text-[12px] font-bold font-mono tabular-nums">{d.totalTransactions}</p>
                    </div>
                    <div className="bg-orange-50/60 rounded-md p-2">
                      <p className="text-[9px] text-muted-foreground">Avg Sale</p>
                      <p className="text-[12px] font-bold font-mono tabular-nums">{d.avgSaleValue > 0 ? formatCurrency(d.avgSaleValue) : '—'}</p>
                    </div>
                    <div className="bg-purple-50/60 rounded-md p-2">
                      <p className="text-[9px] text-muted-foreground">Logins</p>
                      <p className="text-[12px] font-bold font-mono tabular-nums">{d.loginCount}</p>
                    </div>
                  </div>
                  {d.lastActive && (
                    <p className="text-[9px] text-muted-foreground mt-2 text-center">
                      Last active: {formatDateTime(d.lastActive)}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ═══ ROLES TAB ═══ */}
        <TabsContent value="roles" className="mt-3 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {ROLES.map((role) => (
              <Card key={role.value}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="size-4 text-primary" />
                    <h3 className="text-[14px] font-bold capitalize">{role.label}</h3>
                    <Badge variant="outline" className="text-[9px] ml-auto">
                      {auth.employees.filter((e) => e.isActive && e.role === role.value).length} users
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-3">{role.description}</p>
                  <div className="space-y-1">
                    {role.value === 'admin' ? (
                      <div className="flex items-center gap-2 px-2 py-1 bg-emerald-50 rounded text-[10px] text-emerald-700">
                        <Shield className="size-3" />
                        <span className="font-medium">Full Access — All Modules</span>
                      </div>
                    ) : (
                      <>
                        {['dashboard', 'customer', 'purchases', 'sales', 'inventory', 'returns', 'payment-changes', 'purchase-changes', 'drawer', 'reports', 'audit', 'settings', 'users'].map((mod) => {
                          const hasAccess = (() => {
                            const rolePerms: Record<string, string[]> = {
                              manager: ['dashboard', 'customer', 'purchases', 'sales', 'inventory', 'returns', 'payment-changes', 'purchase-changes', 'drawer', 'reports', 'audit'],
                              cashier: ['dashboard', 'sales', 'customer', 'drawer', 'returns', 'inventory'],
                              buyer: ['dashboard', 'customer', 'purchases', 'inventory', 'drawer'],
                            };
                            return (rolePerms[role.value] || []).includes(mod);
                          })();
                          return (
                            <div key={mod} className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] ${
                              hasAccess ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-400'
                            }`}>
                              {hasAccess
                                ? <UserCheck className="size-3" />
                                : <UserX className="size-3" />}
                              <span className="capitalize">{mod.replace('-', ' ')}</span>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ═══ ACTIVITY TAB ═══ */}
        <TabsContent value="activity" className="mt-3 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[14px]">Login & Security Activity</CardTitle>
                <Badge variant="outline" className="text-[9px] font-mono">{filteredActivity.length} entries</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input placeholder="Search activity…" value={activitySearch} onChange={(e) => setActivitySearch(e.target.value)} className="pl-9 h-9 text-[12px]" />
              </div>

              {filteredActivity.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                  <Activity className="size-10 mx-auto text-muted-foreground/20 mb-2" />
                  <p className="text-[13px] text-muted-foreground">No activity logged yet</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-[calc(100vh-380px)] overflow-y-auto">
                  {filteredActivity.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/30 transition-colors">
                      <div className="size-6 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                        {activityIcon(log.action)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${activityColor(log.action)}`}>
                            {log.action.toUpperCase()}
                          </span>
                          <span className="text-[11px] font-medium">{log.employeeName}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{log.details}</p>
                        <span className="text-[9px] font-mono text-muted-foreground">{formatDateTime(log.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ ADD EMPLOYEE DIALOG ═══ */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Employee</DialogTitle></DialogHeader>
          <div className="grid gap-3 mt-2">
            <div>
              <Label className="text-[11px]">Full Name *</Label>
              <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="mt-1 h-9 text-[12px]" placeholder="John Smith" />
            </div>
            <div>
              <Label className="text-[11px]">Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 h-9 text-[12px]" placeholder="john@paymore.ca" />
            </div>
            <div>
              <Label className="text-[11px]">PIN (4-6 digits) *</Label>
              <Input type="password" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                className="mt-1 h-9 text-[12px] font-mono" placeholder="••••" maxLength={6} />
            </div>
            <div>
              <Label className="text-[11px]">Role *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as EmployeeRole })}>
                <SelectTrigger className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <span className="capitalize">{r.label}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">— {r.description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleAdd} className="mt-3 w-full h-10">Create Employee</Button>
        </DialogContent>
      </Dialog>

      {/* ═══ EDIT EMPLOYEE DIALOG ═══ */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Employee</DialogTitle></DialogHeader>
          <div className="grid gap-3 mt-2">
            <div>
              <Label className="text-[11px]">Full Name *</Label>
              <Input value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} className="mt-1 h-9 text-[12px]" />
            </div>
            <div>
              <Label className="text-[11px]">Email *</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="mt-1 h-9 text-[12px]" />
            </div>
            <div>
              <Label className="text-[11px]">Role *</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v as EmployeeRole })}>
                <SelectTrigger className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}><span className="capitalize">{r.label}</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleEdit} className="mt-3 w-full h-10">Save Changes</Button>
        </DialogContent>
      </Dialog>

      {/* ═══ RESET PIN DIALOG ═══ */}
      <Dialog open={showResetPin} onOpenChange={setShowResetPin}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Reset Employee PIN</DialogTitle></DialogHeader>
          <div className="mt-2">
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
              <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800">This will immediately change the PIN for {auth.getEmployeeById(selectedEmpId || '')?.fullName}. They will need to use the new PIN to log in.</p>
            </div>
            <Label className="text-[11px]">New PIN (4-6 digits)</Label>
            <Input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mt-1 h-9 text-[12px] font-mono" placeholder="••••" maxLength={6} />
          </div>
          <Button onClick={handleResetPin} className="mt-3 w-full h-10">Reset PIN</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
