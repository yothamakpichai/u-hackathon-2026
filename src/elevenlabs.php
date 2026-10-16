<?php
// ElevenLabs text to speech for Penny's answers (BRIEF §9, §17; docs/DECISIONS.md #18 and #60).
// Premade voices only, never a clone or a real person. Failures are logged with the status only: never the key or the text.
declare(strict_types=1);

const TTS_MAX_CHARS = 600;
const TTS_TOKEN_TTL = 3600;
// The lowest-latency model in the live /v1/models list (measured: about 0.5 s to the first byte for a short line).
const TTS_DEFAULT_MODEL = 'eleven_flash_v2_5';
// Code defaults: ElevenLabs premade voices. Each can be swapped in .env.
const TTS_VOICES = [
    'penny' => ['ELEVENLABS_VOICE_PENNY', 'hpp4J3VqNfWAUOO0d1Us'],       // Bella - Professional, Bright, Warm (DECISIONS #18)
    'female' => ['ELEVENLABS_VOICE_FEMALE', 'XrExE9yKIg1WjnnlVkGX'],     // Matilda - Knowledgable, Professional
    'male' => ['ELEVENLABS_VOICE_MALE', 'iP95p4xoKVk53GoZ742B'],         // Chris - Charming, Down-to-Earth
    'neutral' => ['ELEVENLABS_VOICE_NEUTRAL', 'SAz9YHcvj6GT2YYXdXww'],   // River - Relaxed, Neutral, Informative
];

function tts_voice_id(string $voice): ?string
{
    if (!isset(TTS_VOICES[$voice])) {
        return null;
    }
    [$name, $default] = TTS_VOICES[$voice];
    // Penny keeps Bella even if ELEVENLABS_VOICE_ID still names an older, non-premade voice (DECISIONS #18).
    return env($name, $default);
}

function tts_model(): string
{
    return env('ELEVENLABS_TTS_MODEL', TTS_DEFAULT_MODEL);
}

// The HMAC secret: TTS_HMAC_SECRET, or a random one kept in the private folder (like client_key()'s salt).
function tts_secret(): string
{
    $secret = env('TTS_HMAC_SECRET');
    if ($secret !== null) {
        return $secret;
    }
    $file = private_path('cache') . '/.tts-secret';
    $stored = @file_get_contents($file);
    if ($stored === false || strlen($stored) < 32) {
        $stored = bin2hex(random_bytes(32));
        @file_put_contents($file, $stored, LOCK_EX);
    }
    return $stored;
}

// A token that lets api/tts.php speak exactly this text in this voice for about an hour: "<expiry>.<hmac>".
// Text is compared after collapsing whitespace, the same way api/tts.php reads it.
function tts_normalize(string $text): string
{
    return trim(preg_replace('/\s+/u', ' ', $text) ?? '');
}

function tts_token(string $text, string $voice): string
{
    $expiry = time() + TTS_TOKEN_TTL;
    return $expiry . '.' . hash_hmac('sha256', tts_normalize($text) . '|' . $voice . '|' . $expiry, tts_secret());
}

function tts_token_ok(string $text, string $voice, string $token): bool
{
    if (!preg_match('/^(\d{10})\.([a-f0-9]{64})$/', $token, $m) || (int) $m[1] < time()) {
        return false;
    }
    return hash_equals(hash_hmac('sha256', $text . '|' . $voice . '|' . $m[1], tts_secret()), $m[2]);
}

// Static text that may be spoken without a token: every narration caption and every FAQ answer, kept as hashes.
function tts_allowed(string $text): bool
{
    static $hashes = null;
    if ($hashes === null) {
        $hashes = [];
        $manifest = json_decode((string) @file_get_contents(REPO_ROOT . '/public/assets/audio/manifest.json'), true);
        foreach (is_array($manifest) ? $manifest : [] as $caption) {
            if (is_string($caption)) {
                $hashes[hash('sha256', $caption)] = true;
            }
        }
        $faq = json_decode((string) @file_get_contents(REPO_ROOT . '/public/data/tutor_faq.json'), true);
        foreach (is_array($faq) ? $faq : [] as $items) {
            foreach (is_array($items) ? $items : [] as $item) {
                if (is_string($item['answer'] ?? null)) {
                    $hashes[hash('sha256', $item['answer'])] = true;
                }
            }
        }
    }
    return isset($hashes[hash('sha256', $text)]);
}

// MP3 bytes for the text, or null on any failure so the caller can answer with an error and the app can fall back.
function elevenlabs_tts(string $text, string $voiceId, string $model, int $timeoutSeconds = 10): ?string
{
    $key = env('ELEVENLABS_API_KEY');
    if ($key === null || !function_exists('curl_init')) {
        return null;
    }
    $ch = curl_init('https://api.elevenlabs.io/v1/text-to-speech/' . rawurlencode($voiceId) . '?output_format=mp3_44100_64');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_HTTPHEADER => [
            'xi-api-key: ' . $key,
            'accept: audio/mpeg',
            'content-type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode(['text' => $text, 'model_id' => $model], JSON_UNESCAPED_UNICODE),
    ]);
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $curlError = curl_errno($ch);
    curl_close($ch);

    if (!is_string($body) || $status !== 200 || $body === '') {
        log_error(new RuntimeException('ElevenLabs call failed: ' . ($curlError ? "curl error $curlError" : "HTTP $status")));
        return null;
    }
    return $body;
}
