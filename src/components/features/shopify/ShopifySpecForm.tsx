import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  fieldIsVisible,
  type SpecCategoryDefinition,
  type SpecFieldDefinition,
} from '@/config/productSpecifications';
import { getAttributeValue, setAttributeValue } from '@/lib/shopify/attributes';
import type { ShopifyLens, ShopifyStorageDevice } from '@/types/shopify';

const UNKNOWN_OPTS = ['Unknown', 'Not Applicable'];

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
            onClick={() => onChange(value === opt ? '' : opt)}
            className={`h-7 px-2 rounded-md text-[10px] font-semibold border transition-colors ${
              value === opt
                ? 'bg-primary text-white border-primary'
                : 'bg-background text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      {(value === 'Other' || (!known && value)) && options.includes('Other') && (
        <Input value={known ? '' : value} onChange={(e) => onChange(e.target.value)} className="h-8 text-[12px]" placeholder="Enter value" />
      )}
    </div>
  );
}

function FieldControl({
  field,
  attributes,
  onChange,
}: {
  field: SpecFieldDefinition;
  attributes: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const raw = getAttributeValue(attributes, field.key);
  const value = raw === undefined || raw === null ? '' : String(raw);
  const set = (v: string) => onChange(setAttributeValue(attributes, field.key, v));
  const extras = [
    ...(field.allowUnknown === false ? [] : ['Unknown']),
    ...(field.allowNotApplicable === false ? [] : ['Not Applicable']),
  ];

  if (field.inputType === 'chips' && field.options) {
    return <ChipRow value={value} options={[...field.options, 'Other', ...extras]} onChange={set} />;
  }
  if (field.inputType === 'yes-no-unknown') {
    return <ChipRow value={value} options={['Yes', 'No', ...UNKNOWN_OPTS]} onChange={set} />;
  }
  if (field.inputType === 'select' && field.options) {
    return <ChipRow value={value} options={[...field.options, ...extras]} onChange={set} />;
  }
  if (field.inputType === 'textarea') {
    return <Textarea value={value} onChange={(e) => set(e.target.value)} className="mt-1 text-[12px] min-h-[64px]" placeholder={field.placeholder} />;
  }
  return (
    <Input
      type={field.inputType === 'number' ? 'number' : 'text'}
      value={value}
      onChange={(e) => set(e.target.value)}
      className="mt-1 h-8 text-[12px]"
      placeholder={field.placeholder}
    />
  );
}

export default function ShopifySpecForm({
  category,
  attributes,
  onChange,
}: {
  category: SpecCategoryDefinition;
  attributes: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const additionalStorage = Array.isArray(attributes.additionalStorage)
    ? attributes.additionalStorage as ShopifyStorageDevice[]
    : [];
  const lenses = Array.isArray(attributes.lenses) ? attributes.lenses as ShopifyLens[] : [];
  const lensKit = String(getAttributeValue(attributes, 'lensKit') || '');

  return (
    <Accordion type="multiple" defaultValue={['identification', 'condition']} className="space-y-2">
      {category.sections.map((section) => {
        const fields = category.fields.filter((f) => f.section === section.id && fieldIsVisible(f, attributes));
        if (!fields.length) return null;
        return (
          <AccordionItem key={section.id} value={section.id} className="border rounded-lg px-3 bg-card">
            <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">
              {section.label}
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2 pb-2">
                {fields.map((field) => (
                  <div key={field.key} className={field.inputType === 'chips' || field.inputType === 'textarea' ? 'sm:col-span-2' : ''}>
                    <Label className="text-[11px] font-medium">
                      {field.label}
                      {field.required ? <span className="text-destructive"> *</span> : null}
                      {field.publicVisibility === 'internal_only' ? (
                        <span className="ml-1 text-[9px] uppercase tracking-wide text-muted-foreground">Internal</span>
                      ) : null}
                    </Label>
                    <div className="mt-1">
                      <FieldControl field={field} attributes={attributes} onChange={onChange} />
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}

      {category.hasAdditionalStorage && (
        <AccordionItem value="more-storage" className="border rounded-lg px-3 bg-card">
          <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Additional Storage</AccordionTrigger>
          <AccordionContent className="space-y-2 pb-3">
            {additionalStorage.map((drive, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  value={drive.capacity}
                  onChange={(e) => {
                    const next = additionalStorage.map((d, i) => (i === idx ? { ...d, capacity: e.target.value } : d));
                    onChange({ ...attributes, additionalStorage: next });
                  }}
                  className="h-8 text-[12px]"
                  placeholder="Capacity"
                />
                <Input
                  value={drive.type}
                  onChange={(e) => {
                    const next = additionalStorage.map((d, i) => (i === idx ? { ...d, type: e.target.value } : d));
                    onChange({ ...attributes, additionalStorage: next });
                  }}
                  className="h-8 text-[12px]"
                  placeholder="Type"
                />
                <Button type="button" variant="ghost" size="sm" className="h-8 text-[10px]"
                  onClick={() => onChange({ ...attributes, additionalStorage: additionalStorage.filter((_, i) => i !== idx) })}>
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[10px]"
              onClick={() => onChange({ ...attributes, additionalStorage: [...additionalStorage, { type: '', capacity: '' }] })}
            >
              Add storage device
            </Button>
          </AccordionContent>
        </AccordionItem>
      )}

      {category.hasLenses && (lensKit === 'Lens Included' || lenses.length > 0 || !lensKit) && (
        <AccordionItem value="lenses" className="border rounded-lg px-3 bg-card">
          <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Lenses</AccordionTrigger>
          <AccordionContent className="space-y-3 pb-3">
            {lenses.length === 0 && <p className="text-[11px] text-muted-foreground">Body only is fine. Add a lens if one is included.</p>}
            {lenses.map((lens, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 rounded-md bg-secondary/40 p-2">
                {([
                  ['brand', 'Lens Brand'],
                  ['model', 'Lens Model'],
                  ['focalLength', 'Focal Length'],
                  ['maxAperture', 'Maximum Aperture'],
                  ['mount', 'Lens Mount'],
                  ['serialNumber', 'Lens Serial Number'],
                  ['condition', 'Lens Condition'],
                ] as Array<[keyof ShopifyLens, string]>).map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-[10px]">{label}</Label>
                    <Input
                      value={lens[key]}
                      onChange={(e) => {
                        const next = lenses.map((l, i) => (i === idx ? { ...l, [key]: e.target.value } : l));
                        onChange({ ...attributes, lenses: next });
                      }}
                      className="mt-0.5 h-8 text-[12px]"
                    />
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px] col-span-2"
                  onClick={() => onChange({ ...attributes, lenses: lenses.filter((_, i) => i !== idx) })}>
                  Remove lens
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[10px]"
              onClick={() => onChange({
                ...attributes,
                lensKit: 'Lens Included',
                lenses: [...lenses, { brand: '', model: '', focalLength: '', maxAperture: '', mount: '', serialNumber: '', condition: '' }],
              })}
            >
              Add lens
            </Button>
          </AccordionContent>
        </AccordionItem>
      )}
    </Accordion>
  );
}
