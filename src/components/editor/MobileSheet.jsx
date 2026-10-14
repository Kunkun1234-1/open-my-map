import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

const STATES = ['collapsed', 'half', 'full'];

function mobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;
}

function stateHeights() {
  const viewport = window.visualViewport?.height || window.innerHeight;
  return [47, Math.max(160, viewport * 0.52), Math.max(160, viewport - 74)];
}

export default function MobileSheet({
  children,
  state = 'half',
  onStateChange,
  onClose,
  label = '地图内容',
  className = '',
  lang = 'zh',
}) {
  const text = (zh, en) => (lang === 'en' ? en : zh);
  const [isMobile, setIsMobile] = useState(mobileViewport);
  const [dragHeight, setDragHeight] = useState(null);
  const [dragging, setDragging] = useState(false);
  const sheetRef = useRef(null);
  const contentRef = useRef(null);
  const gestureRef = useRef(null);
  const suppressClickRef = useRef(false);
  const callbacksRef = useRef({ onStateChange, onClose });
  callbacksRef.current = { onStateChange, onClose };
  const stateIndex = Math.max(0, STATES.indexOf(state));

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setIsMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isMobile || state !== 'collapsed') return;
    if (contentRef.current?.contains(document.activeElement)) {
      sheetRef.current?.querySelector('.mobile-sheet-drag-handle')?.focus();
    }
  }, [isMobile, state]);

  useEffect(() => {
    if (!isMobile || state === 'collapsed') return undefined;
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (event.target.closest('input, textarea, select, [role="combobox"], [role="dialog"], [role="menu"]'))
        return;
      if (!sheetRef.current?.contains(event.target)) return;
      event.preventDefault();
      callbacksRef.current.onStateChange?.('collapsed');
      callbacksRef.current.onClose?.();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isMobile, state]);

  const changeState = (index) => onStateChange?.(STATES[Math.max(0, Math.min(STATES.length - 1, index))]);

  const startDrag = (event) => {
    if (!isMobile || event.button !== 0) return;
    event.preventDefault();
    const initialHeight = sheetRef.current.getBoundingClientRect().height;
    gestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: initialHeight,
      currentHeight: initialHeight,
      startTime: performance.now(),
    };
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const delta = gesture.startY - event.clientY;
    if (Math.abs(delta) < 4 && !dragging) return;
    suppressClickRef.current = true;
    const [minimum, , maximum] = stateHeights();
    gesture.currentHeight = Math.max(minimum, Math.min(maximum, gesture.startHeight + delta));
    setDragging(true);
    setDragHeight(gesture.currentHeight);
  };

  const finishDrag = (event, canceled = false) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (!canceled && suppressClickRef.current) {
      const heights = stateHeights();
      const delta = gesture.currentHeight - gesture.startHeight;
      const velocity = delta / Math.max(1, performance.now() - gesture.startTime);
      const nearest = heights.reduce(
        (best, height, index) =>
          Math.abs(height - gesture.currentHeight) < Math.abs(heights[best] - gesture.currentHeight)
            ? index
            : best,
        0,
      );
      changeState(
        Math.abs(velocity) > 0.55 && Math.abs(delta) > 25 && nearest === stateIndex
          ? stateIndex + (delta > 0 ? 1 : -1)
          : nearest,
      );
    }
    setDragging(false);
    setDragHeight(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const close = () => {
    onStateChange?.('collapsed');
    onClose?.();
  };

  return (
    <aside
      ref={sheetRef}
      className={`editor-sidebar mobile-sheet mobile-sheet-${STATES[stateIndex]}${dragging ? ' mobile-sheet-dragging' : ''}${className ? ` ${className}` : ''}`}
      style={dragHeight !== null ? { '--sheet-drag-height': `${dragHeight}px` } : undefined}
      aria-label={label}
      data-testid="mobile-sheet"
      data-sheet-state={STATES[stateIndex]}
    >
      <header className="mobile-sheet-header">
        <div
          className="mobile-sheet-drag-handle"
          role="slider"
          tabIndex={0}
          aria-label={text('拖动调整面板高度', 'Drag to resize panel')}
          aria-valuemin={0}
          aria-valuemax={2}
          aria-valuenow={stateIndex}
          aria-valuetext={
            [text('收起', 'Collapsed'), text('半屏', 'Half screen'), text('全屏', 'Full screen')][stateIndex]
          }
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={(event) => finishDrag(event)}
          onPointerCancel={(event) => finishDrag(event, true)}
          onLostPointerCapture={(event) => finishDrag(event, true)}
          onDragStart={(event) => event.preventDefault()}
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            changeState(stateIndex === 2 ? 1 : stateIndex + 1);
          }}
          onKeyDown={(event) => {
            if (['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
              event.preventDefault();
              if (event.key === 'Home') changeState(0);
              else if (event.key === 'End') changeState(2);
              else if (event.key === 'ArrowDown') changeState(stateIndex - 1);
              else changeState(stateIndex === 2 && ['Enter', ' '].includes(event.key) ? 1 : stateIndex + 1);
            }
          }}
        >
          <span />
          <b>{label}</b>
        </div>
        <div className="mobile-sheet-controls">
          <button
            type="button"
            disabled={stateIndex === 2}
            onClick={() => changeState(stateIndex + 1)}
            aria-label={text('展开面板', 'Expand panel')}
          >
            <ChevronUp size={18} />
          </button>
          <button
            type="button"
            disabled={stateIndex === 0}
            onClick={() => changeState(stateIndex - 1)}
            aria-label={text('降低面板高度', 'Reduce panel height')}
          >
            <ChevronDown size={18} />
          </button>
          <button type="button" onClick={close} aria-label={text('收起面板', 'Collapse panel')}>
            <X size={18} />
          </button>
        </div>
      </header>
      <div
        ref={contentRef}
        className="mobile-sheet-content"
        inert={isMobile && state === 'collapsed'}
        aria-hidden={isMobile && state === 'collapsed' ? true : undefined}
      >
        {children}
      </div>
    </aside>
  );
}
