export type DeviceFieldType = 'text' | 'select' | 'chips' | 'yes-no-unknown';

export interface DeviceFieldDefinition {
  key: string;
  label: string;
  type: DeviceFieldType;
  options?: string[];
  placeholder?: string;
  recommended?: boolean;
  showIf?: { key: string; equals: string | string[] };
}

export interface DeviceFieldSection {
  id: string;
  label: string;
  fields: DeviceFieldDefinition[];
}

export interface DeviceAccessoryDefinition {
  id: string;
  label: string;
  quantity?: boolean;
}

export interface DeviceTestDefinition {
  id: string;
  label: string;
}

export interface DeviceConditionDetailDefinition {
  id: string;
  label: string;
  options: string[];
}

export interface DeviceCategoryDefinition {
  id: string;
  label: string;
  group: string;
  phase1: boolean;
  defaultBrand?: string;
  serialLabel: string;
  storageList?: boolean;
  lensList?: boolean;
  sections: DeviceFieldSection[];
  accessories: DeviceAccessoryDefinition[];
  tests: DeviceTestDefinition[];
  conditionDetails: DeviceConditionDetailDefinition[];
}

const RAM = ['4GB', '8GB', '12GB', '16GB', '24GB', '32GB', '48GB', '64GB', '128GB', 'Other', 'Unknown'];
const STORAGE = ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB', '4TB', 'Other', 'Unknown'];
const PHONE_STORAGE = ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB', 'Other', 'Unknown'];
const RAM_TYPE = ['DDR3', 'DDR4', 'DDR5', 'LPDDR4', 'LPDDR5', 'Unknown'];
const STORAGE_TYPE = ['HDD', 'SATA SSD', 'NVMe SSD', 'eMMC', 'Other', 'Unknown'];
const CONDITION_GRADES = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor', 'Not Tested', 'Unknown'];
const VIDEO = ['720p', '1080p', '4K', '8K', 'Other', 'Unknown'];
const YNU = ['Yes', 'No', 'Unknown'];

const f = (
  key: string,
  label: string,
  type: DeviceFieldType,
  extra: Partial<DeviceFieldDefinition> = {},
): DeviceFieldDefinition => ({ key, label, type, ...extra });

const chips = (key: string, label: string, options: string[], extra: Partial<DeviceFieldDefinition> = {}) =>
  f(key, label, 'chips', { options, ...extra });
const select = (key: string, label: string, options: string[], extra: Partial<DeviceFieldDefinition> = {}) =>
  f(key, label, 'select', { options, ...extra });
const text = (key: string, label: string, extra: Partial<DeviceFieldDefinition> = {}) =>
  f(key, label, 'text', extra);

function basicIdentification(extra: DeviceFieldDefinition[] = []): DeviceFieldSection {
  return {
    id: 'identification',
    label: 'Identification',
    fields: [
      text('modelNumber', 'Model Number', { recommended: true, placeholder: 'e.g. GA402XV / A2337' }),
      text('color', 'Color'),
      text('upcSku', 'UPC / SKU'),
      ...extra,
    ],
  };
}

const GENERIC_TESTS: DeviceTestDefinition[] = [
  { id: 'powersOn', label: 'Powers On' },
  { id: 'display', label: 'Display' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'charging', label: 'Charging' },
];

const GENERIC_ACCESSORIES: DeviceAccessoryDefinition[] = [
  { id: 'charger', label: 'Charger' },
  { id: 'cable', label: 'Cable' },
  { id: 'originalBox', label: 'Original Box' },
  { id: 'manuals', label: 'Manuals' },
];

function genericCategory(id: string, label: string, group: string, extra: Partial<DeviceCategoryDefinition> = {}): DeviceCategoryDefinition {
  return {
    id,
    label,
    group,
    phase1: false,
    serialLabel: 'Serial Number',
    sections: [basicIdentification()],
    accessories: GENERIC_ACCESSORIES,
    tests: GENERIC_TESTS,
    conditionDetails: [
      { id: 'overall', label: 'Overall', options: CONDITION_GRADES },
    ],
    ...extra,
  };
}

