import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getMarkerIcon } from '../marker-icons.js';
import MarkerIcon from './MarkerIcon.jsx';
import LiveGeometryStyleEditor from './LiveGeometryStyleEditor.jsx';
import MarkerStyleDialog from './MarkerStyleDialog.jsx';
import './marker-style-popover.css';

const PALETTE = [
  '#880e4f', '#a52714', '#e65100', '#ff8f00', '#f9a825', '#827717', '#558b2f', '#00695c', '#006064', '#01579b', '#1a237e', '#673ab7', '#4e342e',
  '#c2185b', '#ff5252', '#f57c00', '#fbc02d', '#ffeb3b', '#c0ca33', '#7cb342', '#0f9d58', '#0097a7', '#0288d1', '#3949ab', '#9c27b0', '#795548',
  '#bdbdbd', '#757575', '#424242', '#000000',
];
const POPULAR_ICONS = ['home', 'food', 'beer', 'tree', 'bed', 'bag', 'parking', 'question', 'camera', 'camp', 'car', 'sport', 'star', 'pin'];
const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
const stopOwnerEvent = (event) => event.stopPropagation();

function positionPanel(anchor, width, height) {
  const margin = 12, gap = 14;
  const screenWidth = window.innerWidth, screenHeight = window.innerHeight;
  let side, left, top;
  if (anchor.right + gap + width <= screenWidth - margin) {
    side = 'right'; left = anchor.right + gap; top = anchor.top - 38;
  } else if (anchor.left - gap - width >= margin) {
    side = 'left'; left = anchor.left - gap - width; top = anchor.top - 38;
  } else {
    left = clamp((anchor.left + anchor.right - width) / 2, margin, screenWidth - width - margin);
    side = anchor.bottom + gap + height <= screenHeight - margin ? 'bottom' : 'top';
    top = side === 'bottom' ? anchor.bottom + gap : anchor.top - gap - height;
  }
  top = clamp(top, margin, screenHeight - height - margin);
  const arrow = side === 'left' || side === 'right'
    ? clamp((anchor.top + anchor.bottom) / 2 - top, 18, height - 18)
    : clamp((anchor.left + anchor.right) / 2 - left, 18, width - 18);
  return { side, left, top, arrow };
}

