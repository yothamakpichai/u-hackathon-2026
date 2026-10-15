<?php
// Shared setup for every endpoint in public/api (BRIEF §11): paths, settings, JSON errors and no stack traces.
declare(strict_types=1);

define('REPO_ROOT', dirname(__DIR__));
define('PRIVATE_DIR', dirname(REPO_ROOT) . DIRECTORY_SEPARATOR . 'u-hackathon-2026-private');

require __DIR__ . '/config.php';
require __DIR__ . '/http.php';
require __DIR__ . '/ratelimit.php';

ini_set('display_errors', '0');
error_reporting(E_ALL);

set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false; // silenced with @ on purpose, for example a file that doesn't exist yet
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

set_exception_handler(static function (Throwable $e): void {
    log_error($e);
    send_error(500, 'SERVER', 'Something went wrong on our side. Try again in a minute.');
});

// Errors go to the private logs folder (never to the visitor), without request data.
function log_error(Throwable $e): void
{
    $line = sprintf("%s %s: %s at %s:%d\n", gmdate('c'), get_class($e), $e->getMessage(), basename($e->getFile()), $e->getLine());
    $dir = PRIVATE_DIR . '/logs';
    if (is_dir($dir) || @mkdir($dir, 0770, true)) {
        @file_put_contents($dir . '/php-errors.log', $line, FILE_APPEND | LOCK_EX);
    } else {
        error_log(trim($line));
    }
}