const windowsLaptop: DeviceCategoryDefinition = {
  id: 'windows-laptop',
  label: 'Windows Laptop',
  group: 'Computers',
  phase1: true,
  serialLabel: 'Serial Number',
  storageList: true,
  sections: [
    basicIdentification(),
    {
      id: 'processor',
      label: 'Processor',
      fields: [
        chips('cpu.brand', 'CPU Brand', ['Intel', 'AMD', 'Qualcomm', 'Other'], { recommended: true }),
        text('cpu.model', 'CPU Model', { recommended: true, placeholder: 'e.g. Intel Core i7-1360P' }),
        text('cpu.generation', 'CPU Generation'),
      ],
    },
    {
      id: 'memory',
      label: 'Memory',
      fields: [
        chips('ram.capacity', 'RAM', RAM, { recommended: true }),
        chips('ram.type', 'RAM Type', RAM_TYPE),
      ],
    },
    {
      id: 'graphics',
      label: 'Graphics',
      fields: [
        chips('gpu.type', 'Graphics Type', ['Integrated', 'Dedicated', 'Both', 'Unknown']),
        chips('gpu.brand', 'GPU Brand', ['NVIDIA', 'AMD', 'Intel', 'Other', 'Unknown']),
        text('gpu.model', 'GPU Model', { placeholder: 'e.g. RTX 4060' }),
        chips('gpu.vram', 'GPU VRAM', ['4GB', '6GB', '8GB', '10GB', '12GB', '16GB', '24GB', 'Other', 'Unknown']),
      ],
    },
    {
      id: 'display',
      label: 'Display',
      fields: [
        chips('display.size', 'Screen Size', ['13"', '14"', '15.6"', '16"', '17.3"', 'Other', 'Unknown']),
        text('display.resolution', 'Resolution', { placeholder: 'e.g. 1920×1080' }),
        chips('display.touchscreen', 'Touchscreen', YNU),
        chips('display.refreshRate', 'Refresh Rate', ['60Hz', '90Hz', '120Hz', '144Hz', '165Hz', '240Hz', 'Other', 'Unknown']),
      ],
    },
    {
      id: 'os',
      label: 'Operating System',
      fields: [chips('os', 'OS', ['Windows 10', 'Windows 11', 'No OS', 'Other', 'Unknown'])],
    },
    {
      id: 'battery',
      label: 'Battery',
      fields: [text('battery.health', 'Battery Health / Condition', { placeholder: 'e.g. 87% or Good' })],
    },
  ],
  accessories: [
    { id: 'charger', label: 'Charger' },
    { id: 'originalCharger', label: 'Original Charger' },
    { id: 'thirdPartyCharger', label: 'Third-Party Charger' },
    { id: 'laptopBag', label: 'Laptop Bag' },
    { id: 'originalBox', label: 'Original Box' },
    { id: 'manuals', label: 'Manuals' },
    { id: 'dock', label: 'Dock' },
    { id: 'mouse', label: 'Mouse' },
  ],
  tests: [
    { id: 'powersOn', label: 'Powers On' },
    { id: 'displayGood', label: 'Display Good' },
    { id: 'keyboardGood', label: 'Keyboard Good' },
    { id: 'trackpadGood', label: 'Trackpad Good' },
    { id: 'wifi', label: 'Wi-Fi Works' },
    { id: 'bluetooth', label: 'Bluetooth Works' },
    { id: 'webcam', label: 'Webcam Works' },
    { id: 'speakers', label: 'Speakers Work' },
    { id: 'usb', label: 'USB Ports Work' },
    { id: 'chargingPort', label: 'Charging Port Works' },
    { id: 'batteryHoldsCharge', label: 'Battery Holds Charge' },
  ],
  conditionDetails: [
    { id: 'screen', label: 'Screen', options: CONDITION_GRADES },
    { id: 'body', label: 'Body', options: CONDITION_GRADES },
    { id: 'keyboard', label: 'Keyboard', options: CONDITION_GRADES },
    { id: 'battery', label: 'Battery', options: CONDITION_GRADES },
  ],
};

