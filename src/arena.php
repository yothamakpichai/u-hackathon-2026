<?php
// Arena market engine (BRIEF §15): one shared constant-product pool per coin, kept on the server.
// Time moves lazily: each request locks the market row, plays every whole tick since the last one (bots included),
// saves the result and only then serves the request. Simulated L$ only; nothing here touches real money.
declare(strict_types=1);

const ARENA_TICK_MS = 1000;      // one market tick per second
const ARENA_CANDLE_TICKS = 10;   // 10-second candles
const ARENA_MAX_CATCHUP = 90;    // after a quiet spell, play at most 90 s and jump to now
const ARENA_FEE = 0.003;         // 0.3% swap fee, kept in the pool
const ARENA_START_CASH = 1000.0;
const ARENA_KEEP_TICKS = 7200;   // trades and candles older than 2 hours are pruned

// sigma: how far the market maker's fair value wanders per tick. wash: a wash-trading bot works this coin.
const ARENA_COINS = [
    'VAULT' => ['name' => 'Vault', 'price' => 120.0, 'liquidity' => 150000.0, 'sigma' => 0.0015, 'wash' => false, 'sort' => 1],
    'FUEL' => ['name' => 'Fuel', 'price' => 4.0, 'liquidity' => 60000.0, 'sigma' => 0.002, 'wash' => true, 'sort' => 2],
    'ZOOMZ' => ['name' => 'Zoomz', 'price' => 0.05, 'liquidity' => 20000.0, 'sigma' => 0.005, 'wash' => false, 'sort' => 3],
    'PEG' => ['name' => 'Peg', 'price' => 1.0, 'liquidity' => 200000.0, 'sigma' => 0.0, 'wash' => false, 'sort' => 4],
];

// Deterministic randomness in [0, 1) from the market seed, the tick and a label.
function arena_rand(int $seed, int $tick, string $label): float
{
    return hexdec(substr(hash('sha256', "$seed:$tick:$label"), 0, 8)) / 4294967296;
}

function arena_price(array $c): float
{
    return $c['rl'] / $c['rc'];
}

// Spend $l L$ on coins. The fee stays in the pool. Returns the coins received.
function arena_buy(array &$c, float $l): float
{
    $in = $l * (1 - ARENA_FEE);
    $out = $c['rc'] * $in / ($c['rl'] + $in);
    $c['rl'] += $l;
    $c['rc'] -= $out;
    return $out;
}

// Sell $q coins. Returns the L$ received.
function arena_sell(array &$c, float $q): float
{
    $in = $q * (1 - ARENA_FEE);
    $out = $c['rl'] * $in / ($c['rc'] + $in);
    $c['rc'] += $q;
    $c['rl'] -= $out;
    return $out;
}

