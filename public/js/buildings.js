// Town buildings (BRIEF §16, §16.1). The Town draws one tile per entry, and app.js registers every `screen` as the
// route `#/<route>`. status 'live' opens the building; 'construction' shows scaffolding and opens one real lesson
// card instead, so a building is never a dead end. The 10:30 cut is a one-word change: set status to 'construction'.
// `why` is the ⓘ "Why this works" note; it cites only docs/SOURCES.md (see #/research for the full references).
// To add a building (for example J12's stall and bank): add an entry with its screen, then set it to 'live' only
// after it passes the checks at 360 px and 1440 px.

export const BUILDINGS = [
  {
    id: 'school',
    name: 'School',
    route: '/path',
    status: 'live',
    blurb: 'Lessons, missions and checkpoints',
    why: [
      'Money habits start early, so short daily practice matters (Whitebread & Bingham, 2013).',
      'Knowing ideas like interest, inflation and spreading risk goes with better money decisions (Lusardi & Mitchell, 2014).',
      'Financial education raises knowledge and good money habits (Kaiser, Lusardi, Menkhoff & Urban, 2022), but the effect fades without practice (Fernandes, Lynch & Netemeyer, 2014), so the path keeps you practising.',
    ],
  },
  {
    id: 'market',
    name: 'Market Lab',
    route: '/lab',
    status: 'live',
    blurb: 'Trade in today’s practice market',
    links: [
      { label: 'Create a coin', route: '/create' },
      { label: 'Block explorer', route: '/explorer' },
      { label: 'Arena', route: '/arena', arena: true },
    ],
    why: [
      'Practising with simulated money lets you make mistakes safely, before real money is involved.',
      'Spreading risk is one of the three core ideas that financial literacy surveys check (Lusardi & Mitchell, 2011).',
    ],
  },
  {
    id: 'piggy',
    name: 'Piggy Bank',
    route: '/piggy',
    screen: 'piggy',
    status: 'live',
    blurb: 'Goals for your own real savings',
    why: [
      'Money set aside for a named goal is easier to keep: labelling savings helped families save more (Soman & Cheema, 2011).',
      'People speed up as they get closer to a goal (Kivetz, Urminsky & Zheng, 2006).',
      'Fresh starts, like a birthday or a new month, are good moments to begin (Dai, Milkman & Riis, 2014).',
    ],
  },
  {
    id: 'future',
    name: 'Future You',
    route: '/future',
    screen: 'future',
    status: 'live',
    blurb: 'See how saving could grow',
    why: [
      'People who saw an aged picture of themselves chose to save more (Hershfield et al., 2011).',
      'Deciding today to save more later is easier than saving more right now (Thaler & Benartzi, 2004).',
      'Life expectancy comes from the Thai Population Gazette 2025 (Institute for Population and Social Research, Mahidol University).',
    ],
  },
  {
    id: 'farm',
    name: 'Farm',
    route: '/farm',
    screen: 'farm',
    status: 'live',
    blurb: 'A cow you earn, and an orchard',
    why: [
      'Small daily actions are how habits form (Whitebread & Bingham, 2013).',
      'A cow that gives milk every day is a productive asset: it pays you. A meme coin pays you nothing.',
    ],
  },
  {
    id: 'stall',
    name: 'Daily Stall',
    route: '/stall',
    screen: 'stall',
    status: 'live',
    blurb: 'Buy, hold and sell today’s goods',
    why: [
      'Prices for the same goods change through the day, so buying low and selling high is harder than it looks.',
      'Some goods spoil while you hold them: holding has a cost, which is why borrowing to speculate is dangerous.',
    ],
  },
  {
    id: 'bank',
    name: 'Bank',
    route: '/bank',
    screen: 'bank',
    status: 'live',
    blurb: 'Borrow, repay and build credit',
    why: [
      'A loan costs more than you borrow: the bank always shows the total before you agree.',
      'With several debts, clearing small ones first can keep people going (Gal & McShane, 2012).',
      'In the game, interest stops at the amount borrowed. Real loans have no such cap.',
    ],
  },
  {
    id: 'stocks',
    name: 'Stock Exchange',
    route: '/stocks',
    status: 'construction',
    blurb: 'Opening later',
    lesson: {
      title: 'What is a stock?',
      body: [
        'A stock, or share, is a tiny piece of a company. Owning one share of a company with a million shares means you own one millionth of it.',
        'If the company grows and earns more, its shares can become worth more, and some companies pay part of their profit to owners as dividends.',
        'If the company struggles, its share price can fall, sometimes a lot. Prices change every day as people buy and sell.',
        'Owning small pieces of many different companies spreads the risk, so one bad company can’t sink you.',
      ],
    },
    why: ['Spreading money across many companies is one of the three core ideas that financial literacy surveys check (Lusardi & Mitchell, 2011).'],
  },
  {
    id: 'gold',
    name: 'Gold Shop',
    route: '/gold',
    status: 'construction',
    blurb: 'Opening later',
    lesson: {
      title: 'How Thai gold is priced',
      body: [
        'In Thailand, bar gold is sold as 96.5% pure, and it is weighed in “baht”: one baht of bar gold is about 15.244 grams.',
        'Gold shops follow buying and selling prices announced by the Gold Traders Association of Thailand during the day.',
        'A shop buys gold back for a little less than it sells it for. That gap is how the shop earns, and it means gold bought today and sold tomorrow usually loses a little.',
      ],
      source: 'Gold Traders Association of Thailand (marked unverified in our sources until it is checked).',
    },
    why: ['Gold facts here come from the Gold Traders Association of Thailand, an entry still being checked in our sources.'],
  },
];

export const building = (id) => BUILDINGS.find((b) => b.id === id) || null;
