<?php
// Arena API (BRIEF §15, §16, §17): the shared live market. Off unless ARENA_ENABLED=1. Accounts, log-in and the safety
// quiz live in api/account.php (src/accounts.php); trading needs a signed-in account aged 13 or over. Anyone may watch.
//   GET  ?action=status                         -> {enabled, v2}
//   GET  ?action=state&coin=VAULT               -> prices, candles, trades, news, season, supply, your portfolio (or null)
//   GET  ?action=supply                         -> Arena L$ in players' hands, burns, stipend
//   POST ?action=trade    {coin, side, amount}   (X-CSRF-Token). amount = L$ to spend, or coins to sell
//   POST ?action=launch   {name, ticker, icon, color, supply, alloc:{creator, community, liquidity}, liquidityL, lockDays, vestDays}
//   POST ?action=transfer {amount}               Town -> Arena, at most 200 L$ per Bangkok day
//   POST ?action=pro                             Penny Pro for 7 days, 150 L$ of Arena cash (burned)
// launch, transfer, pro and supply need the v2 schema (bin/migrate.php) and answer 503 V2_OFF without it.
declare(strict_types=1);

require dirname(__DIR__, 2) . '/src/bootstrap.php';
require REPO_ROOT . '/src/db.php';
require REPO_ROOT . '/src/arena.php';
require REPO_ROOT . '/src/arena_v2.php';
require REPO_ROOT . '/src/accounts.php';

const MIN_AGE = 13;
const ADULT_AGE = 20;

$action = is_string($_GET['action'] ?? null) ? $_GET['action'] : '';
if ($action === 'status') {
    require_method('GET');
    $on = arena_on();
    send_json(['ok' => true, 'enabled' => $on, 'v2' => $on && arena_v2_ready()]);
}
if (!arena_on()) {
    send_error(404, 'ARENA_OFF', 'The Arena is closed right now.');
}
if (in_array($action, ['launch', 'transfer', 'pro', 'supply'], true) && !arena_v2_ready()) {
    send_error(503, 'V2_OFF', 'This part of the Arena is still being set up. Trading works as usual.');
}

