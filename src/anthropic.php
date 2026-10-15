<?php
// Claude Messages API (BRIEF §9). Returns the decoded reply, or null on any failure so the caller can fall back.
// Failures are logged with the status only: never the key, the question or the answer.
declare(strict_types=1);

function anthropic_message(array $payload, int $timeoutSeconds = 12): ?array
{
    $key = env('ANTHROPIC_API_KEY');
    if ($key === null || !function_exists('curl_init')) {
        return null;
    }
    $ch = curl_init('https://api.anthropic.com/v1/messages');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_HTTPHEADER => [
            'x-api-key: ' . $key,
            'anthropic-version: 2023-06-01',
            'content-type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
    ]);
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $curlError = curl_errno($ch);
    curl_close($ch);

    if ($body === false || $status !== 200) {
        log_error(new RuntimeException('Claude call failed: ' . ($curlError ? "curl error $curlError" : "HTTP $status")));
        return null;
    }
    $data = json_decode((string) $body, true);
    return is_array($data) ? $data : null;
}

// The text of the first text block in a Messages API reply.
function anthropic_text(array $reply): ?string
{
    foreach ($reply['content'] ?? [] as $block) {
        if (($block['type'] ?? '') === 'text' && is_string($block['text'] ?? null)) {
            return trim($block['text']);
        }
    }
    return null;
}
