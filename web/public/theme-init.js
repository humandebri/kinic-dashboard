// Runs before first paint (classic script) so the saved theme never flashes.
;(function () {
  var theme = 'system'
  try {
    theme = localStorage.getItem('kinic.theme') || 'system'
  } catch (e) {}
  var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
})()