switch ($action) {
    case 'state':
        require_method('GET');
        rate_limit('arena-read', 120, 60);
        $db = db();
        $v2 = arena_v2_ready();
        if ($v2 && random_int(1, 20) === 1) {
            arena_purge_demos($db);
        }
        $user = current_user($db);
        $reason = $user === null ? 'NO_ACCOUNT' : arena_block_reason($db, $user);
        $userId = $user === null ? 0 : (int) $user['user_id'];
        $db->beginTransaction();
        try {
            arena_advance($db);
            if ($v2) {
                arena_season($db);
            }
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
        $stipend = $v2 && $reason === null ? arena_pay_stipend($db, $userId) : 0.0;
        arena_news_after_response();
        send_json(['ok' => true] + state($db, $userId, coin_param($db, $_GET['coin'] ?? 'VAULT'), $reason) + ['stipendPaid' => $stipend]);
    case 'supply':
        require_method('GET');
        rate_limit('arena-read', 120, 60);
        send_json(['ok' => true] + arena_supply(db()));
    case 'trade':
        require_method('POST');
        $user = arena_user(db(), true);
        rate_limit('arena-trade', 30, 60);
        trade(db(), (int) $user['user_id'], read_json());
    case 'launch':
        require_method('POST');
        $user = arena_user(db(), true);
        $spec = arena_launch_input(read_json());
        rate_limit('arena-launch', ARENA_LAUNCHES_PER_HOUR, 3600, 'launch:' . $user['user_id']);
        $db = db();
        $coin = arena_launch($db, (int) $user['user_id'], $spec);
        arena_news_after_response();
        send_json(['ok' => true, 'coin' => $coin] + state($db, (int) $user['user_id'], $coin['id'], null));
    case 'transfer':
        require_method('POST');
        $user = arena_user(db(), true);
        rate_limit('arena-transfer', 20, 60);
        send_json(['ok' => true] + arena_transfer(db(), (int) $user['user_id'], read_json()));
    case 'pro':
        require_method('POST');
        $user = arena_user(db(), true);
        rate_limit('arena-pro', 10, 60);
        send_json(['ok' => true] + arena_buy_pro(db(), (int) $user['user_id']));
    default:
        send_error(404, 'NOT_FOUND', 'Unknown Arena action.');
}

// Open only when switched on and the database matches this code (see accounts_ready()).
function arena_on(): bool
{
    if (env('ARENA_ENABLED') !== '1' || !accounts_ready()) {
        return false;
    }
    try {
        db()->query('SELECT 1 FROM arena_market, arena_coins, arena_holdings, arena_trades, arena_candles LIMIT 0');
        return true;
    } catch (Throwable) {
        return false;
    }
}

// Why this signed-in account may not trade yet, or null when it may. Every age decision uses the birth year stored
// with the account, never the browser's: 13+ to enter at all, and 20+ to skip the score gate. A 13–19-year-old must
// have qualified in their saved progress: the Unit 2 checkpoint passed, or a Money Health Score of 70+ that the app
// recorded.
function arena_block_reason(PDO $db, array $user): ?string
{
    $age = age_of($user);
    if ($age < MIN_AGE) {
        return 'TOO_YOUNG';
    }
    if ($age < ADULT_AGE && !(int) $user['arena_ok']) {
        if (!arena_qualified($db, (int) $user['user_id'])) {
            return 'NOT_QUALIFIED';
        }
        $db->prepare('UPDATE arena_users SET arena_ok = 1 WHERE id = ?')->execute([$user['user_id']]);
    }
    return null;
}

// A signed-in account that may trade, or an error answer.
function arena_user(PDO $db, bool $change): array
{
    $user = require_user($db, $change);
    $reason = arena_block_reason($db, $user);
    if ($reason === 'TOO_YOUNG') {
        send_error(403, 'TOO_YOUNG', 'The Arena opens at age 13. Keep practising in the Market Lab!');
    }
    if ($reason === 'NOT_QUALIFIED') {
        send_error(403, 'NOT_QUALIFIED', 'Kids unlock the Arena at a Money Health Score of 70 in the Market Lab, or by passing the Unit 2 checkpoint at School.');
    }
    return $user;
}

function arena_qualified(PDO $db, int $userId): bool
{
    $st = $db->prepare('SELECT state FROM account_state WHERE user_id = ?');
    $st->execute([$userId]);
    $s = json_decode((string) $st->fetchColumn(), true);
    if (!is_array($s)) {
        return false;
    }
    foreach (['trader', 'builder'] as $tier) {
        if (!empty($s['path'][$tier]['done']['u2-c'])) {
            return true;
        }
    }
    return is_array($s['arenaPass'] ?? null) && (int) ($s['arenaPass']['score'] ?? 0) >= 70;
}

// A house coin, or a launched coin that exists; VAULT otherwise.
function coin_param(PDO $db, mixed $value): string
{
    $id = is_string($value) ? strtoupper($value) : '';
    if (isset(ARENA_COINS[$id])) {
        return $id;
    }
    if (arena_v2_ready() && preg_match('/^[A-Z]{3,6}$/', $id)) {
        $st = $db->prepare('SELECT 1 FROM arena_coins WHERE id = ? AND launched = 1');
        $st->execute([$id]);
        if ($st->fetchColumn()) {
            return $id;
        }
    }
    return 'VAULT';
}

function trade(PDO $db, int $userId, array $in): never
{
    $coin = coin_param($db, $in['coin'] ?? '');
    // Never fall back to VAULT for a trade: a delisted or mistyped coin is an error, not a different coin.
    if (!is_string($in['coin'] ?? null) || strtoupper($in['coin']) !== $coin) {
        send_error(400, 'BAD_INPUT', 'That coin isn’t trading right now.');
    }
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
        if (!isset($market['coins'][$coin])) {
            $db->rollBack();
            send_error(400, 'BAD_INPUT', 'That coin isn’t trading right now.');
        }
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
    send_json(['ok' => true, 'trade' => $result + ['coin' => $coin]] + state($db, $userId, $coin, null));
}

// Everything the Arena screen shows, read after the tick has been saved. $userId 0 = spectating.
function state(PDO $db, int $userId, string $coin, ?string $reason): array
{
    $v2 = arena_v2_ready();
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
    $sql = $v2
        ? 'SELECT c.*, u.username AS creator FROM arena_coins c LEFT JOIN arena_users u ON u.id = c.creator_id ORDER BY c.sort, c.created_s DESC'
        : 'SELECT id, name, reserve_l, reserve_c FROM arena_coins ORDER BY sort';
    $flags = $v2 ? arena_flag_inputs($db, $tick) : [];
    foreach ($db->query($sql) as $row) {
        if (!$v2 && !isset(ARENA_COINS[$row['id']])) {
            continue;
        }
        $price = (float) $row['reserve_l'] / (float) $row['reserve_c'];
        $prices[$row['id']] = $price;
        $coin_row = [
            'id' => $row['id'],
            'name' => $row['name'],
            'price' => $price,
            'changePct' => isset($first[$row['id']]) && $first[$row['id']] > 0 ? ($price / $first[$row['id']] - 1) * 100 : 0,
            'reserveL' => (float) $row['reserve_l'],
            'reserveCoins' => (float) $row['reserve_c'],
            'wash' => ARENA_COINS[$row['id']]['wash'] ?? false,
        ];
        $coins[] = $coin_row + ($v2 ? arena_coin_extra($row, $flags) : [
            'launched' => false, 'icon' => null, 'color' => null, 'creator' => null, 'creatorPct' => 0, 'lpLocked' => true, 'lockUntil' => 0, 'vestUntil' => 0,
            'redFlags' => ['score' => !empty($coin_row['wash']) ? 15 : 0, 'reasons' => !empty($coin_row['wash']) ? [ARENA_FLAG_TEXT['wash']] : []], 'rugged' => false, 'supply' => (float) $row['reserve_c'],
        ]);
    }
    if (!isset($prices[$coin])) {
        $coin = 'VAULT';
    }

    $st = $db->prepare('SELECT bucket, open, high, low, close, volume, wash_volume FROM arena_candles WHERE coin_id = ? AND bucket >= ? ORDER BY bucket');
    $st->execute([$coin, $since]);
    $candles = array_map(static fn(array $r): array => [
        't' => (int) $r['bucket'] * ARENA_CANDLE_TICKS,
        'open' => (float) $r['open'], 'high' => (float) $r['high'], 'low' => (float) $r['low'], 'close' => (float) $r['close'],
        'volume' => (float) $r['volume'], 'washVolume' => (float) $r['wash_volume'],
    ], $st->fetchAll());

    // Players' trades, launches, rugs and the bots worth watching; Maya's and Wendy's steady flow shows in the volume.
    $sql = $v2
        ? "SELECT t.id, t.coin_id, t.side, t.coins, t.amount_l, t.price, t.bot, t.kind, u.username FROM arena_trades t LEFT JOIN arena_users u ON u.id = t.user_id
           WHERE t.user_id IS NOT NULL OR t.kind <> 'trade' OR t.bot IN ('whale', 'momentum', 'panic', 'ape', 'demo') ORDER BY t.id DESC LIMIT 16"
        : "SELECT t.id, t.coin_id, t.side, t.coins, t.amount_l, t.price, t.bot, 'trade' AS kind, u.username FROM arena_trades t LEFT JOIN arena_users u ON u.id = t.user_id
           WHERE t.user_id IS NOT NULL OR t.bot IN ('whale', 'momentum') ORDER BY t.id DESC LIMIT 12";
    $trades = array_map(static fn(array $r): array => [
        'id' => (int) $r['id'], 'coin' => $r['coin_id'], 'side' => $r['side'], 'coins' => (float) $r['coins'], 'amountL' => (float) $r['amount_l'],
        'price' => (float) $r['price'],
        'who' => $r['username'] ?? (ARENA_PERSONAS[$r['bot'] ?? ''] ?? $r['bot'] ?? 'the creator'),
        'bot' => $r['username'] === null && $r['bot'] !== null && $r['bot'] !== 'demo',
        'persona' => $r['username'] === null ? (ARENA_PERSONAS[$r['bot'] ?? ''] ?? null) : null,
        'kind' => $r['kind'],
    ], $db->query($sql)->fetchAll());

    // Ranked: approved accounts aged 13+ (stored birth year) that have traded here. Accounts made only to save progress,
    // and children under 13, never appear. Demo accounts appear, flagged.
    $leaders = [];
    $mine = null;
    $st = $db->prepare(
        'SELECT u.id, u.username, ' . ($v2 ? 'u.is_demo' : '0') . ' AS demo, u.cash + COALESCE(SUM(h.amount * c.reserve_l / c.reserve_c), 0) AS value FROM arena_users u
         LEFT JOIN arena_holdings h ON h.user_id = u.id LEFT JOIN arena_coins c ON c.id = h.coin_id
         WHERE u.approved_at IS NOT NULL AND u.birth_year <= ? AND EXISTS (SELECT 1 FROM arena_trades t WHERE t.user_id = u.id)
         GROUP BY u.id, u.username, u.cash' . ($v2 ? ', u.is_demo' : '') . ' ORDER BY value DESC, u.id ASC LIMIT 1000'
    );
    $st->execute([bangkok_year() - MIN_AGE]);
    foreach ($st->fetchAll() as $i => $r) {
        $row = ['rank' => $i + 1, 'username' => $r['username'], 'value' => (float) $r['value'], 'demo' => (bool) $r['demo']];
        if ($i < 10) {
            $leaders[] = $row;
        }
        if ((int) $r['id'] === $userId) {
            $mine = $row;
        }
    }

    return [
        'tick' => $tick,
        'coin' => $coin,
        'coins' => $coins,
        'candles' => $candles,
        'trades' => $trades,
        'me' => $userId > 0 ? arena_me($db, $userId, $prices) : null,
        'canTrade' => $userId > 0 && $reason === null,
        'reason' => $userId > 0 ? $reason : 'NO_ACCOUNT',
        'leaderboard' => $leaders,
        'myRank' => $mine,
        'news' => $v2 ? arena_news_list($db, $userId > 0 && arena_is_pro($db, $userId)) : [],
        'season' => $v2 ? arena_season_info($db) : null,
        'supply' => $v2 ? arena_supply($db) : null,
    ];
}

function arena_me(PDO $db, int $userId, array $prices): array
{
    $v2 = arena_v2_ready();
    $st = $db->prepare($v2 ? 'SELECT username, cash, is_demo, pro_until, transfer_day, transfer_today FROM arena_users WHERE id = ?' : 'SELECT username, cash FROM arena_users WHERE id = ?');
    $st->execute([$userId]);
    $u = $st->fetch() ?: ['username' => '', 'cash' => 0];
    $cash = (float) $u['cash'];
    $st = $db->prepare('SELECT coin_id, amount FROM arena_holdings WHERE user_id = ? AND amount > 0');
    $st->execute([$userId]);
    $holdings = [];
    $value = $cash;
    foreach ($st as $row) {
        $v = (float) $row['amount'] * ($prices[$row['coin_id']] ?? 0);
        $holdings[] = ['coin' => $row['coin_id'], 'coins' => (float) $row['amount'], 'value' => $v];
        $value += $v;
    }
    $proUntil = (int) ($u['pro_until'] ?? 0);
    $medals = [];
    if ($v2) {
        $st = $db->prepare('SELECT day, `rank`, hash FROM arena_medals WHERE user_id = ? ORDER BY day DESC, `rank` LIMIT 50');
        $st->execute([$userId]);
        $medals = array_map(static fn(array $m): array => ['day' => $m['day'], 'rank' => (int) $m['rank'], 'hash' => $m['hash']], $st->fetchAll());
    }
    return [
        'cash' => $cash, 'holdings' => $holdings, 'value' => $value, 'startValue' => ARENA_START_CASH,
        'username' => $u['username'], 'demo' => (bool) ($u['is_demo'] ?? false),
        'pro' => $proUntil > time(), 'proUntil' => $proUntil,
        'transferredToday' => ($u['transfer_day'] ?? null) === arena_day() ? (float) $u['transfer_today'] : 0.0,
        'transferCap' => ARENA_TRANSFER_CAP,
        'medals' => $medals,
    ];
}
