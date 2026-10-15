<?php
// Health check: can the server save state, and is the AI key set? Never shows paths, versions or key values.
declare(strict_types=1);

require dirname(__DIR__, 2) . '/src/bootstrap.php';

require_method('GET');
$dir = PRIVATE_DIR . '/leaderboard';
$storage = (is_dir($dir) || @mkdir($dir, 0770, true)) && is_writable($dir);
send_json([
    'ok' => $storage,
    'time' => gmdate('c'),
    'storage' => $storage,
    'ai' => env('ANTHROPIC_API_KEY') !== null,
], $storage ? 200 : 503);
