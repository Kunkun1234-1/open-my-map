import { useId, useRef } from 'react';
import { BASE_MAPS, baseMapPreviewStyle, normalizeBaseMapKey } from '../../utils.js';
import './base-map-picker.css';

const MODE_LABELS = {
  standard: ['标准', 'Standard'],
  satellite: ['卫星', 'Satellite'],
  terrain: ['浅色', 'Light'],
};

export default function BaseMapPicker({ value, open, onToggle, onChange, lang }) {
  const text = (zh, en) => lang === 'en' ? en : zh;
  const toggleRef = useRef(null);
  const optionsId = useId();
  const activeKey = normalizeBaseMapKey(value);
  const modeLabel = (key) => MODE_LABELS[key][lang === 'en' ? 1 : 0];
  const selectMode = (key) => {
    onChange(key);
    toggleRef.current?.focus({ preventScroll: true });
  };
  return (
    <section className="map-basemap-control" data-base-picker-root aria-label={text('底图', 'Base map')} onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.stopPropagation();
        onToggle();
        toggleRef.current?.focus({ preventScroll: true });
      }
    }}>
      <button ref={toggleRef} className="map-basemap-current" type="button" onClick={onToggle} aria-expanded={open} aria-controls={open ? optionsId : undefined} aria-label={text(`切换底图，当前：${modeLabel(activeKey)}`, `Change base map, current: ${modeLabel(activeKey)}`)} title={text('切换底图', 'Change base map')}>
        <span className="map-basemap-current-preview" style={baseMapPreviewStyle(activeKey)} aria-hidden="true" />
      </button>
      {open ? <div id={optionsId} className="map-basemap-options">
        <div className="map-basemap-modes" role="group" aria-label={text('地图模式', 'Map modes')}>
          {Object.entries(BASE_MAPS).map(([key, option]) => <button key={key} type="button" aria-label={modeLabel(key)} aria-pressed={key === activeKey} className={key === activeKey ? 'active' : ''} onClick={() => selectMode(key)} title={lang === 'en' ? option.englishName : option.name}>
            <span className="map-basemap-mode-preview" style={baseMapPreviewStyle(key)} aria-hidden="true" />
          </button>)}
        </div>
      </div> : null}
    </section>
  );
}