const macbook: DeviceCategoryDefinition = {
  id: 'macbook',
  label: 'MacBook',
  group: 'Computers',
  phase1: true,
  defaultBrand: 'Apple',
  serialLabel: 'Serial Number',
  sections: [
    {
      id: 'identification',
      label: 'Identification',
      fields: [
        chips('macModel', 'Model', ['MacBook Air', 'MacBook Pro', 'MacBook', 'Other'], { recommended: true }),
        chips('display.size', 'Screen Size', ['13"', '14"', '15"', '16"', 'Other', 'Unknown']),
        text('modelNumber', 'Model Number', { recommended: true, placeholder: 'e.g. A2337' }),
        text('releaseYear', 'Release Year'),
        text('color', 'Color'),
        text('upcSku', 'UPC / SKU'),
      ],
    },
    {
      id: 'processor',
      label: 'Processor',
      fields: [
        chips('cpu.brand', 'Processor Type', ['Intel', 'Apple Silicon', 'Unknown'], { recommended: true }),
        chips('chip', 'Chip', ['M1', 'M1 Pro', 'M1 Max', 'M2', 'M2 Pro', 'M2 Max', 'M3', 'M3 Pro', 'M3 Max', 'M4', 'M4 Pro', 'M4 Max', 'Other', 'Unknown'], { recommended: true }),
      ],
    },
    {
      id: 'memory-storage',
      label: 'Memory & Storage',
      fields: [
        chips('ram.capacity', 'RAM / Unified Memory', RAM, { recommended: true }),
        chips('storage.capacity', 'Storage Capacity', STORAGE, { recommended: true }),
      ],
    },
    {
      id: 'battery-os',
      label: 'Battery & Software',
      fields: [
        text('battery.cycleCount', 'Battery Cycle Count'),
        text('battery.maxCapacity', 'Battery Maximum Capacity %', { placeholder: 'e.g. 88' }),
        text('os', 'macOS Version'),
        chips('touchBar', 'Touch Bar', YNU),
      ],
    },
  ],
  accessories: [
    { id: 'appleCharger', label: 'Apple Charger' },
    { id: 'thirdPartyCharger', label: 'Third-Party Charger' },
    { id: 'usbcCable', label: 'USB-C Cable' },
    { id: 'magsafeCable', label: 'MagSafe Cable' },
    { id: 'originalBox', label: 'Original Box' },
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
    { id: 'thunderbolt', label: 'USB-C / Thunderbolt Ports' },
  ],
  conditionDetails: [
    { id: 'screen', label: 'Screen', options: CONDITION_GRADES },
    { id: 'body', label: 'Body', options: CONDITION_GRADES },
    { id: 'keyboard', label: 'Keyboard', options: CONDITION_GRADES },
    { id: 'battery', label: 'Battery', options: CONDITION_GRADES },
  ],
};

const appleIphone: DeviceCategoryDefinition = {
  id: 'apple-iphone',
  label: 'Apple iPhone',
  group: 'Phones',
  phase1: true,
  defaultBrand: 'Apple',
  serialLabel: 'IMEI',
  sections: [
    {
      id: 'identification',
      label: 'Identification',
      fields: [
        text('imei2', 'IMEI 2'),
        text('serialNumber', 'Serial Number'),
        chips('storage.capacity', 'Storage', PHONE_STORAGE, { recommended: true }),
        text('color', 'Color'),
        text('modelNumber', 'Model Number'),
        text('upcSku', 'UPC / SKU'),
        chips('carrierStatus', 'Carrier Status', ['Unlocked', 'Locked', 'Unknown'], { recommended: true }),
        text('carrier', 'Carrier', { showIf: { key: 'carrierStatus', equals: 'Locked' } }),
        text('battery.health', 'Battery Health %', { recommended: true, placeholder: 'e.g. 88' }),
        text('os', 'iOS Version'),
        chips('simType', 'SIM Type', ['Physical SIM', 'eSIM', 'Dual SIM', 'Unknown']),
        chips('findMyIphone', 'Find My iPhone', ['OFF', 'ON', 'Unknown'], { recommended: true }),
      ],
    },
  ],
  accessories: [
    { id: 'chargingCable', label: 'Charging Cable' },
    { id: 'powerAdapter', label: 'Power Adapter' },
    { id: 'originalBox', label: 'Original Box' },
    { id: 'case', label: 'Case' },
  ],
  tests: [
    { id: 'powersOn', label: 'Powers On' },
    { id: 'touchscreen', label: 'Touchscreen' },
    { id: 'display', label: 'Display' },
    { id: 'frontCamera', label: 'Front Camera' },
    { id: 'rearCamera', label: 'Rear Camera' },
    { id: 'biometrics', label: 'Face ID / Touch ID' },
    { id: 'speakers', label: 'Speakers' },
    { id: 'microphone', label: 'Microphone' },
    { id: 'wifi', label: 'Wi-Fi' },
    { id: 'bluetooth', label: 'Bluetooth' },
    { id: 'charging', label: 'Charging' },
    { id: 'buttons', label: 'Buttons' },
    { id: 'vibration', label: 'Vibration' },
  ],
  conditionDetails: [
    { id: 'screen', label: 'Screen Condition', options: CONDITION_GRADES },
    { id: 'backGlass', label: 'Back Glass Condition', options: CONDITION_GRADES },
    { id: 'frame', label: 'Frame Condition', options: CONDITION_GRADES },
    { id: 'cameraLens', label: 'Camera Lens Condition', options: CONDITION_GRADES },
  ],
};

