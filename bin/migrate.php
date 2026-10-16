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
        approved_at DATETIME NULL,
        arena_ok TINYINT(1) NOT NULL DEFAULT 0,
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
    // Optional accounts (BRIEF §16) reuse arena_users and arena_sessions; these add saving across devices and the
    // parent link. Deleting a user removes all of it (ON DELETE CASCADE).
    'account_state' => "CREATE TABLE IF NOT EXISTS account_state (
        user_id INT UNSIGNED NOT NULL PRIMARY KEY,
        state MEDIUMTEXT NOT NULL,
        updated_at BIGINT UNSIGNED NOT NULL,
        CONSTRAINT fk_account_state_user FOREIGN KEY (user_id) REFERENCES arena_users (id) ON DELETE CASCADE
    ) " . ENGINE,
    'parent_links' => "CREATE TABLE IF NOT EXISTS parent_links (
        token_hash CHAR(64) NOT NULL PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY ix_parent_links_user (user_id),
        CONSTRAINT fk_parent_links_user FOREIGN KEY (user_id) REFERENCES arena_users (id) ON DELETE CASCADE
    ) " . ENGINE,
    'piggy_confirmations' => "CREATE TABLE IF NOT EXISTS piggy_confirmations (
        user_id INT UNSIGNED NOT NULL,
        entry_id VARCHAR(40) NOT NULL,
        confirmed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, entry_id),
        CONSTRAINT fk_piggy_confirmations_user FOREIGN KEY (user_id) REFERENCES arena_users (id) ON DELETE CASCADE
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
    // Arena v2 (BRIEF §17): AI or templated headlines, soulbound season medals and burned L$ per day.
    'arena_news' => "CREATE TABLE IF NOT EXISTS arena_news (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        at INT UNSIGNED NOT NULL,
        text VARCHAR(240) NOT NULL,
        source VARCHAR(8) NOT NULL,
        KEY ix_arena_news_at (at)
    ) " . ENGINE,
    // One row per medal, minted once per day and rank (the primary key), never transferable, history kept.
    'arena_medals' => "CREATE TABLE IF NOT EXISTS arena_medals (
        day CHAR(10) NOT NULL,
        `rank` TINYINT UNSIGNED NOT NULL,
        user_id INT UNSIGNED NOT NULL,
        value DECIMAL(24,8) NOT NULL,
        hash CHAR(64) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (day, `rank`),
        KEY ix_arena_medals_user (user_id),
        CONSTRAINT fk_arena_medals_user FOREIGN KEY (user_id) REFERENCES arena_users (id) ON DELETE CASCADE
    ) " . ENGINE,
    'arena_burns' => "CREATE TABLE IF NOT EXISTS arena_burns (
        day CHAR(10) NOT NULL,
        kind VARCHAR(12) NOT NULL,
        amount_l DECIMAL(24,8) NOT NULL DEFAULT 0,
        PRIMARY KEY (day, kind)
    ) " . ENGINE,
];

