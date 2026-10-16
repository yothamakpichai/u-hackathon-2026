// Research (BRIEF §16): why each part of Penny works, citing only docs/SOURCES.md. References are copied from that
// file word for word; entries it marks [unverified] are shown as "being checked" and never used as facts here.
import { h, icon } from '../ui.js';

const SECTIONS = [
  {
    title: 'Money Check',
    lines: [
      'The knowledge questions use ideas from the most-used financial literacy questions: interest, inflation and spreading risk.',
      'The habit questions are adapted from the OECD/INFE toolkit.',
      'The now-or-later choices look for present bias, and the coin-flip choices are a simple version of a classic risk test.',
      'The money-belief questions use money script ideas from the Klontz Money Script Inventory.',
      'A single now-or-later choice says little about who someone will become, so Penny never treats it as a prediction.',
    ],
    refs: [
      'Lusardi, A. & Mitchell, O. S. (2011). Financial literacy around the world: an overview. Journal of Pension Economics & Finance 10(4), 497–508.',
      'Lusardi, A. & Mitchell, O. S. (2014). The economic importance of financial literacy: theory and evidence. Journal of Economic Literature 52(1), 5–44.',
      'OECD (2022). OECD/INFE Toolkit for Measuring Financial Literacy and Financial Inclusion 2022.',
      'Meier, S. & Sprenger, C. (2010). Present-biased preferences and credit card borrowing. American Economic Journal: Applied Economics 2(1), 193–210.',
      'Holt, C. A. & Laury, S. K. (2002). Risk aversion and incentive effects. American Economic Review 92(5), 1644–1655.',
      'Klontz, B., Britt, S. L., Mentzer, J. & Klontz, T. (2011). Money beliefs and financial behaviors: development of the Klontz Money Script Inventory. Journal of Financial Therapy 2(1).',
      'Klontz, B. T. & Britt, S. L. (2012). How clients’ money scripts predict their financial behaviors. Journal of Financial Planning 25(11).',
      'Watts, T. W., Duncan, G. J. & Quan, H. (2018). Revisiting the marshmallow test. Psychological Science 29(7), 1159–1177.',
    ],
  },
  {
    title: 'School and the daily streak',
    lines: [
      'Money habits form early, so short daily practice with a streak and a daily goal fits children well.',
      'Financial education raises knowledge and good habits, but the effect fades without practice, so the path keeps people practising.',
    ],
    refs: [
      'Whitebread, D. & Bingham, S. (2013). Habit formation and learning in young children. Money Advice Service / University of Cambridge.',
      'Kaiser, T., Lusardi, A., Menkhoff, L. & Urban, C. (2022). Financial education affects financial knowledge and downstream behaviors. Journal of Financial Economics 145(2), 255–272.',
      'Fernandes, D., Lynch, J. G. & Netemeyer, R. G. (2014). Financial literacy, financial education, and downstream financial behaviors. Management Science 60(8), 1861–1883.',
      'CFPB (2016). Building blocks to help youth achieve financial capability.',
    ],
  },
  {
    title: 'Piggy Bank',
    lines: ['Savings set aside for a named goal are easier to keep, people speed up near a goal, and fresh starts are a good moment to begin.'],
    refs: [
      'Soman, D. & Cheema, A. (2011). Earmarking and partitioning: increasing saving by low-income households. Journal of Marketing Research 48(SPL), S14–S22.',
      'Kivetz, R., Urminsky, O. & Zheng, Y. (2006). The goal-gradient hypothesis resurrected. Journal of Marketing Research 43(1), 39–58.',
      'Dai, H., Milkman, K. L. & Riis, J. (2014). The fresh start effect. Management Science 60(10), 2563–2582.',
    ],
  },
  {
    title: 'Future You',
    lines: [
      'Seeing an aged picture of yourself made people save more in experiments.',
      'Deciding now to save more later is easier than saving more today.',
      'The 4% rule comes from US data, so Penny never presents it as valid for Thailand.',
    ],
    refs: [
      'Hershfield, H. E. et al. (2011). Increasing saving behavior through age-progressed renderings of the future self. Journal of Marketing Research 48(SPL), S23–S37.',
      'Thaler, R. H. & Benartzi, S. (2004). Save More Tomorrow. Journal of Political Economy 112(S1), S164–S187.',
      'Institute for Population and Social Research, Mahidol University (2025). Thai Population Gazette 2025: life expectancy at birth male 72.0, female 80.1; about 22% aged 60+.',
      'Bengen, W. P. (1994). Determining withdrawal rates using historical data. Journal of Financial Planning 7(4), 171–180.',
    ],
  },
  {
    title: 'Farm',
    lines: ['Habits form when you repeat a small action every day, and missing one day does not undo the habit.'],
    refs: ['Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W. & Wardle, J. (2010). How are habits formed: modelling habit formation in the real world. European Journal of Social Psychology 40(6), 998–1009.'],
  },
  {
    title: 'Borrowing and paying debts',
    lines: [
      'When paying off several debts, clearing small ones first can keep people going.',
      'In Thailand, credit card interest is capped at 16% a year, the minimum payment is 8% through the end of 2026, and private lending is capped at 15% a year. The law caps the rate, not the total you pay.',
    ],
    refs: [
      'Gal, D. & McShane, B. B. (2012). Can small victories help win the war? Evidence from consumer debt management. Journal of Marketing Research 49(4), 487–501.',
      'Bangkok Post, "Credit card firms want to hike top rate": the credit card interest ceiling is 16% a year.',
      'The Nation: the credit card minimum payment stays at 8% through the end of 2026.',
      'Thai Civil and Commercial Code, section 654: interest on private lending is capped at 15% a year.',
    ],
  },
  {
    title: 'Prices, stocks and gold in Thailand',
    lines: [
      'The Bank of Thailand aims for inflation of 1–3% a year. In 2022 it was 6.08%, which is why Future You has a high-inflation scenario.',
      'The SET index fell from 831.57 at the end of 1996 to 372.69 at the end of 1997. Future You uses real years like this as shock tests.',
      'Thai bar gold is 96.5% pure and one baht of it weighs 15.244 g.',
    ],
    refs: [
      'Bank of Thailand, monetary policy target: headline inflation of 1–3% a year in 2026.',
      'Trade Policy and Strategy Office, Ministry of Commerce (December 2022 press release): Thai average headline inflation in 2022 was 6.08%.',
      'SET Index year-end closes: 1996 831.57, 1997 372.69, 2019 1,579.84, 2020 1,449.35, 2021 1,657.62, 2022 1,668.66.',
      'BullionStar, the Thailand gold market: Thai bar gold is 96.5% pure, 1 baht-weight = 15.244 g, and prices are set by the Gold Traders Association of Thailand.',
    ],
  },
  {
    title: 'Why it matters in Thailand',
    lines: ['Thai household debt was 85.9% of GDP in the first quarter of 2026, so learning early to save, borrow carefully and spot scams matters.'],
    refs: ['SCB EIC, reported by The Nation (15 Jul 2026): household debt 85.9% of GDP in Q1 2026.'],
  },
];

