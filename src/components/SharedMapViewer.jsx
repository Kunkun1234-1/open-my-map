import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Earth, GripVertical, Layers, MapPin, Pentagon, Route, Search, Share2, Video } from 'lucide-react';
import { LanguageSwitch, useI18n } from '../i18n/index.jsx';
import AmapMap from './AmapMap.jsx';
import { geometryCoordinates } from './map-engine-utils.js';
import { moveStoryRecord, orderStoryRecords, sharedMapLayers, sharedPresentationLayers } from './shared-map-utils.js';
import useStoryOrder from './useStoryOrder.js';
import { getStoryDragTarget, storyDragOffset } from './story-drag-utils.js';
import StoryPresentation from './StoryPresentation.jsx';
import PreviewSearch from './PreviewSearch.jsx';
import BaseMapPicker from './editor/BaseMapPicker.jsx';
import MarkerIcon from './editor/MarkerIcon.jsx';
import { recordGeometryPath, recordSymbolStyle } from './record-symbol-utils.js';
import './shared-map-viewer.css';

function RecordCard({ feature, layer, selected, onSelect, sequence, draggable, text }) {
  const [failedMedia, setFailedMedia] = useState(null);
  const media = feature.attachments?.find((item) => item.kind === 'image') || feature.attachments?.[0];
  const showMedia = media && failedMedia !== media.id;
  const type = feature.type === 'Point' ? 'place' : feature.type === 'Polygon' ? 'area' : 'route';
  const Icon = type === 'place' ? MapPin : type === 'area' ? Pentagon : Route;
  const symbol = recordSymbolStyle(feature, layer);
  const geometryPath = useMemo(() => recordGeometryPath(feature.geometry), [feature.geometry]);
  const kind = feature.type === 'Point' ? text('地点', 'Place') : feature.type === 'Polygon' ? text('区域', 'Area') : text('路线', 'Route');
  return <button type="button" className={`shared-record${selected ? ' selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
    <span className="shared-record-sequence" aria-label={text(`第 ${sequence} 条`, `Record ${sequence}`)}>{String(sequence).padStart(2, '0')}</span>
    <span className={`shared-record-cover ${type}`} style={{ '--record-color': symbol.color }} aria-label={kind}>
      {showMedia && media.kind === 'image'
        ? <img src={media.url} alt="" draggable={false} loading="lazy" decoding="async" onError={() => setFailedMedia(media.id)} />
        : showMedia && media.kind === 'video' ? <Video size={20} />
          : type === 'place' ? <MarkerIcon icon={symbol.icon} size={21} data-record-icon={symbol.icon} />
            : geometryPath ? <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" data-record-geometry={feature.type}>
              <path d={geometryPath} fill={type === 'area' ? symbol.fillColor : 'none'} fillOpacity={symbol.fillOpacity} fillRule="evenodd" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg> : <Icon size={20} strokeWidth={1.7} aria-hidden="true" />}
    </span>
    <span className="shared-record-caption">
      <strong title={feature.name}>{feature.name}</strong>
      <span className="shared-record-excerpt">{feature.description || text('暂无简介', 'No description yet')}</span>
      <small>{layer.name}</small>
    </span>
    {draggable ? <span className="shared-record-grip" data-story-handle draggable={false} title={text('拖动排序', 'Drag to reorder')}><GripVertical size={16} aria-hidden="true" /></span> : null}
  </button>;
}

export default function SharedMapViewer({ mapData, onExit, onSaveStoryOrder }) {
  const { lang, t } = useI18n();
  const text = (zh, en) => lang === 'en' ? en : zh;
  const [panelOpen, setPanelOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [baseMapOverride, setBaseMap] = useState(null);
  const baseMap = baseMapOverride ?? 'terrain';
  const [basePickerOpen, setBasePickerOpen] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState({});
  const [notice, setNotice] = useState('');
  const [dragPreview, setDragPreview] = useState(null);
  const recordListRef = useRef(null);
  const dragGhostRef = useRef(null);
  const pointerDragRef = useRef(null);
  const suppressClickUntil = useRef(0);
  const mapRef = useRef(null);
  const initialFocusDoneRef = useRef(false);
  const searchButtonRef = useRef(null);
  const story = useStoryOrder({ mapData, onSaveOrder: onSaveStoryOrder, localOnly: !onExit });
  const canDrag = (!onExit || Boolean(onSaveStoryOrder)) && !story.saving && !story.needsRefresh;
  const layers = useMemo(() => sharedMapLayers(mapData.layers, '', layerVisibility), [mapData.layers, layerVisibility]);
  const layerChoices = onExit ? mapData.layers : mapData.layers.filter((layer) => layer.visible);
  const layerLabel = text('图层', 'Layers');
  const hasLayerRecords = layerChoices.some((layer) => layer.features.length > 0);
  const renderedMapData = useMemo(() => ({ ...mapData, base_map: baseMap, layers: sharedPresentationLayers(layers) }), [mapData, baseMap, layers]);
  const records = useMemo(() => orderStoryRecords(layers.flatMap((layer) => layer.visible
    ? layer.features.map((feature) => ({ feature, layer })) : []), story.order), [layers, story.order]);
  const [selectedId, setSelectedId] = useState(() => records[0]?.feature.id ?? null);
  const [detailId, setDetailId] = useState(() => records[0]?.feature.id ?? null);
  const selected = records.find(({ feature }) => feature.id === selectedId);
  const recordOrderKey = records.map(({ feature }) => feature.id).join(',');
  const dragRecord = dragPreview ? records.find(({ feature }) => feature.id === dragPreview.source) : null;
  const previewPositions = useMemo(() => {
    if (!dragPreview?.valid) return null;
    const ids = records.map(({ feature }) => feature.id);
    return new Map(moveStoryRecord(ids, dragPreview.source, dragPreview.target).map((id, index) => [id, index + 1]));
  }, [records, dragPreview?.source, dragPreview?.target, dragPreview?.valid]);
  const dragging = dragPreview !== null;
  useEffect(() => {
    if (!mapReady || initialFocusDoneRef.current) return undefined;
    // The SDK and feature overlays must be ready before applying the opening view.
    const frame = requestAnimationFrame(() => {
      initialFocusDoneRef.current = true;
      if (selectedId !== null) mapRef.current?.focusFeature(selectedId, { immediate: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [mapReady, selectedId]);
  useEffect(() => {
    const drag = pointerDragRef.current;
    if (drag && (!canDrag || !panelOpen || drag.orderKey !== recordOrderKey || drag.version !== mapData.version)) endPointerDrag(null, true);
  }, [canDrag, panelOpen, recordOrderKey, mapData.version]);
  useEffect(() => {
    if (!dragging) return undefined;
    const cancel = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      endPointerDrag(null, true);
    };
    const cancelOnBlur = () => endPointerDrag(null, true);
    window.addEventListener('keydown', cancel);
    window.addEventListener('blur', cancelOnBlur);
    return () => { window.removeEventListener('keydown', cancel); window.removeEventListener('blur', cancelOnBlur); };
  }, [dragging]);
  useEffect(() => () => {
    const drag = pointerDragRef.current;
    pointerDragRef.current = null;
    if (!drag) return;
    cancelAnimationFrame(drag.frame);
    if (drag.node.hasPointerCapture(drag.pointerId)) drag.node.releasePointerCapture(drag.pointerId);
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => mapRef.current?.resize());
    return () => cancelAnimationFrame(frame);
  }, [panelOpen]);
  useEffect(() => {
    if (!selected && selectedId !== null) { setSelectedId(null); setDetailId(null); }
  }, [selected, selectedId]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  function selectRecord(feature, showDetails = false) {
    setSelectedId(feature.id);
    setDetailId(showDetails ? feature.id : null);
    setSearchOpen(false);
    setBasePickerOpen(false);
    // Wait for the panel layout before asking the map to center the record.
    requestAnimationFrame(() => mapRef.current?.focusFeature(feature.id, { drift: true }));
  }
  function fitRecords() {
    mapRef.current?.fitPositions(records.flatMap(({ feature }) => geometryCoordinates(feature.geometry)));
  }
  function closeSearch() {
    setSearchOpen(false);
    requestAnimationFrame(() => searchButtonRef.current?.focus());
  }
  function openSearch() {
    setSearchOpen((value) => !value);
    setBasePickerOpen(false);
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
    if (!canDrag || event.button !== 0 || event.isPrimary === false || pointerDragRef.current) return;
    if (event.pointerType !== 'mouse' && !event.target.closest('[data-story-handle]')) return;
    const node = event.currentTarget;
    const scroller = node.closest('.shared-panel-scroll');
    const bounds = node.getBoundingClientRect();
    const items = Array.from(recordListRef.current.querySelectorAll('[data-story-record]'), (item) => {
      const rect = item.getBoundingClientRect();
      return { id: Number(item.dataset.storyRecord), top: rect.top, height: rect.height };
    });
    pointerDragRef.current = {
      source: featureId, target: featureId, node, scroller, items,
      pointerId: event.pointerId, active: false, frame: null,
      x: event.clientX, y: event.clientY, clientX: event.clientX, clientY: event.clientY,
      offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top,
      width: bounds.width, height: bounds.height, initialScroll: scroller.scrollTop,
      orderKey: recordOrderKey, version: mapData.version, valid: true,
    };
  }
  function updateDragTarget(drag, bounds = drag.scroller.getBoundingClientRect()) {
    const valid = drag.clientX >= bounds.left && drag.clientX <= bounds.right
      && drag.clientY >= bounds.top && drag.clientY <= bounds.bottom;
    const target = valid ? getStoryDragTarget(drag.items,
      drag.clientY - drag.offsetY + drag.height / 2,
      drag.scroller.scrollTop - drag.initialScroll) : drag.source;
    if (drag.target !== target || drag.valid !== valid) {
      drag.target = target;
      drag.valid = valid;
      setDragPreview((current) => current ? { ...current, target, valid } : current);
    }
  }
  function animatePointerDrag() {
    const drag = pointerDragRef.current;
    if (!drag?.active) return;
    const bounds = drag.scroller.getBoundingClientRect();
    if (drag.clientX >= bounds.left && drag.clientX <= bounds.right && drag.clientY >= bounds.top && drag.clientY <= bounds.bottom) {
      const speed = drag.clientY < bounds.top + 36 ? -8 : drag.clientY > bounds.bottom - 36 ? 8 : 0;
      if (speed) drag.scroller.scrollTop += speed;
    }
    updateDragTarget(drag, bounds);
    if (dragGhostRef.current) {
      dragGhostRef.current.style.transform = `translate3d(${drag.clientX - drag.offsetX}px, ${drag.clientY - drag.offsetY}px, 0) rotate(1deg)`;
    }
    drag.frame = requestAnimationFrame(animatePointerDrag);
  }
  function movePointerDrag(event) {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !canDrag) return;
    drag.clientX = event.clientX;
    drag.clientY = event.clientY;
    if (!drag.active && Math.hypot(drag.clientX - drag.x, drag.clientY - drag.y) < 6) return;
    event.preventDefault();
    if (!drag.active) {
      drag.active = true;
      drag.node.setPointerCapture(drag.pointerId);
      setDragPreview({ source: drag.source, target: drag.target, items: drag.items,
        width: drag.width, left: drag.clientX - drag.offsetX, top: drag.clientY - drag.offsetY, valid: true });
      drag.frame = requestAnimationFrame(animatePointerDrag);
    }
  }
  function endPointerDrag(event, cancelled = false) {
    const drag = pointerDragRef.current;
    if (!drag || (event && drag.pointerId !== event.pointerId)) return;
    if (drag.active && event) {
      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
      updateDragTarget(drag);
    }
    pointerDragRef.current = null;
    cancelAnimationFrame(drag.frame);
    if (drag.node.hasPointerCapture(drag.pointerId)) drag.node.releasePointerCapture(drag.pointerId);
    setDragPreview(null);
    if (!drag.active) return;
    event?.preventDefault();
    suppressClickUntil.current = performance.now() + 250;
    if (!cancelled && drag.valid && drag.source !== drag.target) moveRecord(drag.source, drag.target);
    requestAnimationFrame(() => drag.node.querySelector('button')?.focus({ preventScroll: true }));
  }

  return <main className={`public-map-page shared-map-viewer${panelOpen ? '' : ' panel-collapsed'}${dragging ? ' is-reordering' : ''}`}>
    <aside id="shared-record-panel" className="shared-map-panel" aria-label={text('地图内容', 'Map content')} inert={!panelOpen}>
      <header className="shared-map-heading">
        <h1 title={mapData.name}>{mapData.name}</h1>
        <p>{mapData.description || text('探索这张地图中的地点与故事', 'Explore the places and stories on this map')}</p>
      </header>
      {story.error ? <div className="shared-story-warning" role="alert"><p>{story.error}</p>{story.needsRefresh ? <button onClick={() => window.location.reload()}>{text('刷新地图', 'Refresh map')}</button> : null}</div> : null}
      {layerChoices.length > 0 ? <details className="shared-layer-picker">
        <summary><Layers size={15} aria-hidden="true" />{layerLabel}<ChevronDown size={14} aria-hidden="true" /></summary>
        <div className="shared-layer-options" role="group" aria-label={layerLabel}>
          {layerChoices.map((layer) => <label key={layer.id} className="shared-layer-option">
            <input
              type="checkbox"
              checked={Boolean(layerVisibility[layer.id] ?? layer.visible)}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setLayerVisibility((current) => ({ ...current, [layer.id]: checked }));
              }}
            />
            <span>{layer.name}</span>
            <small aria-hidden="true">{layer.features.length}</small>
          </label>)}
        </div>
      </details> : null}
      <div className="shared-record-toolbar">
        <span>{text(`${records.length} 条记录`, `${records.length} Records`)}</span>
        {canDrag || story.saving ? <small className="shared-sort-hint" role="status">{story.saving ? text('保存中…', 'Saving…') : onExit ? text('拖动调整顺序', 'Drag to reorder') : text('拖动排序 · 本次浏览', 'Reorder · Your view')}</small> : null}
      </div>
      <div className="shared-panel-scroll">
        {!records.length ? <div className="shared-empty"><MapPin size={26} /><h2>{text('暂无可浏览的记录', 'No places to explore yet')}</h2><p>{hasLayerRecords ? text('勾选包含记录的图层即可查看。', 'Enable a layer with records to see them here.') : text('这张地图还没有可见的地点。', 'This map has no visible places yet.')}</p></div> : <div ref={recordListRef} className="shared-records list" role="list" aria-label={text('地图记录', 'Map records')}>
            {records.map(({ feature, layer }, index) => <article
              key={feature.id}
              role="listitem"
              className={`shared-record-item${dragPreview?.source === feature.id ? ' drag-source' : ''}`}
              style={dragPreview?.valid ? { transform: `translateY(${storyDragOffset(dragPreview.items, dragPreview.source, dragPreview.target, feature.id)}px)` } : undefined}
              data-drop-label={text('放到这里', 'Drop here')}
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
              <RecordCard feature={feature} layer={layer} selected={selectedId === feature.id} sequence={previewPositions?.get(feature.id) || index + 1} draggable={canDrag} onSelect={() => selectRecord(feature, true)} text={text} />
            </article>)}
        </div>}
      </div>
      <div className="shared-panel-tools">
        <div className="shared-panel-utilities"><LanguageSwitch />{!onExit ? <button className="icon-button" onClick={copyLink} aria-label={text('复制链接', 'Copy link')} title={text('复制链接', 'Copy link')}><Share2 size={17} /></button> : null}</div>
      </div>
    </aside>

    <div className={`shared-map-stage${searchOpen ? ' search-active' : ''}${basePickerOpen ? ' basemap-active' : ''}`}>
      <AmapMap className="shared-map-canvas" mapData={renderedMapData} quietBasemap onReady={(controller) => { mapRef.current = controller; setMapReady(true); }} onFeatureSelect={(feature) => selectRecord(feature, true)} onMapClick={() => { setDetailId(null); setSelectedId(null); setSearchOpen(false); setBasePickerOpen(false); }} selectedFeatureId={selected?.feature.id || null} />
      <button type="button" className="shared-panel-toggle" onClick={() => setPanelOpen((value) => !value)} aria-label={text(panelOpen ? '收起列表' : '展开列表', panelOpen ? 'Hide places' : 'Show places')} title={text(panelOpen ? '收起列表' : '展开列表', panelOpen ? 'Hide places' : 'Show places')} aria-expanded={panelOpen} aria-controls="shared-record-panel">{panelOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}</button>
      <div className="shared-map-actions">
        <div className={`preview-search-control${searchOpen ? ' is-open' : ''}`}>
          <button ref={searchButtonRef} onClick={openSearch} aria-label={t('editor.searchPlace')} aria-expanded={searchOpen} aria-controls="preview-search" className="preview-search-trigger" tabIndex={searchOpen ? -1 : 0} inert={searchOpen}><Search size={18} /><span>{t('editor.searchPlace')}</span></button>
          <PreviewSearch open={searchOpen} records={records} onSelect={(feature) => { selectRecord(feature, true); requestAnimationFrame(() => searchButtonRef.current?.focus()); }} onClose={closeSearch} text={text} />
        </div>
        <button onClick={fitRecords} aria-label={text('显示所有记录', 'Fit records')} title={text('显示所有记录', 'Fit records')}><Earth size={18} strokeWidth={1.7} aria-hidden="true" /></button>
      </div>
      <BaseMapPicker value={baseMap} open={basePickerOpen} onToggle={() => { setBasePickerOpen((value) => !value); setSearchOpen(false); }} onChange={(key) => { setBaseMap(key); setBasePickerOpen(false); }} lang={lang} />
      <div className="shared-right-rail">
        {selected ? <StoryPresentation placement="rail" records={records} selectedId={selectedId} showDetails={detailId === selectedId} onCloseDetails={() => { setDetailId(null); setSelectedId(null); }} onOpenDetails={() => setDetailId(selectedId)} onSelect={(feature) => selectRecord(feature, detailId !== null)} text={text} /> : null}
      </div>
    </div>
    {dragPreview && dragRecord ? createPortal(<div ref={dragGhostRef} className={`shared-drag-preview${dragPreview.valid ? '' : ' invalid'}`} data-testid="story-drag-preview" data-preview-position={previewPositions?.get(dragPreview.source)} aria-hidden="true" inert style={{ width: dragPreview.width, transform: `translate3d(${dragPreview.left}px, ${dragPreview.top}px, 0) rotate(1deg)` }}>
      <RecordCard feature={dragRecord.feature} layer={dragRecord.layer} sequence={previewPositions?.get(dragPreview.source) || records.findIndex(({ feature }) => feature.id === dragPreview.source) + 1} selected={false} draggable={false} text={text} />
    </div>, document.body) : null}
    <span className="visually-hidden" role="status">{dragRecord ? dragPreview.valid ? text(`正在移动${dragRecord.feature.name}，放到第 ${previewPositions?.get(dragPreview.source)} 项；按 Esc 取消`, `Moving ${dragRecord.feature.name} to position ${previewPositions?.get(dragPreview.source)}; Escape to cancel`) : text('移回列表以调整顺序，或按 Esc 取消', 'Return to the list to reorder, or press Escape to cancel') : ''}</span>
    {notice ? <div className="shared-map-notice" role="status">{notice}</div> : null}
  </main>;
}
