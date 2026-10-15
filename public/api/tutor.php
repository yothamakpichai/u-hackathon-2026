<?php
// Penny companion (BRIEF §9, §16 Y5): one endpoint, four modes, short answers from Claude with guardrails both ways.
//   POST {"mode":"ask","tier":"explorer","question":"Why do prices go down?"}
//   POST {"mode":"review_run","tier":"trader","data":{...the Lab run's metrics...}}
//   POST {"mode":"explain_result","tier":"trader","data":{...the Money Check result...}}
//   POST {"mode":"explain_future","tier":"builder","data":{...Future You inputs and outputs...}}
//   -> {"ok":true,"answer":"...","source":"ai"|"cache"|"guard"}   an answer to show
//   -> {"ok":true,"fallback":true}   no key, the daily cap is reached, or the call failed: the app answers from
//                                    data/tutor_faq.json or from the same numbers instead, with no error shown
// `data` is checked against a whitelist per mode: only numbers and fixed words get through, never free text, so no
// personal details can reach the model. Penny is educational only: never a specific coin, stock, fund or trade, and
// never a price prediction.
declare(strict_types=1);

require dirname(__DIR__, 2) . '/src/bootstrap.php';
require REPO_ROOT . '/src/cache.php';
require REPO_ROOT . '/src/anthropic.php';

const TIERS = [
    'explorer' => ['name' => 'Explorer', 'ages' => '8 to 12', 'lens' => 'Money is exchange: earn, save, spend, share; waiting pays. Scarcity: make more, each is worth less.', 'coins' => 'VAULT, EDUU and PEG'],
    'trader' => ['name' => 'Trader', 'ages' => '13 to 15', 'lens' => 'Supply and demand, risk, concentration risk and hype cycles.', 'coins' => 'VAULT, EDUU, PEG, FUEL, ORBIT and ZOOMZ'],
    'builder' => ['name' => 'Builder', 'ages' => '16 and up', 'lens' => 'Token design, launch anatomy and how to recognise a rug pull or wash trading.', 'coins' => 'VAULT, EDUU, PEG, FUEL, ORBIT, ZOOMZ and BLOOP'],
];
const MAX_CHARS = 300;
const TYPES = [
    'turtle' => 'Steady Turtle: likes to wait and to play it safe',
    'eagle' => 'Patient Eagle: can wait, and is fine with ups and downs',
    'cat' => 'Cosy Cat: enjoys today and avoids risky bets',
    'monkey' => 'Spark Monkey: moves fast and loves trying new things',
];
const EVENT_IDS = ['hype_wave', 'halving', 'unlock', 'whale_dump', 'rug_pull', 'depeg_scare', 'wash_volume', 'copycat', 'copycat_rug'];
const MODES = [
    'review_run' => 'Review this practice market run from its numbers. Say one thing that went well and one thing to try next time, and link them to lab ideas (spreading risk, keeping cash, staying calm after news, scam red flags). At most 80 words.',
    'explain_result' => 'Explain this Money Check result: what the score and the Money Type mean, one strength, and one small habit to try this week. It is inspired by research but it is not a clinical or licensed assessment, so never label or judge the person. At most 80 words.',
    'explain_future' => 'Explain this Future You projection in today\'s baht: P10, P50 and P90 are a bad, a middle and a good outcome out of many simulated paths. Say it is a projection, not a prediction, and give one general idea to try, such as saving a little more or starting earlier. Never name or recommend a fund, stock, product or bank. At most 80 words.',
];

require_method('POST');
rate_limit('tutor', 6, 60);
$input = read_json(4096);

$tier = is_string($input['tier'] ?? null) ? strtolower($input['tier']) : '';
if (!isset(TIERS[$tier])) {
    send_error(400, 'BAD_INPUT', 'tier must be explorer, trader or builder.');
}
$mode = is_string($input['mode'] ?? null) ? $input['mode'] : 'ask';
if ($mode !== 'ask' && !isset(MODES[$mode])) {
    send_error(400, 'BAD_INPUT', 'mode must be ask, review_run, explain_result or explain_future.');
}
$facts = json_decode((string) file_get_contents(REPO_ROOT . '/public/data/facts.json'), true) ?: [];

