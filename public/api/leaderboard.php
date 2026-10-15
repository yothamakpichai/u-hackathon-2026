<?php
// Leaderboard for one day's market and tier (BRIEF §3 step 6, §6). It ranks by Money Health Score, not profit,
// and stores only an auto-generated nickname, the tier, the score and the date (the file name holds tier and date).
//   GET  ?tier=explorer&date=2026-10-16[&nickname=Calm Panda 17]  -> top 10, total and your rank
//   POST {"tier":"explorer","date":"2026-10-16","score":72,"nickname":"Calm Panda 17"}
//        Adds your score, or keeps your best one. Without a valid nickname, a new one is generated.
declare(strict_types=1);

require dirname(__DIR__, 2) . '/src/bootstrap.php';

const TIERS = ['explorer', 'trader', 'builder'];
const TOP = 10;
const MAX_ENTRIES = 500;
const ADJECTIVES = ['Brave', 'Calm', 'Clever', 'Bright', 'Swift', 'Kind', 'Bold', 'Happy', 'Steady', 'Sunny',
    'Wise', 'Curious', 'Gentle', 'Mighty', 'Patient', 'Cheerful', 'Nimble', 'Quiet', 'Lucky', 'Careful'];
const ANIMALS = ['Panda', 'Otter', 'Falcon', 'Koala', 'Tiger', 'Dolphin', 'Penguin', 'Turtle', 'Rabbit', 'Elephant',
    'Lynx', 'Heron', 'Bison', 'Gecko', 'Llama', 'Badger', 'Robin', 'Seal', 'Zebra', 'Hedgehog'];

$method = require_method('GET', 'POST');
if ($method === 'GET') {
    rate_limit('board-read', 60, 60);
    $input = $_GET;
} else {
    rate_limit('board-write', 6, 600);
    $input = read_json();
}

$tier = is_string($input['tier'] ?? null) ? strtolower($input['tier']) : '';
if (!in_array($tier, TIERS, true)) {
    send_error(400, 'BAD_INPUT', 'tier must be explorer, trader or builder.');
}
$date = is_string($input['date'] ?? null) ? $input['date'] : '';
if (!in_array($date, open_dates(), true)) {
    send_error(400, 'BAD_INPUT', 'date must be today or yesterday in Bangkok time, as YYYY-MM-DD.');
}
$nickname = valid_nickname($input['nickname'] ?? null);
$file = private_path('leaderboard') . "/$date-$tier.json";

if ($method === 'GET') {
    send_json(view(read_board($file), $date, $tier, $nickname));
}

$score = $input['score'] ?? null;
if (!is_int($score) || $score < 0 || $score > 100) {
    send_error(400, 'BAD_INPUT', 'score must be a whole number from 0 to 100.');
}
$nickname ??= new_nickname();
$entries = update_board($file, static function (array $entries) use ($nickname, $score): array {
    $found = false;
    foreach ($entries as $i => $entry) {
        if ($entry['nickname'] === $nickname) {
            $entries[$i]['score'] = max($entry['score'], $score);
            $found = true;
        }
    }
    if (!$found) {
        $entries[] = ['nickname' => $nickname, 'score' => $score];
    }
    // Stable sort: on a tie, whoever reached the score first stays ahead.
    usort($entries, static fn(array $a, array $b): int => $b['score'] <=> $a['score']);
    return array_slice($entries, 0, MAX_ENTRIES);
});
send_json(view($entries, $date, $tier, $nickname));

// Today and yesterday in Bangkok time, so a market that closes just after midnight can still be posted.
function open_dates(): array
{
    $today = new DateTimeImmutable('now', new DateTimeZone('Asia/Bangkok'));
    return [$today->format('Y-m-d'), $today->modify('-1 day')->format('Y-m-d')];
}

function new_nickname(): string
{
    return ADJECTIVES[random_int(0, count(ADJECTIVES) - 1)] . ' ' . ANIMALS[random_int(0, count(ANIMALS) - 1)] . ' ' . random_int(10, 99);
}

// Only names this generator could have made are accepted, so nobody can post their own text.
function valid_nickname(mixed $value): ?string
{
    if (!is_string($value) || !preg_match('/^([A-Z][a-z]+) ([A-Z][a-z]+) ([1-9][0-9])$/', $value, $m)) {
        return null;
    }
    return in_array($m[1], ADJECTIVES, true) && in_array($m[2], ANIMALS, true) ? $value : null;
}

function read_board(string $file): array
{
    $fh = @fopen($file, 'r');
    if ($fh === false) {
        return [];
    }
    flock($fh, LOCK_SH);
    $entries = json_decode((string) stream_get_contents($fh), true);
    flock($fh, LOCK_UN);
    fclose($fh);
    return is_array($entries) ? $entries : [];
}

function update_board(string $file, callable $change): array
{
    $fh = @fopen($file, 'c+');
    if ($fh === false) {
        send_error(503, 'STORAGE', 'Saving is paused right now. Your score is still kept on this device.');
    }
    flock($fh, LOCK_EX);
    $entries = json_decode((string) stream_get_contents($fh), true);
    $entries = $change(is_array($entries) ? $entries : []);
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($entries, JSON_UNESCAPED_UNICODE));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return $entries;
}

// Ranks are shared on a tie: 1 + the number of strictly higher scores.
function view(array $entries, string $date, string $tier, ?string $nickname): array
{
    $rank = static fn(int $score): int => 1 + count(array_filter($entries, static fn(array $e): bool => $e['score'] > $score));
    $row = static fn(array $e): array => ['rank' => $rank($e['score']), 'nickname' => $e['nickname'], 'score' => $e['score']];
    $me = null;
    foreach ($entries as $entry) {
        if ($nickname !== null && $entry['nickname'] === $nickname) {
            $me = $row($entry);
        }
    }
    return [
        'ok' => true,
        'date' => $date,
        'tier' => $tier,
        'total' => count($entries),
        'top' => array_map($row, array_slice($entries, 0, TOP)),
        'me' => $me,
    ];
}