const androidPhone: DeviceCategoryDefinition = {
  id: 'android-phone',
  label: 'Android Phone',
  group: 'Phones',
  phase1: true,
  serialLabel: 'IMEI',
  sections: [
    {
      id: 'identification',
      label: 'Identification',
      fields: [
        chips('brandPreset', 'Brand Shortcut', ['Samsung', 'Google', 'Motorola', 'OnePlus', 'LG', 'ASUS', 'Sony', 'Xiaomi', 'Other']),
        text('imei2', 'IMEI 2'),
        text('serialNumber', 'Serial Number'),
        text('modelNumber', 'Model Number', { recommended: true }),
        chips('storage.capacity', 'Storage', PHONE_STORAGE, { recommended: true }),
        chips('ram.capacity', 'RAM', RAM),
        text('color', 'Color'),
        text('carrier', 'Carrier'),
        chips('unlocked', 'Unlocked', YNU),
        text('os', 'Android Version'),
        text('display.size', 'Screen Size'),
        chips('simType', 'SIM Configuration', ['Physical SIM', 'eSIM', 'Dual SIM', 'Unknown']),
        text('upcSku', 'UPC / SKU'),
      ],
    },
  ],
  accessories: [
    { id: 'cable', label: 'Cable' },
    { id: 'charger', label: 'Charger' },
    { id: 'originalBox', label: 'Original Box' },
    { id: 'case', label: 'Case' },
    { id: 'stylus', label: 'Stylus' },
  ],
  tests: [
    { id: 'display', label: 'Display' },
    { id: 'touch', label: 'Touch' },
    { id: 'fingerprint', label: 'Fingerprint' },
    { id: 'faceUnlock', label: 'Face Unlock' },
    { id: 'frontCamera', label: 'Front Camera' },
    { id: 'rearCamera', label: 'Rear Camera' },
    { id: 'speakers', label: 'Speakers' },
    { id: 'microphone', label: 'Microphone' },
    { id: 'wifi', label: 'Wi-Fi' },
    { id: 'bluetooth', label: 'Bluetooth' },
    { id: 'charging', label: 'Charging' },
    { id: 'buttons', label: 'Buttons' },
    { id: 'vibration', label: 'Vibration' },
  ],
  conditionDetails: [
    { id: 'screen', label: 'Screen', options: CONDITION_GRADES },
    { id: 'body', label: 'Body', options: CONDITION_GRADES },
  ],
};

