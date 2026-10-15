<?php
// JSON responses and request input (BRIEF §11): errors are always {ok:false,error:{code,message}}.
declare(strict_types=1);

function send_json(array $data, int $status = 200, array $headers = []): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    foreach ($headers as $name => $value) {
        header($name . ': ' . $value);
    }
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function send_error(int $status, string $code, string $message, array $headers = []): never
{
    send_json(['ok' => false, 'error' => ['code' => $code, 'message' => $message]], $status, $headers);
}

function require_method(string ...$allowed): string
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, $allowed, true)) {
        send_error(405, 'BAD_METHOD', 'Use ' . implode(' or ', $allowed) . ' here.', ['Allow' => implode(', ', $allowed)]);
    }
    return $method;
}

// The request body as a JSON object, at most $maxBytes long.
function read_json(int $maxBytes = 2048): array
{
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || strlen($raw) > $maxBytes) {
        send_error(413, 'TOO_LARGE', 'That request is too large.');
    }
    $data = json_decode($raw, true);
    if (!is_array($data) || array_is_list($data) && $data !== []) {
        send_error(400, 'BAD_INPUT', 'Send a JSON object.');
    }
    return $data;
}

// A keyed hash of the visitor's IP, used only for rate limits. The raw IP is never stored.
function client_key(): string
{
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $saltFile = private_path('ratelimit') . '/.salt';
    $salt = @file_get_contents($saltFile);
    if ($salt === false || strlen($salt) < 32) {
        $salt = bin2hex(random_bytes(32));
        @file_put_contents($saltFile, $salt, LOCK_EX);
    }
    return substr(hash_hmac('sha256', (string) $ip, $salt), 0, 32);
}
