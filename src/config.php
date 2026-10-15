<?php
// Settings from ../u-hackathon-2026-private/.env (BRIEF §11) and the private folders for writable state.
declare(strict_types=1);

function env(string $key, ?string $default = null): ?string
{
    static $values = null;
    if ($values === null) {
        $values = [];
        $text = @file_get_contents(PRIVATE_DIR . '/.env');
        foreach ($text === false ? [] : preg_split('/\R/', $text) as $line) {
            if (preg_match('/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/', $line, $m)) {
                $values[$m[1]] = preg_replace('/^([\'"])(.*)\1$/', '$2', $m[2]);
            }
        }
    }
    $value = $values[$key] ?? '';
    return $value === '' ? $default : $value;
}

// A writable folder inside the private directory, created on first use. Answers 503 if storage is unavailable.
function private_path(string $name): string
{
    $dir = PRIVATE_DIR . '/' . $name;
    if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) {
        send_error(503, 'STORAGE', 'Saving is paused right now. Your score is still kept on this device.');
    }
    if (!is_writable($dir)) {
        send_error(503, 'STORAGE', 'Saving is paused right now. Your score is still kept on this device.');
    }
    return $dir;
}
