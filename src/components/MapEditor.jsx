import UserAvatar from './UserAvatar.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Camera, ChevronDown, ChevronRight, CircleHelp, Database, Download, Eye, GitFork,
  GripVertical, Hand, Layers, Link2, List, LocateFixed, MapPin, Menu, MoreVertical,
  MousePointer2, PaintBucket, Palette, Pencil, Plus, Redo2, Route, Ruler, Search, Share2,
  Shapes, Table2, Trash2, Undo2, Upload, Video, X, ZoomIn, ZoomOut, Maximize, Minimize, Car, Bike, Footprints,
} from 'lucide-react';
import { api } from '../api.js';
import { navigate } from '../App.jsx';
import { useAuth } from '../auth.jsx';
import { LanguageSwitch, useI18n } from '../i18n/index.jsx';
import { applyMapOp, connectMapRoom } from '../realtime.js';
import { AMAP_CONFIGURED } from '../amap.js';
import AmapMap, { AMAP_MAX_ZOOM, AMAP_MIN_ZOOM } from './AmapMap.jsx';
import SharedMapViewer from './SharedMapViewer.jsx';
import StoryPresentation from './StoryPresentation.jsx';
import { orderStoryRecords } from './shared-map-utils.js';
import FeatureMediaGallery, {
  formatFileSize, MAX_ATTACHMENTS_PER_FEATURE, MAX_FILES_PER_UPLOAD, MEDIA_ACCEPT, validateMediaSelection,
} from './FeatureMediaGallery.jsx';
import {
  AMAP_PROVIDER, exportCsv, exportGeoJson, exportKml,
  formatDate, normalizeBaseMapKey, parseImportFile,
} from '../utils.js';
import './editor.css';
import DirectionsPanel from './editor/DirectionsPanel.jsx';
import SearchResultsPanel from './editor/SearchResultsPanel.jsx';
import SearchPlaceCard from './editor/SearchPlaceCard.jsx';
import BaseMapPicker from './editor/BaseMapPicker.jsx';
import LayerPanel from './editor/LayerPanel.jsx';
import LayerStyleDialog from './editor/LayerStyleDialog.jsx';
import MobileSheet from './editor/MobileSheet.jsx';
import MeasurePanel from './editor/MeasurePanel.jsx';
import ContextMenu from './editor/ContextMenu.jsx';
import useDirections from './editor/useDirections.js';
import usePlaceSearch from './editor/usePlaceSearch.js';
import useEditorHistory from './editor/useEditorHistory.js';
import { measurementDistance, measurementArea } from './editor/measurement.js';
import './editor/editor-enhancements.css';
import './editor/my-maps-editor.css';

const COLORS = ['#1a73e8', '#00897b', '#8e24aa', '#e85d4a', '#f9ab00', '#d93025', '#5f6368', '#039be5'];

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

function Modal({ title, children, onClose, size = 'normal' }) {
  const { t } = useI18n();
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal-dialog ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label={t('common.close')}><X size={20} /></button></header>
        {children}
      </section>
    </div>
  );
}

function FeatureDialog({ feature, layers, defaultLayerId, onSave, onDelete, onUploadAttachments, onDeleteAttachment, onClose }) {
  const [name, setName] = useState(feature?.name || '新地点');
  const [description, setDescription] = useState(feature?.description || '');
  const [layerId, setLayerId] = useState(feature?.layerId || defaultLayerId);
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
        onSave({ ...feature, name: name.trim() || '无标题要素', description, layerId: Number(layerId), style: { ...(feature?.style || {}), color, fillColor: color }, pendingFiles });
      }}>
        <label>名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>说明<textarea rows="3" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label>保存到图层<select value={layerId} onChange={(event) => setLayerId(event.target.value)}>{layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>
        <fieldset className="color-field"><legend>颜色</legend><div className="color-row">{COLORS.map((item) => <button key={item} type="button" className={color === item ? 'color-chip active' : 'color-chip'} style={{ '--color': item }} onClick={() => setColor(item)} aria-label={`颜色 ${item}`} />)}</div></fieldset>
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

function DataTableDialog({ layer, canEdit, onEdit, onDelete, onClose }) {
  return (
    <Modal title={`${layer.name} · 数据表`} onClose={onClose} size="wide">
      <div className="data-table-wrap">
        <table className="data-table"><thead><tr><th>名称</th><th>类型</th><th>说明</th><th>坐标/节点</th>{canEdit ? <th>操作</th> : null}</tr></thead>
          <tbody>{layer.features.map((feature) => <tr key={feature.id}><td><span className="table-color-dot" style={{ background: feature.style.color || '#1a73e8' }} />{feature.name}</td><td>{feature.type}</td><td>{feature.description || '—'}</td><td>{feature.type === 'Point' ? feature.geometry.coordinates.map((value) => Number(value).toFixed(4)).join(', ') : `${feature.geometry.coordinates.flat(2).length / 2} 个节点`}</td>{canEdit ? <td><button className="table-action" onClick={() => onEdit(feature)}>编辑</button><button className="table-action danger" onClick={() => onDelete(feature)}>删除</button></td> : null}</tr>)}</tbody>
        </table>
        {layer.features.length === 0 ? <div className="table-empty">此图层还没有数据。</div> : null}
      </div>
      <footer className="modal-footer"><span>{layer.features.length} 个要素</span><div><button className="secondary-button" onClick={() => exportCsv(layer)}>导出 CSV</button><button className="primary-button" onClick={onClose}>完成</button></div></footer>
    </Modal>
  );
}

function DrawingToolbar({ activeTool, onTool, canUndo, canRedo, onUndo, onRedo, canEdit = true }) {
  const { t } = useI18n();
  const tools = [
    ['pan', t('editor.toolPan'), Hand],
    ['marker', t('editor.toolMarker'), MapPin],
    ['line', t('editor.toolLine'), Route],
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

function DraftPointCard({ feature, onSave, onCancel }) {
  const [name, setName] = useState(feature.name || '新地点');
  const [description, setDescription] = useState(feature.description || '');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [mediaError, setMediaError] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const mediaInputRef = useRef(null);

  const handleMediaSelection = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selectedFiles.length) return;
    try {
      setMediaError('');
      const files = validateMediaSelection(selectedFiles, pendingFiles.length);
      if (pendingFiles.length + files.length > MAX_FILES_PER_UPLOAD) {
        throw new Error(`新地点保存前最多选择 ${MAX_FILES_PER_UPLOAD} 个文件`);
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
      name: name.trim() || '无标题地点',
      description,
      pendingFiles,
    });
    if (!saved) setSaveBusy(false);
  };

  return (
    <article
      className="my-maps-place-card draft-point-card"
      aria-label="添加地点"
      onClickCapture={(event) => { event.nativeEvent.openMyMapCardInteraction = true; }}
    >
      <form className="place-card-edit-form" onSubmit={submit}>
        <div className="place-card-edit-fields">
          <input autoFocus value={name} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setName(event.target.value)} aria-label="地点名称" />
          <textarea rows="2" value={description} onChange={(event) => setDescription(event.target.value)} aria-label="地点说明" placeholder="添加说明" />
          {mediaError ? <p role="alert">{mediaError}</p> : null}
        </div>
        <button type="button" className="place-card-close" onClick={onCancel} aria-label="取消添加地点" title="取消"><X size={21} /></button>
        {pendingFiles.length ? (
          <div className="draft-point-pending" aria-label="待上传资料">
            {pendingFiles.map((file) => (
              <span key={`${file.name}-${file.size}-${file.lastModified}`}>
                <span title={file.name}>{file.name}</span>
                <button type="button" onClick={() => setPendingFiles((files) => files.filter((item) => item !== file))} aria-label={`移除待上传文件 ${file.name}`}><X size={13} /></button>
              </span>
            ))}
          </div>
        ) : null}
        <footer className="draft-point-actions">
          <button type="button" className="draft-point-media-button" onClick={() => mediaInputRef.current?.click()} disabled={pendingFiles.length >= MAX_FILES_PER_UPLOAD}>
            <Camera size={17} /><span>{pendingFiles.length ? `${pendingFiles.length} 个资料` : '添加图片或视频'}</span>
          </button>
          <div>
            <button type="button" onClick={onCancel}>取消</button>
            <button type="submit" className="save" disabled={saveBusy}>{saveBusy ? '保存中…' : '保存'}</button>
          </div>
        </footer>
        <input ref={mediaInputRef} type="file" className="visually-hidden" accept={MEDIA_ACCEPT} multiple onChange={handleMediaSelection} />
      </form>
    </article>
  );
}