if ($mode === 'ask') {
    $question = is_string($input['question'] ?? null) ? trim(preg_replace('/\s+/u', ' ', $input['question']) ?? '') : '';
    if ($question === '' || mb_strlen($question) > MAX_CHARS) {
        send_error(400, 'BAD_INPUT', 'Ask a question of 1 to ' . MAX_CHARS . ' characters.');
    }
    // Guardrails on the way in: personal details and real assets never reach the model.
    if (has_contact_details($question)) {
        answer('Please keep emails, phone numbers and links to yourself, even with me. Ask me anything about money and the lab instead!', 'guard');
    }
    if (names_real_asset($question, $facts)) {
        answer('I only talk about the coins in our lab, and I never give advice about real money or real coins. For that, a trusted adult is the best person to ask. Want to know how a lab coin like VAULT works?', 'guard');
    }
    $message = $question;
    $cacheKey = 'tutor|ask|' . $tier . '|' . mb_strtolower(preg_replace('/[^\p{L}\p{N} ]+/u', '', $question) ?? $question);
} else {
    $data = clean_data($mode, is_array($input['data'] ?? null) ? $input['data'] : []);
    $message = MODES[$mode] . "\n\nThe numbers:\n" . json_encode($data, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    $cacheKey = 'tutor|' . $mode . '|' . $tier . '|' . json_encode($data);
}

if (env('ANTHROPIC_API_KEY') === null) {
    fallback();
}
$cached = cache_get($cacheKey, 86400);
if ($cached !== null && is_string($cached['answer'] ?? null)) {
    answer($cached['answer'], 'cache');
}
if (!daily_take('ai', (int) env('DAILY_AI_CAP', '300'))) {
    fallback();
}

$reply = anthropic_message([
    'model' => env('ANTHROPIC_MODEL_RUNTIME', 'claude-haiku-5-5'),
    'max_tokens' => 300,
    // The brief asks for temperature 0.3, but this model rejects temperature as deprecated (docs/DECISIONS.md).
    // Thinking is off so all 300 tokens go to the answer.
    'thinking' => ['type' => 'disabled'],
    'system' => [['type' => 'text', 'text' => system_prompt($tier, $facts), 'cache_control' => ['type' => 'ephemeral']]],
    'messages' => [['role' => 'user', 'content' => $message]],
]);
$text = $reply === null ? null : anthropic_text($reply);
// An answer cut off by the token limit keeps only its complete sentences.
if ($text !== null && ($reply['stop_reason'] ?? '') === 'max_tokens') {
    $text = preg_match('/^.*[.!?](?=\s|$)/su', $text, $m) ? $m[0] : null;
}

// Guardrails on the way out: nothing with links, contact details or real asset names is shown.
if ($text === null || $text === '' || has_contact_details($text) || names_real_asset($text, $facts)) {
    fallback();
}
cache_put($cacheKey, ['answer' => $text]);
answer($text, 'ai');

function answer(string $text, string $source): never
{
    send_json(['ok' => true, 'answer' => $text, 'source' => $source]);
}

function fallback(): never
{
    send_json(['ok' => true, 'fallback' => true]);
}

// Only whitelisted keys, as clamped numbers, booleans or fixed words. Anything else is dropped.
function clean_data(string $mode, array $in): array
{
    $num = static fn(string $k, float $min, float $max): ?float => is_int($in[$k] ?? null) || is_float($in[$k] ?? null) ? round(max($min, min($max, (float) $in[$k])), 2) : null;
    $int = static fn(string $k, int $min, int $max): ?int => is_int($in[$k] ?? null) ? max($min, min($max, $in[$k])) : null;
    $bool = static fn(string $k): ?bool => is_bool($in[$k] ?? null) ? $in[$k] : null;
    $word = static fn(string $k, array $allowed): ?string => is_string($in[$k] ?? null) && in_array($in[$k], $allowed, true) ? $in[$k] : null;

    $out = match ($mode) {
        'review_run' => [
            'biggestSingleCoinPct' => $num('maxSingleExposurePct', 0, 100),
            'lowestCashPct' => $num('minCashPct', 0, 100),
            'panicSellsAfterBadNews' => $int('panicSellsAfterNegativeEvents', 0, 50),
            // Only Builders meet BLOOP, so its rug pull is mentioned only if it happened in this market.
            'heldBloopAtRugPull' => in_array('rug_pull', is_array($in['events'] ?? null) ? $in['events'] : [], true) ? $bool('heldBloopAtRug') : null,
            'launchedCoinWithLockedPool' => is_array($in['coinLaunched'] ?? null) && is_bool($in['coinLaunched']['lpLocked'] ?? null) ? $in['coinLaunched']['lpLocked'] : null,
            'questionsRight' => $int('quizCorrect', 0, 20),
            'questionsAsked' => $int('quizTotal', 0, 20),
            'startValueL' => $num('startValue', 0, 1e7),
            'finalValueL' => $num('finalValue', 0, 1e7),
            'practiceScore' => $int('score', 0, 100),
            'newsSeen' => array_values(array_intersect(is_array($in['events'] ?? null) ? $in['events'] : [], EVENT_IDS)),
        ],
        'explain_result' => [
            'moneyHealthScore' => $int('score', 0, 100),
            'knowledgeOf50' => $int('knowledge', 0, 50),
            'habitsOf50' => $int('behaviour', 0, 50),
            'knowledgeQuestionsRight' => $int('knowledgeCorrect', 0, 5),
            'moneyType' => TYPES[$word('type', array_keys(TYPES)) ?? ''] ?? null,
            'timeStyle' => $word('time', ['now', 'later']),
            'riskStyle' => $word('risk', ['careful', 'bold']),
            'presentBias' => $bool('presentBias'),
            'agreesMoreMoneyFixesEverything' => $bool('worship'),
            'agreesExpensiveThingsShowImportance' => $bool('status'),
        ],
        'explain_future' => [
            'ageNow' => $int('age', 8, 100),
            'goalAge' => $int('goalAge', 9, 110),
            'monthlySavingBaht' => $num('monthlySaving', 0, 1e7),
            'startBalanceBaht' => $num('startBalance', 0, 1e9),
            'inflation' => $word('inflation', ['low', 'target', 'high']),
            'weakBahtScenario' => $word('fx', ['base', 'weakBaht']) === 'weakBaht',
            'historicalShock' => $word('shock', ['1997', '2020', '2022']),
            'p10AtGoalBaht' => $num('p10', 0, 1e10),
            'p50AtGoalBaht' => $num('p50', 0, 1e10),
            'p90AtGoalBaht' => $num('p90', 0, 1e10),
        ],
    };
    return array_filter($out, static fn($v): bool => $v !== null && $v !== []);
}

function has_contact_details(string $text): bool
{
    return (bool) preg_match('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i', $text)                         // email
        || (bool) preg_match('~\b(?:https?://|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co|th|app|xyz|me|gg|ly)\b~i', $text) // link
        || (bool) preg_match('/(?:\+\d{1,3}[\s-]?\d|(?<!\d)0\d)[\d\s-]{7,13}\d/', $text);              // phone
}

function names_real_asset(string $text, array $facts): bool
{
    foreach ($facts['banned']['words'] ?? [] as $word) {
        if ($word !== 'Market Lab' && preg_match('/\b' . preg_quote($word, '/') . '\b/i', $text)) {
            return true;
        }
    }
    foreach ($facts['banned']['tickers'] ?? [] as $ticker) {
        if (preg_match('/\b' . preg_quote($ticker, '/') . '\b/', $text)) {
            return true;
        }
    }
    return false;
}

function system_prompt(string $tier, array $facts): string
{
    $t = TIERS[$tier];
    $factLines = implode("\n", array_map(static fn(array $f): string => '- ' . $f['text'], $facts['facts'] ?? []));
    return <<<PROMPT
You are Penny, a friendly round coin and a money companion for life. You live in a practice town with a School (lessons), the Market Lab (a simulated crypto market priced in L\$, Lab Dollars), a Piggy Bank (where people record their own real savings, which you never touch), Future You (projections in today's baht), a Farm, a Daily Stall and a Bank. Every coin and price in the town is simulated.

You are talking with someone at the {$t['name']} level, aged {$t['ages']}. In the Market Lab this level is about: {$t['lens']} Coins at this level: {$t['coins']}.

Facts about the Market Lab. Never contradict them:
$factLines

How to answer:
- Short, plain English a {$t['ages']} year old understands. Warm and calm. No emoji, no markdown, no links.
- Talk about money, saving, spending, borrowing, markets, blockchains and how the town works. General saving habits are fine to suggest.
- Never recommend a specific coin, stock, fund, product, bank or trade, and never predict real prices. If asked, say kindly that you can't, that the town is a safe place to practise, and that a trusted adult can help with real money.
- Never name a real coin, token, company, exchange or person. Only the lab coins exist for you.
- Never ask for personal details. If someone shares any, don't repeat them, and remind them to keep personal details private.
- If a question is off-topic or unkind, say so gently and suggest a money question instead.
- If you are not sure, say so. Never make up numbers.
- For a plain question: at most 3 short sentences and under 60 words.
PROMPT;
}