// Adds a trade to the write buffer and folds it into its candle.
function arena_record(array &$book, string $id, array $c, int $tick, ?int $userId, ?string $bot, string $side, float $coins, float $l, float $before, bool $wash): void
{
    $after = arena_price($c);
    $book['trades'][] = [$tick, $id, $userId, $bot, $side, $coins, $l, $after, $wash ? 1 : 0];
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

// One tick of the four bots on one coin.
function arena_bots(array &$c, string $id, int $tick, int $seed, array &$book): void
{
    $cfg = ARENA_COINS[$id];
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

    // Market maker: its fair value wanders; it trades the price back toward it and adds small two-sided flow.
    if ($cfg['sigma'] > 0) {
        $c['fair'] *= 1 + $cfg['sigma'] * (2 * $r('fair') - 1);
    }
    $gap = $c['fair'] / arena_price($c) - 1;
    if (abs($gap) > 0.002) {
        $trade('market maker', $gap > 0 ? 'buy' : 'sell', min($c['rl'] * 0.02, $c['rl'] * abs($gap) * 0.5));
    }
    if ($r('noise') < 0.7) {
        $trade('market maker', $r('side') < 0.5 ? 'buy' : 'sell', $c['rl'] * (0.0005 + 0.0025 * $r('size')));
    }

    // Momentum: follows the trend of a fast against a slow moving average, which amplifies moves.
    $p = arena_price($c);
    $c['ema_fast'] = 0.3 * $p + 0.7 * $c['ema_fast'];
    $c['ema_slow'] = 0.05 * $p + 0.95 * $c['ema_slow'];
    $trend = $c['ema_fast'] / $c['ema_slow'] - 1;
    if (abs($trend) > 0.003 && $r('momentum') < 0.1) {
        $trade('momentum', $trend > 0 ? 'buy' : 'sell', $c['rl'] * min(0.01, abs($trend)));
    }

    // Whale: rare, very large orders, mostly sells.
    if ($id !== 'PEG' && $r('whale') < 1 / 900) {
        $trade('whale', $r('whale-side') < 0.65 ? 'sell' : 'buy', $c['rl'] * 0.06);
    }

    // Wash bot: buys and sells the same coins in the same tick. Volume goes up, the price barely moves.
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

// Locks the market row and plays every tick that is due. Call inside a transaction; the lock holds until commit.
function arena_advance(PDO $db): array
{
    $m = $db->query('SELECT tick, tick_ms, seed FROM arena_market WHERE id = 1 FOR UPDATE')->fetch();
    if (!$m) {
        throw new RuntimeException('The Arena market row is missing. Run bin/migrate.php.');
    }
    $coins = [];
    foreach ($db->query('SELECT id, reserve_l, reserve_c, fair, ema_fast, ema_slow FROM arena_coins ORDER BY sort') as $row) {
        $coins[$row['id']] = ['rl' => (float) $row['reserve_l'], 'rc' => (float) $row['reserve_c'], 'fair' => (float) $row['fair'], 'ema_fast' => (float) $row['ema_fast'], 'ema_slow' => (float) $row['ema_slow']];
    }
    $tick = (int) $m['tick'];
    $now = (int) floor(microtime(true) * 1000);
    $due = intdiv($now - (int) $m['tick_ms'], ARENA_TICK_MS);
    if ($due <= 0) {
        return ['tick' => $tick, 'coins' => $coins];
    }
    $run = min($due, ARENA_MAX_CATCHUP);
    $book = ['trades' => [], 'candles' => []];
    for ($i = 0; $i < $run; $i++) {
        $tick++;
        foreach ($coins as $id => &$c) {
            if (isset(ARENA_COINS[$id])) {
                arena_bots($c, $id, $tick, (int) $m['seed'], $book);
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
    return ['tick' => $tick, 'coins' => $coins];
}

// Writes pool state, buffered trades and candles.
function arena_save(PDO $db, array $coins, array $book): void
{
    $up = $db->prepare('UPDATE arena_coins SET reserve_l = ?, reserve_c = ?, fair = ?, ema_fast = ?, ema_slow = ? WHERE id = ?');
    foreach ($coins as $id => $c) {
        $up->execute([$c['rl'], $c['rc'], $c['fair'], $c['ema_fast'], $c['ema_slow'], $id]);
    }
    foreach (array_chunk($book['trades'], 200) as $chunk) {
        $sql = 'INSERT INTO arena_trades (tick, coin_id, user_id, bot, side, coins, amount_l, price, wash) VALUES ' . implode(',', array_fill(0, count($chunk), '(?,?,?,?,?,?,?,?,?)'));
        $db->prepare($sql)->execute(array_merge(...$chunk));
    }
    $candles = array_values($book['candles']);
    foreach (array_chunk($candles, 100) as $chunk) {
        $sql = 'INSERT INTO arena_candles (coin_id, bucket, open, high, low, close, volume, wash_volume) VALUES '
            . implode(',', array_fill(0, count($chunk), '(?,?,?,?,?,?,?,?)'))
            . ' ON DUPLICATE KEY UPDATE high = GREATEST(high, VALUES(high)), low = LEAST(low, VALUES(low)), close = VALUES(close),'
            . ' volume = volume + VALUES(volume), wash_volume = wash_volume + VALUES(wash_volume)';
        $db->prepare($sql)->execute(array_merge(...$chunk));
    }
}

// A player's trade, inside the same locked transaction as arena_advance(). $amount is L$ to spend, or coins to sell.
function arena_player_trade(PDO $db, array &$market, int $userId, string $id, string $side, float $amount): array
{
    $user = $db->prepare('SELECT cash FROM arena_users WHERE id = ? FOR UPDATE');
    $user->execute([$userId]);
    $cash = (float) $user->fetchColumn();
    $hold = $db->prepare('SELECT amount FROM arena_holdings WHERE user_id = ? AND coin_id = ? FOR UPDATE');
    $hold->execute([$userId, $id]);
    $held = (float) ($hold->fetchColumn() ?: 0);

    $c = &$market['coins'][$id];
    $before = arena_price($c);
    $book = ['trades' => [], 'candles' => []];
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
        if ($amount > $held + 1e-9) {
            return ['error' => "You don’t hold that many $id. Try a smaller amount."];
        }
        $amount = min($amount, $held);
        $got = arena_sell($c, $amount);
        $cash += $got;
        $held -= $amount;
        arena_record($book, $id, $c, $market['tick'], $userId, null, 'sell', $amount, $got, $before, false);
        $result = ['side' => 'sell', 'coins' => $amount, 'amountL' => $got];
    }
    arena_save($db, [$id => $c], $book);
    $db->prepare('UPDATE arena_users SET cash = ? WHERE id = ?')->execute([$cash, $userId]);
    $db->prepare('INSERT INTO arena_holdings (user_id, coin_id, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = VALUES(amount)')
        ->execute([$userId, $id, $held > 1e-9 ? $held : 0]);
    $after = arena_price($c);
    return $result + ['price' => $after, 'impactPct' => abs($after / $before - 1) * 100];
}
