import { hydrateIcons } from './ui.js';
import * as state from './state.js';

const SCREENS = ['home', 'transactions', 'budgets', 'settings'];
let current = null;

/* ---------------- Routing ---------------- */
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

/* ---------------- Storage notice ---------------- */
const NOTICES = {
  unavailable: "Storage isn't available, so changes will be lost when you close the app.",
  full: "Your device storage is full, so new changes can't be saved.",
  corrupt: "Saved data couldn't be read. A backup copy was kept on this device, and the app started fresh.",
};
function renderNotice() {
  const el = document.getElementById('storage-notice');
  const problem = state.storageProblem();
  el.hidden = !problem;
  el.textContent = problem ? NOTICES[problem] : '';
}

/* ---------------- Boot ---------------- */
state.init();
hydrateIcons();
renderNotice();
state.subscribe(renderNotice);
window.addEventListener('hashchange', route);
route();
document.documentElement.dataset.ready = '1';
