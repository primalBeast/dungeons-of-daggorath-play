import {
  CREATURE_DB, CREATURE_MAP_COLORS,
  creatureDisplayName, creaturesByThreat,
} from './data.js';

function formatStat(label, value) {
  const row = document.createElement('div');
  row.className = 'creature-stat';
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  row.append(dt, dd);
  return row;
}

function buildStats(type) {
  const db = CREATURE_DB[type];
  const dl = document.createElement('dl');
  dl.className = 'creature-stats';
  dl.append(
    formatStat('HP', String(db.hp)),
    formatStat('Magic', `${db.mgo} / ${db.mgd}`),
    formatStat('Physical', `${db.pho} / ${db.phd}`),
    formatStat('Move', `${db.move} ms`),
    formatStat('Attack', `${db.atk} ms`),
  );
  return dl;
}

export function initCreatureUI({ dialog, listEl, game, onClose }) {
  function renderList() {
    listEl.replaceChildren();
    for (const type of creaturesByThreat()) {
      const li = document.createElement('li');
      li.className = 'creature-entry';

      const portrait = document.createElement('canvas');
      portrait.className = 'creature-portrait';
      portrait.width = 240;
      portrait.height = 240;
      portrait.setAttribute('aria-hidden', 'true');

      const info = document.createElement('div');
      info.className = 'creature-info';

      const heading = document.createElement('h3');
      heading.className = 'creature-name';
      const swatch = document.createElement('span');
      swatch.className = 'creature-swatch';
      swatch.style.background = CREATURE_MAP_COLORS[type];
      heading.append(swatch, document.createTextNode(creatureDisplayName(type)));

      info.append(heading, buildStats(type));
      li.append(portrait, info);
      listEl.appendChild(li);

      game.renderer.drawCreaturePortrait(portrait, type);
    }
  }

  function show() {
    if (!dialog || !listEl) return;
    if (dialog.open) return;
    renderList();
    game.pause();
    dialog.showModal();
  }

  dialog.addEventListener('close', () => {
    game.resume();
    onClose?.();
  });

  return { show };
}