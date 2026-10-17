import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Check, LoaderCircle, Camera, ChevronDown, ChevronRight, CircleHelp, Database, Download, Eye,
  GripVertical, Hand, Layers, Link2, List, LocateFixed, MapPin, Menu, MoreVertical,
  MousePointer2, PaintBucket, Palette, Pencil, Plus, Redo2, Route, Ruler, Search, Share2,
  Shapes, Table2, Trash2, Undo2, Upload, Video, X, ZoomIn, ZoomOut, Maximize, Minimize, Car, Bike, Footprints, Waypoints,
} from 'lucide-react';
import { api } from '../api.js';
import { navigate } from '../App.jsx';
import { useAuth } from '../auth.jsx';
import { LanguageSwitch, useI18n } from '../i18n/index.jsx';
import { applyMapOp, connectMapRoom } from '../realtime.js';
import { AMAP_CONFIGURED } from '../amap.js';
import AmapMap, { AMAP_MAX_ZOOM, AMAP_MIN_ZOOM } from './AmapMap.jsx';
import FeatureMediaGallery, {
  formatFileSize, MAX_ATTACHMENTS_PER_FEATURE, MAX_FILES_PER_UPLOAD, MEDIA_ACCEPT, validateMediaSelection,
} from './FeatureMediaGallery.jsx';
import {
  AMAP_PROVIDER, exportCsv, exportGeoJson, exportKml,
  formatDate, normalizeBaseMapKey, parseImportFile,
} from '../utils.js';
import './editor.css';
import DirectionsPanel from './editor/DirectionsPanel.jsx';
import { geometryCoordinates } from './map-engine-utils.js';
import SearchResultsPanel from './editor/SearchResultsPanel.jsx';
import SearchPlaceCard from './editor/SearchPlaceCard.jsx';
import BaseMapPicker from './editor/BaseMapPicker.jsx';
import LayerPanel from './editor/LayerPanel.jsx';
import LayerStyleDialog from './editor/LayerStyleDialog.jsx';
import MobileSheet from './editor/MobileSheet.jsx';
import MeasurePanel from './editor/MeasurePanel.jsx';
import FeatureCard, { COLORS } from './editor/FeatureCard.jsx';
import MarkerStyleDialog from './editor/MarkerStyleDialog.jsx';
import MarkerStylePopover from './editor/MarkerStylePopover.jsx';
import MarkerIcon from './editor/MarkerIcon.jsx';
import { getMarkerIcon } from './marker-icons.js';
import ShapeToolMenu from './editor/ShapeToolMenu.jsx';
import GeometryStyleFields, { geometryStyleValues } from './editor/GeometryStyleFields.jsx';
import { SHAPE_TOOLS, rectangleGeometry, circleGeometry, polygonGeometry } from './editor/shape-drawing.js';
import ContextMenu from './editor/ContextMenu.jsx';
import useDirections from './editor/useDirections.js';
import usePlaceSearch from './editor/usePlaceSearch.js';
import useEditorHistory from './editor/useEditorHistory.js';
import { measurementDistance, measurementArea } from './editor/measurement.js';
import './editor/editor-enhancements.css';
import './editor/my-maps-editor.css';
import './editor/reference-sidebar.css';
import './editor/reference-data-table.css';
import { createTableAutosave } from './editor/table-autosave.js';
import { tableFieldValue, tableCustomFieldId } from '../table-data.js';

function attachmentsForFeature(mapData, featureId) {
  return mapData.layers.flatMap((layer) => layer.features).find((feature) => feature.id === featureId)?.attachments || [];
}

function compactDraftPoints(points) {
  return points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return Math.abs(point[0] - previous[0]) > 1e-9 || Math.abs(point[1] - previous[1]) > 1e-9;
  });
}

