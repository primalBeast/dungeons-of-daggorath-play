import {
  getThemes, getTheme, applyTheme, loadThemeId, saveThemeId,
} from './themes/index.js';

export function initThemeUI({ dialog, listEl, game, onClose }) {
  let focusIndex = 0;
  let activeId = loadThemeId();

  function themeIds() {
    return getThemes().map((t) => t.id);
  }

  function syncFocusRing() {
    const buttons = listEl.querySelectorAll('.theme-option');
    buttons.forEach((btn, i) => {
      btn.classList.toggle('is-focused', i === focusIndex);
      btn.setAttribute('aria-selected', btn.dataset.themeId === activeId ? 'true' : 'false');
    });
    const focused = buttons[focusIndex];
    focused?.scrollIntoView({ block: 'nearest' });
  }

  function renderList(selectedId) {
    activeId = selectedId;
    const ids = themeIds();
    focusIndex = Math.max(0, ids.indexOf(selectedId));
    listEl.replaceChildren();

    for (const theme of getThemes()) {
      const li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `theme-option${theme.id === selectedId ? ' is-active' : ''}`;
      btn.dataset.themeId = theme.id;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', theme.id === selectedId ? 'true' : 'false');

      const name = document.createElement('span');
      name.className = 'theme-name';
      name.textContent = theme.name;

      const desc = document.createElement('span');
      desc.className = 'theme-desc';
      desc.textContent = theme.description;

      btn.append(name, desc);
      btn.addEventListener('click', () => {
        focusIndex = ids.indexOf(theme.id);
        selectTheme(theme.id, { close: true });
      });
      li.appendChild(btn);
      listEl.appendChild(li);
    }
    syncFocusRing();
  }

  function selectTheme(id, { close = false } = {}) {
    const theme = getTheme(id);
    applyTheme(theme, game.renderer);
    saveThemeId(id);
    renderList(id);
    if (close && dialog.open) dialog.close();
  }

  function show() {
    if (!dialog || !listEl) return;
    if (dialog.open) return;
    renderList(loadThemeId());
    game.pause();
    dialog.showModal();
    syncFocusRing();
  }

  function applySaved() {
    applyTheme(getTheme(loadThemeId()), game.renderer);
  }

  function handleKeydown(e) {
    if (!dialog?.open) return false;

    const ids = themeIds();
    if (ids.length === 0) return false;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      focusIndex = (focusIndex + delta + ids.length) % ids.length;
      syncFocusRing();
      return true;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      selectTheme(ids[focusIndex], { close: true });
      return true;
    }

    return false;
  }

  dialog.addEventListener('close', () => {
    game.resume();
    onClose?.();
  });

  return { show, applySaved, handleKeydown };
}