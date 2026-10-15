<?php
// Arena API (BRIEF §15, §16): the shared live market. Off unless ARENA_ENABLED=1. Accounts, log-in and the safety
// quiz live in api/account.php (src/accounts.php); the Arena needs a signed-in account aged 13 or over.
//   GET  ?action=status                         -> {enabled}
//   GET  ?action=state&coin=VAULT               -> prices, candles, trades, your portfolio, leaderboard
//   POST ?action=trade  {coin, side, amount}     (X-CSRF-Token). amount = L$ to spend, or coins to sell
declare(strict_types=1);

require dirname(__DIR__, 2) . '/src/bootstrap.php';
require REPO_ROOT . '/src/db.php';
require REPO_ROOT . '/src/arena.php';
require REPO_ROOT . '/src/accounts.php';

const MIN_AGE = 13;

$action = is_string($_GET['action'] ?? null) ? $_GET['action'] : '';
if ($action === 'status') {
    require_method('GET');
    send_json(['ok' => true, 'enabled' => arena_on()]);
}
if (!arena_on()) {
    send_error(404, 'ARENA_OFF', 'The Arena is closed right now.');
}

switch ($action) {
    case 'state':
        require_method('GET');
        rate_limit('arena-read', 120, 60);
        $user = arena_user(db(), false);
        $db = db();
        $db->beginTransaction();
        arena_advance($db);
        $db->commit();
        send_json(['ok' => true] + state($db, (int) $user['user_id'], coin_param($_GET['coin'] ?? 'VAULT')));
    case 'trade':
        require_method('POST');
        $user = arena_user(db(), true);
        rate_limit('arena-trade', 30, 60);
        trade(db(), (int) $user['user_id'], read_json());
    default:
        send_error(404, 'NOT_FOUND', 'Unknown Arena action.');
}

function arena_on(): bool
{
    return env('ARENA_ENABLED') === '1';
}

// A signed-in account, 13 or older by its birth year (checked here, not just in the app).
function arena_user(PDO $db, bool $change): array
{
    $user = require_user($db, $change);
    if (age_of($user) < MIN_AGE) {
        send_error(403, 'TOO_YOUNG', 'The Arena opens at age 13. Keep practising in the Market Lab!');
    }
    return $user;
}

function coin_param(mixed $value): string
{
    $id = is_string($value) ? strtoupper($value) : '';
    return isset(ARENA_COINS[$id]) ? $id : 'VAULT';
}

