import { useState, useMemo } from 'react';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Tag, Printer, Download, MapPin, CheckCircle2, AlertCircle,
  Loader2, Package, Eye, RefreshCw, ClipboardList,
} from 'lucide-react';
import { formatDateTime, formatDate } from '@/lib/taxCalc';
import { CATEGORIES } from '@/constants/config';
import { printLabels, downloadLabelsPdf } from '@/lib/barcode';
import BarcodeLabelDialog from '@/components/features/BarcodeLabelDialog';
import LocationAssignmentDialog from '@/components/features/LocationAssignmentDialog';
import type { InventoryItem } from '@/types';

type TabKey = 'all' | 'setup-needed';

export default function LabelGeneratorPage() {
  const { employee } = useAuthStore();
  const pos = usePosStore();
  const { toast } = useToast();

  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [labelFilter, setLabelFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);

  const [labelItem, setLabelItem] = useState<InventoryItem | null>(null);
  const [locationItem, setLocationItem] = useState<InventoryItem | null>(null);
  const [locationMode, setLocationMode] = useState<'assign' | 'move'>('assign');
  const [bulkLocationOpen, setBulkLocationOpen] = useState(false);

  // ── Filter items ──
  const filtered = useMemo(() => {
    let items = pos.inventory.filter((i) => i.status !== 'sold' && i.status !== 'scrapped');

    if (tab === 'setup-needed') {
      items = items.filter((i) => !i.storageLocation || !i.labelGenerated);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((i) =>
        i.brand.toLowerCase().includes(q) ||
        i.model.toLowerCase().includes(q) ||
        i.deviceCode.toLowerCase().includes(q) ||
        i.serialImei.toLowerCase().includes(q) ||
        (i.storageLocation || '').toLowerCase().includes(q)
      );
    }
    if (catFilter !== 'all') items = items.filter((i) => i.category === catFilter);
    if (statusFilter !== 'all') items = items.filter((i) => i.status === statusFilter);
    if (labelFilter === 'generated') items = items.filter((i) => i.labelGenerated);
    else if (labelFilter === 'pending') items = items.filter((i) => !i.labelGenerated);
    if (locationFilter === 'has') items = items.filter((i) => !!i.storageLocation);
    else if (locationFilter === 'none') items = items.filter((i) => !i.storageLocation);
    else if (locationFilter !== 'all') items = items.filter((i) => i.storageLocation === locationFilter);

    return items;
  }, [pos.inventory, tab, search, catFilter, statusFilter, labelFilter, locationFilter]);

  // ── Unique locations for filter dropdown ──
  const uniqueLocations = useMemo(() => {
    const set = new Set<string>();
    pos.inventory.forEach((i) => { if (i.storageLocation) set.add(i.storageLocation); });
    return Array.from(set).sort();
  }, [pos.inventory]);

  // ── Setup stats ──
  const stats = useMemo(() => {
    const active = pos.inventory.filter((i) => i.status === 'available' || i.status === 'listed');
    return {
      total: active.length,
      withLabel: active.filter((i) => i.labelGenerated).length,
      withLocation: active.filter((i) => !!i.storageLocation).length,
      needsSetup: active.filter((i) => !i.labelGenerated || !i.storageLocation).length,
    };
  }, [pos.inventory]);

  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const selectedItems = filtered.filter((i) => selected.has(i.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((i) => i.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Bulk actions ──

  const handleBulkGenerate = async () => {
    if (selectedItems.length === 0 || !employee) return;
    setIsProcessing(true);
    try {
      const toGen = selectedItems.filter((i) => !i.labelGenerated);
      for (const item of toGen) {
        await pos.generateInventoryLabel(item.id, employee.id, employee.fullName);
      }
      toast({
        title: `Generated ${toGen.length} label(s)`,
        description: toGen.length < selectedItems.length ? `${selectedItems.length - toGen.length} already generated` : undefined,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkPrint = async () => {
    if (selectedItems.length === 0 || !employee) return;
    setIsProcessing(true);
    try {
      // Generate first for any not-yet-generated items
      const toGen = selectedItems.filter((i) => !i.labelGenerated);
      for (const item of toGen) {
        await pos.generateInventoryLabel(item.id, employee.id, employee.fullName);
      }
      // Print all
      await printLabels(selectedItems, { appendLocation: true });
      // Record prints
      for (const item of selectedItems) {
        await pos.recordInventoryLabelPrint(item.id, employee.id, employee.fullName);
      }
      toast({ title: `Print job sent for ${selectedItems.length} label(s)` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDownload = async () => {
    if (selectedItems.length === 0) return;
    setIsProcessing(true);
    try {
      await downloadLabelsPdf(selectedItems, { appendLocation: true, filename: `labels-${selectedItems.length}items-${Date.now()}.pdf` });
      toast({ title: `Downloaded PDF with ${selectedItems.length} label(s)` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkAssignLocation = (location: string, rack: string, row: string, notes: string) => {
    if (selectedItems.length === 0 || !employee) return;
    selectedItems.forEach((item) => {
      pos.assignInventoryLocation(item.id, location, rack, row, employee.id, employee.fullName, notes || `Bulk assigned to ${location}`);
    });
    setBulkLocationOpen(false);
    toast({ title: `${selectedItems.length} item(s) moved to ${location}` });
  };

  // ── Per-item actions ──

  const handleQuickPrint = async (item: InventoryItem) => {
    if (!employee) return;
    if (!item.labelGenerated) {
      await pos.generateInventoryLabel(item.id, employee.id, employee.fullName);
    }
    await printLabels([item], { appendLocation: true });
    await pos.recordInventoryLabelPrint(item.id, employee.id, employee.fullName);
    toast({ title: 'Print job sent', description: item.deviceCode });
  };

  const handleAssignLocation = (location: string, rack: string, row: string, notes: string) => {
    if (!locationItem || !employee) return;
    pos.assignInventoryLocation(locationItem.id, location, rack, row, employee.id, employee.fullName, notes);
    setLocationItem(null);
    toast({ title: locationMode === 'move' ? `Moved to ${location}` : `Location set to ${location}` });
  };

  return (
    <div className="space-y-4 h-[calc(100vh-112px)] flex flex-col">
      {/* ─── Header / Stats ─── */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Total Active Items</p>
            <p className="text-2xl font-bold font-mono tabular-nums">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1 flex items-center gap-1">
              <CheckCircle2 className="size-3 text-emerald-600" />With Label
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-600">{stats.withLabel}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{stats.total > 0 ? Math.round((stats.withLabel / stats.total) * 100) : 0}% coverage</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1 flex items-center gap-1">
              <MapPin className="size-3 text-blue-600" />With Location
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-blue-600">{stats.withLocation}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{stats.total > 0 ? Math.round((stats.withLocation / stats.total) * 100) : 0}% coverage</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1 flex items-center gap-1">
              <AlertCircle className="size-3 text-amber-600" />Needs Setup
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-amber-600">{stats.needsSetup}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Missing label or location</p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Main Card ─── */}
      <Card className="flex-1 overflow-hidden flex flex-col">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-[16px] flex items-center gap-2">
                <Tag className="size-5 text-primary" />
                Label Generator & Bulk Manager
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Generate, print, and manage product barcode labels and storage locations
              </p>
            </div>
            <Tabs value={tab} onValueChange={(v) => { setTab(v as TabKey); setSelected(new Set()); }}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-[11px] h-7"><ClipboardList className="size-3 mr-1" />All Items</TabsTrigger>
                <TabsTrigger value="setup-needed" className="text-[11px] h-7">
                  <AlertCircle className="size-3 mr-1" />Needs Setup
                  {stats.needsSetup > 0 && <Badge variant="secondary" className="ml-1.5 text-[9px] h-4 px-1">{stats.needsSetup}</Badge>}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>

        {/* Filters Row */}
        <div className="px-5 py-3 border-b flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input placeholder="Search code, brand, model, location…" value={search}
              onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-[12px]" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-36 text-[11px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="available">Not Listed</SelectItem>
              <SelectItem value="listed">Listed Products</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
            </SelectContent>
          </Select>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="h-9 w-36 text-[11px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="h-9 w-36 text-[11px]"><SelectValue placeholder="Location" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              <SelectItem value="has">Has Location</SelectItem>
              <SelectItem value="none">No Location</SelectItem>
              {uniqueLocations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={labelFilter} onValueChange={setLabelFilter}>
            <SelectTrigger className="h-9 w-32 text-[11px]"><SelectValue placeholder="Label" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Labels</SelectItem>
              <SelectItem value="generated">Generated</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          {(search || catFilter !== 'all' || statusFilter !== 'all' || locationFilter !== 'all' || labelFilter !== 'all') && (
            <Button size="sm" variant="ghost" className="h-9 text-[10px]" onClick={() => {
              setSearch(''); setCatFilter('all'); setStatusFilter('all'); setLocationFilter('all'); setLabelFilter('all');
            }}>
              <RefreshCw className="size-3 mr-1" />Reset
            </Button>
          )}
        </div>

        {/* Bulk Actions Bar */}
        {selected.size > 0 && (
          <div className="px-5 py-2.5 bg-primary/5 border-b flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12px]">
              <Badge className="bg-primary text-white border-0">{selected.size} selected</Badge>
              <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-8 text-[11px]" disabled={isProcessing} onClick={() => setBulkLocationOpen(true)}>
                <MapPin className="size-3 mr-1" />Assign Location
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-[11px]" disabled={isProcessing} onClick={handleBulkGenerate}>
                {isProcessing ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Tag className="size-3 mr-1" />}
                Generate Labels
              </Button>
              <Button size="sm" className="h-8 text-[11px]" disabled={isProcessing} onClick={handleBulkPrint}>
                {isProcessing ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Printer className="size-3 mr-1" />}
                Print All
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-[11px]" disabled={isProcessing} onClick={handleBulkDownload}>
                {isProcessing ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Download className="size-3 mr-1" />}
                PDF
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <CardContent className="p-0 flex-1 overflow-hidden">
          <div className="h-full overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10 border-b">
                <TableRow className="text-[10px]">
                  <TableHead className="w-10">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded cursor-pointer" />
                  </TableHead>
                  <TableHead className="w-28">Device Code</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-24">Category</TableHead>
                  <TableHead className="w-24">Location</TableHead>
                  <TableHead className="w-28">Label Status</TableHead>
                  <TableHead className="w-16 text-center">Prints</TableHead>
                  <TableHead className="w-32">Last Printed</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-16">
                      <Tag className="size-12 mx-auto text-muted-foreground/15 mb-3" />
                      <p className="text-[13px] text-muted-foreground font-medium">No items match the filters</p>
                      <p className="text-[11px] text-muted-foreground mt-1">Try adjusting your search or filters.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((item) => {
                    const isSelected = selected.has(item.id);
                    return (
                      <TableRow key={item.id} className={`text-[12px] ${isSelected ? 'bg-primary/5' : ''}`}>
                        <TableCell>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleOne(item.id)} className="rounded cursor-pointer" />
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-[11px] font-semibold">{item.deviceCode}</span>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium truncate max-w-[240px]">{item.brand} {item.model}</p>
                          {item.serialImei && <p className="text-[9px] text-muted-foreground font-mono">{item.serialImei}</p>}
                        </TableCell>
                        <TableCell className="text-[11px]">{item.category}</TableCell>
                        <TableCell>
                          {item.storageLocation ? (
                            <Badge variant="outline" className="font-mono text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                              <MapPin className="size-2.5 mr-0.5" />{item.storageLocation}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200">
                              <AlertCircle className="size-2.5 mr-0.5" />None
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.labelGenerated ? (
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                              <CheckCircle2 className="size-2.5 mr-0.5" />Generated
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">
                              Not Generated
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-mono text-[11px] font-semibold">{item.labelPrintCount}<span className="text-[8px] text-muted-foreground">×</span></span>
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">
                          {item.lastLabelPrintAt ? formatDate(item.lastLabelPrintAt) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-0.5 justify-end">
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2"
                              onClick={() => { setLocationItem(item); setLocationMode(item.storageLocation ? 'move' : 'assign'); }}
                              title={item.storageLocation ? 'Move Location' : 'Assign Location'}>
                              <MapPin className="size-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2"
                              onClick={() => handleQuickPrint(item)} title="Quick Print">
                              <Printer className="size-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2"
                              onClick={() => setLabelItem(item)} title="Label Details">
                              <Eye className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>

        {/* Footer count */}
        <div className="px-5 py-2 border-t bg-secondary/30 text-[11px] text-muted-foreground flex items-center justify-between">
          <span>Showing {filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
          {selected.size > 0 && <span className="font-semibold">{selected.size} selected</span>}
        </div>
      </Card>

      {/* ─── Dialogs ─── */}
      <BarcodeLabelDialog
        open={!!labelItem}
        onOpenChange={(o) => !o && setLabelItem(null)}
        item={labelItem}
      />

      <LocationAssignmentDialog
        open={!!locationItem}
        onOpenChange={(o) => !o && setLocationItem(null)}
        item={locationItem}
        mode={locationMode}
        onSave={handleAssignLocation}
      />

      {/* Bulk assign location dialog reuses LocationAssignmentDialog with a synthetic item */}
      <LocationAssignmentDialog
        open={bulkLocationOpen}
        onOpenChange={setBulkLocationOpen}
        item={selectedItems.length > 0 ? {
          ...selectedItems[0],
          deviceCode: `${selectedItems.length} items`,
          brand: `Bulk Assignment`,
          model: `(${selectedItems.length} items selected)`,
          category: 'Multiple items',
          storageLocation: null,
        } : null}
        mode="assign"
        onSave={handleBulkAssignLocation}
      />
    </div>
  );
}
