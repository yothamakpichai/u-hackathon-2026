<?php
// Optional accounts, saving across devices and the parent link (BRIEF §16). Guest play is the default; this only
// works when the database is set up (DB_* and bin/migrate.php), and the app hides accounts otherwise.
//   GET  ?action=status                 -> {enabled, email}
//   GET  ?action=quiz                   -> the 3 safety questions (no answers)
//   GET  ?action=me                     -> {user, csrf} or {user:null}
//   POST ?action=signup {username, password, birthYear, quiz:[a,b,c]}   POST ?action=login {username, password}
//   POST ?action=demo                   -> a 24-hour judge-demo account "Demo-XXXX", signed in like a login (+demo:true)
//   POST ?action=logout | delete        (X-CSRF-Token)
//   GET  ?action=state                  -> {state, updatedAt, confirmations}      the saved progress
//   POST ?action=state {state, updatedAt} (X-CSRF-Token)                          save progress (newest wins)
//   GET  ?action=parent_status          POST ?action=parent_create | parent_revoke (X-CSRF-Token)
//   GET  ?action=parent_view&t=TOKEN    -> a read-only progress snapshot for the parent
//   POST ?action=parent_confirm {t, entryId}     POST ?action=parent_reset {t, password}
//   POST ?action=parent_approve {t}              POST ?action=parent_decline {t}    (accounts of under-13s)
// No email or phone for children: a parent link resets a forgotten password instead.
declare(strict_types=1);

require dirname(__DIR__, 2) . '/src/bootstrap.php';
require REPO_ROOT . '/src/db.php';
require REPO_ROOT . '/src/accounts.php';
require REPO_ROOT . '/src/arena.php';

const MAX_STATE_BYTES = 300000;

$action = is_string($_GET['action'] ?? null) ? $_GET['action'] : '';
if ($action === 'status') {
    require_method('GET');
    // A recovery email for adults needs a mail provider; until one is configured the field stays hidden.
    send_json(['ok' => true, 'enabled' => accounts_ready(), 'email' => false]);
}
if (!accounts_ready()) {
    send_error(503, 'ACCOUNTS_OFF', 'Accounts aren’t available right now. Everything still works as a guest.');
}
$db = db();

