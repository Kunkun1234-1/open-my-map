import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Grid3X3, GripVertical, Layers, List, Map, MapPin, Pentagon, Route, Search, Share2, Table2, Video, X } from 'lucide-react';
import { LanguageSwitch, useI18n } from '../i18n/index.jsx';
import { BASE_MAPS } from '../utils.js';
import AmapMap from './AmapMap.jsx';
import FeatureMediaGallery from './FeatureMediaGallery.jsx';
import { geometryCoordinates } from './map-engine-utils.js';
import { orderStoryRecords, sharedMapLayers, sharedPresentationLayers } from './shared-map-utils.js';
import useStoryOrder from './useStoryOrder.js';
import StoryPresentation from './StoryPresentation.jsx';
import './shared-map-viewer.css';

function RecordCard({ feature, layer, selected, onSelect, sequence, draggable, text }) {
  const [failedMedia, setFailedMedia] = useState(null);
  const media = feature.attachments?.find((item) => item.kind === 'image') || feature.attachments?.[0];
  const showMedia = media && failedMedia !== media.id;
  const type = feature.type === 'Point' ? 'place' : feature.type === 'Polygon' ? 'area' : 'route';
  const Icon = type === 'place' ? MapPin : type === 'area' ? Pentagon : Route;
  const kind = feature.type === 'Point' ? text('地点', 'Place') : feature.type === 'Polygon' ? text('区域', 'Area') : text('路线', 'Route');
  return <button type="button" className={`shared-record${selected ? ' selected' : ''}${showMedia ? ' has-media' : ' text-only'}`} onClick={onSelect} aria-pressed={selected}>
    <span className={`shared-record-cover ${type}`}>
      <span className="shared-record-kind">{kind}</span>
      {draggable ? <span className="shared-record-grip" data-story-handle draggable={false} title={text('拖动排序', 'Drag to reorder')}><GripVertical size={16} aria-hidden="true" /></span> : null}
      {sequence ? <span className="shared-record-sequence" aria-label={text(`第 ${sequence} 条`, `Record ${sequence}`)}>{sequence}</span> : null}
      {showMedia ? media.kind === 'image'
      ? <img src={media.url} alt="" draggable={false} loading="lazy" decoding="async" onError={() => setFailedMedia(media.id)} />
      : <span className="shared-record-video"><Video size={28} /><span>{text('查看视频', 'View video')}</span></span>
      : <Icon className="shared-record-placeholder-icon" size={28} strokeWidth={1.7} aria-hidden="true" />}
    </span>
    <span className="shared-record-caption">
      <strong title={feature.name}>{feature.name}</strong>
      <span className="shared-record-excerpt">{feature.description || text('暂无简介', 'No description yet')}</span>
      <small>{layer.name}{feature.type !== 'Point' ? ` · ${kind}` : ''}</small>
    </span>
  </button>;
}

