<?php
// Arena API (BRIEF §15): accounts, sessions and the shared live market. Off unless ARENA_ENABLED=1.
//   GET  ?action=status                         -> {enabled}
//   GET  ?action=quiz                           -> the 3 screening questions (no answers)
//   GET  ?action=me                             -> {user, csrf} or {user:null}
//   POST ?action=signup {username, password, birthYear, quiz:[a,b,c]}
//   POST ?action=login  {username, password}
//   POST ?action=logout                          (X-CSRF-Token)
//   POST ?action=delete                          (X-CSRF-Token) deletes the account, its sessions and holdings
//   GET  ?action=state&coin=VAULT               -> prices, candles, trades, your portfolio, leaderboard
//   POST ?action=trade  {coin, side, amount}     (X-CSRF-Token). amount = L$ to spend, or coins to sell
// Accounts hold only a username, a password hash and a birth year: no email or phone (data minimisation for minors).
declare(strict_types=1);

require dirname(__DIR__, 2) . '/src/bootstrap.php';
require REPO_ROOT . '/src/db.php';
require REPO_ROOT . '/src/arena.php';

const SESSION_COOKIE = '__Host-arena';
const SESSION_DAYS = 7;
const MIN_AGE = 13;
const QUIZ = [
    ['prompt' => 'Is the money in the Arena real?', 'options' => ['Yes, it is real money', 'No, it is simulated L$', 'Only at weekends'], 'answer' => 1],
    ['prompt' => 'What should you never share with other players?', 'options' => ['Your password or personal details', 'Your favourite lab coin', 'Your Money Health Score'], 'answer' => 0],
    ['prompt' => 'A player says a coin will “definitely 10x”. What is the smart move?', 'options' => ['Buy as much as you can now', 'Treat it as hype and check the facts', 'Tell your friends to buy it too'], 'answer' => 1],
];
const RESERVED = ['admin', 'administrator', 'mod', 'moderator', 'support', 'staff', 'system', 'root', 'bot', 'penny', 'cenedury', 'official', 'arena', 'teacher', 'marketlab'];
// A small blocklist, stored ROT13 so the repo doesn't spell it out.
const ROT13_BLOCK = ['shpx', 'fuvg', 'ovgpu', 'phag', 'qvpx', 'chffl', 'onfgneq', 'nffubyr', 'fyhg', 'juber', 'avttre', 'snttbg', 'encr', 'anmv', 'cbea', 'pbpx', 'gjng', 'jnax', 'cravf', 'frkl'];

$action = is_string($_GET['action'] ?? null) ? $_GET['action'] : '';
if ($action === 'status') {
    require_method('GET');
    send_json(['ok' => true, 'enabled' => arena_on()]);
}
if (!arena_on()) {
    send_error(404, 'ARENA_OFF', 'The Arena is closed right now.');
}

switch ($action) {
    case 'quiz':
        require_method('GET');
        send_json(['ok' => true, 'quiz' => array_map(static fn(array $q): array => ['prompt' => $q['prompt'], 'options' => $q['options']], QUIZ)]);
    case 'me':
        require_method('GET');
        $user = current_user(db());
        send_json(['ok' => true, 'user' => $user ? public_user($user) : null, 'csrf' => $user['csrf'] ?? null]);
    case 'signup':
        require_method('POST');
        same_origin();
        rate_limit('arena-signup', 30, 3600); // per IP; a class behind one school IP still fits
        signup(read_json());
    case 'login':
        require_method('POST');
        same_origin();
        rate_limit('arena-login', 60, 900); // per IP; the per-username limit in login() stops guessing
        login(read_json());
    case 'logout':
        require_method('POST');
        $user = require_user(db());
        db()->prepare('DELETE FROM arena_sessions WHERE token_hash = ?')->execute([hash('sha256', (string) $_COOKIE[SESSION_COOKIE])]);
        set_session_cookie('', -3600);
        send_json(['ok' => true]);
    case 'delete':
        require_method('POST');
        $user = require_user(db());
        db()->prepare('DELETE FROM arena_trades WHERE user_id = ?')->execute([$user['user_id']]);
        db()->prepare('DELETE FROM arena_users WHERE id = ?')->execute([$user['user_id']]);
        set_session_cookie('', -3600);
        send_json(['ok' => true]);
    case 'state':
        require_method('GET');
        rate_limit('arena-read', 120, 60);
        $user = require_user(db(), false);
        $db = db();
        $db->beginTransaction();
        arena_advance($db);
        $db->commit();
        send_json(['ok' => true] + state($db, (int) $user['user_id'], coin_param($_GET['coin'] ?? 'VAULT')));
    case 'trade':
        require_method('POST');
        $user = require_user(db());
        rate_limit('arena-trade', 30, 60);
        trade(db(), (int) $user['user_id'], read_json());
    default:
        send_error(404, 'NOT_FOUND', 'Unknown Arena action.');
}

