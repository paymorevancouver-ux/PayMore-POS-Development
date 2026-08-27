import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DeviceAccessory, DeviceLens, DeviceSpecifications, TestResult } from '@/types';
import {
  fieldIsVisible,
  type DeviceCategoryDefinition,
  type DeviceFieldDefinition,
} from '@/lib/deviceCategories';
import { getSpecValue, setSpecValue } from '@/lib/deviceSpecs';

const TEST_STATES: { value: TestResult; label: string }[] = [
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'not-tested', label: 'Not Tested' },
];

function ChipRow({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const known = options.includes(value) || !value;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt === 'Other' && !options.slice(0, -1).includes(value) ? value || 'Other' : opt)}
            className={`h-7 px-2 rounded-md text-[10px] font-semibold border transition-colors ${
              (opt === 'Other' ? !known || value === 'Other' : value === opt)
                ? 'bg-primary text-white border-primary'
                : 'bg-background text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      {(value === 'Other' || (!known && value)) && options.includes('Other') && (
        <Input
          value={known ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-[12px]"
          placeholder="Enter value"
        />
      )}
    </div>
  );
}

function FieldControl({
  field,
  specs,
  onChange,
}: {
  field: DeviceFieldDefinition;
  specs: DeviceSpecifications;
  onChange: (next: DeviceSpecifications) => void;
}) {
  const raw = getSpecValue(specs, field.key);
  const value = raw === undefined || raw === null ? '' : String(raw);
  const set = (v: string) => onChange(setSpecValue(specs, field.key, v));

  if (field.type === 'chips' && field.options) {
    return <ChipRow value={value} options={field.options} onChange={set} />;
  }
  if (field.type === 'select' && field.options) {
    return (
      <Select value={value || 'Unknown'} onValueChange={set}>
        <SelectTrigger className="mt-1 h-8 text-[12px]"><SelectValue placeholder="Select" /></SelectTrigger>
        <SelectContent>
          {field.options.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === 'yes-no-unknown') {
    return <ChipRow value={value} options={['Yes', 'No', 'Unknown']} onChange={set} />;
  }
  return (
    <Input
      value={value}
      onChange={(e) => set(e.target.value)}
      className="mt-1 h-8 text-[12px]"
      placeholder={field.placeholder}
    />
  );
}

export default function DeviceIntakeFields({
  category,
  specs,
  onChange,
}: {
  category: DeviceCategoryDefinition;
  specs: DeviceSpecifications;
  onChange: (next: DeviceSpecifications) => void;
}) {
  const specRecord = specs as Record<string, unknown>;
  const storage = Array.isArray(specs.storage) ? specs.storage : [];
  const lenses = Array.isArray(specs.lenses) ? specs.lenses : [];
  const accessories = Array.isArray(specs.accessories) ? specs.accessories : [];
  const tests = specs.tests || {};

  const toggleAccessory = (id: string, included: boolean) => {
    const next = accessories.map((a) => (a.id === id ? { ...a, included } : a));
    onChange({ ...specs, accessories: next });
  };

  const setAccessoryQty = (id: string, quantity: number) => {
    const next = accessories.map((a) => (a.id === id ? { ...a, quantity } : a));
    onChange({ ...specs, accessories: next });
  };

  const setTest = (id: string, value: TestResult) => {
    onChange({ ...specs, tests: { ...tests, [id]: value } });
  };

  const setConditionDetail = (id: string, value: string) => {
    onChange({
      ...specs,
      conditionDetails: { ...(specs.conditionDetails || {}), [id]: value },
    });
  };

  return (
    <div className="space-y-4">
      {category.sections.map((section) => {
        const visible = section.fields.filter((field) => fieldIsVisible(field, specRecord));
        if (visible.length === 0) return null;
        return (
          <div key={section.id} className="rounded-lg border border-border bg-card p-3 space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{section.label}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
              {visible.map((field) => (
                <div key={field.key} className={field.type === 'chips' ? 'sm:col-span-2' : ''}>
                  <Label className="text-[11px] font-medium">
                    {field.label}
                    {field.recommended ? <span className="text-muted-foreground font-normal"> (recommended)</span> : null}
                  </Label>
                  <div className="mt-1">
                    <FieldControl field={field} specs={specs} onChange={onChange} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {category.storageList && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Storage Drives</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              onClick={() => onChange({ ...specs, storage: [...storage, { type: '', capacity: '' }] })}
            >
              Add Storage Drive
            </Button>
          </div>
          {storage.map((drive, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <div>
                <Label className="text-[10px]">Capacity</Label>
                <ChipRow
                  value={drive.capacity}
                  options={['128GB', '256GB', '512GB', '1TB', '2TB', '4TB', 'Other', 'Unknown']}
                  onChange={(capacity) => {
                    const next = storage.map((d, i) => (i === idx ? { ...d, capacity } : d));
                    onChange({ ...specs, storage: next });
                  }}
                />
              </div>
              <div>
                <Label className="text-[10px]">Type</Label>
                <ChipRow
                  value={drive.type}
                  options={['HDD', 'SATA SSD', 'NVMe SSD', 'eMMC', 'Other', 'Unknown']}
                  onChange={(type) => {
                    const next = storage.map((d, i) => (i === idx ? { ...d, type } : d));
                    onChange({ ...specs, storage: next });
                  }}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-[10px]"
                onClick={() => onChange({ ...specs, storage: storage.filter((_, i) => i !== idx) })}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {category.lensList && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Lenses Included</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              onClick={() => onChange({
                ...specs,
                lenses: [...lenses, { brand: '', model: '', focalLength: '', maxAperture: '', serialNumber: '' }],
              })}
            >
              Add Lens
            </Button>
          </div>
          {lenses.length === 0 && <p className="text-[11px] text-muted-foreground">No lenses added (body only is fine).</p>}
          {lenses.map((lens, idx) => (
            <div key={idx} className="grid grid-cols-2 gap-2 p-2 rounded-md bg-secondary/40">
              {([
                ['brand', 'Lens Brand'],
                ['model', 'Lens Model'],
                ['focalLength', 'Focal Length'],
                ['maxAperture', 'Maximum Aperture'],
                ['serialNumber', 'Lens Serial Number'],
              ] as Array<[keyof DeviceLens, string]>).map(([key, label]) => (
                <div key={key}>
                  <Label className="text-[10px]">{label}</Label>
                  <Input
                    value={lens[key]}
                    onChange={(e) => {
                      const next = lenses.map((l, i) => (i === idx ? { ...l, [key]: e.target.value } : l));
                      onChange({ ...specs, lenses: next });
                    }}
                    className="mt-0.5 h-8 text-[12px]"
                  />
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px] col-span-2"
                onClick={() => onChange({ ...specs, lenses: lenses.filter((_, i) => i !== idx) })}>
                Remove lens
              </Button>
            </div>
          ))}
        </div>
      )}

      {category.conditionDetails.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Condition Details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {category.conditionDetails.map((detail) => (
              <div key={detail.id}>
                <Label className="text-[11px]">{detail.label}</Label>
                <div className="mt-1">
                  <ChipRow
                    value={(specs.conditionDetails || {})[detail.id] || ''}
                    options={detail.options}
                    onChange={(v) => setConditionDetail(detail.id, v)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Functional Tests</p>
        <div className="space-y-1.5">
          {category.tests.map((test) => {
            const current = (tests[test.id] as TestResult) || 'not-tested';
            return (
              <div key={test.id} className="flex items-center justify-between gap-2">
                <span className="text-[12px]">{test.label}</span>
                <div className="flex gap-1">
                  {TEST_STATES.map((state) => (
                    <button
                      key={state.value}
                      type="button"
                      onClick={() => setTest(test.id, state.value)}
                      className={`h-7 px-2 rounded-md text-[10px] font-semibold border ${
                        current === state.value
                          ? state.value === 'pass'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : state.value === 'fail'
                              ? 'bg-red-600 text-white border-red-600'
                              : 'bg-slate-600 text-white border-slate-600'
                          : 'bg-background text-muted-foreground border-border'
                      }`}
                    >
                      {state.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Accessories Included</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {category.accessories.map((acc) => {
            const row: DeviceAccessory = accessories.find((a) => a.id === acc.id) || { id: acc.id, included: false };
            return (
              <label key={acc.id} className="flex items-center gap-2 text-[12px] cursor-pointer py-0.5">
                <Checkbox checked={row.included} onCheckedChange={(v) => toggleAccessory(acc.id, v === true)} />
                <span>{acc.label}</span>
                {acc.quantity && row.included && (
                  <Input
                    type="number"
                    min={1}
                    value={row.quantity || 1}
                    onChange={(e) => setAccessoryQty(acc.id, Math.max(1, Number(e.target.value)))}
                    className="h-7 w-16 text-[11px] ml-auto"
                  />
                )}
              </label>
            );
          })}
        </div>
        <div>
          <Label className="text-[11px]">Add Other Accessory</Label>
          <Input
            value={specs.otherAccessories || ''}
            onChange={(e) => onChange({ ...specs, otherAccessories: e.target.value })}
            className="mt-1 h-8 text-[12px]"
            placeholder="Anything else included…"
          />
        </div>
      </div>
    </div>
  );
}
