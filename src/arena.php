<?php
// Arena market engine (BRIEF §15, §17): one shared constant-product pool per coin, kept on the server.
// Time moves lazily: each request locks the market row, plays every whole tick since the last one (bots included),
// saves the result and only then serves the request. Simulated L$ only; nothing here touches real money.
// Arena v2 (player-launched coins, burns, stipend, news, seasons, demo accounts) switches on only when
// arena_v2_ready() finds its tables and columns; until then everything here behaves as v1.
declare(strict_types=1);

const ARENA_TICK_MS = 1000;      // one market tick per second
const ARENA_CANDLE_TICKS = 10;   // 10-second candles
const ARENA_MAX_CATCHUP = 90;    // after a quiet spell, play at most 90 s and jump to now
const ARENA_FEE = 0.003;         // 0.3% swap fee, taken from the L$ side and burned (BRIEF §17)
const ARENA_START_CASH = 1000.0;
const ARENA_KEEP_TICKS = 7200;   // trades and candles older than 2 hours are pruned

// Economy (BRIEF §17). These must match ECONOMY.arena in public/assets/js/config.js.
const ARENA_LISTING_FEE = 500.0;        // burned when a player launches a coin
const ARENA_MIN_LIQUIDITY = 100.0;      // L$ a creator must put in the pool
const ARENA_PRO_PRICE = 150.0;          // Penny Pro, burned
const ARENA_PRO_DAYS = 7;
const ARENA_TRANSFER_CAP = 200.0;       // Town -> Arena, per account per Bangkok day
const ARENA_STIPEND = 100.0;            // per active player per Bangkok day...
const ARENA_STIPEND_FULL_BELOW = 2000.0; // ...in full while Arena L$ per active player is at most this,
const ARENA_STIPEND_ZERO_AT = 5000.0;   // ...falling linearly to 0 here
const ARENA_ACTIVE_DAYS = 7;            // active = traded or got a stipend in the last 7 days
const ARENA_MAX_LAUNCHED = 30;          // live player coins at once
const ARENA_NEWS_EVERY = 180;           // at most one headline every 3 minutes
const ARENA_NEWS_DELAY = 30;            // Penny Pro sees headlines this many seconds earlier
const ARENA_DEMO_CASH = 1000.0;

// sigma: how far the market maker's fair value wanders per tick. wash: a wash-trading bot works this coin.
const ARENA_COINS = [
    'VAULT' => ['name' => 'Vault', 'price' => 120.0, 'liquidity' => 150000.0, 'sigma' => 0.0015, 'wash' => false, 'sort' => 1],
    'FUEL' => ['name' => 'Fuel', 'price' => 4.0, 'liquidity' => 60000.0, 'sigma' => 0.002, 'wash' => true, 'sort' => 2],
    'ZOOMZ' => ['name' => 'Zoomz', 'price' => 0.05, 'liquidity' => 20000.0, 'sigma' => 0.005, 'wash' => false, 'sort' => 3],
    'PEG' => ['name' => 'Peg', 'price' => 1.0, 'liquidity' => 200000.0, 'sigma' => 0.0, 'wash' => false, 'sort' => 4],
];
// Player-launched coins: no fair value to defend, so the market maker only adds small two-sided flow.
const ARENA_LAUNCHED_CFG = ['sigma' => 0.0, 'wash' => false, 'launched' => true];

// Bot keys (stored in arena_trades.bot) and the made-up characters the feed shows. Never real people.
const ARENA_PERSONAS = [
    'market maker' => 'Maya the Market Maker',
    'momentum' => 'Mo Momentum',
    'whale' => 'Big Wally',
    'wash bot' => 'Wash Wendy',
    'panic' => 'Panic Pete',
    'ape' => 'Ape Annie',
    'demo' => 'A demo player',
];