export default function MarkerStylePopover({ anchorRef, color, icon, inheritIcon, onSave, onClose, lang = 'zh', name, showIcons = true, featureType, featureStyle, layerStyle, busy = false, onPreview }) {
  const [position, setPosition] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const panelRef = useRef(null);
  const callbacksRef = useRef({ onClose, onSave, moreOpen });
  const savingRef = useRef(false);
  callbacksRef.current = { onClose, onSave, moreOpen };
  const text = (zh, en) => lang === 'en' ? en : zh;
  const selectedIcon = getMarkerIcon(icon).id;
  const selectedColor = color?.toLowerCase();
  const colors = selectedColor && !PALETTE.includes(selectedColor) ? [...PALETTE, selectedColor] : PALETTE;

  useLayoutEffect(() => {
    let frame;
    const update = () => {
      if (!anchorRef.current?.isConnected) { callbacksRef.current.onClose(); return; }
      const panel = panelRef.current;
      if (panel) {
        const next = positionPanel(anchorRef.current.getBoundingClientRect(), panel.offsetWidth, panel.offsetHeight);
        setPosition((previous) => previous && Object.keys(next).every((key) => next[key] === previous[key]) ? previous : next);
      }
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [anchorRef]);

  useEffect(() => {
    panelRef.current?.querySelector('button[aria-pressed="true"]')?.focus();
    const dismiss = (event) => {
      if (callbacksRef.current.moreOpen || panelRef.current?.contains(event.target) || anchorRef.current?.contains(event.target)) return;
      callbacksRef.current.onClose();
    };
    const onKey = (event) => {
      if (event.key === 'Escape' && !callbacksRef.current.moreOpen) {
        event.preventDefault();
        callbacksRef.current.onClose();
        anchorRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', dismiss, true); document.removeEventListener('keydown', onKey); };
  }, [anchorRef]);

  const apply = async (patch) => {
    if (savingRef.current || busy) return false;
    savingRef.current = true; setSaving(true); setError('');
    try {
      const result = await callbacksRef.current.onSave(patch);
      if (result === false) { setError(text('样式未保存，请重试。', 'Style was not saved. Try again.')); return false; }
      return true;
    } catch (saveError) { setError(saveError.message); return false; }
    finally { savingRef.current = false; setSaving(false); }
  };

  const portal = createPortal(
    <>
      <section
        ref={panelRef}
        className={`marker-style-popover${!showIcons ? ' geometry-style-popover reference-style-popover' : ''}${position ? ` opens-${position.side}` : ''}`}
        data-style-popover-root
        role="dialog"
        aria-label={showIcons ? text('地点样式快捷面板', 'Quick place style') : text('要素样式快捷面板', 'Quick feature style')}
        aria-busy={saving}
        style={{ left: position?.left || 0, top: position?.top || 0, visibility: position ? 'visible' : 'hidden', '--style-arrow-position': `${position?.arrow || 38}px` }}
        onClick={stopOwnerEvent}
        onDoubleClick={stopOwnerEvent}
        onMouseDown={stopOwnerEvent}
        onPointerDown={stopOwnerEvent}
        onDragStart={stopOwnerEvent}
      >
        <button type="button" className="marker-popover-close" onClick={() => { onClose(); anchorRef.current?.focus(); }} aria-label={text('关闭样式快捷面板', 'Close quick style')}><X size={18} /></button>
        {!showIcons ? <>
          <LiveGeometryStyleEditor type={featureType} style={featureStyle} layerStyle={layerStyle} onSave={onSave} onPreview={onPreview} lang={lang} />
        </> : <>
        <h3>{text('颜色', 'Color')}</h3>
        <div className="marker-quick-colors" role="group" aria-label={text('标记颜色', 'Marker colors')}>
          {colors.map((value) => <button key={value} type="button" disabled={saving || busy} style={{ backgroundColor: value }} className={selectedColor === value ? 'selected' : ''} onClick={() => apply({ color: value, fillColor: value })} aria-label={text(`颜色 ${value}`, `Color ${value}`)} aria-pressed={selectedColor === value} />)}
        </div>
        {showIcons ? <><h3 className="marker-popular-heading">{text('常用图标', 'Popular icons')}</h3>
        <div className="marker-popular-icons" role="group" aria-label={text('常用点标记图标', 'Popular point marker icons')}>
          {POPULAR_ICONS.map((id) => {
            const item = getMarkerIcon(id);
            return <button key={id} type="button" disabled={saving || busy} className={selectedIcon === id ? 'selected' : ''} onClick={() => apply({ icon: id })} aria-label={text(item.labelZh, item.labelEn)} aria-pressed={selectedIcon === id} title={text(item.labelZh, item.labelEn)}><span><MarkerIcon icon={id} size={16} /></span></button>;
          })}
        </div>
        <button type="button" className="marker-more-icons" disabled={saving || busy} onClick={() => setMoreOpen(true)}>{text('更多图标', 'More icons')}</button></> : null}
        </>}
        {saving ? <span className="marker-quick-status" role="status">{text('保存中…', 'Saving…')}</span> : null}
        {error ? <p className="marker-quick-error" role="alert">{error}</p> : null}
      </section>
      {moreOpen ? <MarkerStyleDialog name={name} icon={icon} color={color} inheritIcon={inheritIcon} lang={lang} onSave={apply} onClose={() => setMoreOpen(false)} /> : null}
    </>, document.body,
  );
  return <div
    data-style-popover-owner
    style={{ display: 'contents' }}
    onClick={stopOwnerEvent}
    onDoubleClick={stopOwnerEvent}
    onMouseDown={stopOwnerEvent}
    onPointerDown={stopOwnerEvent}
    onDragStart={stopOwnerEvent}
  >
    {portal}
  </div>;
}