switch ($action) {
    case 'quiz':
        require_method('GET');
        send_json(['ok' => true, 'quiz' => array_map(static fn(array $q): array => ['prompt' => $q['prompt'], 'options' => $q['options']], ACCOUNT_QUIZ)]);
    case 'me':
        require_method('GET');
        $user = current_user($db);
        send_json(['ok' => true, 'user' => $user ? public_user($user) : null, 'csrf' => $user['csrf'] ?? null]);
    case 'signup':
        require_method('POST');
        same_origin();
        rate_limit('signup', 30, 3600); // per IP; a class behind one school IP still fits
        signup(read_json());
    case 'login':
        require_method('POST');
        same_origin();
        rate_limit('login', 60, 900); // per IP; login() also limits each username
        login(read_json());
    case 'demo':
        require_method('POST');
        same_origin();
        if (!arena_v2_ready()) {
            send_error(503, 'V2_OFF', 'Demo accounts aren’t available right now. You can make a normal account instead.');
        }
        rate_limit('demo', 5, 3600); // per IP
        demo_signup($db);
    case 'logout':
        require_method('POST');
        require_user($db);
        end_session($db);
        send_json(['ok' => true]);
    case 'delete':
        require_method('POST');
        $user = require_user($db);
        $db->prepare('DELETE FROM arena_trades WHERE user_id = ?')->execute([$user['user_id']]);
        if (arena_v2_ready()) {
            // A launched coin outlives its creator, who is no longer named (there is no foreign key to cascade).
            $db->prepare('UPDATE arena_coins SET creator_id = NULL WHERE creator_id = ?')->execute([$user['user_id']]);
        }
        $db->prepare('DELETE FROM arena_users WHERE id = ?')->execute([$user['user_id']]);
        set_session_cookie('', -3600);
        send_json(['ok' => true]);
    case 'state':
        rate_limit('state', 60, 60);
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
            $user = require_user($db, false);
            send_json(['ok' => true] + saved_state($db, (int) $user['user_id']));
        }
        require_method('POST');
        $user = require_user($db);
        save_state($db, (int) $user['user_id'], read_json(MAX_STATE_BYTES));
    case 'parent_status':
        require_method('GET');
        $user = require_user($db, false);
        $st = $db->prepare('SELECT created_at FROM parent_links WHERE user_id = ? ORDER BY created_at DESC LIMIT 1');
        $st->execute([$user['user_id']]);
        $at = $st->fetchColumn();
        send_json(['ok' => true, 'linked' => $at !== false, 'createdAt' => $at ?: null]);
    case 'parent_create':
        require_method('POST');
        $user = require_user($db);
        // One link per child: a new link replaces the old one, so a lost link can always be switched off.
        send_json(['ok' => true, 'token' => new_parent_token($db, (int) $user['user_id'])]);
    case 'parent_revoke':
        require_method('POST');
        $user = require_user($db);
        $db->prepare('DELETE FROM parent_links WHERE user_id = ?')->execute([$user['user_id']]);
        send_json(['ok' => true]);
    case 'parent_view':
        require_method('GET');
        rate_limit('parent', 60, 60);
        $child = parent_child($db, $_GET['t'] ?? null);
        if ($child['approved_at'] === null) {
            send_json(['ok' => true, 'pending' => true, 'child' => ['username' => $child['username'], 'age' => bangkok_year() - (int) $child['birth_year']]]);
        }
        send_json(['ok' => true] + snapshot($db, $child));
    case 'parent_approve':
    case 'parent_decline':
        require_method('POST');
        same_origin();
        rate_limit('parent-write', 30, 60);
        $child = parent_child($db, read_json()['t'] ?? null);
        if ($child['approved_at'] !== null) {
            send_json(['ok' => true, 'approved' => true]);
        }
        if ($action === 'parent_approve') {
            $db->prepare('UPDATE arena_users SET approved_at = UTC_TIMESTAMP() WHERE id = ? AND approved_at IS NULL')->execute([$child['id']]);
            send_json(['ok' => true, 'approved' => true]);
        }
        // Declining removes the waiting account entirely; the child keeps playing as a guest.
        $db->prepare('DELETE FROM arena_users WHERE id = ? AND approved_at IS NULL')->execute([$child['id']]);
        send_json(['ok' => true, 'approved' => false]);
    case 'parent_confirm':
        require_method('POST');
        same_origin();
        rate_limit('parent-write', 30, 60);
        $in = read_json();
        $child = parent_child($db, $in['t'] ?? null);
        $entry = is_string($in['entryId'] ?? null) && preg_match('/^[A-Za-z0-9_-]{1,40}$/', $in['entryId']) ? $in['entryId'] : null;
        if ($entry === null) {
            send_error(400, 'BAD_INPUT', 'Pick an entry to confirm.');
        }
        $db->prepare('INSERT IGNORE INTO piggy_confirmations (user_id, entry_id) VALUES (?, ?)')->execute([$child['id'], $entry]);
        send_json(['ok' => true]);
    case 'parent_reset':
        require_method('POST');
        same_origin();
        rate_limit('parent-reset', 5, 900);
        $in = read_json();
        $child = parent_child($db, $in['t'] ?? null);
        $password = is_string($in['password'] ?? null) ? $in['password'] : '';
        if ($problem = password_problem($password, $child['username'])) {
            send_error(400, 'BAD_PASSWORD', $problem);
        }
        $db->prepare('UPDATE arena_users SET password_hash = ? WHERE id = ?')->execute([password_hash($password, password_algo()), $child['id']]);
        $db->prepare('DELETE FROM arena_sessions WHERE user_id = ?')->execute([$child['id']]); // every device must log in again
        send_json(['ok' => true]);
    default:
        send_error(404, 'NOT_FOUND', 'Unknown account action.');
}

function saved_state(PDO $db, int $userId): array
{
    $st = $db->prepare('SELECT state, updated_at FROM account_state WHERE user_id = ?');
    $st->execute([$userId]);
    $row = $st->fetch();
    $c = $db->prepare('SELECT entry_id FROM piggy_confirmations WHERE user_id = ?');
    $c->execute([$userId]);
    return [
        'state' => $row ? json_decode($row['state'], true) : null,
        'updatedAt' => $row ? (int) $row['updated_at'] : 0,
        'confirmations' => $c->fetchAll(PDO::FETCH_COLUMN),
    ];
}

// Newest copy wins: an older device can't overwrite progress saved later from another one.
function save_state(PDO $db, int $userId, array $in): never
{
    $state = $in['state'] ?? null;
    $at = $in['updatedAt'] ?? null;
    if (!is_array($state) || !is_int($at) || $at <= 0) {
        send_error(400, 'BAD_INPUT', 'Send the progress as {state, updatedAt}.');
    }
    $json = json_encode($state, JSON_UNESCAPED_UNICODE);
    if ($json === false || strlen($json) > MAX_STATE_BYTES) {
        send_error(413, 'TOO_LARGE', 'That progress is too large to save.');
    }
    $db->prepare('INSERT INTO account_state (user_id, state, updated_at) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE state = IF(VALUES(updated_at) >= updated_at, VALUES(state), state), updated_at = GREATEST(updated_at, VALUES(updated_at))')
        ->execute([$userId, $json, $at]);
    send_json(['ok' => true, 'updatedAt' => $at]);
}

