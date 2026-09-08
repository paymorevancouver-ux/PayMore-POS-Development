import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { listingPhotoSources, parseDataUrl } from '../_shared/shopify-payload.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '',
);

const SESSION_MINUTES = 30;
const MAX_PHOTOS = 12;
const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function generateToken() {
  const segments: string[] = [];
  for (let s = 0; s < 4; s++) {
    let seg = '';
    for (let i = 0; i < 8; i++) seg += TOKEN_CHARS[Math.floor(Math.random() * TOKEN_CHARS.length)];
    segments.push(seg);
  }
  return segments.join('-');
}

function publicListing(listing: Record<string, unknown>) {
  const photos = Array.isArray(listing.photos) ? listing.photos : [];
  const sources = listingPhotoSources(photos);
  return {
    title: String(listing.title || ''),
    sku: String(listing.sku || ''),
    photoCount: sources.length,
    maxPhotos: MAX_PHOTOS,
    remaining: Math.max(0, MAX_PHOTOS - sources.length),
    photos: photos.map((photo, index) => {
      if (typeof photo === 'string') return { id: `legacy-${index}`, url: photo, sortOrder: index };
      const asset = photo as { id?: string; url?: string; sortOrder?: number; source?: string };
      return {
        id: asset.id || `photo-${index}`,
        url: asset.url || '',
        sortOrder: asset.sortOrder ?? index,
        source: asset.source || 'mobile',
      };
    }),
  };
}

async function getSession(token: string) {
  const { data } = await supabase
    .from('shopify_photo_upload_sessions')
    .select('*')
    .eq('session_token', token)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

async function markExpired(id: string) {
  await supabase.from('shopify_photo_upload_sessions').update({ status: 'expired' }).eq('id', id);
}

function sessionState(session: Record<string, unknown> | null) {
  if (!session) return { allowed: false, status: 'missing', reason: 'Upload session was not found.' };
  const status = String(session.status || '');
  if (status === 'cancelled') return { allowed: false, status, reason: 'This upload session was cancelled.' };
  if (status === 'completed') return { allowed: false, status, reason: 'This upload session is already complete.' };
  if (status === 'expired' || new Date(String(session.expires_at)).getTime() <= Date.now()) {
    return { allowed: false, status: 'expired', reason: 'This upload session has expired.' };
  }
  if (status !== 'active') return { allowed: false, status, reason: 'This upload session is not active.' };
  return { allowed: true, status: 'active' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'POST required.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').trim();
    if (action === 'create') return await handleCreate(body);
    if (action === 'status') return await handleStatus(String(body.token || ''));
    if (action === 'upload') return await handleUpload(String(body.token || ''), String(body.image || ''));
    if (action === 'complete') return await handleComplete(String(body.token || ''));
    if (action === 'cancel') return await handleCancel(String(body.token || ''));
    return json({ success: false, error: 'Unknown action.' }, 400);
  } catch (err) {
    console.error('[shopify-photo-session]', err);
    return json({ success: false, error: 'Photo upload failed.' }, 500);
  }
});

async function handleCreate(body: Record<string, unknown>) {
  const listingId = String(body.listing_id || '').trim();
  const storeId = String(body.store_id || '').trim();
  const employeeId = String(body.employee_id || '').trim();
  if (!listingId || !storeId) return json({ success: false, error: 'listing_id and store_id are required.' }, 400);

  const { data: employee } = employeeId
    ? await supabase.from('pos_employees').select('id, is_active, store_id').eq('id', employeeId).maybeSingle()
    : { data: null };
  if (!employee || employee.is_active === false) {
    return json({ success: false, error: 'A valid employee must create the upload session.' }, 403);
  }

  const { data: listing } = await supabase.from('pos_shopify_listings').select('id, store_id, title, sku, photos').eq('id', listingId).maybeSingle();
  if (!listing || listing.store_id !== storeId) return json({ success: false, error: 'Listing was not found.' }, 404);

  await supabase.from('shopify_photo_upload_sessions')
    .update({ status: 'cancelled' })
    .eq('listing_id', listingId)
    .eq('status', 'active');

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await supabase.from('shopify_photo_upload_sessions').insert({
    session_token: token,
    listing_id: listingId,
    store_id: storeId,
    employee_id: employeeId || null,
    status: 'active',
    expires_at: expiresAt,
  }).select('session_token, status, expires_at').single();
  if (error || !data) {
    const raw = String(error?.message || '');
    const missingTable = /does not exist|schema cache|could not find the table|shopify_photo_upload_sessions/i.test(raw);
    return json({
      success: false,
      error: missingTable
        ? 'Missing table shopify_photo_upload_sessions. Run additive migration 20260904020000_shopify_photos_taxonomy.sql.'
        : 'Could not create upload session.',
    }, 500);
  }

  const origin = String(body.origin || body.app_url || '').trim().replace(/\/+$/, '');
  const uploadPath = `/shopify-photo-upload/${encodeURIComponent(data.session_token)}`;
  const uploadUrl = origin ? `${origin}${uploadPath}` : uploadPath;

  return json({
    success: true,
    session_token: data.session_token,
    upload_url: uploadUrl,
    expires_at: data.expires_at,
    session: {
      token: data.session_token,
      session_token: data.session_token,
      status: data.status,
      expiresAt: data.expires_at,
      expires_at: data.expires_at,
      upload_url: uploadUrl,
    },
    listing: publicListing(listing),
  });
}

