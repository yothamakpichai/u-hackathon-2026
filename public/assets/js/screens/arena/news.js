// The news desk (BRIEF §17): headlines that move the Arena, each labelled AI-written or template. Penny Pro
// (150 L$ for 7 days, paid with Arena cash, burned) sees headlines 30 s earlier. New headlines are read aloud.
import { h, money } from '../../ui.js';

const PRO_PRICE = 150;
const toMs = (v) => (typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v));
const when = (v, opts) => {
  const ms = toMs(v);
  return Number.isFinite(ms) ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', ...opts }).format(new Date(ms)) : '';
};

export function newsDesk({ api, onState }) {
  let me = null;
  let seen = null;
  const list = h('ol', { class: 'arena-news__list', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  const proLine = h('p', { class: 'arena-news__pro' });
  const buy = h('button', { class: 'btn arena-news__buy', type: 'button', onClick: buyPro }, `Get Penny Pro — ${money(PRO_PRICE, 0)} / 7 days`);
  const msg = h('p', { class: 'arena-news__msg', role: 'status' });
  const el = h('section', { class: 'card arena-news', 'aria-labelledby': 'arena-news-title' }, [
    h('div', { class: 'arena-card-head' }, [h('h2', { class: 'arena-title', id: 'arena-news-title', text: 'News desk' }), h('span', { class: 'arena-news__onair', text: 'On air' })]),
    list,
    h('p', { class: 'board__note', text: 'Pro sees headlines 30 s earlier. Headlines can move prices, but they can be wrong too.' }),
    proLine,
    buy,
    msg,
  ]);

  async function buyPro() {
    msg.textContent = '';
    if (!me) return (msg.textContent = 'Make an account to get Penny Pro.');
    if (Number(me.cash) < PRO_PRICE) return (msg.textContent = `Penny Pro costs ${money(PRO_PRICE, 0)} from your Arena wallet. Move L$ from Town first.`);
    buy.disabled = true;
    try {
      const res = await api('pro', { method: 'POST' });
      msg.textContent = 'Penny Pro is on. Headlines now reach you 30 s earlier.';
      onState?.({ ...res, me: res.me || { ...me, pro: true, proUntil: res.proUntil ?? me.proUntil, cash: res.cash ?? Number(me.cash) - PRO_PRICE } });
    } catch (err) {
      msg.textContent = err.code === 'V2_OFF' ? 'Penny Pro isn’t switched on yet.' : err.message;
    } finally {
      buy.disabled = false;
    }
  }

  return {
    el,
    update(s) {
      me = s.me;
      const news = Array.isArray(s.news) ? s.news : [];
      el.hidden = !Array.isArray(s.news);
      const ids = news.map((n, i) => String(n.id ?? i));
      const fresh = new Set(seen ? ids.filter((id) => !seen.has(id)) : []);
      if (!seen || fresh.size || list.childElementCount !== Math.max(1, news.length)) {
        list.replaceChildren(
          ...(news.length
            ? news.slice(0, 8).map((n, i) =>
                h('li', { class: `arena-news__item${fresh.has(ids[i]) ? ' is-new' : ''}` }, [
                  h('span', { class: `arena-news__src is-${n.source === 'ai' ? 'ai' : 'template'}`, text: n.source === 'ai' ? 'AI-written headline' : 'Template headline' }),
                  h('span', { class: 'arena-news__text', text: n.text }),
                  n.at ? h('time', { class: 'arena-news__at', text: when(n.at, { hour: '2-digit', minute: '2-digit' }) }) : null,
                ]),
              )
            : [h('li', { class: 'arena-news__item is-empty', text: 'No headlines yet. Quiet markets happen too.' })]),
        );
      }
      seen = new Set(ids);
      const proUntil = me?.pro && me.proUntil ? when(me.proUntil, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      proLine.textContent = me?.pro ? `You have Penny Pro${proUntil ? ` until ${proUntil}` : ''}.` : '';
      proLine.hidden = !me?.pro;
      buy.hidden = Boolean(me?.pro) || !me || s.canTrade === false;
    },
  };
}
