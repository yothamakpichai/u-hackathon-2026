// Money Check scoring (BRIEF §16). Pure, so moneytype.test.mjs runs it in Node.
// Money Health Score 0–100 = knowledge (5 items, 10 points each) + behaviour (4 items, 0–3 each, scaled to 50).
// Money Type = time axis (Now / Later) × risk axis (Careful / Bold) → turtle, eagle, cat or monkey.

export function scoreMoneyCheck(items, answers) {
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  const knowledgeItems = items.filter((i) => i.kind === 'knowledge');
  const behaviourItems = items.filter((i) => i.kind === 'behaviour');
  const knowledgeCorrect = knowledgeItems.filter((i) => answers[i.id] === i.answerIndex).length;
  const behaviourSum = behaviourItems.reduce((s, i) => s + (Number.isInteger(answers[i.id]) ? answers[i.id] : 0), 0);
  const knowledge = Math.round((50 * knowledgeCorrect) / knowledgeItems.length);
  const behaviour = Math.round((50 * behaviourSum) / (3 * behaviourItems.length));

  // Waiting a month when the reward is now says "Later". Waiting only when both rewards are far off is present bias
  // (Meier & Sprenger 2010): the same month feels longer when it starts today.
  const laterNow = answers['t-now'] === by['t-now']?.later;
  const laterFar = answers['t-far'] === by['t-far']?.later;
  const time = laterNow ? 'later' : 'now';
  const presentBias = !laterNow && laterFar;

  // Choosing the coin flip when it is worth more on average (60 against 50) is bold; choosing it even against 80 is
  // bolder still (after Holt & Laury 2002).
  const flipAt50 = answers['r-flip'] === by['r-flip']?.bold;
  const flipAt80 = answers['r-safe'] === by['r-safe']?.bold;
  const risk = flipAt50 || flipAt80 ? 'bold' : 'careful';

  const agree = (id) => answers[id] === 2;
  const unsure = (id) => answers[id] === 1;
  const scripts = { worship: agree('s-worship'), status: agree('s-status'), unsure: unsure('s-worship') || unsure('s-status') };

  const type = time === 'later' ? (risk === 'careful' ? 'turtle' : 'eagle') : risk === 'careful' ? 'cat' : 'monkey';
  return { knowledgeCorrect, knowledgeTotal: knowledgeItems.length, behaviourSum, knowledge, behaviour, score: knowledge + behaviour, time, risk, presentBias, flipAt80, scripts, type };
}
