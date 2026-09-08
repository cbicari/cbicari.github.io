/*
 * Minimal EN/FR toggle. Any element carrying data-lang="en" or data-lang="fr"
 * is shown/hidden via the native `hidden` attribute; the choice is remembered
 * in localStorage and defaults to the browser's language on first visit.
 */
(function () {
  'use strict';
  var STORAGE_KEY = 'sat-site-lang';

  function detectLang() {
    var fromQuery = new URLSearchParams(window.location.search).get('lang');
    if (fromQuery === 'en' || fromQuery === 'fr') return fromQuery;
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'fr') return saved;
    } catch (e) { /* localStorage unavailable (private mode, etc.) */ }
    return (navigator.language || '').toLowerCase().indexOf('fr') === 0 ? 'fr' : 'en';
  }

  function applyLang(lang) {
    document.documentElement.setAttribute('lang', lang);
    document.querySelectorAll('[data-lang="en"], [data-lang="fr"]').forEach(function (el) {
      el.hidden = el.getAttribute('data-lang') !== lang;
    });
    document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-set-lang') === lang ? 'true' : 'false');
    });
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyLang(detectLang());
    document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () { applyLang(btn.getAttribute('data-set-lang')); });
    });
  });
})();
