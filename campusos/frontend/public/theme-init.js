/* Gunakan tema sebelum paparan pertama supaya tiada kilat putih. Fail luaran kerana CSP melarang skrip sebaris. */
(function () {
  try {
    var saved = localStorage.getItem('campusos.theme')
    var dark = saved ? saved === 'dark' : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    if (dark) {
      document.documentElement.classList.add('dark')
      var m = document.querySelector('meta[name="theme-color"]')
      if (m) m.setAttribute('content', '#0f1a15')
    }
  } catch (e) { /* storan diblokir */ }
})()