async function handleStatus(token: string) {
  const session = await getSession(token);
  const state = sessionState(session);
  if (!session) return json({ success: false, error: state.reason }, 404);
  if (state.status === 'expired' && String(session.status) === 'active') await markExpired(String(session.id));

  const { data: listing } = await supabase.from('pos_shopify_listings')
    .select('title, sku, photos')
    .eq('id', String(session.listing_id))
    .maybeSingle();

  return json({
    success: true,
    session: {
      status: state.status === 'expired' ? 'expired' : session.status,
      expiresAt: session.expires_at,
    },
    listing: listing ? publicListing(listing) : { title: '', sku: '', photoCount: 0, maxPhotos: MAX_PHOTOS, remaining: MAX_PHOTOS, photos: [] },
  });
}

async function handleUpload(token: string, image: string) {
  const session = await getSession(token);
  const state = sessionState(session);
  if (!session) return json({ success: false, error: state.reason }, 404);
  if (!state.allowed) {
    if (state.status === 'expired') await markExpired(String(session.id));
    return json({ success: false, error: state.reason, status: state.status }, state.status === 'expired' ? 410 : 409);
  }

  const { data: listing } = await supabase.from('pos_shopify_listings')
    .select('id, store_id, photos')
    .eq('id', String(session.listing_id))
    .maybeSingle();
  if (!listing) return json({ success: false, error: 'Listing was not found.' }, 404);

  const current = Array.isArray(listing.photos) ? [...listing.photos] : [];
  if (listingPhotoSources(current).length >= MAX_PHOTOS) {
    return json({ success: false, error: `This listing already has ${MAX_PHOTOS} photos.` }, 400);
  }

  const parsed = parseDataUrl(image);
  if (!parsed) return json({ success: false, error: 'Unsupported image format.' }, 400);

  const photoId = crypto.randomUUID();
  const path = `${listing.store_id}/${listing.id}/${photoId}.jpg`;
  let url = image;
  const uploaded = await supabase.storage.from('shopify-listing-photos').upload(path, parsed.bytes, {
    contentType: parsed.mime || 'image/jpeg',
    upsert: false,
  });
  if (!uploaded.error) {
    const signed = await supabase.storage.from('shopify-listing-photos').createSignedUrl(path, 60 * 60 * 24 * 30);
    if (signed.data?.signedUrl) url = signed.data.signedUrl;
  }

  current.push({
    id: photoId,
    path: uploaded.error ? undefined : path,
    url,
    sortOrder: current.length,
    source: 'mobile',
  });
  await supabase.from('pos_shopify_listings').update({ photos: current, updated_at: new Date().toISOString() }).eq('id', listing.id);

  return json({
    success: true,
    listing: publicListing({ ...listing, photos: current }),
  });
}

async function handleComplete(token: string) {
  const session = await getSession(token);
  const state = sessionState(session);
  if (!session) return json({ success: false, error: state.reason }, 404);
  if (state.status === 'expired') {
    await markExpired(String(session.id));
    return json({ success: false, error: state.reason }, 410);
  }
  await supabase.from('shopify_photo_upload_sessions').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
  }).eq('id', String(session.id));
  return json({ success: true, session: { status: 'completed' } });
}

async function handleCancel(token: string) {
  const session = await getSession(token);
  if (!session) return json({ success: false, error: 'Upload session was not found.' }, 404);
  await supabase.from('shopify_photo_upload_sessions').update({ status: 'cancelled' }).eq('id', String(session.id));
  return json({ success: true, session: { status: 'cancelled' } });
}
