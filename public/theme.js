// MIT License
// Copyright (c) 2026 Timo Heimonen <timo.heimonen@proton.me>
// See LICENSE file for full terms at github.com/timoheimonen/diffvoid

(function () {
  const STORAGE_KEY = 'diffvoidcom_theme';
  const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function getStoredTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'dark' || saved === 'light' ? saved : null;
    } catch (e) {
      return null;
    }
  }

  function getTheme() {
    return getStoredTheme() || (systemDark && systemDark.matches ? 'dark' : 'light');
  }

  function applyTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      const label = 'Switch to ' + (next === 'dark' ? 'light' : 'dark') + ' theme';
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {}
  }

  // Follow the system setting until the user picks a theme
  if (systemDark) {
    const handleSystemChange = function (event) {
      if (!getStoredTheme()) applyTheme(event.matches ? 'dark' : 'light');
    };
    if (typeof systemDark.addEventListener === 'function') {
      systemDark.addEventListener('change', handleSystemChange);
    } else if (typeof systemDark.addListener === 'function') {
      systemDark.addListener(handleSystemChange);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyTheme(getTheme());
  });

  window.diffvoidTheme = {
    toggleTheme
  };

  applyTheme(getTheme());
})();