// Columns added after a table first shipped go here as [table, column, definition, backfill SQL or null]. Each is
// added only if missing, and its backfill runs only in that same run, so a rerun never touches newer rows.
$columns = [
    // Under-13 accounts wait for a parent (BRIEF §16, Y14). Accounts made before this existed count as approved.
    ['arena_users', 'approved_at', 'DATETIME NULL', 'UPDATE arena_users SET approved_at = created_at WHERE approved_at IS NULL'],
    // Set once a 13–19-year-old has qualified for the Arena, so polls don't re-read their saved progress.
    ['arena_users', 'arena_ok', 'TINYINT(1) NOT NULL DEFAULT 0', null],
    // Arena v2 (BRIEF §17). Player-launched coins live in arena_coins next to the four house coins.
    ['arena_coins', 'launched', 'TINYINT(1) NOT NULL DEFAULT 0', null],
    ['arena_coins', 'icon', "VARCHAR(16) NOT NULL DEFAULT ''", null],
    ['arena_coins', 'color', "VARCHAR(16) NOT NULL DEFAULT ''", null],
    ['arena_coins', 'creator_id', 'INT UNSIGNED NULL', null],
    ['arena_coins', 'supply', 'DECIMAL(24,8) NOT NULL DEFAULT 0', null],
    ['arena_coins', 'community', 'DECIMAL(24,8) NOT NULL DEFAULT 0', null],
    ['arena_coins', 'creator_start', 'DECIMAL(24,8) NOT NULL DEFAULT 0', null],
    ['arena_coins', 'creator_locked', 'DECIMAL(24,8) NOT NULL DEFAULT 0', null],
    ['arena_coins', 'creator_sold', 'DECIMAL(24,8) NOT NULL DEFAULT 0', null],
    ['arena_coins', 'lock_until', 'INT UNSIGNED NOT NULL DEFAULT 0', null],
    ['arena_coins', 'vest_until', 'INT UNSIGNED NOT NULL DEFAULT 0', null],
    ['arena_coins', 'created_s', 'INT UNSIGNED NOT NULL DEFAULT 0', null],
    ['arena_coins', 'created_tick', 'BIGINT UNSIGNED NOT NULL DEFAULT 0', null],
    ['arena_coins', 'peak', 'DECIMAL(24,8) NOT NULL DEFAULT 0', null],
    ['arena_coins', 'rugged', 'TINYINT(1) NOT NULL DEFAULT 0', null],
    ['arena_coins', 'ape', 'DECIMAL(24,8) NOT NULL DEFAULT 0', null],
    ['arena_users', 'is_demo', 'TINYINT(1) NOT NULL DEFAULT 0', null],
    ['arena_users', 'demo_expires_at', 'DATETIME NULL', null],
    ['arena_users', 'pro_until', 'INT UNSIGNED NOT NULL DEFAULT 0', null],
    ['arena_users', 'stipend_day', 'CHAR(10) NULL', null],
    // Active = traded or got a stipend in the last 7 days; existing players start from their last trade.
    ['arena_users', 'last_active_at', 'DATETIME NULL', 'UPDATE arena_users u SET last_active_at = (SELECT MAX(t.created_at) FROM arena_trades t WHERE t.user_id = u.id)'],
    ['arena_users', 'transfer_day', 'CHAR(10) NULL', null],
    ['arena_users', 'transfer_today', 'DECIMAL(24,8) NOT NULL DEFAULT 0', null],
    ['arena_market', 'season_day', 'CHAR(10) NULL', null],
    ['arena_market', 'news_at', 'INT UNSIGNED NOT NULL DEFAULT 0', null],
    ['arena_trades', 'kind', "VARCHAR(8) NOT NULL DEFAULT 'trade'", null],
];

try {
    $db = db();
    $existing = array_map('strtolower', $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN));
    foreach ($tables as $name => $sql) {
        $db->exec($sql);
        echo (in_array($name, $existing, true) ? 'exists  ' : 'created ') . $name . PHP_EOL;
    }
    foreach ($columns as [$table, $column, $definition, $backfill]) {
        $has = $db->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
        $has->execute([$table, $column]);
        if (!(int) $has->fetchColumn()) {
            $db->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
            if ($backfill) {
                $db->exec($backfill);
            }
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
    // House coins: supply is their pool, peak starts at today's price. Only rows still at 0 are touched.
    $db->exec('UPDATE arena_coins SET supply = reserve_c WHERE supply = 0 AND launched = 0');
    $db->exec('UPDATE arena_coins SET peak = reserve_l / reserve_c WHERE peak = 0');
    echo 'seeded  market and ' . count(ARENA_COINS) . ' coins (existing rows kept)' . PHP_EOL;
    echo 'Migration complete.' . PHP_EOL;
} catch (Throwable $e) {
    // The message names the failing step, never the credentials.
    fwrite(STDERR, 'Migration failed: ' . get_class($e) . ' ' . $e->getCode() . ': ' . preg_replace('/\'[^\']*\'@\'[^\']*\'/', '<user>', $e->getMessage()) . PHP_EOL);
    exit(1);
}
