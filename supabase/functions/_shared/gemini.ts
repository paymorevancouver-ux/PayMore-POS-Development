export const GEMINI_MODEL = 'gemini-3.6-flash';
export const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
export const GEMINI_SAFE_ERROR_MESSAGE =
  'Gemini OCR service failed. Please retry or contact support.';

export class GeminiOcrError extends Error {
  httpStatus?: number;
  geminiCode?: string;

  constructor(
    message: string = GEMINI_SAFE_ERROR_MESSAGE,
    httpStatus?: number,
    geminiCode?: string,
  ) {
    super(message);
    this.name = 'GeminiOcrError';
    this.httpStatus = httpStatus;
    this.geminiCode = geminiCode;
  }
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image data URL');
  }
  return { mimeType: match[1], data: match[2] };
}

function logGeminiFailure(httpStatus: number, geminiCode?: string) {
  console.error(
    `Gemini API error: status=${httpStatus} code=${geminiCode ?? 'unknown'} model=${GEMINI_MODEL}`,
  );
}

export async function callGeminiWithImages(
  prompt: string,
  imageDataUrls: string[],
): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new GeminiOcrError('Gemini OCR is not configured. Please contact support.');
  }

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: prompt },
  ];

  for (const url of imageDataUrls) {
    const { mimeType, data } = parseDataUrl(url);
    parts.push({ inlineData: { mimeType, data } });
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    let geminiCode: string | undefined;
    try {
      const errJson = await response.json();
      geminiCode = errJson?.error?.status || errJson?.error?.code;
    } catch {
      // Ignore parse errors — only log status/code/model
    }
    logGeminiFailure(response.status, geminiCode);
    throw new GeminiOcrError(GEMINI_SAFE_ERROR_MESSAGE, response.status, geminiCode);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) {
    console.error(`Gemini API error: status=200 code=empty_response model=${GEMINI_MODEL}`);
    throw new GeminiOcrError(GEMINI_SAFE_ERROR_MESSAGE);
  }

  return text;
}

export function parseJsonFromGeminiResponse(rawContent: string): unknown {
  let cleaned = rawContent.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return JSON.parse(cleaned.trim());
}

export function isGeminiOcrError(err: unknown): err is GeminiOcrError {
  return err instanceof GeminiOcrError;
}
