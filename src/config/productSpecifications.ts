export type SpecInputType =
  | 'text'
  | 'number'
  | 'select'
  | 'chips'
  | 'yes-no-unknown'
  | 'textarea';

export type SpecVisibility = 'public' | 'optional_public' | 'internal_only';

export interface SpecFieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
}

export interface SpecFieldDefinition {
  key: string;
  label: string;
  inputType: SpecInputType;
  options?: string[];
  required?: boolean;
  section: string;
  includeInTitle?: boolean;
  includeInDescription?: boolean;
  publicVisibility: SpecVisibility;
  validation?: SpecFieldValidation;
  displayOrder: number;
  allowUnknown?: boolean;
  allowNotApplicable?: boolean;
  placeholder?: string;
  titleFormat?: string;
  showIf?: { key: string; equals: string | string[] };
}

export interface SpecSectionDefinition {
  id: string;
  label: string;
}

export interface SpecCategoryDefinition {
  key: string;
  label: string;
  productType: string;
  titleSuffix?: string;
  defaultBrand?: string;
  hasAdditionalStorage?: boolean;
  hasLenses?: boolean;
  sections: SpecSectionDefinition[];
  fields: SpecFieldDefinition[];
  tests: Array<{ id: string; label: string; publicVisibility?: SpecVisibility }>;
  accessories: Array<{ id: string; label: string; quantity?: boolean }>;
}

const RAM = ['4GB', '8GB', '12GB', '16GB', '24GB', '32GB', '48GB', '64GB', '128GB'];
const STORAGE = ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB', '4TB'];
const PHONE_STORAGE = ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB'];
const RAM_TYPE = ['DDR3', 'DDR4', 'DDR5', 'LPDDR4', 'LPDDR5'];
const STORAGE_TYPE = ['HDD', 'SATA SSD', 'NVMe SSD', 'eMMC'];
const COSMETIC = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
const CONDITION = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor', 'For Parts'];
const YNU = ['Yes', 'No'];
const VIDEO = ['720p', '1080p', '4K', '6K', '8K'];
const PANEL = ['IPS', 'TN', 'VA', 'OLED', 'Mini-LED', 'LCD'];
const SIM = ['Physical SIM', 'eSIM', 'Dual SIM'];
const CARRIER_STATUS = ['Unlocked', 'Locked', 'Unknown'];

type FieldDraft = Omit<SpecFieldDefinition, 'displayOrder' | 'section'> & {
  section?: string;
};

function buildFields(sectionId: string, start: number, drafts: FieldDraft[]): SpecFieldDefinition[] {
  return drafts.map((draft, i) => ({
    allowUnknown: draft.required ? false : true,
    allowNotApplicable: draft.required ? false : true,
    includeInTitle: false,
    includeInDescription: draft.publicVisibility !== 'internal_only',
    required: false,
    inputType: draft.inputType,
    ...draft,
    section: draft.section || sectionId,
    displayOrder: start + i,
  }));
}

function identification(extra: FieldDraft[] = [], serialInternal = true): FieldDraft[] {
  return [
    { key: 'brand', label: 'Brand', inputType: 'text', publicVisibility: 'public', includeInTitle: true, required: false, placeholder: 'e.g. ASUS' },
    { key: 'model', label: 'Model', inputType: 'text', publicVisibility: 'public', includeInTitle: true, required: false, placeholder: 'e.g. ROG Zephyrus G14' },
    { key: 'modelNumber', label: 'Model Number', inputType: 'text', publicVisibility: 'public', includeInTitle: true, placeholder: 'e.g. GA402XV' },
    {
      key: 'serialNumber',
      label: 'Serial Number',
      inputType: 'text',
      publicVisibility: serialInternal ? 'internal_only' : 'optional_public',
      includeInDescription: false,
    },
    ...extra,
  ];
}

function conditionFields(extras: FieldDraft[] = []): FieldDraft[] {
  return [
    { key: 'cosmeticCondition', label: 'Cosmetic Condition', inputType: 'chips', options: COSMETIC, publicVisibility: 'public', required: true },
    { key: 'functionalCondition', label: 'Functional Condition', inputType: 'chips', options: CONDITION, publicVisibility: 'public', required: true },
    ...extras,
  ];
}

const DEVICE_TESTS = [
  { id: 'powersOn', label: 'Powers On' },
  { id: 'display', label: 'Display' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'charging', label: 'Charging' },
];