function FeatureStylePopover({ feature, layers, defaultLayerId, attachments, onSave, onDelete, onUploadAttachments, onDeleteAttachment }) {
  const [name, setName] = useState(feature.name || '');
  const [description, setDescription] = useState(feature.description || '');
  const [layerId, setLayerId] = useState(feature.layerId || defaultLayerId);
  const [color, setColor] = useState(feature.style?.color || '#1a73e8');
  const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [error, setError] = useState('');
  const mediaInputRef = useRef(null);

  const currentAttachments = attachments || [];

  const handleMedia = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    try {
      setError('');
      const validated = validateMediaSelection(files, currentAttachments.length);
      if (currentAttachments.length + validated.length > MAX_ATTACHMENTS_PER_FEATURE) {
        throw new Error(`每个地点最多保存 ${MAX_ATTACHMENTS_PER_FEATURE} 个附件`);
      }
      setMediaBusy(true);
      await onUploadAttachments(feature.id, validated);
    } catch (mediaError) {
      setError(mediaError.message);
    } finally {
      setMediaBusy(false);
    }
  };

  const removeAttachment = async (attachment) => {
    if (!window.confirm(`删除附件“${attachment.original_name}”？`)) return;
    try { setError(''); await onDeleteAttachment(attachment.id, feature.id); }
    catch (deleteError) { setError(deleteError.message); }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onSave({ ...feature, name: name.trim() || '无标题要素', description, layerId: Number(layerId), style: { ...(feature.style || {}), color, fillColor: color } });
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    if (!window.confirm(`删除“${feature.name}”？`)) return;
    setBusy(true);
    try { await onDelete(feature); } catch (deleteError) { setError(deleteError.message); } finally { setBusy(false); }
  };

  return (
    <form className="feature-style-popover" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <input className="fsp-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="名称" aria-label="名称" />
      <textarea className="fsp-desc" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="说明" aria-label="说明" />
      <label className="fsp-layer">
        <span>图层</span>
        <select value={layerId} onChange={(event) => setLayerId(event.target.value)} aria-label="保存到图层">
          {layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
        </select>
      </label>
      <div className="fsp-colors" role="group" aria-label="颜色">
        {COLORS.map((item) => (
          <button key={item} type="button" className={color === item ? 'color-chip active' : 'color-chip'} style={{ '--color': item }} onClick={() => setColor(item)} aria-label={`颜色 ${item}`} />
        ))}
      </div>
      <div className="fsp-media">
        <button type="button" className="fsp-media-add" onClick={() => mediaInputRef.current?.click()} disabled={mediaBusy || currentAttachments.length >= MAX_ATTACHMENTS_PER_FEATURE} aria-label="添加图片或视频">
          {mediaBusy ? <span>上传中…</span> : <><Camera size={14} /> 添加</>}
        </button>
        {currentAttachments.map((attachment) => (
          <span key={attachment.id} className="fsp-media-thumb" title={attachment.original_name}>
            {attachment.type === 'video' ? <Video size={16} /> : null}
            <button type="button" onClick={() => removeAttachment(attachment)} aria-label={`删除附件 ${attachment.original_name}`}><X size={12} /></button>
          </span>
        ))}
      </div>
      {error ? <p className="fsp-error" role="alert">{error}</p> : null}
      <input ref={mediaInputRef} type="file" className="visually-hidden" accept={MEDIA_ACCEPT} multiple onChange={handleMedia} />
      <footer className="fsp-actions">
        <button type="button" className="text-button danger" onClick={handleDelete} disabled={busy}><Trash2 size={15} /> 删除</button>
        <button type="submit" className="primary-button" disabled={busy}>{busy ? '保存中…' : '保存'}</button>
      </footer>
    </form>
  );
}

