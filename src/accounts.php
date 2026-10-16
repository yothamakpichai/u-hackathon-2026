<?php
// Optional accounts (BRIEF §16): a username, a password and a birth year, nothing else. Shared by api/account.php
// and api/arena.php. One session cookie (__Host-penny: Secure, HttpOnly, SameSite=Lax); only its SHA-256 is stored,
// next to a per-session CSRF token that every change must send back as X-CSRF-Token.
declare(strict_types=1);

const SESSION_COOKIE = '__Host-penny';
const SESSION_DAYS = 30;
const ACCOUNT_MIN_AGE = 8;
// Accounts for players under this age stay inactive until a parent approves them through the parent link.
const PARENT_APPROVAL_AGE = 13;
const ACCOUNT_QUIZ = [
    ['prompt' => 'Is the money in Penny’s town real?', 'options' => ['Yes, it is real money', 'No, it is simulated, except the savings you record', 'Only at weekends'], 'answer' => 1],
    ['prompt' => 'What should you never share with other players?', 'options' => ['Your password or personal details', 'Your favourite lab coin', 'Your Money Health Score'], 'answer' => 0],
    ['prompt' => 'A player says a coin will “definitely 10x”. What is the smart move?', 'options' => ['Buy as much as you can now', 'Treat it as hype and check the facts', 'Tell your friends to buy it too'], 'answer' => 1],
];
const RESERVED_NAMES = ['admin', 'administrator', 'mod', 'moderator', 'support', 'staff', 'system', 'root', 'bot', 'penny', 'cenedury', 'official', 'arena', 'teacher', 'parent', 'marketlab'];
// A small blocklist, stored ROT13 so the repo doesn't spell it out.
const ROT13_BLOCK = ['shpx', 'fuvg', 'ovgpu', 'phag', 'qvpx', 'chffl', 'onfgneq', 'nffubyr', 'fyhg', 'juber', 'avttre', 'snttbg', 'encr', 'anmv', 'cbea', 'pbpx', 'gjng', 'jnax', 'cravf', 'frkl'];

// Accounts need the database: DB_* set and bin/migrate.php run. Without it, everyone simply plays as a guest.
function accounts_ready(): bool
{
    if (env('DB_NAME') === null || env('DB_USER') === null) {
        return false;
    }
    try {
        db()->query('SELECT 1 FROM arena_users LIMIT 1');
        db()->query('SELECT 1 FROM account_state LIMIT 1');
        return true;
    } catch (Throwable) {
        return false;
    }
}

function password_algo(): string
{
    return defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT; // argon2id; bcrypt only if PHP lacks it
}

function bangkok_year(): int
{
    return (int) (new DateTimeImmutable('now', new DateTimeZone('Asia/Bangkok')))->format('Y');
}

function age_of(array $user): int
{
    return bangkok_year() - (int) $user['birth_year'];
}

// POSTs must come from this site: a cross-site form can't send JSON, and the Origin, when present, must match.
function same_origin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if ($origin !== '' && parse_url($origin, PHP_URL_HOST) . (parse_url($origin, PHP_URL_PORT) ? ':' . parse_url($origin, PHP_URL_PORT) : '') !== $host) {
        send_error(403, 'BAD_ORIGIN', 'This request has to come from Penny’s own page.');
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
    $st = $db->prepare('SELECT s.user_id, s.csrf, u.username, u.birth_year FROM arena_sessions s JOIN arena_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() AND u.approved_at IS NOT NULL');
    $st->execute([hash('sha256', $token)]);
    return $st->fetch() ?: null;
}