function windowsLaptop(): SpecCategoryDefinition {
  const identificationSection = buildFields('identification', 10, [
    ...identification([
      { key: 'series', label: 'Series / Product Line', inputType: 'text', publicVisibility: 'public', includeInTitle: true, placeholder: 'e.g. ROG Zephyrus' },
    ]),
  ]);
  const cpu = buildFields('cpu', 20, [
    { key: 'cpu.manufacturer', label: 'CPU Manufacturer', inputType: 'chips', options: ['Intel', 'AMD', 'Qualcomm', 'Other'], publicVisibility: 'public' },
    { key: 'cpu.family', label: 'CPU Family', inputType: 'text', publicVisibility: 'public', includeInTitle: true, placeholder: 'e.g. Ryzen 9' },
    { key: 'cpu.model', label: 'CPU Model', inputType: 'text', publicVisibility: 'public', includeInTitle: true, placeholder: 'e.g. Ryzen 9 7940HS' },
    { key: 'cpu.generation', label: 'CPU Generation', inputType: 'text', publicVisibility: 'optional_public' },
  ]);
  const gpu = buildFields('gpu', 30, [
    { key: 'gpu.type', label: 'GPU Type', inputType: 'chips', options: ['Integrated', 'Dedicated', 'Both'], publicVisibility: 'public' },
    { key: 'gpu.manufacturer', label: 'GPU Manufacturer', inputType: 'chips', options: ['NVIDIA', 'AMD', 'Intel'], publicVisibility: 'public' },
    { key: 'gpu.model', label: 'GPU Model', inputType: 'text', publicVisibility: 'public', includeInTitle: true, placeholder: 'e.g. RTX 4060' },
    { key: 'gpu.vram', label: 'GPU VRAM', inputType: 'chips', options: ['4GB', '6GB', '8GB', '10GB', '12GB', '16GB', '24GB'], publicVisibility: 'public' },
  ]);
  const ram = buildFields('ram', 40, [
    { key: 'ram.total', label: 'RAM Total', inputType: 'chips', options: RAM, publicVisibility: 'public', includeInTitle: true },
    { key: 'ram.type', label: 'RAM Type', inputType: 'chips', options: RAM_TYPE, publicVisibility: 'public' },
    { key: 'ram.configuration', label: 'RAM Configuration', inputType: 'text', publicVisibility: 'optional_public', placeholder: 'e.g. 8GB + 8GB' },
    { key: 'ram.slotsTotal', label: 'RAM Slots Total', inputType: 'number', publicVisibility: 'optional_public' },
    { key: 'ram.slotsUsed', label: 'RAM Slots Used', inputType: 'number', publicVisibility: 'optional_public' },
  ]);
  const storage = buildFields('storage', 50, [
    { key: 'storage.primaryType', label: 'Primary Storage Type', inputType: 'chips', options: STORAGE_TYPE, publicVisibility: 'public' },
    { key: 'storage.primaryCapacity', label: 'Primary Storage Capacity', inputType: 'chips', options: STORAGE, publicVisibility: 'public', includeInTitle: true },
  ]);
  const display = buildFields('display', 60, [
    { key: 'display.size', label: 'Screen Size', inputType: 'chips', options: ['13"', '14"', '15.6"', '16"', '17.3"'], publicVisibility: 'public' },
    { key: 'display.resolution', label: 'Screen Resolution', inputType: 'text', publicVisibility: 'public', placeholder: 'e.g. 1920×1080' },
    { key: 'display.refreshRate', label: 'Refresh Rate', inputType: 'chips', options: ['60Hz', '90Hz', '120Hz', '144Hz', '165Hz', '240Hz'], publicVisibility: 'public' },
    { key: 'display.touchscreen', label: 'Touchscreen', inputType: 'yes-no-unknown', publicVisibility: 'public' },
    { key: 'display.panelType', label: 'Panel Type', inputType: 'chips', options: PANEL, publicVisibility: 'optional_public' },
  ]);
  const os = buildFields('os', 70, [
    { key: 'os', label: 'Operating System', inputType: 'chips', options: ['Windows 10', 'Windows 11', 'No OS'], publicVisibility: 'public' },
    { key: 'windowsEdition', label: 'Windows Edition', inputType: 'chips', options: ['Home', 'Pro', 'S Mode', 'Enterprise'], publicVisibility: 'optional_public' },
  ]);
  const battery = buildFields('battery', 80, [
    { key: 'battery.health', label: 'Battery Health', inputType: 'text', publicVisibility: 'optional_public', placeholder: 'e.g. 87%' },
    { key: 'battery.condition', label: 'Battery Condition', inputType: 'chips', options: COSMETIC, publicVisibility: 'public' },
  ]);
  const keyboard = buildFields('keyboard', 90, [
    { key: 'keyboard.layout', label: 'Keyboard Layout', inputType: 'chips', options: ['US', 'UK', 'ISO', 'ANSI'], publicVisibility: 'optional_public' },
    { key: 'keyboard.backlit', label: 'Backlit Keyboard', inputType: 'yes-no-unknown', publicVisibility: 'public' },
  ]);
  const ports = buildFields('connectivity', 100, [
    { key: 'webcam', label: 'Webcam', inputType: 'yes-no-unknown', publicVisibility: 'public' },
    { key: 'wifi', label: 'Wi-Fi', inputType: 'yes-no-unknown', publicVisibility: 'public' },
    { key: 'bluetooth', label: 'Bluetooth', inputType: 'yes-no-unknown', publicVisibility: 'public' },
    { key: 'ports.usbA', label: 'USB-A', inputType: 'yes-no-unknown', publicVisibility: 'public' },
    { key: 'ports.usbC', label: 'USB-C', inputType: 'yes-no-unknown', publicVisibility: 'public' },
    { key: 'ports.thunderbolt', label: 'Thunderbolt', inputType: 'yes-no-unknown', publicVisibility: 'public' },
    { key: 'ports.hdmi', label: 'HDMI', inputType: 'yes-no-unknown', publicVisibility: 'public' },
    { key: 'ports.ethernet', label: 'Ethernet', inputType: 'yes-no-unknown', publicVisibility: 'public' },
    { key: 'ports.sdCard', label: 'SD Card', inputType: 'yes-no-unknown', publicVisibility: 'public' },
  ]);
  const extras = buildFields('details', 110, [
    { key: 'color', label: 'Color', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
    { key: 'chargerIncluded', label: 'Charger Included', inputType: 'yes-no-unknown', publicVisibility: 'public' },
    { key: 'chargerWattage', label: 'Charger Wattage', inputType: 'text', publicVisibility: 'optional_public', placeholder: 'e.g. 180W' },
  ]);
  const condition = buildFields('condition', 120, conditionFields());

  return {
    key: 'windows-laptop',
    label: 'Windows Laptop',
    productType: 'Windows Laptop',
    titleSuffix: 'Laptop',
    hasAdditionalStorage: true,
    sections: [
      { id: 'identification', label: 'Identification' },
      { id: 'cpu', label: 'Processor' },
      { id: 'gpu', label: 'Graphics' },
      { id: 'ram', label: 'Memory' },
      { id: 'storage', label: 'Storage' },
      { id: 'display', label: 'Display' },
      { id: 'os', label: 'Operating System' },
      { id: 'battery', label: 'Battery' },
      { id: 'keyboard', label: 'Keyboard' },
      { id: 'connectivity', label: 'Ports & Wireless' },
      { id: 'details', label: 'Details' },
      { id: 'condition', label: 'Condition' },
    ],
    fields: [...identificationSection, ...cpu, ...gpu, ...ram, ...storage, ...display, ...os, ...battery, ...keyboard, ...ports, ...extras, ...condition],
    tests: [
      { id: 'powersOn', label: 'Powers On' },
      { id: 'displayGood', label: 'Display' },
      { id: 'keyboardGood', label: 'Keyboard' },
      { id: 'trackpadGood', label: 'Trackpad' },
      { id: 'wifi', label: 'Wi-Fi' },
      { id: 'bluetooth', label: 'Bluetooth' },
      { id: 'webcam', label: 'Webcam' },
      { id: 'speakers', label: 'Speakers' },
      { id: 'usb', label: 'USB Ports' },
      { id: 'chargingPort', label: 'Charging Port' },
      { id: 'batteryHoldsCharge', label: 'Battery Holds Charge' },
    ],
    accessories: [
      { id: 'original-charger', label: 'Original Charger' },
      { id: 'replacement-charger', label: 'Replacement Charger' },
      { id: 'laptop-bag', label: 'Laptop Bag' },
      { id: 'original-box', label: 'Original Box' },
      { id: 'manual', label: 'Manual' },
      { id: 'dock', label: 'Dock' },
      { id: 'mouse', label: 'Mouse' },
    ],
  };
}

function macbook(): SpecCategoryDefinition {
  return {
    key: 'macbook',
    label: 'MacBook',
    productType: 'MacBook',
    titleSuffix: 'MacBook',
    defaultBrand: 'Apple',
    sections: [
      { id: 'identification', label: 'Identification' },
      { id: 'chip', label: 'Apple Silicon / CPU' },
      { id: 'memory', label: 'Memory & Storage' },
      { id: 'display', label: 'Display' },
      { id: 'battery', label: 'Battery' },
      { id: 'details', label: 'Details' },
      { id: 'condition', label: 'Condition' },
    ],
    fields: [
      ...buildFields('identification', 10, [
        { key: 'macFamily', label: 'MacBook Family', inputType: 'chips', options: ['MacBook Air', 'MacBook Pro', 'MacBook'], publicVisibility: 'public', includeInTitle: true },
        { key: 'model', label: 'Model', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
        { key: 'modelNumber', label: 'Model Number', inputType: 'text', publicVisibility: 'public', includeInTitle: true, placeholder: 'e.g. A2337' },
        { key: 'modelIdentifier', label: 'Model Identifier', inputType: 'text', publicVisibility: 'optional_public', placeholder: 'e.g. MacBookPro18,3' },
        { key: 'year', label: 'Year', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
        { key: 'serialNumber', label: 'Serial Number', inputType: 'text', publicVisibility: 'internal_only', includeInDescription: false },
      ]),
      ...buildFields('chip', 20, [
        { key: 'chip', label: 'Apple Chip', inputType: 'chips', options: ['Intel', 'M1', 'M1 Pro', 'M1 Max', 'M2', 'M2 Pro', 'M2 Max', 'M3', 'M3 Pro', 'M3 Max', 'M4', 'M4 Pro', 'M4 Max'], publicVisibility: 'public', includeInTitle: true },
        { key: 'cpu.cores', label: 'CPU Core Count', inputType: 'text', publicVisibility: 'public' },
        { key: 'gpu.cores', label: 'GPU Core Count', inputType: 'text', publicVisibility: 'public' },
      ]),
      ...buildFields('memory', 30, [
        { key: 'ram.total', label: 'Unified Memory', inputType: 'chips', options: RAM, publicVisibility: 'public', includeInTitle: true },
        { key: 'storage.primaryCapacity', label: 'Storage', inputType: 'chips', options: STORAGE, publicVisibility: 'public', includeInTitle: true },
      ]),
      ...buildFields('display', 40, [
        { key: 'display.size', label: 'Screen Size', inputType: 'chips', options: ['13"', '14"', '15"', '16"'], publicVisibility: 'public', includeInTitle: true },
        { key: 'color', label: 'Color', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
      ]),
      ...buildFields('battery', 50, [
        { key: 'battery.cycleCount', label: 'Battery Cycle Count', inputType: 'number', publicVisibility: 'optional_public' },
        { key: 'battery.maxCapacity', label: 'Battery Maximum Capacity %', inputType: 'text', publicVisibility: 'public', placeholder: 'e.g. 88' },
      ]),
      ...buildFields('details', 60, [
        { key: 'chargerIncluded', label: 'Charger Included', inputType: 'yes-no-unknown', publicVisibility: 'public' },
        { key: 'chargerWattage', label: 'Charger Wattage', inputType: 'text', publicVisibility: 'optional_public', placeholder: 'e.g. 67W' },
        { key: 'keyboard.layout', label: 'Keyboard Layout', inputType: 'chips', options: ['US', 'UK', 'ISO', 'ANSI'], publicVisibility: 'optional_public' },
        { key: 'touchBar', label: 'Touch Bar', inputType: 'yes-no-unknown', publicVisibility: 'public' },
      ]),
      ...buildFields('condition', 70, conditionFields()),
    ],
    tests: [
      { id: 'display', label: 'Display' },
      { id: 'keyboard', label: 'Keyboard' },
      { id: 'trackpad', label: 'Trackpad' },
      { id: 'battery', label: 'Battery' },
      { id: 'wifi', label: 'Wi-Fi' },
      { id: 'bluetooth', label: 'Bluetooth' },
      { id: 'webcam', label: 'Webcam' },
      { id: 'speakers', label: 'Speakers' },
      { id: 'charging', label: 'Charging' },
      { id: 'thunderbolt', label: 'USB-C / Thunderbolt' },
    ],
    accessories: [
      { id: 'original-charger', label: 'Original Charger' },
      { id: 'replacement-charger', label: 'Replacement Charger' },
      { id: 'usb-cable', label: 'USB-C Cable' },
      { id: 'magsafe-cable', label: 'MagSafe Cable' },
      { id: 'original-box', label: 'Original Box' },
    ],
  };
}

function appleIphone(): SpecCategoryDefinition {
  return {
    key: 'apple-iphone',
    label: 'Apple iPhone',
    productType: 'Smartphone',
    defaultBrand: 'Apple',
    sections: [
      { id: 'identification', label: 'Identification' },
      { id: 'network', label: 'Network & Lock' },
      { id: 'battery', label: 'Battery' },
      { id: 'biometrics', label: 'Biometrics' },
      { id: 'condition', label: 'Condition' },
    ],
    fields: [
      ...buildFields('identification', 10, [
        { key: 'model', label: 'Model', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
        { key: 'modelNumber', label: 'Model Number', inputType: 'text', publicVisibility: 'optional_public' },
        { key: 'imei1', label: 'IMEI 1', inputType: 'text', publicVisibility: 'internal_only', includeInDescription: false },
        { key: 'imei2', label: 'IMEI 2', inputType: 'text', publicVisibility: 'internal_only', includeInDescription: false },
        { key: 'serialNumber', label: 'Serial Number', inputType: 'text', publicVisibility: 'internal_only', includeInDescription: false },
        { key: 'storage.primaryCapacity', label: 'Storage', inputType: 'chips', options: PHONE_STORAGE, publicVisibility: 'public', includeInTitle: true },
        { key: 'color', label: 'Color', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
      ]),
      ...buildFields('network', 20, [
        { key: 'carrier', label: 'Carrier', inputType: 'text', publicVisibility: 'optional_public' },
        { key: 'unlockedStatus', label: 'Unlocked Status', inputType: 'chips', options: CARRIER_STATUS, publicVisibility: 'public', includeInTitle: true },
        { key: 'simType', label: 'SIM Type', inputType: 'chips', options: SIM, publicVisibility: 'public' },
        { key: 'network', label: 'Network', inputType: 'chips', options: ['5G', '4G LTE', 'Unknown'], publicVisibility: 'public' },
        { key: 'icloudLock', label: 'iCloud / Activation Lock Status', inputType: 'chips', options: ['Off', 'On', 'Unknown'], publicVisibility: 'public' },
        { key: 'findMyIphone', label: 'Find My iPhone Status', inputType: 'chips', options: ['Off', 'On', 'Unknown'], publicVisibility: 'public' },
      ]),
      ...buildFields('battery', 30, [
        { key: 'battery.health', label: 'Battery Health %', inputType: 'text', publicVisibility: 'public', placeholder: 'e.g. 88' },
        { key: 'battery.cycleCount', label: 'Battery Cycle Count', inputType: 'number', publicVisibility: 'optional_public' },
      ]),
      ...buildFields('biometrics', 40, [
        { key: 'faceId', label: 'Face ID', inputType: 'select', options: ['Pass', 'Fail', 'Not Tested', 'Not Applicable'], publicVisibility: 'public' },
        { key: 'touchId', label: 'Touch ID', inputType: 'select', options: ['Pass', 'Fail', 'Not Tested', 'Not Applicable'], publicVisibility: 'public' },
      ]),
      ...buildFields('condition', 50, [
        { key: 'cosmeticCondition', label: 'Cosmetic Condition', inputType: 'chips', options: COSMETIC, publicVisibility: 'public', required: true },
        { key: 'screenCondition', label: 'Screen Condition', inputType: 'chips', options: COSMETIC, publicVisibility: 'public' },
        { key: 'backGlassCondition', label: 'Back Glass Condition', inputType: 'chips', options: COSMETIC, publicVisibility: 'public' },
      ]),
    ],
    tests: [
      { id: 'camera', label: 'Camera' },
      { id: 'microphone', label: 'Microphone' },
      { id: 'speaker', label: 'Speaker' },
      { id: 'charging', label: 'Charging' },
      { id: 'wifi', label: 'Wi-Fi' },
      { id: 'bluetooth', label: 'Bluetooth' },
      { id: 'buttons', label: 'Buttons' },
      { id: 'screen', label: 'Screen' },
      { id: 'touch', label: 'Touch' },
    ],
    accessories: [
      { id: 'usb-cable', label: 'USB Cable' },
      { id: 'original-charger', label: 'Original Charger' },
      { id: 'replacement-charger', label: 'Replacement Charger' },
      { id: 'original-box', label: 'Original Box' },
      { id: 'case', label: 'Case' },
    ],
  };
}

function androidPhone(): SpecCategoryDefinition {
  return {
    key: 'android-phone',
    label: 'Android Phone',
    productType: 'Smartphone',
    sections: [
      { id: 'identification', label: 'Identification' },
      { id: 'network', label: 'Network' },
      { id: 'software', label: 'Software & Battery' },
      { id: 'condition', label: 'Condition' },
    ],
    fields: [
      ...buildFields('identification', 10, [
        { key: 'brand', label: 'Brand', inputType: 'chips', options: ['Samsung', 'Google', 'Motorola', 'OnePlus', 'ASUS', 'Sony', 'Xiaomi', 'Other'], publicVisibility: 'public', includeInTitle: true },
        { key: 'model', label: 'Model', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
        { key: 'modelNumber', label: 'Model Number', inputType: 'text', publicVisibility: 'optional_public' },
        { key: 'imei1', label: 'IMEI 1', inputType: 'text', publicVisibility: 'internal_only', includeInDescription: false },
        { key: 'imei2', label: 'IMEI 2', inputType: 'text', publicVisibility: 'internal_only', includeInDescription: false },
        { key: 'serialNumber', label: 'Serial Number', inputType: 'text', publicVisibility: 'internal_only', includeInDescription: false },
        { key: 'storage.primaryCapacity', label: 'Storage', inputType: 'chips', options: PHONE_STORAGE, publicVisibility: 'public', includeInTitle: true },
        { key: 'ram.total', label: 'RAM', inputType: 'chips', options: RAM, publicVisibility: 'public', includeInTitle: true },
        { key: 'color', label: 'Color', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
      ]),
      ...buildFields('network', 20, [
        { key: 'carrier', label: 'Carrier', inputType: 'text', publicVisibility: 'optional_public' },
        { key: 'unlockedStatus', label: 'Unlocked', inputType: 'yes-no-unknown', publicVisibility: 'public', includeInTitle: true },
        { key: 'simType', label: 'SIM Type', inputType: 'chips', options: SIM, publicVisibility: 'public' },
        { key: 'fiveG', label: '5G Support', inputType: 'yes-no-unknown', publicVisibility: 'public' },
      ]),
      ...buildFields('software', 30, [
        { key: 'os', label: 'Android Version', inputType: 'text', publicVisibility: 'public' },
        { key: 'battery.health', label: 'Battery Health', inputType: 'text', publicVisibility: 'optional_public' },
        { key: 'spenIncluded', label: 'S Pen Included', inputType: 'yes-no-unknown', publicVisibility: 'public' },
      ]),
      ...buildFields('condition', 40, [
        { key: 'cosmeticCondition', label: 'Condition', inputType: 'chips', options: COSMETIC, publicVisibility: 'public', required: true },
      ]),
    ],
    tests: [
      { id: 'screen', label: 'Screen' },
      { id: 'chargingPort', label: 'Charging Port' },
      { id: 'camera', label: 'Camera' },
      { id: 'microphone', label: 'Microphone' },
      { id: 'speaker', label: 'Speaker' },
      { id: 'wifi', label: 'Wi-Fi' },
      { id: 'bluetooth', label: 'Bluetooth' },
      { id: 'fingerprint', label: 'Fingerprint' },
      { id: 'faceUnlock', label: 'Face Unlock' },
    ],
    accessories: [
      { id: 'usb-cable', label: 'USB Cable' },
      { id: 'original-charger', label: 'Original Charger' },
      { id: 'replacement-charger', label: 'Replacement Charger' },
      { id: 'original-box', label: 'Original Box' },
      { id: 'case', label: 'Case' },
      { id: 'stylus', label: 'S Pen / Stylus' },
    ],
  };
}

function desktopPc(key: string, label: string, productType: string, titleSuffix: string): SpecCategoryDefinition {
  return {
    key,
    label,
    productType,
    titleSuffix,
    hasAdditionalStorage: true,
    sections: [
      { id: 'identification', label: 'Identification' },
      { id: 'cpu', label: 'CPU' },
      { id: 'gpu', label: 'GPU' },
      { id: 'ram', label: 'Memory' },
      { id: 'motherboard', label: 'Motherboard' },
      { id: 'storage', label: 'Storage' },
      { id: 'power', label: 'Power & Case' },
      { id: 'details', label: 'Details' },
      { id: 'condition', label: 'Condition' },
    ],
    fields: [
      ...buildFields('identification', 10, [
        { key: 'brand', label: 'Brand', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
        { key: 'buildType', label: 'Type', inputType: 'chips', options: ['Prebuilt', 'Custom Built'], publicVisibility: 'public' },
        { key: 'model', label: 'Model', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
        { key: 'serialNumber', label: 'Serial Number', inputType: 'text', publicVisibility: 'internal_only', includeInDescription: false },
      ]),
      ...buildFields('cpu', 20, [
        { key: 'cpu.manufacturer', label: 'CPU Manufacturer', inputType: 'chips', options: ['Intel', 'AMD'], publicVisibility: 'public' },
        { key: 'cpu.model', label: 'CPU Model', inputType: 'text', publicVisibility: 'public', includeInTitle: true, placeholder: 'e.g. Ryzen 7 5800X' },
      ]),
      ...buildFields('gpu', 30, [
        { key: 'gpu.manufacturer', label: 'GPU Manufacturer', inputType: 'chips', options: ['NVIDIA', 'AMD', 'Intel'], publicVisibility: 'public' },
        { key: 'gpu.model', label: 'GPU Model', inputType: 'text', publicVisibility: 'public', includeInTitle: true, placeholder: 'e.g. RTX 3070' },
        { key: 'gpu.vram', label: 'GPU VRAM', inputType: 'chips', options: ['4GB', '6GB', '8GB', '10GB', '12GB', '16GB', '24GB'], publicVisibility: 'public' },
      ]),
      ...buildFields('ram', 40, [
        { key: 'ram.total', label: 'RAM Total', inputType: 'chips', options: RAM, publicVisibility: 'public', includeInTitle: true },
        { key: 'ram.type', label: 'RAM Type', inputType: 'chips', options: RAM_TYPE, publicVisibility: 'public' },
        { key: 'ram.speed', label: 'RAM Speed', inputType: 'text', publicVisibility: 'optional_public', placeholder: 'e.g. 3200MHz' },
        { key: 'ram.configuration', label: 'RAM Configuration', inputType: 'text', publicVisibility: 'optional_public' },
      ]),
      ...buildFields('motherboard', 50, [
        { key: 'motherboard.brand', label: 'Motherboard Brand', inputType: 'text', publicVisibility: 'optional_public' },
        { key: 'motherboard.model', label: 'Motherboard Model', inputType: 'text', publicVisibility: 'optional_public' },
      ]),
      ...buildFields('storage', 60, [
        { key: 'storage.primaryType', label: 'Primary Storage Type', inputType: 'chips', options: STORAGE_TYPE, publicVisibility: 'public' },
        { key: 'storage.primaryCapacity', label: 'Primary Storage Capacity', inputType: 'chips', options: STORAGE, publicVisibility: 'public', includeInTitle: true },
      ]),
      ...buildFields('power', 70, [
        { key: 'psu.brand', label: 'Power Supply Brand', inputType: 'text', publicVisibility: 'optional_public' },
        { key: 'psu.wattage', label: 'Power Supply Wattage', inputType: 'text', publicVisibility: 'public', placeholder: 'e.g. 750W' },
        { key: 'psu.rating', label: 'Power Supply Rating', inputType: 'chips', options: ['80+ White', '80+ Bronze', '80+ Gold', '80+ Platinum', '80+ Titanium'], publicVisibility: 'optional_public' },
        { key: 'case.brandModel', label: 'Case Brand / Model', inputType: 'text', publicVisibility: 'optional_public' },
        { key: 'cooling', label: 'Cooling Type', inputType: 'chips', options: ['Air Cooling', 'AIO Liquid Cooling', 'Custom Liquid Cooling'], publicVisibility: 'public' },
      ]),
      ...buildFields('details', 80, [
        { key: 'os', label: 'Operating System', inputType: 'chips', options: ['Windows 10', 'Windows 11', 'No OS'], publicVisibility: 'public' },
        { key: 'wifi', label: 'Wi-Fi', inputType: 'yes-no-unknown', publicVisibility: 'public' },
        { key: 'bluetooth', label: 'Bluetooth', inputType: 'yes-no-unknown', publicVisibility: 'public' },
      ]),
      ...buildFields('condition', 90, conditionFields()),
    ],
    tests: [
      { id: 'powersOn', label: 'Powers On' },
      { id: 'displayOutput', label: 'Display Output' },
      { id: 'usb', label: 'USB Ports' },
      { id: 'audio', label: 'Audio' },
      { id: 'network', label: 'Network' },
    ],
    accessories: [
      { id: 'power-cable', label: 'Power Cable' },
      { id: 'keyboard', label: 'Keyboard' },
      { id: 'mouse', label: 'Mouse' },
      { id: 'original-box', label: 'Original Box' },
    ],
  };
}

function cameraCategory(key: string, label: string, productType: string): SpecCategoryDefinition {
  return {
    key,
    label,
    productType,
    titleSuffix: productType,
    hasLenses: key !== 'digital-camera' && key !== 'action-camera',
    sections: [
      { id: 'identification', label: 'Identification' },
      { id: 'sensor', label: 'Sensor & Optics' },
      { id: 'video', label: 'Video & Features' },
      { id: 'kit', label: 'Kit' },
      { id: 'condition', label: 'Condition' },
    ],
    fields: [
      ...buildFields('identification', 10, [
        { key: 'brand', label: 'Brand', inputType: 'chips', options: ['Canon', 'Nikon', 'Sony', 'Fujifilm', 'Panasonic', 'Olympus', 'GoPro', 'DJI', 'Leica', 'Kodak', 'Other'], publicVisibility: 'public', includeInTitle: true },
        { key: 'model', label: 'Model', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
        { key: 'modelNumber', label: 'Model Number', inputType: 'text', publicVisibility: 'optional_public' },
        { key: 'serialNumber', label: 'Serial Number', inputType: 'text', publicVisibility: 'internal_only', includeInDescription: false },
        { key: 'cameraType', label: 'Camera Type', inputType: 'chips', options: ['Digital Camera', 'DSLR', 'Mirrorless', 'Action Camera', 'Compact', 'Point & Shoot', 'Bridge'], publicVisibility: 'public', includeInTitle: true },
      ]),
      ...buildFields('sensor', 20, [
        { key: 'megapixels', label: 'Megapixels', inputType: 'text', publicVisibility: 'public', includeInTitle: true, titleFormat: '{value}MP', placeholder: 'e.g. 33' },
        { key: 'sensorType', label: 'Sensor Type', inputType: 'text', publicVisibility: 'public' },
        { key: 'sensorSize', label: 'Sensor Size', inputType: 'chips', options: ['Full Frame', 'APS-C', 'Micro Four Thirds', '1-inch', 'Other'], publicVisibility: 'public', includeInTitle: true },
        { key: 'lensMount', label: 'Lens Mount', inputType: 'text', publicVisibility: 'public' },
      ]),
      ...buildFields('video', 30, [
        { key: 'videoResolution', label: 'Video Resolution', inputType: 'chips', options: VIDEO, publicVisibility: 'public' },
        { key: 'frameRate', label: 'Frame Rate', inputType: 'text', publicVisibility: 'optional_public', placeholder: 'e.g. 4K 60fps' },
        { key: 'imageStabilization', label: 'Image Stabilization', inputType: 'yes-no-unknown', publicVisibility: 'public' },
        { key: 'wifi', label: 'Wi-Fi', inputType: 'yes-no-unknown', publicVisibility: 'public' },
        { key: 'bluetooth', label: 'Bluetooth', inputType: 'yes-no-unknown', publicVisibility: 'public' },
        { key: 'touchscreen', label: 'Touchscreen', inputType: 'yes-no-unknown', publicVisibility: 'public' },
        { key: 'viewfinderType', label: 'Viewfinder Type', inputType: 'chips', options: ['EVF', 'Optical', 'None'], publicVisibility: 'optional_public' },
        { key: 'shutterCount', label: 'Shutter Count', inputType: 'number', publicVisibility: 'optional_public' },
      ]),
      ...buildFields('kit', 40, [
        { key: 'lensKit', label: 'Lens Kit', inputType: 'chips', options: ['Body Only', 'Lens Included'], publicVisibility: 'public', includeInTitle: true },
        { key: 'batteryIncluded', label: 'Battery Included', inputType: 'yes-no-unknown', publicVisibility: 'public' },
        { key: 'batteryQuantity', label: 'Battery Quantity', inputType: 'number', publicVisibility: 'optional_public' },
        { key: 'chargerIncluded', label: 'Charger Included', inputType: 'yes-no-unknown', publicVisibility: 'public' },
        { key: 'memoryCardIncluded', label: 'Memory Card Included', inputType: 'yes-no-unknown', publicVisibility: 'public' },
      ]),
      ...buildFields('condition', 50, conditionFields()),
    ],
    tests: [
      { id: 'powersOn', label: 'Powers On' },
      { id: 'shutter', label: 'Shutter' },
      { id: 'autofocus', label: 'Autofocus' },
      { id: 'lcd', label: 'LCD' },
      { id: 'viewfinder', label: 'Viewfinder' },
      { id: 'buttons', label: 'Buttons' },
      { id: 'cardSlot', label: 'Memory Card Slot' },
    ],
    accessories: [
      { id: 'battery', label: 'Battery' },
      { id: 'original-charger', label: 'Charger' },
      { id: 'usb-cable', label: 'USB Cable' },
      { id: 'camera-strap', label: 'Camera Strap' },
      { id: 'lens', label: 'Lens' },
      { id: 'lens-cap', label: 'Lens Cap' },
      { id: 'memory-card', label: 'Memory Card' },
      { id: 'case', label: 'Camera Bag' },
      { id: 'original-box', label: 'Original Box' },
      { id: 'manual', label: 'Manual' },
    ],
  };
}

function tablet(key: string, label: string, defaultBrand?: string): SpecCategoryDefinition {
  return {
    key,
    label,
    productType: key === 'ipad' ? 'Tablet' : 'Tablet',
    defaultBrand,
    sections: [
      { id: 'identification', label: 'Identification' },
      { id: 'connectivity', label: 'Connectivity' },
      { id: 'details', label: 'Details' },
      { id: 'condition', label: 'Condition' },
    ],
    fields: [
      ...buildFields('identification', 10, [
        { key: 'brand', label: 'Brand', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
        { key: 'model', label: 'Model', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
        { key: 'modelNumber', label: 'Model Number', inputType: 'text', publicVisibility: 'optional_public' },
        { key: 'serialNumber', label: 'Serial Number', inputType: 'text', publicVisibility: 'internal_only', includeInDescription: false },
        { key: 'storage.primaryCapacity', label: 'Storage', inputType: 'chips', options: PHONE_STORAGE, publicVisibility: 'public', includeInTitle: true },
        { key: 'ram.total', label: 'RAM', inputType: 'chips', options: RAM, publicVisibility: 'optional_public' },
        { key: 'color', label: 'Color', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
      ]),
      ...buildFields('connectivity', 20, [
        { key: 'connectivityType', label: 'Connectivity', inputType: 'chips', options: ['Wi-Fi Only', 'Wi-Fi + Cellular'], publicVisibility: 'public', includeInTitle: true },
        { key: 'imei1', label: 'IMEI', inputType: 'text', publicVisibility: 'internal_only', includeInDescription: false },
        { key: 'carrier', label: 'Carrier', inputType: 'text', publicVisibility: 'optional_public' },
        { key: 'unlockedStatus', label: 'Unlocked', inputType: 'yes-no-unknown', publicVisibility: 'public' },
      ]),
      ...buildFields('details', 30, [
        { key: 'display.size', label: 'Screen Size', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
        { key: 'applePencilIncluded', label: 'Apple Pencil Included', inputType: 'yes-no-unknown', publicVisibility: 'public' },
        { key: 'keyboardIncluded', label: 'Keyboard Included', inputType: 'yes-no-unknown', publicVisibility: 'public' },
        { key: 'battery.health', label: 'Battery Health', inputType: 'text', publicVisibility: 'optional_public' },
      ]),
      ...buildFields('condition', 40, conditionFields()),
    ],
    tests: DEVICE_TESTS,
    accessories: [
      { id: 'usb-cable', label: 'USB Cable' },
      { id: 'original-charger', label: 'Original Charger' },
      { id: 'stylus', label: 'Stylus / Apple Pencil' },
      { id: 'keyboard', label: 'Keyboard' },
      { id: 'case', label: 'Case' },
      { id: 'original-box', label: 'Original Box' },
    ],
  };
}

function gamingConsole(): SpecCategoryDefinition {
  return {
    key: 'gaming-console',
    label: 'Gaming Console',
    productType: 'Gaming Console',
    titleSuffix: 'Console',
    sections: [
      { id: 'identification', label: 'Identification' },
      { id: 'edition', label: 'Edition & Storage' },
      { id: 'kit', label: 'Included Kit' },
      { id: 'condition', label: 'Condition' },
    ],
    fields: [
      ...buildFields('identification', 10, [
        { key: 'brand', label: 'Brand', inputType: 'chips', options: ['Sony', 'Microsoft', 'Nintendo', 'Other'], publicVisibility: 'public', includeInTitle: true },
        { key: 'consoleFamily', label: 'Console Family', inputType: 'chips', options: ['PlayStation', 'Xbox', 'Nintendo Switch', 'Steam Deck', 'Other'], publicVisibility: 'public', includeInTitle: true },
        { key: 'model', label: 'Model', inputType: 'text', publicVisibility: 'public', includeInTitle: true, placeholder: 'e.g. PS5 Slim' },
        { key: 'modelNumber', label: 'Model Number', inputType: 'text', publicVisibility: 'optional_public' },
        { key: 'serialNumber', label: 'Serial Number', inputType: 'text', publicVisibility: 'internal_only', includeInDescription: false },
      ]),
      ...buildFields('edition', 20, [
        { key: 'storage.primaryCapacity', label: 'Storage', inputType: 'chips', options: STORAGE, publicVisibility: 'public', includeInTitle: true },
        { key: 'color', label: 'Color', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
        { key: 'mediaType', label: 'Media Type', inputType: 'chips', options: ['Disc', 'Digital', 'Disc + Digital'], publicVisibility: 'public', includeInTitle: true },
        { key: 'firmwareVersion', label: 'Firmware Version', inputType: 'text', publicVisibility: 'optional_public' },
      ]),
      ...buildFields('kit', 30, [
        { key: 'controllerIncluded', label: 'Controller Included', inputType: 'yes-no-unknown', publicVisibility: 'public' },
        { key: 'controllerQuantity', label: 'Controller Quantity', inputType: 'number', publicVisibility: 'public' },
        { key: 'powerCableIncluded', label: 'Power Cable Included', inputType: 'yes-no-unknown', publicVisibility: 'public' },
        { key: 'hdmiIncluded', label: 'HDMI Included', inputType: 'yes-no-unknown', publicVisibility: 'public' },
      ]),
      ...buildFields('condition', 40, conditionFields()),
    ],
    tests: [
      { id: 'powersOn', label: 'Powers On' },
      { id: 'hdmi', label: 'HDMI Output' },
      { id: 'wifi', label: 'Wi-Fi' },
      { id: 'bluetooth', label: 'Bluetooth' },
      { id: 'discDrive', label: 'Disc Drive' },
      { id: 'usb', label: 'USB Ports' },
      { id: 'controllerSync', label: 'Controller Sync' },
    ],
    accessories: [
      { id: 'controller', label: 'Controller', quantity: true },
      { id: 'power-cable', label: 'Power Cable' },
      { id: 'hdmi-cable', label: 'HDMI Cable' },
      { id: 'usb-cable', label: 'USB Cable' },
      { id: 'original-box', label: 'Original Box' },
    ],
  };
}

function monitor(): SpecCategoryDefinition {
  return {
    key: 'monitor',
    label: 'Monitor',
    productType: 'Monitor',
    titleSuffix: 'Monitor',
    sections: [
      { id: 'identification', label: 'Identification' },
      { id: 'display', label: 'Display' },
      { id: 'features', label: 'Features & Ports' },
      { id: 'condition', label: 'Condition' },
    ],
    fields: [
      ...buildFields('identification', 10, [
        { key: 'brand', label: 'Brand', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
        { key: 'model', label: 'Model', inputType: 'text', publicVisibility: 'public', includeInTitle: true },
        { key: 'serialNumber', label: 'Serial Number', inputType: 'text', publicVisibility: 'internal_only', includeInDescription: false },
      ]),
      ...buildFields('display', 20, [
        { key: 'display.size', label: 'Screen Size', inputType: 'text', publicVisibility: 'public', includeInTitle: true, placeholder: 'e.g. 27"' },
        { key: 'display.resolution', label: 'Resolution', inputType: 'chips', options: ['1920×1080', '2560×1440', '3840×2160', '3440×1440', 'Other'], publicVisibility: 'public', includeInTitle: true },
        { key: 'display.refreshRate', label: 'Refresh Rate', inputType: 'chips', options: ['60Hz', '75Hz', '120Hz', '144Hz', '165Hz', '180Hz', '240Hz', '360Hz'], publicVisibility: 'public', includeInTitle: true },
        { key: 'display.panelType', label: 'Panel Type', inputType: 'chips', options: PANEL, publicVisibility: 'public' },
        { key: 'display.aspectRatio', label: 'Aspect Ratio', inputType: 'chips', options: ['16:9', '21:9', '32:9', '16:10'], publicVisibility: 'public' },
      ]),
      ...buildFields('features', 30, [
        { key: 'hdr', label: 'HDR', inputType: 'yes-no-unknown', publicVisibility: 'public' },
        { key: 'adaptiveSync', label: 'Adaptive Sync', inputType: 'chips', options: ['None', 'G-Sync', 'FreeSync', 'G-Sync + FreeSync'], publicVisibility: 'public' },
        { key: 'ports', label: 'Ports', inputType: 'textarea', publicVisibility: 'public', placeholder: 'HDMI, DisplayPort, USB-C…' },
        { key: 'standIncluded', label: 'Stand Included', inputType: 'yes-no-unknown', publicVisibility: 'public' },
        { key: 'powerAdapterIncluded', label: 'Power Adapter / Cable Included', inputType: 'yes-no-unknown', publicVisibility: 'public' },
      ]),
      ...buildFields('condition', 40, conditionFields()),
    ],
    tests: [
      { id: 'powersOn', label: 'Powers On' },
      { id: 'display', label: 'Display' },
      { id: 'ports', label: 'Ports' },
      { id: 'osd', label: 'On-Screen Menu' },
    ],
    accessories: [
      { id: 'power-cable', label: 'Power Cable' },
      { id: 'hdmi-cable', label: 'HDMI Cable' },
      { id: 'original-box', label: 'Original Box' },
      { id: 'stand', label: 'Stand' },
    ],
  };
}

export const PRODUCT_SPEC_CATEGORIES: SpecCategoryDefinition[] = [
  windowsLaptop(),
  macbook(),
  appleIphone(),
  androidPhone(),
  desktopPc('windows-desktop', 'Windows Desktop', 'Windows Desktop', 'Desktop'),
  desktopPc('custom-gaming-pc', 'Custom / Gaming PC', 'Gaming PC', 'Gaming PC'),
  cameraCategory('digital-camera', 'Digital Camera', 'Digital Camera'),
  cameraCategory('dslr-camera', 'DSLR Camera', 'DSLR Camera'),
  cameraCategory('mirrorless-camera', 'Mirrorless Camera', 'Mirrorless Camera'),
  cameraCategory('action-camera', 'Action Camera', 'Action Camera'),
  tablet('ipad', 'iPad', 'Apple'),
  tablet('android-tablet', 'Android Tablet'),
  gamingConsole(),
  monitor(),
];

const CATEGORY_ALIASES: Record<string, string> = {
  'windows laptop': 'windows-laptop',
  laptops: 'windows-laptop',
  laptop: 'windows-laptop',
  macbook: 'macbook',
  'apple iphone': 'apple-iphone',
  iphone: 'apple-iphone',
  smartphones: 'apple-iphone',
  smartphone: 'apple-iphone',
  'android phone': 'android-phone',
  'windows desktop': 'windows-desktop',
  desktops: 'windows-desktop',
  desktop: 'windows-desktop',
  'custom/gaming pc': 'custom-gaming-pc',
  'custom / gaming pc': 'custom-gaming-pc',
  'custom gaming pc': 'custom-gaming-pc',
  'gaming pc': 'custom-gaming-pc',
  'digital camera': 'digital-camera',
  cameras: 'digital-camera',
  'dslr camera': 'dslr-camera',
  dslr: 'dslr-camera',
  'mirrorless camera': 'mirrorless-camera',
  mirrorless: 'mirrorless-camera',
  'action camera': 'action-camera',
  ipad: 'ipad',
  tablets: 'ipad',
  tablet: 'ipad',
  'android tablet': 'android-tablet',
  'gaming console': 'gaming-console',
  gaming: 'gaming-console',
  'playstation console': 'gaming-console',
  'xbox console': 'gaming-console',
  'nintendo console': 'gaming-console',
  'gaming handheld': 'gaming-console',
  monitor: 'monitor',
};

export function resolveSpecCategoryKey(categoryLabel: string, brand = ''): string {
  const q = (categoryLabel || '').trim().toLowerCase();
  if (!q) return 'windows-laptop';
  const direct = PRODUCT_SPEC_CATEGORIES.find((c) => c.key === q || c.label.toLowerCase() === q);
  if (direct) return direct.key;
  const aliased = CATEGORY_ALIASES[q];
  if (aliased) {
    if (aliased === 'apple-iphone' && brand && !/apple/i.test(brand) && !/iphone/i.test(brand)) {
      return 'android-phone';
    }
    if (aliased === 'windows-laptop' && /apple|macbook/i.test(brand)) {
      return 'macbook';
    }
    if (aliased === 'ipad' && brand && !/apple/i.test(brand)) {
      return 'android-tablet';
    }
    return aliased;
  }
  return PRODUCT_SPEC_CATEGORIES[0].key;
}

export function getSpecCategory(idOrLabel: string, brand = ''): SpecCategoryDefinition {
  const key = resolveSpecCategoryKey(idOrLabel, brand);
  return PRODUCT_SPEC_CATEGORIES.find((c) => c.key === key) || PRODUCT_SPEC_CATEGORIES[0];
}

export function getSpecField(category: SpecCategoryDefinition, key: string): SpecFieldDefinition | undefined {
  return category.fields.find((f) => f.key === key);
}

export function isInternalOnlyField(field: SpecFieldDefinition): boolean {
  return field.publicVisibility === 'internal_only';
}

export function isPublicField(field: SpecFieldDefinition): boolean {
  return field.publicVisibility === 'public' || field.publicVisibility === 'optional_public';
}

export function fieldIsVisible(field: SpecFieldDefinition, values: Record<string, unknown>): boolean {
  if (!field.showIf) return true;
  const parts = field.showIf.key.split('.');
  let cur: unknown = values;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object') { cur = ''; break; }
    cur = (cur as Record<string, unknown>)[part];
  }
  const val = String(cur ?? '');
  const expected = field.showIf.equals;
  return Array.isArray(expected) ? expected.includes(val) : val === expected;
}
