import { useState, useMemo } from 'react';
import { usePosStore } from '@/stores/posStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ScrollText } from 'lucide-react';
import { formatDateTime } from '@/lib/taxCalc';

const MODULES = ['All', 'Customer', 'Purchases', 'Sales', 'Inventory', 'Returns', 'Cash Drawer', 'Payment Changes', 'Purchase Changes'];

export default function AuditPage() {
  const { auditLog } = usePosStore();
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('All');

  const filtered = useMemo(() => {
    return auditLog.filter((e) => {
      const matchSearch = !search.trim() || e.details.toLowerCase().includes(search.toLowerCase()) || e.action.toLowerCase().includes(search.toLowerCase()) || e.actorName.toLowerCase().includes(search.toLowerCase());
      const matchModule = moduleFilter === 'All' || e.module === moduleFilter;
      return matchSearch && matchModule;
    });
  }, [auditLog, search, moduleFilter]);

  const actionColor: Record<string, string> = {
    DRAWER_OPEN: 'bg-blue-50 text-blue-700 border-blue-200',
    DRAWER_CLOSE: 'bg-slate-50 text-slate-700 border-slate-200',
    DRAWER_ADJUST: 'bg-purple-50 text-purple-700 border-purple-200',
    VISIT_START: 'bg-teal-50 text-teal-700 border-teal-200',
    PURCHASE_COMPLETE: 'bg-orange-50 text-orange-700 border-orange-200',
    SALE_COMPLETE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    INVENTORY_ADD: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    RETURN_COMPLETE: 'bg-red-50 text-red-700 border-red-200',
    PAYMENT_CHANGE: 'bg-amber-50 text-amber-700 border-amber-200',
    PURCHASE_CHANGE: 'bg-pink-50 text-pink-700 border-pink-200',
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Search audit log…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-[12px]" />
            </div>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="h-9 w-44 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>{MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Badge variant="outline" className="text-[10px] font-mono ml-auto">{filtered.length} entries</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto divide-y divide-border">
            {filtered.map((entry) => (
              <div key={entry.id} className="flex items-start gap-4 px-5 py-3 hover:bg-secondary/30 transition-colors">
                <span className={`inline-block text-[8px] font-bold px-2 py-0.5 rounded border shrink-0 mt-0.5 ${actionColor[entry.action] || 'bg-secondary text-secondary-foreground border-border'}`}>
                  {entry.action}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-foreground leading-snug">{entry.details}</p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span className="font-medium">{entry.actorName}</span>
                    <span>·</span>
                    <span>{entry.module}</span>
                    <span>·</span>
                    <span className="font-mono tabular-nums">{formatDateTime(entry.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-16">
                <ScrollText className="size-10 mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-muted-foreground text-[12px]">No entries match your filter</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