export default function SharedMapViewer({ mapData, onExit, onSaveStoryOrder }) {
  const { lang, t } = useI18n();
  const text = (zh, en) => lang === 'en' ? en : zh;
  const [panelOpen, setPanelOpen] = useState(true);
  const [section, setSection] = useState('records');
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState('grid');
  const [visibility, setVisibility] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [baseMapOverride, setBaseMap] = useState(null);
  const baseMap = baseMapOverride ?? 'terrain';
  const [basePickerOpen, setBasePickerOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const pointerDragRef = useRef(null);
  const suppressClickUntil = useRef(0);
  const mapRef = useRef(null);
  const searchRef = useRef(null);
  const story = useStoryOrder({ mapData, onSaveOrder: onSaveStoryOrder, localOnly: !onExit });
  const canDrag = (!onExit || Boolean(onSaveStoryOrder)) && !story.saving && !story.needsRefresh;
  const contentOpen = panelOpen;
  const presenting = !panelOpen;
  const layers = useMemo(() => sharedMapLayers(mapData.layers, query, visibility), [mapData.layers, query, visibility]);
  const renderedMapData = useMemo(() => ({ ...mapData, base_map: baseMap, layers: sharedPresentationLayers(layers) }), [mapData, baseMap, layers]);
  const records = useMemo(() => orderStoryRecords(layers.flatMap((layer) => layer.visible
    ? layer.features.map((feature) => ({ feature, layer })) : []), story.order), [layers, story.order]);
  const selected = records.find(({ feature }) => feature.id === selectedId);
  const selectedIndex = records.findIndex(({ feature }) => feature.id === selectedId);
  useEffect(() => {
    setDetailId(null);
    if (panelOpen) setSelectedId(null);
    const frame = requestAnimationFrame(() => mapRef.current?.resize());
    return () => cancelAnimationFrame(frame);
  }, [panelOpen]);
  useEffect(() => {
    if (!selected && presenting && records.length) setSelectedId(records[0].feature.id);
    else if (!selected && selectedId !== null) setSelectedId(null);
  }, [presenting, records, selected, selectedId]);
  useEffect(() => {
    if (!presenting || !selected) return undefined;
    const frame = requestAnimationFrame(() => mapRef.current?.focusFeature(selected.feature.id, { immediate: true }));
    return () => cancelAnimationFrame(frame);
  }, [presenting, selected]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  function selectRecord(feature) {
    setSelectedId(feature.id);
    setSection('records');
    setDetailId(null);
    // Wait for the panel layout before asking the map to center the record.
    requestAnimationFrame(() => mapRef.current?.focusFeature(feature.id, { immediate: true }));
  }
  function fitRecords() {
    mapRef.current?.fitPositions(records.flatMap(({ feature }) => geometryCoordinates(feature.geometry)));
  }
  function openSearch() {
    setPanelOpen(true);
    setSection('records');
    setSelectedId(null);
    requestAnimationFrame(() => searchRef.current?.focus());
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice(text('链接已复制', 'Link copied'));
    } catch {
      setNotice(text('无法自动复制，请复制浏览器地址栏中的链接', 'Copy the link from your browser address bar'));
    }
  }

  function moveRecord(sourceId, targetId) {
    if (canDrag) story.move(sourceId, targetId);
  }
  function startPointerDrag(event, featureId) {
    if (!canDrag || event.button !== 0) return;
    if (event.pointerType !== 'mouse' && !event.target.closest('[data-story-handle]')) return;
    pointerDragRef.current = { source: featureId, target: featureId, x: event.clientX, y: event.clientY, active: false };
  }
  function movePointerDrag(event) {
    const drag = pointerDragRef.current;
    if (!drag || !canDrag) return;
    if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    if (!drag.active) {
      drag.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-story-record]');
    if (target) drag.target = Number(target.dataset.storyRecord);
    setDragTarget(drag.target);
    const scroller = event.currentTarget.closest('.shared-panel-scroll');
    const bounds = scroller?.getBoundingClientRect();
    if (bounds && event.clientY > bounds.bottom - 40) scroller.scrollBy(0, 12);
    else if (bounds && event.clientY < bounds.top + 40) scroller.scrollBy(0, -12);
  }
  function endPointerDrag(event, cancelled = false) {
    const drag = pointerDragRef.current;
    if (!drag) return;
    pointerDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragTarget(null);
    if (!drag.active) return;
    event.preventDefault();
    suppressClickUntil.current = performance.now() + 250;
    if (!cancelled) moveRecord(drag.source, drag.target);
  }

  return <main className={`public-map-page shared-map-viewer${contentOpen ? '' : ' panel-collapsed'}${presenting ? ' story-browsing' : ''}`}>
    <aside className="shared-map-panel" aria-label={text('地图内容', 'Map content')} inert={!contentOpen}>
      <nav className="shared-panel-tools" aria-label={text('地图浏览', 'Map navigation')}>
        <button className={section === 'records' ? 'active' : ''} aria-pressed={section === 'records'} onClick={() => { setQuery(''); setSelectedId(null); setSection('records'); }} aria-label={text('地图概览', 'Map overview')}><MapPin size={15} />{text('地点', 'Places')}</button>
        <button className={section === 'layers' ? 'active' : ''} aria-pressed={section === 'layers'} onClick={() => setSection('layers')}><Layers size={15} />{text('图层', 'Layers')}</button>
        <div className="shared-panel-utilities"><LanguageSwitch />{!onExit ? <button className="icon-button" onClick={copyLink} aria-label={text('复制链接', 'Copy link')} title={text('复制链接', 'Copy link')}><Share2 size={17} /></button> : null}</div>
      </nav>
      <header className="shared-map-heading">
        <h1 title={selected?.feature.name || mapData.name}>{section === 'layers' ? text('地图图层', 'Map layers') : selected ? selected.feature.name : query.trim() ? text(`搜索：${query.trim()}`, `Your search: ${query.trim()}`) : mapData.name}</h1>
        <button className="icon-button" onClick={() => setPanelOpen(false)} aria-label={t('editor.collapsePanel')} title={t('editor.collapsePanel')}><ChevronLeft size={20} /></button>
        {!selected ? <p>{section === 'layers' ? mapData.name : query.trim() ? text(`找到 ${records.length} 条记录`, `${records.length} Records`) : mapData.description || text('探索这张地图中的地点与故事', 'Explore the places and stories on this map')}</p> : <p>{selected.layer.name}</p>}
      </header>
      {story.error ? <div className="shared-story-warning" role="alert"><p>{story.error}</p>{story.needsRefresh ? <button onClick={() => window.location.reload()}>{text('刷新地图', 'Refresh map')}</button> : null}</div> : null}
      {section === 'layers' ? <div className="shared-panel-scroll shared-layer-list">
        {mapData.layers.map((layer) => <label key={layer.id}><input type="checkbox" checked={Boolean(visibility[layer.id] ?? layer.visible)} onChange={(event) => setVisibility((state) => ({ ...state, [layer.id]: event.target.checked }))} /><span className="shared-layer-color" style={{ background: layer.style?.color || '#222' }} /><span>{layer.name}<small>{text(`${layer.features.length} 条记录`, `${layer.features.length} Records`)}</small></span></label>)}
      </div> : selected ? <div key={selected.feature.id} className="shared-panel-scroll shared-record-detail">
        <button className="shared-back" onClick={() => setSelectedId(null)}><ArrowLeft size={17} />{text('返回所有记录', 'Back to records')}</button>
        <p className="shared-detail-description">{selected.feature.description || text('这个地点还没有说明。', 'No description for this record yet.')}</p>
        <FeatureMediaGallery attachments={selected.feature.attachments} featureName={selected.feature.name} />
        <button className="shared-back" onClick={() => mapRef.current?.focusFeature(selected.feature.id, { immediate: true })}><MapPin size={17} />{text('在地图上定位', 'Show on map')}</button>
        {records.length > 1 ? <nav className="shared-story-navigation" aria-label={text('依次浏览', 'Browse story')}>
          <button disabled={selectedIndex === 0} onClick={() => selectRecord(records[selectedIndex - 1].feature)}><ChevronLeft size={16} />{text('上一个', 'Previous')}</button>
          <span>{selectedIndex + 1} / {records.length}</span>
          <button disabled={selectedIndex === records.length - 1} onClick={() => selectRecord(records[selectedIndex + 1].feature)}>{text('下一个', 'Next')}<ChevronRight size={16} /></button>
        </nav> : null}
      </div> : <>
        <form className="shared-search" onSubmit={(event) => { event.preventDefault(); fitRecords(); }} role="search">
          <Search size={17} /><input ref={searchRef} aria-label={text('搜索地图记录', 'Search map records')} placeholder={text('搜索地点、说明或图层', 'Search places, descriptions or layers')} value={query} onChange={(event) => setQuery(event.target.value)} />
          {query ? <button type="button" onClick={() => setQuery('')} aria-label={t('editor.clearSearch')}><X size={16} /></button> : null}
        </form>
        <div className="shared-record-toolbar">
          <span aria-live="polite">{text(`${records.length} 条记录`, `${records.length} Records`)}</span>
          <small className="shared-sort-hint" role="status">{story.saving ? text('保存中…', 'Saving…') : onExit ? onSaveStoryOrder ? text('拖动排序 · 自动保存', 'Drag to reorder · Autosaved') : text('只读浏览', 'Read-only view') : text('拖动排序 · 本次浏览', 'Drag to reorder · Your view')}</small>
          <div className="shared-layout-switch" role="group" aria-label={text('展示方式', 'Record layout')}>
            {[['grid', Grid3X3, text('网格', 'Grid')], ['list', List, text('列表', 'List')], ['table', Table2, text('表格', 'Table')]].map(([value, Icon, label]) => <button key={value} aria-label={label} title={label} aria-pressed={layout === value} onClick={() => setLayout(value)}><Icon size={18} /></button>)}
          </div>
        </div>
        <div className="shared-panel-scroll">
          {!records.length ? <div className="shared-empty"><Search size={30} /><h2>{text('没有匹配的记录', 'No matching records')}</h2><p>{text('试试其他关键词，或在图层中打开更多内容。', 'Try another search or enable more layers.')}</p><button className="shared-back" onClick={() => { setQuery(''); setSection('layers'); }}>{text('查看图层', 'View layers')}</button></div> : layout === 'table' ? <table className="shared-record-table"><thead><tr><th>{text('名称', 'Name')}</th><th>{text('图层', 'Layer')}</th></tr></thead><tbody>{records.map(({ feature, layer }) => <tr key={feature.id}><td><button onClick={() => selectRecord(feature)}>{feature.name}</button></td><td>{layer.name}</td></tr>)}</tbody></table> : <div className={`shared-records ${layout}`} role="list" aria-label={text('地图记录', 'Map records')}>
            {records.map(({ feature, layer }, index) => <article
              key={feature.id}
              role="listitem"
              className={`shared-record-item${dragTarget === feature.id ? ' drop-target' : ''}`}
              data-story-record={feature.id}
              data-draggable={canDrag}
              onPointerDown={(event) => startPointerDrag(event, feature.id)}
              onPointerMove={movePointerDrag}
              onPointerUp={endPointerDrag}
              onPointerCancel={(event) => endPointerDrag(event, true)}
              onLostPointerCapture={(event) => endPointerDrag(event, true)}
              onDragStart={(event) => event.preventDefault()}
              onClickCapture={(event) => { if (performance.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); } }}
              onKeyDown={(event) => {
                if (!canDrag || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
                event.preventDefault();
                event.stopPropagation();
                const target = records[index + (event.key === 'ArrowUp' ? -1 : 1)];
                if (target) moveRecord(feature.id, target.feature.id);
              }}
            >
              <RecordCard feature={feature} layer={layer} selected={selectedId === feature.id} sequence={index + 1} draggable={canDrag} onSelect={() => selectRecord(feature)} text={text} />
            </article>)}
          </div>}
        </div>
      </>}
      <footer className="shared-map-footer">{text('由', 'Made with')} <strong>Open My Map</strong><span>{text('只读地图', 'Read-only map')}</span></footer>
    </aside>

    <div className="shared-map-stage">
      <AmapMap className="shared-map-canvas" mapData={renderedMapData} quietBasemap onReady={(controller) => { mapRef.current = controller; }} onFeatureSelect={(feature) => { selectRecord(feature); if (presenting) setDetailId(feature.id); }} onMapClick={() => { setDetailId(null); if (!presenting) setSelectedId(null); }} selectedFeatureId={selected?.feature.id || null} showZoomControls />
      {presenting ? <StoryPresentation records={records} selectedId={selectedId} showDetails={detailId !== null && detailId === selectedId} onCloseDetails={() => setDetailId(null)} onSelect={selectRecord} text={text} /> : null}
      <button className="shared-panel-toggle" onClick={() => setPanelOpen((value) => !value)} aria-label={panelOpen ? t('editor.collapsePanel') : text('展开内容面板', 'Show content panel')} aria-expanded={panelOpen}>{panelOpen ? <ChevronLeft size={23} /> : <ChevronRight size={23} />}</button>
      <div className="shared-map-actions">
        {onExit ? <button onClick={onExit} aria-label={text('返回编辑器', 'Back to editor')}><ArrowLeft size={18} /><span>{text('返回编辑器', 'Back to editor')}</span></button> : null}
        <button onClick={openSearch} aria-label={t('editor.searchPlace')}><Search size={18} /><span>{t('editor.searchPlace')}</span></button>
        <div className="shared-base-map-control"><button onClick={() => setBasePickerOpen((value) => !value)} aria-label={text('切换底图', 'Change map')} aria-expanded={basePickerOpen}><Map size={18} /><span>{text('切换底图', 'Change map')}</span></button>
          {basePickerOpen ? <div className="shared-base-map-menu" role="group" aria-label={text('底图', 'Base map')}>{Object.entries(BASE_MAPS).map(([key, option]) => <button key={key} aria-pressed={baseMap === key} onClick={() => { setBaseMap(key); setBasePickerOpen(false); }}>{lang === 'en' ? option.englishName : option.name}</button>)}</div> : null}
        </div>
        <button onClick={fitRecords} aria-label={text('显示所有记录', 'Fit records')} title={text('显示所有记录', 'Fit records')}><MapPin size={18} /></button>
      </div>
    </div>
    {!contentOpen && story.error ? <div className="shared-map-notice" role="alert">{story.error}{story.needsRefresh ? <button onClick={() => window.location.reload()}>{text('刷新地图', 'Refresh map')}</button> : null}</div> : notice ? <div className="shared-map-notice" role="status">{notice}</div> : null}
  </main>;
}
