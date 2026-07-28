import { corsHeaders } from '../_shared/cors.ts';
import { callGeminiWithImages, parseJsonFromGeminiResponse } from '../_shared/gemini.ts';

const EXTRACTION_PROMPT = `You are an ID document data extraction assistant. Analyze the provided ID card/driver's license photo(s) and extract all visible personal information.

Extract and return ONLY a valid JSON object with these exact fields (use empty string "" if a field is not visible or not applicable):

{
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
- Return ONLY the JSON object, no markdown, no explanation, no other text.`;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { frontImage, backImage } = await req.json();

    if (!frontImage) {
      return new Response(
        JSON.stringify({ error: 'At least a front ID image is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Extracting ID data from images...');
    console.log('Front image provided:', !!frontImage);
    console.log('Back image provided:', !!backImage);

    const images = [frontImage];
    if (backImage) {
      images.push(backImage);
    }

    const rawContent = await callGeminiWithImages(EXTRACTION_PROMPT, images);
    console.log('AI raw response:', rawContent);

    let extracted;
    try {
      extracted = parseJsonFromGeminiResponse(rawContent);
    } catch (parseErr) {
      console.error('Failed to parse AI response as JSON:', rawContent);
      return new Response(
        JSON.stringify({ error: 'Failed to parse extracted data', raw: rawContent }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Extracted data:', JSON.stringify(extracted));

    return new Response(
      JSON.stringify({ success: true, data: extracted }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Edge function error:', err);
    const message = (err as Error).message;
    return new Response(
      JSON.stringify({
        error: message.startsWith('Gemini API error')
          ? `AI extraction failed: ${message}`
          : `Server error: ${message}`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
