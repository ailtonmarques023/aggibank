/**
 * Revvo preview estático — ajusta só a altura do wrapper.
 * A escala (--revvo-canvas-scale) é calculada apenas no CSS.
 */
(function () {
  var observers = new WeakSet();

  function readCanvasScale(app) {
    var raw = getComputedStyle(app).getPropertyValue('--revvo-canvas-scale').trim();
    var scale = parseFloat(raw, 10);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  function updateWrapperHeight(app) {
    var scaleFrame = app.querySelector('.revvo-canvas-scale');
    var inner = app.querySelector('.revvo-canvas-surface');
    if (!scaleFrame || !inner) return;

    var scale = readCanvasScale(app);
    var naturalHeight = inner.offsetHeight;
    scaleFrame.style.height = naturalHeight > 0 ? naturalHeight * scale + 'px' : '';
  }

  function init() {
    document.querySelectorAll('.revvo-canvas-app').forEach(function (app) {
      updateWrapperHeight(app);
      if (typeof ResizeObserver !== 'undefined' && !observers.has(app)) {
        var inner = app.querySelector('.revvo-canvas-surface');
        if (inner) {
          var ro = new ResizeObserver(function () {
            updateWrapperHeight(app);
          });
          ro.observe(inner);
          observers.add(app);
        }
      }
    });
  }

  window.addEventListener('resize', init);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