function Modal({ title, children, onClose, size = 'normal', className = '', backdropClassName = '', onKeyDown, style, closeDisabled = false }) {
  const { t } = useI18n();
  return (
    <div className={`modal-backdrop ${backdropClassName}`} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal-dialog ${size} ${className}`} role="dialog" aria-modal="true" aria-label={title} onKeyDown={onKeyDown} style={style}>
        <header><h2>{title}</h2><button className="icon-button" disabled={closeDisabled} onClick={onClose} aria-label={t('common.close')}><X size={20} /></button></header>
        {children}
      </section>
    </div>
  );
}

function FeatureDialog({ feature, layers, defaultLayerId, onSave, onDelete, onUploadAttachments, onDeleteAttachment, onClose }) {
  const { lang } = useI18n();
  const [icon, setIcon] = useState(feature?.style?.icon);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [name, setName] = useState(feature?.name || '新地点');
  const [description, setDescription] = useState(feature?.description || '');
  const [layerId, setLayerId] = useState(feature?.layerId || defaultLayerId);
  const displayIcon = getMarkerIcon(icon || layers.find((layer) => layer.id === Number(layerId))?.style?.icon).id;
  const geometryType = feature?.geometry?.type || feature?.type || 'Point';
  const [geometryStyleChanges, setGeometryStyleChanges] = useState({});
  const geometryStyle = geometryStyleValues(geometryType, { ...feature?.style, ...geometryStyleChanges }, layers.find((layer) => layer.id === Number(layerId))?.style);
  const [color, setColor] = useState(feature?.style?.color || '#1a73e8');
  const [attachments, setAttachments] = useState(feature?.attachments || []);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [deletingAttachmentId, setDeletingAttachmentId] = useState(null);
  const mediaInputRef = useRef(null);

  const handleMediaSelection = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selectedFiles.length) return;
    try {
      setMediaError('');
      const files = validateMediaSelection(selectedFiles, attachments.length + pendingFiles.length);
      if (!feature?.id) {
        if (pendingFiles.length + files.length > MAX_FILES_PER_UPLOAD) throw new Error(`新地点保存前最多选择 ${MAX_FILES_PER_UPLOAD} 个文件`);
        setPendingFiles((current) => [...current, ...files]);
        return;
      }
      setMediaBusy(true);
      setAttachments(await onUploadAttachments(feature.id, files));
    } catch (uploadError) {
      setMediaError(uploadError.message);
    } finally {
      setMediaBusy(false);
    }
  };

  const removeAttachment = async (attachment) => {
    if (!window.confirm(`删除附件“${attachment.original_name}”？`)) return;
    try {
      setMediaError('');
      setDeletingAttachmentId(attachment.id);
      setAttachments(await onDeleteAttachment(attachment.id, feature.id));
    } catch (deleteError) {
      setMediaError(deleteError.message);
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  return (
    <Modal title={feature?.id ? '编辑要素' : '添加到地图'} onClose={onClose}>
      <form className="dialog-form" onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...feature, name: name.trim() || '无标题要素', description, layerId: Number(layerId), style: { ...(feature?.style || {}), ...(geometryType === 'Point' ? { color, fillColor: color, ...(icon ? { icon } : {}) } : geometryStyleChanges) }, pendingFiles });
      }}>
        <label>名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>说明<textarea rows="3" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label>保存到图层<select value={layerId} onChange={(event) => setLayerId(event.target.value)}>{layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>
        {geometryType !== 'Point' ? <GeometryStyleFields type={geometryType} value={geometryStyle} onChange={(patch) => setGeometryStyleChanges((current) => ({ ...current, ...patch }))} lang={lang} /> : <fieldset className="color-field"><legend>颜色</legend><div className="color-row">{COLORS.map((item) => <button key={item} type="button" className={color === item ? 'color-chip active' : 'color-chip'} style={{ '--color': item }} onClick={() => setColor(item)} aria-label={`颜色 ${item}`} />)}</div></fieldset>}
        {feature?.geometry?.type === 'Point' ? <button type="button" className="marker-picker-trigger" onClick={() => setIconPickerOpen(true)}><MarkerIcon icon={displayIcon} />{getMarkerIcon(displayIcon).labelZh} · 选择图标</button> : null}
        {iconPickerOpen ? <MarkerStyleDialog name={name} icon={displayIcon} inheritIcon={!icon} color={color} lang={lang} onSave={(style) => { if (style.icon) setIcon(style.icon); setColor(style.color); }} onClose={() => setIconPickerOpen(false)} /> : null}
        <section className="feature-media-manager" aria-label="图片与视频附件">
          <header>
            <div><b>图片与视频</b><span>{attachments.length + pendingFiles.length}/{MAX_ATTACHMENTS_PER_FEATURE}</span></div>
            <button type="button" className="secondary-button media-upload-button" onClick={() => mediaInputRef.current?.click()} disabled={mediaBusy || attachments.length + pendingFiles.length >= MAX_ATTACHMENTS_PER_FEATURE}><Upload size={15} /> {mediaBusy ? '正在上传…' : '添加资料'}</button>
          </header>
          <p>支持 JPG、PNG、WebP、GIF、AVIF、MP4、WebM、MOV；图片不超过 15 MB，视频不超过 100 MB。</p>
          <input ref={mediaInputRef} type="file" className="visually-hidden" accept={MEDIA_ACCEPT} multiple onChange={handleMediaSelection} />
          <FeatureMediaGallery attachments={attachments} featureName={name} editable deletingId={deletingAttachmentId} onDelete={removeAttachment} />
          {pendingFiles.length ? <div className="pending-media-list">{pendingFiles.map((file, index) => <div key={`${file.name}-${file.size}-${file.lastModified}-${index}`}><span title={file.name}>{file.name}</span><small>{formatFileSize(file.size)} · 保存地点后自动上传</small><button type="button" onClick={() => setPendingFiles((files) => files.filter((item) => item !== file))} aria-label={`移除待上传文件 ${file.name}`}><X size={14} /></button></div>)}</div> : null}
          {!attachments.length && !pendingFiles.length ? <div className="feature-media-empty"><Upload size={20} /><span>添加现场照片、短视频或其他视觉资料</span></div> : null}
          {mediaError ? <p className="feature-media-error" role="alert">{mediaError}</p> : null}
        </section>
        <footer className="dialog-actions">
          {feature?.id ? <button type="button" className="text-button danger" onClick={() => onDelete(feature)}>删除</button> : <span />}
          <div><button type="button" className="text-button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={mediaBusy}>保存</button></div>
        </footer>
      </form>
    </Modal>
  );
}

function LayerNameDialog({ layer, onSave, onClose }) {
  const { lang } = useI18n();
  const text = (zh, en) => lang === 'en' ? en : zh;
  const [name, setName] = useState(layer?.name || text('无标题图层', 'Untitled layer'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pendingRef = useRef(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  const close = () => { if (!pendingRef.current) onClose(); };
  const submit = async (event) => {
    event.preventDefault();
    if (pendingRef.current || !name.trim()) return;
    pendingRef.current = true; setBusy(true); setError('');
    try { await onSave(name.trim()); }
    catch (requestError) { setError(requestError.message); }
    finally { pendingRef.current = false; setBusy(false); }
  };
  return <Modal title={layer ? text('重命名图层', 'Rename layer') : text('添加图层', 'Add layer')} onClose={close} closeDisabled={busy} style={{ width: 'min(360px, 100%)' }} onKeyDown={(event) => {
    event.stopPropagation();
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); close(); }
  }}>
    <form className="dialog-form" onSubmit={submit}>
      <label>{text('图层名称', 'Layer name')}<input ref={inputRef} value={name} onChange={(event) => setName(event.target.value)} maxLength={180} required disabled={busy} /></label>
      {error ? <p className="feature-media-error" role="alert">{error}</p> : null}
      <footer className="dialog-actions"><span /><div>
        <button type="button" className="text-button" disabled={busy} onClick={close}>{text('取消', 'Cancel')}</button>
        <button type="submit" className="primary-button" disabled={busy || !name.trim()}>{busy ? text('保存中…', 'Saving…') : text('保存', 'Save')}</button>
      </div></footer>
    </form>
  </Modal>;
}

function ShareDialog({ map, share, onGenerate, onClose }) {
  const { t } = useI18n();
  const link = share ? `${window.location.origin}/view/${share.token}` : '';
  return (
    <Modal title={t('editor.shareMap')} onClose={onClose}>
      <div className="share-dialog-body">
        <div className="share-map-row"><span className="share-map-icon"><Layers size={22} /></span><div><b>{map.name}</b><p>{map.visibility === 'private' ? t('editor.limitedMap') : t('editor.linkAnyone')}</p></div></div>
        <div className="share-access-row"><div><b>{t('editor.regularAccess')}</b><p>{t('editor.shareReadonly')}</p></div><button className="secondary-button" onClick={onGenerate}>{share ? t('editor.reuseShareLink') : t('editor.createShareLink')}</button></div>
        {link ? <div className="copy-link-row"><input readOnly value={link} aria-label={t('editor.shareLink')} /><button className="primary-button" onClick={() => navigator.clipboard.writeText(link)}>{t('editor.copyLink')}</button></div> : null}
      </div>
    </Modal>
  );
}

function DataTableDialog({ layer, canEdit, busy, onSave, onAddColumn, onDelete, onClose }) {
  const { lang } = useI18n();
  const text = (zh, en) => lang === 'en' ? en : zh;
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState({ featureId: layer.features[0]?.id, column: 'name' });
  const [focusedFeatureId, setFocusedFeatureId] = useState(null);
  const [saveState, setSaveState] = useState({ fields: [], dirty: false, pending: false, error: '' });
  const [addingColumn, setAddingColumn] = useState(false);
  const [columnName, setColumnName] = useState('');
  const [columnError, setColumnError] = useState('');
  const [columnBusy, setColumnBusy] = useState(false);
  const firstCellRef = useRef(null);
  const searchRef = useRef(null);
  const columnNameRef = useRef(null);
  const autosaveRef = useRef(null);
  const closingRef = useRef(false);
  const composingRef = useRef(false);
  const latestRef = useRef({ layer, onSave });
  latestRef.current = { layer, onSave };
  useEffect(() => {
    let active = true;
    const autosave = createTableAutosave({
      save: (patch) => latestRef.current.onSave(patch),
      onChange: (next) => { if (active) setSaveState(next); },
    });
    autosaveRef.current = autosave;
    autosave.sync(latestRef.current.layer.features);
    (firstCellRef.current || searchRef.current)?.focus();
    return () => { active = false; autosave.dispose(); };
  }, []);
  useEffect(() => { autosaveRef.current?.sync(layer.features); }, [layer.features]);
  useEffect(() => { if (addingColumn) columnNameRef.current?.focus(); }, [addingColumn]);
  const customColumns = layer.columns || [];
  const columns = [
    { field: 'name', label: text('名称', 'Name') },
    { field: 'description', label: text('说明', 'Description') },
    ...customColumns.map((column) => ({ field: `data:${column.id}`, label: column.name })),
  ];
  const drafts = new Map(saveState.fields.map((item) => [`${item.featureId}:${item.field}`, item]));
  const read = (feature, field) => drafts.get(`${feature.id}:${field}`)?.value ?? tableFieldValue(feature, field);
  const needle = query.trim().toLocaleLowerCase();
  const rows = layer.features.filter((feature) => feature.id === focusedFeatureId || !needle || columns.map(({ field }) => read(feature, field)).join(' ').toLocaleLowerCase().includes(needle));
  const activeCell = rows.some((feature) => feature.id === selection.featureId) ? selection : { featureId: rows[0]?.id, column: 'name' };
  const selectedFeature = rows.find((feature) => feature.id === activeCell.featureId);
  const featureDetails = selectedFeature ? [
    selectedFeature.type === 'Point' ? text('地点', 'Point') : selectedFeature.type === 'Polygon' ? text('区域', 'Polygon') : text('线条', 'Line'),
    selectedFeature.type === 'Point'
      ? selectedFeature.geometry.coordinates.map((value) => Number(value).toFixed(4)).join(', ')
      : text(`${selectedFeature.geometry.coordinates.flat(2).length / 2} 个节点`, `${selectedFeature.geometry.coordinates.flat(2).length / 2} vertices`),
  ].join(' · ') : '';
  const changeCell = (feature, field, value, defer = false) => {
    if (canEdit) autosaveRef.current?.change(feature.id, field, value, tableFieldValue(feature, field), { defer });
  };
  const requestClose = async () => {
    if (closingRef.current || columnBusy) return;
    closingRef.current = true;
    try { if (await autosaveRef.current.flush()) onClose(); }
    finally { closingRef.current = false; }
  };
  const exportTable = async () => {
    const autosave = autosaveRef.current;
    if (!await autosave.flush()) return;
    const current = latestRef.current.layer;
    exportCsv({ ...current, features: current.features.map((feature) => ({ ...feature,
      name: autosave.read(feature.id, 'name', feature.name),
      description: autosave.read(feature.id, 'description', feature.description),
      properties: Object.fromEntries((current.columns || []).map((column) => [column.id, autosave.read(feature.id, `data:${column.id}`, tableFieldValue(feature, `data:${column.id}`))])),
    })) });
  };
  const beginAddColumn = async () => {
    if (!await autosaveRef.current.flush()) return;
    setColumnError(''); setColumnName(''); setAddingColumn(true);
  };
  const addColumn = async (event) => {
    event.preventDefault();
    if (columnBusy || !columnName.trim()) return;
    setColumnBusy(true); setColumnError('');
    try { await onAddColumn(columnName.trim()); setAddingColumn(false); }
    catch (error) { setColumnError(error.message); }
    finally { setColumnBusy(false); }
  };
  const saveLabel = saveState.error ? saveState.error
    : saveState.pending ? text('正在保存…', 'Saving…')
      : saveState.dirty ? text('等待保存…', 'Waiting to save…')
        : saveState.fields.length ? text('已自动保存', 'Saved automatically') : text('修改后自动保存', 'Changes save automatically');
  return (
    <Modal title={layer.name} onClose={requestClose} closeDisabled={columnBusy} className={`reference-data-table-dialog${customColumns.length ? ' has-custom-columns' : ''}`} style={{ '--table-dialog-width': `${Math.min(900, 520 + customColumns.length * 160)}px` }} backdropClassName="reference-data-table-backdrop" onKeyDown={(event) => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
        event.preventDefault(); event.stopPropagation();
        if (addingColumn) { if (!columnBusy) setAddingColumn(false); }
        else requestClose();
      }
    }}>
      <div className="reference-table-toolbar">
        <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text('在表格中查找', 'Find in table')} aria-label={text('在表格中查找', 'Find in table')} />
        {canEdit ? <button type="button" className="reference-table-add-column" disabled={columnBusy || addingColumn || customColumns.length >= 50} onClick={beginAddColumn}><Plus size={14} />{text('添加列', 'Add column')}</button> : null}
        <span role="status" title={text(`图层共 ${layer.features.length} 个要素`, `${layer.features.length} features in this layer`)}>{rows.length ? `1–${rows.length}` : '0'} / {rows.length}</span>
      </div>
      {addingColumn ? <form className="reference-table-column-form" onSubmit={addColumn}>
        <input ref={columnNameRef} aria-label={text('列名', 'Column name')} placeholder={text('列名，例如：负责人', 'Column name, e.g. Owner')} maxLength={80} required value={columnName} disabled={columnBusy} onChange={(event) => setColumnName(event.target.value)} />
        <button type="submit" disabled={columnBusy || !columnName.trim()}>{columnBusy ? text('添加中…', 'Adding…') : text('添加', 'Add')}</button>
        <button type="button" disabled={columnBusy} onClick={() => setAddingColumn(false)}>{text('取消', 'Cancel')}</button>
        {columnError ? <p role="alert">{columnError}</p> : null}
      </form> : null}
      <div className="data-table-wrap">
        <table className="data-table" style={customColumns.length ? { minWidth: `${472 + customColumns.length * 160}px` } : undefined} aria-label={text(`${layer.name} 数据表`, `${layer.name} data table`)}>
          <colgroup><col className="reference-table-index" /><col className="reference-table-name" /><col className="reference-table-description" />{customColumns.map((column) => <col key={column.id} className="reference-table-custom" />)}</colgroup>
          <thead><tr><th scope="col"><span className="visually-hidden">{text('行号', 'Row')}</span></th>{columns.map((column) => <th key={column.field} scope="col" title={column.label}>{column.label}</th>)}</tr></thead>
          <tbody>{rows.map((feature, index) => <tr key={feature.id} className={activeCell.featureId === feature.id ? 'is-selected' : ''}>
            <th scope="row">{index + 1}</th>
            {columns.map(({ field: column, label }) => {
              const Cell = column === 'name' ? 'input' : 'textarea';
              const field = drafts.get(`${feature.id}:${column}`);
              return <td key={column}>
                <Cell ref={index === 0 && column === 'name' ? firstCellRef : undefined}
                  className={`reference-table-cell${activeCell.featureId === feature.id && activeCell.column === column ? ' is-active' : ''}${field?.error ? ' has-error' : ''}`}
                  value={read(feature, column)} readOnly={!canEdit || columnBusy} rows={column !== 'name' ? 1 : undefined}
                  aria-label={`${feature.name} · ${label}`}
                  aria-invalid={Boolean(field?.error)} title={read(feature, column)}
                  onFocus={() => { setSelection({ featureId: feature.id, column }); setFocusedFeatureId(feature.id); }}
                  onChange={(event) => changeCell(feature, column, event.target.value, composingRef.current || event.nativeEvent.isComposing)}
                  onCompositionStart={() => { composingRef.current = true; }}
                  onCompositionEnd={(event) => { composingRef.current = false; changeCell(feature, column, event.currentTarget.value); }}
                  onBlur={(event) => {
                    const autosave = autosaveRef.current;
                    const wasComposing = composingRef.current;
                    composingRef.current = false;
                    if (wasComposing || event.currentTarget.value !== autosave.read(feature.id, column, tableFieldValue(feature, column))) changeCell(feature, column, event.currentTarget.value);
                    setFocusedFeatureId(null);
                    // A failed draft waits for an explicit retry; merely moving
                    // focus to its recovery controls must not start another save.
                    if (!autosave.snapshot().error) autosave.flush();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && !composingRef.current && !event.nativeEvent.isComposing) {
                      event.preventDefault(); event.currentTarget.blur();
                    }
                  }} />
              </td>;
            })}
          </tr>)}</tbody>
        </table>
        {rows.length === 0 ? <div className="table-empty">{layer.features.length ? text('没有匹配的要素。', 'No matching features.') : text('此图层还没有数据。', 'This layer has no data yet.')}</div> : null}
      </div>
      <footer className="reference-table-footer">
        <div>
          {selectedFeature ? <p className="reference-table-details">{featureDetails}</p> : null}
          {canEdit || saveState.dirty || saveState.error ? <div className={`reference-table-save-state${saveState.error ? ' has-error' : ''}`} role="status">
            {saveLabel}{saveState.error ? <div className="reference-table-save-actions">
              <button type="button" disabled={saveState.pending} onMouseDown={(event) => event.preventDefault()} onClick={() => autosaveRef.current.flush()}>{text('重试', 'Retry')}</button>
              <button type="button" disabled={saveState.pending} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (autosaveRef.current.discard()) onClose(); }}>{text('放弃未保存修改并关闭', 'Discard unsaved changes and close')}</button>
            </div> : null}
          </div> : null}
          {canEdit ? <button type="button" disabled={!selectedFeature || busy || saveState.pending || saveState.dirty} onClick={() => onDelete(selectedFeature)}>{text('删除', 'Delete')}</button> : null}
        </div>
        <button type="button" disabled={columnBusy} onClick={exportTable}>{text('导出 CSV', 'Export CSV')}</button>
      </footer>
    </Modal>
  );
}

function DrawingToolbar({ activeTool, onTool, canUndo, canRedo, onUndo, onRedo, canEdit = true }) {
  const { t, lang } = useI18n();
  const tools = [
    ['pan', t('editor.toolPan'), Hand],
    ['marker', t('editor.toolMarker'), MapPin],
    ['line', t('editor.toolLine'), Waypoints],
    ['polygon', t('editor.toolPolygon'), Shapes],
    ['route', t('editor.toolRoute'), Route],
    ['measure', t('editor.toolMeasure'), Ruler],
  ];
  return (
    <div className="drawing-toolbar" role="toolbar" aria-label={t('editor.toolPan')}>
      <button className="tool-button" disabled={!canUndo} onClick={onUndo} aria-label={t('editor.undo')}><Undo2 size={17} /></button>
      <button className="tool-button" disabled={!canRedo} onClick={onRedo} aria-label={t('editor.redo')}><Redo2 size={17} /></button>
      <span className="tool-divider" />
      {tools.map(([key, label, Icon]) => {
        if (key === 'polygon') return <ShapeToolMenu key={key} activeTool={activeTool} onTool={onTool} disabled={!canEdit} lang={lang} />;
        const writeTool = !['pan', 'measure', 'route'].includes(key);
        return (
          <button
            key={key}
            className={activeTool === key ? 'tool-button active' : 'tool-button'}
            onClick={() => onTool(key)}
            title={label}
            aria-label={label}
            disabled={writeTool && !canEdit}
          >
            <Icon size={17} />
          </button>
        );
      })}
    </div>
  );
}

function DraftFeatureCard({ feature, onSave, onCancel }) {
  const isPoint = feature.geometry.type === 'Point';
  const [name, setName] = useState(feature.name || (isPoint ? '新地点' : '新要素'));
  const [description, setDescription] = useState(feature.description || '');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [mediaError, setMediaError] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const mediaInputRef = useRef(null);
  const nameInputRef = useRef(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => nameInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleMediaSelection = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selectedFiles.length) return;
    try {
      setMediaError('');
      const files = validateMediaSelection(selectedFiles, pendingFiles.length);
      if (pendingFiles.length + files.length > MAX_FILES_PER_UPLOAD) {
        throw new Error(`保存前最多选择 ${MAX_FILES_PER_UPLOAD} 个文件`);
      }
      setPendingFiles((current) => [...current, ...files]);
    } catch (selectionError) {
      setMediaError(selectionError.message);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saveBusy) return;
    setSaveBusy(true);
    const saved = await onSave({
      ...feature,
      name: name.trim() || (isPoint ? '无标题地点' : '无标题要素'),
      description,
      pendingFiles,
    });
    if (!saved) setSaveBusy(false);
  };

  return (
    <article
      className="my-maps-place-card draft-point-card"
      aria-label={isPoint ? '添加地点' : '添加要素'}
      onClickCapture={(event) => { event.nativeEvent.openMyMapCardInteraction = true; }}
      onKeyDown={(event) => { if (event.key === 'Escape' && !event.nativeEvent.isComposing && !saveBusy) { event.preventDefault(); event.stopPropagation(); onCancel(); } }}
    >
      <form className="place-card-edit-form" onSubmit={submit}>
        <div className="place-card-edit-fields">
          <input ref={nameInputRef} disabled={saveBusy} value={name} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setName(event.target.value)} aria-label={isPoint ? '地点名称' : '要素名称'} />
          <textarea rows="2" disabled={saveBusy} value={description} onChange={(event) => setDescription(event.target.value)} aria-label={isPoint ? '地点说明' : '要素说明'} placeholder="添加说明" />
          {mediaError ? <p role="alert">{mediaError}</p> : null}
        </div>
        <button type="button" className="place-card-close" disabled={saveBusy} onClick={onCancel} aria-label={isPoint ? '取消添加地点' : '取消添加要素'} title="取消"><X size={21} /></button>
        {pendingFiles.length ? (
          <div className="draft-point-pending" aria-label="待上传资料">
            {pendingFiles.map((file) => (
              <span key={`${file.name}-${file.size}-${file.lastModified}`}>
                <span title={file.name}>{file.name}</span>
                <button type="button" disabled={saveBusy} onClick={() => setPendingFiles((files) => files.filter((item) => item !== file))} aria-label={`移除待上传文件 ${file.name}`}><X size={13} /></button>
              </span>
            ))}
          </div>
        ) : null}
        <footer className="draft-point-actions">
          <button type="button" className="draft-point-media-button" onClick={() => mediaInputRef.current?.click()} disabled={saveBusy || pendingFiles.length >= MAX_FILES_PER_UPLOAD}>
            <Camera size={17} /><span>{pendingFiles.length ? `${pendingFiles.length} 个资料` : '添加图片或视频'}</span>
          </button>
          <div>
            <button type="button" disabled={saveBusy} onClick={onCancel}>取消</button>
            <button type="submit" className="save" disabled={saveBusy}>{saveBusy ? '保存中…' : '保存'}</button>
          </div>
        </footer>
        <input ref={mediaInputRef} type="file" className="visually-hidden" accept={MEDIA_ACCEPT} multiple onChange={handleMediaSelection} />
      </form>
    </article>
  );
}


export default function MapEditor({ mapId }) {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const text = (zh, en) => lang === 'en' ? en : zh;
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState(null);
  const [editingFeatureId, setEditingFeatureId] = useState(null);
  const [featureStylePreview, setFeatureStylePreview] = useState(null);
  const [featureClickPosition, setFeatureClickPosition] = useState(null);
  const [expandedLayers, setExpandedLayers] = useState({});
  const [activeTool, setActiveTool] = useState('pan');
  const [draftPoints, setDraftPoints] = useState([]);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [featureDialog, setFeatureDialog] = useState(null);
  const [shareDialog, setShareDialog] = useState(false);
  const [share, setShare] = useState(null);
  const [tableLayer, setTableLayer] = useState(null);
  const [layerNameDialog, setLayerNameDialog] = useState(null);
  const [basePicker, setBasePicker] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [layerMenu, setLayerMenu] = useState(null);
  const [styleTarget, setStyleTarget] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [trafficVisible, setTrafficVisible] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [toast, setToast] = useState('');
  const [quickMediaFeatureId, setQuickMediaFeatureId] = useState(null);
  const [zoomState, setZoomState] = useState({ zoom: null, minZoom: AMAP_MIN_ZOOM, maxZoom: AMAP_MAX_ZOOM });
  const [peers, setPeers] = useState([]);
  const [canEdit, setCanEdit] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState('idle');
  const [measurementPoints, setMeasurementPoints] = useState([]);
  const [measurementClosed, setMeasurementClosed] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [layerStyleTarget, setLayerStyleTarget] = useState(null);
  const [sheetState, setSheetState] = useState('collapsed');
  const [shortcutDialog, setShortcutDialog] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width:760px)').matches);
  const searchInputRef = useRef(null);
  const routeEditorRef = useRef(null);
  const draftRedoRef = useRef([]);
  const drawingSaveRef = useRef(false);
  const drawingSessionRef = useRef(0);
  const featureDialogRef = useRef(featureDialog);
  const featureSavePendingRef = useRef(false);
  featureDialogRef.current = featureDialog;
  const hasPendingFeature = () => Boolean(featureDialogRef.current && !featureDialogRef.current.id);
  const closeFeatureDialog = () => { if (!featureSavePendingRef.current) setFeatureDialog(null); };
  const measurementJournalRef = useRef({ past: [], future: [] });
  const measurementStateRef = useRef({ points: [], closed: false });
  const lastHistoryDomainRef = useRef('server');
  const searchViewRef = useRef(null);
  const mapRef = useRef(null);
  const importRef = useRef(null);
  const quickMediaInputRef = useRef(null);
  const currentCenterRef = useRef(null);
  const roomRef = useRef(null);
  const mapDataLatestRef = useRef(mapData);
  const geometryWriteQueueRef = useRef(Promise.resolve());
  mapDataLatestRef.current = mapData;

  const editorHistory = useEditorHistory({
    mapId, canEdit,
    onApply: (data) => {
      if (Number(data?.version) < Number(mapDataLatestRef.current?.version)) return;
      mapDataLatestRef.current = data;
      setMapData(data);
      setSaving(false);
      setSelectedLayerId((current) => data.layers.some((layer) => layer.id === current) ? current : data.layers[0]?.id);
      setSelectedFeatureId((current) => data.layers.some((layer) => layer.features.some((feature) => feature.id === current)) ? current : null);
      setExpandedLayers((current) => data.layers.reduce((next, layer) => ({ ...next, [layer.id]: current[layer.id] ?? true }), {}));
    },
    onError: setToast,
  });
  const directions = useDirections({
    lang,
    onSave: async (payload, { target } = {}) => {
      if (!canEdit) throw new Error(text('当前为只读权限', 'This map is read-only'));
      const latest = mapDataLatestRef.current;
      const existing = target?.featureId ? latest?.layers.flatMap((layer) => layer.features).find((feature) => feature.id === target.featureId) : null;
      let data, historyWarning;
      try {
        data = await performEdit('Save directions layer', (expectedFingerprint) => api.saveDirections(mapId, {
          ...payload,
          style: existing ? { ...payload.style, ...existing.style, routeData: payload.style.routeData } : payload.style,
          layerId: target?.layerId ?? undefined, featureId: target?.featureId ?? undefined,
          expectedFingerprint, expectedVersion: target?.featureVersion ?? existing?.version ?? latest.version,
        }));
      } catch (saveError) {
        if (!saveError.operationSaved || !saveError.savedData?.savedFeatureId) throw saveError;
        data = saveError.savedData;
        historyWarning = saveError.message;
      }
      setSelectedLayerId(data.savedLayerId);
      setSelectedFeatureId(null);
      setExpandedLayers((current) => ({ ...current, [data.savedLayerId]: true }));
      setToast(historyWarning || text('路线图层已保存', 'Directions layer saved'));
      const feature = data.layers.flatMap((layer) => layer.features).find((item) => item.id === data.savedFeatureId);
      return { layerId: data.savedLayerId, featureId: data.savedFeatureId, featureVersion: feature?.version };
    },
    onError: setToast,
    onFocus: (positions) => mapRef.current?.fitPositions(positions, 16),
  });
  const placeSearch = usePlaceSearch({
    getBounds: () => mapRef.current?.getBounds(),
    onLocate: (place) => { if (place.position) mapRef.current?.setView(place.position, 16); },
    toast: setToast,
  });
  useEffect(() => {
    if (!directions.visible || (isMobile && sheetState === 'collapsed')) return;
    const frame = requestAnimationFrame(() => routeEditorRef.current?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  }, [directions.visible, directions.target?.layerId, isMobile, sheetState]);
  useEffect(() => {
    if (!directions.target?.layerId || !mapData || saving || editorHistory.busy) return;
    if (!mapData.layers.some((layer) => layer.id === directions.target.layerId)) directions.close();
  }, [mapData, directions.target?.layerId, directions.close, saving, editorHistory.busy]);
  useEffect(() => {
    if (!directions.visible || !directions.isSaved || saving || editorHistory.busy) return;
    const layer = mapData?.layers.find((item) => item.id === directions.target?.layerId);
    const feature = layer?.features.find((item) => item.id === directions.target?.featureId);
    if (feature && feature.version !== directions.target.featureVersion) {
      directions.openFrom({ savedFeature: feature, layerId: layer.id, featureId: feature.id });
    }
  }, [mapData, directions.visible, directions.isSaved, directions.target, directions.openFrom, saving, editorHistory.busy]);
  const searchQuery = placeSearch.query;
  useEffect(() => {
    if (editingFeatureId !== selectedFeatureId || activeTool !== 'pan' || directions.visible || !canEdit) setEditingFeatureId(null);
  }, [activeTool, canEdit, directions.visible, editingFeatureId, selectedFeatureId]);
  const searchResults = placeSearch.results;
  const searching = placeSearch.loading;
  const searchSuggestions = placeSearch.suggestions;
  const suggestionsOpen = placeSearch.suggestionsOpen;
  const suggestionIndex = placeSearch.suggestionIndex;
  const setSearchQuery = placeSearch.setQuery;
  const setSuggestionsOpen = placeSearch.setSuggestionsOpen;

  useEffect(() => {
    const media = window.matchMedia('(max-width:760px)');
    const changed = (event) => setIsMobile(event.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    if (directions.visible || placeSearch.mode) {
      setSidebarCollapsed(false);
      setSheetState((current) => current === 'collapsed' ? 'half' : current);
    }
  }, [directions.visible, placeSearch.mode]);
  useEffect(() => {
    if (isMobile && (selectedFeatureId !== null || featureDialog?.geometry)) setSheetState('half');
  }, [isMobile, selectedFeatureId, featureDialog?.geometry?.type]);

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, []);

  const loadMap = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.map(mapId);
      if (Number(data.version) < Number(mapDataLatestRef.current?.version || 0)) return;
      mapDataLatestRef.current = data;
      setMapData(data);
      setSelectedLayerId((current) => current && data.layers.some((layer) => layer.id === current) ? current : data.layers[0]?.id);
      setExpandedLayers((current) => data.layers.reduce((next, layer) => ({ ...next, [layer.id]: current[layer.id] ?? true }), {}));
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
      setSaving(false);
    }
  }, [mapId]);

  useEffect(() => { loadMap(); }, [loadMap]);

  useEffect(() => {
    const room = connectMapRoom(mapId, {
      onPresence: (nextPeers) => setPeers(nextPeers),
      onStatus: (status, detail) => {
        setRealtimeStatus(status);
        if (status === 'joined' && detail) setCanEdit(Boolean(detail.canEdit));
        if (status === 'error' && detail?.error) setToast(detail.error);
      },
      onOp: (op) => {
        if (op.actor?.id && op.actor.id !== user?.id) editorHistory.clear();
        if (op.action === 'map.deleted') {
          setToast('该地图已被删除');
          navigate('/');
          return;
        }
        setMapData((current) => current ? applyMapOp(current, op) : current);
        if (op.actor?.name) {
          setToast(`${op.actor.name} 更新了地图`);
        }
      },
    });
    roomRef.current = room;
    return () => {
      room.close();
      roomRef.current = null;
    };
  }, [mapId]);

  useEffect(() => {
    roomRef.current?.updatePresence({
      tool: activeTool,
      selectedFeatureId,
    });
  }, [activeTool, selectedFeatureId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const onKey = (event) => {
      if (event.defaultPrevented) return;
      const typing = event.target.closest?.('input,textarea,select,[contenteditable="true"]');
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInputRef.current?.focus(); return; }
      if (typing) return;
      if (modifier && event.key === '/') { event.preventDefault(); setShortcutDialog(true); return; }
      if (featureDialog || shareDialog || tableLayer || layerNameDialog || layerStyleTarget || shortcutDialog) {
        if (event.key === 'Escape') { closeFeatureDialog(); setShareDialog(false); setTableLayer(null); setLayerNameDialog(null); setLayerStyleTarget(null); setShortcutDialog(false); }
        return;
      }
      if (modifier && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        const redoRequested = event.key.toLowerCase() === 'y' || event.shiftKey;
        if (!editorHistory.busy) { if (redoRequested) redo(); else undo(); }
        return;
      }
      if (event.key === 'Escape') {
        if (editingFeatureId !== null) { setEditingFeatureId(null); return; }
        if (contextMenu) { setContextMenu(null); return; }
        if (moreMenu || basePicker || styleTarget) { setMoreMenu(false); setBasePicker(false); setStyleTarget(null); return; }
        if (activeTool !== 'pan') { cancelDrawing(); return; }
        if (directions.visible) { directions.close(); return; }
        if (placeSearch.mode === 'detail') { placeSearch.backToResults(); return; }
        if (placeSearch.mode) { placeSearch.clear(); return; }
        setSelectedFeatureId(null); if (isMobile) setSheetState('collapsed');
        return;
      }
      if (event.key === 'Enter') {
        if (activeTool === 'measure' && measurementPoints.length >= 2) { event.preventDefault(); setActiveTool('pan'); setHoverPoint(null); }
        else if (['line','polygon'].includes(activeTool) && draftPoints.length >= (activeTool === 'polygon' ? 3 : 2)) { event.preventDefault(); finishDraft().catch(() => {}); }
        return;
      }
      if (['Backspace','Delete'].includes(event.key)) {
        if (activeTool === 'measure' && measurementPoints.length) { event.preventDefault(); updateMeasurement((points) => points.slice(0, -1)); }
        else if ((activeTool === 'line' || SHAPE_TOOLS.includes(activeTool)) && draftPoints.length) { event.preventDefault(); undo(); }
        else if (canEdit && selectedFeatureId !== null && !editorHistory.busy) {
          event.preventDefault(); const feature = mapDataLatestRef.current?.layers.flatMap((layer) => layer.features).find((item) => item.id === selectedFeatureId);
          if (feature) deleteFeatureFromCard(feature);
        }
        return;
      }
      if (!modifier && !event.altKey && !contextMenu) {
        const tool = { h:'pan', m:'marker', l:'line', p:'polygon', r:'route', d:'measure' }[event.key.toLowerCase()];
        if (tool && (canEdit || ['pan','measure','route'].includes(tool))) { event.preventDefault(); changeTool(tool); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => {
    if (layerMenu === null && !moreMenu && !basePicker && !styleTarget) return undefined;
    const dismissOpenMenus = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.marker-style-backdrop')) return;
      if (layerMenu !== null && !target.closest('[data-layer-menu-root]')) setLayerMenu(null);
      if (moreMenu && !target.closest('[data-map-menu-root]')) setMoreMenu(false);
      if (basePicker && !target.closest('[data-base-picker-root]')) setBasePicker(false);
      if (styleTarget && !target.closest('[data-style-popover-root], .marker-style-backdrop') && !target.closest('.mini-style-button')) setStyleTarget(null);
    };
    document.addEventListener('pointerdown', dismissOpenMenus, true);
    return () => document.removeEventListener('pointerdown', dismissOpenMenus, true);
  }, [basePicker, layerMenu, moreMenu, styleTarget]);

  const contentLayers = useMemo(() => mapData?.layers.filter((layer) => layer.kind !== 'directions') || [], [mapData]);
  const selectedLayer = contentLayers.find((layer) => layer.id === selectedLayerId) || contentLayers[0];
  const selectedFeatureContext = useMemo(() => {
    if (!mapData || selectedFeatureId === null) return null;
    for (const layer of mapData.layers) {
      const feature = layer.features.find((candidate) => candidate.id === selectedFeatureId);
      if (feature && layer.visible) return { feature, layer };
    }
    return null;
  }, [mapData, selectedFeatureId]);
  const visibleMapData = useMemo(() => {
    if (!mapData) return mapData;
    const routeId = directions.visible && directions.selectedAlternative ? directions.target?.featureId : null;
    const preview = featureStylePreview;
    if (!routeId && !preview) return mapData;
    // Preview is local render data: it never changes the persisted map or history.
    return { ...mapData, layers: mapData.layers.map((layer) => ({ ...layer,
      features: layer.features.filter((feature) => feature.id !== routeId).map((feature) => preview?.featureId === feature.id
        ? { ...feature, style: { ...feature.style, ...preview.style } } : feature),
    })) };
  }, [mapData, directions.visible, directions.selectedAlternative, directions.target?.featureId, featureStylePreview, selectedFeatureId]);

  const replaceData = (data) => {
    if (Number(data?.version) < Number(mapDataLatestRef.current?.version)) return;
    mapDataLatestRef.current = data;
    setMapData(data);
    setSaving(false);
  };

  const handleWriteError = (requestError) => {
    if (requestError.name === 'AbortError') return;
    setSaving(false);
    if (requestError.conflict && requestError.latest) {
      if (requestError.latest.layers) replaceData(requestError.latest);
      else setMapData((current) => applyMapOp(current, {
        action: requestError.latest.geometry ? 'feature.updated' : 'layer.updated',
        entity: requestError.latest,
      }) || current);
      setToast(requestError.message || '内容已被他人更新');
      return;
    }
    setToast(requestError.message);
  };

  const performEdit = async (label, mutation, options) => {
    setSaving(true);
    try { const data = await editorHistory.run(label, mutation, options); lastHistoryDomainRef.current = 'server'; return data; }
    catch (requestError) { handleWriteError(requestError); throw requestError; }
    finally { setSaving(false); }
  };
  const updateMap = async (body) => {
    if (!canEdit) return;
    try {
      if (Object.keys(body).every((key) => ['center_lat','center_lng','zoom'].includes(key))) {
        replaceData(await api.updateMap(mapId, { ...body, expectedVersion: mapDataLatestRef.current?.version }));
      } else await performEdit('Map settings', (expectedFingerprint) => api.updateMap(mapId, { ...body, expectedFingerprint, expectedVersion: mapDataLatestRef.current?.version }));
    } catch (requestError) { handleWriteError(requestError); }
  };
  const persistGeometry = (feature, geometry) => {
    if (!canEdit) return Promise.resolve();
    const write = geometryWriteQueueRef.current.catch(() => {}).then(async () => {
      const latest = mapDataLatestRef.current?.layers.flatMap((layer) => layer.features).find((item) => item.id === feature.id);
      if (!latest || JSON.stringify(latest.geometry) === JSON.stringify(geometry)) return;
      return performEdit('Move feature', (expectedFingerprint) => api.updateFeature(feature.id, { geometry, expectedFingerprint, expectedVersion: latest.version }));
    });
    geometryWriteQueueRef.current = write;
    return write.catch(async (requestError) => { if (!requestError.conflict && requestError.name !== 'AbortError') await loadMap(); throw requestError; });
  };
  const addFeature = async (layerId, body) => {
    let data, historyWarning;
    try { data = await performEdit('Add feature', (expectedFingerprint) => api.addFeature(layerId, { ...body, expectedFingerprint })); }
    catch (error) {
      // A post-save checkpoint failure must not leave a creation form open to
      // submit the same object again. Do not reapply its unverified map data.
      if (!error.operationSaved || !error.savedData?.createdFeatureId) throw error;
      data = error.savedData;
      historyWarning = error.message;
    }
    const feature = data.layers.flatMap((layer) => layer.features).find((item) => item.id === data.createdFeatureId);
    return historyWarning ? { ...feature, historyWarning } : feature;
  };
  const deleteFeature = async (feature) => {
    if (!canEdit) return false;
    await performEdit('Delete feature', (expectedFingerprint) => api.deleteFeature(feature.id, { expectedFingerprint }), { record: !feature.attachments?.length });
    setSelectedFeatureId(null);
    return true;
  };
  // Keep temporary edits local. In particular, React may call state updaters
  // twice in Strict Mode, so journal operations happen before setState.
  const updateMeasurement = (nextPoints, nextClosed, remember = true) => {
    const current = measurementStateRef.current;
    const points = typeof nextPoints === 'function' ? nextPoints(current.points) : nextPoints;
    const closed = points.length >= 3 && (nextClosed ?? current.closed);
    if (JSON.stringify(current) === JSON.stringify({ points, closed })) return;
    if (remember) {
      measurementJournalRef.current.past.push(current);
      measurementJournalRef.current.past = measurementJournalRef.current.past.slice(-50);
      measurementJournalRef.current.future = [];
    }
    measurementStateRef.current = { points, closed };
    lastHistoryDomainRef.current = 'measurement';
    setMeasurementPoints(points);
    setMeasurementClosed(closed);
  };
  const localDraft = activeTool === 'line' || SHAPE_TOOLS.includes(activeTool);
  const localMeasurement = lastHistoryDomainRef.current === 'measurement';
  const canUndo = localDraft ? draftPoints.length > 0 : localMeasurement ? measurementJournalRef.current.past.length > 0 : canEdit && editorHistory.canUndo;
  const canRedo = ['rectangle', 'circle'].includes(activeTool) ? false : localDraft ? draftRedoRef.current.length > 0 : localMeasurement ? measurementJournalRef.current.future.length > 0 : canEdit && editorHistory.canRedo;
  const undo = () => {
    if (['rectangle', 'circle'].includes(activeTool)) return cancelDrawing();
    if (localDraft) {
      if (!draftPoints.length) return;
      draftRedoRef.current.push(draftPoints.at(-1));
      setDraftPoints(draftPoints.slice(0, -1));
    } else if (localMeasurement && measurementJournalRef.current.past.length) {
      const previous = measurementJournalRef.current.past.pop();
      measurementJournalRef.current.future.push(measurementStateRef.current);
      updateMeasurement(previous.points, previous.closed, false);
    } else if (!localMeasurement) return editorHistory.undo();
  };
  const redo = () => {
    if (['rectangle', 'circle'].includes(activeTool)) return;
    if (localDraft) {
      const point = draftRedoRef.current.pop();
      if (point) setDraftPoints([...draftPoints, point]);
    } else if (localMeasurement && measurementJournalRef.current.future.length) {
      const next = measurementJournalRef.current.future.pop();
      measurementJournalRef.current.past.push(measurementStateRef.current);
      updateMeasurement(next.points, next.closed, false);
    } else if (!localMeasurement) return editorHistory.redo();
  };

  const finishDraft = async (tool = activeTool, points = draftPoints) => {
    if (drawingSaveRef.current) return;
    const compactPoints = compactDraftPoints(points);
    if (compactPoints.length < 2) return;
    if (tool === 'measure') {
      updateMeasurement(compactPoints); setHoverPoint(null); setActiveTool('pan'); return;
    }
    if (!selectedLayer || !canEdit) return;
    const isShape = SHAPE_TOOLS.includes(tool);
    const geometry = tool === 'rectangle' ? rectangleGeometry(compactPoints[0], compactPoints[1])
      : tool === 'circle' ? circleGeometry(compactPoints[0], compactPoints[1])
        : tool === 'polygon' ? polygonGeometry(compactPoints)
          : { type: 'LineString', coordinates: compactPoints };
    if (!geometry) {
      setToast(tool === 'polygon' ? text('请放置至少三个不共线的顶点。', 'Place at least three non-collinear vertices.') : text('请选择不同的位置，形成有面积的图形。', 'Choose another position to give the shape an area.'));
      return;
    }
    drawingSaveRef.current = true;
    try {
      setFeatureDialog({
        name: { polygon: '未命名区域', rectangle: '未命名矩形', circle: '未命名圆形' }[tool] || '未命名线条',
        description: '',
        geometry,
        style: { color: isShape ? '#00897b' : '#e85d4a', fillColor: '#4db6ac', fillOpacity: 0.28, weight: 4 },
        layerId: selectedLayer.id,
      });
      setSelectedFeatureId(null); setEditingFeatureId(null);
      setDraftPoints([]); draftRedoRef.current = []; setHoverPoint(null); setActiveTool('pan');
    } finally { drawingSaveRef.current = false; }
  };

  const nearPolygonStart = (point) => {
    if (activeTool !== 'polygon' || draftPoints.length < 3 || !point) return false;
    const start = mapRef.current?.getScreenPosition(draftPoints[0]);
    const end = mapRef.current?.getScreenPosition(point);
    return start && end ? Math.hypot(start.x - end.x, start.y - end.y) <= 12
      : Math.abs(draftPoints[0][0] - point[0]) < 1e-9 && Math.abs(draftPoints[0][1] - point[1]) < 1e-9;
  };
  const cancelDrawing = () => {
    if (hasPendingFeature()) return;
    drawingSessionRef.current += 1;
    setActiveTool('pan'); setDraftPoints([]); setHoverPoint(null); draftRedoRef.current = [];
  };

  const handleMapClick = async (latlng, originalEvent) => {
    if (drawingSaveRef.current || hasPendingFeature()) return;
    if (originalEvent?.openMyMapCardInteraction || originalEvent?.target?.closest?.('.my-maps-place-card')) return;
    if (contextMenu) setContextMenu(null);
    const clickedPoint = [latlng.lng, latlng.lat];
    if (directions.visible && directions.pickPosition(clickedPoint)) return;
    if (activeTool === 'measure') {
      updateMeasurement((points) => compactDraftPoints([...points, clickedPoint]));
      return;
    }
    if (activeTool === 'pan') {
      setSelectedFeatureId(null);
      return;
    }
    if (!selectedLayer) return;
    const point = [latlng.lng, latlng.lat];
    if (activeTool === 'marker') {
      setFeatureDialog({ name: '新地点', description: '', geometry: { type: 'Point', coordinates: point }, style: { color: selectedLayer.style.color || '#1a73e8' }, layerId: selectedLayer.id });
      setHoverPoint(null);
      setActiveTool('pan');
      return;
    }
    if (!canEdit) return;
    if (['rectangle', 'circle'].includes(activeTool)) return;
    if (nearPolygonStart(point)) { await finishDraft('polygon', draftPoints); return; }
    lastHistoryDomainRef.current = 'draft';
    const next = compactDraftPoints([...draftPoints, point]);
    setDraftPoints(next);
    draftRedoRef.current = [];
  };

  const handleShapeDrag = ({ phase, tool, start, position }) => {
    if (tool !== activeTool) return;
    if (phase === 'cancel') { setDraftPoints([]); setHoverPoint(null); draftRedoRef.current = []; return; }
    if (!canEdit || drawingSaveRef.current) return;
    if (phase === 'start') {
      lastHistoryDomainRef.current = 'draft';
      draftRedoRef.current = [];
      setDraftPoints([[start.lng, start.lat]]);
      setHoverPoint(null);
      setContextMenu(null);
    } else if (phase === 'move') {
      setHoverPoint([position.lng, position.lat]);
    } else {
      setDraftPoints([]);
      setHoverPoint(null);
      if (phase === 'end') finishDraft(tool, [[start.lng, start.lat], [position.lng, position.lat]]).catch(() => {});
    }
  };

  const handleDoubleClick = async (latlng) => {
    if (['line', 'measure'].includes(activeTool)) {
      const point = [latlng.lng, latlng.lat];
      await finishDraft(activeTool, [...(activeTool === 'measure' ? measurementPoints : draftPoints), point]);
    }
  };

  const selectFeature = useCallback((feature, layer, edit = false, focus = true, position = null) => {
    if (featureDialogRef.current && !featureDialogRef.current.id) return;
    drawingSessionRef.current += 1;
    setEditingFeatureId(null);
    setFeatureClickPosition(position ? { featureId: feature.id, position: [position.lng, position.lat] } : null);
    setSelectedFeatureId(feature.id);
    setSelectedLayerId(layer.id);
    placeSearch.clear();
    directions.close();
    setActiveTool('pan');
    setDraftPoints([]);
    setHoverPoint(null);
    if (focus) mapRef.current?.focusFeature(feature.id);
    if (isMobile) setSheetState('half');
    if (edit && feature.style?.routeData) {
      directions.openFrom({ savedFeature: feature, layerId: layer.id, featureId: feature.id });
    } else if (edit) setFeatureDialog({ ...feature, layerId: layer.id });
  }, [directions.close, directions.openFrom, isMobile, placeSearch.clear]);

  const uploadFeatureAttachments = async (featureId, files) => {
    if (!canEdit) throw new Error(text('当前为只读权限', 'This map is read-only'));
    try {
      setSaving(true);
      const data = await performEdit('Upload attachments', () => api.uploadAttachments(featureId, files), {record: false});
      setToast(`已上传 ${files.length} 个附件`);
      return attachmentsForFeature(data, featureId);
    } catch (requestError) {
      setSaving(false);
      setToast(requestError.message);
      throw requestError;
    }
  };

  const requestQuickMedia = (feature) => {
    if (!canEdit) return;
    if ((feature.attachments?.length || 0) >= MAX_ATTACHMENTS_PER_FEATURE) {
      setToast(`每个地点最多保存 ${MAX_ATTACHMENTS_PER_FEATURE} 个附件`);
      return;
    }
    setQuickMediaFeatureId(feature.id);
    quickMediaInputRef.current?.click();
  };

  const handleQuickMediaSelection = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    const targetFeature = mapData.layers.flatMap((layer) => layer.features).find((feature) => feature.id === quickMediaFeatureId);
    if (!selectedFiles.length || !targetFeature) {
      setQuickMediaFeatureId(null);
      return;
    }
    try {
      const files = validateMediaSelection(selectedFiles, targetFeature.attachments?.length || 0);
      await uploadFeatureAttachments(targetFeature.id, files);
      setSelectedFeatureId(targetFeature.id);
    } catch (requestError) {
      setToast(requestError.message);
    } finally {
      setQuickMediaFeatureId(null);
    }
  };

  const copyFeatureCoordinates = async (feature) => {
    const [lng, lat] = feature.geometry.coordinates;
    const coordinates = `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
    try {
      await navigator.clipboard.writeText(coordinates);
      setToast('坐标已复制');
    } catch {
      setToast(`坐标：${coordinates}`);
    }
  };

  const startRouteFromFeature = (feature, layer) => {
    setSelectedLayerId(layer.id); setSelectedFeatureId(null);
    openDirections({ from: { name: feature.name, position: feature.geometry.coordinates } });
  };

  const applyCardStyle = async (feature, style) => {
    try {
      if (!await applyStyle(feature, style)) return false;
      setToast('要素样式已更新');
      return true;
    } catch (requestError) {
      setToast(requestError.message);
      return false;
    }
  };

  const saveTableCell = async ({ featureId, field, value, baseValue }) => {
    const customId = tableCustomFieldId(field);
    if (!canEdit || (!['name', 'description'].includes(field) && !customId)) throw new Error(text('当前不可编辑。', 'Editing is unavailable.'));
    const next = field === 'name' ? value.trim() || text('无标题要素', 'Untitled feature') : value;
    try {
      const data = await performEdit('Edit table cell', (expectedFingerprint) => {
        const layer = mapDataLatestRef.current.layers.find((item) => item.features.some((feature) => feature.id === featureId));
        const current = layer?.features.find((feature) => feature.id === featureId);
        if (!current) throw new Error(text('要素已不存在。', 'This feature no longer exists.'));
        if (customId && !(layer.columns || []).some((column) => column.id === customId)) throw new Error(text('此列已不存在。', 'This column no longer exists.'));
        const currentValue = tableFieldValue(current, field);
        if (currentValue === next) return mapDataLatestRef.current;
        if (currentValue !== baseValue) throw Object.assign(new Error(text('此单元格已被更新，修改仍保留，请确认后重试。', 'This cell was updated elsewhere. Your draft is retained; review it before retrying.')), { latestValue: currentValue });
        return api.updateFeature(featureId, { ...(customId ? { properties: { [customId]: next } } : { [field]: next }), expectedFingerprint, expectedVersion: current.version });
      });
      const saved = data.layers.flatMap((layer) => layer.features).find((feature) => feature.id === featureId);
      return saved ? tableFieldValue(saved, field) : next;
    } catch (error) {
      const latest = error.latest?.layers ? error.latest.layers.flatMap((layer) => layer.features).find((feature) => feature.id === featureId) : error.latest;
      if (latest && Object.hasOwn(latest, customId ? 'properties' : field)) error.latestValue = tableFieldValue(latest, field);
      throw error;
    }
  };

  const addTableColumn = async (layerId, name) => {
    if (!canEdit) throw new Error(text('当前不可编辑。', 'Editing is unavailable.'));
    const column = { id: `col_${crypto.randomUUID()}`, name: name.trim() };
    await performEdit('Add table column', (expectedFingerprint) => {
      const current = mapDataLatestRef.current.layers.find((layer) => layer.id === layerId);
      if (!current) throw new Error(text('图层已不存在。', 'This layer no longer exists.'));
      return api.updateLayer(layerId, { columns: [...(current.columns || []), column], expectedFingerprint, expectedVersion: current.version });
    });
    return column;
  };

  const saveCardDetails = async (feature, changes) => {
    try {
      setSaving(true);
      const data = await performEdit('Edit feature details', (expectedFingerprint) => api.updateFeature(feature.id, { ...changes, expectedFingerprint, expectedVersion: feature.version }));
      replaceData(data);
      setSelectedFeatureId(feature.id);
      setToast('要素信息已保存');
    } catch (requestError) {
      handleWriteError(requestError);
      throw requestError;
    }
  };

  const deleteFeatureFromCard = async (feature) => {
    if (!canEdit) return false;
    if (!window.confirm(`删除${feature.type === 'Point' ? '地点' : '要素'}“${feature.name}”？`)) return;
    try {
      if (!await deleteFeature(feature)) return false;
      setToast('要素已删除');
      return true;
    } catch (requestError) {
      setSaving(false);
      setToast(requestError.message);
    }
  };

  const deleteFeatureAttachment = async (attachmentId, featureId) => {
    if (!canEdit) throw new Error(text('当前为只读权限', 'This map is read-only'));
    try {
      setSaving(true);
      const data = await performEdit('Delete attachment', () => api.deleteAttachment(attachmentId), {record: false});
      setToast('附件已删除');
      return attachmentsForFeature(data, featureId);
    } catch (requestError) {
      setSaving(false);
      setToast(requestError.message);
      throw requestError;
    }
  };

  const saveFeatureDialog = async (payload) => {
    if (!canEdit) { setToast(text('当前为只读权限', 'This map is read-only')); return false; }
    if (featureSavePendingRef.current) return false;
    featureSavePendingRef.current = true;
    let createdFeatureId = null;
    let historyWarning;
    try {
      setSaving(true);
      const { pendingFiles = [], ...featurePayload } = payload;
      delete featurePayload.attachments;
      let featureId = payload.id;
      if (payload.id) {
        replaceData(await performEdit('Edit feature', (expectedFingerprint) => api.updateFeature(payload.id, {
          expectedFingerprint,
          name: featurePayload.name,
          description: featurePayload.description,
          style: featurePayload.style,
          layerId: featurePayload.layerId,
          expectedVersion: featurePayload.version ?? payload.version,
        })));
      } else {
        const created = await addFeature(featurePayload.layerId, featurePayload);
        featureId = created.id;
        createdFeatureId = created.id;
        historyWarning = created.historyWarning;
      }
      if (pendingFiles.length) await uploadFeatureAttachments(featureId, pendingFiles);
      setFeatureDialog(null);
      if (!payload.id) setSelectedFeatureId(featureId);
      setToast(historyWarning || (pendingFiles.length ? `要素已保存，并上传 ${pendingFiles.length} 个附件` : '要素已保存'));
      return true;
    } catch (requestError) {
      setSaving(false);
      if (createdFeatureId !== null) {
        setFeatureDialog(null);
        setSelectedFeatureId(createdFeatureId);
        setToast(`要素已保存，但附件上传失败：${requestError.message}`);
        return true;
      }
      setToast(requestError.message);
      return false;
    } finally { featureSavePendingRef.current = false; }
  };

  const addLayer = () => {
    if (canEdit && !hasPendingFeature()) setLayerNameDialog({ layer: null });
  };

  const renameLayer = (layer) => {
    if (canEdit) setLayerNameDialog({ layer });
  };

  const saveLayerName = async (name) => {
    if (!canEdit) throw new Error(text('当前不可编辑。', 'Editing is unavailable.'));
    if (!layerNameDialog.layer) {
      const data = await performEdit('Add layer', (expectedFingerprint) => api.addLayer(mapId, { name, expectedFingerprint }));
      const newest = data.layers.find((layer) => layer.id === data.createdLayerId);
      replaceData(data);
      setSelectedLayerId(newest.id);
      setExpandedLayers((items) => ({ ...items, [newest.id]: true }));
      setToast(text('已添加图层', 'Layer added'));
    } else {
      await performEdit('Rename layer', (expectedFingerprint) => {
        const layer = mapDataLatestRef.current.layers.find((item) => item.id === layerNameDialog.layer.id);
        if (!layer) throw new Error(text('图层已不存在。', 'This layer no longer exists.'));
        return api.updateLayer(layer.id, { name, expectedVersion: layer.version, expectedFingerprint });
      });
      setLayerMenu(null);
    }
    setLayerNameDialog(null);
  };

  const removeLayer = async (layer) => {
    if (!canEdit) return false;
    if (!window.confirm(`删除“${layer.name}”及其中的 ${layer.features.length} 个要素？`)) return false;
    try { await performEdit('Delete layer', (expectedFingerprint) => api.deleteLayer(layer.id, { expectedFingerprint }), { record: !layer.features.some((feature) => feature.attachments?.length) }); setLayerMenu(null); return true; } catch (requestError) { handleWriteError(requestError); return false; }
  };

  const toggleLayer = async (layer) => {
    if (!canEdit) return false;
    try {
      await performEdit('Layer visibility', (expectedFingerprint) => api.updateLayer(layer.id, { visible: !layer.visible, expectedVersion: layer.version, expectedFingerprint }));
      return true;
    } catch (requestError) {
      handleWriteError(requestError);
      return false;
    }
  };

  const applyStyle = async (feature, style, keepOpen = false) => {
    if (!canEdit) return false;
    try {
      replaceData(await performEdit('Feature style', (expectedFingerprint) => {
        const latest = mapDataLatestRef.current.layers.flatMap((layer) => layer.features).find((item) => item.id === feature.id);
        if (!latest) throw new Error(text('要素已不存在。', 'This feature no longer exists.'));
        return api.updateFeature(feature.id, {
          expectedFingerprint,
          style: { ...latest.style, ...(typeof style === 'string' ? { color: style, fillColor: style } : style) },
          expectedVersion: latest.version,
        });
      }));
      if (!keepOpen) setStyleTarget((current) => current?.feature?.id === feature.id ? null : current);
      return true;
    } catch (requestError) {
      handleWriteError(requestError);
      return false;
    }
  };

  const openDirections = (settings = {}) => {
    if (hasPendingFeature()) return;
    drawingSessionRef.current += 1;
    placeSearch.clear(); setSelectedFeatureId(null); setActiveTool('pan'); setDraftPoints([]); setHoverPoint(null);
    if (settings.layerId) {
      setSelectedLayerId(settings.layerId);
      setExpandedLayers((current) => ({ ...current, [settings.layerId]: true }));
    }
    setSidebarCollapsed(false); setSheetState('half');
    directions.openFrom({ newLayer: !settings.savedFeature && !settings.routeData, ...settings });
  };
  const changeTool = (tool) => {
    if (hasPendingFeature()) return;
    if ((tool === 'marker' || tool === 'line' || SHAPE_TOOLS.includes(tool)) && (drawingSaveRef.current || editorHistory.busy)) return;
    drawingSessionRef.current += 1;
    setContextMenu(null); setSelectedFeatureId(null); setDraftPoints([]); setHoverPoint(null); draftRedoRef.current = [];
    if (tool === 'route') { openDirections(); return; }
    if ((tool === 'marker' || tool === 'line' || SHAPE_TOOLS.includes(tool)) && selectedLayer) setSelectedLayerId(selectedLayer.id);
    directions.close(); placeSearch.clear(); setActiveTool(tool);
    lastHistoryDomainRef.current = 'server';
    if (tool === 'measure') { if (isMobile) setSheetState('collapsed'); measurementJournalRef.current = {past: [], future: []}; updateMeasurement([], false, false); lastHistoryDomainRef.current = 'measurement'; }
  };
  const searchPlaces = async (event) => {
    if (hasPendingFeature()) { event.preventDefault(); return; }
    cancelDrawing();
    setActiveTool('pan'); setSelectedFeatureId(null); setSidebarCollapsed(false); setSheetState('half');
    const places = await placeSearch.onSearch(event);
    if (places.length) mapRef.current?.fitPositions(places.map((place) => place.position), 15);
  };
  const openPlaceDetail = (place) => {
    if (hasPendingFeature()) return;
    cancelDrawing();
    setSelectedFeatureId(null); setActiveTool('pan');
    searchViewRef.current = { center: mapRef.current?.getCenter(), zoom: mapRef.current?.getZoom() };
    return placeSearch.openDetail(place);
  };
  const backToSearchResults = () => {
    placeSearch.backToResults();
    const view = searchViewRef.current;
    if (view?.center) mapRef.current?.setView([view.center.lng, view.center.lat], view.zoom);
  };
  const searchPanelState = { ...placeSearch, openDetail: openPlaceDetail, backToResults: backToSearchResults };
  const chooseSuggestion = (suggestion) => { cancelDrawing(); setSelectedFeatureId(null); placeSearch.chooseSuggestion(suggestion); };
  const handleSearchKey = placeSearch.handleKeyDown;
  const addSearchResult = async (candidate) => {
    if (!selectedLayer || !candidate.position || !canEdit) return;
    const created = await addFeature(selectedLayer.id, { name: candidate.name, description: candidate.address || '', geometry: { type: 'Point', coordinates: candidate.position }, style: { color: selectedLayer.style.color || '#1a73e8', poi: { id: candidate.poiId, address: candidate.address, type: candidate.type, phone: candidate.phone } } });
    placeSearch.clear();
    setSelectedLayerId(selectedLayer.id);
    setExpandedLayers((current) => ({ ...current, [selectedLayer.id]: true }));
    if (created) setSelectedFeatureId(created.id);
    setToast(created?.historyWarning || text('地点已添加到地图', 'Place added to your map'));
  };
  const replanSavedRoute = async (feature, payload) => {
    const latest = mapDataLatestRef.current?.layers.flatMap((layer) => layer.features).find((item) => item.id === feature.id);
    if (!latest || !canEdit) return;
    try {
      const changes = await directions.replanSavedFeature(latest, payload);
      await performEdit('Replan route', (expectedFingerprint) => api.updateFeature(feature.id, { ...changes, expectedFingerprint, expectedVersion: latest.version }));
    } catch (routeError) {
      if (routeError.name === 'AbortError') return;
      setToast(routeError.message);
      try { replaceData(await api.map(mapId)); } catch { /* Keep the visible server-backed route. */ }
    }
  };
  const onMapContextMenu = (point, screen) => { if (!hasPendingFeature()) setContextMenu({ point, screen }); };
  const contextPosition = contextMenu ? [contextMenu.point.lng, contextMenu.point.lat] : null;
  const startMeasurement = (position) => {
    if (hasPendingFeature()) return;
    cancelDrawing();
    if (isMobile) setSheetState('collapsed');
    directions.close(); placeSearch.clear(); setSelectedFeatureId(null); setActiveTool('measure'); measurementJournalRef.current = {past: [], future: []}; measurementStateRef.current = {points: [], closed: false}; updateMeasurement(position ? [position] : [], false); lastHistoryDomainRef.current = 'measurement'; setContextMenu(null); setHoverPoint(null);
  };
  const addMarkerAt = (position) => {
    if (hasPendingFeature()) return;
    cancelDrawing();
    if (!canEdit || !selectedLayer) return;
    setSelectedLayerId(selectedLayer.id);
    setFeatureDialog({ name: text('新地点','New place'), description:'', geometry:{type:'Point',coordinates:position}, style:{color:selectedLayer.style.color || '#1a73e8'}, layerId:selectedLayer.id });
    setActiveTool('pan'); setContextMenu(null);
  };
  const applyLayerStyle = async (style, applyToFeatures) => {
    const layer = layerStyleTarget;
    await performEdit('Layer style', (expectedFingerprint) => api.updateLayerStyle(layer.id, { style, applyToFeatures, expectedVersion: layer.version, expectedFingerprint }));
    setLayerStyleTarget(null);
  };

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedLayer) return;
    try {
      setSaving(true);
      const features = await parseImportFile(file);
      if (!features.length) throw new Error('文件中没有可识别的坐标或 GeoJSON 要素');
      await performEdit('Import features', (expectedFingerprint) => api.importFeatures(selectedLayer.id, { fileName: file.name, format: file.name.split('.').pop(), features, expectedFingerprint }));
      setToast(`已导入 ${features.length} 个要素`);
    } catch (requestError) { setSaving(false); setToast(requestError.message); }
  };

  const generateShare = async () => setShare(await api.share(mapId, 'view'));

  const toolInstruction = {
    marker: text('点击地图放置标记', 'Click the map to add a place'),
    line: text('逐点点击绘线，双击结束', 'Click to draw a line; double-click to finish'),
    polygon: text('逐点绘制，点击起点自动闭合', 'Add vertices, then click the start to close'),
    rectangle: text('按住鼠标拖拽绘制矩形，松开完成', 'Drag to draw a rectangle; release to finish'),
    circle: text('从圆心按住拖拽，松开完成圆形', 'Drag from the center; release to finish the circle'),

    measure: text('逐点测量，双击结束', 'Click to measure; double-click to finish'),
  }[activeTool];
  const canFinishDraft = ['line', 'measure'].includes(activeTool)
    ? (activeTool === 'measure' ? measurementPoints.length : draftPoints.length) >= 2
    : activeTool === 'polygon' && draftPoints.length >= 3;

  if (loading) return <div className="full-loading"><span className="brand-mark"><i /><i /><i /></span><p>{t('common.loading')}</p></div>;
  if (error || !mapData) return <div className="full-error"><CircleHelp size={38} /><h1>{t('editor.mapDeleted')}</h1><p>{error}</p><button className="primary-button" onClick={() => navigate('/')}>{t('editor.backLibrary')}</button></div>;

  const activeBaseMapKey = normalizeBaseMapKey(mapData.base_map);
  const previewMode = new URLSearchParams(window.location.search).get('preview') === '1';
  const draftFeature = featureDialog && !featureDialog.id ? featureDialog : null;
  const draftPoint = draftFeature?.geometry?.type === 'Point' ? draftFeature : null;
  const selectedCard = selectedFeatureContext && editingFeatureId !== selectedFeatureId ? (
    <FeatureCard
      key={selectedFeatureId}
      feature={selectedFeatureContext.feature}
      layer={selectedFeatureContext.layer}
      lang={lang}
      canEdit={canEdit}
      busy={editorHistory.busy}
      onClose={() => setSelectedFeatureId(null)}
      onCopyCoordinates={() => copyFeatureCoordinates(selectedFeatureContext.feature)}
      onStyle={(color) => applyCardStyle(selectedFeatureContext.feature, color)}
      onStylePreview={(style) => {
        const featureId = selectedFeatureContext.feature.id;
        setFeatureStylePreview((current) => style ? { featureId, style } : current?.featureId === featureId ? null : current);
      }}
      onSave={(changes) => saveCardDetails(selectedFeatureContext.feature, changes)}
      onMedia={() => requestQuickMedia(selectedFeatureContext.feature)}
      onAdjust={() => setEditingFeatureId(selectedFeatureId)}
      onRoute={() => selectedFeatureContext.feature.style?.routeData
        ? openDirections({ savedFeature: selectedFeatureContext.feature, layerId: selectedFeatureContext.layer.id, featureId: selectedFeatureId })
        : startRouteFromFeature(selectedFeatureContext.feature, selectedFeatureContext.layer)}
      onDelete={() => deleteFeatureFromCard(selectedFeatureContext.feature)}
    />
  ) : null;
  const selectedPositions = geometryCoordinates(selectedFeatureContext?.feature.geometry);
  const selectedPopupPosition = selectedFeatureContext?.feature.type === 'Point' ? selectedPositions[0]
    : featureClickPosition?.featureId === selectedFeatureId ? featureClickPosition.position
      : selectedPositions[Math.floor(selectedPositions.length / 2)];
  const activeCandidate = placeSearch.selectedPlace;
  const mapPopup = isMobile ? null : draftFeature ? {
    position: geometryCoordinates(draftFeature.geometry)[0],
    content: <DraftFeatureCard key={JSON.stringify(draftFeature.geometry)} feature={draftFeature} onSave={saveFeatureDialog} onCancel={closeFeatureDialog} />,
  } : activeCandidate?.position && placeSearch.mode === 'detail' ? {
    position: activeCandidate.position,
    content: <SearchPlaceCard search={searchPanelState} onAdd={addSearchResult} onDirections={(place) => openDirections({ to: place })} onClose={backToSearchResults} canAdd={Boolean(canEdit && selectedLayer)} layerName={selectedLayer?.name} />,
  } : selectedCard && selectedPopupPosition ? {
    position: selectedPopupPosition,
    content: selectedCard,
  } : null;

  const visibleSearchPlaces = activeCandidate?.position && !searchResults.some((place) => place.id === activeCandidate.id) ? [...searchResults, activeCandidate] : searchResults;
  const searchCandidates = visibleSearchPlaces.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    position: candidate.position,
    index: candidate.index,
    active: candidate.id === activeCandidate?.id,
  }));

  const saveDefaultView = () => {
    const center = mapRef.current?.getCenter();
    if (!center) return;
    updateMap({ center_lat: center.lat, center_lng: center.lng, zoom: mapRef.current.getZoom() });
    setMoreMenu(false);
  };

  const locateUser = () => {
    if (!navigator.geolocation) {
      setToast('当前浏览器不支持定位。');
      return;
    }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      mapRef.current?.setView([coords.longitude, coords.latitude], 16);
    }, (locationError) => setToast(locationError.message || '无法获取当前位置。'));
  };

  const routeEditor = <div ref={routeEditorRef} className="route-edit-slot"><DirectionsPanel directions={directions} lang={lang} canSave={canEdit && !editorHistory.busy} embedded onClose={directions.close} /></div>;

  if (previewMode) return <PreviewEditorMap mapData={mapData} onExit={() => { window.history.replaceState({}, '', `/maps/${mapId}`); window.dispatchEvent(new PopStateEvent('popstate')); }} />;

  return (
    <main className="editor-page">
      <MobileSheet className={sidebarCollapsed ? 'collapsed' : ''} state={sheetState} onStateChange={setSheetState} label={t('editor.layerPanel')} lang={lang} onClose={() => setSheetState('collapsed')}>
        <section className="map-meta-panel">
          <div className="editor-title-row">
            <input readOnly={!canEdit} className="map-title-input" value={mapData.name} onChange={(event) => setMapData({ ...mapData, name: event.target.value })} onBlur={(event) => updateMap({ name: event.target.value })} aria-label={t('editor.mapTitle')} />
            <div className="map-menu-anchor" data-map-menu-root>
              <button className="icon-button" onClick={() => setMoreMenu((value) => !value)} aria-label={t('editor.mapMenu')}><MoreVertical size={20} /></button>
              {moreMenu ? <div className="popup-menu map-more-menu">
                <button onClick={() => navigate('/')}><ArrowLeft size={16} /> {t('editor.backLibrary')}</button>
                <button onClick={() => navigate('/admin')}><Database size={16} /> {t('editor.dbAdmin')}</button>
                <button onClick={() => { exportKml(mapData); setMoreMenu(false); }}><Download size={16} /> {t('editor.exportKml')}</button>
                <button onClick={() => { exportGeoJson(mapData); setMoreMenu(false); }}><Database size={16} /> {t('editor.exportGeoJson')}</button>
                <button aria-pressed={trafficVisible} onClick={() => { setTrafficVisible((value) => !value); setMoreMenu(false); }}><Car size={16} /> {text('实时路况', 'Traffic')}{trafficVisible ? <Check size={15} /> : null}</button>
                <button disabled={!canEdit} onClick={saveDefaultView}><LocateFixed size={16} /> {t('editor.setDefaultView')}</button>
              </div> : null}
            </div>
          </div>
          <button className="sidebar-collapse-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? t('editor.expandPanel') : t('editor.collapsePanel')} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? t('editor.expandPanel') : t('editor.collapsePanel')}>{sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}</button>
          <textarea readOnly={!canEdit} className="map-description-input" value={mapData.description} onChange={(event) => setMapData({ ...mapData, description: event.target.value })} onBlur={(event) => updateMap({ description: event.target.value })} aria-label={t('editor.mapDescription')} placeholder={canEdit ? text('添加地图说明', 'Add a description') : ''} rows="1" />
          <p className="save-status" role="status">
            <span>{text('上次编辑', 'Last edited')} {formatDate(mapData.updated_at)}</span>
            <span className="map-save-indicator" title={`${canEdit ? ((saving || editorHistory.busy) ? t('editor.saving') : t('editor.allSaved')) : t('editor.readOnly')}${realtimeStatus === 'joined' || realtimeStatus === 'connected' ? ` · ${t('editor.realtimeOn')}` : realtimeStatus === 'reconnecting' ? ` · ${t('editor.reconnecting')}` : ''}`}>
              {(saving || editorHistory.busy) ? <LoaderCircle size={17} className="map-save-spinner" /> : canEdit ? <Check size={17} /> : <Eye size={17} />}
              <span className="visually-hidden">{canEdit ? ((saving || editorHistory.busy) ? t('editor.saving') : t('editor.allSaved')) : t('editor.readOnly')}</span>
            </span>
          </p>
        </section>
        <div className="sidebar-primary-actions">
          <button onClick={addLayer} disabled={!canEdit || editorHistory.busy || Boolean(draftFeature)}><Layers size={16} /> {t('editor.addLayer')}</button>
          <button onClick={() => setShareDialog(true)}><Share2 size={16} /> {t('editor.share')}</button>
          <button onClick={() => { window.history.pushState({}, '', `/maps/${mapId}?preview=1`); window.location.reload(); }}><Eye size={16} /> {t('editor.preview')}</button>
        </div>
        {isMobile && placeSearch.mode ? <SearchResultsPanel search={searchPanelState} onDirections={(place) => openDirections({ to: place })} onAdd={addSearchResult} onClose={placeSearch.clear} onReturnToLayers={placeSearch.clear} canAdd={Boolean(canEdit && selectedLayer)} layerName={selectedLayer?.name} compact /> : null}
        {isMobile && draftFeature ? <DraftFeatureCard key={JSON.stringify(draftFeature.geometry)} feature={draftFeature} onSave={saveFeatureDialog} onCancel={closeFeatureDialog} /> : null}
        {isMobile && selectedCard ? selectedCard : null}
        {directions.visible && !mapData.layers.some((layer) => layer.id === directions.target?.layerId) ? <section className="pending-directions-layer">
          <header><Route size={17} /><b>{text('无标题路线', 'Untitled directions')}</b><button className="icon-button" onClick={directions.close} aria-label={text('关闭路线图层', 'Close directions layer')}><X size={16} /></button></header>
          {routeEditor}
        </section> : null}
        <LayerPanel layers={mapData.layers} selectedLayerId={selectedLayerId} selectedFeatureId={selectedFeatureId} expandedLayers={expandedLayers} onToggleExpanded={(id) => setExpandedLayers((current) => ({...current,[id]:!current[id]}))} onSelectLayer={setSelectedLayerId} onSelectFeature={selectFeature} onToggleLayer={toggleLayer} onRenameLayer={renameLayer} onDeleteLayer={removeLayer} onImport={(layer) => {setSelectedLayerId(layer.id); importRef.current?.click();}} onTable={setTableLayer} onExport={exportCsv} onFeatureStyle={(feature,layer) => setStyleTarget(styleTarget?.feature?.id === feature.id ? null : {layerId:layer.id,feature})} onLayerStyle={setLayerStyleTarget} onEditFeature={(feature,layer) => setFeatureDialog({...feature,layerId:layer.id})} onReorderLayers={(layerIds) => performEdit('Reorder layers',(expectedFingerprint) => api.reorderLayers(mapId,{layerIds,expectedFingerprint,expectedVersion:mapDataLatestRef.current.version}))} onReorderFeatures={(layerId,featureIds) => performEdit('Reorder features',(expectedFingerprint) => api.reorderFeatures(mapId,{layerId,featureIds,expectedFingerprint,expectedVersion:mapDataLatestRef.current.version}))} onMoveFeature={(featureId,layerId,index) => performEdit('Move feature to layer',(expectedFingerprint) => {const feature=mapDataLatestRef.current.layers.flatMap((layer)=>layer.features).find((item)=>item.id===featureId);return api.moveFeature(featureId,{layerId,index,expectedFingerprint,expectedVersion:feature?.version});})} canEdit={canEdit && !editorHistory.busy && !draftFeature} peers={peers} user={user} t={t} lang={lang} renderDirections={(layer) => directions.visible && layer.id === directions.target?.layerId ? routeEditor : null} onEditDirections={(layer, feature) => openDirections({ savedFeature: feature, layerId: layer.id, featureId: feature.id })} renderFeatureStyle={(feature, layer, anchorRef) => styleTarget?.feature?.id === feature.id ? <MarkerStylePopover key={feature.id} anchorRef={anchorRef} name={feature.name} color={feature.style?.color || layer.style?.color || '#1a73e8'} icon={feature.style?.icon || layer.style?.icon} inheritIcon={!feature.style?.icon} showIcons={feature.type === 'Point'} featureType={feature.type} featureStyle={feature.style} layerStyle={layer.style} busy={editorHistory.busy} lang={lang} onSave={(style) => applyStyle(feature, style, true)} onPreview={(style) => setFeatureStylePreview((current) => style ? { featureId: feature.id, style } : current?.featureId === feature.id ? null : current)} onClose={() => setStyleTarget((current) => current?.feature?.id === feature.id ? null : current)} /> : null} />
      </MobileSheet>

      <section className="map-workspace">
        <BaseMapPicker value={activeBaseMapKey} open={basePicker} onToggle={() => setBasePicker((value) => !value)} onChange={(key) => { if (canEdit) updateMap({ base_map: key }); else setMapData((current) => ({ ...current, base_map: key })); setBasePicker(false); }} lang={lang} />
        <button className="mobile-panel-toggle" onClick={() => setSheetState((current) => current === 'collapsed' ? 'half' : 'collapsed')} aria-label={t('editor.layerPanel')}><Menu size={20} /></button>
        <form className="map-search-bar" onSubmit={searchPlaces}>
          <Search className="search-leading-icon" size={20} />
          <input ref={searchInputRef} value={searchQuery} onChange={(event) => { setSelectedFeatureId(null); setSearchQuery(event.target.value); }} onFocus={() => setSuggestionsOpen(true)} onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)} onKeyDown={handleSearchKey} placeholder={t('editor.searchPlace')} aria-label={t('editor.searchPlace')} role="combobox" aria-autocomplete="list" aria-expanded={suggestionsOpen && searchSuggestions.length > 0} aria-controls="map-search-suggestions" aria-activedescendant={suggestionIndex >= 0 && suggestionsOpen ? `map-suggestion-${suggestionIndex}` : undefined} />
          {searchQuery ? <button type="button" className="icon-button" onClick={placeSearch.clear} aria-label={t('editor.clearSearch')}><X size={18} /></button> : null}
          <button className="search-submit" aria-label={t('editor.search')} disabled={searching}><Search size={19} /></button>
        </form>
        <DrawingToolbar activeTool={directions.visible ? 'route' : activeTool} canEdit={Boolean(canEdit && selectedLayer && !editorHistory.busy && !draftFeature)} onTool={changeTool} canUndo={canUndo && !editorHistory.busy && !draftFeature} canRedo={canRedo && !editorHistory.busy && !draftFeature} onUndo={undo} onRedo={redo} />
        {!isMobile && (placeSearch.mode === 'results' || (placeSearch.mode === 'detail' && !activeCandidate?.position)) ? <div className="map-search-results-popover"><SearchResultsPanel search={searchPanelState} onDirections={(place) => openDirections({ to: place })} onAdd={addSearchResult} onClose={placeSearch.clear} canAdd={Boolean(canEdit && selectedLayer)} layerName={selectedLayer?.name} compact /></div> : null}
        {suggestionsOpen && searchSuggestions.length ? <div id="map-search-suggestions" className="map-search-suggestions" role="listbox" aria-label={text('地点联想', 'Suggested places')}>{searchSuggestions.map((suggestion, index) => <button key={suggestion.id} type="button" id={`map-suggestion-${index}`} role="option" aria-selected={index === suggestionIndex} className={index === suggestionIndex ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSuggestion(suggestion)}><MapPin size={18} /><span><b>{suggestion.name}</b><small>{suggestion.address || suggestion.city}</small></span></button>)}</div> : null}
        {toolInstruction ? <div className="tool-instruction">{(activeTool === 'measure' ? measurementPoints.length : draftPoints.length) ? `${activeTool === 'measure' ? measurementPoints.length : draftPoints.length} ${text('个顶点', 'vertices')} · ` : ''}{toolInstruction}{canFinishDraft ? <button className="finish-drawing-button" onClick={() => finishDraft(activeTool, activeTool === 'measure' ? measurementPoints : draftPoints).catch(() => {})} aria-label={text('完成绘制', 'Finish drawing')}>{text('完成', 'Finish')}</button> : null}<button onClick={cancelDrawing} aria-label={text('取消绘制', 'Cancel drawing')}><X size={15} /></button></div> : null}
        {canEdit && selectedFeatureContext && editingFeatureId === selectedFeatureId && activeTool === 'pan' ? <div className="selected-edit-tip">{selectedFeatureContext.feature.type === 'Point' ? text('拖动标记以调整位置', 'Drag the marker to move this place') : text('拖动顶点以调整形状', 'Drag a vertex to reshape this feature')}<button type="button" onClick={() => setEditingFeatureId(null)}>{text('完成调整', 'Done adjusting')}</button></div> : null}
        <span className="visually-hidden" role="status" data-testid="draft-status">{draftPoints.length ? text(`已放置 ${draftPoints.length} 个绘图顶点`, `${draftPoints.length} drawing vertices placed`) : ''}</span>
        <AmapMap
          activeTool={activeTool}
          className="editor-map"
          draftMarker={draftPoint ? { position: draftPoint.geometry.coordinates, color: draftPoint.style?.color, icon: draftPoint.style?.icon || selectedLayer?.style?.icon } : null}
          draftFeature={draftFeature && !draftPoint ? draftFeature : null}
          draftPoints={activeTool === 'measure' ? [] : draftPoints}
          hoverPoint={hoverPoint}
          mapData={visibleMapData}
          editable={canEdit && !editorHistory.busy}
          editingFeatureId={selectedFeatureContext ? editingFeatureId : null}
          trafficVisible={trafficVisible}
          measurementPoints={measurementPoints}
          measurementClosed={measurementClosed}
          onMeasurementChange={(points) => updateMeasurement(points)}
          onContextMenu={onMapContextMenu}
          onPoiSelect={(poi) => openPlaceDetail({...poi,source:'AMap'})}
          poiEnabled={activeTool === 'pan' && !directions.visible && !draftFeature}
          onViewChange={(view) => { if(view.source === 'user') placeSearch.setViewChanged(); }}
          routeAlternatives={directions.alternatives.map((route)=>({...route,selected:route.id===directions.selectedAlternativeId}))}
          routePlan={directions.selectedAlternative && directions.stops.every((stop)=>stop.position) ? {...directions.selectedAlternative,stops:directions.stops} : null}
          onRouteSelect={directions.selectAlternative}
          onRouteWaypoint={({position,segmentIndex,stopIndex}) => directions.addWaypoint(position,segmentIndex,stopIndex)}
          onSavedRouteWaypoint={replanSavedRoute}
          markerColor={selectedLayer?.style.color || '#1a73e8'}
          markerIcon={selectedLayer?.style.icon || 'pin'}
          onCandidateClick={openPlaceDetail}
          onFeatureSelect={(feature, layer, position) => {
            const coordinates = position ? [position.lng, position.lat] : geometryCoordinates(feature.geometry)[0];
            if (coordinates && directions.visible && directions.pickPosition(coordinates)) return;
            if (activeTool !== 'pan') {
              if (coordinates) handleMapClick({ lng: coordinates[0], lat: coordinates[1] }).catch(() => {});
              return;
            }
            if (editingFeatureId === feature.id) return;
            selectFeature(feature, layer, false, false, position);
          }}
          onFeatureGeometryChange={(feature, geometry) => persistGeometry(feature, geometry).catch(() => {})}
          onMapClick={(point,event)=>handleMapClick(point,event).catch(()=>{})}
          onMapDoubleClick={(point)=>handleDoubleClick(point).catch(()=>{})}
          onPolygonClose={() => finishDraft('polygon', draftPoints).catch(() => {})}
          onShapeDrag={handleShapeDrag}
          onMouseMove={(point) => {
            const position = point ? [point.lng, point.lat] : null;
            setHoverPoint(activeTool === 'pan' || !position ? null : nearPolygonStart(position) ? draftPoints[0] : position);
          }}
          onMoveEnd={(center) => { currentCenterRef.current = center; }}
          onPopupClose={() => { if (placeSearch.mode === 'detail') backToSearchResults(); else setSelectedFeatureId(null); }}
          onReady={(controller) => { mapRef.current = controller; currentCenterRef.current = controller.getCenter(); }}
          onZoomStateChange={setZoomState}
          popup={mapPopup}
          searchCandidates={searchCandidates}
          selectedFeatureId={selectedFeatureId}
        />
        <div className="map-account-actions">
          <LanguageSwitch className="editor-lang-switch" />
          <div className="presence-avatars" aria-label={t('editor.collaborators')}>
            {peers.filter((peer) => peer.userId !== user?.id).map((peer) => (
              <span
                key={peer.userId}
                className="presence-avatar"
                title={peer.name}
              >
                {(peer.name || '?').slice(0, 1)}
              </span>
            ))}
          </div>
          <button className="apps-grid" aria-label={t('editor.apps')}><span /><span /><span /><span /><span /><span /><span /><span /><span /></button>
          <button className="editor-avatar" onClick={() => navigate('/me')} title={user?.displayName || user?.name || ''}>
            {(user?.displayName || user?.name || '?').slice(0, 1)}
          </button>
        </div>
        {measurementPoints.length ? <MeasurePanel points={measurementPoints} distance={measurementDistance(measurementPoints,measurementClosed)} area={measurementClosed ? measurementArea(measurementPoints) : 0} closed={measurementClosed} onClear={()=>updateMeasurement([],false)} onRemoveLast={()=>updateMeasurement((points)=>points.slice(0,-1))} onClose={()=>{updateMeasurement([],false);setActiveTool('pan');}} onToggleClosed={()=>updateMeasurement(measurementPoints,!measurementClosed)} lang={lang} /> : null}
        {contextMenu ? <ContextMenu point={contextPosition} screen={contextMenu.screen} onHere={()=>{const position=contextPosition;setContextMenu(null);directions.close();placeSearch.reverseGeocodeDetail(position);}} onFrom={()=>{openDirections({from:{position:contextPosition}});setContextMenu(null);}} onTo={()=>{openDirections({to:{position:contextPosition}});setContextMenu(null);}} onMeasure={()=>startMeasurement(contextPosition)} onAddMarker={()=>addMarkerAt(contextPosition)} onClose={()=>setContextMenu(null)} canEdit={Boolean(canEdit&&selectedLayer)} lang={lang} /> : null}
        <div className="map-control-stack"><button onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.querySelector('.editor-page').requestFullscreen) await document.querySelector('.editor-page').requestFullscreen(); else setToast(text('当前浏览器不支持全屏。', 'Fullscreen is unavailable.')); } catch { setToast(text('无法进入全屏。', 'Unable to enter fullscreen.')); } }} aria-label={text('全屏', 'Fullscreen')}>{fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}</button><span /><button onClick={locateUser} aria-label={t('editor.locate')}><LocateFixed size={19} /></button><span /><button disabled={zoomState.zoom === null || zoomState.zoom >= zoomState.maxZoom} onClick={() => mapRef.current?.zoomIn()} aria-label={t('editor.zoomIn')}><ZoomIn size={19} /></button><button disabled={zoomState.zoom === null || zoomState.zoom <= zoomState.minZoom} onClick={() => mapRef.current?.zoomOut()} aria-label={t('editor.zoomOut')}><ZoomOut size={19} /></button></div>
      </section>

      <input ref={importRef} type="file" className="visually-hidden" accept=".csv,.tsv,.geojson,.json,.kml,.gpx" onChange={importFile} />
      <input ref={quickMediaInputRef} type="file" className="visually-hidden" accept={MEDIA_ACCEPT} multiple onChange={handleQuickMediaSelection} aria-label="上传地点图片或视频" />
      {featureDialog && !draftFeature ? <FeatureDialog feature={featureDialog} layers={contentLayers} defaultLayerId={selectedLayer?.id} onSave={saveFeatureDialog} onUploadAttachments={uploadFeatureAttachments} onDeleteAttachment={deleteFeatureAttachment} onDelete={(feature) => { if (window.confirm(`删除“${feature.name}”？`)) { deleteFeature(feature); setFeatureDialog(null); } }} onClose={() => setFeatureDialog(null)} /> : null}
      {layerStyleTarget ? <LayerStyleDialog layer={layerStyleTarget} onSave={applyLayerStyle} onClose={()=>setLayerStyleTarget(null)} lang={lang} /> : null}
      {shortcutDialog ? <Modal title={text('键盘快捷键','Keyboard shortcuts')} onClose={()=>setShortcutDialog(false)}><div className="editor-shortcuts"><p>Ctrl / ⌘ + Z — {text('撤销','Undo')}</p><p>Ctrl / ⌘ + Shift + Z / Ctrl + Y — {text('重做','Redo')}</p><p>Backspace / Delete — {text('移除最后顶点或删除选中要素','Remove last point or selected feature')}</p><p>Enter — {text('完成绘制','Finish drawing')}</p><p>Escape — {text('关闭菜单或取消当前工具','Close menu or cancel current tool')}</p><p>H / M / L / P / R / D — {text('平移 / 标记 / 线 / 区域 / 路线 / 测距','Pan / Marker / Line / Shape / Directions / Measure')}</p><p>Ctrl / ⌘ + K — {text('搜索','Search')}</p><p>Alt + ↑ / ↓ — {text('在图层排序按钮上移动项目','Move focused layer or feature')}</p></div></Modal> : null}
      {shareDialog ? <ShareDialog map={mapData} share={share} onGenerate={generateShare} onClose={() => setShareDialog(false)} /> : null}
      {layerNameDialog ? <LayerNameDialog layer={layerNameDialog.layer} onSave={saveLayerName} onClose={() => setLayerNameDialog(null)} /> : null}
      {tableLayer ? <DataTableDialog key={tableLayer.id} canEdit={canEdit} busy={editorHistory.busy} layer={mapData.layers.find((layer) => layer.id === tableLayer.id) || tableLayer} onSave={saveTableCell} onAddColumn={(name) => addTableColumn(tableLayer.id, name)} onDelete={(feature) => deleteFeature(feature)} onClose={() => setTableLayer(null)} /> : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </main>
  );
}

