<?php
// Arena v2 (BRIEF §17): player-launched coins with a red-flag meter and rug detection, Town -> Arena transfers,
// Penny Pro, the news desk and the daily season. Everything here needs arena_v2_ready(); api/arena.php checks it.
// Simulated L$ only.
declare(strict_types=1);

require_once __DIR__ . '/anthropic.php';
require_once __DIR__ . '/cache.php';

// Plain English for players aged 13+. Each reason adds its points to the red-flag meter (capped at 100).
const ARENA_FLAG_TEXT = [
    'creator_big' => 'The creator owns %s%% of all the coins. If they sell, the price can crash.',
    'creator_some' => 'The creator owns %s%% of all the coins.',
    'unlocked' => 'The creator didn’t lock the pool. On real markets an unlocked pool can be emptied in one go.',
    'no_vesting' => 'The creator’s coins don’t vest, so they can sell all of them right now.',
    'new' => 'This coin is less than 10 minutes old. New coins swing hard and many fail.',
    'wash' => 'A lot of the trading is the same coins going back and forth (wash trading). The volume looks bigger than it is.',
    'holder' => 'One player holds %s%% of all the coins.',
    'creator_sold' => 'The creator has already sold some of their coins.',
    'rugged' => 'The creator sold out and the price crashed. This was a rug pull.',
];
const ARENA_LAUNCHES_PER_HOUR = 3;

// What the red-flag meter needs for every coin, in three grouped queries.
function arena_flag_inputs(PDO $db, int $tick): array
{
    $out = ['max' => [], 'creator' => [], 'vol' => [], 'wash' => []];
    foreach ($db->query('SELECT coin_id, MAX(amount) AS m FROM arena_holdings GROUP BY coin_id') as $r) {
        $out['max'][$r['coin_id']] = (float) $r['m'];
    }
    foreach ($db->query('SELECT h.coin_id, h.amount FROM arena_holdings h JOIN arena_coins c ON c.id = h.coin_id AND c.creator_id = h.user_id') as $r) {
        $out['creator'][$r['coin_id']] = (float) $r['amount'];
    }
    $st = $db->prepare('SELECT coin_id, SUM(volume) AS v, SUM(wash_volume) AS w FROM arena_candles WHERE bucket >= ? GROUP BY coin_id');
    $st->execute([intdiv(max(0, $tick - 600), ARENA_CANDLE_TICKS)]);
    foreach ($st as $r) {
        $out['vol'][$r['coin_id']] = (float) $r['v'];
        $out['wash'][$r['coin_id']] = (float) $r['w'];
    }
    return $out;
}