function trade(PDO $db, int $userId, array $in): never
{
    $coin = coin_param($in['coin'] ?? '');
    $side = $in['side'] ?? '';
    $amount = $in['amount'] ?? null;
    if (!in_array($side, ['buy', 'sell'], true) || !(is_int($amount) || is_float($amount)) || $amount <= 0 || !is_finite((float) $amount)) {
        send_error(400, 'BAD_INPUT', 'Choose buy or sell and an amount above zero.');
    }
    if ($side === 'buy' && $amount < 1) {
        send_error(400, 'BAD_INPUT', 'Spend at least L$1.');
    }
    $db->beginTransaction();
    try {
        $market = arena_advance($db);
        $result = arena_player_trade($db, $market, $userId, $coin, $side, (float) $amount);
        if (isset($result['error'])) {
            $db->rollBack();
            send_error(400, 'NOT_ENOUGH', $result['error']);
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
    send_json(['ok' => true, 'trade' => $result + ['coin' => $coin]] + state($db, $userId, $coin));
}

// Everything the Arena screen shows, read after the tick has been saved.
function state(PDO $db, int $userId, string $coin): array
{
    $tick = (int) $db->query('SELECT tick FROM arena_market WHERE id = 1')->fetchColumn();
    $since = intdiv(max(0, $tick - 600), ARENA_CANDLE_TICKS);

    $first = [];
    $st = $db->prepare('SELECT c.coin_id, c.open FROM arena_candles c JOIN (SELECT coin_id, MIN(bucket) AS b FROM arena_candles WHERE bucket >= ? GROUP BY coin_id) x ON x.coin_id = c.coin_id AND x.b = c.bucket');
    $st->execute([$since]);
    foreach ($st as $row) {
        $first[$row['coin_id']] = (float) $row['open'];
    }
    $coins = [];
    $prices = [];
    foreach ($db->query('SELECT id, name, reserve_l, reserve_c FROM arena_coins ORDER BY sort') as $row) {
        $price = (float) $row['reserve_l'] / (float) $row['reserve_c'];
        $prices[$row['id']] = $price;
        $coins[] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'price' => $price,
            'changePct' => isset($first[$row['id']]) && $first[$row['id']] > 0 ? ($price / $first[$row['id']] - 1) * 100 : 0,
            'reserveL' => (float) $row['reserve_l'],
            'reserveCoins' => (float) $row['reserve_c'],
            'wash' => ARENA_COINS[$row['id']]['wash'] ?? false,
        ];
    }

    $st = $db->prepare('SELECT bucket, open, high, low, close, volume, wash_volume FROM arena_candles WHERE coin_id = ? AND bucket >= ? ORDER BY bucket');
    $st->execute([$coin, $since]);
    $candles = array_map(static fn(array $r): array => [
        't' => (int) $r['bucket'] * ARENA_CANDLE_TICKS,
        'open' => (float) $r['open'], 'high' => (float) $r['high'], 'low' => (float) $r['low'], 'close' => (float) $r['close'],
        'volume' => (float) $r['volume'], 'washVolume' => (float) $r['wash_volume'],
    ], $st->fetchAll());

    // Players' trades and the bots worth watching; the market maker's and wash bot's steady flow shows in the volume.
    $trades = array_map(static fn(array $r): array => [
        'id' => (int) $r['id'], 'coin' => $r['coin_id'], 'side' => $r['side'], 'coins' => (float) $r['coins'], 'amountL' => (float) $r['amount_l'],
        'price' => (float) $r['price'], 'who' => $r['username'] ?? $r['bot'], 'bot' => $r['username'] === null,
    ], $db->query("SELECT t.id, t.coin_id, t.side, t.coins, t.amount_l, t.price, t.bot, u.username FROM arena_trades t LEFT JOIN arena_users u ON u.id = t.user_id WHERE t.user_id IS NOT NULL OR t.bot IN ('whale', 'momentum') ORDER BY t.id DESC LIMIT 12")->fetchAll());

    $st = $db->prepare('SELECT cash FROM arena_users WHERE id = ?');
    $st->execute([$userId]);
    $cash = (float) $st->fetchColumn();
    $st = $db->prepare('SELECT coin_id, amount FROM arena_holdings WHERE user_id = ? AND amount > 0');
    $st->execute([$userId]);
    $holdings = [];
    $value = $cash;
    foreach ($st as $row) {
        $v = (float) $row['amount'] * ($prices[$row['coin_id']] ?? 0);
        $holdings[] = ['coin' => $row['coin_id'], 'coins' => (float) $row['amount'], 'value' => $v];
        $value += $v;
    }

    $leaders = [];
    $rows = $db->query(
        'SELECT u.username, u.cash + COALESCE(SUM(h.amount * c.reserve_l / c.reserve_c), 0) AS value FROM arena_users u
         LEFT JOIN arena_holdings h ON h.user_id = u.id LEFT JOIN arena_coins c ON c.id = h.coin_id
         GROUP BY u.id, u.username, u.cash ORDER BY value DESC, u.id ASC LIMIT 10'
    )->fetchAll();
    foreach ($rows as $i => $r) {
        $leaders[] = ['rank' => $i + 1, 'username' => $r['username'], 'value' => (float) $r['value']];
    }

    return [
        'tick' => $tick,
        'coin' => $coin,
        'coins' => $coins,
        'candles' => $candles,
        'trades' => $trades,
        'me' => ['cash' => $cash, 'holdings' => $holdings, 'value' => $value, 'startValue' => ARENA_START_CASH],
        'leaderboard' => $leaders,
    ];
}