const CHECKING = [
  'THB/USD history (incl. the 1997 float).',
  'CryptoKitties congestion (Dec 2017); Axie Infinity collapse and Ronin bridge hack (Mar 2022); TerraUSD depeg (May 2022).',
  'Other yearly changes used as shock scenarios: US/global stocks 1997 about +31%, 2020 about +16%, 2022 about −18%; baht against the US dollar 1997 from about 25 to about 47 after the July float, 2020 roughly unchanged, 2022 about 4% weaker; Thai CPI 1997 about 5.6%, 2020 about −0.8%.',
  'Bank of Thailand personal loan ceilings; National Credit Bureau scoring.',
];

const ASSUMPTIONS = [
  'Long-run nominal returns: Thai stocks about 7% a year; broad global stocks about 7% a year in US dollars.',
  'Volatilities: Thai stocks about 20% a year; global stocks about 16% a year.',
  'Correlation between Thai and global stock returns: about 0.6.',
  'Deposit and bond rates: savings deposits about 0.5–1.5% a year (the model uses 1%); Thai government bonds about 2–3% a year (the model uses 2.5%).',
  'FX: the baht against the US dollar drifts near zero in the long run outside crises, with volatility of about 7% a year.',
  'High-inflation scenario: 4% a year, above the Bank of Thailand target range.',
];

export function mount(root, ctx) {
  const { navigate, store } = ctx;
  const view = h('section', { class: 'screen research' }, [
    h('div', { class: 'screen-head' }, [
      h('p', { class: 'screen-eyebrow', text: 'Why this works' }),
      h('h1', { class: 'screen-title', tabindex: '-1', text: 'The research behind Penny' }),
      h('p', { class: 'screen-sub', text: 'Each part of the town is built on published research. These are the sources we use, and only these.' }),
    ]),
    ...SECTIONS.map((s) =>
      h('section', { class: 'card research__section' }, [
        h('h2', { class: 'report-section__title', text: s.title }),
        h('ul', { class: 'privacy__list' }, s.lines.map((t) => h('li', { text: t }))),
        h('h3', { class: 'research__refs-title', text: 'Sources' }),
        h('ul', { class: 'research__refs' }, s.refs.map((t) => h('li', { text: t }))),
      ]),
    ),
    h('section', { class: 'card card--quiet research__section' }, [
      h('h2', { class: 'report-section__title', text: 'Being checked' }),
      h('p', { text: 'These sources are still being checked, so Penny labels anything that uses them.' }),
      h('ul', { class: 'research__refs' }, CHECKING.map((t) => h('li', { text: t }))),
    ]),
    h('section', { class: 'card card--quiet research__section' }, [
      h('h2', { class: 'report-section__title', text: 'Penny team assumptions (not sourced facts)' }),
      h('p', { text: 'Round numbers we chose so the simulations can run. They are not facts, and no screen presents them as facts.' }),
      h('ul', { class: 'research__refs' }, ASSUMPTIONS.map((t) => h('li', { text: t }))),
    ]),
    h('p', { class: 'research-label' }, [icon('shield', { size: 18 }), 'The Money Check is inspired by peer-reviewed research. It is not a clinical or licensed assessment.']),
    h('button', { class: 'btn btn--block', type: 'button', onClick: () => navigate(store.get().tier ? '/town' : '/') }, store.get().tier ? 'Back to my town' : 'Back to start'),
  ]);
  root.append(view);
  view.querySelector('.screen-title')?.focus({ preventScroll: true });
  return () => view.remove();
}