// The v2 fields of one coin in the state answer.
function arena_coin_extra(array $row, array $in): array
{
    $id = $row['id'];
    $now = time();
    $launched = (bool) $row['launched'];
    $supply = (float) $row['supply'];
    $creatorHeld = $in['creator'][$id] ?? 0.0;
    $creatorPct = $supply > 0 ? $creatorHeld / $supply * 100 : 0.0;
    $lpLocked = !$launched || (int) $row['lock_until'] > $now;
    $score = 0;
    $reasons = [];
    $add = static function (int $points, string $key, ?float $pct = null) use (&$score, &$reasons): void {
        $score += $points;
        $reasons[] = $pct === null ? ARENA_FLAG_TEXT[$key] : sprintf(ARENA_FLAG_TEXT[$key], (string) round($pct));
    };
    if ($launched) {
        if ($creatorPct >= 30) {
            $add(25, 'creator_big', $creatorPct);
        } elseif ($creatorPct >= 10) {
            $add(12, 'creator_some', $creatorPct);
        }
        if (!$lpLocked) {
            $add(20, 'unlocked');
        }
        if ((float) $row['creator_start'] > 0 && (int) $row['vest_until'] <= $now) {
            $add(10, 'no_vesting');
        }
        if ($now - (int) $row['created_s'] < 600) {
            $add(10, 'new');
        }
        if ((float) $row['creator_sold'] > 0) {
            $add(20, 'creator_sold');
        }
    }
    $vol = $in['vol'][$id] ?? 0.0;
    if ($vol > 0 && ($in['wash'][$id] ?? 0) / $vol > 0.3) {
        $add(15, 'wash');
    }
    $top = $in['max'][$id] ?? 0.0;
    if ($supply > 0 && $top / $supply >= 0.25) {
        $add(15, 'holder', $top / $supply * 100);
    }
    if ((int) $row['rugged']) {
        $score = 100;
        array_unshift($reasons, ARENA_FLAG_TEXT['rugged']);
    }
    return [
        'launched' => $launched,
        'icon' => $row['icon'] !== '' ? $row['icon'] : null,
        'color' => $row['color'] !== '' ? $row['color'] : null,
        'creator' => $row['creator'],
        'creatorPct' => round($creatorPct, 2),
        'communityPct' => $supply > 0 ? round((float) $row['community'] / $supply * 100, 2) : 0,
        'lpLocked' => $lpLocked,
        'lockUntil' => (int) $row['lock_until'],
        'vestUntil' => (int) $row['vest_until'],
        'createdAt' => (int) $row['created_s'],
        'redFlags' => ['score' => min(100, $score), 'reasons' => $reasons],
        'rugged' => (bool) $row['rugged'],
        'supply' => $supply,
    ];
}

// The same filter as the Create screen and usernames: real tickers and brands (public/data/facts.json) and the
// ROT13 profanity list in src/accounts.php.
function arena_name_problem(string $name, string $ticker): ?string
{
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9 ]{1,22}[A-Za-z0-9]$/', $name)) {
        return 'Coin names are 3 to 24 letters, numbers or spaces.';
    }
    if (!preg_match('/^[A-Z]{3,6}$/', $ticker)) {
        return 'Tickers are 3 to 6 capital letters, like ZAPP.';
    }
    $facts = json_decode((string) file_get_contents(REPO_ROOT . '/public/data/facts.json'), true) ?: [];
    $lower = strtolower($name);
    $tokens = preg_split('/[^a-z0-9]+/', $lower, -1, PREG_SPLIT_NO_EMPTY);
    $tokens[] = strtolower($ticker);
    foreach ($facts['banned']['tickers'] ?? [] as $t) {
        if (in_array(strtolower($t), $tokens, true)) {
            return 'That looks like a real coin. Arena coins must be made up.';
        }
    }
    foreach ($facts['banned']['words'] ?? [] as $w) {
        $w = strtolower($w);
        if (str_contains($lower, $w) || str_contains(strtolower($ticker), $w)) {
            return 'That looks like a real coin or brand. Arena coins must be made up.';
        }
    }
    foreach (ROT13_BLOCK as $word) {
        if (str_contains($lower, str_rot13($word)) || str_contains(strtolower($ticker), str_rot13($word))) {
            return 'Please pick a friendlier name.';
        }
    }
    if (isset(ARENA_COINS[$ticker])) {
        return 'That ticker is taken. Try another one.';
    }
    return null;
}

