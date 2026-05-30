import { useEffect, useRef } from 'react';

/**
 * Ajusta apenas a altura do wrapper .revvo-canvas-scale após scale CSS.
 * A proporção (--revvo-canvas-scale) é calculada somente no CSS; este hook não a altera.
 */
export function useRevvoCanvasScale() {
  const scaleRef = useRef(null);
  const innerRef = useRef(null);

  useEffect(() => {
    const scaleEl = scaleRef.current;
    const innerEl = innerRef.current;
    if (!scaleEl || !innerEl) return undefined;

    const appEl = scaleEl.closest('.revvo-canvas-app');

    const readCanvasScale = () => {
      if (!appEl) return 1;
      const raw = getComputedStyle(appEl).getPropertyValue('--revvo-canvas-scale').trim();
      const scale = parseFloat(raw);
      return Number.isFinite(scale) && scale > 0 ? scale : 1;
    };

    const updateWrapperHeight = () => {
      const scale = readCanvasScale();
      const naturalHeight = innerEl.offsetHeight;
      scaleEl.style.height = naturalHeight > 0 ? `${naturalHeight * scale}px` : '';
    };

    updateWrapperHeight();
    window.addEventListener('resize', updateWrapperHeight);
    const ro = new ResizeObserver(updateWrapperHeight);
    ro.observe(innerEl);

    return () => {
      window.removeEventListener('resize', updateWrapperHeight);
      ro.disconnect();
    };
  }, []);

  return { scaleRef, innerRef };
}