function PreviewEditorMap({ mapData, onExit }) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedContext, setSelectedContext] = useState(null);
  const { lang } = useI18n();
  const selectedPositions = geometryCoordinates(selectedContext?.feature.geometry);
  const popup = selectedContext ? {
    position: selectedContext.position || selectedPositions[Math.floor(selectedPositions.length / 2)],
    content: <FeatureCard key={selectedContext.feature.id} feature={selectedContext.feature} layer={selectedContext.layer} lang={lang} onClose={() => setSelectedContext(null)} onCopyCoordinates={() => navigator.clipboard.writeText(selectedContext.feature.geometry.coordinates.slice().reverse().map((value) => Number(value).toFixed(5)).join(', '))} />,
  } : null;
  return (
    <main className="preview-editor-page">
      <button className="preview-exit" onClick={onExit}><ArrowLeft size={17} /> 返回编辑器</button>
      <aside className={panelOpen ? 'public-side-panel' : 'public-side-panel collapsed'}>
        <header><button className="icon-button" onClick={() => setPanelOpen((value) => !value)}><Menu size={20} /></button><div><h1>{mapData.name}</h1><p>{mapData.description}</p></div></header>
        {mapData.layers.map((layer) => <section key={layer.id}><h2><span style={{ background: layer.style.color || '#1a73e8' }} />{layer.name}</h2>{layer.features.slice(0, 10).map((feature) => <p key={feature.id}>{feature.name}</p>)}</section>)}
      </aside>
      <AmapMap
        className="editor-map"
        mapData={mapData}
        onFeatureSelect={(feature, layer, point) => setSelectedContext({ feature, layer, position: point ? [point.lng, point.lat] : null })}
        onMapClick={() => setSelectedContext(null)}
        popup={popup}
        selectedFeatureId={selectedContext?.feature.id || null}
        showZoomControls
      />
    </main>
  );
}
