// Keep a short-lived local image of the rendered map. No canvas export or
// network request is needed, including when map tiles are cross-origin.
export function createMapSceneBlend(surface) {
  if (!surface?.parentElement) return null;
  const owner = surface.ownerDocument;
  let snapshot;
  try {
    snapshot = surface.cloneNode(true);
    const originals = [...surface.querySelectorAll('canvas')];
    const copies = [...snapshot.querySelectorAll('canvas')];
    let visibleAny = originals.length === 0;
    for (let index = 0; index < originals.length; index += 1) {
      const source = originals[index];
      if (!source.width || !source.height) continue;
      const context = copies[index].getContext('2d');
      if (!context) throw new Error('Map snapshot unavailable');
      context.drawImage(source, 0, 0);
      // Some WebGL implementations discard their buffer after compositing.
      // A transparent copy must never cover the new map with a blank frame.
      try {
        const samples = [0.25, 0.5, 0.75];
        const visible = samples.some((fraction) => context.getImageData(
          Math.floor(source.width * fraction), Math.floor(source.height * fraction), 1, 1,
        ).data[3] > 0);
        visibleAny ||= visible;
      } catch (error) {
        // A tainted canvas can still be drawn and displayed safely.
        if (error.name !== 'SecurityError') throw error;
        visibleAny = true;
      }
    }
    if (!visibleAny) throw new Error('Empty map snapshot');
    for (const node of [snapshot, ...snapshot.querySelectorAll('[id]')]) node.removeAttribute('id');
    snapshot.querySelectorAll('iframe, video, audio').forEach((node) => node.remove());
    snapshot.classList.add('map-scene-blend');
    snapshot.dataset.blendKind = 'snapshot';
  } catch {
    // Fall back to a subtle neutral veil, never an opaque/white replacement,
    // on renderers that do not expose a readable map frame.
    snapshot = owner.createElement('div');
    snapshot.className = 'map-scene-blend map-scene-veil';
    snapshot.dataset.blendKind = 'veil';
  }
  snapshot.setAttribute('aria-hidden', 'true');
  snapshot.inert = true;
  surface.parentElement.append(snapshot);
  return {
    update(progress, x, y) {
      const remaining = Math.max(0, 1 - progress);
      snapshot.style.opacity = String(snapshot.dataset.blendKind === 'veil' ? remaining * .22 : remaining);
      if (snapshot.dataset.blendKind === 'snapshot') {
        snapshot.style.transform = `translate3d(${-x}px, ${-y}px, 0)`;
      }
    },
    remove() { snapshot.remove(); },
  };
}
