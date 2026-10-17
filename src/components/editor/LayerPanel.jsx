import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  MoreVertical,
  PaintRoller,
  Palette,
  Route,
  Upload,
} from 'lucide-react';
import DirectionsLayerSummary from './DirectionsLayerSummary.jsx';
import MarkerIcon from './MarkerIcon.jsx';
import './layer-panel.css';
import './reference-layer-panel.css';
import './reference-layer-menu.css';

const DRAG_TYPE = 'application/x-open-my-map-item';

function sameId(left, right) {
  return String(left) === String(right);
}

function reorder(ids, id, insertionIndex) {
  const sourceIndex = ids.findIndex((item) => sameId(item, id));
  if (sourceIndex < 0) return ids;
  const result = [...ids];
  const [source] = result.splice(sourceIndex, 1);
  const targetIndex = Math.max(
    0,
    Math.min(result.length, insertionIndex - (sourceIndex < insertionIndex ? 1 : 0)),
  );
  result.splice(targetIndex, 0, source);
  return result;
}

function DefaultPinSymbol() {
  return <svg viewBox="0 0 20 24" width="18" height="22" aria-hidden="true">
    <path d="M10 23S2 15.6 2 9.5a8 8 0 1 1 16 0C18 15.6 10 23 10 23Z" fill="currentColor" />
    <circle cx="10" cy="9.5" r="3" fill="#fff" />
  </svg>;
}

function PolygonFeatureSymbol() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <polygon points="5,18 7,6 17,4 21,14 14,20" fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeWidth="1.6" />
    {[[5, 18], [7, 6], [17, 4], [21, 14], [14, 20]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.6" fill="#fff" stroke="currentColor" strokeWidth="1.4" />)}
  </svg>;
}

function LineFeatureSymbol() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <polyline points="4,18 9,6 14,16 20,19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    {[[4, 18], [9, 6], [14, 16], [20, 19]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.7" fill="#fff" stroke="currentColor" strokeWidth="1.4" />)}
  </svg>;
}