// The signed-in user; for changes, also a matching CSRF token and a same-site request.
function require_user(PDO $db, bool $change = true): array
{
    $user = current_user($db);
    if ($user === null) {
        send_error(401, 'SIGNED_OUT', 'Please log in again.');
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

function end_session(PDO $db): void
{
    $token = $_COOKIE[SESSION_COOKIE] ?? '';
    if (is_string($token) && $token !== '') {
        $db->prepare('DELETE FROM arena_sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
    }
    set_session_cookie('', -3600);
}

// One parent link per child: a new link replaces the old one. Only the token's hash is stored.
function new_parent_token(PDO $db, int $userId): string
{
    $db->prepare('DELETE FROM parent_links WHERE user_id = ?')->execute([$userId]);
    $token = bin2hex(random_bytes(32));
    $db->prepare('INSERT INTO parent_links (token_hash, user_id) VALUES (?, ?)')->execute([hash('sha256', $token), $userId]);
    return $token;
}

function username_problem(string $name): ?string
{
    if (!preg_match('/^[A-Za-z][A-Za-z0-9_]{2,15}$/', $name)) {
        return 'Usernames are 3 to 16 letters, numbers or _, starting with a letter. Don’t use your real name.';
    }
    $lower = strtolower($name);
    $tokens = preg_split('/[^a-z]+/', $lower, -1, PREG_SPLIT_NO_EMPTY);
    $facts = json_decode((string) file_get_contents(REPO_ROOT . '/public/data/facts.json'), true) ?: [];
    $brands = array_map('strtolower', array_merge($facts['banned']['words'] ?? [], $facts['banned']['tickers'] ?? []));
    foreach ($tokens as $t) {
        if (in_array($t, RESERVED_NAMES, true) || in_array($t, $brands, true)) {
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

function password_problem(string $password, string $username = ''): ?string
{
    if (mb_strlen($password) < 8 || mb_strlen($password) > 128) {
        return 'Passwords are 8 to 128 characters.';
    }
    if ($username !== '' && strcasecmp($password, $username) === 0) {
        return 'Your password can’t be your username.';
    }
    return null;
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
    if ($problem = password_problem($password, $username)) {
        send_error(400, 'BAD_PASSWORD', $problem);
    }
    $age = bangkok_year() - $year;
    if ($year < 1900 || $age < 0) {
        send_error(400, 'BAD_YEAR', 'Pick your birth year.');
    }
    if ($age < ACCOUNT_MIN_AGE) {
        send_error(403, 'TOO_YOUNG', 'Accounts start at age 8. You can keep playing as a guest with a grown-up.');
    }
    foreach (ACCOUNT_QUIZ as $i => $q) {
        if (($quiz[$i] ?? null) !== $q['answer']) {
            send_error(400, 'QUIZ', 'Some answers to the 3 safety questions aren’t right yet. Read them again and try once more.');
        }
    }

    $db = db();
    $pending = $age < PARENT_APPROVAL_AGE;
    try {
        $db->prepare('INSERT INTO arena_users (username, username_key, password_hash, birth_year, cash, approved_at) VALUES (?, ?, ?, ?, ?, ' . ($pending ? 'NULL' : 'UTC_TIMESTAMP()') . ')')
            ->execute([$username, strtolower($username), password_hash($password, password_algo()), $year, 1000]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            send_error(409, 'TAKEN', 'That username is taken. Please pick another one.');
        }
        throw $e;
    }
    $user = ['id' => (int) $db->lastInsertId(), 'username' => $username, 'birth_year' => $year];
    if ($pending) {
        // No session yet: the account switches on when a parent approves it. Guest play goes on meanwhile.
        send_json(['ok' => true, 'pending' => true, 'user' => public_user($user), 'parentToken' => new_parent_token($db, $user['id'])]);
    }
    start_session($db, $user);
}

function login(array $in): never
{
    $username = is_string($in['username'] ?? null) ? trim($in['username']) : '';
    $password = is_string($in['password'] ?? null) ? $in['password'] : '';
    rate_limit('login-user', 5, 900, strtolower($username));
    $db = db();
    $st = $db->prepare('SELECT id, username, password_hash, birth_year, approved_at FROM arena_users WHERE username_key = ?');
    $st->execute([strtolower($username)]);
    $user = $st->fetch();
    // Unknown usernames still cost one hash, so timing doesn't reveal which usernames exist.
    $hash = $user['password_hash'] ?? password_hash('not-a-real-password', password_algo());
    if (!password_verify($password, $hash) || !$user) {
        send_error(401, 'BAD_LOGIN', 'That username and password don’t match.');
    }
    if ($user['approved_at'] === null) {
        // Still waiting for a parent: hand the child a fresh link to show them (it replaces any earlier one).
        send_json(['ok' => false, 'error' => ['code' => 'NEEDS_PARENT', 'message' => 'Your account is waiting for a parent to approve it. Show them your parent link. You can keep playing as a guest meanwhile.'], 'parentToken' => new_parent_token($db, (int) $user['id']), 'user' => public_user($user)], 403);
    }
    if (password_needs_rehash($user['password_hash'], password_algo())) {
        $db->prepare('UPDATE arena_users SET password_hash = ? WHERE id = ?')->execute([password_hash($password, password_algo()), $user['id']]);
    }
    start_session($db, $user);
}