function arena_on(): bool
{
    return env('ARENA_ENABLED') === '1';
}

// POSTs must come from this site: a cross-site form can't send JSON, and the Origin, when present, must match.
function same_origin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if ($origin !== '' && parse_url($origin, PHP_URL_HOST) . (parse_url($origin, PHP_URL_PORT) ? ':' . parse_url($origin, PHP_URL_PORT) : '') !== $host) {
        send_error(403, 'BAD_ORIGIN', 'This request has to come from the Arena page.');
    }
    if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
        send_error(415, 'BAD_INPUT', 'Send JSON.');
    }
}

function current_user(PDO $db): ?array
{
    $token = $_COOKIE[SESSION_COOKIE] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
        return null;
    }
    $st = $db->prepare('SELECT s.user_id, s.csrf, u.username, u.birth_year FROM arena_sessions s JOIN arena_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()');
    $st->execute([hash('sha256', $token)]);
    return $st->fetch() ?: null;
}

// The signed-in user; for changes, also a matching CSRF token and a same-site request.
function require_user(PDO $db, bool $change = true): array
{
    $user = current_user($db);
    if ($user === null) {
        send_error(401, 'SIGNED_OUT', 'Please log in to the Arena again.');
    }
    if ($change) {
        same_origin();
        $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!is_string($sent) || !hash_equals($user['csrf'], $sent)) {
            send_error(403, 'BAD_CSRF', 'Please reload the page and try again.');
        }
    }
    return $user;
}

function public_user(array $u): array
{
    return ['username' => $u['username'], 'birthYear' => (int) $u['birth_year']];
}