export default function LayerPanel({
  layers = [],
  selectedLayerId,
  selectedFeatureId,
  expandedLayers = {},
  onToggleExpanded,
  onSelectLayer,
  onSelectFeature,
  onToggleLayer,
  onRenameLayer,
  onDeleteLayer,
  onImport,
  onTable,
  onExport,
  onFeatureStyle,
  onLayerStyle,
  onReorderLayers,
  onReorderFeatures,
  onMoveFeature,
  onEditFeature,
  canEdit = true,
  peers = [],
  user,
  t,
  lang = 'zh',
  renderFeatureStyle,
  renderDirections,
  onEditDirections,
  hidden = false,
}) {
  const text = (zh, en) => (lang === 'en' ? en : zh);
  const translate = (key, fallback, values) => (t ? t(key, values) : fallback);
  const [layerMenu, setLayerMenu] = useState(null);
  const [featureMenu, setFeatureMenu] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const dragRef = useRef(null);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const featureStyleButtonsRef = useRef(new Map());

  const anchorMenu = (button, width = 220) => {
    const bounds = button.getBoundingClientRect();
    menuButtonRef.current = button;
    setMenuPosition({ left: Math.max(8, bounds.right - width), top: bounds.bottom + 4 });
  };

  useLayoutEffect(() => {
    if (layerMenu === null && featureMenu === null) return;
    const bounds = menuRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setMenuPosition((position) => ({
      left: Math.max(8, Math.min(position.left, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, Math.min(position.top, window.innerHeight - bounds.height - 8)),
    }));
    menuRef.current.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
  }, [layerMenu, featureMenu]);

  const menuKeyDown = (event) => {
    const items = Array.from(menuRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)'));
    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
      setLayerMenu(null);
      setFeatureMenu(null);
      menuButtonRef.current?.focus();
    }
  };

  useEffect(() => {
    if (layerMenu === null && featureMenu === null) return undefined;
    const closeOutside = (event) => {
      if (!event.target.closest('[data-layer-menu-root], [data-feature-order-root]')) {
        setLayerMenu(null);
        setFeatureMenu(null);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      setLayerMenu(null);
      setFeatureMenu(null);
      menuButtonRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [layerMenu, featureMenu]);

  const persist = async (callback, args, message) => {
    if (!canEdit || !callback) return;
    setLayerMenu(null);
    setFeatureMenu(null);
    try {
      const result = await callback(...args);
      setAnnouncement(
        result === false ? text('操作未保存，请重试。', 'Changes were not saved. Try again.') : message,
      );
    } catch (error) {
      setAnnouncement(error.message || text('操作未保存，请重试。', 'Changes were not saved. Try again.'));
    }
  };

  const startDrag = (event, item) => {
    if (!canEdit || event.target.closest('input, select, textarea, .style-popover-anchor')) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    dragRef.current = item;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
    event.dataTransfer.setData('text/plain', item.name || String(item.id));
    setAnnouncement(text(`正在移动 ${item.name}`, `Moving ${item.name}`));
  };

  const readDrag = (event) => {
    if (dragRef.current) return dragRef.current;
    try {
      return JSON.parse(event.dataTransfer.getData(DRAG_TYPE));
    } catch {
      return null;
    }
  };

  const finishDrag = () => {
    dragRef.current = null;
    setDragOver(null);
  };

  const acceptDrag = (event, target) => {
    if (!canEdit || (!dragRef.current && !Array.from(event.dataTransfer.types || []).includes(DRAG_TYPE)))
      return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDragOver(target);
  };

  const dropOnLayer = (event, layer, index) => {
    event.preventDefault();
    event.stopPropagation();
    const item = readDrag(event);
    finishDrag();
    if (!canEdit || !item) return;
    if (item.kind === 'layer') {
      const after =
        event.clientY >
        event.currentTarget.getBoundingClientRect().top +
          event.currentTarget.getBoundingClientRect().height / 2;
      const ids = layers.map((entry) => entry.id);
      const next = reorder(ids, item.id, index + (after ? 1 : 0));
      if (next.some((id, position) => !sameId(id, ids[position]))) {
        persist(onReorderLayers, [next], text('图层顺序已更新', 'Layer order updated'));
      }
    } else if (item.kind === 'feature') {
      dropFeature(item, layer, layer.features.length);
    }
  };

  const dropFeature = (item, layer, insertionIndex) => {
    const sourceLayer = layers.find((entry) => sameId(entry.id, item.layerId));
    if (layer.kind === 'directions' || sourceLayer?.kind === 'directions') {
      setAnnouncement(
        text(
          '路线使用独立图层，不能移动普通要素进出路线图层。',
          'Directions use their own layer. Ordinary features cannot be moved into or out of it.',
        ),
      );
      return;
    }
    if (sameId(item.layerId, layer.id)) {
      const ids = layer.features.map((feature) => feature.id);
      const next = reorder(ids, item.id, insertionIndex);
      if (next.some((id, position) => !sameId(id, ids[position]))) {
        persist(onReorderFeatures, [layer.id, next], text('要素顺序已更新', 'Feature order updated'));
      }
    } else {
      persist(
        onMoveFeature,
        [item.id, layer.id, insertionIndex],
        text(`要素已移到 ${layer.name}`, `Feature moved to ${layer.name}`),
      );
    }
  };

  const moveLayer = (layer, amount) => {
    const index = layers.findIndex((item) => sameId(item.id, layer.id));
    const ids = layers.map((item) => item.id);
    const target = index + amount;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    persist(onReorderLayers, [ids], text('图层顺序已更新', 'Layer order updated'));
  };

  const moveFeature = (feature, layer, amount) => {
    const ids = layer.features.map((item) => item.id);
    const index = ids.findIndex((id) => sameId(id, feature.id));
    const target = index + amount;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    persist(onReorderFeatures, [layer.id, ids], text('要素顺序已更新', 'Feature order updated'));
  };

  return (
    <div
      className="layer-list enhanced-layer-list"
      data-testid="layer-list"
      hidden={hidden}
      role="tabpanel"
      aria-label={text('地图图层', 'Map layers')}
    >
      <span className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </span>
      {layers.map((layer, layerIndex) => {
        const directionsLayer = layer.kind === 'directions';
        const routeFeature = directionsLayer
          ? layer.features.find((feature) => feature.style?.routeData) || layer.features[0]
          : null;
        const expanded = directionsLayer
          ? expandedLayers[layer.id] !== false
          : Boolean(expandedLayers[layer.id]);
        const directionEditor = directionsLayer && expanded ? renderDirections?.(layer) : null;
        const openDirections = (event) => {
          event?.stopPropagation();
          if (!routeFeature) return;
          onSelectLayer?.(layer.id);
          if (onEditDirections) onEditDirections(layer, routeFeature);
          else onSelectFeature?.(routeFeature, layer);
        };
        return (
          <section
            key={layer.id}
            className={`layer-section${directionsLayer ? ' layer-kind-directions' : ''}${sameId(selectedLayerId, layer.id) ? ' selected' : ''}${!layer.visible ? ' is-hidden' : ''}${dragOver === `layer-${layer.id}` ? ' drag-over' : ''}`}
            data-layer-id={layer.id}
            data-layer-kind={directionsLayer ? 'directions' : 'features'}
            onClick={() => onSelectLayer?.(layer.id)}
            onDragOver={(event) => {
              if (directionsLayer && dragRef.current?.kind === 'feature') {
                event.dataTransfer.dropEffect = 'none';
                setDragOver(null);
                return;
              }
              acceptDrag(event, `layer-${layer.id}`);
            }}
            onDrop={(event) => dropOnLayer(event, layer, layerIndex)}
          >
            <header className="layer-header enhanced-layer-header">
              <button
                type="button"
                className="layer-drag-handle"
                draggable={canEdit && Boolean(onReorderLayers)}
                disabled={!canEdit || !onReorderLayers}
                onDragStart={(event) => startDrag(event, { kind: 'layer', id: layer.id, name: layer.name })}
                onDragEnd={finishDrag}
                onKeyDown={(event) => {
                  if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
                    event.preventDefault();
                    moveLayer(layer, event.key === 'ArrowUp' ? -1 : 1);
                  }
                }}
                aria-label={text(
                  `拖动排序 ${layer.name}，或按 Alt 加上下方向键`,
                  `Reorder ${layer.name}: drag or press Alt with an arrow key`,
                )}
                title={text('拖动排序，Alt + ↑/↓', 'Drag to reorder, Alt + ↑/↓')}
              >
                <GripVertical size={14} />
              </button>
              <button
                type="button"
                className="icon-button layer-expand"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleExpanded?.(layer.id);
                }}
                aria-expanded={expanded}
                aria-controls={`layer-body-${layer.id}`}
                aria-label={
                  expanded
                    ? text(`收起 ${layer.name}`, `Collapse ${layer.name}`)
                    : text(`展开 ${layer.name}`, `Expand ${layer.name}`)
                }
              >
                {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>
              <input
                type="checkbox"
                checked={Boolean(layer.visible)}
                disabled={!canEdit || !onToggleLayer}
                onClick={(event) => event.stopPropagation()}
                onChange={() => onToggleLayer?.(layer)}
                aria-label={translate('editor.showLayer', text(`显示 ${layer.name}`, `Show ${layer.name}`), {
                  name: layer.name,
                })}
              />
              <button
                type="button"
                className="layer-name"
                onClick={() => onSelectLayer?.(layer.id)}
                onDoubleClick={() => canEdit && onRenameLayer?.(layer)}
              >
                {directionsLayer ? (
                  <>
                    <Route size={15} className="directions-layer-icon" />
                    <span className="directions-layer-name">{layer.name}</span>
                  </>
                ) : (
                  layer.name
                )}
              </button>
              <div className="layer-menu-anchor" data-layer-menu-root>
                <button
                  type="button"
                  className="icon-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    anchorMenu(event.currentTarget, 256);
                    setFeatureMenu(null);
                    setLayerMenu((current) => (sameId(current, layer.id) ? null : layer.id));
                  }}
                  aria-label={text(`${layer.name} 的选项`, `Options for ${layer.name}`)}
                  aria-expanded={sameId(layerMenu, layer.id)}
                  aria-haspopup="menu"
                >
                  <MoreVertical size={18} />
                </button>
                {sameId(layerMenu, layer.id)
                  ? createPortal(
                      <div
                        ref={menuRef}
                        className="popup-menu layer-popup-menu layer-panel-menu reference-layer-menu"
                        style={menuPosition}
                        data-layer-menu-root
                        role="menu"
                        aria-label={text('图层操作', 'Layer actions')}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={menuKeyDown}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          disabled={!canEdit}
                          onClick={() => {
                            setLayerMenu(null);
                            onRenameLayer?.(layer);
                          }}
                        >
                          {text('图层重命名', 'Rename this layer')}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={!canEdit}
                          onClick={() => {
                            setLayerMenu(null);
                            onDeleteLayer?.(layer);
                          }}
                        >
                          {translate('editor.deleteLayer', text('删除图层', 'Delete layer'))}
                        </button>
                        <div className="reference-layer-menu-separator" role="separator" />
                        {directionsLayer ? (
                          <button
                            type="button"
                            role="menuitem"
                            disabled={!routeFeature || (!onEditDirections && !onSelectFeature)}
                            onClick={(event) => {
                              setLayerMenu(null);
                              openDirections(event);
                            }}
                          >
                            {canEdit
                              ? text('编辑路线', 'Edit directions')
                              : text('查看路线', 'View directions')}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setLayerMenu(null);
                                onTable?.(layer);
                              }}
                            >
                              {translate('editor.openTable', text('打开数据表', 'Open data table'))}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              disabled={!canEdit}
                              onClick={() => {
                                setLayerMenu(null);
                                onImport?.(layer);
                              }}
                            >
                              {translate('editor.import', text('导入', 'Import'))}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setLayerMenu(null);
                                onExport?.(layer);
                              }}
                            >
                              {translate('editor.exportCsv', 'Export CSV')}
                            </button>
                          </>
                        )}
                        <div className="reference-layer-menu-separator" role="separator" />
                        <button
                          type="button"
                          role="menuitem"
                          disabled={!canEdit || layerIndex === 0 || !onReorderLayers}
                          onClick={() => moveLayer(layer, -1)}
                        >
                          {text('上移图层', 'Move layer up')}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={!canEdit || layerIndex === layers.length - 1 || !onReorderLayers}
                          onClick={() => moveLayer(layer, 1)}
                        >
                          {text('下移图层', 'Move layer down')}
                        </button>
                      </div>,
                      document.body,
                    )
                  : null}
              </div>
            </header>
            {expanded && directionsLayer ? (
              <div
                className={directionEditor ? 'directions-layer-editor' : 'directions-layer-body'}
                id={`layer-body-${layer.id}`}
              >
                {directionEditor || (
                  <DirectionsLayerSummary
                    layer={layer}
                    feature={routeFeature}
                    canEdit={canEdit}
                    lang={lang}
                    onSelectStop={routeFeature && onSelectFeature ? (stop) => onSelectFeature(routeFeature, layer, false, true, stop.position ? { lng: stop.position[0], lat: stop.position[1] } : null) : undefined}
                    onOpen={
                      routeFeature && (onEditDirections || onSelectFeature) ? openDirections : undefined
                    }
                  />
                )}
              </div>
            ) : expanded ? (
              <div className="layer-body" id={`layer-body-${layer.id}`}>
                <button
                  type="button"
                  className="layer-style-row"
                  disabled={!canEdit}
                  onClick={(event) => {
                    event.stopPropagation();
                    onLayerStyle?.(layer);
                  }}
                >
                  <PaintRoller size={17} />
                  {text('图层样式', 'Layer style')}
                </button>
                {layer.features.map((feature, featureIndex) => {
                  const remoteEditor = peers.find(
                    (peer) => peer.userId !== user?.id && sameId(peer.selectedFeatureId, feature.id),
                  );
                  const active = sameId(selectedFeatureId, feature.id);
                  const markerIcon = feature.style?.icon || layer.style?.icon;
                  let featureStyleAnchorRef = featureStyleButtonsRef.current.get(feature.id);
                  if (!featureStyleAnchorRef) {
                    featureStyleAnchorRef = { current: null };
                    featureStyleButtonsRef.current.set(feature.id, featureStyleAnchorRef);
                  }
                  const featureStyle = renderFeatureStyle?.(feature, layer, featureStyleAnchorRef);
                  return (
                    <div
                      key={feature.id}
                      className={`feature-row enhanced-feature-row${active ? ' active' : ''}${remoteEditor ? ' remote-editing' : ''}${dragOver === `feature-${feature.id}` ? ' drag-over' : ''}`}
                      data-feature-id={feature.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectFeature?.(feature, layer);
                      }}
                      draggable={canEdit && Boolean(onReorderFeatures || onMoveFeature)}
                      onDragStart={(event) =>
                        startDrag(event, {
                          kind: 'feature',
                          id: feature.id,
                          layerId: layer.id,
                          name: feature.name,
                        })
                      }
                      onDragEnd={finishDrag}
                      onDragOver={(event) => {
                        if (dragRef.current?.kind === 'layer') return;
                        acceptDrag(event, `feature-${feature.id}`);
                      }}
                      onDrop={(event) => {
                        const item = readDrag(event);
                        if (item?.kind !== 'feature') return;
                        event.preventDefault();
                        event.stopPropagation();
                        const bounds = event.currentTarget.getBoundingClientRect();
                        finishDrag();
                        if (canEdit)
                          dropFeature(
                            item,
                            layer,
                            featureIndex + (event.clientY > bounds.top + bounds.height / 2 ? 1 : 0),
                          );
                      }}
                      title={
                        remoteEditor
                          ? text(
                              `${remoteEditor.name} 正在查看此要素`,
                              `${remoteEditor.name} is viewing this feature`,
                            )
                          : undefined
                      }
                    >
                      <span className="feature-grip" aria-hidden="true">
                        <GripVertical size={14} />
                      </span>
                      <span
                        className={`feature-symbol ${feature.type.toLowerCase()}`}
                        style={{ '--feature-color': feature.style?.color || layer.style?.color || '#1a73e8' }}
                      >
                        {feature.type === 'Point' ? (
                          markerIcon && !['pin', 'place'].includes(markerIcon) ? (
                            <MarkerIcon icon={markerIcon} size={18} />
                          ) : (
                            <DefaultPinSymbol />
                          )
                        ) : feature.type === 'Polygon' ? (
                          <PolygonFeatureSymbol />
                        ) : (
                          <LineFeatureSymbol />
                        )}
                      </span>
                      <button
                        type="button"
                        className="feature-name"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectFeature?.(feature, layer);
                        }}
                        onDoubleClick={() => canEdit && onEditFeature?.(feature, layer)}
                        aria-pressed={active}
                      >
                        {feature.name}
                      </button>
                      <button
                        ref={featureStyleAnchorRef}
                        type="button"
                        className="mini-style-button"
                        disabled={!canEdit}
                        onClick={(event) => {
                          event.stopPropagation();
                          onFeatureStyle?.(feature, layer);
                        }}
                        aria-label={text(`设置 ${feature.name} 样式`, `Style ${feature.name}`)}
                      >
                        <Palette size={14} />
                      </button>
                      <div className="feature-order-anchor" data-feature-order-root>
                        <button
                          type="button"
                          className="feature-order-button"
                          disabled={!canEdit}
                          onClick={(event) => {
                            event.stopPropagation();
                            anchorMenu(event.currentTarget);
                            setLayerMenu(null);
                            setFeatureMenu((current) => (sameId(current, feature.id) ? null : feature.id));
                          }}
                          aria-label={text(`移动 ${feature.name}`, `Move ${feature.name}`)}
                          aria-expanded={sameId(featureMenu, feature.id)}
                          aria-haspopup="menu"
                        >
                          <MoreVertical size={14} />
                        </button>
                        {sameId(featureMenu, feature.id)
                          ? createPortal(
                              <div
                                ref={menuRef}
                                className="popup-menu feature-order-menu layer-panel-menu"
                                style={menuPosition}
                                data-feature-order-root
                                role="menu"
                                aria-label={text('要素移动操作', 'Move feature actions')}
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={menuKeyDown}
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={featureIndex === 0 || !onReorderFeatures}
                                  onClick={() => moveFeature(feature, layer, -1)}
                                >
                                  <ArrowUp size={15} />
                                  {text('上移要素', 'Move feature up')}
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={featureIndex === layer.features.length - 1 || !onReorderFeatures}
                                  onClick={() => moveFeature(feature, layer, 1)}
                                >
                                  <ArrowDown size={15} />
                                  {text('下移要素', 'Move feature down')}
                                </button>
                                {layers
                                  .filter((item) => item.kind !== 'directions' && !sameId(item.id, layer.id))
                                  .map((target) => (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      key={target.id}
                                      disabled={!onMoveFeature}
                                      onClick={() =>
                                        persist(
                                          onMoveFeature,
                                          [feature.id, target.id, target.features.length],
                                          text(
                                            `要素已移到 ${target.name}`,
                                            `Feature moved to ${target.name}`,
                                          ),
                                        )
                                      }
                                    >
                                      <Route size={15} />
                                      <span>
                                        {text('移至', 'Move to')} {target.name}
                                      </span>
                                    </button>
                                  ))}
                              </div>,
                              document.body,
                            )
                          : null}
                      </div>
                      {featureStyle}
                    </div>
                  );
                })}
                {!layer.features.length ? (
                  <div className="empty-layer-tip">
                    <p>
                      {translate(
                        'editor.emptyLayerTip',
                        text(
                          '在地图上添加地点，或把其他图层的要素拖到这里。',
                          'Add a place, or drop a feature here.',
                        ),
                      )}
                    </p>
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={(event) => {
                        event.stopPropagation();
                        onImport?.(layer);
                      }}
                    >
                      <Upload size={14} />
                      {translate('editor.import', text('导入', 'Import'))}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
