<?php
// Small file cache and daily counters in the private folder (BRIEF §11). Keys are hashed, so no text is in file names.
declare(strict_types=1);

function cache_get(string $key, int $ttlSeconds): ?array
{
    $file = private_path('cache') . '/' . hash('sha256', $key) . '.json';
    if (!is_file($file) || @filemtime($file) < time() - $ttlSeconds) {
        return null;
    }
    $data = json_decode((string) @file_get_contents($file), true);
    return is_array($data) ? $data : null;
}

function cache_put(string $key, array $value): void
{
    $file = private_path('cache') . '/' . hash('sha256', $key) . '.json';
    @file_put_contents($file, json_encode($value, JSON_UNESCAPED_UNICODE), LOCK_EX);
}

// Adds one to today's counter unless it has reached $cap. Returns false when the cap is reached.
function daily_take(string $name, int $cap): bool
{
    $day = (new DateTimeImmutable('now', new DateTimeZone('Asia/Bangkok')))->format('Y-m-d');
    $fh = @fopen(private_path('cache') . "/$name-$day.count", 'c+');
    if ($fh === false) {
        return false;
    }
    flock($fh, LOCK_EX);
    $count = (int) stream_get_contents($fh);
    $ok = $count < $cap;
    if ($ok) {
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, (string) ($count + 1));
        fflush($fh);
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    return $ok;
}
