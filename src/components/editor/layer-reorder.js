import { getStoryDragTarget, storyDragOffset } from '../story-drag-utils.js';

export function canStartLayerDrag(event) {
  if (event.button !== 0 || event.isPrimary === false) return false;
  if (event.pointerType !== 'mouse' && !event.target.closest('.layer-drag-handle')) return false;
  return !event.target.closest('input, select, textarea, a, [data-layer-menu-root], .layer-expand');
}

function scrollParent(node) {
  for (let parent = node; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)
      && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return node;
}

// Only a title-bar clone follows the pointer; the real sections retain their
// height so expanded layers and native feature dragging keep their layout.
function makeGhost(header, width) {
  const ghost = document.createElement('div');
  ghost.className = 'editor-page layer-reorder-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.style.width = `${width}px`;
  const sidebar = document.createElement('div');
  sidebar.className = 'editor-sidebar';
  const list = document.createElement('div');
  list.className = 'layer-list enhanced-layer-list';
  const clone = header.cloneNode(true);
  for (const node of [clone, ...clone.querySelectorAll('[id], [aria-controls]')]) {
    node.removeAttribute('id');
    node.removeAttribute('aria-controls');
  }
  list.append(clone);
  sidebar.append(list);
  ghost.append(sidebar);
  document.body.append(ghost);
  return ghost;
}

export function startLayerReorder(event, { root, ids, sourceId, onStart, onCommit, onFinish }) {
  if (!canStartLayerDrag(event) || ids.length < 2) return null;
  const header = event.currentTarget;
  const bounds = header.getBoundingClientRect();
  const nodes = [...root.querySelectorAll(':scope > [data-layer-id]')];
  const rows = nodes.map((node, index) => {
    const rect = node.getBoundingClientRect();
    return { id: ids[index], top: rect.top, height: rect.height };
  });
  const headers = nodes.map((node, index) => {
    const rect = node.querySelector('.layer-header').getBoundingClientRect();
    return { id: ids[index], top: rect.top, height: rect.height };
  });
  const scroller = scrollParent(root);
  const initialScroll = scroller.scrollTop;
  const pointerId = event.pointerId;
  const startX = event.clientX;
  const startY = event.clientY;
  const offsetX = startX - bounds.left;
  const offsetY = startY - bounds.top;
  let clientX = startX;
  let clientY = startY;
  let target = sourceId;
  let active = false;
  let valid = true;
  let finished = false;
  let ghost;
  let frame;
  let lastFrame;

  function viewport() {
    const list = root.getBoundingClientRect();
    const scroll = scroller.getBoundingClientRect();
    return { left: Math.max(list.left, scroll.left), right: Math.min(list.right, scroll.right),
      top: Math.max(list.top, scroll.top), bottom: Math.min(list.bottom, scroll.bottom) };
  }
  function update() {
    const view = viewport();
    valid = clientX >= view.left && clientX <= view.right
      && clientY >= view.top && clientY <= view.bottom;
    target = valid ? getStoryDragTarget(headers, clientY - offsetY + bounds.height / 2,
      scroller.scrollTop - initialScroll) : sourceId;
    nodes.forEach((node, index) => {
      node.style.transform = `translateY(${storyDragOffset(rows, sourceId, target, ids[index])}px)`;
    });
    ghost.style.transform = `translate3d(${clientX - offsetX}px, ${clientY - offsetY}px, 0)`;
    ghost.classList.toggle('invalid', !valid);
  }
  function animate(now) {
    if (finished) return;
    const view = viewport();
    if (clientX >= view.left && clientX <= view.right && clientY >= view.top && clientY <= view.bottom) {
      const elapsed = Math.min(32, lastFrame == null ? 16 : now - lastFrame);
      const edge = 36;
      const direction = clientY < view.top + edge ? -1 : clientY > view.bottom - edge ? 1 : 0;
      scroller.scrollTop += direction * elapsed * 0.45;
    }
    lastFrame = now;
    update();
    frame = requestAnimationFrame(animate);
  }
  function move(next) {
    if (next.pointerId !== pointerId || finished) return;
    clientX = next.clientX;
    clientY = next.clientY;
    if (!active && Math.hypot(clientX - startX, clientY - startY) < 4) return;
    next.preventDefault();
    if (!active) {
      active = true;
      header.setPointerCapture(pointerId);
      root.classList.add('is-layer-reordering');
      nodes[ids.indexOf(sourceId)].classList.add('is-layer-drag-source');
      ghost = makeGhost(header, bounds.width);
      onStart?.();
      frame = requestAnimationFrame(animate);
    }
    update();
  }
  function finish(next, cancelled = false) {
    if (finished || (next && next.pointerId !== pointerId)) return;
    if (active && next && !cancelled) {
      clientX = next.clientX;
      clientY = next.clientY;
      update();
    }
    finished = true;
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancelPointer);
    window.removeEventListener('blur', cancel);
    window.removeEventListener('keydown', keydown, true);
    header.removeEventListener('lostpointercapture', cancelPointer);
    if (header.hasPointerCapture(pointerId)) header.releasePointerCapture(pointerId);
    ghost?.remove();
    root.classList.remove('is-layer-reordering');
    nodes.forEach((node) => {
      node.style.removeProperty('transform');
      node.classList.remove('is-layer-drag-source');
    });
    onFinish?.(active);
    if (active && !cancelled && valid && target !== sourceId) {
      const nextIds = ids.filter((id) => id !== sourceId);
      nextIds.splice(ids.indexOf(target), 0, sourceId);
      onCommit(nextIds);
    }
  }
  function up(next) { finish(next); }
  function cancelPointer(next) { finish(next, true); }
  function cancel() { finish(null, true); }
  function keydown(next) {
    if (next.key !== 'Escape') return;
    next.preventDefault();
    next.stopPropagation();
    cancel();
  }
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancelPointer);
  window.addEventListener('blur', cancel);
  window.addEventListener('keydown', keydown, true);
  header.addEventListener('lostpointercapture', cancelPointer);
  return cancel;
}
