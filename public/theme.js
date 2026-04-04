// MIT License
// Copyright (c) 2026 Timo Heimonen <timo.heimonen@proton.me>
// See LICENSE file for full terms at github.com/timoheimonen/diffvoid

(function () {
  var STORAGE_KEY = 'diffvoidcom_theme';

  function getTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'dark' ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  }

  function initTheme() {
    try {
      applyTheme(getTheme());
    } catch (e) {
      applyTheme('light');
    }
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {}
  }

  window.diffvoidTheme = {
    STORAGE_KEY: STORAGE_KEY,
    getTheme: getTheme,
    applyTheme: applyTheme,
    initTheme: initTheme,
    toggleTheme: toggleTheme
  };

  initTheme();
})();
