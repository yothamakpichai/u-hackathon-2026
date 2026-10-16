// Landing behaviour: reveal-on-scroll, the sticky nav, stat counters and the 3D scene's camera focus.
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
root.classList.add('js');

// Nav: solid background once the visitor scrolls past the hero's top.
const nav = document.querySelector('.site-nav');
const onScroll = () => nav && nav.classList.toggle('is-solid', window.scrollY > 24);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Mobile menu.
const menuBtn = document.querySelector('.site-nav__menu');
const menu = document.getElementById('site-menu');
if (menuBtn && menu) {
  menuBtn.addEventListener('click', () => {
    const open = menuBtn.getAttribute('aria-expanded') === 'true';
    menuBtn.setAttribute('aria-expanded', String(!open));
    menu.classList.toggle('is-open', !open);
  });
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      menuBtn.setAttribute('aria-expanded', 'false');
      menu.classList.remove('is-open');
    }
  });
}

// Reveal blocks as they enter the viewport. A scroll check (not IntersectionObserver) so slow devices never leave text hidden.
const pending = new Set(document.querySelectorAll('[data-reveal]'));
function revealCheck() {
  const limit = window.innerHeight * 0.92;
  for (const el of pending) {
    if (el.getBoundingClientRect().top < limit) {
      el.classList.add('is-in');
      pending.delete(el);
    }
  }
}
if (reduced) {
  pending.forEach((el) => el.classList.add('is-in'));
  pending.clear();
} else {
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        revealCheck();
      });
    }
  }, { passive: true });
  window.addEventListener('resize', revealCheck);
  revealCheck();
  // Safety net: nothing stays hidden after 5 s, whatever happens.
  setTimeout(() => { pending.forEach((el) => el.classList.add('is-in')); pending.clear(); }, 5000);
}

// Count-up numbers (decimals kept as written).
function countUp(el) {
  const end = parseFloat(el.dataset.count);
  const decimals = (el.dataset.count.split('.')[1] || '').length;
  const suffix = el.dataset.suffix || '';
  if (reduced) {
    el.textContent = end.toFixed(decimals) + suffix;
    return;
  }
  const t0 = performance.now();
  const dur = 1400;
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (end * eased).toFixed(decimals) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
const counters = document.querySelectorAll('[data-count]');
if ('IntersectionObserver' in window) {
  const co = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        countUp(e.target);
        co.unobserve(e.target);
      }
    }
  }, { threshold: 0.6 });
  counters.forEach((el) => co.observe(el));
} else {
  counters.forEach(countUp);
}

// 3D scene: only with WebGL, and not when the visitor asked to save data.
const canvas = document.getElementById('scene');
function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}
const saveData = navigator.connection && navigator.connection.saveData;
if (canvas && webglOk() && !saveData) {
  const lowPower = window.innerWidth < 768 || (navigator.hardwareConcurrency || 8) <= 4;
  import('./scene.js')
    .then(({ createScene }) => {
      const scene = createScene(canvas, { reduced, lowPower });
      root.classList.add('has-scene');
      const sections = document.querySelectorAll('[data-focus]');
      const so = new IntersectionObserver((entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) scene.setFocus(visible.target.dataset.focus);
      }, { threshold: [0.35, 0.6] });
      sections.forEach((s) => so.observe(s));
    })
    .catch(() => root.classList.add('no-webgl'));
} else {
  root.classList.add('no-webgl');
}

const askRoot = document.querySelector('[data-ask]');
if (askRoot) import('./ask.js').then(({ initAsk }) => initAsk(askRoot)).catch(() => {});

const year = document.querySelector('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());
