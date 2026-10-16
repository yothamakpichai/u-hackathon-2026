// App links (#/parent?t=…, #/arena, #/town…) belong to the app, so old links and QR codes keep working. In-page
// anchors such as #town or #research stay on this page.
(function () {
  var h = window.location.hash;
  if (h && h.indexOf('#/') === 0) window.location.replace('app.html' + h);
})();
