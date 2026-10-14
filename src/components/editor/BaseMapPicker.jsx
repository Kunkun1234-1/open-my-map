import { Car, ChevronDown, Layers } from 'lucide-react';
import { BASE_MAPS, baseMapPreviewStyle } from '../../utils.js';

export default function BaseMapPicker({ value, open, onToggle, onChange, traffic, onTrafficChange, lang }) {
  const text = (zh, en) => lang === 'en' ? en : zh;
  return (
    <section className="sidebar-base-map" data-base-picker-root aria-label={text('底图', 'Base map')}>
      <button className="sidebar-base-map-toggle" type="button" onClick={onToggle} aria-expanded={open}>
        <Layers size={16} />
        <span>{text('底图', 'Base map')}</span>
        <small>{lang === 'en' ? BASE_MAPS[value].englishName : BASE_MAPS[value].name}</small>
        <ChevronDown size={16} className={open ? 'expanded' : ''} />
      </button>
      {open ? <div className="sidebar-base-map-options">
        <div className="sidebar-base-map-grid">
          {Object.entries(BASE_MAPS).map(([key, option]) => <button key={key} type="button" aria-pressed={key === value} className={key === value ? 'active' : ''} onClick={() => onChange(key)}>
            <span className="sidebar-base-map-preview" style={baseMapPreviewStyle(key)} />
            <span>{lang === 'en' ? option.englishName : option.name}</span>
          </button>)}
        </div>
        <label className="sidebar-traffic-option"><Car size={16} /><span>{text('实时路况', 'Traffic')}</span><input type="checkbox" checked={traffic} onChange={(event) => onTrafficChange(event.target.checked)} /></label>
      </div> : null}
    </section>
  );
}