function set_session_cookie(string $value, int $seconds): void
{
    setcookie(SESSION_COOKIE, $value, ['expires' => time() + $seconds, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
}

function start_session(PDO $db, array $user): never
{
    $token = bin2hex(random_bytes(32));
    $csrf = bin2hex(random_bytes(32));
    $db->prepare('DELETE FROM arena_sessions WHERE expires_at < UTC_TIMESTAMP()')->execute();
    $db->prepare('INSERT INTO arena_sessions (token_hash, user_id, csrf, expires_at) VALUES (?, ?, ?, UTC_TIMESTAMP() + INTERVAL ' . SESSION_DAYS . ' DAY)')
        ->execute([hash('sha256', $token), $user['id'], $csrf]);
    set_session_cookie($token, SESSION_DAYS * 86400);
    send_json(['ok' => true, 'user' => public_user($user), 'csrf' => $csrf]);
}

function username_problem(string $name): ?string
{
    if (!preg_match('/^[A-Za-z][A-Za-z0-9_]{2,15}$/', $name)) {
        return 'Usernames are 3 to 16 letters, numbers or _, starting with a letter.';
    }
    $lower = strtolower($name);
    $tokens = preg_split('/[^a-z]+/', $lower, -1, PREG_SPLIT_NO_EMPTY);
    $facts = json_decode((string) file_get_contents(REPO_ROOT . '/public/data/facts.json'), true) ?: [];
    $brands = array_map('strtolower', array_merge($facts['banned']['words'] ?? [], $facts['banned']['tickers'] ?? []));
    foreach ($tokens as $t) {
        if (in_array($t, RESERVED, true) || in_array($t, $brands, true)) {
            return 'That username is reserved. Please pick another one.';
        }
    }
    foreach (ROT13_BLOCK as $word) {
        if (str_contains($lower, str_rot13($word))) {
            return 'Please pick a friendlier username.';
        }
    }
    return null;
}

// argon2id (BRIEF §15); bcrypt only if this PHP build lacks argon2.
function password_algo(): string
{
    return defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
}

function bangkok_year(): int
{
    return (int) (new DateTimeImmutable('now', new DateTimeZone('Asia/Bangkok')))->format('Y');
}

function signup(array $in): never
{
    $username = is_string($in['username'] ?? null) ? trim($in['username']) : '';
    $password = is_string($in['password'] ?? null) ? $in['password'] : '';
    $year = is_int($in['birthYear'] ?? null) ? $in['birthYear'] : 0;
    $quiz = is_array($in['quiz'] ?? null) ? array_values($in['quiz']) : [];

    if ($problem = username_problem($username)) {
        send_error(400, 'BAD_USERNAME', $problem);
    }
    if (mb_strlen($password) < 8 || mb_strlen($password) > 128) {
        send_error(400, 'BAD_PASSWORD', 'Passwords are 8 to 128 characters.');
    }
    if (strcasecmp($password, $username) === 0) {
        send_error(400, 'BAD_PASSWORD', 'Your password can’t be your username.');
    }
    $age = bangkok_year() - $year;
    if ($year < 1900 || $age < 0) {
        send_error(400, 'BAD_YEAR', 'Pick your birth year.');
    }
    if ($age < MIN_AGE) {
        send_error(403, 'TOO_YOUNG', 'The Arena opens at age 13. Keep practising in the lab!');
    }
    foreach (QUIZ as $i => $q) {
        if (($quiz[$i] ?? null) !== $q['answer']) {
            send_error(400, 'QUIZ', 'Some screening answers aren’t right yet. Read them again and try once more.');
        }
    }

    $hash = password_hash($password, password_algo());
    $db = db();
    try {
        $db->prepare('INSERT INTO arena_users (username, username_key, password_hash, birth_year, cash) VALUES (?, ?, ?, ?, ?)')
            ->execute([$username, strtolower($username), $hash, $year, ARENA_START_CASH]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            send_error(409, 'TAKEN', 'That username is taken. Please pick another one.');
        }
        throw $e;
    }
    start_session($db, ['id' => (int) $db->lastInsertId(), 'username' => $username, 'birth_year' => $year]);
}

function login(array $in): never
{
    $username = is_string($in['username'] ?? null) ? trim($in['username']) : '';
    $password = is_string($in['password'] ?? null) ? $in['password'] : '';
    rate_limit('arena-login-user', 5, 900, strtolower($username));
    $db = db();
    $st = $db->prepare('SELECT id, username, password_hash, birth_year FROM arena_users WHERE username_key = ?');
    $st->execute([strtolower($username)]);
    $user = $st->fetch();
    // Unknown usernames still cost one hash, so timing doesn't reveal which usernames exist.
    $hash = $user['password_hash'] ?? password_hash('not-a-real-password', password_algo());
    if (!password_verify($password, $hash) || !$user) {
        send_error(401, 'BAD_LOGIN', 'That username and password don’t match.');
    }
    if (password_needs_rehash($user['password_hash'], password_algo())) {
        $db->prepare('UPDATE arena_users SET password_hash = ? WHERE id = ?')->execute([password_hash($password, password_algo()), $user['id']]);
    }
    start_session($db, $user);
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
