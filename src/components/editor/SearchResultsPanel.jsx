import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, Copy, ExternalLink, LoaderCircle, MapPin, Phone, Plus, Route, Search, X } from 'lucide-react';

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}

function compactCategory(place) {
  return (place.category || place.type || '').split(';').filter(Boolean).slice(-1)[0] || '';
}

export default function SearchResultsPanel({ search, onDirections, onAdd, onClose, canAdd = true }) {
  const listRef = useRef(null);
  const scrollRef = useRef(0);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const previousPageRef = useRef(search.page);
  const copyResetRef = useRef(null);
  const place = search.selectedPlace;
  const detail = search.mode === 'detail' && place;

  useLayoutEffect(() => {
    if (search.mode === 'results' && listRef.current) {
      listRef.current.scrollTop = previousPageRef.current !== search.page ? 0 : scrollRef.current;
    }
    previousPageRef.current = search.page;
  }, [search.mode, search.page]);

  useLayoutEffect(() => {
    setCopied(false);
    setCopyError('');
    return () => window.clearTimeout(copyResetRef.current);
  }, [place?.id]);

  const copyCoordinate = async () => {
    if (!place?.position) return;
    const coordinate = `${Number(place.position[1]).toFixed(6)}, ${Number(place.position[0]).toFixed(6)}`;
    setCopyError('');
    try {
      await navigator.clipboard.writeText(coordinate);
      setCopied(true);
      window.clearTimeout(copyResetRef.current);
      copyResetRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError('复制失败，请选择下方坐标手动复制。');
    }
  };

  return (
    <section className="place-search-panel" aria-label={detail ? '地点详情' : '地点搜索结果'}>
      <header className="place-panel-header">
        {detail ? <button type="button" className="icon-button" onClick={search.backToResults} aria-label="返回搜索结果"><ArrowLeft size={20} /></button> : <Search size={19} />}
        <div><h2>{detail ? '地点详情' : '搜索结果'}</h2>{!detail && !search.loading && search.total > 0 ? <span>{search.total} 个地点</span> : null}</div>
        <button type="button" className="icon-button" onClick={onClose || search.clear} aria-label="关闭搜索面板"><X size={20} /></button>
      </header>
      {!detail && search.searchHereNeeded ? <button type="button" className="search-area-button" onClick={() => search.searchThisArea()} disabled={search.loading}><Search size={16} /> 搜索此区域</button> : null}
      {search.error ? <p className="place-search-error" role="alert">{search.error}</p> : null}
      {detail ? (
        <article className="place-details" key={place.id}>
          {place.photos?.some((photo) => safeUrl(photo.url)) ? <div className="place-detail-photos" aria-label="地点照片">{place.photos.filter((photo) => safeUrl(photo.url)).map((photo, index) => <a className="place-detail-photo" key={`${photo.url}-${index}`} href={safeUrl(photo.url)} target="_blank" rel="noreferrer"><img src={safeUrl(photo.url)} alt={photo.title || `${place.name}的照片 ${index + 1}`} loading="lazy" /></a>)}</div> : null}
          <div className="place-detail-heading"><h2>{place.name || '选定的位置'}</h2>{compactCategory(place) ? <p>{compactCategory(place)}</p> : null}</div>
          {search.detailLoading ? <p className="place-search-loading" role="status"><LoaderCircle className="spin" size={16} /> 正在加载地点资料…</p> : null}
          <div className="place-detail-actions">
            <button type="button" className="place-detail-action primary" onClick={() => onDirections?.(place)} disabled={!place.position || !onDirections}><Route size={19} /><span>路线</span></button>
            {canAdd && onAdd ? <button type="button" className="place-detail-action" onClick={() => onAdd(place)} disabled={!place.position}><Plus size={19} /><span>添加到地图</span></button> : null}
            <button type="button" className="place-detail-action" onClick={copyCoordinate} disabled={!place.position}><Copy size={18} /><span>{copied ? '已复制' : '复制坐标'}</span></button>
          </div>
          <div className="place-detail-info">
            {place.address ? <div className="place-info-row"><MapPin size={19} /><span>{place.address}</span></div> : null}
            {place.businessHours ? <div className="place-info-row"><Clock size={19} /><div><b>营业时间</b><span>{place.businessHours}</span></div></div> : null}
            {place.phone ? <div className="place-info-row"><Phone size={19} /><a href={`tel:${place.phone.replace(/[^\d+,;]/g, '')}`}>{place.phone}</a></div> : null}
            {safeUrl(place.website) ? <div className="place-info-row"><ExternalLink size={19} /><a href={safeUrl(place.website)} target="_blank" rel="noreferrer">{new URL(place.website).hostname}</a></div> : null}
            {place.position ? <div className="place-info-row"><MapPin size={19} /><div><span className="place-coordinate-text">{Number(place.position[1]).toFixed(6)}, {Number(place.position[0]).toFixed(6)}</span><small>纬度，经度 · WGS84</small></div></div> : null}
            {copyError ? <p className="place-search-error" role="alert">{copyError}</p> : null}
          </div>
          <p className="place-data-source">地点资料由高德地图提供</p>
        </article>
      ) : (
        <>
          {search.loading ? <div className="place-search-loading" role="status"><LoaderCircle className="spin" size={20} /><span>正在搜索地点…</span></div> : null}
          <div className="place-result-list" ref={listRef} onScroll={(event) => { scrollRef.current = event.currentTarget.scrollTop; }} aria-busy={search.loading}>
            {!search.loading && !search.results.length && !search.error ? <div className="place-search-empty"><MapPin size={26} /><p>未找到相关地点</p><span>试试其他关键词，或移动地图后搜索此区域。</span></div> : null}
            {search.results.map((result) => (
              <button type="button" className="place-result-card" key={result.id} onClick={() => search.openDetail(result)} disabled={search.loading}>
                <span className="place-result-number">{result.index}</span>
                <div className="place-result-summary"><h3>{result.name}</h3>{compactCategory(result) ? <p className="place-result-meta">{compactCategory(result)}</p> : null}<p className="place-result-address">{result.address || '查看地点详情'}</p></div>
                {safeUrl(result.photos?.[0]?.url) ? <img className="place-result-thumbnail" src={safeUrl(result.photos[0].url)} alt="" loading="lazy" /> : null}
              </button>
            ))}
          </div>
          {search.total > search.pageSize ? <footer className="place-search-pagination"><button type="button" onClick={search.previousPage} disabled={search.loading || search.page <= 1} aria-label="上一页搜索结果"><ChevronLeft size={18} /></button><span>第 {search.page} / {search.maxPage || Math.max(1, Math.ceil(search.total / search.pageSize))} 页</span><button type="button" onClick={search.nextPage} disabled={search.loading || search.page >= (search.maxPage || 100) || search.page * search.pageSize >= search.total} aria-label="下一页搜索结果"><ChevronRight size={18} /></button></footer> : null}
        </>
      )}
    </section>
  );
}
