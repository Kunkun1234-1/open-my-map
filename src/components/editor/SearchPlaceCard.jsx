import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock, Copy, ExternalLink, LoaderCircle, MapPin, Phone, Plus, Route, X } from 'lucide-react';
import './search-my-maps.css';

export function safePlaceUrl(url) {
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}

export function compactPlaceCategory(place) {
  return (place.category || place.type || '').split(';').filter(Boolean).slice(-1)[0] || '';
}

function PlaceCoordinates({ position }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const resetRef = useRef(null);
  useEffect(() => () => window.clearTimeout(resetRef.current), []);
  if (!position) return null;
  const coordinate = `${Number(position[1]).toFixed(6)}, ${Number(position[0]).toFixed(6)}`;
  const copy = async () => {
    setError('');
    try {
      await navigator.clipboard.writeText(coordinate);
      setCopied(true);
      window.clearTimeout(resetRef.current);
      resetRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch { setError('复制失败，请选择坐标手动复制。'); }
  };
  return (
    <div className="search-place-coordinates">
      <div><span className="place-coordinate-text">{coordinate}</span><small>纬度，经度 · WGS84</small></div>
      <button type="button" onClick={copy} aria-label="复制坐标" title={copied ? '已复制' : '复制坐标'}><Copy size={15} /><span>{copied ? '已复制' : '复制'}</span></button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

export default function SearchPlaceCard({ search, searchPanelState, onAdd, onDirections, onClose, canAdd = true, layerName = '', compact = true }) {
  const state = search || searchPanelState;
  const place = state?.selectedPlace;
  if (!place) return null;
  const category = compactPlaceCategory(place);
  const website = safePlaceUrl(place.website);
  const photos = (place.photos || []).filter((photo) => safePlaceUrl(photo.url));
  const addAvailable = Boolean(canAdd && onAdd);
  return (
    <article className={`my-maps-place-card search-place-card${compact ? ' compact' : ''}`} aria-label="搜索地点卡片" onClickCapture={(event) => { event.nativeEvent.openMyMapCardInteraction = true; }}>
      <header className="search-place-header">
        {state.results?.length && state.backToResults ? <button type="button" className="search-place-back" onClick={state.backToResults} aria-label="返回搜索结果" title="返回搜索结果"><ArrowLeft size={17} /></button> : null}
        <div><h2>{place.name || '选定的位置'}</h2>{category ? <p>{category}</p> : null}</div>
        <button type="button" className="search-place-close" onClick={onClose || state.clear} aria-label="关闭地点卡片"><X size={19} /></button>
      </header>
      {place.address ? <p className="search-place-address"><MapPin size={15} /><span>{place.address}</span></p> : null}
      {state.detailLoading ? <p className="search-place-loading" role="status"><LoaderCircle size={15} className="spin" />正在加载地点资料…</p> : null}
      {state.error ? <p className="search-place-error" role="alert">{state.error}</p> : null}
      {addAvailable ? <p className="search-place-target">当前图层：<b title={layerName || undefined}>{layerName || '当前选中的图层'}</b></p> : null}
      <div className="search-place-actions">
        {addAvailable ? <button type="button" className="search-place-add" onClick={() => onAdd(place)} disabled={!place.position} title={layerName ? `添加到「${layerName}」` : '添加到当前图层'}><Plus size={16} /><span>添加到地图</span></button> : null}
        {onDirections ? <button type="button" className="search-place-directions" onClick={() => onDirections(place)} disabled={!place.position}><Route size={16} /><span>路线</span></button> : null}
      </div>
      <details className="search-place-more" key={place.id}>
        <summary>地点资料</summary>
        <div className="search-place-information">
          {photos.length ? <div className="search-place-photos" aria-label="地点照片">{photos.map((photo, index) => <a key={`${photo.url}-${index}`} href={safePlaceUrl(photo.url)} target="_blank" rel="noreferrer"><img src={safePlaceUrl(photo.url)} alt={photo.title || `${place.name}的照片 ${index + 1}`} loading="lazy" /></a>)}</div> : null}
          {place.businessHours ? <div className="search-place-info-row"><Clock size={15} /><span>{place.businessHours}</span></div> : null}
          {place.phone ? <div className="search-place-info-row"><Phone size={15} /><a href={`tel:${place.phone.replace(/[^\d+,;]/g, '')}`}>{place.phone}</a></div> : null}
          {website ? <div className="search-place-info-row"><ExternalLink size={15} /><a href={website} target="_blank" rel="noreferrer">{new URL(website).hostname}</a></div> : null}
          <PlaceCoordinates key={place.id} position={place.position} />
          <p className="search-place-source">地点资料由高德地图提供</p>
        </div>
      </details>
    </article>
  );
}
