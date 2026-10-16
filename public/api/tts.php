<?php
// Penny's voice (BRIEF §9, §17): text to speech through our own domain, so the strict CSP (media-src 'self') holds.
//   GET  api/tts.php?text=...&voice=penny|female|male|neutral&token=...   (usable directly as an <audio> src)
//   POST {"text":"...","voice":"penny","token":"..."}
//   -> audio/mpeg, or {ok:false,error:{code,message}}; the app then falls back to the browser's own speech.
// Only two kinds of text are spoken: an answer tutor.php just gave (it carries an HMAC token for that exact text
// and voice, valid about an hour) or static text on the allowlist (narration captions and FAQ answers).
// Clips are cached by sha256(voice + model + text); new characters count towards TTS_DAILY_CHAR_CAP.
declare(strict_types=1);

require dirname(__DIR__, 2) . '/src/bootstrap.php';
require REPO_ROOT . '/src/cache.php';
require REPO_ROOT . '/src/elevenlabs.php';

$method = require_method('GET', 'POST');
rate_limit('tts', 30, 60);
$input = $method === 'POST' ? read_json(4096) : $_GET;

$text = is_string($input['text'] ?? null) ? tts_normalize($input['text']) : '';
if ($text === '' || mb_strlen($text) > TTS_MAX_CHARS) {
    send_error(400, 'BAD_INPUT', 'text must be 1 to ' . TTS_MAX_CHARS . ' characters.');
}
$voice = is_string($input['voice'] ?? null) ? $input['voice'] : 'penny';
$voiceId = tts_voice_id($voice);
if ($voiceId === null) {
    send_error(400, 'BAD_INPUT', 'voice must be penny, female, male or neutral.');
}
$token = is_string($input['token'] ?? null) ? $input['token'] : '';
if (!($token !== '' && tts_token_ok($text, $voice, $token)) && !tts_allowed($text)) {
    send_error(403, 'NOT_ALLOWED', 'Penny can only read her own answers aloud.');
}

$model = tts_model();
$file = private_path('tts') . '/' . hash('sha256', $voiceId . '|' . $model . '|' . $text) . '.mp3';
$audio = is_file($file) ? @file_get_contents($file) : false;
if (!is_string($audio) || $audio === '') {
    if (env('ELEVENLABS_API_KEY') === null) {
        send_error(503, 'UNAVAILABLE', 'Penny’s voice is resting. Your browser can read this instead.');
    }
    if (!daily_take('tts-chars', (int) env('TTS_DAILY_CHAR_CAP', '20000'), mb_strlen($text))) {
        send_error(503, 'DAILY_CAP', 'Penny’s voice is resting for today. Your browser can read this instead.');
    }
    $audio = elevenlabs_tts($text, $voiceId, $model);
    if ($audio === null) {
        send_error(502, 'UPSTREAM', 'Penny’s voice didn’t come through. Your browser can read this instead.');
    }
    @file_put_contents($file, $audio, LOCK_EX);
}

http_response_code(200);
header('Content-Type: audio/mpeg');
header('Content-Length: ' . strlen($audio));
header('Cache-Control: private, max-age=3600');
header('X-Content-Type-Options: nosniff');
echo $audio;
