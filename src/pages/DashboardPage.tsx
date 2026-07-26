import { useMemo } from 'react';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ShoppingCart, Package, DollarSign, Users, TrendingUp,
  RotateCcw, Landmark, ArrowDown, ArrowUp,
} from 'lucide-react';
import { formatCurrency, formatDateTime, isToday } from '@/lib/taxCalc';


export default function DashboardPage() {
  const { employee, store } = useAuthStore();
  const pos = usePosStore();

  const stats = useMemo(() => {
    const todaySales = pos.sales.filter((s) => s.status === 'completed' && isToday(s.completedAt || s.createdAt));
    const todayPurchases = pos.purchases.filter((p) => p.status === 'completed' && isToday(p.createdAt));
    const todayVisits = pos.visits.filter((v) => isToday(v.createdAt));
    const todayReturns = pos.returns.filter((r) => r.status === 'completed' && isToday(r.createdAt));

    const allCompletedSales = pos.sales.filter((s) => s.status === 'completed');
    const allSaleItems = pos.saleItems.filter((si) => allCompletedSales.some((s) => s.id === si.salesTransactionId));

    const totalSalesRevenue = allCompletedSales.reduce((s, sl) => s + sl.totalAmount, 0);
    const totalSalesCost = allSaleItems.reduce((s, si) => s + si.costPerUnitSnapshot * si.quantity, 0);
    const totalProfit = totalSalesRevenue - totalSalesCost;

    const availableInv = pos.inventory.filter((i) => i.status === 'available');
    const inventoryValue = availableInv.reduce((s, i) => s + i.expectedSalePrice * i.quantityOnHand, 0);
    const inventoryCost = availableInv.reduce((s, i) => s + i.costPerUnit * i.quantityOnHand, 0);

    const todaySalesTotal = todaySales.reduce((s, sl) => s + sl.totalAmount, 0);
    const todayPurchasesTotal = todayPurchases.reduce((s, p) => s + p.totalAmount, 0);

    return {
      todaySalesCount: todaySales.length,
      todaySalesTotal,
      todayPurchasesCount: todayPurchases.length,
      todayPurchasesTotal,
      todayVisitsCount: todayVisits.length,
      todayReturnsCount: todayReturns.length,
      unitsBought: pos.purchaseItems.filter((i) => i.isDeal).length,
      unitsSold: allSaleItems.reduce((s, i) => s + i.quantity, 0),
      cashBalance: pos.cashDrawer.currentBalance,
      inventoryCount: availableInv.length,
      inventoryValue,
      inventoryCost,
      estimatedMargin: inventoryValue > 0 ? ((inventoryValue - inventoryCost) / inventoryValue * 100) : 0,
      totalProfit,
    };
  }, [pos]);

  const recentActivity = useMemo(() => {
    return pos.auditLog.slice(0, 8);
  }, [pos.auditLog]);

  const kpis = [
    { label: 'Sales Today', value: formatCurrency(stats.todaySalesTotal), sub: `${stats.todaySalesCount} transactions`, icon: ShoppingCart, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Purchases Today', value: formatCurrency(stats.todayPurchasesTotal), sub: `${stats.todayPurchasesCount} deals`, icon: ArrowDown, color: 'text-orange-600 bg-orange-50' },
    { label: 'Cash Drawer', value: formatCurrency(stats.cashBalance), sub: pos.cashDrawer.isOpen ? 'Open' : 'Closed', icon: Landmark, color: 'text-blue-600 bg-blue-50' },
    { label: 'Visits Today', value: String(stats.todayVisitsCount), sub: 'customer visits', icon: Users, color: 'text-purple-600 bg-purple-50' },
    { label: 'Units Bought', value: String(stats.unitsBought), sub: 'deal devices acquired', icon: ArrowDown, color: 'text-amber-600 bg-amber-50' },
    { label: 'Units Sold', value: String(stats.unitsSold), sub: 'items sold', icon: ArrowUp, color: 'text-teal-600 bg-teal-50' },
    { label: 'Returns Today', value: String(stats.todayReturnsCount), sub: 'processed', icon: RotateCcw, color: 'text-red-600 bg-red-50' },
  ];

  return (
    <div className="space-y-5">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Welcome back, {employee?.fullName.split(' ')[0]}</h1>
          <p className="text-sm text-muted-foreground">{store?.name} · {new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <Badge variant="outline" className="text-[11px] font-mono capitalize">{employee?.role}</Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.slice(0, 4).map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-[11px] font-medium text-muted-foreground">{kpi.label}</p>
                  <div className={`size-8 rounded-lg flex items-center justify-center ${kpi.color}`}>
                    <Icon className="size-4" />
                  </div>
                </div>
                <p className="text-2xl font-bold font-mono tabular-nums">{kpi.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Left: More KPIs + Inventory */}
        <div className="col-span-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {kpis.slice(4).map((kpi) => {
              const Icon = kpi.icon;
              return (
                <Card key={kpi.label}>
                  <CardContent className="pt-3 pb-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`size-6 rounded flex items-center justify-center ${kpi.color}`}>
                        <Icon className="size-3" />
                      </div>
                      <p className="text-[10px] font-medium text-muted-foreground">{kpi.label}</p>
                    </div>
                    <p className="text-lg font-bold font-mono tabular-nums">{kpi.value}</p>
                    <p className="text-[10px] text-muted-foreground">{kpi.sub}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Inventory Summary */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <Package className="size-4 text-primary" />
                <p className="text-[13px] font-semibold">Inventory Overview</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/60 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground">Available Units</p>
                  <p className="text-lg font-bold font-mono tabular-nums">{stats.inventoryCount}</p>
                </div>
                <div className="bg-secondary/60 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground">Estimated Value</p>
                  <p className="text-lg font-bold font-mono tabular-nums">{formatCurrency(stats.inventoryValue)}</p>
                </div>
                <div className="bg-secondary/60 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground">Total Cost</p>
                  <p className="text-lg font-bold font-mono tabular-nums">{formatCurrency(stats.inventoryCost)}</p>
                </div>
                <div className="bg-secondary/60 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground">Est. Margin</p>
                  <p className="text-lg font-bold font-mono tabular-nums text-primary">{stats.estimatedMargin.toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Activity Feed */}
        <div className="col-span-7">
          <Card className="h-full">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-primary" />
                  <p className="text-[13px] font-semibold">Recent Activity</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{pos.auditLog.length} total</Badge>
              </div>
              <div className="space-y-1">
                {recentActivity.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/40 transition-colors">
                    <div className="size-7 rounded-md bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[8px] font-bold text-muted-foreground">{entry.action.slice(0, 3)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-foreground leading-snug truncate">{entry.details}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        <span className="font-medium">{entry.actorName}</span>
                        <span>·</span>
                        <span>{entry.module}</span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">{formatDateTime(entry.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
