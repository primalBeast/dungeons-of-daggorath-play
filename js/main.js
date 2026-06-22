import { Game } from './game.js';
import { buildMapLegendHtml } from './map-legend.js';
import { initThemeUI } from './theme-ui.js';
import { initCreatureUI } from './creature-ui.js';

const canvas = document.getElementById('viewport');
const minimap = document.getElementById('minimap');
const mapLegend = document.getElementById('map-legend');
const heart = document.getElementById('heart');
const logEl = document.getElementById('log');
const input = document.getElementById('command-input');
const form = document.getElementById('command-form');
const leftHand = document.getElementById('left-hand');
const rightHand = document.getElementById('right-hand');
const levelLabel = document.getElementById('level-label');
const overlay = document.getElementById('overlay');
const helpBtn = document.getElementById('btn-help');
const restartBtn = document.getElementById('btn-restart');
const helpDialog = document.getElementById('help-dialog');
const themeDialog = document.getElementById('theme-dialog');
const themeList = document.getElementById('theme-list');
const creaturesDialog = document.getElementById('creatures-dialog');
const creaturesList = document.getElementById('creatures-list');

const ui = {
  canvas,
  minimap,
  heart,
  setLog(text) {
    logEl.textContent = text;
    logEl.scrollTop = 0;
  },
  setHands(left, right) {
    leftHand.textContent = left;
    rightHand.textContent = right;
  },
  setLevel(level) {
    levelLabel.textContent = `Level ${level + 1}`;
    this._legendLevel = -1;
  },
  showOverlay(text) {
    overlay.textContent = text;
    overlay.classList.remove('hidden');
  },
  hideOverlay() {
    overlay.classList.add('hidden');
  },
  _legendLevel: -1,
  updateMapLegend(level) {
    if (!mapLegend || level === this._legendLevel) return;
    this._legendLevel = level;
    mapLegend.innerHTML = buildMapLegendHtml(level);
  },
  showHelp() {
    if (helpDialog.open) return;
    game.pause();
    helpDialog.showModal();
  },
  showTheme() {
    themeUi.show();
  },
  showCreatures() {
    creatureUi.show();
  },
  focusCommand() {
    input.focus();
  },
};

let game;

if (!minimap) {
  console.error('Missing #minimap canvas — hard-refresh the page (Ctrl+F5).');
}

let themeUi;
let creatureUi = { show() {} };

try {
  game = new Game(ui);
  if (themeDialog && themeList) {
    themeUi = initThemeUI({
      dialog: themeDialog,
      listEl: themeList,
      game,
      onClose: () => ui.focusCommand(),
    });
    themeUi.applySaved();
  }
  if (creaturesDialog && creaturesList) {
    creatureUi = initCreatureUI({
      dialog: creaturesDialog,
      listEl: creaturesList,
      game,
      onClose: () => ui.focusCommand(),
    });
  }
} catch (err) {
  ui.setLog(`Failed to start game: ${err.message}`);
  throw err;
}

function restartGame() {
  if (helpDialog.open) helpDialog.close();
  if (themeDialog.open) themeDialog.close();
  if (creaturesDialog.open) creaturesDialog.close();
  game.newGame();
  input.value = '';
  ui.focusCommand();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const line = input.value;
  input.value = '';
  if (game.dead || game.won) {
    restartGame();
    return;
  }
  if (!line.trim()) {
    game.audio.resume();
    game.handleCommand('f');
    return;
  }
  game.audio.resume();
  game.handleCommand(line);
});

helpBtn.addEventListener('click', () => ui.showHelp());
restartBtn.addEventListener('click', () => restartGame());

helpDialog.addEventListener('close', () => {
  game.resume();
  ui.focusCommand();
});

const ARROW_COMMANDS = {
  ArrowUp: 'm',
  ArrowRight: 't r',
  ArrowLeft: 't l',
  ArrowDown: 't a',
};

document.addEventListener('keydown', (e) => {
  if (themeDialog.open && themeUi?.handleKeydown?.(e)) {
    e.preventDefault();
    return;
  }

  const arrowCmd = ARROW_COMMANDS[e.key];
  if (arrowCmd) {
    if (helpDialog.open || themeDialog.open || creaturesDialog.open) return;
    if (game.dead || game.won) return;
    e.preventDefault();
    game.audio.resume();
    game.handleCommand(arrowCmd);
    return;
  }

  if (
    e.key === 'Enter'
    && (game.dead || game.won)
    && !helpDialog.open
    && !themeDialog.open
    && !creaturesDialog.open
  ) {
    e.preventDefault();
    restartGame();
    return;
  }

  if (e.key !== 'Escape') return;
  if (helpDialog.open) {
    e.preventDefault();
    helpDialog.close();
    return;
  }
  if (themeDialog.open) {
    e.preventDefault();
    themeDialog.close();
    return;
  }
  if (creaturesDialog.open) {
    e.preventDefault();
    creaturesDialog.close();
  }
});

document.addEventListener('click', (e) => {
  if (e.target.closest('#help-dialog, #theme-dialog, #creatures-dialog')) return;
  ui.focusCommand();
});

try {
  game.start();
} catch (err) {
  ui.setLog(`Failed to start game: ${err.message}`);
  ui.showOverlay('Game failed to start.\nCheck the browser console for details.');
}