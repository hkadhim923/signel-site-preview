// Carousels for the home page. The French site uses Elementor's Swiper for these; this
// is the same behaviour in a fraction of the code, with real buttons and keyboard
// support, and it degrades to a horizontal scroller if the script never runs.
(function () {
  'use strict';
  function init(root) {
    var track = root.querySelector('[data-track]');
    var slides = track ? Array.prototype.slice.call(track.children) : [];
    if (slides.length < 2) return;
    var prev = root.querySelector('[data-prev]');
    var next = root.querySelector('[data-next]');
    var dots = root.querySelector('[data-dots]');
    var perView = function () {
      return Math.max(1, Math.round(track.clientWidth / slides[0].getBoundingClientRect().width));
    };
    var index = 0;

    function pages() { return Math.max(1, Math.ceil(slides.length / perView())); }
    function go(i) {
      var p = pages();
      index = (i + p) % p;
      track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
      paint();
    }
    function paint() {
      if (!dots) return;
      dots.innerHTML = '';
      for (var i = 0; i < pages(); i++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'dot' + (i === index ? ' on' : '');
        b.setAttribute('aria-label', 'Slide ' + (i + 1));
        b.setAttribute('data-go', String(i));
        dots.appendChild(b);
      }
    }
    if (prev) prev.addEventListener('click', function () { go(index - 1); });
    if (next) next.addEventListener('click', function () { go(index + 1); });
    if (dots) dots.addEventListener('click', function (e) {
      var t = e.target.getAttribute && e.target.getAttribute('data-go');
      if (t !== null && t !== undefined) go(Number(t));
    });
    track.addEventListener('scroll', function () {
      var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (i !== index) { index = i; paint(); }
    });
    window.addEventListener('resize', paint);
    paint();

    // Their solutions carousel advances every 2.5s and pauses on hover or interaction.
    var ms = Number(root.getAttribute('data-autoplay') || 0);
    if (ms > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      var timer = null, stopped = false;
      var tick = function () { if (!stopped) go(index + 1); };
      var start = function () { if (!timer) timer = setInterval(tick, ms); };
      var stop = function () { clearInterval(timer); timer = null; };
      root.addEventListener('mouseenter', stop);
      root.addEventListener('mouseleave', start);
      root.addEventListener('focusin', stop);
      if (prev) prev.addEventListener('click', function () { stopped = true; stop(); });
      if (next) next.addEventListener('click', function () { stopped = true; stop(); });
      if (dots) dots.addEventListener('click', function () { stopped = true; stop(); });
      track.addEventListener('touchstart', function () { stopped = true; stop(); }, { passive: true });
      start();
    }
  }
  var list = document.querySelectorAll('[data-carousel]');
  for (var i = 0; i < list.length; i++) init(list[i]);
})();

// Full-screen control for the catalogue flipbook.
(function () {
  'use strict';
  var btn = document.querySelector('[data-fullscreen]');
  var frame = document.querySelector('[data-flip]');
  if (!btn || !frame) return;
  if (!frame.requestFullscreen && !frame.webkitRequestFullscreen) { btn.hidden = true; return; }
  btn.addEventListener('click', function () {
    var fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (fs) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
    else { (frame.requestFullscreen || frame.webkitRequestFullscreen).call(frame); }
  });
})();
