import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Plus, Package, Tag, ShoppingCart,
  RotateCcw, Trash2, Eye, Edit2, Archive,
  CheckCircle2, Ban, MapPin, AlertCircle, Printer, History, ArrowRight,
  LayoutList, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/taxCalc';
import {
  filterInventoryByStatus,
  getInventoryLifecycleLabel,
  matchesInventorySearch,
  sortInventoryItems,
  type InventorySortColumn,
  type InventorySortDirection,
  type InventoryStatusFilter,
} from '@/lib/inventorySearch';
import { CATEGORIES, INVENTORY_STATUSES } from '@/constants/config';
import BarcodeLabelDialog from '@/components/features/BarcodeLabelDialog';
import LocationAssignmentDialog from '@/components/features/LocationAssignmentDialog';
import type { InventoryStatus, InventoryItem, LocationHistoryEntry } from '@/types';

type Section = 'all' | 'non-listed' | 'available' | 'sold' | 'returned' | 'scrapped';

const SECTIONS: { key: Section; label: string; icon: typeof Package; description: string }[] = [
  { key: 'all', label: 'All Inventory', icon: LayoutList, description: 'View and search every item across all inventory statuses' },
  { key: 'non-listed', label: 'Not Listed', icon: Package, description: 'Received items not yet on the floor' },
  { key: 'available', label: 'Live Products', icon: CheckCircle2, description: 'Ready for sale on the floor' },
  { key: 'sold', label: 'Sold Items', icon: ShoppingCart, description: 'Completed sales' },
  { key: 'returned', label: 'Returned Items', icon: RotateCcw, description: 'Items returned by customers' },
  { key: 'scrapped', label: 'Scrapped Items', icon: Ban, description: 'Damaged, unusable, discarded' },
];

