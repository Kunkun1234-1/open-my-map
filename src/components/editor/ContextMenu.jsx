import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp, Flag, MapPin, Navigation, Ruler } from 'lucide-react';

export default function ContextMenu({
  point,
  screen,
  onHere,
  onFrom,
  onTo,
  onMeasure,
  onAddMarker,
  onClose,
  canEdit = true,
  lang = 'zh',
}) {
  const text = (zh, en) => (lang === 'en' ? en : zh);
  const menuRef = useRef(null);
  const callbacksRef = useRef({ onClose });
  callbacksRef.current = { onClose };
  const [position, setPosition] = useState({
    left: Number(screen?.x ?? screen?.clientX) || 0,
    top: Number(screen?.y ?? screen?.clientY) || 0,
  });

  useLayoutEffect(() => {
    const place = () => {
      const bounds = menuRef.current.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = window.innerHeight;
      const left = Number(screen?.x ?? screen?.clientX) || 0;
      const top = Number(screen?.y ?? screen?.clientY) || 0;
      setPosition({
        left: Math.max(8, Math.min(left, viewportWidth - bounds.width - 8)),
        top: Math.max(8, Math.min(top, viewportHeight - bounds.height - 8)),
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [screen?.x, screen?.y, screen?.clientX, screen?.clientY]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    const closeOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) callbacksRef.current.onClose?.();
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        callbacksRef.current.onClose?.();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
      if (previousFocus?.isConnected && document.activeElement === document.body) previousFocus.focus();
    };
  }, []);

  const act = (callback) => {
    callback?.(point);
    onClose?.();
  };

  const navigate = (event) => {
    const items = Array.from(menuRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)'));
    const index = items.indexOf(document.activeElement);
    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    } else if (event.key === 'Tab') {
      onClose?.();
    }
  };

  return createPortal(
    <div
      className="editor-context-menu"
      ref={menuRef}
      style={position}
      role="menu"
      aria-label={text('地图位置操作', 'Map location actions')}
      data-testid="map-context-menu"
      onKeyDown={navigate}
      onContextMenu={(event) => event.preventDefault()}
    >
      {point?.length >= 2 ? (
        <div className="context-menu-coordinate">
          {Number(point[1]).toFixed(6)}, {Number(point[0]).toFixed(6)}
        </div>
      ) : null}
      <button type="button" role="menuitem" onClick={() => act(onHere)}>
        <CircleHelp size={17} />
        {text('这里有什么？', "What's here?")}
      </button>
      <button type="button" role="menuitem" onClick={() => act(onFrom)}>
        <Navigation size={17} />
        {text('从这里出发', 'Directions from here')}
      </button>
      <button type="button" role="menuitem" onClick={() => act(onTo)}>
        <Flag size={17} />
        {text('到这里去', 'Directions to here')}
      </button>
      <button type="button" role="menuitem" onClick={() => act(onMeasure)}>
        <Ruler size={17} />
        {text('测量距离', 'Measure distance')}
      </button>
      {canEdit ? (
        <button type="button" role="menuitem" onClick={() => act(onAddMarker)}>
          <MapPin size={17} />
          {text('添加标记', 'Add a marker')}
        </button>
      ) : null}
    </div>,
    document.body,
  );
}