function parent_child(PDO $db, mixed $token): array
{
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
        send_error(404, 'NO_LINK', 'This parent link doesn’t work. Ask your child to make a new one in their account.');
    }
    $st = $db->prepare('SELECT u.id, u.username, u.birth_year, u.approved_at FROM parent_links p JOIN arena_users u ON u.id = p.user_id WHERE p.token_hash = ?');
    $st->execute([hash('sha256', $token)]);
    $child = $st->fetch();
    if (!$child) {
        send_error(404, 'NO_LINK', 'This parent link doesn’t work any more. Ask your child to make a new one in their account.');
    }
    return $child;
}

// What a parent sees: progress, never the child's password or anything typed to Penny.
function snapshot(PDO $db, array $child): array
{
    $saved = saved_state($db, (int) $child['id']);
    $s = is_array($saved['state']) ? $saved['state'] : [];
    $confirmed = array_flip($saved['confirmations']);
    $piggy = is_array($s['piggy'] ?? null) ? $s['piggy'] : [];
    $goals = [];
    foreach (is_array($piggy['goals'] ?? null) ? $piggy['goals'] : [] as $g) {
        if (!is_array($g) || !isset($g['id'])) {
            continue;
        }
        $saved_in = 0.0;
        foreach (is_array($piggy['entries'] ?? null) ? $piggy['entries'] : [] as $e) {
            if (is_array($e) && ($e['goalId'] ?? null) === $g['id']) {
                $saved_in += ($e['kind'] ?? '') === 'in' ? (float) ($e['amount'] ?? 0) : -(float) ($e['amount'] ?? 0);
            }
        }
        $goals[] = ['id' => (string) $g['id'], 'name' => mb_substr((string) ($g['name'] ?? ''), 0, 30), 'target' => (float) ($g['target'] ?? 0), 'saved' => round($saved_in, 2)];
    }
    $entries = [];
    foreach (array_slice(array_reverse(is_array($piggy['entries'] ?? null) ? $piggy['entries'] : []), 0, 30) as $e) {
        if (!is_array($e) || !isset($e['id'])) {
            continue;
        }
        $entries[] = ['id' => (string) $e['id'], 'date' => (string) ($e['date'] ?? ''), 'kind' => ($e['kind'] ?? '') === 'out' ? 'out' : 'in', 'amount' => (float) ($e['amount'] ?? 0), 'goalId' => $e['goalId'] ?? null, 'verified' => isset($confirmed[(string) $e['id']]) || !empty($e['verified'])];
    }
    $a = is_array($s['assessment'] ?? null) ? $s['assessment'] : null;
    $tier = is_string($s['tier'] ?? null) ? $s['tier'] : null;
    $run = $tier && is_array($s['lab'][$tier] ?? null) ? $s['lab'][$tier] : null;
    $progress = is_array($s['progress'] ?? null) ? $s['progress'] : [];
    $done = 0;
    foreach (is_array($s['path'] ?? null) ? $s['path'] : [] as $p) {
        $done += is_array($p['done'] ?? null) ? count($p['done']) : 0;
    }
    $chapters = 0;
    foreach (is_array($s['coach'] ?? null) ? $s['coach'] : [] as $c) {
        $chapters += is_array($c['done'] ?? null) ? count($c['done']) : 0;
    }
    return [
        'child' => ['username' => $child['username'], 'age' => bangkok_year() - (int) $child['birth_year']],
        'savedAt' => $saved['updatedAt'],
        'moneyCheck' => $a ? ['score' => (int) ($a['score'] ?? 0), 'type' => (string) ($a['type'] ?? '')] : null,
        'xp' => (int) ($progress['xp'] ?? 0),
        'streak' => streak(is_array($progress['days'] ?? null) ? $progress['days'] : []),
        'pathSteps' => $done,
        'coachChapters' => $chapters,
        'market' => $run && is_array($run['metrics'] ?? null) ? ['date' => (string) ($run['date'] ?? ''), 'biggestCoinPct' => (float) ($run['metrics']['maxSingleExposurePct'] ?? 0), 'lowestCashPct' => (float) ($run['metrics']['minCashPct'] ?? 0), 'panicSells' => (int) ($run['metrics']['panicSellsAfterNegativeEvents'] ?? 0)] : null,
        'piggy' => ['goals' => $goals, 'entries' => $entries],
    ];
}

// Consecutive Bangkok days with at least one action, ending today or yesterday (as in progress.js).
function streak(array $days): int
{
    $day = new DateTimeImmutable('now', new DateTimeZone('Asia/Bangkok'));
    if (empty($days[$day->format('Y-m-d')]['actions'])) {
        $day = $day->modify('-1 day');
    }
    $n = 0;
    while (!empty($days[$day->format('Y-m-d')]['actions'])) {
        $n++;
        $day = $day->modify('-1 day');
    }
    return $n;
}
