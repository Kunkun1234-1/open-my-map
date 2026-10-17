import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Palette, X } from 'lucide-react';
import MarkerIconPicker from './MarkerIconPicker.jsx';
import { getMarkerIcon } from '../marker-icons.js';

const COLORS = ['#1a73e8', '#00897b', '#8e24aa', '#e85d4a', '#f9ab00', '#d93025', '#5f6368', '#039be5'];
const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(Number(value)) ? Number(value) : maximum));
const colorValue = (value, fallback) => (/^#[\da-f]{6}$/i.test(value || '') ? value : fallback);

export default function LayerStyleDialog({ layer, onSave, onClose, lang = 'zh' }) {
  const text = (zh, en) => (lang === 'en' ? en : zh);
  const [color, setColor] = useState(colorValue(layer.style?.color, '#1a73e8'));
  const [fillColor, setFillColor] = useState(
    colorValue(layer.style?.fillColor, colorValue(layer.style?.color, '#1a73e8')),
  );
  const [weight, setWeight] = useState(clamp(layer.style?.weight ?? 4, 1, 20));
  const [opacity, setOpacity] = useState(clamp(layer.style?.opacity ?? 0.92, 0, 1));
  const [fillOpacity, setFillOpacity] = useState(clamp(layer.style?.fillOpacity ?? 0.28, 0, 1));
  const [icon, setIcon] = useState(
    getMarkerIcon(layer.style?.icon).id,
  );
  const [applyToFeatures, setApplyToFeatures] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(saving);
  closeRef.current = onClose;
  busyRef.current = saving;
  const titleId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    (dialog?.querySelector('input:checked') || dialog?.querySelector('input'))?.focus();
    const handleKey = (event) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        closeRef.current?.();
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        dialog.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const result = await onSave(
        { ...layer.style, color, fillColor, weight, opacity, fillOpacity, icon },
        applyToFeatures,
      );
      if (result === false) setError(text('样式未保存，请重试。', 'The style was not saved. Try again.'));
      else onClose?.();
    } catch (saveError) {
      setError(saveError.message || text('样式未保存，请重试。', 'The style was not saved. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="layer-style-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose?.();
      }}
    >
      <section
        ref={dialogRef}
        className="layer-style-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="layer-style-dialog"
      >
        <header>
          <Palette size={20} />
          <div>
            <h2 id={titleId}>{text('图层样式', 'Layer style')}</h2>
            <p>{layer.name}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            disabled={saving}
            onClick={onClose}
            aria-label={text('关闭样式面板', 'Close layer style')}
          >
            <X size={20} />
          </button>
        </header>
        <form onSubmit={save}>
          <fieldset disabled={saving}>
            <legend className="visually-hidden">{text('颜色和形状样式', 'Colors and shape style')}</legend>
            <div className="layer-style-icon-field">
              <span>{text('点标记图标', 'Point marker icon')}</span>
              <MarkerIconPicker value={icon} onChange={setIcon} color={color} lang={lang} />
            </div>
            <label className="layer-style-color-field">
              <span>{text('标记与边线颜色', 'Marker and outline color')}</span>
              <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
              <code>{color}</code>
            </label>
            <div
              className="layer-style-swatches"
              role="group"
              aria-label={text('边线颜色预设', 'Outline color presets')}
            >
              {COLORS.map((value) => (
                <button
                  key={value}
                  type="button"
                  style={{ '--color': value }}
                  className={`color-chip${value === color ? ' active' : ''}`}
                  aria-label={text(`边线颜色 ${value}`, `Outline color ${value}`)}
                  aria-pressed={value === color}
                  onClick={() => setColor(value)}
                />
              ))}
            </div>
            <label className="layer-style-color-field">
              <span>{text('区域填充颜色', 'Area fill color')}</span>
              <input type="color" value={fillColor} onChange={(event) => setFillColor(event.target.value)} />
              <code>{fillColor}</code>
            </label>
            <label className="layer-style-range-field">
              <span>
                {text('边线粗细', 'Line width')}
                <output>{weight} px</output>
              </span>
              <input
                type="range"
                aria-label={text('边线粗细', 'Line width')}
                min="1"
                max="20"
                step="1"
                value={weight}
                onChange={(event) => setWeight(Number(event.target.value))}
              />
            </label>
            <label className="layer-style-range-field">
              <span>
                {text('边线不透明度', 'Line opacity')}
                <output>{Math.round(opacity * 100)}%</output>
              </span>
              <input
                type="range"
                aria-label={text('边线不透明度', 'Line opacity')}
                min="0"
                max="1"
                step="0.01"
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
              />
            </label>
            <label className="layer-style-range-field">
              <span>
                {text('区域填充不透明度', 'Area fill opacity')}
                <output>{Math.round(fillOpacity * 100)}%</output>
              </span>
              <input
                type="range"
                aria-label={text('区域填充不透明度', 'Area fill opacity')}
                min="0"
                max="1"
                step="0.01"
                value={fillOpacity}
                onChange={(event) => setFillOpacity(Number(event.target.value))}
              />
            </label>
            <div className="layer-style-preview" aria-label={text('样式预览', 'Style preview')}>
              <svg
                viewBox="0 0 260 82"
                role="img"
                aria-label={text('线条与区域样式预览', 'Line and area style preview')}
              >
                <path
                  d="M16 61 L48 21 L90 40 L128 18"
                  fill="none"
                  stroke={color}
                  strokeWidth={weight}
                  strokeOpacity={opacity}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <path
                  d="M156 58 L168 19 L222 26 L243 64 Z"
                  fill={fillColor}
                  fillOpacity={fillOpacity}
                  stroke={color}
                  strokeWidth={weight}
                  strokeOpacity={opacity}
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <label className="layer-style-apply">
              <input
                type="checkbox"
                checked={applyToFeatures}
                onChange={(event) => setApplyToFeatures(event.target.checked)}
              />
              <span>
                {text(
                  `统一应用到此图层的 ${layer.features?.length || 0} 个要素`,
                  `Apply uniformly to all ${layer.features?.length || 0} features in this layer`,
                )}
                <small>
                  {text(
                    '取消勾选时，仅用于此图层以后添加的要素。',
                    'When unchecked, only new features use this style.',
                  )}
                </small>
              </span>
            </label>
          </fieldset>
          {error ? (
            <p className="layer-style-error" role="alert">
              {error}
            </p>
          ) : null}
          <footer>
            <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>
              {text('取消', 'Cancel')}
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? text('保存中…', 'Saving…') : text('保存样式', 'Save style')}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}
