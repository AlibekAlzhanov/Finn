// Supabase Edge Function: transcribe-audio
// Deploy:
//   npx supabase functions deploy transcribe-audio
// Secret must already exist:
//   npx supabase secrets set GROQ_API_KEY=your_groq_key

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-large-v3';

type TranscribeAudioRequest = {
  audioBase64?: string;
  mimeType?: string;
  filename?: string;
  language?: string;
};

const json = (body: unknown, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
};

const base64ToBlob = (base64: string, mimeType: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], {
    type: mimeType,
  });
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const groqKey = Deno.env.get('GROQ_API_KEY');

    if (!groqKey) {
      return json(
        {
          error: 'GROQ_API_KEY is not configured.',
        },
        500
      );
    }

    const authHeader = req.headers.get('Authorization') || '';

    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing Authorization Bearer token.' }, 401);
    }

    const body = (await req.json()) as TranscribeAudioRequest;

    if (!body.audioBase64) {
      return json({ error: 'audioBase64 is required.' }, 400);
    }

    const mimeType = body.mimeType || 'audio/m4a';
    const filename = body.filename || 'voice.m4a';
    const language = body.language || 'ru';

    const audioBlob = base64ToBlob(body.audioBase64, mimeType);

    const formData = new FormData();
    formData.append('file', audioBlob, filename);
    formData.append('model', WHISPER_MODEL);
    formData.append('language', language);

    const response = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
      },
      body: formData,
    });

    const rawText = await response.text();

    if (!response.ok) {
      console.error('Groq Whisper error status:', response.status);
      console.error('Groq Whisper error body:', rawText);

      return json(
        {
          error: 'Groq transcription request failed.',
          providerStatus: response.status,
        },
        502
      );
    }

    const data = JSON.parse(rawText);

    return json({
      text: data?.text || '',
      source: 'edge-function',
    });
  } catch (error) {
    console.error('transcribe-audio function error:', error);

    return json(
      {
        error: error instanceof Error ? error.message : 'Unknown transcribe-audio error.',
      },
      500
    );
  }
});
