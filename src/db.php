<?php
// MySQL or MariaDB through PDO (BRIEF §15 Arena). Credentials come from DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS.
declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $name = env('DB_NAME');
        if ($name === null || env('DB_USER') === null) {
            throw new RuntimeException('Database settings are missing (DB_NAME, DB_USER).');
        }
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', env('DB_HOST', '127.0.0.1'), (int) env('DB_PORT', '3306'), $name);
        $pdo = new PDO($dsn, env('DB_USER'), env('DB_PASS', ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec("SET time_zone = '+00:00'");
    }
    return $pdo;
}
