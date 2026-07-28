import { corsHeaders } from '../_shared/cors.ts';
import {
  callGeminiWithImages,
  GEMINI_SAFE_ERROR_MESSAGE,
  isGeminiOcrError,
  parseJsonFromGeminiResponse,
} from '../_shared/gemini.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

const SESSION_EXPIRY_MINUTES = 5;

const SESSION_EXTRACTION_PROMPT = `You are an ID document data extraction assistant. Analyze the provided ID card/driver's license photo(s) and extract all visible personal information.

Extract and return ONLY a valid JSON object with these exact fields. For each field, also provide a confidence score (0.0 to 1.0) indicating how certain you are about the extraction.

Return this structure:
{
  "data": {
    "firstName": "",
    "middleName": "",
    "lastName": "",
    "dob": "",
    "address1": "",
    "address2": "",
    "city": "",
    "province": "",
    "postalCode": "",
    "idNumber": "",
    "sex": "",
    "height": "",
    "weight": "",
    "idType": ""
  },
  "confidence": {
    "firstName": 0.0,
    "middleName": 0.0,
    "lastName": 0.0,
    "dob": 0.0,
    "address1": 0.0,
    "address2": 0.0,
    "city": 0.0,
    "province": 0.0,
    "postalCode": 0.0,
    "idNumber": 0.0,
    "sex": 0.0,
    "height": 0.0,
    "weight": 0.0,
    "idType": 0.0
  }
}

Rules:
- "dob" must be in YYYY-MM-DD format (e.g. "1992-05-14")
- "sex" should be "Male", "Female", or ""
- "idType" should be "drivers-license", "passport", "provincial-id", or "other"
- "province" should be the 2-letter Canadian province code (e.g. "BC", "ON", "AB") if visible
- "height" should be in inches or cm as shown on the ID (just the number)
- "weight" should be in lbs or kg as shown on the ID (just the number)
- "postalCode" should be in Canadian format (e.g. "V3T 2W6") if applicable
- For address, put the street address in "address1" and unit/suite in "address2"
- Confidence of 1.0 means clearly readable, 0.5 means partially readable, 0.0 means not found
- Return ONLY the JSON object, no markdown, no explanation.`;

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const segments = [];
  for (let s = 0; s < 4; s++) {
    let seg = '';
    for (let i = 0; i < 6; i++) {
      seg += chars[Math.floor(Math.random() * chars.length)];
    }
    segments.push(seg);
  }
  return segments.join('-');
}

