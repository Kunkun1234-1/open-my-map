import { useId } from 'react';
import './reference-geometry-style.css';

const COLOR_ROWS = [
  '#880e4f', '#a52714', '#e65100', '#ff8f00', '#f9a825', '#827717', '#558b2f', '#00695c', '#006064', '#01579b', '#1a237e', '#673ab7', '#4e342e',
  '#c2185b', '#ff5252', '#f57c00', '#fbc02d', '#ffeb3b', '#c0ca33', '#7cb342', '#0f9d58', '#0097a7', '#0288d1', '#3949ab', '#9c27b0', '#795548',
  '#f48fb1', '#f28b82', '#ffcc80', '#ffe082', '#ffff8d', '#e6ee9c', '#c5e1a5', '#80cbc4', '#b2ebf2', '#a0c3ff', '#9fa8da', '#ce93d8', '#bcaaa4',
];
const GRAYS = ['#bdbdbd', '#757575', '#424242', '#000000'];
const COMMIT_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

function ReferenceSlider({ label, value, minimum = 0, maximum, onChange, onCommit, unit = '', signed = false }) {
  const id = useId();
  const commit = (event) => onCommit(Number(event.currentTarget.value));
  const formatted = `${signed && value > 0 ? '+' : ''}${value}${unit}`;
  return <div className={`reference-style-slider${signed ? ' is-direction' : ''}`}>
    <label htmlFor={id}>{label}{signed ? <output htmlFor={id}>{formatted}</output> : null}</label>
    <input id={id} type="range" min={minimum} max={maximum} step="1" value={value}
      aria-label={label} aria-valuetext={formatted} title={formatted}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
      onPointerDown={(event) => event.currentTarget.setPointerCapture?.(event.pointerId)}
      onPointerUp={commit} onPointerCancel={commit} onBlur={commit}
      onKeyUp={(event) => { if (COMMIT_KEYS.has(event.key)) commit(event); }} />
    {signed ? <div className="reference-style-scale" aria-hidden="true"><span>−100</span><span>0</span><span>+100</span></div> : null}
  </div>;
}

export default function ReferenceGeometryStyleFields({ type, value, onChange, onCommit, lang = 'zh' }) {
  const text = (zh, en) => lang === 'en' ? en : zh;
  const polygon = type === 'Polygon';
  const color = (polygon ? value.fillColor : value.color).toLowerCase();
  const colors = [...COLOR_ROWS, ...GRAYS];
  const custom = colors.includes(color) ? [] : [color];
  const colorButton = (item) => <button key={item} type="button" style={{ backgroundColor: item }}
    className={color === item ? 'selected' : ''} aria-label={text(`颜色 ${item}`, `Color ${item}`)} aria-pressed={color === item} title={item.toUpperCase()}
    onClick={() => { const patch = polygon ? { color: item, fillColor: item } : { color: item }; onChange(patch); onCommit(patch); }} />;
  const opacityField = polygon ? 'fillOpacity' : 'opacity';
  const transparency = Math.round((1 - value[opacityField]) * 100);
  const opacityPatch = (next) => ({ [opacityField]: Math.round(100 - next) / 100 });
  return <div className="reference-style-fields">
    <section className="reference-style-colors">
      <h3>{text('颜色', 'Color')}</h3>
      <div className="reference-style-palette" role="group" aria-label={text('图形颜色', 'Shape colors')}>
        {COLOR_ROWS.map(colorButton)}
        <span aria-hidden="true" />
        {[...GRAYS, ...custom].map(colorButton)}
      </div>
    </section>
    <ReferenceSlider label={polygon ? text('区域透明度', 'Polygon transparency') : text('线条透明度', 'Line transparency')}
      value={transparency} maximum={100} unit="%" onChange={(next) => onChange(opacityPatch(next))} onCommit={(next) => onCommit(opacityPatch(next))} />
    <ReferenceSlider label={text('边框宽度', 'Border width')} value={value.weight} maximum={48} unit=" px"
      onChange={(next) => onChange({ weight: next })} onCommit={(next) => onCommit({ weight: next })} />
    {type === 'LineString' ? <ReferenceSlider label={text('箭头方向', 'Arrow direction')} value={value.arrowDirection} minimum={-100} maximum={100} signed
      onChange={(next) => onChange({ arrowDirection: next })} onCommit={(next) => onCommit({ arrowDirection: next })} /> : null}
  </div>;
}
