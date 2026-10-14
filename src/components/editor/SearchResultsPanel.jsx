import { useLayoutEffect, useRef } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Layers, LoaderCircle, MapPin, Plus, Route, Search, X } from 'lucide-react';
import SearchPlaceCard, { compactPlaceCategory, safePlaceUrl } from './SearchPlaceCard.jsx';
import './search-my-maps.css';

export default function SearchResultsPanel({ search, onDirections, onAdd, onClose, canAdd = true, layerName = '', compact = false, onReturnToLayers }) {
  const listRef = useRef(null);
  const scrollRef = useRef(0);
  const previousPageRef = useRef(search.page);
  const place = search.selectedPlace;
  const detail = search.mode === 'detail' && place;
  const addAvailable = Boolean(canAdd && onAdd);

  useLayoutEffect(() => {
    if (search.mode === 'results' && listRef.current) {
      listRef.current.scrollTop = previousPageRef.current !== search.page ? 0 : scrollRef.current;
    }
    previousPageRef.current = search.page;
  }, [search.mode, search.page]);

  return (
    <section className={`place-search-panel my-maps-search-panel${compact ? ' compact' : ''}`} aria-label={detail ? '地点详情' : '地点搜索结果'}>
      <header className="place-panel-header">
        {detail ? <button type="button" className="icon-button" onClick={search.backToResults} aria-label="返回搜索结果"><ArrowLeft size={18} /></button> : <Search size={17} />}
        <div><h2>{detail ? '地点详情' : '搜索结果'}</h2>{!detail && !search.loading && search.total > 0 ? <span>{search.total} 个地点</span> : null}</div>
        {onReturnToLayers ? <button type="button" className="search-return-layers" onClick={onReturnToLayers} aria-label="返回图层" title="返回图层"><Layers size={16} /><span>图层</span></button> : null}
        <button type="button" className="icon-button" onClick={onClose || search.clear} aria-label="关闭搜索面板"><X size={18} /></button>
      </header>
      {!detail && addAvailable ? <div className="search-results-layer-target">添加到当前图层：<b title={layerName || undefined}>{layerName || '当前选中的图层'}</b></div> : null}
      {!detail && search.searchHereNeeded ? <button type="button" className="search-area-button" onClick={() => search.searchThisArea()} disabled={search.loading}><Search size={16} /> 搜索此区域</button> : null}
      {!detail && search.error ? <p className="place-search-error" role="alert">{search.error}</p> : null}
      {detail ? (
        <div className="search-panel-selected-place"><SearchPlaceCard search={search} onAdd={onAdd} onDirections={onDirections} onClose={onClose || search.clear} canAdd={canAdd} layerName={layerName} compact /></div>
      ) : (
        <>
          {search.loading ? <div className="place-search-loading" role="status"><LoaderCircle className="spin" size={18} /><span>正在搜索地点…</span></div> : null}
          <div className="place-result-list" ref={listRef} onScroll={(event) => { scrollRef.current = event.currentTarget.scrollTop; }} aria-busy={search.loading}>
            {!search.loading && !search.results.length && !search.error ? <div className="place-search-empty"><MapPin size={24} /><p>未找到相关地点</p><span>试试其他关键词，或移动地图后搜索此区域。</span></div> : null}
            {search.results.map((result) => (
              <article className="search-result-row" key={result.id}>
                <button type="button" className="place-result-card" onClick={() => search.openDetail(result)} disabled={search.loading} aria-label={`查看地点：${result.name}`}>
                  <span className="place-result-number">{result.index}</span>
                  <div className="place-result-summary"><h3>{result.name}</h3>{compactPlaceCategory(result) ? <p className="place-result-meta">{compactPlaceCategory(result)}</p> : null}<p className="place-result-address">{result.address || '查看地点详情'}</p></div>
                  {safePlaceUrl(result.photos?.[0]?.url) ? <img className="place-result-thumbnail" src={safePlaceUrl(result.photos[0].url)} alt="" loading="lazy" /> : null}
                </button>
                <div className="search-result-actions">
                  {addAvailable ? <button type="button" className="search-result-add" onClick={() => onAdd(result)} disabled={search.loading || !result.position} title={layerName ? `添加到「${layerName}」` : '添加到当前图层'} aria-label={`添加「${result.name}」到${layerName ? `「${layerName}」` : '当前图层'}`}><Plus size={14} /><span>添加到地图</span></button> : null}
                  {onDirections ? <button type="button" className="search-result-route" onClick={() => onDirections(result)} disabled={search.loading || !result.position} aria-label={`规划前往「${result.name}」的路线`}><Route size={14} /><span>路线</span></button> : null}
                </div>
              </article>
            ))}
          </div>
          {search.total > search.pageSize ? <footer className="place-search-pagination"><button type="button" onClick={search.previousPage} disabled={search.loading || search.page <= 1} aria-label="上一页搜索结果"><ChevronLeft size={17} /></button><span>第 {search.page} / {search.maxPage || Math.max(1, Math.ceil(search.total / search.pageSize))} 页</span><button type="button" onClick={search.nextPage} disabled={search.loading || search.page >= (search.maxPage || 100) || search.page * search.pageSize >= search.total} aria-label="下一页搜索结果"><ChevronRight size={17} /></button></footer> : null}
        </>
      )}
    </section>
  );
}
