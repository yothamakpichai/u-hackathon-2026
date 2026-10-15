<?php
// Arena schema (BRIEF §15). Idempotent: run it as often as you like, it only creates what is missing and adds
// missing columns. It never creates or drops the database itself, so it runs with a least-privilege user.
//   php bin/migrate.php
// Reads DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASS from ../u-hackathon-2026-private/.env (or the environment).
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}

define('REPO_ROOT', dirname(__DIR__));
define('PRIVATE_DIR', dirname(REPO_ROOT) . DIRECTORY_SEPARATOR . 'u-hackathon-2026-private');
require REPO_ROOT . '/src/config.php';
require REPO_ROOT . '/src/db.php';
require REPO_ROOT . '/src/arena.php';

const ENGINE = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

$tables = [
    'arena_users' => "CREATE TABLE IF NOT EXISTS arena_users (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(16) NOT NULL,
        username_key VARCHAR(16) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        birth_year SMALLINT UNSIGNED NOT NULL,
        cash DECIMAL(24,8) NOT NULL DEFAULT 1000,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_arena_users_key (username_key)
    ) " . ENGINE,
    'arena_sessions' => "CREATE TABLE IF NOT EXISTS arena_sessions (
        token_hash CHAR(64) NOT NULL PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        csrf CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY ix_arena_sessions_user (user_id),
        KEY ix_arena_sessions_expires (expires_at),
        CONSTRAINT fk_arena_sessions_user FOREIGN KEY (user_id) REFERENCES arena_users (id) ON DELETE CASCADE
    ) " . ENGINE,
    'arena_market' => "CREATE TABLE IF NOT EXISTS arena_market (
        id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
        tick BIGINT UNSIGNED NOT NULL DEFAULT 0,
        tick_ms BIGINT UNSIGNED NOT NULL,
        seed INT UNSIGNED NOT NULL
    ) " . ENGINE,
    'arena_coins' => "CREATE TABLE IF NOT EXISTS arena_coins (
        id VARCHAR(8) NOT NULL PRIMARY KEY,
        name VARCHAR(24) NOT NULL,
        reserve_l DECIMAL(24,8) NOT NULL,
        reserve_c DECIMAL(24,8) NOT NULL,
        fair DECIMAL(24,8) NOT NULL,
        ema_fast DECIMAL(24,8) NOT NULL,
        ema_slow DECIMAL(24,8) NOT NULL,
        sort TINYINT UNSIGNED NOT NULL DEFAULT 0
    ) " . ENGINE,
    'arena_holdings' => "CREATE TABLE IF NOT EXISTS arena_holdings (
        user_id INT UNSIGNED NOT NULL,
        coin_id VARCHAR(8) NOT NULL,
        amount DECIMAL(24,8) NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, coin_id),
        CONSTRAINT fk_arena_holdings_user FOREIGN KEY (user_id) REFERENCES arena_users (id) ON DELETE CASCADE
    ) " . ENGINE,
    'arena_trades' => "CREATE TABLE IF NOT EXISTS arena_trades (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        tick BIGINT UNSIGNED NOT NULL,
        coin_id VARCHAR(8) NOT NULL,
        user_id INT UNSIGNED NULL,
        bot VARCHAR(16) NULL,
        side ENUM('buy', 'sell') NOT NULL,
        coins DECIMAL(24,8) NOT NULL,
        amount_l DECIMAL(24,8) NOT NULL,
        price DECIMAL(24,8) NOT NULL,
        wash TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY ix_arena_trades_tick (tick),
        KEY ix_arena_trades_coin_tick (coin_id, tick)
    ) " . ENGINE,
    'arena_candles' => "CREATE TABLE IF NOT EXISTS arena_candles (
        coin_id VARCHAR(8) NOT NULL,
        bucket BIGINT UNSIGNED NOT NULL,
        open DECIMAL(24,8) NOT NULL,
        high DECIMAL(24,8) NOT NULL,
        low DECIMAL(24,8) NOT NULL,
        close DECIMAL(24,8) NOT NULL,
        volume DECIMAL(24,8) NOT NULL DEFAULT 0,
        wash_volume DECIMAL(24,8) NOT NULL DEFAULT 0,
        PRIMARY KEY (coin_id, bucket)
    ) " . ENGINE,
];

// Columns added after a table first shipped go here as [table, column, definition]; each is added only if missing.
$columns = [];

try {
    $db = db();
    $existing = array_map('strtolower', $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN));
    foreach ($tables as $name => $sql) {
        $db->exec($sql);
        echo (in_array($name, $existing, true) ? 'exists  ' : 'created ') . $name . PHP_EOL;
    }
    foreach ($columns as [$table, $column, $definition]) {
        $has = $db->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
        $has->execute([$table, $column]);
        if (!(int) $has->fetchColumn()) {
            $db->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
            echo "added   $table.$column" . PHP_EOL;
        }
    }

    // Seed rows only where missing, so a rerun never resets a live market.
    $db->prepare('INSERT IGNORE INTO arena_market (id, tick, tick_ms, seed) VALUES (1, 0, ?, ?)')
        ->execute([(int) floor(microtime(true) * 1000), random_int(1, 2147483647)]);
    $coin = $db->prepare('INSERT IGNORE INTO arena_coins (id, name, reserve_l, reserve_c, fair, ema_fast, ema_slow, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    foreach (ARENA_COINS as $id => $c) {
        $coin->execute([$id, $c['name'], $c['liquidity'], $c['liquidity'] / $c['price'], $c['price'], $c['price'], $c['price'], $c['sort']]);
    }
    echo 'seeded  market and ' . count(ARENA_COINS) . ' coins (existing rows kept)' . PHP_EOL;
    echo 'Migration complete.' . PHP_EOL;
} catch (Throwable $e) {
    // The message names the failing step, never the credentials.
    fwrite(STDERR, 'Migration failed: ' . get_class($e) . ' ' . $e->getCode() . ': ' . preg_replace('/\'[^\']*\'@\'[^\']*\'/', '<user>', $e->getMessage()) . PHP_EOL);
    exit(1);
}
