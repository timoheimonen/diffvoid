(function () {
  var STORAGE_KEY = 'diffvoidcom_theme';

  function getTheme() {
    var saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  }

  function initTheme() {
    applyTheme(getTheme());
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
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
