(function () {
  var saved = localStorage.getItem('diffvoidcom_theme');
  var theme = saved === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
})();
