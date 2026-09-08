import { shopifyCatalogService } from '@/services/shopify';
import { SHOPIFY_SYNC_REQUIRED } from '@/lib/shopify/saleSync';

export async function requestShopifyInventorySync(input: {
  inventoryItemId: string;
  reason: string;
  storeId?: string;
  employeeId?: string;
  employeeName?: string;
  posSaleId?: string;
  posReturnId?: string;
}): Promise<{ success: boolean; pending?: boolean; message: string }> {
  const result = await shopifyCatalogService.syncInventory({
    inventoryItemId: input.inventoryItemId,
    reason: input.reason,
    storeId: input.storeId,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    posSaleId: input.posSaleId,
    posReturnId: input.posReturnId,
  });
  if (result.success || result.status === 'skipped') {
    return { success: true, message: result.message };
  }
  return {
    success: false,
    pending: true,
    message: result.message || SHOPIFY_SYNC_REQUIRED,
  };
}
