// Any app link (#/parent?t=…, #/arena, #/town…) belongs to the app, so old links and QR codes keep working.
// In-page anchors such as #town or #research stay on the landing.
(function () {
  var h = window.location.hash;
  if (h && h.indexOf('#/') === 0) window.location.replace('app.html' + h);
})();
