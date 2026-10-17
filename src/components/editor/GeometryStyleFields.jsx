import { useId } from 'react';
import { normalizeLineDirection } from './line-direction.js';
import './geometry-style-fields.css';

const HEX_COLOR_PATTERN = /^#[\da-f]{6}$/i;
const RANGE_COMMIT_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
]);

const colorValue = (value, fallback) => HEX_COLOR_PATTERN.test(value || '') ? value : fallback;
const numericValue = (style, layerStyle, field, fallback, maximum, minimum = 0) => {
  for (const value of [style[field], layerStyle[field], fallback]) {
    if (value == null || value === '') continue;
    if (Number.isFinite(Number(value))) return Math.max(minimum, Math.min(maximum, Number(value)));
  }
  return fallback;
};

export function geometryStyleValues(type, style = {}, layerStyle = {}) {
  const color = colorValue(style.color, colorValue(layerStyle.color, '#1a73e8'));
  return {
    color,
    opacity: numericValue(style, layerStyle, 'opacity', 0.92, 1),
    weight: numericValue(style, layerStyle, 'weight', type === 'Polygon' ? 3 : 5, 48),
    ...(type === 'LineString' ? {
      arrowDirection: normalizeLineDirection(numericValue(style, layerStyle, 'arrowDirection', 0, 100, -100)),
    } : {}),
    ...(type === 'Polygon' ? {
      fillColor: colorValue(style.fillColor, colorValue(layerStyle.fillColor, color)),
      fillOpacity: numericValue(style, layerStyle, 'fillOpacity', 0.28, 1),
    } : {}),
  };
}

function ColorField({ field, label, ariaLabel, value, disabled, live, onChange, onCommit }) {
  const update = (event) => {
    const patch = { [field]: event.currentTarget.value };
    onChange(patch);
    if (live) onCommit?.(patch);
  };

  return <div className="geometry-style-control geometry-style-color-control">
    <span className="geometry-style-label">{label}</span>
    <div className="geometry-style-color-value">
      <input
        type="color"
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={update}
      />
      <code aria-hidden="true">{value.toUpperCase()}</code>
    </div>
  </div>;
}

function RangeField({ field, label, ariaLabel, value, maximum, suffix, scale = 1, disabled, live, onChange, onCommit }) {
  const inputId = useId();
  const displayValue = Math.round(value * scale);
  const patchFrom = (element) => ({ [field]: Number(element.value) / scale });
  const update = (event) => onChange(patchFrom(event.currentTarget));
  const commit = (event) => {
    if (live) onCommit?.(patchFrom(event.currentTarget));
  };
  const commitKeyboardChange = (event) => {
    if (RANGE_COMMIT_KEYS.has(event.key)) commit(event);
  };

  return <label className="geometry-style-control geometry-style-range-control">
    <span className="geometry-style-label">{label}</span>
    <span className="geometry-style-range-row">
      <input
        id={inputId}
        type="range"
        aria-label={ariaLabel}
        aria-valuetext={`${displayValue}${suffix}`}
        min="0"
        max={maximum}
        step="1"
        value={displayValue}
        disabled={disabled}
        onChange={update}
        onPointerDown={(event) => event.currentTarget.setPointerCapture?.(event.pointerId)}
        onPointerUp={commit}
        onPointerCancel={commit}
        onKeyUp={commitKeyboardChange}
        onBlur={commit}
      />
      <output className="geometry-style-number" htmlFor={inputId}>{displayValue}<span>{suffix}</span></output>
    </span>
  </label>;
}

function StyleSection({ title, children }) {
  return <section className="geometry-style-section">
    <h3>{title}</h3>
    <div className="geometry-style-section-body">{children}</div>
  </section>;
}

export default function GeometryStyleFields({
  type,
  value,
  onChange,
  onCommit,
  disabled = false,
  lang = 'zh',
  live = false,
}) {
  const text = (zh, en) => lang === 'en' ? en : zh;
  const isPolygon = type === 'Polygon';
  const sharedProps = { disabled, live, onChange, onCommit };

  return <div className="geometry-style-fields">
    {isPolygon ? <StyleSection title={text('填充', 'Fill')}>
      <ColorField
        {...sharedProps}
        field="fillColor"
        label={text('颜色', 'Color')}
        ariaLabel={text('填充颜色', 'Fill color')}
        value={value.fillColor}
      />
      <RangeField
        {...sharedProps}
        field="fillOpacity"
        label={text('不透明度', 'Opacity')}
        ariaLabel={text('填充不透明度', 'Fill opacity')}
        value={value.fillOpacity}
        maximum={100}
        suffix="%"
        scale={100}
      />
    </StyleSection> : null}

    <StyleSection title={isPolygon ? text('边框', 'Outline') : text('线条', 'Line')}>
      <ColorField
        {...sharedProps}
        field="color"
        label={text('颜色', 'Color')}
        ariaLabel={isPolygon ? text('边框颜色', 'Outline color') : text('线条颜色', 'Line color')}
        value={value.color}
      />
      <RangeField
        {...sharedProps}
        field="opacity"
        label={text('不透明度', 'Opacity')}
        ariaLabel={isPolygon ? text('边框不透明度', 'Outline opacity') : text('线条不透明度', 'Line opacity')}
        value={value.opacity}
        maximum={100}
        suffix="%"
        scale={100}
      />
      <RangeField
        {...sharedProps}
        field="weight"
        label={text('粗细', 'Width')}
        ariaLabel={isPolygon ? text('边框粗细', 'Outline width') : text('线条粗细', 'Line width')}
        value={value.weight}
        maximum={48}
        suffix=" px"
      />
    </StyleSection>
  </div>;
}