const digitalCamera: DeviceCategoryDefinition = {
  id: 'digital-camera',
  label: 'Digital Camera',
  group: 'Cameras',
  phase1: true,
  serialLabel: 'Serial Number',
  sections: [
    {
      id: 'identification',
      label: 'Identification',
      fields: [
        chips('brandPreset', 'Brand Shortcut', ['Canon', 'Nikon', 'Sony', 'Fujifilm', 'Panasonic', 'Olympus', 'Kodak', 'Leica', 'Other']),
        text('modelNumber', 'Model Number'),
        chips('cameraType', 'Camera Type', ['Compact', 'Point & Shoot', 'Bridge', 'Instant', 'Other', 'Unknown']),
        text('megapixels', 'Megapixels', { recommended: true, placeholder: 'e.g. 20.3' }),
        text('opticalZoom', 'Optical Zoom', { recommended: true, placeholder: 'e.g. 40x' }),
        text('digitalZoom', 'Digital Zoom'),
        text('sensorType', 'Sensor Type'),
        text('display.size', 'Screen Size'),
        chips('videoResolution', 'Video Resolution', VIDEO),
        text('connectivity', 'Connectivity', { placeholder: 'Wi-Fi, Bluetooth, USB, HDMI, NFC' }),
        text('batteryType', 'Battery Type'),
        text('memoryCardType', 'Memory Card Type'),
        text('color', 'Color'),
        text('upcSku', 'UPC / SKU'),
      ],
    },
  ],
  accessories: [
    { id: 'battery', label: 'Battery' },
    { id: 'charger', label: 'Charger' },
    { id: 'usbCable', label: 'USB Cable' },
    { id: 'memoryCard', label: 'Memory Card' },
    { id: 'cameraBag', label: 'Camera Bag' },
    { id: 'lensCap', label: 'Lens Cap' },
    { id: 'originalBox', label: 'Original Box' },
    { id: 'manual', label: 'Manual' },
  ],
  tests: [
    { id: 'powersOn', label: 'Powers On' },
    { id: 'lensExtends', label: 'Lens Extends' },
    { id: 'autofocus', label: 'Autofocus Works' },
    { id: 'flash', label: 'Flash Works' },
    { id: 'zoom', label: 'Zoom Works' },
    { id: 'lcd', label: 'LCD Works' },
    { id: 'buttons', label: 'Buttons Work' },
    { id: 'cardSlot', label: 'Memory Card Slot Works' },
    { id: 'batteryCharges', label: 'Battery Charges' },
  ],
  conditionDetails: [
    { id: 'body', label: 'Body', options: CONDITION_GRADES },
    { id: 'lens', label: 'Lens', options: CONDITION_GRADES },
    { id: 'lcd', label: 'LCD', options: CONDITION_GRADES },
  ],
};

function interchangeableCamera(id: string, label: string): DeviceCategoryDefinition {
  return {
    id,
    label,
    group: 'Cameras',
    phase1: true,
    serialLabel: 'Serial Number',
    lensList: true,
    sections: [
      {
        id: 'identification',
        label: 'Identification',
        fields: [
          chips('brandPreset', 'Brand Shortcut', ['Canon', 'Nikon', 'Sony', 'Fujifilm', 'Panasonic', 'Olympus', 'Leica', 'Other']),
          text('modelNumber', 'Model Number'),
          chips('sensorSize', 'Sensor Size', ['Full Frame', 'APS-C', 'Micro Four Thirds', 'Other', 'Unknown']),
          text('megapixels', 'Megapixels', { recommended: true }),
          text('shutterCount', 'Shutter Count'),
          text('lensMount', 'Lens Mount'),
          chips('videoResolution', 'Video Resolution', VIDEO),
          chips('imageStabilization', 'Image Stabilization', YNU),
          chips('wifi', 'Wi-Fi', YNU),
          chips('bluetooth', 'Bluetooth', YNU),
          chips('bodyOnly', 'Body Only', YNU),
          text('color', 'Color'),
          text('upcSku', 'UPC / SKU'),
        ],
      },
    ],
    accessories: [
      { id: 'battery', label: 'Battery' },
      { id: 'batteryCharger', label: 'Battery Charger' },
      { id: 'usbCable', label: 'USB Cable' },
      { id: 'strap', label: 'Strap' },
      { id: 'bodyCap', label: 'Body Cap' },
      { id: 'lens', label: 'Lens' },
      { id: 'lensCap', label: 'Lens Cap' },
      { id: 'memoryCard', label: 'Memory Card' },
      { id: 'cameraBag', label: 'Camera Bag' },
      { id: 'originalBox', label: 'Original Box' },
    ],
    tests: [
      { id: 'powersOn', label: 'Powers On' },
      { id: 'shutter', label: 'Shutter Works' },
      { id: 'autofocus', label: 'Autofocus Works' },
      { id: 'lcd', label: 'LCD Works' },
      { id: 'viewfinder', label: 'Viewfinder Works' },
      { id: 'buttons', label: 'Buttons Work' },
      { id: 'cardSlot', label: 'Memory Card Slot Works' },
    ],
    conditionDetails: [
      { id: 'body', label: 'Body', options: CONDITION_GRADES },
      { id: 'sensor', label: 'Sensor', options: CONDITION_GRADES },
      { id: 'lcd', label: 'LCD', options: CONDITION_GRADES },
    ],
  };
}