// Lists a player's coin. The 500 L$ fee is burned; the pool gets liquidityL and the liquidity share of the supply.
function arena_launch(PDO $db, int $userId, array $in): array
{
    $name = is_string($in['name'] ?? null) ? trim(preg_replace('/\s+/', ' ', $in['name'])) : '';
    $ticker = is_string($in['ticker'] ?? null) ? strtoupper(trim($in['ticker'])) : '';
    $icon = is_string($in['icon'] ?? null) && preg_match('/^[a-z0-9-]{1,16}$/', $in['icon']) ? $in['icon'] : '';
    $color = is_string($in['color'] ?? null) && preg_match('/^[a-z0-9-]{1,16}$/', $in['color']) ? $in['color'] : '';
    $supply = $in['supply'] ?? null;
    $alloc = is_array($in['alloc'] ?? null) ? $in['alloc'] : [];
    $liqL = $in['liquidityL'] ?? null;
    $lockDays = $in['lockDays'] ?? 0;
    $vestDays = $in['vestDays'] ?? 0;
    if ($problem = arena_name_problem($name, $ticker)) {
        send_error(400, 'BAD_NAME', $problem);
    }
    if (!is_int($supply) || $supply < 1000 || $supply > 1000000000) {
        send_error(400, 'BAD_INPUT', 'Pick a supply between 1,000 and 1,000,000,000 coins.');
    }
    [$cr, $cm, $lq] = [$alloc['creator'] ?? null, $alloc['community'] ?? null, $alloc['liquidity'] ?? null];
    if (!is_int($cr) || !is_int($cm) || !is_int($lq) || $cr < 0 || $cm < 0 || $lq < 0 || $cr + $cm + $lq !== 100) {
        send_error(400, 'BAD_INPUT', 'The creator, community and liquidity shares must be whole percents that add up to 100.');
    }
    if ($cr > 50 || $lq < 20) {
        send_error(400, 'BAD_INPUT', 'The creator can keep at most 50%, and at least 20% must go to the pool.');
    }
    if (!(is_int($liqL) || is_float($liqL)) || !is_finite((float) $liqL) || $liqL < ARENA_MIN_LIQUIDITY) {
        send_error(400, 'BAD_INPUT', 'Put at least L$' . (int) ARENA_MIN_LIQUIDITY . ' in the pool.');
    }
    if (!in_array($lockDays, [0, 7, 30], true) || !in_array($vestDays, [0, 7, 30], true)) {
        send_error(400, 'BAD_INPUT', 'Lock and vesting are 0, 7 or 30 days.');
    }
    $liqL = round((float) $liqL, 2);
    $now = time();

    $db->beginTransaction();
    try {
        $market = arena_advance($db);
        $st = $db->prepare('SELECT 1 FROM arena_coins WHERE id = ?');
        $st->execute([$ticker]);
        if ($st->fetchColumn()) {
            $db->rollBack();
            send_error(409, 'TAKEN', 'That ticker is taken. Try another one.');
        }
        // At most 30 player coins: the oldest rugged one makes room, otherwise the market is full for now.
        $live = (int) $db->query('SELECT COUNT(*) FROM arena_coins WHERE launched = 1')->fetchColumn();
        if ($live >= ARENA_MAX_LAUNCHED) {
            $old = $db->query('SELECT id FROM arena_coins WHERE launched = 1 AND (rugged = 1 OR reserve_l < 50) ORDER BY created_s LIMIT 1')->fetchColumn();
            if ($old === false) {
                $db->rollBack();
                send_error(409, 'FULL', 'The Arena has 30 player coins already. Try again later.');
            }
            foreach (['DELETE FROM arena_holdings WHERE coin_id = ?', 'DELETE FROM arena_candles WHERE coin_id = ?', 'DELETE FROM arena_coins WHERE id = ?'] as $sql) {
                $db->prepare($sql)->execute([$old]);
            }
        }
        $st = $db->prepare('SELECT cash FROM arena_users WHERE id = ? FOR UPDATE');
        $st->execute([$userId]);
        $cash = (float) $st->fetchColumn();
        $cost = ARENA_LISTING_FEE + $liqL;
        if ($cash + 1e-9 < $cost) {
            $db->rollBack();
            send_error(400, 'NOT_ENOUGH', 'Launching costs L$' . (int) ARENA_LISTING_FEE . ' plus the L$' . $liqL . ' you put in the pool. You have L$' . round($cash, 2) . '.');
        }
        $pool = $supply * $lq / 100;
        $mine = $supply * $cr / 100;
        $price = $liqL / $pool;
        $db->prepare('INSERT INTO arena_coins (id, name, reserve_l, reserve_c, fair, ema_fast, ema_slow, sort, launched, icon, color, creator_id, supply, community,
                creator_start, creator_locked, creator_sold, lock_until, vest_until, created_s, created_tick, peak, rugged, ape)
            VALUES (?, ?, ?, ?, ?, ?, ?, 100, 1, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, 0)')
            ->execute([$ticker, $name, $liqL, $pool, $price, $price, $price, $icon, $color, $userId, $supply, $supply * $cm / 100,
                $mine, $vestDays > 0 ? $mine : 0, $lockDays > 0 ? $now + $lockDays * 86400 : 0, $vestDays > 0 ? $now + $vestDays * 86400 : 0, $now, $market['tick'], $price]);
        if ($mine > 0) {
            $db->prepare('INSERT INTO arena_holdings (user_id, coin_id, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = VALUES(amount)')->execute([$userId, $ticker, $mine]);
        }
        $db->prepare('UPDATE arena_users SET cash = cash - ?, last_active_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$cost, $userId]);
        arena_burn($db, 'listing', ARENA_LISTING_FEE);
        $db->prepare("INSERT INTO arena_trades (tick, coin_id, user_id, bot, side, coins, amount_l, price, wash, kind) VALUES (?, ?, ?, NULL, 'buy', 0, ?, ?, 0, 'launch')")
            ->execute([$market['tick'], $ticker, $userId, $liqL, $price]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
    return ['id' => $ticker, 'name' => $name, 'price' => $price, 'supply' => (float) $supply, 'creatorCoins' => $mine, 'poolCoins' => $pool, 'liquidityL' => $liqL,
        'feeBurned' => ARENA_LISTING_FEE, 'lockUntil' => $lockDays > 0 ? $now + $lockDays * 86400 : 0, 'vestUntil' => $vestDays > 0 ? $now + $vestDays * 86400 : 0];
}

// Town -> Arena. The client debits the Town wallet only after this answers ok.
function arena_transfer(PDO $db, int $userId, array $in): array
{
    $amount = $in['amount'] ?? null;
    if (!(is_int($amount) || is_float($amount)) || !is_finite((float) $amount) || $amount <= 0) {
        send_error(400, 'BAD_INPUT', 'Pick an amount above zero.');
    }
    $amount = round((float) $amount, 2);
    $today = arena_day();
    $db->beginTransaction();
    $st = $db->prepare('SELECT cash, transfer_day, transfer_today FROM arena_users WHERE id = ? FOR UPDATE');
    $st->execute([$userId]);
    $u = $st->fetch();
    $used = $u['transfer_day'] === $today ? (float) $u['transfer_today'] : 0.0;
    $left = max(0.0, ARENA_TRANSFER_CAP - $used);
    if ($amount > $left + 1e-9) {
        $db->rollBack();
        $msg = $left > 0
            ? 'You can move L$' . round($left, 2) . ' more to the Arena today (the most is L$' . (int) ARENA_TRANSFER_CAP . ' a day).'
            : 'You’ve moved the most for today (L$' . (int) ARENA_TRANSFER_CAP . '). Try again tomorrow.';
        send_json(['ok' => false, 'error' => ['code' => 'CAP_REACHED', 'message' => $msg], 'accepted' => false, 'remainingToday' => round($left, 2), 'transferredToday' => round($used, 2)], 409);
    }
    $db->prepare('UPDATE arena_users SET cash = cash + ?, transfer_day = ?, transfer_today = ? WHERE id = ?')->execute([$amount, $today, $used + $amount, $userId]);
    $db->commit();
    return ['accepted' => true, 'amount' => $amount, 'cash' => (float) $u['cash'] + $amount, 'transferredToday' => round($used + $amount, 2), 'remainingToday' => round($left - $amount, 2)];
}

function arena_is_pro(PDO $db, int $userId): bool
{
    $st = $db->prepare('SELECT pro_until FROM arena_users WHERE id = ?');
    $st->execute([$userId]);
    return (int) $st->fetchColumn() > time();
}

// Penny Pro: 150 L$ of Arena cash, burned, for 7 more days (added on top of time left).
function arena_buy_pro(PDO $db, int $userId): array
{
    $db->beginTransaction();
    $st = $db->prepare('SELECT cash, pro_until FROM arena_users WHERE id = ? FOR UPDATE');
    $st->execute([$userId]);
    $u = $st->fetch();
    if ((float) $u['cash'] + 1e-9 < ARENA_PRO_PRICE) {
        $db->rollBack();
        send_error(400, 'NOT_ENOUGH', 'Penny Pro costs L$' . (int) ARENA_PRO_PRICE . ' of Arena cash.');
    }
    $until = max(time(), (int) $u['pro_until']) + ARENA_PRO_DAYS * 86400;
    $db->prepare('UPDATE arena_users SET cash = cash - ?, pro_until = ? WHERE id = ?')->execute([ARENA_PRO_PRICE, $until, $userId]);
    arena_burn($db, 'pro', ARENA_PRO_PRICE);
    $db->commit();
    return ['pro' => true, 'proUntil' => $until, 'cash' => (float) $u['cash'] - ARENA_PRO_PRICE, 'burned' => ARENA_PRO_PRICE];
}

// Headlines newest first. Everyone but Penny Pro sees them 30 s late.
function arena_news_list(PDO $db, bool $pro): array
{
    $st = $db->prepare('SELECT id, at, text, source FROM arena_news WHERE at <= ? ORDER BY at DESC, id DESC LIMIT 8');
    $st->execute([time() - ($pro ? 0 : ARENA_NEWS_DELAY)]);
    return array_map(static fn(array $r): array => ['id' => (int) $r['id'], 'at' => (int) $r['at'], 'text' => $r['text'], 'source' => $r['source']], $st->fetchAll());
}

// The news desk runs after the answer has gone out (PHP-FPM), never inside the market transaction.
function arena_news_after_response(): void
{
    if (!arena_v2_ready()) {
        return;
    }
    register_shutdown_function(static function (): void {
        try {
            if (function_exists('fastcgi_finish_request')) {
                fastcgi_finish_request();
            }
            arena_news_tick(db());
        } catch (Throwable $e) {
            log_error($e);
        }
    });
}

// At most one headline every 3 minutes. The slot is claimed with one atomic UPDATE so only one request writes it.
function arena_news_tick(PDO $db): void
{
    $now = time();
    $claim = $db->prepare('UPDATE arena_market SET news_at = ? WHERE id = 1 AND news_at <= ?');
    $claim->execute([$now, $now - ARENA_NEWS_EVERY]);
    if ($claim->rowCount() === 0) {
        return;
    }
    $facts = arena_news_facts($db);
    $text = arena_news_ai($facts);
    $source = 'ai';
    if ($text === null) {
        $text = arena_news_template($facts);
        $source = 'template';
    }
    $db->prepare('INSERT INTO arena_news (at, text, source) VALUES (?, ?, ?)')->execute([$now, $text, $source]);
    $db->exec('DELETE FROM arena_news WHERE at < UNIX_TIMESTAMP() - 86400');
}

// Market facts only: coin names, tickers, % moves, launches, rugs and volume. No usernames.
function arena_news_facts(PDO $db): array
{
    $tick = (int) $db->query('SELECT tick FROM arena_market WHERE id = 1')->fetchColumn();
    $since = intdiv(max(0, $tick - 600), ARENA_CANDLE_TICKS);
    $st = $db->prepare('SELECT c.id, c.name, c.reserve_l / c.reserve_c AS price, c.launched, c.rugged,
            (SELECT k.open FROM arena_candles k WHERE k.coin_id = c.id AND k.bucket >= ? ORDER BY k.bucket LIMIT 1) AS open,
            (SELECT COALESCE(SUM(k.volume), 0) FROM arena_candles k WHERE k.coin_id = c.id AND k.bucket >= ?) AS volume
        FROM arena_coins c');
    $st->execute([$since, $since]);
    $coins = [];
    foreach ($st as $r) {
        $open = (float) $r['open'];
        $coins[] = ['id' => $r['id'], 'name' => $r['name'], 'price' => (float) $r['price'], 'pct' => $open > 0 ? ((float) $r['price'] / $open - 1) * 100 : 0.0,
            'volume' => (float) $r['volume'], 'launched' => (bool) $r['launched'], 'rugged' => (bool) $r['rugged']];
    }
    $events = $db->prepare("SELECT t.kind, t.coin_id, c.name FROM arena_trades t JOIN arena_coins c ON c.id = t.coin_id WHERE t.kind IN ('launch', 'rug') AND t.tick >= ? ORDER BY t.id DESC LIMIT 5");
    $events->execute([$tick - ARENA_NEWS_EVERY]);
    return ['coins' => $coins, 'events' => $events->fetchAll()];
}

function arena_news_ai(array $facts): ?string
{
    if (env('ANTHROPIC_API_KEY') === null || !is_dir(PRIVATE_DIR . '/cache') && !@mkdir(PRIVATE_DIR . '/cache', 0770, true)) {
        return null;
    }
    if (!daily_take('ai', (int) env('DAILY_AI_CAP', '300'))) {
        return null;
    }
    $lines = [];
    foreach ($facts['events'] as $e) {
        $lines[] = ($e['kind'] === 'rug' ? 'RUG PULL: ' : 'NEW LISTING: ') . "{$e['name']} ({$e['coin_id']})";
    }
    foreach ($facts['coins'] as $c) {
        $lines[] = sprintf('%s (%s): price L$%s, %+.1f%% in 10 min, volume L$%d%s', $c['name'], $c['id'], round($c['price'], 4), $c['pct'], (int) $c['volume'], $c['rugged'] ? ', rugged' : '');
    }
    $reply = anthropic_message([
        'model' => env('ANTHROPIC_MODEL_RUNTIME', 'claude-haiku-5-5'),
        'max_tokens' => 80,
        'system' => 'You write one headline for a news ticker in a fictional practice crypto market inside a learning app for teens. '
            . 'Use only the facts given. One sentence, at most 18 words, plain English, calm, no emojis, no advice, never tell anyone to buy, sell or hold, '
            . 'no predictions, no real coins, companies or people. Mention the coin by its name or ticker from the facts. Reply with the headline only.',
        'messages' => [['role' => 'user', 'content' => "Arena facts right now:\n" . implode("\n", $lines)]],
    ], 5);
    $text = $reply ? anthropic_text($reply) : null;
    return $text === null ? null : arena_news_clean($text);
}

// Keeps a model headline only if it is one short, safe sentence.
function arena_news_clean(string $text): ?string
{
    $text = trim(preg_replace('/\s+/', ' ', trim($text, " \t\n\r\"'“”")));
    if (mb_strlen($text) < 15 || mb_strlen($text) > 200 || preg_match('/\b(you|your|should|must|invest|advice|guarantee\w*)\b/i', $text)) {
        return null;
    }
    $facts = json_decode((string) file_get_contents(REPO_ROOT . '/public/data/facts.json'), true) ?: [];
    $lower = strtolower($text);
    foreach (array_merge($facts['banned']['words'] ?? [], $facts['banned']['phrases'] ?? []) as $w) {
        if (str_contains($lower, strtolower($w))) {
            return null;
        }
    }
    $tokens = preg_split('/[^a-z0-9]+/', $lower, -1, PREG_SPLIT_NO_EMPTY);
    foreach ($facts['banned']['tickers'] ?? [] as $t) {
        if (in_array(strtolower($t), $tokens, true)) {
            return null;
        }
    }
    return $text;
}

// The fallback headline, built from the same facts.
function arena_news_template(array $facts): string
{
    foreach ($facts['events'] as $e) {
        return $e['kind'] === 'rug'
            ? "{$e['name']} ({$e['coin_id']}) crashed after its creator sold out: a textbook rug pull."
            : "New coin {$e['name']} ({$e['coin_id']}) just listed in the Arena. Early prices swing hard.";
    }
    $coins = $facts['coins'];
    usort($coins, static fn(array $a, array $b): int => abs($b['pct']) <=> abs($a['pct']));
    $top = $coins[0] ?? null;
    if ($top && abs($top['pct']) >= 1) {
        return sprintf('%s (%s) is %s %.1f%% in ten minutes as traders pile %s.', $top['name'], $top['id'], $top['pct'] > 0 ? 'up' : 'down', abs($top['pct']), $top['pct'] > 0 ? 'in' : 'out');
    }
    usort($coins, static fn(array $a, array $b): int => $b['volume'] <=> $a['volume']);
    $top = $coins[0] ?? null;
    return $top
        ? sprintf('A calm spell in the Arena: %s (%s) leads trading with L$%s changing hands.', $top['name'], $top['id'], number_format($top['volume']))
        : 'A quiet moment in the Arena. Prices are holding steady.';
}

// The daily season. On the first request after Bangkok midnight, inside the locked market transaction, the previous
// day's top 3 by net worth (no demo accounts) get gold, silver and bronze. (day, rank) is the primary key, so a medal
// can never be minted twice.
function arena_season(PDO $db): void
{
    $m = $db->query('SELECT season_day, seed FROM arena_market WHERE id = 1 FOR UPDATE')->fetch();
    $today = arena_day();
    if (!$m || $m['season_day'] === $today) {
        return;
    }
    if ($m['season_day'] !== null) {
        $day = $m['season_day'];
        $st = $db->prepare(
            'SELECT u.id, u.cash + COALESCE(SUM(h.amount * c.reserve_l / c.reserve_c), 0) AS value FROM arena_users u
             LEFT JOIN arena_holdings h ON h.user_id = u.id LEFT JOIN arena_coins c ON c.id = h.coin_id
             WHERE u.approved_at IS NOT NULL AND u.is_demo = 0 AND u.birth_year <= ? AND EXISTS (SELECT 1 FROM arena_trades t WHERE t.user_id = u.id)
             GROUP BY u.id, u.cash ORDER BY value DESC, u.id ASC LIMIT 3'
        );
        $st->execute([bangkok_year() - 13]);
        $mint = $db->prepare('INSERT IGNORE INTO arena_medals (day, `rank`, user_id, value, hash) VALUES (?, ?, ?, ?, ?)');
        foreach ($st->fetchAll() as $i => $r) {
            $rank = $i + 1;
            $mint->execute([$day, $rank, $r['id'], $r['value'], hash('sha256', "$day|$rank|{$r['id']}|{$m['seed']}")]);
        }
    }
    $db->prepare('UPDATE arena_market SET season_day = ? WHERE id = 1')->execute([$today]);
}

function arena_season_info(PDO $db): array
{
    $bkk = new DateTimeZone('Asia/Bangkok');
    $now = new DateTimeImmutable('now', $bkk);
    $st = $db->prepare('SELECT m.day, m.`rank`, u.username, m.hash FROM arena_medals m JOIN arena_users u ON u.id = m.user_id WHERE m.day >= ? ORDER BY m.day DESC, m.`rank`');
    $st->execute([$now->modify('-7 days')->format('Y-m-d')]);
    return [
        'day' => $now->format('Y-m-d'),
        'endsAt' => $now->modify('tomorrow')->getTimestamp(),
        'medals' => array_map(static fn(array $r): array => ['day' => $r['day'], 'rank' => (int) $r['rank'], 'username' => $r['username'], 'hash' => $r['hash']], $st->fetchAll()),
    ];
}
