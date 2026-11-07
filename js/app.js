import { hydrateIcons } from './ui.js';

const SCREENS = ['home', 'transactions', 'budgets', 'settings'];
let current = null;

function route() {
  const name = location.hash.replace('#', '');
  show(SCREENS.includes(name) ? name : 'home');
}

function show(name) {
  if (name === current) return;
  const prev = current;
  current = name;
  for (const s of SCREENS) {
    const el = document.getElementById(`screen-${s}`);
    el.hidden = s !== name;
    el.classList.toggle('is-entering', s === name && prev !== null);
  }
  document.querySelectorAll('.tab').forEach((tab) => {
    if (tab.dataset.tab === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  if (prev !== null) window.scrollTo(0, 0);
}

hydrateIcons();
window.addEventListener('hashchange', route);
route();
document.documentElement.dataset.ready = '1';
