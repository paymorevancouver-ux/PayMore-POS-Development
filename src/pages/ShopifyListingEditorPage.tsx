import { useParams } from 'react-router-dom';
import ShopifyAutoListerWorkspace from '@/components/features/shopify/ShopifyAutoListerWorkspace';

export default function ShopifyListingEditorPage() {
  const { listingId } = useParams();
  return <ShopifyAutoListerWorkspace initialListingId={listingId} />;
}
