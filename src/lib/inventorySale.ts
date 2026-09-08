import type { InventoryStatus } from '@/types';

export interface SaleQuantityValidation {
  valid: boolean;
  message?: string;
}

export interface InventorySaleDeduction {
  quantityOnHand: number;
  status: InventoryStatus;
  soldAt: string | null;
  fullySold: boolean;
}

/** Validate sold quantity against available inventory. */
export function validateSaleQuantity(
  soldQuantity: number,
  availableQuantity: number,
): SaleQuantityValidation {
  if (soldQuantity < 1) {
    return { valid: false, message: 'Sale quantity must be at least 1.' };
  }
  if (availableQuantity <= 0) {
    return { valid: false, message: 'This product is out of stock.' };
  }
  if (soldQuantity > availableQuantity) {
    const unitWord = availableQuantity === 1 ? 'unit is' : 'units are';
    return {
      valid: false,
      message: `Only ${availableQuantity} ${unitWord} currently available.`,
    };
  }
  return { valid: true };
}

/**
 * Compute inventory updates after a sale.
 * remainingQuantity = currentInventoryQuantity - soldQuantity
 */
export function applyInventorySaleDeduction(
  currentQuantity: number,
  soldQuantity: number,
  currentStatus: InventoryStatus,
  soldAt: string,
): InventorySaleDeduction {
  const remainingQuantity = currentQuantity - soldQuantity;

  if (remainingQuantity > 0) {
    return {
      quantityOnHand: remainingQuantity,
      status: currentStatus === 'sold' ? 'listed' : currentStatus,
      soldAt: null,
      fullySold: false,
    };
  }

  return {
    quantityOnHand: 0,
    status: 'sold',
    soldAt,
    fullySold: true,
  };
}

/** Restore inventory when a sale line is returned. */
export function applyInventoryReturn(
  currentQuantity: number,
  returnQuantity: number,
  currentStatus: InventoryStatus,
  options?: {
    listingMethod?: 'shopify' | 'processed_manual' | null;
    sellable?: boolean;
  },
): Pick<InventorySaleDeduction, 'quantityOnHand' | 'status' | 'soldAt'> {
  const sellable = options?.sellable !== false;
  if (!sellable) {
    return {
      quantityOnHand: currentQuantity,
      status: 'defective',
      soldAt: null,
    };
  }

  const newQuantity = currentQuantity + returnQuantity;
  if (options?.listingMethod === 'shopify' || options?.listingMethod === 'processed_manual') {
    return {
      quantityOnHand: newQuantity,
      status: 'listed',
      soldAt: null,
    };
  }

  if (currentStatus === 'listed' || currentStatus === 'available') {
    return {
      quantityOnHand: newQuantity,
      status: currentStatus,
      soldAt: null,
    };
  }

  return {
    quantityOnHand: newQuantity,
    status: 'available',
    soldAt: null,
  };
}
