import { wireframeTheme } from './wireframe.js';
import { emberglowTheme } from './emberglow.js';
import { gravefleshTheme } from './graveflesh.js';
import { nightmareTheme } from './nightmare.js';
import { preloadCreatureTextures } from '../creature-textures.js';

/**
 * Registered visual themes. To add a theme: create js/themes/<name>.js, import it
 * here, and append to THEMES. To remove: delete the file and its entry below.
 */
export const THEMES = [
  wireframeTheme,
  emberglowTheme,
  gravefleshTheme,
  nightmareTheme,
];

const STORAGE_KEY = 'daggorath-theme';

export function getThemes() {
  return THEMES;
}

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function getDefaultThemeId() {
  return THEMES[0].id;
}

export function loadThemeId() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (id && THEMES.some((t) => t.id === id)) return id;
  } catch {
    /* ignore */
  }
  return getDefaultThemeId();
}

export function saveThemeId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function applyTheme(theme, renderer) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.css ?? {})) {
    root.style.setProperty(key, value);
  }

  for (const t of THEMES) {
    if (t.bodyClass) document.body.classList.remove(t.bodyClass);
  }
  if (theme.bodyClass) document.body.classList.add(theme.bodyClass);

  document.body.dataset.theme = theme.id;
  renderer?.setTheme(theme);
  if (
    theme.renderer?.creatureSpriteSource
    || theme.renderer?.creatureTextureSource
    || theme.renderer?.wallTextureSource
  ) {
    preloadCreatureTextures(theme.renderer);
  }
}