// v2 needs these tables and columns (bin/migrate.php). One LIMIT 0 query names them all, as accounts_ready() does.
function arena_v2_ready(): bool
{
    static $ready = null;
    if ($ready !== null) {
        return $ready;
    }
    try {
        db()->query('SELECT c.launched, c.icon, c.color, c.creator_id, c.supply, c.community, c.creator_start, c.creator_locked, c.creator_sold,
            c.lock_until, c.vest_until, c.created_s, c.created_tick, c.peak, c.rugged, c.ape,
            u.is_demo, u.demo_expires_at, u.pro_until, u.stipend_day, u.last_active_at, u.transfer_day, u.transfer_today,
            m.season_day, m.news_at, t.kind, n.text, md.hash, b.amount_l
            FROM arena_coins c, arena_users u, arena_market m, arena_trades t, arena_news n, arena_medals md, arena_burns b LIMIT 0');
        return $ready = true;
    } catch (Throwable) {
        return $ready = false;
    }
}

function arena_day(?int $ts = null): string
{
    return (new DateTimeImmutable('@' . ($ts ?? time())))->setTimezone(new DateTimeZone('Asia/Bangkok'))->format('Y-m-d');
}

// Deterministic randomness in [0, 1) from the market seed, the tick and a label.
function arena_rand(int $seed, int $tick, string $label): float
{
    return hexdec(substr(hash('sha256', "$seed:$tick:$label"), 0, 8)) / 4294967296;
}

function arena_price(array $c): float
{
    return $c['rl'] / $c['rc'];
}

// Spend $l L$ on coins. The fee comes off the L$ side and is burned (left in $c['fee']). Returns the coins received.
function arena_buy(array &$c, float $l): float
{
    $fee = $l * ARENA_FEE;
    $in = $l - $fee;
    $out = $c['rc'] * $in / ($c['rl'] + $in);
    $c['rl'] += $in;
    $c['rc'] -= $out;
    $c['fee'] = $fee;
    return $out;
}

// Sell $q coins. The fee comes off the L$ paid out and is burned. Returns the L$ received.
function arena_sell(array &$c, float $q): float
{
    $gross = $c['rl'] * $q / ($c['rc'] + $q);
    $fee = $gross * ARENA_FEE;
    $c['rc'] += $q;
    $c['rl'] -= $gross;
    $c['fee'] = $fee;
    return $gross - $fee;
}

// Adds a trade to the write buffer and folds it into its candle.
function arena_record(array &$book, string $id, array $c, int $tick, ?int $userId, ?string $bot, string $side, float $coins, float $l, float $before, bool $wash, string $kind = 'trade'): void
{
    $after = arena_price($c);
    $book['trades'][] = [$tick, $id, $userId, $bot, $side, $coins, $l, $after, $wash ? 1 : 0, $kind];
    if ($kind !== 'trade') {
        return;
    }
    $bucket = intdiv($tick, ARENA_CANDLE_TICKS);
    $k = "$id:$bucket";
    if (!isset($book['candles'][$k])) {
        $book['candles'][$k] = [$id, $bucket, $before, max($before, $after), min($before, $after), $after, 0.0, 0.0];
    }
    $cd = &$book['candles'][$k];
    $cd[3] = max($cd[3], $after);
    $cd[4] = min($cd[4], $after);
    $cd[5] = $after;
    $cd[6] += $l;
    if ($wash) {
        $cd[7] += $l;
    }
}

// One tick of the bots on one coin.
function arena_bots(array &$c, string $id, int $tick, int $seed, array &$book): void
{
    $cfg = ARENA_COINS[$id] ?? ARENA_LAUNCHED_CFG;
    $launched = !empty($cfg['launched']);
    $r = static fn(string $label): float => arena_rand($seed, $tick, "$id:$label");
    $trade = static function (string $bot, string $side, float $l, bool $wash = false) use (&$c, &$book, $id, $tick): float {
        $before = arena_price($c);
        if ($side === 'buy') {
            $coins = arena_buy($c, $l);
            arena_record($book, $id, $c, $tick, null, $bot, 'buy', $coins, $l, $before, $wash);
            return $coins;
        }
        $coins = $l / $before;
        $got = arena_sell($c, $coins);
        arena_record($book, $id, $c, $tick, null, $bot, 'sell', $coins, $got, $before, $wash);
        return $got;
    };

    // Maya the Market Maker: her fair value wanders; she trades the price back toward it and adds small two-sided
    // flow. On a player coin she has no fair value to defend and only adds the small flow.
    if ($launched) {
        $c['fair'] = arena_price($c);
    } else {
        if ($cfg['sigma'] > 0) {
            $c['fair'] *= 1 + $cfg['sigma'] * (2 * $r('fair') - 1);
        }
        $gap = $c['fair'] / arena_price($c) - 1;
        if (abs($gap) > 0.002) {
            $trade('market maker', $gap > 0 ? 'buy' : 'sell', min($c['rl'] * 0.02, $c['rl'] * abs($gap) * 0.5));
        }
    }
    if ($r('noise') < ($launched ? 0.3 : 0.7)) {
        $trade('market maker', $r('side') < 0.5 ? 'buy' : 'sell', $c['rl'] * (0.0005 + 0.0025 * $r('size')));
    }

    // Mo Momentum: follows the trend of a fast against a slow moving average, which amplifies moves.
    $p = arena_price($c);
    $c['ema_fast'] = 0.3 * $p + 0.7 * $c['ema_fast'];
    $c['ema_slow'] = 0.05 * $p + 0.95 * $c['ema_slow'];
    $trend = $c['ema_fast'] / $c['ema_slow'] - 1;
    if (abs($trend) > 0.003 && $r('momentum') < 0.1) {
        $trade('momentum', $trend > 0 ? 'buy' : 'sell', $c['rl'] * min(0.01, abs($trend)));
    }

    // Panic Pete: sells when the price drops fast.
    if ($id !== 'PEG' && $trend < -0.01 && $r('panic') < 0.08) {
        $trade('panic', 'sell', $c['rl'] * 0.008);
    }

    // Big Wally the whale: rare, very large orders, mostly sells.
    if ($id !== 'PEG' && $r('whale') < 1 / 900) {
        $trade('whale', $r('whale-side') < 0.65 ? 'sell' : 'buy', $c['rl'] * 0.06);
    }

    // Ape Annie: buys every new coin in its first 3 minutes, then dumps all of it after 5.
    if ($launched && isset($c['created_tick']) && empty($c['rugged'])) {
        $age = $tick - (int) $c['created_tick'];
        if ($age < 180 && $r('ape') < 0.06) {
            $c['ape'] += $trade('ape', 'buy', $c['rl'] * 0.03);
        } elseif ($age >= 300 && $c['ape'] > 0 && $r('ape-dump') < 0.05) {
            $trade('ape', 'sell', $c['ape'] * arena_price($c));
            $c['ape'] = 0.0;
        }
    }

    // Wash Wendy: buys and sells the same coins in the same tick. Volume goes up, the price barely moves.
    if ($cfg['wash']) {
        $l = $c['rl'] * 0.004;
        if ($tick % 2 === 0) {
            $coins = $trade('wash bot', 'buy', $l, true);
            $before = arena_price($c);
            $got = arena_sell($c, $coins);
            arena_record($book, $id, $c, $tick, null, 'wash bot', 'sell', $coins, $got, $before, true);
        } else {
            $got = $trade('wash bot', 'sell', $l, true);
            $trade('wash bot', 'buy', $got, true);
        }
    }
}

// A coin whose creator has sold and whose price has fallen 80% from its peak is marked as rugged.
function arena_check_rug(array &$c, string $id, int $tick, array &$book): void
{
    if (empty($c['launched']) || !empty($c['rugged'])) {
        return;
    }
    $p = arena_price($c);
    $c['peak'] = max($c['peak'], $p);
    $start = (float) $c['creator_start'];
    if ($c['creator_sold'] > 0 && ($p <= 0.2 * $c['peak'] || ($start > 0 && $c['creator_sold'] >= 0.5 * $start))) {
        $c['rugged'] = 1;
        arena_record($book, $id, $c, $tick, $c['creator_id'], null, 'sell', $c['creator_sold'], 0.0, $p, false, 'rug');
    }
}

// Locks the market row and plays every tick that is due. Call inside a transaction; the lock holds until commit.
function arena_advance(PDO $db): array
{
    $v2 = arena_v2_ready();
    $m = $db->query('SELECT tick, tick_ms, seed FROM arena_market WHERE id = 1 FOR UPDATE')->fetch();
    if (!$m) {
        throw new RuntimeException('The Arena market row is missing. Run bin/migrate.php.');
    }
    $coins = [];
    $sql = $v2
        ? 'SELECT id, reserve_l, reserve_c, fair, ema_fast, ema_slow, launched, creator_id, creator_start, creator_sold, created_tick, peak, rugged, ape FROM arena_coins ORDER BY sort, created_s'
        : 'SELECT id, reserve_l, reserve_c, fair, ema_fast, ema_slow FROM arena_coins ORDER BY sort';
    foreach ($db->query($sql) as $row) {
        $c = ['rl' => (float) $row['reserve_l'], 'rc' => (float) $row['reserve_c'], 'fair' => (float) $row['fair'], 'ema_fast' => (float) $row['ema_fast'], 'ema_slow' => (float) $row['ema_slow']];
        if ($v2) {
            $c += ['launched' => (int) $row['launched'], 'creator_id' => $row['creator_id'] === null ? null : (int) $row['creator_id'], 'creator_start' => (float) $row['creator_start'],
                'creator_sold' => (float) $row['creator_sold'], 'created_tick' => (int) $row['created_tick'], 'peak' => (float) $row['peak'], 'rugged' => (int) $row['rugged'], 'ape' => (float) $row['ape']];
        }
        if ($v2 || isset(ARENA_COINS[$row['id']])) {
            $coins[$row['id']] = $c;
        }
    }
    $tick = (int) $m['tick'];
    $now = (int) floor(microtime(true) * 1000);
    $due = intdiv($now - (int) $m['tick_ms'], ARENA_TICK_MS);
    if ($due <= 0) {
        return ['tick' => $tick, 'coins' => $coins, 'seed' => (int) $m['seed']];
    }
    $run = min($due, ARENA_MAX_CATCHUP);
    $book = ['trades' => [], 'candles' => [], 'burn' => 0.0];
    for ($i = 0; $i < $run; $i++) {
        $tick++;
        foreach ($coins as $id => &$c) {
            arena_bots($c, (string) $id, $tick, (int) $m['seed'], $book);
            if ($v2) {
                arena_check_rug($c, (string) $id, $tick, $book);
            }
        }
        unset($c);
    }
    // After a quiet spell the clock jumps to now instead of replaying hours of ticks.
    $tickMs = $due > $run ? $now - ($now - (int) $m['tick_ms']) % ARENA_TICK_MS : (int) $m['tick_ms'] + $run * ARENA_TICK_MS;
    $db->prepare('UPDATE arena_market SET tick = ?, tick_ms = ? WHERE id = 1')->execute([$tick, $tickMs]);
    arena_save($db, $coins, $book);
    if (intdiv($tick, 300) !== intdiv($tick - $run, 300)) {
        $db->prepare('DELETE FROM arena_trades WHERE tick < ?')->execute([$tick - ARENA_KEEP_TICKS]);
        $db->prepare('DELETE FROM arena_candles WHERE bucket < ?')->execute([intdiv($tick - ARENA_KEEP_TICKS, ARENA_CANDLE_TICKS)]);
    }
    return ['tick' => $tick, 'coins' => $coins, 'seed' => (int) $m['seed']];
}

// Writes pool state, buffered trades, candles and burned fees.
function arena_save(PDO $db, array $coins, array $book): void
{
    $v2 = arena_v2_ready();
    $up = $v2
        ? $db->prepare('UPDATE arena_coins SET reserve_l = ?, reserve_c = ?, fair = ?, ema_fast = ?, ema_slow = ?, peak = ?, rugged = ?, creator_sold = ?, ape = ? WHERE id = ?')
        : $db->prepare('UPDATE arena_coins SET reserve_l = ?, reserve_c = ?, fair = ?, ema_fast = ?, ema_slow = ? WHERE id = ?');
    foreach ($coins as $id => $c) {
        $args = [$c['rl'], $c['rc'], $c['fair'], $c['ema_fast'], $c['ema_slow']];
        if ($v2) {
            array_push($args, $c['peak'] ?? 0, $c['rugged'] ?? 0, $c['creator_sold'] ?? 0, $c['ape'] ?? 0);
        }
        $args[] = $id;
        $up->execute($args);
    }
    $trades = $v2 ? $book['trades'] : array_map(static fn(array $t): array => array_slice($t, 0, 9), array_filter($book['trades'], static fn(array $t): bool => $t[9] === 'trade'));
    $cols = $v2 ? '(tick, coin_id, user_id, bot, side, coins, amount_l, price, wash, kind)' : '(tick, coin_id, user_id, bot, side, coins, amount_l, price, wash)';
    $marks = $v2 ? '(?,?,?,?,?,?,?,?,?,?)' : '(?,?,?,?,?,?,?,?,?)';
    foreach (array_chunk(array_values($trades), 200) as $chunk) {
        $db->prepare("INSERT INTO arena_trades $cols VALUES " . implode(',', array_fill(0, count($chunk), $marks)))->execute(array_merge(...$chunk));
    }
    $candles = array_values($book['candles']);
    foreach (array_chunk($candles, 100) as $chunk) {
        $sql = 'INSERT INTO arena_candles (coin_id, bucket, open, high, low, close, volume, wash_volume) VALUES '
            . implode(',', array_fill(0, count($chunk), '(?,?,?,?,?,?,?,?)'))
            . ' ON DUPLICATE KEY UPDATE high = GREATEST(high, VALUES(high)), low = LEAST(low, VALUES(low)), close = VALUES(close),'
            . ' volume = volume + VALUES(volume), wash_volume = wash_volume + VALUES(wash_volume)';
        $db->prepare($sql)->execute(array_merge(...$chunk));
    }
    if ($v2 && ($book['burn'] ?? 0) > 0) {
        arena_burn($db, 'fee', (float) $book['burn']);
    }
}

// Records L$ taken out of the game for good, totalled per Bangkok day and kind (fee, listing, pro).
function arena_burn(PDO $db, string $kind, float $amount): void
{
    if (!arena_v2_ready() || $amount <= 0) {
        return;
    }
    $db->prepare('INSERT INTO arena_burns (day, kind, amount_l) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount_l = amount_l + VALUES(amount_l)')
        ->execute([arena_day(), $kind, $amount]);
}

// A player's trade, inside the same locked transaction as arena_advance(). $amount is L$ to spend, or coins to sell.
// Only players' fees count as burned: the bots' L$ is not anyone's money.
function arena_player_trade(PDO $db, array &$market, int $userId, string $id, string $side, float $amount): array
{
    $v2 = arena_v2_ready();
    $user = $db->prepare('SELECT cash FROM arena_users WHERE id = ? FOR UPDATE');
    $user->execute([$userId]);
    $cash = (float) $user->fetchColumn();
    $hold = $db->prepare('SELECT amount FROM arena_holdings WHERE user_id = ? AND coin_id = ? FOR UPDATE');
    $hold->execute([$userId, $id]);
    $held = (float) ($hold->fetchColumn() ?: 0);

    $c = &$market['coins'][$id];
    $creator = $v2 && !empty($c['launched']) && ($c['creator_id'] ?? null) === $userId;
    $before = arena_price($c);
    $book = ['trades' => [], 'candles' => [], 'burn' => 0.0];
    if ($side === 'buy') {
        if ($amount > $cash + 1e-9) {
            return ['error' => 'You don’t have that many L$. Try a smaller amount.'];
        }
        $coins = arena_buy($c, $amount);
        $cash -= $amount;
        $held += $coins;
        arena_record($book, $id, $c, $market['tick'], $userId, null, 'buy', $coins, $amount, $before, false);
        $result = ['side' => 'buy', 'coins' => $coins, 'amountL' => $amount];
    } else {
        $free = $held;
        if ($creator) {
            $st = $db->prepare('SELECT creator_locked, vest_until FROM arena_coins WHERE id = ?');
            $st->execute([$id]);
            $v = $st->fetch();
            if ($v && (int) $v['vest_until'] > time()) {
                $free = max(0.0, $held - (float) $v['creator_locked']);
            }
        }
        if ($amount > $free + 1e-9) {
            return ['error' => $free < $held
                ? 'Part of your coins are still vesting, so you can sell at most ' . round($free, 4) . " $id now."
                : "You don’t hold that many $id. Try a smaller amount."];
        }
        $amount = min($amount, $held);
        $got = arena_sell($c, $amount);
        $cash += $got;
        $held -= $amount;
        arena_record($book, $id, $c, $market['tick'], $userId, null, 'sell', $amount, $got, $before, false);
        $result = ['side' => 'sell', 'coins' => $amount, 'amountL' => $got];
        if ($creator) {
            $c['creator_sold'] += $amount;
            arena_check_rug($c, $id, $market['tick'], $book);
        }
    }
    $book['burn'] = $c['fee'] ?? 0.0;
    if ($v2 && !empty($c['launched'])) {
        $c['peak'] = max($c['peak'], arena_price($c));
    }
    arena_save($db, [$id => $c], $book);
    $db->prepare('UPDATE arena_users SET cash = ? WHERE id = ?')->execute([$cash, $userId]);
    if ($v2) {
        $db->prepare('UPDATE arena_users SET last_active_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$userId]);
    }
    $db->prepare('INSERT INTO arena_holdings (user_id, coin_id, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = VALUES(amount)')
        ->execute([$userId, $id, $held > 1e-9 ? $held : 0]);
    $after = arena_price($c);
    return $result + ['price' => $after, 'impactPct' => abs($after / $before - 1) * 100, 'feeBurned' => $book['burn'], 'rugged' => (bool) ($c['rugged'] ?? false)];
}

// Arena L$ in players' hands, active players and today's stipend (BRIEF §17).
function arena_supply(PDO $db): array
{
    $r = $db->query('SELECT COALESCE(SUM(cash), 0) AS total, COALESCE(SUM(last_active_at >= UTC_TIMESTAMP() - INTERVAL ' . ARENA_ACTIVE_DAYS . ' DAY), 0) AS active FROM arena_users WHERE approved_at IS NOT NULL')->fetch();
    $total = (float) $r['total'];
    $active = (int) $r['active'];
    $per = $active > 0 ? $total / $active : 0.0;
    $st = $db->prepare('SELECT COALESCE(SUM(amount_l), 0) FROM arena_burns WHERE day = ?');
    $st->execute([arena_day()]);
    $today = (float) $st->fetchColumn();
    $all = (float) $db->query('SELECT COALESCE(SUM(amount_l), 0) FROM arena_burns')->fetchColumn();
    return ['totalL' => round($total, 2), 'burnedToday' => round($today, 2), 'perPlayer' => round($per, 2), 'activePlayers' => $active, 'stipendToday' => round(arena_stipend_amount($per), 2), 'burnedTotal' => round($all, 2)];
}

// 100 L$ while players hold 2,000 L$ each or less, falling linearly to 0 at 5,000.
function arena_stipend_amount(float $perPlayer): float
{
    $f = (ARENA_STIPEND_ZERO_AT - $perPlayer) / (ARENA_STIPEND_ZERO_AT - ARENA_STIPEND_FULL_BELOW);
    return ARENA_STIPEND * max(0.0, min(1.0, $f));
}

// Once per Bangkok day, on an active player's first signed-in state call. Returns the L$ credited.
function arena_pay_stipend(PDO $db, int $userId): float
{
    $today = arena_day();
    $st = $db->prepare('SELECT stipend_day, last_active_at >= UTC_TIMESTAMP() - INTERVAL ' . ARENA_ACTIVE_DAYS . ' DAY AS active FROM arena_users WHERE id = ?');
    $st->execute([$userId]);
    $u = $st->fetch();
    if (!$u || $u['stipend_day'] === $today || !(int) $u['active']) {
        return 0.0;
    }
    $amount = round(arena_stipend_amount(arena_supply($db)['perPlayer']), 2);
    // The day is claimed in the same statement, so two parallel calls can't both pay.
    $up = $db->prepare('UPDATE arena_users SET stipend_day = ?, cash = cash + ?, last_active_at = UTC_TIMESTAMP() WHERE id = ? AND (stipend_day IS NULL OR stipend_day <> ?)');
    $up->execute([$today, $amount, $userId, $today]);
    return $up->rowCount() > 0 ? $amount : 0.0;
}

// Expired demo accounts go; their trades stay in the history under the demo persona.
function arena_purge_demos(PDO $db): void
{
    if (!arena_v2_ready()) {
        return;
    }
    $db->exec("UPDATE arena_trades t JOIN arena_users u ON u.id = t.user_id SET t.user_id = NULL, t.bot = 'demo' WHERE u.is_demo = 1 AND u.demo_expires_at < UTC_TIMESTAMP()");
    $db->exec('UPDATE arena_coins c JOIN arena_users u ON u.id = c.creator_id SET c.creator_id = NULL WHERE u.is_demo = 1 AND u.demo_expires_at < UTC_TIMESTAMP()');
    $db->exec('DELETE FROM arena_users WHERE is_demo = 1 AND demo_expires_at < UTC_TIMESTAMP()');
}
