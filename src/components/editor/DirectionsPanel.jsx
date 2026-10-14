import { useEffect, useState } from 'react';
import {
  ArrowDown, ArrowDownUp, ArrowLeft, ArrowUp, Bike, Car, Check, Circle, Footprints,
  GripVertical, LoaderCircle, LocateFixed, MapPin, Plus, Route, X,
} from 'lucide-react';
import { MAX_ROUTE_STOPS, formatRouteDistance, formatRouteDuration } from '../../routing.js';

export default function DirectionsPanel({ directions, canSave = true, layerName = '', lang = 'zh', onClose, embedded = false }) {
  const text = (zh, en) => lang === 'en' ? en : zh;
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [draggingStop, setDraggingStop] = useState(null);
  const {
    visible, stops, mode, alternatives, selectedAlternativeId, selectedAlternative,
    activeStopId, pickingStopId, suggestions, loading, resolving, locating, saving, error,
  } = directions;

  useEffect(() => setSuggestionIndex(-1), [suggestions, activeStopId]);
  if (!visible) return null;

  const handleInputKey = (event, stop) => {
    if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault();
      setSuggestionIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && suggestions.length) {
      event.preventDefault();
      setSuggestionIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (suggestionIndex >= 0 && suggestions[suggestionIndex]) directions.chooseStop(stop.id, suggestions[suggestionIndex]);
      else directions.resolveStop(stop.id);
    } else if (event.key === 'Escape') {
      directions.setActiveStop(null);
      directions.setPickingStop(null);
    }
  };

  const stepList = selectedAlternative ? <ol>{selectedAlternative.steps.map((step, index) => <li key={index}><span className="directions-step-number">{index + 1}</span><div><b>{step.instruction || step.road || text('沿路线继续前行', 'Continue along the route')}</b><small>{formatRouteDistance(step.distance, lang)}{step.duration ? ` · ${formatRouteDuration(step.duration, lang)}` : ''}</small></div></li>)}</ol> : null;
  const routeOptions = <>
    {alternatives.length > 1 ? <div className="directions-route-options" role="group" aria-label={text('路线方案', 'Route options')}>{alternatives.map((route, index) => <button type="button" key={route.id} className={`directions-alternative${route.id === selectedAlternativeId ? ' selected' : ''}`} aria-pressed={route.id === selectedAlternativeId} onClick={() => directions.selectAlternative(route.id)}>
      <span className="directions-route-swatch" aria-hidden="true" />
      <span><b>{formatRouteDuration(route.duration, lang)}</b><small>{text(`路线 ${index + 1}`, `Route ${index + 1}`)} · {formatRouteDistance(route.distance, lang)}</small></span>
      {route.id === selectedAlternativeId ? <Check size={18} /> : null}
    </button>)}</div> : null}
    {selectedAlternative ? embedded ? <div className="directions-steps">{stepList}</div> : <details className="directions-steps"><summary>{text('逐段路线说明', 'Step-by-step directions')}<span>{selectedAlternative.steps.length}</span></summary>{stepList}</details> : null}
  </>;

  return (
    <section className={`editor-directions-panel${embedded ? ' directions-embedded' : ''}`} aria-label={embedded ? text('路线图层', 'Directions layer') : text('路线规划', 'Directions')}>
      {!embedded ? <header className="directions-panel-header">
        <button type="button" className="icon-button" onClick={onClose || directions.close} aria-label={text('关闭路线规划，返回地图', 'Close directions and return to map')}><ArrowLeft size={20} /></button>
        <h2>{text('路线', 'Directions')}</h2>
        <button type="button" className="icon-button" onClick={directions.swapStops} aria-label={text('交换起点和终点', 'Reverse the order of your stops')} title={text('交换起点和终点', 'Reverse stops')}><ArrowDownUp size={19} /></button>
      </header> : null}

      <div className="directions-travel-modes" role="group" aria-label={text('出行方式', 'Travel mode')}>
        {[
          ['driving', Car, text('驾车', 'Drive')],
          ['walking', Footprints, text('步行', 'Walk')],
          ['cycling', Bike, text('骑行', 'Cycle')],
        ].map(([value, Icon, label]) => <button key={value} type="button" className={mode === value ? 'selected' : ''} aria-pressed={mode === value} onClick={() => directions.setMode(value)}><Icon size={embedded ? 17 : 20} /><span>{label}</span></button>)}
      </div>

      <div className="directions-stop-list">
        {stops.map((stop, index) => {
          const origin = index === 0;
          const destination = index === stops.length - 1;
          const label = origin ? text('起点', 'Starting point') : destination ? text('终点', 'Destination') : text(`途经点 ${index}`, `Stop ${index}`);
          const expanded = activeStopId === stop.id && suggestions.length > 0;
          const listId = `directions-suggestions-${stop.id}`;
          return (
            <div key={stop.id} className={`directions-stop-row${pickingStopId === stop.id ? ' picking' : ''}${draggingStop === index ? ' dragging' : ''}`}
              onDragOver={(event) => { if (draggingStop !== null) event.preventDefault(); }}
              onDrop={(event) => { event.preventDefault(); if (draggingStop !== null) directions.reorderStop(draggingStop, index); setDraggingStop(null); }}>
              <button type="button" className="directions-stop-grip" draggable title={text('拖动排序；也可按上下方向键', 'Drag to reorder, or use the up and down arrow keys')} aria-label={text(`调整${label}顺序`, `Reorder ${label}`)}
                onDragStart={(event) => { setDraggingStop(index); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); }}
                onDragEnd={() => setDraggingStop(null)}
                onKeyDown={(event) => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); directions.reorderStop(index, index + (event.key === 'ArrowUp' ? -1 : 1)); } }}><GripVertical size={16} /></button>
              <button type="button" className={`directions-stop-symbol ${origin ? 'origin' : destination ? 'destination' : ''}`} aria-label={text(`在地图上选择${label}`, `Choose ${label} on the map`)} aria-pressed={pickingStopId === stop.id} title={text(`在地图上选择${label}`, `Choose ${label} on the map`)} onClick={() => { directions.setActiveStop(null); directions.setPickingStop(pickingStopId === stop.id ? null : stop.id); }}>{embedded ? <span className="directions-stop-letter">{String.fromCharCode(65 + index)}</span> : origin ? <Circle size={16} /> : destination ? <MapPin size={20} /> : <span>{String.fromCharCode(65 + index)}</span>}</button>
              <div className="directions-stop-field">
                <input aria-label={label} value={stop.text} placeholder={embedded ? label : text(`选择${label}，或输入经度,纬度`, `Choose ${label.toLowerCase()}, or enter longitude,latitude`)}
                  onChange={(event) => directions.updateStopText(stop.id, event.target.value)}
                  onFocus={() => { directions.setActiveStop(stop.id); directions.setPickingStop(null); }}
                  onKeyDown={(event) => handleInputKey(event, stop)}
                  role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId} aria-activedescendant={expanded && suggestionIndex >= 0 ? `${listId}-${suggestionIndex}` : undefined} />
                {stop.address ? <small>{stop.address}</small> : null}
                {expanded ? <div className="directions-stop-suggestions" id={listId} role="listbox" aria-label={text(`${label}搜索结果`, `${label} search results`)}>{suggestions.map((candidate, candidateIndex) => <button key={candidate.id} id={`${listId}-${candidateIndex}`} type="button" role="option" aria-selected={suggestionIndex === candidateIndex} className={suggestionIndex === candidateIndex ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => directions.chooseStop(stop.id, candidate)}><MapPin size={17} /><span><b>{candidate.name}</b><small>{candidate.address || candidate.city}</small></span></button>)}</div> : null}
              </div>
              <div className="directions-stop-controls">
                {stops.length > 2 ? <button type="button" className="icon-button" onClick={() => directions.removeStop(stop.id)} aria-label={text(`删除${label}`, `Remove ${label}`)}><X size={15} /></button> : null}
                <button type="button" className="directions-stop-move" disabled={index === 0} onClick={() => directions.reorderStop(index, index - 1)} aria-label={text(`${label}上移`, `Move ${label} up`)}><ArrowUp size={13} /></button>
                <button type="button" className="directions-stop-move" disabled={index === stops.length - 1} onClick={() => directions.reorderStop(index, index + 1)} aria-label={text(`${label}下移`, `Move ${label} down`)}><ArrowDown size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`directions-stop-actions${embedded ? ' directions-embedded-actions' : ''}`}>
        <button type="button" className="directions-add-stop" disabled={stops.length >= MAX_ROUTE_STOPS} onClick={directions.addStop}><Plus size={17} />{text('添加目的地', 'Add destination')}</button>
        <button type="button" className="directions-current-location" disabled={locating} onClick={directions.useCurrentLocation} aria-label={text('我的位置作为起点', 'Use your location')} title={text('我的位置作为起点', 'Use your location')}>{locating ? <LoaderCircle size={16} className="spin" /> : <LocateFixed size={16} />}{!embedded ? text('我的位置作为起点', 'Use your location') : null}</button>
        {embedded ? <button type="button" className="directions-reverse" onClick={directions.swapStops} aria-label={text('交换起点和终点', 'Reverse the order of your stops')} title={text('交换起点和终点', 'Reverse stops')}><ArrowDownUp size={16} /></button> : null}
      </div>
      {pickingStopId ? <p className="directions-pick-hint">{text('点击地图，为高亮输入框选择位置。', 'Click the map to set the highlighted stop.')}</p> : null}
      {error ? <div className="directions-error" role="alert"><p>{error}</p>{directions.canRetry ? <button type="button" className="directions-retry" disabled={loading || saving} onClick={directions.retry}><Route size={16} />{text('重新规划', 'Try again')}</button> : null}</div> : null}

      <div className="directions-alternatives" aria-live="polite" aria-busy={loading || resolving}>
        {loading || resolving ? <p className="directions-loading"><LoaderCircle size={18} className="spin" />{loading ? text('正在规划路线…', 'Finding routes…') : text('正在查找地点…', 'Finding this place…')}</p> : null}
        {!loading && !alternatives.length && !error ? <p className="directions-empty">{!embedded ? <Route size={26} /> : null}<span>{embedded ? text('填写 A、B 地点或点击字母后在地图上选点。', 'Enter A and B, or click a letter to choose a point on the map.') : text('设置起点和终点，开始规划旅程。', 'Choose your starting point and destination.')}</span>{!embedded ? <small>{text('输入地址后，从联想结果中选点，或按回车搜索。', 'Choose an address suggestion, or press Enter to search.')}</small> : null}</p> : null}
        {!loading && selectedAlternative ? embedded ? <details className="directions-more"><summary>{text('分段路线', 'Detailed directions')}<small>{formatRouteDistance(selectedAlternative.distance, lang)} · {formatRouteDuration(selectedAlternative.duration, lang)}</small></summary>{routeOptions}</details> : routeOptions : null}
      </div>
      <footer className="directions-panel-footer">
        <p className={directions.isSaved ? 'directions-saved-status' : ''} role="status">{directions.isSaved ? text('路线图层已保存', 'Directions layer saved') : embedded ? directions.target?.featureId ? text('更改尚未保存', 'Changes not yet saved') : text('保存后，这条路线会成为独立图层。', 'Save this route as its own layer.') : text('当前路线为预览。保存后才会添加到地图图层。', 'This is a preview. Save to add the route to your map.')}</p>
        <button type="button" className="directions-save-route" disabled={!canSave || !selectedAlternative || loading || saving || (embedded && directions.isSaved)} onClick={() => directions.save({ keepOpen: embedded })}>{saving ? <LoaderCircle className="spin" size={17} /> : directions.isSaved ? <Check size={17} /> : <Plus size={17} />}{saving ? text('正在保存…', 'Saving…') : embedded ? directions.isSaved ? text('已保存', 'Saved') : directions.target?.featureId ? text('更新路线图层', 'Update directions layer') : text('保存路线图层', 'Save directions layer') : text('保存到当前图层', 'Save to current layer')}</button>
        {layerName ? <small>{text('图层：', 'Layer: ')}{layerName}</small> : null}
      </footer>
    </section>
  );
}
