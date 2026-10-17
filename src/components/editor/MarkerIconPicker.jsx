import { useId, useState } from 'react';
import { Search } from 'lucide-react';
import { getMarkerIcon, MARKER_ICON_CATEGORIES, MARKER_ICONS } from '../marker-icons.js';
import MarkerIcon from './MarkerIcon.jsx';
import './marker-icon-picker.css';

export default function MarkerIconPicker({ value = 'pin', onChange, color = '#5f6368', lang = 'zh' }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const groupId = useId();
  const text = (zh, en) => lang === 'en' ? en : zh;
  const selected = getMarkerIcon(value).id;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = MARKER_ICONS.filter((icon) => (category === 'all' || icon.categoryId === category)
    && (!normalizedQuery || `${icon.labelZh} ${icon.labelEn} ${icon.id}`.toLowerCase().includes(normalizedQuery)));
  return (
    <div className="marker-icon-picker" style={{ '--marker-choice-color': color }}>
      <div className="marker-picker-filters">
        <label className="marker-picker-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} placeholder={text('搜索图标', 'Search icons')} aria-label={text('搜索点标记图标', 'Search point marker icons')} /></label>
        <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label={text('图标分类', 'Icon category')}>
          <option value="all">{text(`全部 (${MARKER_ICONS.length})`, `All (${MARKER_ICONS.length})`)}</option>
          {MARKER_ICON_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{text(item.labelZh, item.labelEn)}</option>)}
        </select>
      </div>
      <div className="marker-picker-results" role="radiogroup" aria-label={text('点标记图标', 'Point marker icons')}>
        {MARKER_ICON_CATEGORIES.map((item) => {
          const icons = filtered.filter((icon) => icon.categoryId === item.id);
          if (!icons.length) return null;
          return <section key={item.id} className="marker-picker-category">
            <h3>{text(item.labelZh, item.labelEn)} <small>({icons.length})</small></h3>
            <div className="marker-picker-grid">
              {icons.map((icon) => <label key={icon.id} className={`marker-icon-choice${selected === icon.id ? ' selected' : ''}`} title={text(icon.labelZh, icon.labelEn)}>
                <input className="visually-hidden" type="radio" name={groupId} value={icon.id} checked={selected === icon.id} onChange={() => onChange(icon.id)} aria-label={text(icon.labelZh, icon.labelEn)} />
                <span className="marker-choice-glyph"><MarkerIcon icon={icon.id} size={22} /></span>
                <small>{text(icon.labelZh, icon.labelEn)}</small>
              </label>)}
            </div>
          </section>;
        })}
        {!filtered.length ? <p className="marker-picker-empty">{text('没有找到图标，请换一个关键词。', 'No icons found. Try another keyword.')}</p> : null}
      </div>
    </div>
  );
}
