import { useState, useMemo } from 'react';
import { usePosStore } from '@/stores/posStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BarChart3, TrendingUp, TrendingDown, Package, Users, DollarSign,
  Search, Calendar, ArrowUpDown, Filter, ShoppingCart, ArrowDown, ArrowUp,
  Clock, AlertTriangle,
} from 'lucide-react';
import { formatCurrency, formatDate, formatDateTime, round2 } from '@/lib/taxCalc';

type DatePreset = 'today' | 'yesterday' | 'this-week' | 'this-month' | 'last-month' | 'last-30' | 'all-time' | 'custom';

function getDateRange(preset: DatePreset, customFrom?: string, customTo?: string): { from: Date; to: Date; label: string } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case 'today':
      return { from: todayStart, to: todayEnd, label: 'Today' };
    case 'yesterday': {
      const yd = new Date(todayStart);
      yd.setDate(yd.getDate() - 1);
      const yde = new Date(yd);
      yde.setHours(23, 59, 59, 999);
      return { from: yd, to: yde, label: 'Yesterday' };
    }
    case 'this-week': {
      const day = todayStart.getDay();
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1));
      return { from: weekStart, to: todayEnd, label: 'This Week' };
    }
    case 'this-month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: monthStart, to: todayEnd, label: 'This Month' };
    }
    case 'last-month': {
      const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: lmStart, to: lmEnd, label: 'Last Month' };
    }
    case 'last-30': {
      const d30 = new Date(todayStart);
      d30.setDate(d30.getDate() - 30);
      return { from: d30, to: todayEnd, label: 'Last 30 Days' };
    }
    case 'custom': {
      const f = customFrom ? new Date(customFrom) : new Date(2020, 0, 1);
      const t = customTo ? new Date(customTo + 'T23:59:59.999') : todayEnd;
      return { from: f, to: t, label: 'Custom Range' };
    }
    default:
      return { from: new Date(2020, 0, 1), to: todayEnd, label: 'All Time' };
  }
}

function isInRange(iso: string | null | undefined, from: Date, to: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d >= from && d <= to;
}

type SortKey = 'revenue' | 'cost' | 'profit' | 'margin' | 'qty';

