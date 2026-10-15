<?php
// "Ask Penny" (BRIEF §9): one question, one short answer from Claude, with guardrails on the way in and out.
//   POST {"tier":"explorer","question":"Why do prices go down?"}
//   -> {"ok":true,"answer":"...","source":"ai"|"cache"|"guard"}   an answer to show
//   -> {"ok":true,"fallback":true}   no key, the daily cap is reached, or the call failed:
//                                    the app answers from data/tutor_faq.json instead, with no error shown
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

require_method('POST');
rate_limit('tutor', 6, 60);
$input = read_json(2048);

$tier = is_string($input['tier'] ?? null) ? strtolower($input['tier']) : '';
if (!isset(TIERS[$tier])) {
    send_error(400, 'BAD_INPUT', 'tier must be explorer, trader or builder.');
}
$question = is_string($input['question'] ?? null) ? trim(preg_replace('/\s+/u', ' ', $input['question']) ?? '') : '';
if ($question === '' || mb_strlen($question) > MAX_CHARS) {
    send_error(400, 'BAD_INPUT', 'Ask a question of 1 to ' . MAX_CHARS . ' characters.');
}

// Guardrails on the way in: personal details and real assets never reach the model.
if (has_contact_details($question)) {
    answer('Please keep emails, phone numbers and links to yourself, even with me. Ask me anything about money and the lab instead!', 'guard');
}
$facts = json_decode((string) file_get_contents(REPO_ROOT . '/public/data/facts.json'), true) ?: [];
if (names_real_asset($question, $facts)) {
    answer('I only talk about the coins in our lab, and I never give advice about real money or real coins. For that, a trusted adult is the best person to ask. Want to know how a lab coin like VAULT works?', 'guard');
}

if (env('ANTHROPIC_API_KEY') === null) {
    fallback();
}
$cacheKey = 'tutor|' . $tier . '|' . mb_strtolower(preg_replace('/[^\p{L}\p{N} ]+/u', '', $question) ?? $question);
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
    'messages' => [['role' => 'user', 'content' => $question]],
]);
$text = $reply === null ? null : anthropic_text($reply);
// An answer cut off by the token limit keeps only its complete sentences.
if ($text !== null && ($reply['stop_reason'] ?? '') === 'max_tokens') {
    $text = preg_match('/^.*[.!?](?=s|$)/su', $text, $m) ? $m[0] : null;
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
You are Penny, a friendly round coin who is the guide in "the lab", a safe market simulation where kids learn how money and markets work. Prices are in L\$ (Lab Dollars). Nothing in the lab is real money.

You are talking with a player at the {$t['name']} level, aged {$t['ages']}. What this level is about: {$t['lens']} Coins at this level: {$t['coins']}.

Facts about the lab. Never contradict them:
$factLines

How to answer:
- At most 3 short sentences and under 60 words, in plain English a {$t['ages']} year old understands. Warm and calm. No emoji, no markdown, no links.
- Only talk about money, saving, markets, blockchains and how the lab and its coins work. Use a lab example when it helps.
- Never give advice about real money, real coins or real investments, and never predict prices. If asked, say kindly that you can't, that the lab is a safe place to practise, and that a trusted adult can help with real money.
- Never name a real coin, token, company, exchange or person. Only the lab coins exist for you.
- Never ask for personal details. If the player shares any, don't repeat them, and remind them to keep personal details private.
- If the question is off-topic or unkind, say so gently and suggest a question about the lab instead.
- If you are not sure, say so. Never make up numbers about the lab.
PROMPT;
}