const customGamingPc: DeviceCategoryDefinition = {
  id: 'custom-gaming-pc',
  label: 'Custom/Gaming PC',
  group: 'Computers',
  phase1: true,
  serialLabel: 'Serial Number',
  storageList: true,
  sections: [
    {
      id: 'identification',
      label: 'Identification',
      fields: [
        chips('systemBrand', 'System Brand', ['Custom', 'Dell', 'HP', 'Lenovo', 'ASUS', 'Acer', 'MSI', 'Other']),
        text('modelNumber', 'Model Number'),
        text('formFactor', 'Case / Form Factor', { placeholder: 'e.g. ATX Mid Tower' }),
        text('color', 'Color'),
        text('upcSku', 'UPC / SKU'),
      ],
    },
    {
      id: 'cpu',
      label: 'CPU',
      fields: [
        chips('cpu.brand', 'CPU Brand', ['Intel', 'AMD', 'Other'], { recommended: true }),
        text('cpu.model', 'CPU Model', { recommended: true, placeholder: 'e.g. Ryzen 7 5800X' }),
      ],
    },
    {
      id: 'motherboard',
      label: 'Motherboard',
      fields: [
        text('motherboard.brand', 'Motherboard Brand'),
        text('motherboard.model', 'Motherboard Model'),
      ],
    },
    {
      id: 'memory',
      label: 'RAM',
      fields: [
        chips('ram.capacity', 'RAM Capacity', RAM, { recommended: true }),
        chips('ram.type', 'RAM Type', RAM_TYPE),
        text('ram.speed', 'RAM Speed', { placeholder: 'e.g. 3200MHz' }),
      ],
    },
    {
      id: 'gpu',
      label: 'GPU',
      fields: [
        chips('gpu.brand', 'GPU Brand', ['NVIDIA', 'AMD', 'Intel', 'Other', 'Unknown'], { recommended: true }),
        text('gpu.model', 'GPU Model', { recommended: true, placeholder: 'e.g. RTX 3070' }),
        chips('gpu.vram', 'GPU VRAM', ['4GB', '6GB', '8GB', '10GB', '12GB', '16GB', '24GB', 'Other', 'Unknown']),
      ],
    },
    {
      id: 'psu-cooling',
      label: 'Power & Cooling',
      fields: [
        text('psu.brand', 'PSU Brand'),
        text('psu.wattage', 'PSU Wattage', { placeholder: 'e.g. 750W' }),
        chips('cooling', 'Cooling', ['Air Cooling', 'AIO Liquid Cooling', 'Custom Liquid Cooling', 'Unknown']),
      ],
    },
    {
      id: 'connectivity-os',
      label: 'Connectivity & OS',
      fields: [
        chips('wifi', 'Wi-Fi', YNU),
        chips('bluetooth', 'Bluetooth', YNU),
        chips('ethernet', 'Ethernet', YNU),
        chips('os', 'Operating System', ['Windows 10', 'Windows 11', 'No OS', 'Other', 'Unknown']),
      ],
    },
  ],
  accessories: [
    { id: 'powerCable', label: 'Power Cable' },
    { id: 'keyboard', label: 'Keyboard' },
    { id: 'mouse', label: 'Mouse' },
    { id: 'wifiAntenna', label: 'Wi-Fi Antenna' },
    { id: 'originalBox', label: 'Original Box' },
  ],
  tests: [
    { id: 'powersOn', label: 'Powers On' },
    { id: 'displayOutput', label: 'Display Output' },
    { id: 'usb', label: 'USB Ports' },
    { id: 'audio', label: 'Audio' },
    { id: 'network', label: 'Network' },
  ],
  conditionDetails: [
    { id: 'case', label: 'Case', options: CONDITION_GRADES },
    { id: 'overall', label: 'Overall', options: CONDITION_GRADES },
  ],
};

