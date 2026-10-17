import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getMarkerIcon } from '../marker-icons.js';
import MarkerIcon from './MarkerIcon.jsx';
import MarkerIconPicker from './MarkerIconPicker.jsx';

const COLORS = ['#1a73e8', '#00897b', '#8e24aa', '#e85d4a', '#f9ab00', '#d93025', '#5f6368', '#039be5'];

export default function MarkerStyleDialog({ name, color: initialColor, icon: initialIcon, inheritIcon = false, onSave, onClose, lang = 'zh' }) {
  const [color, setColor] = useState(initialColor || '#1a73e8');
  const [icon, setIcon] = useState(getMarkerIcon(initialIcon).id);
  const [iconChanged, setIconChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  const callbacksRef = useRef({ onClose, saving });
  callbacksRef.current = { onClose, saving };
  const text = (zh, en) => lang === 'en' ? en : zh;
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current.querySelector('input')?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!callbacksRef.current.saving) callbacksRef.current.onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')).filter((element) => element.getClientRects().length && element.type !== 'radio');
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  const save = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (saving) return;
    setSaving(true); setError('');
    try {
      if (await onSave({ color, fillColor: color, ...(!inheritIcon || iconChanged ? { icon } : {}) }) === false) setError(text('样式未保存，请重试。', 'Style was not saved. Try again.'));
      else onClose();
    } catch (saveError) { setError(saveError.message); }
    finally { setSaving(false); }
  };
  return createPortal(
    <div className="marker-style-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section ref={dialogRef} className="marker-style-dialog" role="dialog" aria-modal="true" aria-label={text('地点样式', 'Place style')}>
        <header><div><h2>{text('地点样式', 'Place style')}</h2><p>{name}</p></div><button type="button" className="icon-button" disabled={saving} onClick={onClose} aria-label={text('关闭地点样式', 'Close place style')}><X size={20} /></button></header>
        <form onSubmit={save}>
          <fieldset disabled={saving}>
            <legend className="visually-hidden">{text('颜色与图标', 'Color and icon')}</legend>
            <div className="marker-style-colors"><span>{text('颜色', 'Color')}</span>{COLORS.map((item) => <button key={item} type="button" className={`color-chip${color === item ? ' active' : ''}`} style={{ '--color': item }} onClick={() => setColor(item)} aria-label={text(`颜色 ${item}`, `Color ${item}`)} aria-pressed={color === item} />)}<input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label={text('自定义颜色', 'Custom color')} /></div>
            <MarkerIconPicker value={icon} onChange={(value) => { setIcon(value); setIconChanged(true); }} color={color} lang={lang} />
          </fieldset>
          {error ? <p className="marker-style-error" role="alert">{error}</p> : null}
          <footer><span className="marker-style-preview" style={{ color }}><MarkerIcon icon={icon} />{text(getMarkerIcon(icon).labelZh, getMarkerIcon(icon).labelEn)}</span><button type="button" className="text-button" disabled={saving} onClick={onClose}>{text('取消', 'Cancel')}</button><button type="submit" className="primary-button" disabled={saving}>{saving ? text('保存中…', 'Saving…') : text('保存样式', 'Save style')}</button></footer>
        </form>
      </section>
    </div>, document.body,
  );
}