async function handleCreate(): Promise<Response> {
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_MINUTES * 60 * 1000);

  const { data, error } = await supabase
    .from('id_scan_sessions')
    .insert({
      session_token: token,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    })
    .select('id, session_token, status, expires_at, created_at')
    .single();

  if (error) {
    console.error('Create session error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Failed to create session' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  console.log('Session created:', data.session_token.substring(0, 8) + '...');

  return new Response(
    JSON.stringify({
      success: true,
      session: {
        id: data.id,
        token: data.session_token,
        status: data.status,
        expiresAt: data.expires_at,
        createdAt: data.created_at,
      },
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

async function handleStatus(token: string): Promise<Response> {
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Session token is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { data, error } = await supabase
    .from('id_scan_sessions')
    .select('*')
    .eq('session_token', token)
    .single();

  if (error || !data) {
    return new Response(
      JSON.stringify({ error: 'Session not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (new Date(data.expires_at) < new Date() && data.status === 'pending') {
    await supabase
      .from('id_scan_sessions')
      .update({ status: 'expired' })
      .eq('id', data.id);

    return new Response(
      JSON.stringify({
        success: true,
        session: { ...data, status: 'expired' },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      session: {
        id: data.id,
        token: data.session_token,
        status: data.status,
        extractedData: data.extracted_data,
        confidenceScores: data.confidence_scores,
        errorMessage: data.error_message,
        expiresAt: data.expires_at,
        createdAt: data.created_at,
        completedAt: data.completed_at,
      },
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

async function handleUpload(token: string, frontImage: string, backImage?: string): Promise<Response> {
  if (!token || !frontImage) {
    return new Response(
      JSON.stringify({ error: 'Session token and front image are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { data: session, error: sessionError } = await supabase
    .from('id_scan_sessions')
    .select('*')
    .eq('session_token', token)
    .single();

  if (sessionError || !session) {
    return new Response(
      JSON.stringify({ error: 'Invalid session' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('id_scan_sessions')
      .update({ status: 'expired' })
      .eq('id', session.id);
    return new Response(
      JSON.stringify({ error: 'Session has expired. Please request a new QR code from the POS.' }),
      { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (session.used || session.status === 'completed' || session.status === 'processing') {
    return new Response(
      JSON.stringify({ error: 'This session has already been used. Please request a new QR code.' }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  await supabase
    .from('id_scan_sessions')
    .update({ status: 'uploading', used: true })
    .eq('id', session.id);

  console.log('Uploading photos for session:', token.substring(0, 8) + '...');

  let frontPath = '';
  let backPath = '';

  try {
    const frontBase64Data = frontImage.replace(/^data:image\/\w+;base64,/, '');
    const frontBytes = Uint8Array.from(atob(frontBase64Data), (c) => c.charCodeAt(0));
    frontPath = `sessions/${session.id}/front.jpg`;

    const { error: frontUploadErr } = await supabase.storage
      .from('id-photos')
      .upload(frontPath, frontBytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (frontUploadErr) {
      console.error('Front upload error:', frontUploadErr.message);
    }

    if (backImage) {
      const backBase64Data = backImage.replace(/^data:image\/\w+;base64,/, '');
      const backBytes = Uint8Array.from(atob(backBase64Data), (c) => c.charCodeAt(0));
      backPath = `sessions/${session.id}/back.jpg`;

      const { error: backUploadErr } = await supabase.storage
        .from('id-photos')
        .upload(backPath, backBytes, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (backUploadErr) {
        console.error('Back upload error:', backUploadErr.message);
      }
    }
  } catch (uploadErr) {
    console.error('Storage upload error:', (uploadErr as Error).message);
  }

  await supabase
    .from('id_scan_sessions')
    .update({
      status: 'processing',
      front_image_path: frontPath,
      back_image_path: backPath || null,
    })
    .eq('id', session.id);

  console.log('Processing ID with AI for session:', token.substring(0, 8) + '...');

  let retries = 0;
  const maxRetries = 2;
  let extracted: Record<string, unknown> | null = null;
  let confidenceScores: Record<string, number> | null = null;
  let ocrFailed = false;

  const images = [frontImage];
  if (backImage) {
    images.push(backImage);
  }

  while (retries <= maxRetries) {
    try {
      const rawContent = await callGeminiWithImages(SESSION_EXTRACTION_PROMPT, images);
      console.log('AI raw response length:', rawContent.length);

      const parsed = parseJsonFromGeminiResponse(rawContent) as {
        data?: Record<string, unknown>;
        confidence?: Record<string, number>;
        [key: string]: unknown;
      };

      if (parsed.data) {
        extracted = parsed.data;
        confidenceScores = parsed.confidence || null;
      } else {
        extracted = parsed as Record<string, unknown>;
        confidenceScores = null;
      }

      break;
    } catch (err) {
      if (isGeminiOcrError(err)) {
        ocrFailed = true;
        break;
      }

      console.error(`AI attempt ${retries + 1} parse/network error`);
      retries++;
      if (retries <= maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * retries));
      }
    }
  }

  if (!extracted) {
    const safeMessage = ocrFailed
      ? GEMINI_SAFE_ERROR_MESSAGE
      : 'Failed to extract data from ID. Please retry.';

    await supabase
      .from('id_scan_sessions')
      .update({
        status: 'error',
        error_message: safeMessage,
      })
      .eq('id', session.id);

    return new Response(
      JSON.stringify({ success: false, error: safeMessage }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  await supabase
    .from('id_scan_sessions')
    .update({
      status: 'completed',
      extracted_data: extracted,
      confidence_scores: confidenceScores,
      completed_at: new Date().toISOString(),
    })
    .eq('id', session.id);

  console.log('Session completed:', token.substring(0, 8) + '...');

  return new Response(
    JSON.stringify({
      success: true,
      data: extracted,
      confidence: confidenceScores,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

async function handleExpire(token: string): Promise<Response> {
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Session token is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { error } = await supabase
    .from('id_scan_sessions')
    .update({ status: 'expired' })
    .eq('session_token', token)
    .in('status', ['pending', 'uploading']);

  if (error) {
    console.error('Expire session error:', error.message);
  }

  const { data: session } = await supabase
    .from('id_scan_sessions')
    .select('id')
    .eq('session_token', token)
    .single();

  if (session) {
    await supabase.storage
      .from('id-photos')
      .remove([`sessions/${session.id}/front.jpg`, `sessions/${session.id}/back.jpg`]);
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, token, frontImage, backImage } = body;

    console.log('Action:', action, 'Token:', token ? token.substring(0, 8) + '...' : 'none');

    switch (action) {
      case 'create':
        return await handleCreate();
      case 'status':
        return await handleStatus(token);
      case 'upload':
        return await handleUpload(token, frontImage, backImage);
      case 'expire':
        return await handleExpire(token);
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
  } catch (err) {
    console.error('Edge function error:', (err as Error).name);
    return new Response(
      JSON.stringify({ error: GEMINI_SAFE_ERROR_MESSAGE }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