function PlaceFeatureCard({ feature, layer, canEdit, onClose, onCopyCoordinates, onStyle, onSave, onMedia, onRoute, onDelete }) {
  const [styleOpen, setStyleOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(feature.name);
  const [draftDescription, setDraftDescription] = useState(feature.description || '');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const [lng, lat] = feature.geometry.coordinates;
  const coordinates = `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
  const description = feature.description?.trim() || layer.name;
  const currentColor = feature.style.color || layer.style.color || '#1a73e8';

  useEffect(() => {
    if (editing) return;
    setDraftName(feature.name);
    setDraftDescription(feature.description || '');
  }, [editing, feature.description, feature.name]);

  const cancelEditing = () => {
    setDraftName(feature.name);
    setDraftDescription(feature.description || '');
    setEditError('');
    setEditing(false);
  };

  const saveInlineEdit = async (event) => {
    event.preventDefault();
    if (editBusy || !canEdit) return;
    try {
      setEditBusy(true);
      setEditError('');
      await onSave({ name: draftName.trim() || '无标题要素', description: draftDescription });
      setEditing(false);
    } catch (requestError) {
      setEditError(requestError.message);
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <article
      className="my-maps-place-card"
      aria-label={`${feature.name} 地点详情`}
      onClickCapture={(event) => { event.nativeEvent.openMyMapCardInteraction = true; }}
    >
      {editing && canEdit ? (
        <form className="place-card-edit-form" onSubmit={saveInlineEdit}>
          <div className="place-card-edit-fields">
            <input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} aria-label="地点名称" />
            <textarea rows="3" value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} aria-label="地点说明" placeholder="添加说明" />
            {editError ? <p role="alert">{editError}</p> : null}
          </div>
          <button type="button" className="place-card-close" onClick={onClose} aria-label="关闭地点详情" title="关闭"><X size={21} /></button>
          <footer className="place-card-edit-actions">
            <button type="button" onClick={cancelEditing}>取消</button>
            <button type="submit" className="save" disabled={editBusy}>{editBusy ? '保存中…' : '保存'}</button>
          </footer>
        </form>
      ) : (
        <>
          <header className="place-card-header">
            <div>
              <h2>{feature.name}</h2>
              <p>{description}</p>
            </div>
            <button type="button" className="place-card-close" onClick={onClose} aria-label="关闭地点详情" title="关闭"><X size={21} /></button>
          </header>
          <FeatureMediaGallery attachments={feature.attachments} featureName={feature.name} compact />
          <footer className="place-card-footer">
            <button type="button" className="place-card-coordinates" onClick={onCopyCoordinates} aria-label={`复制坐标 ${coordinates}`} title="复制坐标">
              <MapPin size={14} /><span>{coordinates}</span>
            </button>
            <nav className="place-card-actions" aria-label="地点操作">
              {canEdit ? <><button type="button" className={styleOpen ? 'active' : ''} onClick={() => setStyleOpen((open) => !open)} aria-label="设置地点样式" aria-expanded={styleOpen} title="设置样式"><PaintBucket size={18} /></button>
              <button type="button" onClick={() => { setStyleOpen(false); setEditing(true); }} aria-label="编辑地点" title="编辑"><Pencil size={18} /></button>
              <button type="button" onClick={onMedia} aria-label="上传图片或视频" title="添加图片或视频"><Camera size={18} /></button></> : null}
              <button type="button" onClick={onRoute} aria-label="以此地点为路线起点" title="添加路线"><GitFork size={18} /></button>
              {canEdit ? <button type="button" className="danger" onClick={onDelete} aria-label="删除地点" title="删除"><Trash2 size={18} /></button> : null}
            </nav>
            {styleOpen && canEdit ? (
              <div className="place-card-style-picker" role="dialog" aria-label="选择地点颜色">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={currentColor === color ? 'active' : ''}
                    style={{ '--color': color }}
                    onClick={() => { onStyle(color); setStyleOpen(false); }}
                    aria-label={`应用颜色 ${color}`}
                    aria-pressed={currentColor === color}
                  />
                ))}
              </div>
            ) : null}
          </footer>
        </>
      )}
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
  const [expandedLayers, setExpandedLayers] = useState({});
  const [activeTool, setActiveTool] = useState('pan');
  const [draftPoints, setDraftPoints] = useState([]);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [featureDialog, setFeatureDialog] = useState(null);
  const [shareDialog, setShareDialog] = useState(false);
  const [share, setShare] = useState(null);
  const [tableLayer, setTableLayer] = useState(null);
  const [basePicker, setBasePicker] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [layerMenu, setLayerMenu] = useState(null);
  const [styleTarget, setStyleTarget] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [trafficVisible, setTrafficVisible] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [storyDetailId, setStoryDetailId] = useState(null);
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
    if (!isMobile) return;
    if (featureDialog?.geometry?.type === 'Point') setSheetState('half');
    else if (selectedFeatureId !== null) setSheetState((current) => current === 'collapsed' ? current : 'half');
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
      if (document.querySelector('.story-browsing')) return;
      const typing = event.target.closest?.('input,textarea,select,[contenteditable="true"]');
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInputRef.current?.focus(); return; }
      if (typing) return;
      if (modifier && event.key === '/') { event.preventDefault(); setShortcutDialog(true); return; }
      if (featureDialog || shareDialog || tableLayer || layerStyleTarget || shortcutDialog) {
        if (event.key === 'Escape') { setFeatureDialog(null); setShareDialog(false); setTableLayer(null); setLayerStyleTarget(null); setShortcutDialog(false); }
        return;
      }
      if (modifier && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        const redoRequested = event.key.toLowerCase() === 'y' || event.shiftKey;
        if (!editorHistory.busy) { if (redoRequested) redo(); else undo(); }
        return;
      }
      if (event.key === 'Escape') {
        if (contextMenu) { setContextMenu(null); return; }
        if (moreMenu || basePicker || styleTarget) { setMoreMenu(false); setBasePicker(false); setStyleTarget(null); return; }
        if (activeTool !== 'pan') { setActiveTool('pan'); setDraftPoints([]); setHoverPoint(null); return; }
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
        else if (['line','polygon'].includes(activeTool) && draftPoints.length) { event.preventDefault(); undo(); }
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
      if (layerMenu !== null && !target.closest('[data-layer-menu-root]')) setLayerMenu(null);
      if (moreMenu && !target.closest('[data-map-menu-root]')) setMoreMenu(false);
      if (basePicker && !target.closest('[data-base-picker-root]')) setBasePicker(false);
      if (styleTarget && !target.closest('[data-style-popover-root]') && !target.closest('.mini-style-button')) setStyleTarget(null);
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
      if (feature) return { feature, layer };
    }
    return null;
  }, [mapData, selectedFeatureId]);
  const visibleMapData = useMemo(() => {
    if (!mapData || !directions.visible || !directions.selectedAlternative || !directions.target?.featureId) return mapData;
    // The active route preview replaces its saved geometry while being edited.
    return { ...mapData, layers: mapData.layers.map((layer) => ({ ...layer, features: layer.features.filter((feature) => feature.id !== directions.target.featureId) })) };
  }, [mapData, directions.visible, directions.selectedAlternative, directions.target?.featureId]);
  const presenting = (isMobile ? sheetState === 'collapsed' : sidebarCollapsed) && activeTool === 'pan' && !directions.visible && !featureDialog && !placeSearch.mode;
  useEffect(() => { setStoryDetailId(null); }, [presenting]);
  useEffect(() => {
    if (!presenting || !document.querySelector('.editor-page.story-browsing') || activeTool !== 'pan' || directions.visible || featureDialog || placeSearch.mode || !visibleMapData) return undefined;
    const records = orderStoryRecords(visibleMapData.layers.flatMap((layer) => layer.visible ? layer.features.map((feature) => ({ feature, layer })) : []), visibleMapData.story_order);
    const current = records.find(({ feature }) => feature.id === selectedFeatureId) || records[0];
    setContextMenu(null);
    if (!current) { setSelectedFeatureId(null); return undefined; }
    setSelectedFeatureId(current.feature.id);
    setSelectedLayerId(current.layer.id);
    const frame = requestAnimationFrame(() => {
      mapRef.current?.resize();
      mapRef.current?.focusFeature(current.feature.id, { immediate: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [presenting, visibleMapData, activeTool, directions.visible, featureDialog, placeSearch.mode, selectedFeatureId]);

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
  const localDraft = ['line', 'polygon'].includes(activeTool);
  const localMeasurement = lastHistoryDomainRef.current === 'measurement';
  const canUndo = localDraft ? draftPoints.length > 0 : localMeasurement ? measurementJournalRef.current.past.length > 0 : canEdit && editorHistory.canUndo;
  const canRedo = localDraft ? draftRedoRef.current.length > 0 : localMeasurement ? measurementJournalRef.current.future.length > 0 : canEdit && editorHistory.canRedo;
  const undo = () => {
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
    const compactPoints = compactDraftPoints(points);
    if (compactPoints.length < 2) return;
    if (tool === 'measure') {
      updateMeasurement(compactPoints); setHoverPoint(null); setActiveTool('pan'); return;
    }
    if (!selectedLayer) return;
    const isPolygon = tool === 'polygon';
    if (isPolygon && compactPoints.length < 3) return;
    const geometry = isPolygon
      ? { type: 'Polygon', coordinates: [[...compactPoints, compactPoints[0]]] }
      : { type: 'LineString', coordinates: compactPoints };
    const created = await addFeature(selectedLayer.id, {
      name: isPolygon ? '未命名区域' : '未命名线条',
      description: '双击结束绘制，可在左侧列表中继续编辑。',
      geometry,
      style: { color: isPolygon ? '#00897b' : '#e85d4a', fillColor: '#4db6ac', fillOpacity: 0.28, weight: 4 },
    });
    setDraftPoints([]);
    draftRedoRef.current = [];
    setHoverPoint(null);
    setActiveTool('pan');
    setToast(created?.historyWarning || (isPolygon ? '已添加区域' : '已添加线条'));
  };

  const handleMapClick = async (latlng, originalEvent) => {
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
    lastHistoryDomainRef.current = 'draft';
    const next = compactDraftPoints([...draftPoints, point]);
    setDraftPoints(next);
    draftRedoRef.current = [];
  };

  const handleDoubleClick = async (latlng) => {
    if (['line', 'polygon', 'measure'].includes(activeTool)) {
      const point = [latlng.lng, latlng.lat];
      await finishDraft(activeTool, [...(activeTool === 'measure' ? measurementPoints : draftPoints), point]);
    }
  };

  const selectFeature = useCallback((feature, layer, edit = false, focus = true) => {
    setSelectedFeatureId(feature.id);
    setSelectedLayerId(layer.id);
    if (focus) mapRef.current?.focusFeature(feature.id);
    if (layer.kind === 'directions') {
      placeSearch.clear(); setActiveTool('pan'); setDraftPoints([]); setHoverPoint(null);
      setSidebarCollapsed(false); setSheetState('half');
      setExpandedLayers((current) => ({ ...current, [layer.id]: true }));
      directions.openFrom({ savedFeature: feature, layerId: layer.id, featureId: feature.id });
    } else if (edit) setFeatureDialog({ ...feature, layerId: layer.id });
  }, [directions.openFrom, placeSearch.clear]);

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

  const applyCardStyle = async (feature, color) => {
    try {
      if (!await applyStyle(feature, color)) return;
      setSelectedFeatureId(feature.id);
      setToast('地点样式已更新');
    } catch (requestError) {
      setToast(requestError.message);
    }
  };

  const saveCardDetails = async (feature, changes) => {
    try {
      setSaving(true);
      const data = await performEdit('Edit feature details', (expectedFingerprint) => api.updateFeature(feature.id, { ...changes, expectedFingerprint, expectedVersion: feature.version }));
      replaceData(data);
      setSelectedFeatureId(feature.id);
      setToast('地点信息已保存');
    } catch (requestError) {
      handleWriteError(requestError);
      throw requestError;
    }
  };

  const deleteFeatureFromCard = async (feature) => {
    if (!canEdit) return false;
    if (!window.confirm(`删除地点“${feature.name}”？`)) return;
    try {
      if (!await deleteFeature(feature)) return false;
      setToast('地点已删除');
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
      if (!payload.id && featurePayload.geometry?.type === 'Point') setSelectedFeatureId(featureId);
      setToast(historyWarning || (pendingFiles.length ? `要素已保存，并上传 ${pendingFiles.length} 个附件` : '要素已保存'));
      return true;
    } catch (requestError) {
      setSaving(false);
      if (createdFeatureId !== null) {
        setFeatureDialog(null);
        setSelectedFeatureId(createdFeatureId);
        setToast(`地点已保存，但附件上传失败：${requestError.message}`);
        return true;
      }
      setToast(requestError.message);
      return false;
    }
  };

  const addLayer = async () => {
    if (!canEdit) return;
    const name = window.prompt('图层名称', '无标题图层');
    if (name === null) return;
    try {
      const data = await performEdit('Add layer', (expectedFingerprint) => api.addLayer(mapId, { name, expectedFingerprint }));
      const newest = data.layers.find((layer) => layer.id === data.createdLayerId);
      replaceData(data);
      setSelectedLayerId(newest.id);
      setExpandedLayers((items) => ({ ...items, [newest.id]: true }));
      setToast('已添加图层');
    } catch (requestError) {
      handleWriteError(requestError);
    }
  };

  const renameLayer = async (layer) => {
    if (!canEdit) return false;
    const name = window.prompt('重命名图层', layer.name);
    if (!name?.trim()) return false;
    try {
      await performEdit('Rename layer', (expectedFingerprint) => api.updateLayer(layer.id, { name: name.trim(), expectedVersion: layer.version, expectedFingerprint }));
      setLayerMenu(null);
      return true;
    } catch (requestError) {
      handleWriteError(requestError);
      return false;
    }
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

  const applyStyle = async (feature, color) => {
    if (!canEdit) return false;
    try {
      replaceData(await performEdit('Feature style', (expectedFingerprint) => api.updateFeature(feature.id, {
        expectedFingerprint,
        style: { ...feature.style, color, fillColor: color },
        expectedVersion: feature.version,
      })));
      setStyleTarget(null);
      return true;
    } catch (requestError) {
      handleWriteError(requestError);
      return false;
    }
  };

  // Save from the inline style popover: persist name/description/layer/color but
  // keep the popover open so the user can keep editing. Closes on success only
  // when the feature moved to a different layer (its anchor row changes).
  const saveStylePopover = async (payload) => {
    try {
      setSaving(true);
      const data = await performEdit('Edit feature style', (expectedFingerprint) => api.updateFeature(payload.id, {
        expectedFingerprint,
        name: payload.name,
        description: payload.description,
        style: payload.style,
        layerId: payload.layerId,
        expectedVersion: payload.version,
      }));
      replaceData(data);
      setSelectedFeatureId(payload.id);
      setToast('地点信息已保存');
      if (payload.layerId !== styleTarget?.feature?.layerId && styleTarget?.feature?.id === payload.id) setStyleTarget(null);
    } catch (requestError) {
      setSaving(false);
      setToast(requestError.message);
      throw requestError;
    }
  };

  const deleteStylePopoverFeature = async (feature) => {
    await deleteFeature(feature);
    setStyleTarget(null);
  };

  const openDirections = (settings = {}) => {
    placeSearch.clear(); setSelectedFeatureId(null); setActiveTool('pan'); setDraftPoints([]); setHoverPoint(null);
    if (settings.layerId) {
      setSelectedLayerId(settings.layerId);
      setExpandedLayers((current) => ({ ...current, [settings.layerId]: true }));
    }
    setSidebarCollapsed(false); setSheetState('half');
    directions.openFrom({ newLayer: !settings.savedFeature && !settings.routeData, ...settings });
  };
  const changeTool = (tool) => {
    setContextMenu(null); setSelectedFeatureId(null); setDraftPoints([]); setHoverPoint(null); draftRedoRef.current = [];
    if (tool === 'route') { openDirections(); return; }
    if (['marker', 'line', 'polygon'].includes(tool) && selectedLayer) setSelectedLayerId(selectedLayer.id);
    directions.close(); placeSearch.clear(); setActiveTool(tool);
    lastHistoryDomainRef.current = 'server';
    if (tool === 'measure') { if (isMobile) setSheetState('collapsed'); measurementJournalRef.current = {past: [], future: []}; updateMeasurement([], false, false); lastHistoryDomainRef.current = 'measurement'; }
  };
  const searchPlaces = async (event) => {
    setActiveTool('pan'); setSelectedFeatureId(null); setSidebarCollapsed(false); setSheetState('half');
    const places = await placeSearch.onSearch(event);
    if (places.length) mapRef.current?.fitPositions(places.map((place) => place.position), 15);
  };
  const openPlaceDetail = (place) => {
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
  const chooseSuggestion = (suggestion) => { setActiveTool('pan'); setSelectedFeatureId(null); placeSearch.chooseSuggestion(suggestion); };
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
  const onMapContextMenu = (point, screen) => setContextMenu({ point, screen });
  const contextPosition = contextMenu ? [contextMenu.point.lng, contextMenu.point.lat] : null;
  const startMeasurement = (position) => {
    if (isMobile) setSheetState('collapsed');
    directions.close(); placeSearch.clear(); setSelectedFeatureId(null); setActiveTool('measure'); measurementJournalRef.current = {past: [], future: []}; measurementStateRef.current = {points: [], closed: false}; updateMeasurement(position ? [position] : [], false); lastHistoryDomainRef.current = 'measurement'; setContextMenu(null); setHoverPoint(null);
  };
  const addMarkerAt = (position) => {
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
    polygon: text('逐点点击绘制区域，双击结束', 'Click to draw a shape; double-click to finish'),

    measure: text('逐点测量，双击结束', 'Click to measure; double-click to finish'),
  }[activeTool];
  const canFinishDraft = ['line', 'measure'].includes(activeTool)
    ? (activeTool === 'measure' ? measurementPoints.length : draftPoints.length) >= 2
    : activeTool === 'polygon' && draftPoints.length >= 3;

  if (loading) return <div className="full-loading"><span className="brand-mark"><i /><i /><i /></span><p>{t('common.loading')}</p></div>;
  if (error || !mapData) return <div className="full-error"><CircleHelp size={38} /><h1>{t('editor.mapDeleted')}</h1><p>{error}</p><button className="primary-button" onClick={() => navigate('/')}>{t('editor.backLibrary')}</button></div>;

  const activeBaseMapKey = normalizeBaseMapKey(mapData.base_map);
  const previewMode = new URLSearchParams(window.location.search).get('preview') === '1';
  const draftPoint = featureDialog && !featureDialog.id && featureDialog.geometry?.type === 'Point' ? featureDialog : null;
  const selectedPointContext = selectedFeatureContext?.feature.type === 'Point' ? selectedFeatureContext : null;
  const storyRecords = orderStoryRecords(visibleMapData.layers.flatMap((layer) => layer.visible ? layer.features.map((feature) => ({ feature, layer })) : []), mapData.story_order);
  const selectStoryRecord = (feature, layer) => {
    setSelectedFeatureId(feature.id);
    setSelectedLayerId(layer.id);
    setStoryDetailId(null);
  };
  const activeCandidate = placeSearch.selectedPlace;
  const mapPopup = isMobile ? null : draftPoint ? {
    position: draftPoint.geometry.coordinates,
    content: <DraftPointCard feature={draftPoint} onSave={saveFeatureDialog} onCancel={() => setFeatureDialog(null)} />,
  } : activeCandidate?.position && placeSearch.mode === 'detail' ? {
    position: activeCandidate.position,
    content: <SearchPlaceCard search={searchPanelState} onAdd={addSearchResult} onDirections={(place) => openDirections({ to: place })} onClose={backToSearchResults} canAdd={Boolean(canEdit && selectedLayer)} layerName={selectedLayer?.name} />,
  } : selectedPointContext ? {
    position: selectedPointContext.feature.geometry.coordinates,
    content: (
      <PlaceFeatureCard
        feature={selectedPointContext.feature}
        layer={selectedPointContext.layer}
        canEdit={canEdit && !editorHistory.busy}
        onClose={() => setSelectedFeatureId(null)}
        onCopyCoordinates={() => copyFeatureCoordinates(selectedPointContext.feature)}
        onStyle={(color) => applyCardStyle(selectedPointContext.feature, color)}
        onSave={(changes) => saveCardDetails(selectedPointContext.feature, changes)}
        onMedia={() => requestQuickMedia(selectedPointContext.feature)}
        onRoute={() => startRouteFromFeature(selectedPointContext.feature, selectedPointContext.layer)}
        onDelete={() => deleteFeatureFromCard(selectedPointContext.feature)}
      />
    ),
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

  if (previewMode) return <SharedMapViewer key={mapData.id} mapData={mapData} onSaveStoryOrder={canEdit ? (featureIds, expectedVersion) => performEdit('Story order', (expectedFingerprint) => api.saveStoryOrder(mapId, { featureIds, expectedVersion, expectedFingerprint })) : undefined} onExit={() => { window.history.replaceState({}, '', `/maps/${mapId}`); window.dispatchEvent(new PopStateEvent('popstate')); }} />;

  return (
    <main className={`editor-page${presenting ? ' story-browsing' : ''}`}>
      <MobileSheet className={sidebarCollapsed ? 'collapsed' : ''} state={sheetState} onStateChange={setSheetState} label={t('editor.layerPanel')} lang={lang} onClose={() => setSheetState('collapsed')}>
        <section className="map-meta-panel">
          <div className="editor-title-row">
            <button className="icon-button sidebar-back" onClick={() => navigate('/')} aria-label={t('editor.backLibrary')}><ArrowLeft size={20} /></button>
            <input readOnly={!canEdit} className="map-title-input" value={mapData.name} onChange={(event) => setMapData({ ...mapData, name: event.target.value })} onBlur={(event) => updateMap({ name: event.target.value })} aria-label={t('editor.mapTitle')} />
            <div className="map-menu-anchor" data-map-menu-root>
              <button className="icon-button" onClick={() => setMoreMenu((value) => !value)} aria-label={t('editor.mapMenu')}><MoreVertical size={20} /></button>
              {moreMenu ? <div className="popup-menu map-more-menu"><button onClick={() => { exportKml(mapData); setMoreMenu(false); }}><Download size={16} /> {t('editor.exportKml')}</button><button onClick={() => { exportGeoJson(mapData); setMoreMenu(false); }}><Database size={16} /> {t('editor.exportGeoJson')}</button><button disabled={!canEdit} onClick={saveDefaultView}><LocateFixed size={16} /> {t('editor.setDefaultView')}</button></div> : null}
            </div>
          </div>
          <button className="sidebar-collapse-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? t('editor.expandPanel') : t('editor.collapsePanel')} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? t('editor.expandPanel') : t('editor.collapsePanel')}>{sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}</button>
          <textarea readOnly={!canEdit} className="map-description-input" value={mapData.description} onChange={(event) => setMapData({ ...mapData, description: event.target.value })} onBlur={(event) => updateMap({ description: event.target.value })} aria-label={t('editor.mapDescription')} rows="2" />
          <p className="save-status">
            {canEdit ? (saving ? t('editor.saving') : t('editor.allSaved')) : t('editor.readOnly')} · {formatDate(mapData.updated_at)}
            {realtimeStatus === 'joined' || realtimeStatus === 'connected' ? ` · ${t('editor.realtimeOn')}` : realtimeStatus === 'reconnecting' ? ` · ${t('editor.reconnecting')}` : ''}
          </p>
        </section>
        <div className="sidebar-primary-actions">
          <button onClick={addLayer} disabled={!canEdit}><Layers size={16} /> {t('editor.addLayer')}</button>
          <button onClick={() => setShareDialog(true)}><Share2 size={16} /> {t('editor.share')}</button>
          <button onClick={() => { window.history.pushState({}, '', `/maps/${mapId}?preview=1`); window.location.reload(); }}><Eye size={16} /> {t('editor.preview')}</button>
        </div>
        {isMobile && placeSearch.mode ? <SearchResultsPanel search={searchPanelState} onDirections={(place) => openDirections({ to: place })} onAdd={addSearchResult} onClose={placeSearch.clear} onReturnToLayers={placeSearch.clear} canAdd={Boolean(canEdit && selectedLayer)} layerName={selectedLayer?.name} compact /> : null}
        {isMobile && draftPoint ? <DraftPointCard feature={draftPoint} onSave={saveFeatureDialog} onCancel={() => setFeatureDialog(null)} /> : null}
        {isMobile && selectedPointContext ? <PlaceFeatureCard canEdit={canEdit && !editorHistory.busy} feature={selectedPointContext.feature} layer={selectedPointContext.layer} onClose={() => setSelectedFeatureId(null)} onCopyCoordinates={() => copyFeatureCoordinates(selectedPointContext.feature)} onStyle={(color) => applyCardStyle(selectedPointContext.feature,color)} onSave={(changes) => saveCardDetails(selectedPointContext.feature,changes)} onMedia={() => requestQuickMedia(selectedPointContext.feature)} onRoute={() => startRouteFromFeature(selectedPointContext.feature,selectedPointContext.layer)} onDelete={() => deleteFeatureFromCard(selectedPointContext.feature)} /> : null}
        {directions.visible && !mapData.layers.some((layer) => layer.id === directions.target?.layerId) ? <section className="pending-directions-layer">
          <header><Route size={17} /><b>{text('无标题路线', 'Untitled directions')}</b><button className="icon-button" onClick={directions.close} aria-label={text('关闭路线图层', 'Close directions layer')}><X size={16} /></button></header>
          {routeEditor}
        </section> : null}
        <LayerPanel layers={mapData.layers} selectedLayerId={selectedLayerId} selectedFeatureId={selectedFeatureId} expandedLayers={expandedLayers} onToggleExpanded={(id) => setExpandedLayers((current) => ({...current,[id]:!current[id]}))} onSelectLayer={setSelectedLayerId} onSelectFeature={selectFeature} onToggleLayer={toggleLayer} onRenameLayer={renameLayer} onDeleteLayer={removeLayer} onImport={(layer) => {setSelectedLayerId(layer.id); importRef.current?.click();}} onTable={setTableLayer} onExport={exportCsv} onFeatureStyle={(feature,layer) => setStyleTarget(styleTarget?.feature?.id === feature.id ? null : {layerId:layer.id,feature})} onLayerStyle={setLayerStyleTarget} onEditFeature={(feature,layer) => setFeatureDialog({...feature,layerId:layer.id})} onReorderLayers={(layerIds) => performEdit('Reorder layers',(expectedFingerprint) => api.reorderLayers(mapId,{layerIds,expectedFingerprint,expectedVersion:mapDataLatestRef.current.version}))} onReorderFeatures={(layerId,featureIds) => performEdit('Reorder features',(expectedFingerprint) => api.reorderFeatures(mapId,{layerId,featureIds,expectedFingerprint,expectedVersion:mapDataLatestRef.current.version}))} onMoveFeature={(featureId,layerId,index) => performEdit('Move feature to layer',(expectedFingerprint) => {const feature=mapDataLatestRef.current.layers.flatMap((layer)=>layer.features).find((item)=>item.id===featureId);return api.moveFeature(featureId,{layerId,index,expectedFingerprint,expectedVersion:feature?.version});})} canEdit={canEdit && !editorHistory.busy} peers={peers} user={user} t={t} lang={lang} renderDirections={(layer) => directions.visible && layer.id === directions.target?.layerId ? routeEditor : null} onEditDirections={(layer, feature) => openDirections({ savedFeature: feature, layerId: layer.id, featureId: feature.id })} renderFeatureStyle={(feature,layer) => styleTarget?.feature?.id === feature.id ? <div className="style-popover-anchor" data-style-popover-root onClick={(event)=>event.stopPropagation()}><FeatureStylePopover feature={feature} layers={contentLayers} defaultLayerId={layer.id} attachments={feature.attachments || []} onSave={saveStylePopover} onDelete={deleteStylePopoverFeature} onUploadAttachments={uploadFeatureAttachments} onDeleteAttachment={deleteFeatureAttachment} /></div> : null} />
        <BaseMapPicker value={activeBaseMapKey} open={basePicker} onToggle={() => setBasePicker((value) => !value)} onChange={(key) => { if (canEdit) updateMap({ base_map: key }); else setMapData((current) => ({ ...current, base_map: key })); setBasePicker(false); }} traffic={trafficVisible} onTrafficChange={setTrafficVisible} lang={lang} />
        <div className="sidebar-bottom"><button onClick={() => navigate('/admin')}><Database size={16} /> {t('editor.dbAdmin')}</button><span>Open My Map</span></div>
      </MobileSheet>

      <section className="map-workspace">
        <button className="mobile-panel-toggle" onClick={() => setSheetState((current) => current === 'collapsed' ? 'half' : 'collapsed')} aria-label={t('editor.layerPanel')}><Menu size={20} /></button>
        <form className="map-search-bar" onSubmit={searchPlaces}>
          <Search className="search-leading-icon" size={20} />
          <input ref={searchInputRef} value={searchQuery} onChange={(event) => { setSelectedFeatureId(null); setSearchQuery(event.target.value); }} onFocus={() => setSuggestionsOpen(true)} onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)} onKeyDown={handleSearchKey} placeholder={t('editor.searchPlace')} aria-label={t('editor.searchPlace')} role="combobox" aria-autocomplete="list" aria-expanded={suggestionsOpen && searchSuggestions.length > 0} aria-controls="map-search-suggestions" aria-activedescendant={suggestionIndex >= 0 && suggestionsOpen ? `map-suggestion-${suggestionIndex}` : undefined} />
          {searchQuery ? <button type="button" className="icon-button" onClick={placeSearch.clear} aria-label={t('editor.clearSearch')}><X size={18} /></button> : null}
          <button className="search-submit" aria-label={t('editor.search')} disabled={searching}><Search size={19} /></button>
        </form>
        <DrawingToolbar activeTool={directions.visible ? 'route' : activeTool} canEdit={Boolean(canEdit && selectedLayer)} onTool={changeTool} canUndo={canUndo && !editorHistory.busy} canRedo={canRedo && !editorHistory.busy} onUndo={undo} onRedo={redo} />
        {!isMobile && (placeSearch.mode === 'results' || (placeSearch.mode === 'detail' && !activeCandidate?.position)) ? <div className="map-search-results-popover"><SearchResultsPanel search={searchPanelState} onDirections={(place) => openDirections({ to: place })} onAdd={addSearchResult} onClose={placeSearch.clear} canAdd={Boolean(canEdit && selectedLayer)} layerName={selectedLayer?.name} compact /></div> : null}
        {suggestionsOpen && searchSuggestions.length ? <div id="map-search-suggestions" className="map-search-suggestions" role="listbox" aria-label={text('地点联想', 'Suggested places')}>{searchSuggestions.map((suggestion, index) => <button key={suggestion.id} type="button" id={`map-suggestion-${index}`} role="option" aria-selected={index === suggestionIndex} className={index === suggestionIndex ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSuggestion(suggestion)}><MapPin size={18} /><span><b>{suggestion.name}</b><small>{suggestion.address || suggestion.city}</small></span></button>)}</div> : null}
        {toolInstruction ? <div className="tool-instruction">{(activeTool === 'measure' ? measurementPoints.length : draftPoints.length) ? `${activeTool === 'measure' ? measurementPoints.length : draftPoints.length} ${text('个顶点', 'vertices')} · ` : ''}{toolInstruction}{canFinishDraft ? <button className="finish-drawing-button" onClick={() => finishDraft(activeTool, activeTool === 'measure' ? measurementPoints : draftPoints).catch(() => {})} aria-label={text('完成绘制', 'Finish drawing')}>{text('完成', 'Finish')}</button> : null}<button onClick={() => { setActiveTool('pan'); setDraftPoints([]); setHoverPoint(null); }} aria-label={text('取消绘制', 'Cancel drawing')}><X size={15} /></button></div> : null}
        {canEdit && selectedFeatureContext && activeTool === 'pan' ? <div className="selected-edit-tip">{selectedFeatureContext.feature.type === 'Point' ? text('拖动标记以调整位置', 'Drag the marker to move this place') : selectedFeatureContext.feature.style?.routeData ? text('拖动路线以重新规划','Drag the route to replan') : text('拖动顶点以调整形状', 'Drag a vertex to reshape this feature')}</div> : null}
        <span className="visually-hidden" role="status" data-testid="draft-status">{draftPoints.length ? text(`已放置 ${draftPoints.length} 个绘图顶点`, `${draftPoints.length} drawing vertices placed`) : ''}</span>
        <AmapMap
          activeTool={activeTool}
          className="editor-map"
          draftMarker={draftPoint ? { position: draftPoint.geometry.coordinates, color: draftPoint.style?.color, icon: draftPoint.style?.icon || selectedLayer?.style?.icon } : null}
          draftPoints={activeTool === 'measure' ? [] : draftPoints}
          hoverPoint={hoverPoint}
          mapData={visibleMapData}
          editable={canEdit && !presenting}
          trafficVisible={trafficVisible}
          measurementPoints={measurementPoints}
          measurementClosed={measurementClosed}
          onMeasurementChange={(points) => updateMeasurement(points)}
          onContextMenu={presenting ? undefined : onMapContextMenu}
          onPoiSelect={presenting ? undefined : (poi) => openPlaceDetail({...poi,source:'AMap'})}
          poiEnabled={!presenting && activeTool === 'pan' && !directions.visible && !draftPoint}
          onViewChange={(view) => { if(view.source === 'user') placeSearch.setViewChanged(); }}
          routeAlternatives={directions.alternatives.map((route)=>({...route,selected:route.id===directions.selectedAlternativeId}))}
          routePlan={directions.selectedAlternative && directions.stops.every((stop)=>stop.position) ? {...directions.selectedAlternative,stops:directions.stops} : null}
          onRouteSelect={directions.selectAlternative}
          onRouteWaypoint={({position,segmentIndex,stopIndex}) => directions.addWaypoint(position,segmentIndex,stopIndex)}
          onSavedRouteWaypoint={replanSavedRoute}
          markerColor={selectedLayer?.style.color || '#1a73e8'}
          markerIcon={selectedLayer?.style.icon || 'pin'}
          onCandidateClick={presenting ? undefined : openPlaceDetail}
          onFeatureSelect={(feature, layer) => presenting ? (selectStoryRecord(feature, layer), setStoryDetailId(feature.id)) : selectFeature(feature, layer, false, false)}
          onFeatureGeometryChange={(feature, geometry) => persistGeometry(feature, geometry).catch(() => {})}
          onMapClick={(point,event)=>{ if (presenting) setStoryDetailId(null); else handleMapClick(point,event).catch(()=>{}); }}
          onMapDoubleClick={(point)=>handleDoubleClick(point).catch(()=>{})}
          onMouseMove={(point) => setHoverPoint(activeTool === 'pan' || !point ? null : [point.lng, point.lat])}
          onMoveEnd={(center) => { currentCenterRef.current = center; }}
          onPopupClose={() => { if (placeSearch.mode === 'detail') backToSearchResults(); else setSelectedFeatureId(null); }}
          onReady={(controller) => { mapRef.current = controller; currentCenterRef.current = controller.getCenter(); }}
          onZoomStateChange={setZoomState}
          popup={presenting ? null : mapPopup}
          searchCandidates={searchCandidates}
          selectedFeatureId={selectedFeatureId}
        />
        {presenting ? <button className="story-panel-reopen" onClick={() => { setSidebarCollapsed(false); setSheetState('half'); }} aria-label={text('展开内容面板', 'Show content panel')}><ChevronRight size={23} /></button> : null}
        {presenting ? <StoryPresentation records={storyRecords} selectedId={selectedFeatureId} showDetails={storyDetailId !== null && storyDetailId === selectedFeatureId} onCloseDetails={() => setStoryDetailId(null)} onSelect={selectStoryRecord} text={text} /> : null}
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
            <UserAvatar user={user} />
          </button>
        </div>
        {measurementPoints.length ? <MeasurePanel points={measurementPoints} distance={measurementDistance(measurementPoints,measurementClosed)} area={measurementClosed ? measurementArea(measurementPoints) : 0} closed={measurementClosed} onClear={()=>updateMeasurement([],false)} onRemoveLast={()=>updateMeasurement((points)=>points.slice(0,-1))} onClose={()=>{updateMeasurement([],false);setActiveTool('pan');}} onToggleClosed={()=>updateMeasurement(measurementPoints,!measurementClosed)} lang={lang} /> : null}
        {contextMenu && !presenting ? <ContextMenu point={contextPosition} screen={contextMenu.screen} onHere={()=>{const position=contextPosition;setContextMenu(null);directions.close();placeSearch.reverseGeocodeDetail(position);}} onFrom={()=>{openDirections({from:{position:contextPosition}});setContextMenu(null);}} onTo={()=>{openDirections({to:{position:contextPosition}});setContextMenu(null);}} onMeasure={()=>startMeasurement(contextPosition)} onAddMarker={()=>addMarkerAt(contextPosition)} onClose={()=>setContextMenu(null)} canEdit={Boolean(canEdit&&selectedLayer)} lang={lang} /> : null}
        <div className="map-control-stack"><button onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.querySelector('.editor-page').requestFullscreen) await document.querySelector('.editor-page').requestFullscreen(); else setToast(text('当前浏览器不支持全屏。', 'Fullscreen is unavailable.')); } catch { setToast(text('无法进入全屏。', 'Unable to enter fullscreen.')); } }} aria-label={text('全屏', 'Fullscreen')}>{fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}</button><span /><button onClick={locateUser} aria-label={t('editor.locate')}><LocateFixed size={19} /></button><span /><button disabled={zoomState.zoom === null || zoomState.zoom >= zoomState.maxZoom} onClick={() => mapRef.current?.zoomIn()} aria-label={t('editor.zoomIn')}><ZoomIn size={19} /></button><button disabled={zoomState.zoom === null || zoomState.zoom <= zoomState.minZoom} onClick={() => mapRef.current?.zoomOut()} aria-label={t('editor.zoomOut')}><ZoomOut size={19} /></button></div>
      </section>

      <input ref={importRef} type="file" className="visually-hidden" accept=".csv,.tsv,.geojson,.json,.kml,.gpx" onChange={importFile} />
      <input ref={quickMediaInputRef} type="file" className="visually-hidden" accept={MEDIA_ACCEPT} multiple onChange={handleQuickMediaSelection} aria-label="上传地点图片或视频" />
      {featureDialog && !draftPoint ? <FeatureDialog feature={featureDialog} layers={contentLayers} defaultLayerId={selectedLayer?.id} onSave={saveFeatureDialog} onUploadAttachments={uploadFeatureAttachments} onDeleteAttachment={deleteFeatureAttachment} onDelete={(feature) => { if (window.confirm(`删除“${feature.name}”？`)) { deleteFeature(feature); setFeatureDialog(null); } }} onClose={() => setFeatureDialog(null)} /> : null}
      {layerStyleTarget ? <LayerStyleDialog layer={layerStyleTarget} onSave={applyLayerStyle} onClose={()=>setLayerStyleTarget(null)} lang={lang} /> : null}
      {shortcutDialog ? <Modal title={text('键盘快捷键','Keyboard shortcuts')} onClose={()=>setShortcutDialog(false)}><div className="editor-shortcuts"><p>Ctrl / ⌘ + Z — {text('撤销','Undo')}</p><p>Ctrl / ⌘ + Shift + Z / Ctrl + Y — {text('重做','Redo')}</p><p>Backspace / Delete — {text('移除最后顶点或删除选中要素','Remove last point or selected feature')}</p><p>Enter — {text('完成绘制','Finish drawing')}</p><p>Escape — {text('关闭菜单或取消当前工具','Close menu or cancel current tool')}</p><p>H / M / L / P / R / D — {text('平移 / 标记 / 线 / 区域 / 路线 / 测距','Pan / Marker / Line / Shape / Directions / Measure')}</p><p>Ctrl / ⌘ + K — {text('搜索','Search')}</p><p>Alt + ↑ / ↓ — {text('在图层排序按钮上移动项目','Move focused layer or feature')}</p></div></Modal> : null}
      {shareDialog ? <ShareDialog map={mapData} share={share} onGenerate={generateShare} onClose={() => setShareDialog(false)} /> : null}
      {tableLayer ? <DataTableDialog canEdit={canEdit} layer={mapData.layers.find((layer) => layer.id === tableLayer.id) || tableLayer} onEdit={(feature) => setFeatureDialog({ ...feature, layerId: tableLayer.id })} onDelete={(feature) => deleteFeature(feature)} onClose={() => setTableLayer(null)} /> : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </main>
  );
}
