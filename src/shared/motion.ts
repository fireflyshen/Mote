export function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function afterPaint(callback: () => void): () => void {
  let frame = window.requestAnimationFrame(() => {
    frame = window.requestAnimationFrame(callback);
  });
  return () => window.cancelAnimationFrame(frame);
}

export function scrollToStart(
  element: { scrollTo: (options: ScrollToOptions) => void } | null,
) {
  element?.scrollTo({
    top: 0,
    behavior: reducedMotion() ? "instant" : "smooth",
  });
}