export default function ReportsPage() {
  const pos = usePosStore();

  const [activeTab, setActiveTab] = useState('overview');
  const [datePreset, setDatePreset] = useState<DatePreset>('all-time');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Product profit search + sort
  const [productSearch, setProductSearch] = useState('');
  const [productSort, setProductSort] = useState<SortKey>('profit');
  const [productSortDir, setProductSortDir] = useState<'asc' | 'desc'>('desc');
  const [productCatFilter, setProductCatFilter] = useState('all');

  const { from, to, label } = getDateRange(datePreset, customFrom, customTo);

  // ══════════════════════════════════════════
  // OVERVIEW DATA
  // ══════════════════════════════════════════
  const data = useMemo(() => {
    const completedSales = pos.sales.filter((s) => s.status === 'completed' && isInRange(s.completedAt || s.createdAt, from, to));
    const completedPurchases = pos.purchases.filter((p) => p.status === 'completed' && isInRange(p.createdAt, from, to));
    const completedReturns = pos.returns.filter((r) => r.status === 'completed' && isInRange(r.completedAt || r.createdAt, from, to));
    const allSaleItems = pos.saleItems.filter((si) => completedSales.some((s) => s.id === si.salesTransactionId));

    const totalRevenue = round2(completedSales.reduce((s, sl) => s + sl.totalAmount, 0));
    const subtotalRevenue = round2(completedSales.reduce((s, sl) => s + sl.subtotal, 0));
    const totalGst = round2(completedSales.reduce((s, sl) => s + sl.gstTotal, 0));
    const totalPst = round2(completedSales.reduce((s, sl) => s + sl.pstTotal, 0));
    const totalCOGS = round2(allSaleItems.reduce((s, si) => s + si.costPerUnitSnapshot * si.quantity, 0));
    const grossProfit = round2(subtotalRevenue - totalCOGS);
    const grossMargin = subtotalRevenue > 0 ? round2((grossProfit / subtotalRevenue) * 100) : 0;
    const totalPurchaseSpend = round2(completedPurchases.reduce((s, p) => s + p.totalAmount, 0));
    const totalReturnAmount = round2(completedReturns.reduce((s, r) => s + r.returnAmount, 0));
    const unitsSold = allSaleItems.reduce((s, i) => s + i.quantity, 0);
    const unitsBought = pos.purchaseItems.filter((i) =>
      i.isDeal && completedPurchases.some((p) => p.id === i.purchaseTransactionId)
    ).length;
    const avgSaleValue = completedSales.length > 0 ? round2(totalRevenue / completedSales.length) : 0;

    // Category breakdown
    const categorySales: Record<string, { revenue: number; cost: number; qty: number; profit: number }> = {};
    allSaleItems.forEach((si) => {
      if (!categorySales[si.category]) categorySales[si.category] = { revenue: 0, cost: 0, qty: 0, profit: 0 };
      const rev = si.unitPrice * si.quantity;
      const cost = si.costPerUnitSnapshot * si.quantity;
      categorySales[si.category].revenue += rev;
      categorySales[si.category].cost += cost;
      categorySales[si.category].qty += si.quantity;
      categorySales[si.category].profit += rev - cost;
    });

    // Payment method breakdown
    const salePaymentBreakdown: Record<string, number> = {};
    completedSales.forEach((sale) => {
      const payments = pos.salePayments.filter((p) => p.transactionId === sale.id);
      payments.forEach((p) => {
        salePaymentBreakdown[p.method] = (salePaymentBreakdown[p.method] || 0) + p.amount;
      });
    });

    // Top customers by spend
    const customerSpend: Record<string, { name: string; amount: number; txCount: number }> = {};
    completedSales.forEach((sale) => {
      if (!sale.customerId) return;
      const cust = pos.customers.find((c) => c.id === sale.customerId);
      if (!cust) return;
      const key = sale.customerId;
      if (!customerSpend[key]) customerSpend[key] = { name: `${cust.firstName} ${cust.lastName}`, amount: 0, txCount: 0 };
      customerSpend[key].amount += sale.totalAmount;
      customerSpend[key].txCount += 1;
    });
    const topCustomers = Object.values(customerSpend).sort((a, b) => b.amount - a.amount).slice(0, 5);

    return {
      totalRevenue, subtotalRevenue, totalGst, totalPst, totalCOGS, grossProfit, grossMargin,
      totalPurchaseSpend, totalReturnAmount, unitsSold, unitsBought, avgSaleValue,
      salesCount: completedSales.length,
      purchaseCount: completedPurchases.length,
      returnCount: completedReturns.length,
      customerCount: pos.customers.length,
      categorySales, salePaymentBreakdown, topCustomers,
    };
  }, [pos, from, to]);

  // ══════════════════════════════════════════
  // PRODUCT-WISE PROFIT DATA
  // ══════════════════════════════════════════
  const productProfitData = useMemo(() => {
    const completedSales = pos.sales.filter((s) => s.status === 'completed' && isInRange(s.completedAt || s.createdAt, from, to));
    const allSaleItems = pos.saleItems.filter((si) => completedSales.some((s) => s.id === si.salesTransactionId));

    // Group by inventoryItemId or by brand+model key
    const productMap: Record<string, {
      key: string;
      deviceCode: string;
      brand: string;
      model: string;
      category: string;
      serialImei: string;
      revenue: number;
      cost: number;
      qty: number;
      profit: number;
      margin: number;
    }> = {};

    allSaleItems.forEach((si) => {
      // Use inventory ID if available, otherwise brand+model combo
      const inv = si.inventoryItemId ? pos.inventory.find((i) => i.id === si.inventoryItemId) : null;
      const key = si.inventoryItemId || `${si.brand}-${si.model}-${si.serialImei}`;
      const deviceCode = inv?.deviceCode || '—';

      if (!productMap[key]) {
        productMap[key] = {
          key,
          deviceCode,
          brand: si.brand,
          model: si.model,
          category: si.category,
          serialImei: si.serialImei,
          revenue: 0,
          cost: 0,
          qty: 0,
          profit: 0,
          margin: 0,
        };
      }

      const rev = si.unitPrice * si.quantity;
      const cost = si.costPerUnitSnapshot * si.quantity;
      productMap[key].revenue += rev;
      productMap[key].cost += cost;
      productMap[key].qty += si.quantity;
      productMap[key].profit += rev - cost;
    });

    // Calculate margins
    Object.values(productMap).forEach((p) => {
      p.revenue = round2(p.revenue);
      p.cost = round2(p.cost);
      p.profit = round2(p.profit);
      p.margin = p.revenue > 0 ? round2((p.profit / p.revenue) * 100) : 0;
    });

    let results = Object.values(productMap);

    // Filter by category
    if (productCatFilter !== 'all') {
      results = results.filter((p) => p.category === productCatFilter);
    }

    // Search
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      results = results.filter((p) =>
        p.brand.toLowerCase().includes(q) ||
        p.model.toLowerCase().includes(q) ||
        p.deviceCode.toLowerCase().includes(q) ||
        p.serialImei.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q)
      );
    }

    // Sort
    results.sort((a, b) => {
      const mult = productSortDir === 'desc' ? -1 : 1;
      switch (productSort) {
        case 'revenue': return mult * (a.revenue - b.revenue);
        case 'cost': return mult * (a.cost - b.cost);
        case 'profit': return mult * (a.profit - b.profit);
        case 'margin': return mult * (a.margin - b.margin);
        case 'qty': return mult * (a.qty - b.qty);
        default: return 0;
      }
    });

    // Totals
    const totals = results.reduce(
      (acc, p) => ({
        revenue: acc.revenue + p.revenue,
        cost: acc.cost + p.cost,
        profit: acc.profit + p.profit,
        qty: acc.qty + p.qty,
      }),
      { revenue: 0, cost: 0, profit: 0, qty: 0 }
    );

    return { products: results, totals: { ...totals, margin: totals.revenue > 0 ? round2((totals.profit / totals.revenue) * 100) : 0 } };
  }, [pos, from, to, productSearch, productSort, productSortDir, productCatFilter]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    pos.saleItems.forEach((si) => cats.add(si.category));
    return Array.from(cats).sort();
  }, [pos.saleItems]);

  const toggleSort = (key: SortKey) => {
    if (productSort === key) {
      setProductSortDir(productSortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setProductSort(key);
      setProductSortDir('desc');
    }
  };

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <button
      onClick={() => toggleSort(sortKey)}
      className="flex items-center gap-1 text-[10px] font-bold uppercase cursor-pointer hover:text-primary transition-colors"
    >
      {label}
      <ArrowUpDown className={`size-3 ${productSort === sortKey ? 'text-primary' : 'text-muted-foreground/40'}`} />
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Date Filter Bar */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Calendar className="size-4 text-primary" />
              <span className="text-[12px] font-semibold">Period:</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {([
                { value: 'today', label: 'Today' },
                { value: 'yesterday', label: 'Yesterday' },
                { value: 'this-week', label: 'This Week' },
                { value: 'this-month', label: 'This Month' },
                { value: 'last-month', label: 'Last Month' },
                { value: 'last-30', label: 'Last 30 Days' },
                { value: 'all-time', label: 'All Time' },
                { value: 'custom', label: 'Custom' },
              ] as { value: DatePreset; label: string }[]).map((preset) => (
                <Button
                  key={preset.value}
                  size="sm"
                  variant={datePreset === preset.value ? 'default' : 'outline'}
                  className="h-7 text-[10px] px-2.5"
                  onClick={() => setDatePreset(preset.value)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            {datePreset === 'custom' && (
              <div className="flex items-center gap-2 ml-2">
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-7 text-[11px] w-36" />
                <span className="text-[10px] text-muted-foreground">to</span>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-7 text-[11px] w-36" />
              </div>
            )}
            <Badge variant="outline" className="text-[10px] ml-auto">{label}</Badge>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="overview" className="text-[11px] h-7 px-3">
            <BarChart3 className="size-3 mr-1.5" />P&L Overview
          </TabsTrigger>
          <TabsTrigger value="product-profit" className="text-[11px] h-7 px-3">
            <Package className="size-3 mr-1.5" />Profit by Product
          </TabsTrigger>
          <TabsTrigger value="inventory-aging" className="text-[11px] h-7 px-3">
            <Clock className="size-3 mr-1.5" />Inventory Aging
          </TabsTrigger>
        </TabsList>

        {/* ═══ P&L OVERVIEW ═══ */}
        <TabsContent value="overview" className="mt-3 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Revenue', value: formatCurrency(data.totalRevenue), sub: `${data.salesCount} sales`, icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
              { label: 'Cost of Goods', value: formatCurrency(data.totalCOGS), sub: `${data.unitsSold} units sold`, icon: TrendingDown, color: 'text-orange-600 bg-orange-50' },
              { label: 'Gross Profit', value: formatCurrency(data.grossProfit), sub: `Avg sale: ${formatCurrency(data.avgSaleValue)}`, icon: DollarSign, color: 'text-primary bg-primary/10' },
              { label: 'Gross Margin', value: `${data.grossMargin}%`, sub: `Tax collected: ${formatCurrency(data.totalGst + data.totalPst)}`, icon: BarChart3, color: 'text-blue-600 bg-blue-50' },
            ].map((kpi) => {
              const Icon = kpi.icon;
              return (
                <Card key={kpi.label}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-[11px] text-muted-foreground font-medium">{kpi.label}</p>
                      <div className={`size-8 rounded-lg flex items-center justify-center ${kpi.color}`}><Icon className="size-4" /></div>
                    </div>
                    <p className="text-2xl font-bold font-mono tabular-nums">{kpi.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Secondary KPIs */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'Purchase Spend', value: formatCurrency(data.totalPurchaseSpend), icon: ArrowDown, color: 'text-orange-600 bg-orange-50' },
              { label: 'Units Bought', value: String(data.unitsBought), icon: ArrowDown, color: 'text-amber-600 bg-amber-50' },
              { label: 'GST Collected', value: formatCurrency(data.totalGst), icon: DollarSign, color: 'text-slate-600 bg-slate-50' },
              { label: 'PST Collected', value: formatCurrency(data.totalPst), icon: DollarSign, color: 'text-slate-600 bg-slate-50' },
              { label: 'Returns', value: `${data.returnCount} (${formatCurrency(data.totalReturnAmount)})`, icon: TrendingDown, color: 'text-red-600 bg-red-50' },
            ].map((kpi) => {
              const Icon = kpi.icon;
              return (
                <Card key={kpi.label}>
                  <CardContent className="pt-3 pb-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className={`size-5 rounded flex items-center justify-center ${kpi.color}`}><Icon className="size-3" /></div>
                      <p className="text-[10px] text-muted-foreground font-medium">{kpi.label}</p>
                    </div>
                    <p className="text-lg font-bold font-mono tabular-nums">{kpi.value}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-12 gap-4">
            {/* Category Profit */}
            <div className="col-span-7">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-[14px]">Profit by Category</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(data.categorySales)
                      .sort(([, a], [, b]) => b.profit - a.profit)
                      .map(([cat, d]) => {
                        const margin = d.revenue > 0 ? round2((d.profit / d.revenue) * 100) : 0;
                        const barWidth = data.grossProfit > 0 ? Math.max(5, (d.profit / data.grossProfit) * 100) : 0;
                        return (
                          <div key={cat} className="p-3 bg-secondary/40 rounded-lg">
                            <div className="flex items-center justify-between mb-1.5">
                              <div>
                                <p className="text-[13px] font-medium">{cat}</p>
                                <p className="text-[10px] text-muted-foreground">{d.qty} units · Revenue {formatCurrency(round2(d.revenue))} · Cost {formatCurrency(round2(d.cost))}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-mono text-[14px] font-bold tabular-nums text-primary">{formatCurrency(round2(d.profit))}</p>
                                <p className="text-[10px] text-muted-foreground">{margin}% margin</p>
                              </div>
                            </div>
                            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${barWidth}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    {Object.keys(data.categorySales).length === 0 && (
                      <p className="text-center text-muted-foreground text-[12px] py-6">No sales data for this period</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Payment Methods + Top Customers */}
            <div className="col-span-5 space-y-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-[14px]">Payment Methods</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(data.salePaymentBreakdown)
                      .sort(([, a], [, b]) => b - a)
                      .map(([method, amount]) => (
                        <div key={method} className="flex items-center justify-between px-3 py-2 bg-secondary/40 rounded">
                          <span className="text-[12px] capitalize font-medium">{method}</span>
                          <span className="font-mono text-[12px] font-semibold tabular-nums">{formatCurrency(round2(amount))}</span>
                        </div>
                      ))}
                    {Object.keys(data.salePaymentBreakdown).length === 0 && (
                      <p className="text-center text-muted-foreground text-[11px] py-4">No payments in this period</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-[14px]">Top Customers</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {data.topCustomers.map((c, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 bg-secondary/40 rounded">
                        <div>
                          <p className="text-[12px] font-medium">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground">{c.txCount} transaction{c.txCount !== 1 ? 's' : ''}</p>
                        </div>
                        <span className="font-mono text-[13px] font-bold tabular-nums text-primary">{formatCurrency(round2(c.amount))}</span>
                      </div>
                    ))}
                    {data.topCustomers.length === 0 && (
                      <p className="text-center text-muted-foreground text-[11px] py-4">No customer sales in this period</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-[14px]">Operations Summary</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {[
                      { label: 'Total Sales', value: String(data.salesCount), icon: ShoppingCart },
                      { label: 'Total Purchases', value: String(data.purchaseCount), icon: ArrowDown },
                      { label: 'Customers', value: String(data.customerCount), icon: Users },
                      { label: 'Returns', value: String(data.returnCount), icon: TrendingDown },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <div key={item.label} className="flex items-center justify-between px-3 py-2 bg-secondary/40 rounded">
                          <div className="flex items-center gap-2">
                            <Icon className="size-3.5 text-muted-foreground" />
                            <span className="text-[12px]">{item.label}</span>
                          </div>
                          <span className="font-mono text-[13px] font-semibold tabular-nums">{item.value}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ═══ PRODUCT PROFIT ═══ */}
        <TabsContent value="product-profit" className="mt-3 space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'Products Sold', value: String(productProfitData.totals.qty), color: 'text-blue-600 bg-blue-50' },
              { label: 'Total Revenue', value: formatCurrency(round2(productProfitData.totals.revenue)), color: 'text-emerald-600 bg-emerald-50' },
              { label: 'Total Cost', value: formatCurrency(round2(productProfitData.totals.cost)), color: 'text-orange-600 bg-orange-50' },
              { label: 'Total Profit', value: formatCurrency(round2(productProfitData.totals.profit)), color: 'text-primary bg-primary/10' },
              { label: 'Avg Margin', value: `${productProfitData.totals.margin}%`, color: 'text-blue-600 bg-blue-50' },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="pt-3 pb-2.5">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">{s.label}</p>
                  <p className="text-lg font-bold font-mono tabular-nums">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Search + filters */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by device ID, SKU, brand, model, serial, category…"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-9 h-9 text-[12px]"
                  />
                </div>
                <Select value={productCatFilter} onValueChange={setProductCatFilter}>
                  <SelectTrigger className="h-9 w-40 text-[11px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {productProfitData.products.length} products
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Product table */}
          <Card>
            <CardContent className="p-0">
              <div className="max-h-[calc(100vh-420px)] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24 text-[10px]">Device Code</TableHead>
                      <TableHead className="text-[10px]">Product</TableHead>
                      <TableHead className="w-24 text-[10px]">Category</TableHead>
                      <TableHead className="w-16 text-right">
                        <SortHeader label="Qty" sortKey="qty" />
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        <SortHeader label="Revenue" sortKey="revenue" />
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        <SortHeader label="Cost" sortKey="cost" />
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        <SortHeader label="Profit" sortKey="profit" />
                      </TableHead>
                      <TableHead className="w-20 text-right">
                        <SortHeader label="Margin" sortKey="margin" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productProfitData.products.map((p) => (
                      <TableRow key={p.key} className="text-[12px]">
                        <TableCell className="font-mono text-[10px] text-muted-foreground">{p.deviceCode}</TableCell>
                        <TableCell>
                          <p className="font-medium truncate max-w-[280px]">{p.brand} {p.model}</p>
                          {p.serialImei && <p className="text-[9px] text-muted-foreground font-mono">IMEI: {p.serialImei}</p>}
                        </TableCell>
                        <TableCell className="text-[11px]">{p.category}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{p.qty}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-[11px]">{formatCurrency(p.revenue)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-[11px] text-muted-foreground">{formatCurrency(p.cost)}</TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono tabular-nums font-semibold ${p.profit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                            {formatCurrency(p.profit)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono tabular-nums text-[11px] ${p.margin >= 30 ? 'text-emerald-600' : p.margin >= 15 ? 'text-amber-600' : 'text-red-600'}`}>
                            {p.margin}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {productProfitData.products.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12">
                          <Package className="size-10 mx-auto text-muted-foreground/20 mb-2" />
                          <p className="text-muted-foreground text-[12px]">No products sold in this period</p>
                        </TableCell>
                      </TableRow>
                    )}
                    {/* Totals row */}
                    {productProfitData.products.length > 0 && (
                      <TableRow className="border-t-2 border-primary/20 bg-secondary/30 font-bold">
                        <TableCell className="text-[11px]" colSpan={3}>TOTAL</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-[12px]">{productProfitData.totals.qty}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-[12px]">{formatCurrency(round2(productProfitData.totals.revenue))}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-[12px] text-muted-foreground">{formatCurrency(round2(productProfitData.totals.cost))}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-[12px] text-primary">{formatCurrency(round2(productProfitData.totals.profit))}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-[12px]">{productProfitData.totals.margin}%</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ═══ INVENTORY AGING ═══ */}
        <TabsContent value="inventory-aging" className="mt-3 space-y-4">
          <InventoryAgingTab inventory={pos.inventory} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// INVENTORY AGING TAB (extracted for clarity)
// ═══════════════════════════════════════════════════

interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
}

const AGING_BUCKETS: AgingBucket[] = [
  { label: '0 – 7 days', minDays: 0, maxDays: 7, color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', icon: '🟢' },
  { label: '8 – 30 days', minDays: 8, maxDays: 30, color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', icon: '🔵' },
  { label: '31 – 60 days', minDays: 31, maxDays: 60, color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', icon: '🟡' },
  { label: '60+ days', minDays: 61, maxDays: null, color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200', icon: '🔴' },
];

import type { InventoryItem } from '@/types';

function getDaysInStock(acquiredAt: string): number {
  const now = new Date();
  const acquired = new Date(acquiredAt);
  return Math.max(0, Math.floor((now.getTime() - acquired.getTime()) / (1000 * 60 * 60 * 24)));
}

function InventoryAgingTab({ inventory }: { inventory: InventoryItem[] }) {
  const [expandedBucket, setExpandedBucket] = useState<number | null>(null);
  const [agingSearch, setAgingSearch] = useState('');
  const [agingCatFilter, setAgingCatFilter] = useState('all');

  const availableItems = useMemo(() => {
    return inventory.filter((i) => i.status === 'available' && i.quantityOnHand > 0);
  }, [inventory]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    availableItems.forEach((i) => cats.add(i.category));
    return Array.from(cats).sort();
  }, [availableItems]);

  const agingData = useMemo(() => {
    let filtered = availableItems;

    if (agingCatFilter !== 'all') {
      filtered = filtered.filter((i) => i.category === agingCatFilter);
    }
    if (agingSearch.trim()) {
      const q = agingSearch.toLowerCase();
      filtered = filtered.filter((i) =>
        i.brand.toLowerCase().includes(q) ||
        i.model.toLowerCase().includes(q) ||
        i.deviceCode.toLowerCase().includes(q) ||
        i.serialImei.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
      );
    }

    const buckets = AGING_BUCKETS.map((bucket) => {
      const items = filtered.filter((item) => {
        const days = getDaysInStock(item.acquiredAt);
        if (bucket.maxDays === null) return days >= bucket.minDays;
        return days >= bucket.minDays && days <= bucket.maxDays;
      }).map((item) => ({
        ...item,
        daysInStock: getDaysInStock(item.acquiredAt),
      })).sort((a, b) => b.daysInStock - a.daysInStock);

      const totalCost = round2(items.reduce((s, i) => s + i.costPerUnit * i.quantityOnHand, 0));
      const totalRetail = round2(items.reduce((s, i) => s + i.expectedSalePrice * i.quantityOnHand, 0));
      const totalUnits = items.reduce((s, i) => s + i.quantityOnHand, 0);

      return { ...bucket, items, totalCost, totalRetail, totalUnits };
    });

    const grandTotalCost = round2(buckets.reduce((s, b) => s + b.totalCost, 0));
    const grandTotalRetail = round2(buckets.reduce((s, b) => s + b.totalRetail, 0));
    const grandTotalUnits = buckets.reduce((s, b) => s + b.totalUnits, 0);

    return { buckets, grandTotalCost, grandTotalRetail, grandTotalUnits };
  }, [availableItems, agingSearch, agingCatFilter]);

  // Value at risk = cost of items 31+ days
  const valueAtRisk = round2(
    agingData.buckets
      .filter((b) => b.minDays >= 31)
      .reduce((s, b) => s + b.totalCost, 0)
  );
  const riskPct = agingData.grandTotalCost > 0 ? round2((valueAtRisk / agingData.grandTotalCost) * 100) : 0;

  return (
    <>
      {/* Summary KPIs */}
      <div className="grid grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-3 pb-2.5">
            <p className="text-[10px] text-muted-foreground font-medium mb-1">Available Units</p>
            <p className="text-lg font-bold font-mono tabular-nums">{agingData.grandTotalUnits}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2.5">
            <p className="text-[10px] text-muted-foreground font-medium mb-1">Total Cost</p>
            <p className="text-lg font-bold font-mono tabular-nums">{formatCurrency(agingData.grandTotalCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2.5">
            <p className="text-[10px] text-muted-foreground font-medium mb-1">Total Retail Value</p>
            <p className="text-lg font-bold font-mono tabular-nums">{formatCurrency(agingData.grandTotalRetail)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2.5">
            <div className="flex items-center gap-1 mb-1">
              <AlertTriangle className="size-3 text-amber-500" />
              <p className="text-[10px] text-muted-foreground font-medium">Value at Risk (31+ days)</p>
            </div>
            <p className="text-lg font-bold font-mono tabular-nums text-amber-600">{formatCurrency(valueAtRisk)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2.5">
            <p className="text-[10px] text-muted-foreground font-medium mb-1">At-Risk %</p>
            <p className={`text-lg font-bold font-mono tabular-nums ${riskPct > 40 ? 'text-red-600' : riskPct > 20 ? 'text-amber-600' : 'text-emerald-600'}`}>{riskPct}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by device code, brand, model, serial…"
                value={agingSearch}
                onChange={(e) => setAgingSearch(e.target.value)}
                className="pl-9 h-9 text-[12px]"
              />
            </div>
            <Select value={agingCatFilter} onValueChange={setAgingCatFilter}>
              <SelectTrigger className="h-9 w-40 text-[11px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Aging Buckets */}
      <div className="grid grid-cols-4 gap-4">
        {agingData.buckets.map((bucket, idx) => {
          const isExpanded = expandedBucket === idx;
          const costPct = agingData.grandTotalCost > 0 ? round2((bucket.totalCost / agingData.grandTotalCost) * 100) : 0;
          return (
            <Card key={idx} className={`border ${bucket.borderColor} transition-shadow ${isExpanded ? 'ring-2 ring-primary/20' : ''}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-[13px] flex items-center gap-2">
                  <span>{bucket.icon}</span>
                  <span className={bucket.color}>{bucket.label}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Units</span>
                    <span className="font-mono text-[14px] font-bold tabular-nums">{bucket.totalUnits}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Cost Value</span>
                    <span className={`font-mono text-[13px] font-semibold tabular-nums ${bucket.color}`}>{formatCurrency(bucket.totalCost)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Retail Value</span>
                    <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{formatCurrency(bucket.totalRetail)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${bucket.bgColor.replace('bg-', 'bg-').replace('-50', '-400')}`} style={{ width: `${Math.max(2, costPct)}%` }} />
                  </div>
                  <p className="text-[9px] text-muted-foreground text-center">{costPct}% of total cost</p>
                  {bucket.items.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-7 text-[10px]"
                      onClick={() => setExpandedBucket(isExpanded ? null : idx)}
                    >
                      {isExpanded ? 'Hide items' : `View ${bucket.items.length} items`}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Expanded item table */}
      {expandedBucket !== null && agingData.buckets[expandedBucket].items.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[14px] flex items-center gap-2">
                <span>{agingData.buckets[expandedBucket].icon}</span>
                {agingData.buckets[expandedBucket].label} — {agingData.buckets[expandedBucket].items.length} items
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setExpandedBucket(null)}>Close</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] w-24">Device Code</TableHead>
                    <TableHead className="text-[10px]">Product</TableHead>
                    <TableHead className="text-[10px] w-24">Category</TableHead>
                    <TableHead className="text-[10px] w-20 text-right">Days</TableHead>
                    <TableHead className="text-[10px] w-24 text-right">Cost</TableHead>
                    <TableHead className="text-[10px] w-24 text-right">Retail</TableHead>
                    <TableHead className="text-[10px] w-24 text-right">Potential Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agingData.buckets[expandedBucket].items.map((item) => {
                    const potentialProfit = round2(item.expectedSalePrice - item.costPerUnit);
                    return (
                      <TableRow key={item.id} className="text-[12px]">
                        <TableCell className="font-mono text-[10px] text-muted-foreground">{item.deviceCode}</TableCell>
                        <TableCell>
                          <p className="font-medium truncate max-w-[260px]">{item.brand} {item.model}</p>
                          {item.serialImei && <p className="text-[9px] text-muted-foreground font-mono">S/N: {item.serialImei}</p>}
                        </TableCell>
                        <TableCell className="text-[11px]">{item.category}</TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono tabular-nums font-semibold ${item.daysInStock > 60 ? 'text-red-600' : item.daysInStock > 30 ? 'text-amber-600' : 'text-foreground'}`}>
                            {item.daysInStock}d
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-[11px]">{formatCurrency(item.costPerUnit)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-[11px]">{formatCurrency(item.expectedSalePrice)}</TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono tabular-nums font-semibold text-[11px] ${potentialProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatCurrency(potentialProfit)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
