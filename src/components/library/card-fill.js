function setCardFillOrigin(element, x, y, width, height) {
  const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) + 2;
  element.style.setProperty('--card-fill-x', `${x}px`);
  element.style.setProperty('--card-fill-y', `${y}px`);
  element.style.setProperty('--card-fill-radius', `${radius}px`);
}

function startCardFill(event) {
  if (event.pointerType === 'touch') return;
  const element = event.currentTarget;
  const bounds = element.getBoundingClientRect();
  const x = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
  const y = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
  setCardFillOrigin(element, x, y, bounds.width, bounds.height);
}

function focusCardFill(event) {
  if (!event.target.matches(':focus-visible')) return;
  const element = event.currentTarget;
  const { width, height } = element.getBoundingClientRect();
  setCardFillOrigin(element, width / 2, height / 2, width, height);
}

export const cardFillEvents = { onPointerEnter: startCardFill, onFocus: focusCardFill };
