<?php
// Fixed-window rate limits per visitor (BRIEF §9, §12), stored as small locked files in the private folder.
declare(strict_types=1);

function rate_limit(string $bucket, int $limit, int $windowSeconds): void
{
    $dir = private_path('ratelimit');
    $file = $dir . '/' . $bucket . '-' . client_key() . '.json';
    $fh = @fopen($file, 'c+');
    if ($fh === false) {
        send_error(503, 'STORAGE', 'Saving is paused right now. Try again in a minute.');
    }
    flock($fh, LOCK_EX);
    $state = json_decode((string) stream_get_contents($fh), true);
    $now = time();
    if (!is_array($state) || $now - (int) ($state['start'] ?? 0) >= $windowSeconds) {
        $state = ['start' => $now, 'count' => 0];
    }
    $state['count']++;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($state));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);

    // Now and then, clear windows that ended more than a day ago.
    if (random_int(1, 200) === 1) {
        foreach (glob($dir . '/*.json') ?: [] as $old) {
            if (@filemtime($old) < $now - 86400) {
                @unlink($old);
            }
        }
    }

    if ($state['count'] > $limit) {
        $wait = max(1, $windowSeconds - ($now - $state['start']));
        send_error(429, 'RATE_LIMITED', 'Too many tries in a short time. Wait a minute and try again.', ['Retry-After' => (string) $wait]);
    }
}