function getStatusBadge(status: InventoryStatus, lifecycleLabel = false) {
  const cfg = INVENTORY_STATUSES.find((s) => s.value === status);
  const label = lifecycleLabel ? getInventoryLifecycleLabel(status) : (cfg?.label || status);
  return (
    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border capitalize ${cfg?.color || 'text-slate-600 bg-slate-50 border-slate-200'}`}>
      {label}
    </span>
  );
}

export default function InventoryPage() {
  const { employee, store } = useAuthStore();
  const pos = usePosStore();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [activeSection, setActiveSection] = useState<Section>('all');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [labelFilter, setLabelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>('all');
  const [sortColumn, setSortColumn] = useState<InventorySortColumn>('received');
  const [sortDirection, setSortDirection] = useState<InventorySortDirection>('desc');
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState<InventoryItem | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [locHistory, setLocHistory] = useState<LocationHistoryEntry[]>([]);

  // ── Workflow state ──
  // Track which item is being marked as listed (workflow context)
  const [pendingListItem, setPendingListItem] = useState<InventoryItem | null>(null);
  // Location dialog
  const [locationDialogItem, setLocationDialogItem] = useState<InventoryItem | null>(null);
  const [locationDialogMode, setLocationDialogMode] = useState<'assign' | 'move'>('assign');
  // Label dialog
  const [labelDialogItem, setLabelDialogItem] = useState<InventoryItem | null>(null);
  const [labelDialogMarkListed, setLabelDialogMarkListed] = useState(false);

  // Add form
  const [form, setForm] = useState({
    category: 'Smartphones', brand: '', model: '', serialImei: '', quantityOnHand: 1,
    costPerUnit: 0, expectedSalePrice: 0, notes: '',
  });

  // Edit form
  const [editForm, setEditForm] = useState({
    costPerUnit: 0, expectedSalePrice: 0, notes: '',
  });

  // Sale enrichment maps for All Inventory search and sorting
  const saleExtrasByItemId = useMemo(() => {
    const map = new Map<string, { saleCode: string; saleId: string; customerName: string; soldPrice: number }>();
    for (const si of pos.saleItems) {
      const sale = pos.sales.find((s) => s.id === si.salesTransactionId);
      if (!sale) continue;
      const cust = sale.customerId ? pos.customers.find((c) => c.id === sale.customerId) : null;
      map.set(si.inventoryItemId, {
        saleCode: sale.saleCode,
        saleId: sale.id,
        customerName: cust ? `${cust.firstName} ${cust.lastName}` : 'Walk-in',
        soldPrice: si.unitPrice,
      });
    }
    return map;
  }, [pos.saleItems, pos.sales, pos.customers]);

  const soldPriceByItemId = useMemo(() => {
    const map = new Map<string, number>();
    saleExtrasByItemId.forEach((extras, id) => map.set(id, extras.soldPrice));
    return map;
  }, [saleExtrasByItemId]);

  // Counts per section
  const counts = useMemo(() => {
    const inv = pos.inventory;
    return {
      all: inv.length,
      'non-listed': inv.filter((i) => i.status === 'available' && i.quantityOnHand > 0).length,
      available: inv.filter((i) => i.status === 'listed' && i.quantityOnHand > 0).length,
      sold: inv.filter((i) => i.status === 'sold').length,
      returned: inv.filter((i) => i.status === 'returned').length,
      scrapped: inv.filter((i) => i.status === 'scrapped').length,
    };
  }, [pos.inventory]);

  // Filter items by section + filters
  const sectionItems = useMemo(() => {
    let items: InventoryItem[] = [];
    switch (activeSection) {
      case 'all':
        items = [...pos.inventory];
        break;
      case 'non-listed':
        items = pos.inventory.filter((i) => i.status === 'available' && i.quantityOnHand > 0);
        break;
      case 'available':
        items = pos.inventory.filter((i) => i.status === 'listed' && i.quantityOnHand > 0);
        break;
      case 'sold':
        items = pos.inventory.filter((i) => i.status === 'sold');
        break;
      case 'returned':
        items = pos.inventory.filter((i) => i.status === 'returned');
        break;
      case 'scrapped':
        items = pos.inventory.filter((i) => i.status === 'scrapped');
        break;
    }

    if (activeSection === 'all') {
      if (search.trim()) {
        items = items.filter((i) =>
          matchesInventorySearch(i, search, saleExtrasByItemId.get(i.id)),
        );
      }
      if (statusFilter !== 'all') {
        items = items.filter((i) => filterInventoryByStatus(i, statusFilter));
      }
    } else if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((i) =>
        i.brand.toLowerCase().includes(q) ||
        i.model.toLowerCase().includes(q) ||
        i.deviceCode.toLowerCase().includes(q) ||
        i.serialImei.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        (i.storageLocation || '').toLowerCase().includes(q)
      );
    }

    if (catFilter !== 'all') items = items.filter((i) => i.category === catFilter);

    if (locationFilter === 'has') items = items.filter((i) => !!i.storageLocation);
    else if (locationFilter === 'none') items = items.filter((i) => !i.storageLocation);
    else if (locationFilter !== 'all') items = items.filter((i) => i.storageLocation === locationFilter);

    if (labelFilter === 'generated') items = items.filter((i) => i.labelGenerated);
    else if (labelFilter === 'pending') items = items.filter((i) => !i.labelGenerated);

    if (activeSection === 'all') {
      items = sortInventoryItems(items, sortColumn, sortDirection, soldPriceByItemId);
    }

    return items;
  }, [pos.inventory, activeSection, search, catFilter, locationFilter, labelFilter, statusFilter, sortColumn, sortDirection, saleExtrasByItemId, soldPriceByItemId]);

  // Unique locations for filter
  const uniqueLocations = useMemo(() => {
    const set = new Set<string>();
    pos.inventory.forEach((i) => { if (i.storageLocation) set.add(i.storageLocation); });
    return Array.from(set).sort();
  }, [pos.inventory]);

  // KPI values
  const kpis = useMemo(() => {
    const active = pos.inventory.filter((i) => (i.status === 'available' || i.status === 'listed') && i.quantityOnHand > 0);
    const totalCost = active.reduce((s, i) => s + i.costPerUnit * i.quantityOnHand, 0);
    const totalRetail = active.reduce((s, i) => s + i.expectedSalePrice * i.quantityOnHand, 0);
    const needsSetup = active.filter((i) => !i.storageLocation || !i.labelGenerated).length;
    return {
      totalItems: pos.inventory.length,
      activeItems: active.length,
      totalCost,
      totalRetail,
      potentialProfit: totalRetail - totalCost,
      needsSetup,
    };
  }, [pos.inventory]);

  // Load location history when detail dialog opens
  useEffect(() => {
    if (showDetail && showHistory) {
      pos.getInventoryLocationHistory(showDetail.id).then(setLocHistory);
    } else {
      setLocHistory([]);
    }
  }, [showDetail, showHistory, pos]);

  // ── Handlers ──

  const handleAdd = () => {
    if (!form.brand || !form.model || !employee || !store) {
      toast({ variant: 'destructive', title: 'Brand and model are required.' }); return;
    }
    pos.addInventoryItem({ ...form, status: 'available' as InventoryStatus, storeId: store.id });
    pos.logAction(employee.id, employee.fullName, 'Inventory', 'INVENTORY_ADD', 'inventory', '', `Added ${form.brand} ${form.model} manually`);
    setShowAdd(false);
    setForm({ category: 'Smartphones', brand: '', model: '', serialImei: '', quantityOnHand: 1, costPerUnit: 0, expectedSalePrice: 0, notes: '' });
    toast({ title: 'Item added to Not Listed' });
  };

  /**
   * Workflow: Mark Available (move to Live Products)
   * Requires: Storage Location + Generated Label
   */
  const handleMarkAvailable = (item: InventoryItem) => {
    setPendingListItem(item);
    if (!item.storageLocation) {
      // Step 1: Assign location first
      setLocationDialogItem(item);
      setLocationDialogMode('assign');
    } else if (!item.labelGenerated) {
      // Step 2: Generate label
      setLabelDialogItem(item);
      setLabelDialogMarkListed(true);
    } else {
      // Both already set — just move to listed
      handleDirectListing(item);
    }
  };

  const handleDirectListing = (item: InventoryItem) => {
    if (!employee) return;
    pos.updateInventoryItem(item.id, { status: 'listed' });
    pos.logAction(employee.id, employee.fullName, 'Inventory', 'MARK_AVAILABLE', 'inventory', item.id,
      `${item.brand} ${item.model} (${item.deviceCode}) — moved to Live Products at ${item.storageLocation}`);
    toast({ title: 'Moved to Live Products', description: item.deviceCode });
    setPendingListItem(null);
  };

  /** Location dialog onSave handler */
  const handleLocationSaved = (location: string, rack: string, row: string, notes: string) => {
    if (!locationDialogItem || !employee) return;
    pos.assignInventoryLocation(locationDialogItem.id, location, rack, row, employee.id, employee.fullName, notes);
    const updatedItem = { ...locationDialogItem, storageLocation: location, storageRack: rack, storageRow: row };
    setLocationDialogItem(null);

    // If in workflow context, continue to label step
    if (pendingListItem && pendingListItem.id === locationDialogItem.id && locationDialogMode === 'assign') {
      setLabelDialogItem(updatedItem);
      setLabelDialogMarkListed(true);
    } else {
      toast({ title: locationDialogMode === 'move' ? `Moved to ${location}` : `Location set to ${location}` });
    }
  };

  /** Label dialog onClose handler — clears pending workflow */
  const handleLabelDialogClose = (open: boolean) => {
    if (!open) {
      setLabelDialogItem(null);
      setLabelDialogMarkListed(false);
      setPendingListItem(null);
    }
  };

  const handleOpenLabel = (item: InventoryItem) => {
    setLabelDialogItem(item);
    setLabelDialogMarkListed(false);
    setPendingListItem(null);
  };

  const handleMoveLocation = (item: InventoryItem) => {
    setLocationDialogItem(item);
    setLocationDialogMode('move');
    setPendingListItem(null);
  };

  const handleStatusChange = (item: InventoryItem, newStatus: InventoryStatus) => {
    if (!employee || !store) return;
    const updates: Partial<InventoryItem> = { status: newStatus };

    if (newStatus === 'sold') {
      updates.soldAt = new Date().toISOString();
      updates.quantityOnHand = 0;
    } else if (newStatus === 'available') {
      updates.soldAt = null;
      updates.quantityOnHand = 1;
    } else if (newStatus === 'listed') {
      // This should go through the workflow — redirect
      handleMarkAvailable(item);
      return;
    } else if (newStatus === 'scrapped') {
      updates.quantityOnHand = 0;
    }

    pos.updateInventoryItem(item.id, updates);

    const actionMap: Record<string, string> = {
      sold: 'MARK_SOLD',
      returned: 'MARK_RETURNED',
      scrapped: 'MARK_SCRAPPED',
      available: 'MARK_NON_LISTED',
    };

    const labelMap: Record<string, string> = {
      sold: 'Sold Items',
      returned: 'Returned Items',
      scrapped: 'Scrapped Items',
      available: 'Not Listed',
    };

    pos.logAction(
      employee.id, employee.fullName, 'Inventory',
      actionMap[newStatus] || 'STATUS_CHANGE', 'inventory', item.id,
      `${item.brand} ${item.model} — moved to ${labelMap[newStatus] || newStatus}`
    );
    toast({ title: `Item moved to ${labelMap[newStatus] || newStatus}` });
  };

  const handleEditSave = () => {
    if (!showDetail || !employee) return;
    pos.updateInventoryItem(showDetail.id, {
      costPerUnit: editForm.costPerUnit,
      expectedSalePrice: editForm.expectedSalePrice,
      notes: editForm.notes,
    });
    pos.logAction(employee.id, employee.fullName, 'Inventory', 'INVENTORY_EDIT', 'inventory', showDetail.id,
      `Edited ${showDetail.brand} ${showDetail.model}`);
    setShowEdit(false);
    setShowDetail({ ...showDetail, ...editForm });
    toast({ title: 'Item updated' });
  };

  const openDetail = (item: InventoryItem) => {
    setShowDetail(item);
    setEditForm({ costPerUnit: item.costPerUnit, expectedSalePrice: item.expectedSalePrice, notes: item.notes });
    setShowEdit(false);
    setShowHistory(false);
  };

  // Sold item enrichment
  const getSoldInfo = (item: InventoryItem) => {
    const saleItem = pos.saleItems.find((si) => si.inventoryItemId === item.id);
    if (!saleItem) return null;
    const sale = pos.sales.find((s) => s.id === saleItem.salesTransactionId);
    if (!sale) return null;
    const empName = pos.auditLog.find((a) => a.recordId === sale.id)?.actorName;
    const cust = sale.customerId ? pos.customers.find((c) => c.id === sale.customerId) : null;
    return {
      saleCode: sale.saleCode,
      soldPrice: saleItem.unitPrice,
      soldDate: sale.completedAt || sale.createdAt,
      employee: empName || '—',
      customer: cust ? `${cust.firstName} ${cust.lastName}` : 'Walk-in',
      profit: saleItem.profitAmount,
    };
  };

  // Render action buttons per item status (All Inventory uses item status; other sections use active section)
  const getActionContext = (item: InventoryItem): Section | 'reserved' | 'defective' => {
    if (activeSection !== 'all') return activeSection;
    switch (item.status) {
      case 'available': return 'non-listed';
      case 'listed': return 'available';
      case 'sold': return 'sold';
      case 'returned': return 'returned';
      case 'scrapped': return 'scrapped';
      case 'reserved': return 'reserved';
      case 'defective': return 'defective';
      default: return 'scrapped';
    }
  };

  const renderActions = (item: InventoryItem) => {
    const needsSetup = !item.storageLocation || !item.labelGenerated;
    const ctx = getActionContext(item);
    switch (ctx) {
      case 'non-listed':
        return (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="default"
              className="h-7 text-[10px] px-2.5"
              onClick={() => handleMarkAvailable(item)}
              title="Move to Live Products (requires location + label)"
            >
              <Tag className="size-3 mr-1" />Mark as Listed
            </Button>
            {needsSetup && (
              <Badge variant="outline" className="text-[8px] text-amber-700 bg-amber-50 border-amber-200">
                <AlertCircle className="size-2.5 mr-0.5" />Setup
              </Badge>
            )}
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openDetail(item)}>
              <Eye className="size-3.5" />
            </Button>
          </div>
        );
      case 'available':
        return (
          <div className="flex items-center gap-0.5">
            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2"
              onClick={() => handleOpenLabel(item)} title="Print Label">
              <Printer className="size-3 mr-0.5" />Label
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
              onClick={() => handleMoveLocation(item)} title="Move Storage Location">
              <MapPin className="size-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openDetail(item)}>
              <Edit2 className="size-3.5" />
            </Button>
          </div>
        );
      case 'sold':
        return (
          <div className="flex items-center gap-0.5">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openDetail(item)} title="View sale">
              <Eye className="size-3.5" />
            </Button>
            {activeSection === 'all' && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => navigate('/pos/returns')} title="Start return">
                <RotateCcw className="size-3.5" />
              </Button>
            )}
          </div>
        );
      case 'returned':
        return (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => handleMarkAvailable(item)}>
              <Tag className="size-3 mr-1" />Re-list
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 text-red-700 border-red-200 hover:bg-red-50" onClick={() => handleStatusChange(item, 'scrapped')}>
              <Trash2 className="size-3 mr-1" />Scrap
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => handleStatusChange(item, 'available')}>
              <Archive className="size-3 mr-1" />Review
            </Button>
          </div>
        );
      case 'scrapped':
      case 'reserved':
      case 'defective':
        return (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openDetail(item)}>
            <Eye className="size-3.5" />
          </Button>
        );
      default:
        return null;
    }
  };

  const handleSort = (col: InventorySortColumn) => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection(col === 'received' ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ col }: { col: InventorySortColumn }) => {
    if (sortColumn !== col) return <ArrowUpDown className="size-3 ml-0.5 opacity-40" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="size-3 ml-0.5" />
      : <ArrowDown className="size-3 ml-0.5" />;
  };

  const SortableHead = ({ col, children, className = '' }: { col: InventorySortColumn; children: ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => handleSort(col)}
        className="inline-flex items-center hover:text-foreground cursor-pointer"
      >
        {children}
        <SortIcon col={col} />
      </button>
    </TableHead>
  );

  const resetSectionFilters = (section: Section) => {
    setActiveSection(section);
    setSearch('');
    setCatFilter('all');
    setLocationFilter('all');
    setLabelFilter('all');
    setStatusFilter('all');
    if (section === 'all') {
      setSortColumn('received');
      setSortDirection('desc');
    }
  };

  const sectionCfg = SECTIONS.find((s) => s.key === activeSection)!;
  const isAllSection = activeSection === 'all';
  const showLocationCol = activeSection !== 'sold' || isAllSection;
  const showLabelCol = activeSection === 'non-listed' || activeSection === 'available' || isAllSection;

  return (
    <div className="flex gap-5 h-[calc(100vh-112px)]">
      {/* ═══ LEFT SIDEBAR ═══ */}
      <div className="w-[220px] shrink-0 flex flex-col gap-3">
        {/* KPI summary */}
        <Card>
          <CardContent className="pt-3 pb-2.5">
            <p className="text-[10px] text-muted-foreground font-medium mb-1">Active Items</p>
            <p className="text-xl font-bold font-mono tabular-nums">{kpis.activeItems}</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-secondary/60 rounded px-2 py-1.5">
                <p className="text-[9px] text-muted-foreground">Cost</p>
                <p className="text-[11px] font-bold font-mono tabular-nums">{formatCurrency(kpis.totalCost)}</p>
              </div>
              <div className="bg-secondary/60 rounded px-2 py-1.5">
                <p className="text-[9px] text-muted-foreground">Retail</p>
                <p className="text-[11px] font-bold font-mono tabular-nums">{formatCurrency(kpis.totalRetail)}</p>
              </div>
            </div>
            <div className="mt-2 bg-primary/5 rounded px-2 py-1.5">
              <p className="text-[9px] text-muted-foreground">Potential Profit</p>
              <p className="text-[12px] font-bold font-mono tabular-nums text-primary">{formatCurrency(kpis.potentialProfit)}</p>
            </div>
            {kpis.needsSetup > 0 && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                <p className="text-[9px] text-amber-700 font-semibold flex items-center gap-1">
                  <AlertCircle className="size-2.5" />Needs Setup
                </p>
                <p className="text-[12px] font-bold font-mono tabular-nums text-amber-700">{kpis.needsSetup}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section Navigation */}
        <div className="flex-1 space-y-0.5">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.key;
            const count = counts[section.key];
            return (
              <button
                key={section.key}
                onClick={() => resetSectionFilters(section.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 text-left truncate">{section.label}</span>
                <span className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-secondary text-muted-foreground'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Add Item Button */}
        <Button className="w-full h-10" onClick={() => setShowAdd(true)}>
          <Plus className="size-4 mr-1.5" />Add Item
        </Button>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-hidden">
        {/* Header + Filters */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                {(() => { const Icon = sectionCfg.icon; return <Icon className="size-5 text-primary" />; })()}
                <div>
                  <h2 className="text-[16px] font-bold">{sectionCfg.label}</h2>
                  <p className="text-[11px] text-muted-foreground">{sectionCfg.description}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono tabular-nums">
                {sectionItems.length} item{sectionItems.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 max-w-sm min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder={isAllSection
                    ? 'Search product, device ID, IMEI, status, sale ID…'
                    : 'Search brand, model, code, IMEI, location…'}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-[12px]"
                />
              </div>
              {isAllSection && (
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as InventoryStatusFilter)}>
                  <SelectTrigger className="h-9 w-36 text-[11px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="available">Non-Listed</SelectItem>
                    <SelectItem value="listed">Live</SelectItem>
                    <SelectItem value="sold">Sold</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                    <SelectItem value="scrapped">Scrapped</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Select value={catFilter} onValueChange={setCatFilter}>
                <SelectTrigger className="h-9 w-36 text-[11px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              {showLocationCol && (
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger className="h-9 w-36 text-[11px]"><SelectValue placeholder="Location" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    <SelectItem value="has">Has Location</SelectItem>
                    <SelectItem value="none">No Location</SelectItem>
                    {uniqueLocations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {showLabelCol && (
                <Select value={labelFilter} onValueChange={setLabelFilter}>
                  <SelectTrigger className="h-9 w-32 text-[11px]"><SelectValue placeholder="Label" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Labels</SelectItem>
                    <SelectItem value="generated">Generated</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="flex-1 overflow-hidden">
          <CardContent className="p-0 h-full">
            <div className="h-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px]">
                    <TableHead className="w-24">Device ID</TableHead>
                    {isAllSection ? (
                      <>
                        <SortableHead col="product">Product</SortableHead>
                        <SortableHead col="category" className="w-20">Category</SortableHead>
                        <TableHead className="w-24">Location</TableHead>
                        <TableHead className="w-24">Label</TableHead>
                        <SortableHead col="cost" className="w-20 text-right justify-end w-full">Cost</SortableHead>
                        <SortableHead col="quantity" className="w-16 text-center justify-center w-full">Qty</SortableHead>
                        <SortableHead col="salePrice" className="w-24 text-right justify-end w-full">Sale Price</SortableHead>
                        <SortableHead col="status" className="w-20">Status</SortableHead>
                        <SortableHead col="received" className="w-24">Received</SortableHead>
                      </>
                    ) : (
                      <>
                        <TableHead>Product</TableHead>
                        <TableHead className="w-20">Category</TableHead>
                        {showLocationCol && <TableHead className="w-24">Location</TableHead>}
                        {showLabelCol && <TableHead className="w-24">Label</TableHead>}
                        {activeSection !== 'sold' && <TableHead className="w-20 text-right">Cost</TableHead>}
                        <TableHead className="w-16 text-center">Qty</TableHead>
                        <TableHead className="w-24 text-right">{activeSection === 'sold' ? 'Sold Price' : 'Sale Price'}</TableHead>
                        {activeSection === 'sold' && <TableHead className="w-20 text-right">Profit</TableHead>}
                        {activeSection === 'sold' && <TableHead className="w-28">Customer</TableHead>}
                        <TableHead className="w-20">Status</TableHead>
                        <TableHead className="w-24">{activeSection === 'sold' ? 'Sold' : 'Received'}</TableHead>
                      </>
                    )}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sectionItems.map((item) => {
                    const soldInfo = activeSection === 'sold' || isAllSection
                      ? (getSoldInfo(item) ?? (saleExtrasByItemId.has(item.id) ? {
                          saleCode: saleExtrasByItemId.get(item.id)!.saleCode,
                          soldPrice: saleExtrasByItemId.get(item.id)!.soldPrice,
                          soldDate: item.soldAt || item.acquiredAt,
                          employee: '—',
                          customer: saleExtrasByItemId.get(item.id)!.customerName,
                          profit: saleExtrasByItemId.get(item.id)!.soldPrice - item.costPerUnit,
                        } : null))
                      : null;
                    const displayDate = isAllSection && item.status === 'sold' && soldInfo
                      ? soldInfo.soldDate
                      : item.acquiredAt;
                    return (
                      <TableRow key={item.id} className="text-[12px] group">
                        <TableCell className="font-mono text-[10px] text-muted-foreground">{item.deviceCode}</TableCell>
                        <TableCell>
                          <p className="font-medium truncate max-w-[240px]">{item.brand} {item.model}</p>
                          {item.serialImei && <p className="text-[9px] text-muted-foreground font-mono">IMEI: {item.serialImei}</p>}
                        </TableCell>
                        <TableCell className="text-[11px]">{item.category}</TableCell>
                        {(showLocationCol || isAllSection) && (
                          <TableCell>
                            {item.storageLocation ? (
                              <Badge variant="outline" className="font-mono text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                <MapPin className="size-2.5 mr-0.5" />{item.storageLocation}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200">
                                None
                              </Badge>
                            )}
                          </TableCell>
                        )}
                        {(showLabelCol || isAllSection) && (
                          <TableCell>
                            {item.labelGenerated ? (
                              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                <CheckCircle2 className="size-2.5 mr-0.5" />Yes
                                {item.labelPrintCount > 0 && <span className="ml-0.5 font-mono">·{item.labelPrintCount}×</span>}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">
                                Pending
                              </Badge>
                            )}
                          </TableCell>
                        )}
                        {(activeSection !== 'sold' || isAllSection) && (
                          <TableCell className="text-right font-mono tabular-nums text-[11px] text-muted-foreground">{formatCurrency(item.costPerUnit)}</TableCell>
                        )}
                        <TableCell className="text-center">
                          <span className={`font-mono tabular-nums text-[11px] font-semibold px-2 py-0.5 rounded-full ${item.quantityOnHand > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-400 border border-slate-200'}`}>
                            {item.quantityOnHand}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-semibold text-primary">
                          {soldInfo ? formatCurrency(soldInfo.soldPrice) : formatCurrency(item.expectedSalePrice)}
                        </TableCell>
                        {activeSection === 'sold' && !isAllSection && (
                          <TableCell className="text-right">
                            <span className={`font-mono tabular-nums font-semibold text-[11px] ${(soldInfo?.profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {soldInfo ? formatCurrency(soldInfo.profit) : '—'}
                            </span>
                          </TableCell>
                        )}
                        {activeSection === 'sold' && !isAllSection && (
                          <TableCell className="text-[11px] truncate max-w-[120px]">{soldInfo?.customer || '—'}</TableCell>
                        )}
                        <TableCell>{getStatusBadge(item.status, isAllSection)}</TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">
                          {activeSection === 'sold' && soldInfo && !isAllSection
                            ? formatDate(soldInfo.soldDate)
                            : formatDate(displayDate)}
                        </TableCell>
                        <TableCell className="text-right">{renderActions(item)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {sectionItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={20} className="text-center py-16">
                        <Package className="size-12 mx-auto text-muted-foreground/15 mb-3" />
                        <p className="text-[13px] text-muted-foreground font-medium">No items in this section</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {activeSection === 'all' && 'No inventory records match your search or filters.'}
                          {activeSection === 'non-listed' && 'Items received from purchases will appear here.'}
                          {activeSection === 'available' && 'Items moved to Live Products will appear here.'}
                          {activeSection === 'sold' && 'Completed sales will move items here.'}
                          {activeSection === 'returned' && 'Returned items will appear here.'}
                          {activeSection === 'scrapped' && 'Scrapped and damaged items will appear here.'}
                        </p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══ ADD ITEM DIALOG ═══ */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add Inventory Item</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <Label className="text-[11px]">Brand *</Label>
              <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="mt-1 h-9 text-[12px]" />
            </div>
            <div>
              <Label className="text-[11px]">Model *</Label>
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="mt-1 h-9 text-[12px]" />
            </div>
            <div>
              <Label className="text-[11px]">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Serial / IMEI</Label>
              <Input value={form.serialImei} onChange={(e) => setForm({ ...form, serialImei: e.target.value })} className="mt-1 h-9 text-[12px] font-mono" />
            </div>
            <div>
              <Label className="text-[11px]">Cost ($)</Label>
              <Input type="number" value={form.costPerUnit || ''} onChange={(e) => setForm({ ...form, costPerUnit: Number(e.target.value) })} className="mt-1 h-9 text-[12px] font-mono" />
            </div>
            <div>
              <Label className="text-[11px]">Selling Price ($)</Label>
              <Input type="number" value={form.expectedSalePrice || ''} onChange={(e) => setForm({ ...form, expectedSalePrice: Number(e.target.value) })} className="mt-1 h-9 text-[12px] font-mono" />
            </div>
            <div className="col-span-2">
              <Label className="text-[11px]">Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 h-9 text-[12px]" />
            </div>
          </div>
          <Button onClick={handleAdd} className="mt-3 w-full h-10">Add to Not Listed</Button>
        </DialogContent>
      </Dialog>

      {/* ═══ LOCATION ASSIGNMENT / MOVE DIALOG ═══ */}
      <LocationAssignmentDialog
        open={!!locationDialogItem}
        onOpenChange={(o) => { if (!o) { setLocationDialogItem(null); if (locationDialogMode === 'assign') setPendingListItem(null); } }}
        item={locationDialogItem}
        mode={locationDialogMode}
        onSave={handleLocationSaved}
      />

      {/* ═══ BARCODE LABEL DIALOG ═══ */}
      <BarcodeLabelDialog
        open={!!labelDialogItem}
        onOpenChange={handleLabelDialogClose}
        item={labelDialogItem}
        markAsListedOnGenerate={labelDialogMarkListed}
      />

      {/* ═══ ITEM DETAIL / EDIT DIALOG ═══ */}
      <Dialog open={!!showDetail} onOpenChange={(open) => { if (!open) { setShowDetail(null); setShowEdit(false); setShowHistory(false); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {showDetail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-[15px]">
                  <Package className="size-5 text-primary" />
                  {showDetail.brand} {showDetail.model}
                </DialogTitle>
              </DialogHeader>

              <div className="mt-2 space-y-4">
                {/* Item info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-[9px] text-muted-foreground uppercase font-semibold mb-0.5">Device ID</p>
                    <p className="text-[12px] font-mono font-semibold">{showDetail.deviceCode}</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-[9px] text-muted-foreground uppercase font-semibold mb-0.5">Status</p>
                    <div className="mt-0.5">{getStatusBadge(showDetail.status)}</div>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-[9px] text-muted-foreground uppercase font-semibold mb-0.5">Category</p>
                    <p className="text-[12px] font-medium">{showDetail.category}</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-[9px] text-muted-foreground uppercase font-semibold mb-0.5">Serial / IMEI</p>
                    <p className="text-[12px] font-mono">{showDetail.serialImei || '—'}</p>
                  </div>
                  {/* Location card */}
                  <div className={`rounded-lg p-3 ${showDetail.storageLocation ? 'bg-blue-50 border border-blue-200' : 'bg-amber-50 border border-amber-200'}`}>
                    <p className="text-[9px] uppercase font-semibold mb-0.5 flex items-center gap-1 text-muted-foreground">
                      <MapPin className="size-3" />Storage Location
                    </p>
                    {showDetail.storageLocation ? (
                      <>
                        <p className="text-[14px] font-mono font-bold text-blue-700">{showDetail.storageLocation}</p>
                        <button
                          onClick={() => handleMoveLocation(showDetail)}
                          className="text-[10px] text-blue-600 hover:text-blue-800 underline mt-0.5 cursor-pointer"
                        >
                          Move →
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-[11px] text-amber-700 font-medium mb-1">Not assigned</p>
                        <button
                          onClick={() => { setLocationDialogItem(showDetail); setLocationDialogMode('assign'); }}
                          className="text-[10px] text-amber-700 hover:text-amber-900 underline cursor-pointer"
                        >
                          Assign Location →
                        </button>
                      </>
                    )}
                  </div>
                  {/* Label card */}
                  <div className={`rounded-lg p-3 ${showDetail.labelGenerated ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-200'}`}>
                    <p className="text-[9px] uppercase font-semibold mb-0.5 flex items-center gap-1 text-muted-foreground">
                      <Tag className="size-3" />Product Label
                    </p>
                    {showDetail.labelGenerated ? (
                      <>
                        <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="size-3" />Generated
                        </p>
                        <p className="text-[9px] text-muted-foreground">Printed {showDetail.labelPrintCount}× · {showDetail.lastLabelPrintAt ? formatDate(showDetail.lastLabelPrintAt) : 'Never'}</p>
                        <button
                          onClick={() => handleOpenLabel(showDetail)}
                          className="text-[10px] text-emerald-700 hover:text-emerald-900 underline cursor-pointer mt-0.5"
                        >
                          Print / Reprint →
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-[11px] text-slate-600 font-medium mb-1">Not generated</p>
                        <button
                          onClick={() => handleOpenLabel(showDetail)}
                          className="text-[10px] text-slate-700 hover:text-slate-900 underline cursor-pointer"
                        >
                          Generate Label →
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {!showEdit ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-secondary/50 rounded-lg p-3 text-center">
                        <p className="text-[9px] text-muted-foreground uppercase font-semibold mb-0.5">Cost</p>
                        <p className="text-[14px] font-bold font-mono tabular-nums">{formatCurrency(showDetail.costPerUnit)}</p>
                      </div>
                      <div className="bg-primary/5 rounded-lg p-3 text-center border border-primary/10">
                        <p className="text-[9px] text-muted-foreground uppercase font-semibold mb-0.5">Sale Price</p>
                        <p className="text-[14px] font-bold font-mono tabular-nums text-primary">{formatCurrency(showDetail.expectedSalePrice)}</p>
                      </div>
                      <div className="bg-secondary/50 rounded-lg p-3 text-center">
                        <p className="text-[9px] text-muted-foreground uppercase font-semibold mb-0.5">Margin</p>
                        <p className={`text-[14px] font-bold font-mono tabular-nums ${showDetail.expectedSalePrice - showDetail.costPerUnit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatCurrency(showDetail.expectedSalePrice - showDetail.costPerUnit)}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Received:</span>{' '}
                        <span className="font-medium">{formatDateTime(showDetail.acquiredAt)}</span>
                      </div>
                      {showDetail.soldAt && (
                        <div>
                          <span className="text-muted-foreground">Sold:</span>{' '}
                          <span className="font-medium">{formatDateTime(showDetail.soldAt)}</span>
                        </div>
                      )}
                    </div>
                    {showDetail.notes && (
                      <div className="bg-secondary/50 rounded-lg p-3">
                        <p className="text-[9px] text-muted-foreground uppercase font-semibold mb-0.5">Notes</p>
                        <p className="text-[12px]">{showDetail.notes}</p>
                      </div>
                    )}

                    {/* Location History */}
                    <div className="space-y-2">
                      <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="flex items-center gap-2 text-[11px] font-semibold text-foreground hover:text-primary cursor-pointer"
                      >
                        <History className="size-3.5" />
                        Location History
                        <span className="text-muted-foreground font-normal">{showHistory ? '▼' : '▶'}</span>
                      </button>
                      {showHistory && (
                        <div className="border border-border rounded-lg overflow-hidden">
                          {locHistory.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground py-4 text-center">No location changes recorded</p>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow className="text-[9px]">
                                  <TableHead className="h-7">From</TableHead>
                                  <TableHead className="h-7">To</TableHead>
                                  <TableHead className="h-7">By</TableHead>
                                  <TableHead className="h-7">Date</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {locHistory.map((h) => (
                                  <TableRow key={h.id} className="text-[11px]">
                                    <TableCell>
                                      {h.oldLocation ? (
                                        <Badge variant="outline" className="font-mono text-[9px]">{h.oldLocation}</Badge>
                                      ) : (
                                        <span className="text-muted-foreground text-[9px]">—</span>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className="font-mono text-[9px] bg-blue-50 text-blue-700 border-blue-200">
                                        <ArrowRight className="size-2 mr-0.5" />{h.newLocation}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-[10px]">{h.movedByName}</TableCell>
                                    <TableCell className="text-[10px] text-muted-foreground">{formatDate(h.movedAt)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Sold info */}
                    {showDetail.status === 'sold' && (() => {
                      const info = getSoldInfo(showDetail);
                      if (!info) return null;
                      return (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5">
                          <p className="text-[10px] font-semibold text-blue-800 uppercase">Sale Details</p>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div><span className="text-blue-600">Sale Code:</span> <span className="font-mono font-semibold">{info.saleCode}</span></div>
                            <div><span className="text-blue-600">Sold Price:</span> <span className="font-mono font-semibold">{formatCurrency(info.soldPrice)}</span></div>
                            <div><span className="text-blue-600">Customer:</span> <span className="font-medium">{info.customer}</span></div>
                            <div><span className="text-blue-600">Employee:</span> <span className="font-medium">{info.employee}</span></div>
                            <div><span className="text-blue-600">Profit:</span> <span className={`font-mono font-semibold ${info.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(info.profit)}</span></div>
                            <div><span className="text-blue-600">Date:</span> <span className="font-medium">{formatDate(info.soldDate)}</span></div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Action buttons */}
                    <div className="flex gap-2 flex-wrap">
                      {showDetail.status !== 'sold' && showDetail.status !== 'scrapped' && (
                        <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => setShowEdit(true)}>
                          <Edit2 className="size-3 mr-1.5" />Edit Prices
                        </Button>
                      )}
                      {showDetail.status === 'available' && (
                        <Button size="sm" className="h-8 text-[11px]" onClick={() => { handleMarkAvailable(showDetail); setShowDetail(null); }}>
                          <Tag className="size-3 mr-1.5" />Mark as Listed
                        </Button>
                      )}
                      {showDetail.status === 'listed' && (
                        <>
                          <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => handleOpenLabel(showDetail)}>
                            <Printer className="size-3 mr-1.5" />Print Label
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => handleMoveLocation(showDetail)}>
                            <MapPin className="size-3 mr-1.5" />Move Location
                          </Button>
                        </>
                      )}
                      {showDetail.status === 'returned' && (
                        <>
                          <Button size="sm" variant="outline" className="h-8 text-[11px] text-emerald-700" onClick={() => { handleMarkAvailable(showDetail); setShowDetail(null); }}>
                            <Tag className="size-3 mr-1.5" />Re-list
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-[11px] text-red-700" onClick={() => { handleStatusChange(showDetail, 'scrapped'); setShowDetail(null); }}>
                            <Trash2 className="size-3 mr-1.5" />Scrap
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => { handleStatusChange(showDetail, 'available'); setShowDetail(null); }}>
                            <Archive className="size-3 mr-1.5" />Send to Review
                          </Button>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  /* Edit mode */
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[11px]">Cost Price ($)</Label>
                        <Input type="number" value={editForm.costPerUnit || ''} onChange={(e) => setEditForm({ ...editForm, costPerUnit: Number(e.target.value) })} className="mt-1 h-9 text-[12px] font-mono" />
                      </div>
                      <div>
                        <Label className="text-[11px]">Sale Price ($)</Label>
                        <Input type="number" value={editForm.expectedSalePrice || ''} onChange={(e) => setEditForm({ ...editForm, expectedSalePrice: Number(e.target.value) })} className="mt-1 h-9 text-[12px] font-mono" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[11px]">Notes</Label>
                      <Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="mt-1 h-9 text-[12px]" />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleEditSave} className="flex-1 h-9">Save Changes</Button>
                      <Button variant="outline" className="h-9" onClick={() => setShowEdit(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
