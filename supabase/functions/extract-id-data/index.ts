import { corsHeaders } from '../_shared/cors.ts';

const apiKey = Deno.env.get('ONSPACE_AI_API_KEY')!;
const baseUrl = Deno.env.get('ONSPACE_AI_BASE_URL')!;

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

    // Build the content array with images
    const contentParts: any[] = [
      {
        type: 'text',
        text: `You are an ID document data extraction assistant. Analyze the provided ID card/driver's license photo(s) and extract all visible personal information.

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
- Return ONLY the JSON object, no markdown, no explanation, no other text.`
      },
      {
        type: 'image_url',
        image_url: { url: frontImage }
      }
    ];

    if (backImage) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: backImage }
      });
    }

    const aiResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'user',
            content: contentParts,
          }
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('OnSpace AI error:', errText);
      return new Response(
        JSON.stringify({ error: `AI extraction failed: ${errText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content ?? '';
    console.log('AI raw response:', rawContent);

    // Parse the JSON from the response (strip any markdown fences if present)
    let cleaned = rawContent.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    let extracted;
    try {
      extracted = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse AI response as JSON:', cleaned);
      return new Response(
        JSON.stringify({ error: 'Failed to parse extracted data', raw: cleaned }),
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
    return new Response(
      JSON.stringify({ error: `Server error: ${(err as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
