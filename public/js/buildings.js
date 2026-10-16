// Town buildings (BRIEF §16, §16.1, §17). The Town shows five group buildings: school, market, future, money and
// research (§17 "Town groups"). Entries with `group: 'money'` are the places inside Money Town (#/money): they are not
// drawn in the Town, but app.js still registers every `screen` as the route `#/<route>`, so their links keep working.
// status 'live' opens the building; 'construction' shows scaffolding and opens one real lesson card instead, so a
// building is never a dead end. The cut is a one-word change: set status to 'construction'.
// `why` is the ⓘ "Why this works" note; it cites only docs/SOURCES.md (see #/research for the full references).
// To add a place to Money Town: add an entry with `group: 'money'` and its screen, then set it to 'live' only after
// it passes the checks at 360 px and 1440 px.
import * as config from '../assets/js/config.js';

// The Store buys back below its selling price (BRIEF §17: "Store spread 10%"). This is a game rule, not a fact.
// It follows config.ECONOMY.storeSpread once that lands (a fraction such as 0.1, or a percent such as 10).
const spread = Number(config.ECONOMY?.storeSpread ?? 0.1);
const SPREAD_PCT = Math.round(spread > 1 ? spread : spread * 100);
const BUY_BACK = 100 - SPREAD_PCT;

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
      'Testing yourself helps you remember for longer than reading again (Roediger & Karpicke, 2006), so every lesson ends with a quiz.',
    ],
  },
  {
    id: 'market',
    name: 'Market Lab',
    route: '/lab',
    status: 'live',
    blurb: 'Trade in today’s practice market',
    links: [
      { label: 'Coach', route: '/lab?coach=1' },
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
    id: 'future',
    name: 'Future You',
    route: '/future',
    screen: 'future',
    status: 'live',
    blurb: 'See how saving could grow',
    why: [
      'People who saw an aged picture of themselves chose to save more (Hershfield et al., 2011).',
      'A conversation with an AI-generated future self made people feel more connected to who they will become and less anxious (Pataranutaporn et al., 2024).',
      'Deciding today to save more later is easier than saving more right now (Thaler & Benartzi, 2004).',
      'Life expectancy comes from the Thai Population Gazette 2025 (Institute for Population and Social Research, Mahidol University).',
    ],
  },
  {
    id: 'money',
    name: 'Money Town',
    route: '/money',
    screen: 'money',
    status: 'live',
    blurb: 'Piggy Bank, Farm, Stall, Store and Bank',
    why: [
      'Money set aside for a named goal is easier to keep (Soman & Cheema, 2011).',
      'Habits form when you repeat a small action every day (Lally, van Jaarsveld, Potts & Wardle, 2010), so the farm grows from what you do daily.',
      'With several debts, clearing small ones first can keep people going (Gal & McShane, 2012).',
    ],
  },
  {
    id: 'research',
    name: 'Research Lab',
    route: '/research-lab',
    status: 'construction',
    blurb: 'Stocks and gold, opening later',
    lesson: {
      title: 'Stocks and gold: what they are',
      body: [
        'A stock, or share, is a tiny piece of a company. If the company grows and earns more, its shares can become worth more; if it struggles, the price can fall, sometimes a lot. Prices change every day as people buy and sell.',
        'Owning small pieces of many different companies spreads the risk, so one bad company can’t sink you.',
        'Gold is a metal, not a company: it pays no profit. In Thailand, bar gold is sold as 96.5% pure and weighed in “baht”: one baht of bar gold is about 15.244 grams.',
        'Gold shops follow buying and selling prices announced by the Gold Traders Association of Thailand. A shop buys gold back for a little less than it sells it for, so gold bought today and sold tomorrow usually loses a little.',
      ],
      source: 'BullionStar, the Thailand gold market: 96.5% bar gold, 1 baht = 15.244 g, prices set by the Gold Traders Association of Thailand.',
    },
    why: [
      'Spreading money across many companies is one of the three core ideas that financial literacy surveys check (Lusardi & Mitchell, 2011).',
      'Thai bar gold is 96.5% pure, one baht of it weighs 15.244 g, and the Gold Traders Association of Thailand sets the prices (BullionStar, the Thailand gold market).',
    ],
  },

  // ---- Inside Money Town (#/money). Not drawn in the Town; app.js still registers their screens.
  {
    id: 'piggy',
    group: 'money',
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
    id: 'farm',
    group: 'money',
    name: 'Farm + Orchard',
    route: '/farm',
    screen: 'farm',
    status: 'live',
    blurb: 'A cow you earn, and trees that take time',
    why: [
      'Habits form when you repeat a small action every day, and missing one day does not undo the habit (Lally, van Jaarsveld, Potts & Wardle, 2010).',
      'A cow that gives milk every day is a productive asset: it pays you. A meme coin pays you nothing.',
    ],
  },
  {
    id: 'stall',
    group: 'money',
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
    // The Store opens the Daily Stall's screen (#/stall, registered by the stall entry above).
    id: 'store',
    group: 'money',
    name: 'Store',
    route: '/stall',
    status: 'live',
    blurb: 'Buy and sell today’s goods',
    lesson: {
      title: 'Why a shop buys back for less',
      body: [
        'A shop has two prices for the same thing: the price it sells at, and a lower price it pays when it buys the thing back. The gap between them is called the spread.',
        `In Penny’s town the Store buys things back ${SPREAD_PCT}% below its selling price. That is a game rule we chose. Buy a tool for 100 L$ and sell it straight back, and you get ${BUY_BACK} L$.`,
        'So buying and quickly selling again loses a little every time. The spread is how a shop pays its costs, and it is why trading back and forth often costs more than it earns.',
        'Real shops, gold shops and money-exchange counters also show a buying price and a selling price. Check both before you buy.',
      ],
    },
    why: [`The Store’s ${SPREAD_PCT}% buy-back gap is a game rule, so you can feel what a spread costs before real money is involved.`],
  },
  {
    id: 'bank',
    group: 'money',
    name: 'Bank',
    route: '/bank',
    screen: 'bank',
    status: 'live',
    blurb: 'Borrow, repay and build credit',
    why: [
      'A loan costs more than you borrow: the bank always shows the total before you agree.',
      'With several debts, clearing small ones first can keep people going (Gal & McShane, 2012).',
      'In the game, interest stops at the amount borrowed. Real loans keep charging until you repay; Thai law caps the rate, not the total.',
    ],
  },
];

export const building = (id) => BUILDINGS.find((b) => b.id === id) || null;

// The five buildings drawn in the Town, in order.
export const TOWN = BUILDINGS.filter((b) => !b.group);

// The places inside one group building (Money Town).
export const placesIn = (group) => BUILDINGS.filter((b) => b.group === group);

// The Town building that holds a building: 'piggy' is in 'money'; a Town building is its own group.
export const townBuildingOf = (id) => building(id)?.group || id;