export const DEVICE_CATEGORIES: DeviceCategoryDefinition[] = [
  appleIphone,
  androidPhone,
  windowsLaptop,
  macbook,
  genericCategory('windows-desktop', 'Windows Desktop', 'Computers', { serialLabel: 'Serial Number' }),
  customGamingPc,
  genericCategory('imac-mac-desktop', 'iMac / Mac Desktop', 'Computers', { defaultBrand: 'Apple' }),
  genericCategory('ipad', 'iPad', 'Tablets', { defaultBrand: 'Apple' }),
  genericCategory('android-tablet', 'Android Tablet', 'Tablets'),
  digitalCamera,
  interchangeableCamera('dslr-camera', 'DSLR Camera'),
  interchangeableCamera('mirrorless-camera', 'Mirrorless Camera'),
  genericCategory('action-camera', 'Action Camera', 'Cameras'),
  genericCategory('playstation-console', 'PlayStation Console', 'Gaming', {
    defaultBrand: 'Sony',
    sections: [{
      id: 'identification',
      label: 'Identification',
      fields: [
        text('consoleModel', 'Console Model', { placeholder: 'e.g. PS5 Slim Disc' }),
        text('edition', 'Edition'),
        text('modelNumber', 'Model Number'),
        chips('storage.capacity', 'Storage Capacity', STORAGE),
        text('color', 'Color'),
        chips('discDrive', 'Disc Drive', YNU),
        text('controllerCount', 'Controller Count'),
      ],
    }],
    accessories: [
      { id: 'controller', label: 'Controller', quantity: true },
      { id: 'powerCable', label: 'Power Cable' },
      { id: 'hdmiCable', label: 'HDMI Cable' },
      { id: 'chargingCable', label: 'Charging Cable' },
      { id: 'stand', label: 'Stand' },
      { id: 'originalBox', label: 'Original Box' },
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
  }),
  genericCategory('xbox-console', 'Xbox Console', 'Gaming', { defaultBrand: 'Microsoft' }),
  genericCategory('nintendo-console', 'Nintendo Console', 'Gaming', { defaultBrand: 'Nintendo' }),
  genericCategory('gaming-handheld', 'Gaming Handheld', 'Gaming'),
  genericCategory('apple-watch', 'Apple Watch', 'Wearables', { defaultBrand: 'Apple' }),
  genericCategory('smartwatch', 'Smartwatch', 'Wearables'),
  genericCategory('headphones', 'Headphones', 'Audio'),
  genericCategory('earbuds', 'Earbuds', 'Audio'),
  genericCategory('speakers', 'Speakers', 'Audio'),
  genericCategory('monitor', 'Monitor', 'Other'),
  genericCategory('gpu-graphics-card', 'GPU / Graphics Card', 'Other'),
  genericCategory('computer-component', 'Computer Component', 'Other'),
  genericCategory('other-electronics', 'Other Electronics', 'Other'),
];

export const DEVICE_CATEGORY_GROUPS = [...new Set(DEVICE_CATEGORIES.map((c) => c.group))];

export function getDeviceCategory(idOrLabel: string): DeviceCategoryDefinition | undefined {
  const q = (idOrLabel || '').trim().toLowerCase();
  if (!q) return undefined;
  return DEVICE_CATEGORIES.find((c) => c.id === q || c.label.toLowerCase() === q);
}

export function fieldIsVisible(field: DeviceFieldDefinition, specs: Record<string, unknown>): boolean {
  if (!field.showIf) return true;
  const parts = field.showIf.key.split('.');
  let cur: unknown = specs;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object') { cur = ''; break; }
    cur = (cur as Record<string, unknown>)[part];
  }
  const val = String(cur ?? '');
  const expected = field.showIf.equals;
  return Array.isArray(expected) ? expected.includes(val) : val === expected;
}
