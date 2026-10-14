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
import { AMAP_CONFIGURED, routeAMap, searchAMapPlaces, suggestAMapPlaces } from '../amap.js';
import AmapMap, { AMAP_MAX_ZOOM, AMAP_MIN_ZOOM } from './AmapMap.jsx';
import FeatureMediaGallery, {
  formatFileSize, MAX_ATTACHMENTS_PER_FEATURE, MAX_FILES_PER_UPLOAD, MEDIA_ACCEPT, validateMediaSelection,
} from './FeatureMediaGallery.jsx';
import {
  AMAP_PROVIDER, BASE_MAPS, baseMapPreviewStyle, distanceMeters, exportCsv, exportGeoJson, exportKml,
  formatDate, normalizeBaseMapKey, parseImportFile,
} from '../utils.js';
import './editor.css';

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

function DataTableDialog({ layer, onEdit, onDelete, onClose }) {
  return (
    <Modal title={`${layer.name} · 数据表`} onClose={onClose} size="wide">
      <div className="data-table-wrap">
        <table className="data-table"><thead><tr><th>名称</th><th>类型</th><th>说明</th><th>坐标/节点</th><th>操作</th></tr></thead>
          <tbody>{layer.features.map((feature) => <tr key={feature.id}><td><span className="table-color-dot" style={{ background: feature.style.color || '#1a73e8' }} />{feature.name}</td><td>{feature.type}</td><td>{feature.description || '—'}</td><td>{feature.type === 'Point' ? feature.geometry.coordinates.map((value) => Number(value).toFixed(4)).join(', ') : `${feature.geometry.coordinates.flat(2).length / 2} 个节点`}</td><td><button className="table-action" onClick={() => onEdit(feature)}>编辑</button><button className="table-action danger" onClick={() => onDelete(feature)}>删除</button></td></tr>)}</tbody>
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
      <button className="tool-button" disabled={!canEdit || !canUndo} onClick={onUndo} aria-label={t('editor.undo')}><Undo2 size={17} /></button>
      <button className="tool-button" disabled={!canEdit || !canRedo} onClick={onRedo} aria-label={t('editor.redo')}><Redo2 size={17} /></button>
      <span className="tool-divider" />
      {tools.map(([key, label, Icon]) => {
        const writeTool = key !== 'pan' && key !== 'measure';
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

function CandidateCard({ candidate, canAdd, onAdd, onClose }) {
  const [busy, setBusy] = useState(false);
  const name = candidate.name || candidate.display_name?.split(',')[0] || '搜索地点';
  const handleAdd = async () => {
    if (busy || !canAdd) return;
    setBusy(true);
    try { await onAdd(candidate); } finally { setBusy(false); }
  };
  return (
    <article
      className="candidate-strip-card"
      aria-label={`${candidate.index} ${name} 搜索候选`}
      onClickCapture={(event) => { event.nativeEvent.openMyMapCardInteraction = true; }}
    >
      <button type="button" className="candidate-strip-close" onClick={onClose} aria-label="关闭弹窗" title="关闭"><X size={15} /></button>
      <span className="candidate-strip-name" title={name}>
        <span className="candidate-strip-no">{candidate.index}</span>
        <span className="candidate-strip-sep">-</span>
        <span className="candidate-strip-label">{name}</span>
      </span>
      <button type="button" className="candidate-strip-add" onClick={handleAdd} disabled={!canAdd || busy} aria-label="加入地图" title={canAdd ? '加入当前图层' : '请先选择图层'}>
        {busy ? <span className="candidate-strip-busy">…</span> : <Plus size={18} />}
      </button>
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

function PlaceFeatureCard({ feature, layer, onClose, onCopyCoordinates, onStyle, onSave, onMedia, onRoute, onDelete }) {
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
    if (editBusy) return;
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
      {editing ? (
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
              <button type="button" className={styleOpen ? 'active' : ''} onClick={() => setStyleOpen((open) => !open)} aria-label="设置地点样式" aria-expanded={styleOpen} title="设置样式"><PaintBucket size={18} /></button>
              <button type="button" onClick={() => { setStyleOpen(false); setEditing(true); }} aria-label="编辑地点" title="编辑"><Pencil size={18} /></button>
              <button type="button" onClick={onMedia} aria-label="上传图片或视频" title="添加图片或视频"><Camera size={18} /></button>
              <button type="button" onClick={onRoute} aria-label="以此地点为路线起点" title="添加路线"><GitFork size={18} /></button>
              <button type="button" className="danger" onClick={onDelete} aria-label="删除地点" title="删除"><Trash2 size={18} /></button>
            </nav>
            {styleOpen ? (
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [activeCandidateId, setActiveCandidateId] = useState(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [panelTab, setPanelTab] = useState('layers');
  const [trafficVisible, setTrafficVisible] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [routeTravelMode, setRouteTravelMode] = useState('driving');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [toast, setToast] = useState('');
  const [quickMediaFeatureId, setQuickMediaFeatureId] = useState(null);
  const [history, setHistory] = useState([]);
  const [redoHistory, setRedoHistory] = useState([]);
  const [zoomState, setZoomState] = useState({ zoom: null, minZoom: AMAP_MIN_ZOOM, maxZoom: AMAP_MAX_ZOOM });
  const [peers, setPeers] = useState([]);
  const [canEdit, setCanEdit] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState('idle');
  const mapRef = useRef(null);
  const importRef = useRef(null);
  const quickMediaInputRef = useRef(null);
  const currentCenterRef = useRef(null);
  const routePendingRef = useRef(false);
  const roomRef = useRef(null);
  const mapDataLatestRef = useRef(mapData);
  const geometryWriteQueueRef = useRef(Promise.resolve());
  const searchRequestRef = useRef(0);
  mapDataLatestRef.current = mapData;

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, []);

  useEffect(() => {
    if (!suggestionsOpen || searchQuery.trim().length < 2 || !AMAP_CONFIGURED) { setSearchSuggestions([]); return undefined; }
    let disposed = false;
    const timer = window.setTimeout(() => {
      suggestAMapPlaces(searchQuery.trim()).then((rows) => {
        if (!disposed) { setSearchSuggestions(rows.slice(0, 7)); setSuggestionIndex(-1); }
      }).catch(() => { if (!disposed) setSearchSuggestions([]); });
    }, 250);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [searchQuery, suggestionsOpen]);

  const loadMap = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.map(mapId);
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
        setMapData((current) => {
          if (!current) return current;
          const next = applyMapOp(current, op);
          if (next === null) {
            setToast('该地图已被删除');
            navigate('/');
            return current;
          }
          return next;
        });
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
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (layerMenu !== null || moreMenu || basePicker) {
        setLayerMenu(null);
        setMoreMenu(false);
        setBasePicker(false);
        return;
      }
      if (activeTool !== 'pan') {
        setActiveTool('pan');
        setDraftPoints([]);
        setHoverPoint(null);
        return;
      }
      if (selectedFeatureId !== null) setSelectedFeatureId(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [activeTool, basePicker, layerMenu, moreMenu, selectedFeatureId]);
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

  const selectedLayer = useMemo(() => mapData?.layers.find((layer) => layer.id === selectedLayerId) || mapData?.layers[0], [mapData, selectedLayerId]);
  const allFeatureIds = useMemo(() => new Set(mapData?.layers.flatMap((layer) => layer.features.map((feature) => feature.id)) || []), [mapData]);
  const selectedFeatureContext = useMemo(() => {
    if (!mapData || selectedFeatureId === null) return null;
    for (const layer of mapData.layers) {
      const feature = layer.features.find((candidate) => candidate.id === selectedFeatureId);
      if (feature) return { feature, layer };
    }
    return null;
  }, [mapData, selectedFeatureId]);

  const replaceData = (data) => {
    setMapData(data);
    setSaving(false);
  };

  const handleWriteError = (requestError) => {
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

  const updateMap = async (body) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      replaceData(await api.updateMap(mapId, { ...body, expectedVersion: mapData?.version }));
    } catch (requestError) {
      handleWriteError(requestError);
    }
  };

  const addHistory = (action) => {
    setHistory((items) => [...items.slice(-19), action]);
    setRedoHistory([]);
  };

  const persistGeometry = (feature, geometry, historyEnabled = true) => {
    if (!canEdit) return Promise.resolve();
    const write = geometryWriteQueueRef.current.catch(() => {}).then(async () => {
      const latest = mapDataLatestRef.current?.layers.flatMap((layer) => layer.features).find((item) => item.id === feature.id);
      if (!latest) return;
      if (JSON.stringify(latest.geometry) === JSON.stringify(geometry)) return;
      setSaving(true);
      try {
        const data = await api.updateFeature(feature.id, { geometry, expectedVersion: latest.version });
        mapDataLatestRef.current = data;
        replaceData(data);
        if (historyEnabled) addHistory({ type: 'geometry', featureId: feature.id, before: latest.geometry, after: geometry });
      } catch (requestError) {
        handleWriteError(requestError);
        if (!requestError.conflict) await loadMap();
        throw requestError;
      }
    });
    geometryWriteQueueRef.current = write;
    return write;
  };

  const addFeature = async (layerId, body, historyEnabled = true) => {
    if (!canEdit) throw new Error('当前为只读权限');
    setSaving(true);
    try {
      const before = new Set(allFeatureIds);
      const data = await api.addFeature(layerId, body);
      replaceData(data);
      const created = data.layers.flatMap((layer) => layer.features).find((feature) => !before.has(feature.id));
      if (historyEnabled && created) addHistory({ type: 'create', feature: created, layerId });
      return created;
    } catch (requestError) {
      handleWriteError(requestError);
      throw requestError;
    }
  };

  const deleteFeature = async (feature, historyEnabled = true) => {
    if (!canEdit) return;
    const layer = mapData.layers.find((item) => item.features.some((candidate) => candidate.id === feature.id));
    if (!layer) return;
    setSaving(true);
    try {
      await api.deleteFeature(feature.id);
      if (historyEnabled) addHistory({ type: 'delete', feature, layerId: layer.id });
      setSelectedFeatureId(null);
      await loadMap();
    } catch (requestError) {
      handleWriteError(requestError);
      throw requestError;
    }
  };

  const undo = async () => {
    const action = history.at(-1);
    if (!action) return;
    setHistory((items) => items.slice(0, -1));
    try {
      if (action.type === 'geometry') await persistGeometry({ id: action.featureId }, action.before, false);
      else if (action.type === 'create') await deleteFeature(action.feature, false);
      else await addFeature(action.layerId, action.feature, false);
      setRedoHistory((items) => [...items, action]);
      setToast('已撤销上一步操作');
    } catch (requestError) { setToast(requestError.message); }
  };

  const redo = async () => {
    const action = redoHistory.at(-1);
    if (!action) return;
    setRedoHistory((items) => items.slice(0, -1));
    try {
      if (action.type === 'geometry') await persistGeometry({ id: action.featureId }, action.after, false);
      else if (action.type === 'create') await addFeature(action.layerId, action.feature, false);
      else {
        const candidate = mapData.layers.flatMap((layer) => layer.features).find((feature) => feature.name === action.feature.name && feature.type === action.feature.type);
        if (candidate) await deleteFeature(candidate, false);
      }
      setHistory((items) => [...items, action]);
      setToast('已重做操作');
    } catch (requestError) { setToast(requestError.message); }
  };

  const finishDraft = async (tool = activeTool, points = draftPoints) => {
    const compactPoints = compactDraftPoints(points);
    if (!selectedLayer || compactPoints.length < 2) return;
    if (tool === 'measure') {
      const meters = distanceMeters(compactPoints);
      setToast(meters >= 1000 ? `测量距离 ${(meters / 1000).toFixed(2)} 公里` : `测量距离 ${Math.round(meters)} 米`);
      setDraftPoints([]);
      setHoverPoint(null);
      setActiveTool('pan');
      return;
    }
    const isPolygon = tool === 'polygon';
    if (isPolygon && compactPoints.length < 3) return;
    const geometry = isPolygon
      ? { type: 'Polygon', coordinates: [[...compactPoints, compactPoints[0]]] }
      : { type: 'LineString', coordinates: compactPoints };
    await addFeature(selectedLayer.id, {
      name: isPolygon ? '未命名区域' : '未命名线条',
      description: '双击结束绘制，可在左侧列表中继续编辑。',
      geometry,
      style: { color: isPolygon ? '#00897b' : '#e85d4a', fillColor: '#4db6ac', fillOpacity: 0.28, weight: 4 },
    });
    setDraftPoints([]);
    setHoverPoint(null);
    setActiveTool('pan');
    setToast(isPolygon ? '已添加区域' : '已添加线条');
  };

  const createRoute = async (points) => {
    if (!selectedLayer || points.length < 2) return;
    setSaving(true);
    try {
      const result = await routeAMap(points, routeTravelMode);
      const routeName = routeTravelMode === 'walking' ? text('步行路线', 'Walking route') : routeTravelMode === 'cycling' ? text('骑行路线', 'Cycling route') : text('驾车路线', 'Driving route');
      await addFeature(selectedLayer.id, { name: routeName, description: text(`${(result.distance / 1000).toFixed(1)} 公里 · 预计 ${Math.round(result.duration / 60)} 分钟`, `${(result.distance / 1000).toFixed(1)} km · ${Math.round(result.duration / 60)} min`), geometry: result.geometry, style: { color: '#1a73e8', weight: 6 } });
      mapRef.current?.fitPositions(result.geometry.coordinates, 16);
      setToast(text('路线已添加到图层', 'Route added to your layer'));
    } catch (routeError) {
      setToast(`${text('路线规划失败：', 'Unable to plan route: ')}${routeError.message}`);
    } finally {
      setDraftPoints([]);
      setHoverPoint(null);
      setActiveTool('pan');
      setSaving(false);
    }
  };

  const handleMapClick = async (latlng, originalEvent) => {
    if (originalEvent?.openMyMapCardInteraction || originalEvent?.target?.closest?.('.my-maps-place-card')) return;
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
    const next = compactDraftPoints([...draftPoints, point]);
    setDraftPoints(next);
    if (activeTool === 'route' && next.length === 2 && !routePendingRef.current) {
      routePendingRef.current = true;
      try { await createRoute(next); } finally { routePendingRef.current = false; }
    }
  };

  const handleDoubleClick = async (latlng) => {
    if (['line', 'polygon', 'measure'].includes(activeTool)) {
      const point = [latlng.lng, latlng.lat];
      await finishDraft(activeTool, [...draftPoints, point]);
    }
  };

  const selectFeature = useCallback((feature, layer, edit = false, focus = true) => {
    setSelectedFeatureId(feature.id);
    setSelectedLayerId(layer.id);
    if (focus) mapRef.current?.focusFeature(feature.id);
    if (edit) setFeatureDialog({ ...feature, layerId: layer.id });
  }, []);

  const uploadFeatureAttachments = async (featureId, files) => {
    try {
      setSaving(true);
      const data = await api.uploadAttachments(featureId, files);
      replaceData(data);
      setToast(`已上传 ${files.length} 个附件`);
      return attachmentsForFeature(data, featureId);
    } catch (requestError) {
      setSaving(false);
      setToast(requestError.message);
      throw requestError;
    }
  };

  const requestQuickMedia = (feature) => {
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
    setSelectedLayerId(layer.id);
    setSelectedFeatureId(null);
    setHoverPoint(null);
    window.setTimeout(() => {
      setActiveTool('route');
      setDraftPoints([feature.geometry.coordinates]);
      setToast(`已将“${feature.name}”设为路线起点，请点击地图选择终点`);
    }, 0);
  };

  const applyCardStyle = async (feature, color) => {
    try {
      await applyStyle(feature, color);
      setSelectedFeatureId(feature.id);
      setToast('地点样式已更新');
    } catch (requestError) {
      setToast(requestError.message);
    }
  };

  const saveCardDetails = async (feature, changes) => {
    try {
      setSaving(true);
      const data = await api.updateFeature(feature.id, { ...changes, expectedVersion: feature.version });
      replaceData(data);
      setSelectedFeatureId(feature.id);
      setToast('地点信息已保存');
    } catch (requestError) {
      handleWriteError(requestError);
      throw requestError;
    }
  };

  const deleteFeatureFromCard = async (feature) => {
    if (!window.confirm(`删除地点“${feature.name}”？`)) return;
    try {
      await deleteFeature(feature);
      setToast('地点已删除');
    } catch (requestError) {
      setSaving(false);
      setToast(requestError.message);
    }
  };

  const deleteFeatureAttachment = async (attachmentId, featureId) => {
    try {
      setSaving(true);
      const data = await api.deleteAttachment(attachmentId);
      replaceData(data);
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
    try {
      setSaving(true);
      const { pendingFiles = [], ...featurePayload } = payload;
      delete featurePayload.attachments;
      let featureId = payload.id;
      if (payload.id) {
        replaceData(await api.updateFeature(payload.id, {
          name: featurePayload.name,
          description: featurePayload.description,
          style: featurePayload.style,
          layerId: featurePayload.layerId,
          expectedVersion: featurePayload.version ?? payload.version,
        }));
      } else {
        const created = await addFeature(featurePayload.layerId, featurePayload);
        featureId = created.id;
        createdFeatureId = created.id;
      }
      if (pendingFiles.length) await uploadFeatureAttachments(featureId, pendingFiles);
      setFeatureDialog(null);
      if (!payload.id && featurePayload.geometry?.type === 'Point') setSelectedFeatureId(featureId);
      setToast(pendingFiles.length ? `要素已保存，并上传 ${pendingFiles.length} 个附件` : '要素已保存');
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
      const data = await api.addLayer(mapId, { name });
      const newest = data.layers.at(-1);
      setMapData(data);
      setSelectedLayerId(newest.id);
      setExpandedLayers((items) => ({ ...items, [newest.id]: true }));
      setToast('已添加图层');
    } catch (requestError) {
      handleWriteError(requestError);
    }
  };

  const renameLayer = async (layer) => {
    if (!canEdit) return;
    const name = window.prompt('重命名图层', layer.name);
    if (!name?.trim()) return;
    try {
      replaceData(await api.updateLayer(layer.id, { name: name.trim(), expectedVersion: layer.version }));
      setLayerMenu(null);
    } catch (requestError) {
      handleWriteError(requestError);
    }
  };

  const removeLayer = async (layer) => {
    if (!canEdit) return;
    if (!window.confirm(`删除“${layer.name}”及其中的 ${layer.features.length} 个要素？`)) return;
    try { await api.deleteLayer(layer.id); await loadMap(); setLayerMenu(null); } catch (requestError) { handleWriteError(requestError); }
  };

  const toggleLayer = async (layer) => {
    if (!canEdit) return;
    try {
      replaceData(await api.updateLayer(layer.id, { visible: !layer.visible, expectedVersion: layer.version }));
    } catch (requestError) {
      handleWriteError(requestError);
    }
  };

  const applyStyle = async (feature, color) => {
    if (!canEdit) return;
    try {
      replaceData(await api.updateFeature(feature.id, {
        style: { ...feature.style, color, fillColor: color },
        expectedVersion: feature.version,
      }));
      setStyleTarget(null);
    } catch (requestError) {
      handleWriteError(requestError);
    }
  };

  // Save from the inline style popover: persist name/description/layer/color but
  // keep the popover open so the user can keep editing. Closes on success only
  // when the feature moved to a different layer (its anchor row changes).
  const saveStylePopover = async (payload) => {
    try {
      setSaving(true);
      const data = await api.updateFeature(payload.id, {
        name: payload.name,
        description: payload.description,
        style: payload.style,
        layerId: payload.layerId,
        expectedVersion: payload.version,
      });
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

  const searchPlaces = async (event, query = searchQuery) => {
    event?.preventDefault();
    if (!query.trim()) return;
    const requestId = ++searchRequestRef.current;
    setSearching(true);
    setSuggestionsOpen(false);
    setActiveCandidateId(null);
    try {
      const candidates = await searchAMapPlaces(query.trim());
      if (requestId !== searchRequestRef.current) return;
      setSearchResults(candidates);
      if (candidates.length) mapRef.current?.fitPositions(candidates.map((candidate) => candidate.position), 15);
      else setToast(text('未找到相关地点，请换一个关键词。', 'No places found. Try another search.'));
    } catch (searchError) {
      if (requestId !== searchRequestRef.current) return;
      setSearchResults([]);
      setToast(`${text('搜索失败：', 'Search unavailable: ')}${searchError.message}`);
    } finally { if (requestId === searchRequestRef.current) setSearching(false); }
  };

  const selectCandidate = useCallback((candidate) => {
    setActiveCandidateId(candidate.id);
    mapRef.current?.setView(candidate.position, 16);
  }, []);

  const chooseSuggestion = (suggestion) => {
    setSearchQuery(suggestion.name);
    setSuggestionsOpen(false);
    if (suggestion.position) {
      const candidate = { ...suggestion, index: 1 };
      setSearchResults([candidate]);
      selectCandidate(candidate);
    } else searchPlaces(null, suggestion.name);
  };

  const handleSearchKey = (event) => {
    if (event.key === 'Escape') { setSuggestionsOpen(false); return; }
    if (!suggestionsOpen || !searchSuggestions.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSuggestionIndex((index) => event.key === 'ArrowDown' ? (index + 1) % searchSuggestions.length : (index - 1 + searchSuggestions.length) % searchSuggestions.length);
    } else if (event.key === 'Enter' && suggestionIndex >= 0) {
      event.preventDefault();
      chooseSuggestion(searchSuggestions[suggestionIndex]);
    }
  };

  const addSearchResult = async (candidate) => {
    if (!selectedLayer) return;
    const created = await addFeature(selectedLayer.id, {
      name: candidate.name,
      description: candidate.address,
      geometry: { type: 'Point', coordinates: candidate.position },
      style: { color: selectedLayer.style.color || '#1a73e8' },
    });
    setSearchResults((prev) => prev.filter((item) => item.id !== candidate.id));
    setActiveCandidateId(null);
    if (created) setSelectedFeatureId(created.id);
    setToast('地点已添加到地图');
  };

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedLayer) return;
    try {
      setSaving(true);
      const features = await parseImportFile(file);
      if (!features.length) throw new Error('文件中没有可识别的坐标或 GeoJSON 要素');
      replaceData(await api.importFeatures(selectedLayer.id, { fileName: file.name, format: file.name.split('.').pop(), features }));
      setToast(`已导入 ${features.length} 个要素`);
    } catch (requestError) { setSaving(false); setToast(requestError.message); }
  };

  const generateShare = async () => setShare(await api.share(mapId, 'view'));

  const toolInstruction = {
    marker: text('点击地图放置标记', 'Click the map to add a place'),
    line: text('逐点点击绘线，双击结束', 'Click to draw a line; double-click to finish'),
    polygon: text('逐点点击绘制区域，双击结束', 'Click to draw a shape; double-click to finish'),
    route: draftPoints.length ? text('再点击路线终点', 'Click your destination') : text('点击路线起点', 'Click your starting point'),
    measure: text('逐点测量，双击结束', 'Click to measure; double-click to finish'),
  }[activeTool];
  const canFinishDraft = ['line', 'measure'].includes(activeTool)
    ? draftPoints.length >= 2
    : activeTool === 'polygon' && draftPoints.length >= 3;

  if (loading) return <div className="full-loading"><span className="brand-mark"><i /><i /><i /></span><p>{t('common.loading')}</p></div>;
  if (error || !mapData) return <div className="full-error"><CircleHelp size={38} /><h1>{t('editor.mapDeleted')}</h1><p>{error}</p><button className="primary-button" onClick={() => navigate('/')}>{t('editor.backLibrary')}</button></div>;

  const activeBaseMapKey = normalizeBaseMapKey(mapData.base_map);
  const activeBaseMap = BASE_MAPS[activeBaseMapKey];
  const previewMode = new URLSearchParams(window.location.search).get('preview') === '1';
  const draftPoint = featureDialog && !featureDialog.id && featureDialog.geometry?.type === 'Point' ? featureDialog : null;
  const selectedPointContext = selectedFeatureContext?.feature.type === 'Point' ? selectedFeatureContext : null;
  const activeCandidate = searchResults.find((candidate) => candidate.id === activeCandidateId) || null;
  const mapPopup = draftPoint ? {
    position: draftPoint.geometry.coordinates,
    content: <DraftPointCard feature={draftPoint} onSave={saveFeatureDialog} onCancel={() => setFeatureDialog(null)} />,
  } : activeCandidate ? {
    position: activeCandidate.position,
    content: (
      <CandidateCard
        candidate={activeCandidate}
        canAdd={Boolean(selectedLayer)}
        onAdd={addSearchResult}
        onClose={() => setActiveCandidateId(null)}
      />
    ),
  } : selectedPointContext ? {
    position: selectedPointContext.feature.geometry.coordinates,
    content: (
      <PlaceFeatureCard
        feature={selectedPointContext.feature}
        layer={selectedPointContext.layer}
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

  const searchCandidates = searchResults.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    position: candidate.position,
    index: candidate.index,
    active: candidate.id === activeCandidateId,
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

  if (previewMode) return <PreviewEditorMap mapData={mapData} onExit={() => { window.history.replaceState({}, '', `/maps/${mapId}`); window.dispatchEvent(new PopStateEvent('popstate')); }} />;

  return (
    <main className="editor-page">
      <aside className={`editor-sidebar${sidebarCollapsed ? ' collapsed' : ''}${mobilePanelOpen ? ' mobile-open' : ''}`}>
        <button className="mobile-sidebar-close" onClick={() => setMobilePanelOpen(false)} aria-label={t('editor.collapsePanel')}><X size={20} /></button>
        <section className="map-meta-panel">
          <div className="editor-title-row">
            <button className="icon-button sidebar-back" onClick={() => navigate('/')} aria-label={t('editor.backLibrary')}><ArrowLeft size={20} /></button>
            <input className="map-title-input" value={mapData.name} onChange={(event) => setMapData({ ...mapData, name: event.target.value })} onBlur={(event) => updateMap({ name: event.target.value })} aria-label={t('editor.mapTitle')} />
            <div className="map-menu-anchor" data-map-menu-root>
              <button className="icon-button" onClick={() => setMoreMenu((value) => !value)} aria-label={t('editor.mapMenu')}><MoreVertical size={20} /></button>
              {moreMenu ? <div className="popup-menu map-more-menu"><button onClick={() => { exportKml(mapData); setMoreMenu(false); }}><Download size={16} /> {t('editor.exportKml')}</button><button onClick={() => { exportGeoJson(mapData); setMoreMenu(false); }}><Database size={16} /> {t('editor.exportGeoJson')}</button><button onClick={saveDefaultView}><LocateFixed size={16} /> {t('editor.setDefaultView')}</button></div> : null}
            </div>
          </div>
          <button className="sidebar-collapse-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? t('editor.expandPanel') : t('editor.collapsePanel')} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? t('editor.expandPanel') : t('editor.collapsePanel')}>{sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}</button>
          <textarea className="map-description-input" value={mapData.description} onChange={(event) => setMapData({ ...mapData, description: event.target.value })} onBlur={(event) => updateMap({ description: event.target.value })} aria-label={t('editor.mapDescription')} rows="2" />
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
        <DrawingToolbar activeTool={activeTool} canEdit={canEdit} onTool={(tool) => { setSelectedFeatureId(null); setActiveTool(tool); setDraftPoints([]); setHoverPoint(null); }} canUndo={history.length > 0} canRedo={redoHistory.length > 0} onUndo={undo} onRedo={redo} />
        <div className="editor-panel-tabs" role="tablist" aria-label={text('地图内容', 'Map content')}><button role="tab" aria-selected={panelTab === 'layers'} className={panelTab === 'layers' ? 'active' : ''} onClick={() => setPanelTab('layers')}>{text('图层', 'Layers')}</button><button role="tab" aria-selected={panelTab === 'places'} className={panelTab === 'places' ? 'active' : ''} onClick={() => setPanelTab('places')}>{text('地点', 'Places')}</button><span>{mapData.layers.reduce((total, layer) => total + layer.features.length, 0)} {text('个要素', 'features')}</span></div>
        {panelTab === 'places' ? <div className="editor-places-list" role="tabpanel">{mapData.layers.flatMap((layer) => layer.features.map((feature) => <button key={feature.id} className={selectedFeatureId === feature.id ? 'active' : ''} onClick={() => selectFeature(feature, layer)}><span style={{ color: feature.style?.color || layer.style.color || '#1a73e8' }}>{feature.type === 'Point' ? <MapPin size={19} /> : <Route size={19} />}</span><span><b>{feature.name}</b><small>{layer.name}</small></span></button>))}{!allFeatureIds.size ? <p>{text('在地图上添加地点，让旅程开始。', 'Add a place to start your map.')}</p> : null}</div> : null}
        <div className="layer-list" data-testid="layer-list" hidden={panelTab !== 'layers'} role="tabpanel">
          {mapData.layers.map((layer) => (
            <section key={layer.id} className={selectedLayerId === layer.id ? 'layer-section selected' : 'layer-section'} onClick={() => setSelectedLayerId(layer.id)}>
              <header className="layer-header">
                <button className="icon-button layer-expand" onClick={(event) => { event.stopPropagation(); setExpandedLayers((items) => ({ ...items, [layer.id]: !items[layer.id] })); }} aria-label={expandedLayers[layer.id] ? '收起图层' : '展开图层'}>{expandedLayers[layer.id] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>
                <input type="checkbox" checked={layer.visible} onChange={(event) => { event.stopPropagation(); toggleLayer(layer); }} aria-label={t('editor.showLayer', { name: layer.name })} />
                <button className="layer-name" onDoubleClick={() => renameLayer(layer)}>{layer.name}</button>
                <div className="layer-menu-anchor" data-layer-menu-root>
                  <button className="icon-button" onClick={(event) => { event.stopPropagation(); setLayerMenu((current) => current === layer.id ? null : layer.id); }} aria-label={`${layer.name}`}><MoreVertical size={18} /></button>
                  {layerMenu === layer.id ? <div className="popup-menu layer-popup-menu"><button onClick={() => renameLayer(layer)}><Pencil size={15} /> {t('editor.rename')}</button><button onClick={() => { setTableLayer(layer); setLayerMenu(null); }}><Table2 size={15} /> {t('editor.openTable')}</button><button onClick={() => { exportCsv(layer); setLayerMenu(null); }}><Download size={15} /> {t('editor.exportCsv')}</button><button className="danger" onClick={() => removeLayer(layer)}><Trash2 size={15} /> {t('editor.deleteLayer')}</button></div> : null}
                </div>
              </header>
              {expandedLayers[layer.id] ? <div className="layer-body">
                <button className="layer-style-row" onClick={(event) => { event.stopPropagation(); setStyleTarget(styleTarget?.layerId === layer.id && !styleTarget.feature ? null : { layerId: layer.id }); }}><Palette size={16} /> {t('editor.individualStyle')} <span>{layer.features.length}</span></button>
                {layer.features.map((feature) => {
                  const remoteEditor = peers.find((peer) => peer.userId !== user?.id && peer.selectedFeatureId === feature.id);
                  return (
                  <div key={feature.id} className={`${selectedFeatureId === feature.id ? 'feature-row active' : 'feature-row'}${remoteEditor ? ' remote-editing' : ''}`} onClick={(event) => { event.stopPropagation(); selectFeature(feature, layer); }} title={remoteEditor ? `${remoteEditor.name} 正在查看此要素` : undefined}>
                  <GripVertical className="feature-grip" size={14} />
                  <span className={`feature-symbol ${feature.type.toLowerCase()}`} style={{ '--feature-color': feature.style.color || layer.style.color || '#1a73e8' }}>{feature.type === 'Point' ? <MapPin size={15} /> : feature.type === 'Polygon' ? <Shapes size={15} /> : <Route size={15} />}</span>
                  <button className="feature-name" onDoubleClick={() => canEdit && setFeatureDialog({ ...feature, layerId: layer.id })}>{feature.name}</button>
                  <button className="mini-style-button" disabled={!canEdit} onClick={(event) => { event.stopPropagation(); setStyleTarget(styleTarget?.feature?.id === feature.id ? null : { layerId: layer.id, feature }); }} aria-label={`设置 ${feature.name} 样式`}><Palette size={14} /></button>
                  {styleTarget?.feature?.id === feature.id ? (
                    <div className="style-popover-anchor" data-style-popover-root onClick={(event) => event.stopPropagation()}>
                      <FeatureStylePopover
                        feature={feature}
                        layers={mapData.layers}
                        defaultLayerId={layer.id}
                        attachments={feature.attachments || []}
                        onSave={saveStylePopover}
                        onDelete={deleteStylePopoverFeature}
                        onUploadAttachments={uploadFeatureAttachments}
                        onDeleteAttachment={deleteFeatureAttachment}
                      />
                    </div>
                  ) : null}
                </div>
                  );
                })}
                {layer.features.length === 0 ? <div className="empty-layer-tip"><p>{t('editor.emptyLayerTip')}</p><button onClick={(event) => { event.stopPropagation(); setSelectedLayerId(layer.id); importRef.current?.click(); }}><Upload size={14} /> {t('editor.import')}</button></div> : <div className="layer-footer-actions"><button onClick={(event) => { event.stopPropagation(); setSelectedLayerId(layer.id); importRef.current?.click(); }}><Upload size={14} /> {t('editor.import')}</button><button onClick={(event) => { event.stopPropagation(); setTableLayer(layer); }}><Table2 size={14} /> {t('editor.dataTable')}</button></div>}
              </div> : null}
            </section>
          ))}
        </div>
        <div className="sidebar-bottom"><button onClick={() => navigate('/admin')}><Database size={16} /> {t('editor.dbAdmin')}</button><span>Open My Map</span></div>
      </aside>

      <section className="map-workspace">
        <button className="mobile-panel-toggle" onClick={() => setMobilePanelOpen((value) => !value)} aria-label={t('editor.layerPanel')}><Menu size={20} /></button>
        <form className="map-search-bar" onSubmit={searchPlaces}>
          <Search className="search-leading-icon" size={20} />
          <input value={searchQuery} onChange={(event) => { searchRequestRef.current += 1; setSearching(false); setSearchQuery(event.target.value); setSuggestionsOpen(true); }} onFocus={() => setSuggestionsOpen(true)} onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)} onKeyDown={handleSearchKey} placeholder={t('editor.searchPlace')} aria-label={t('editor.searchPlace')} role="combobox" aria-autocomplete="list" aria-expanded={suggestionsOpen && searchSuggestions.length > 0} aria-controls="map-search-suggestions" aria-activedescendant={suggestionIndex >= 0 && suggestionsOpen ? `map-suggestion-${suggestionIndex}` : undefined} />
          {searchQuery ? <button type="button" className="icon-button" onClick={() => { searchRequestRef.current += 1; setSearching(false); setSearchQuery(''); setSearchResults([]); setActiveCandidateId(null); setSuggestionsOpen(false); }} aria-label={t('editor.clearSearch')}><X size={18} /></button> : null}
          <button className="search-submit" aria-label={t('editor.search')} disabled={searching}><Search size={19} /></button>
          <button type="button" className="directions-shortcut" title={t('editor.toolRoute')} aria-label={t('editor.toolRoute')} disabled={!canEdit} onClick={() => { setActiveTool('route'); setDraftPoints([]); setHoverPoint(null); setSelectedFeatureId(null); }}><GitFork size={20} /></button>
        </form>
        {suggestionsOpen && searchSuggestions.length ? <div id="map-search-suggestions" className="map-search-suggestions" role="listbox" aria-label={text('地点联想', 'Suggested places')}>{searchSuggestions.map((suggestion, index) => <button key={suggestion.id} type="button" id={`map-suggestion-${index}`} role="option" aria-selected={index === suggestionIndex} className={index === suggestionIndex ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSuggestion(suggestion)}><MapPin size={18} /><span><b>{suggestion.name}</b><small>{suggestion.address || suggestion.city}</small></span></button>)}</div> : null}
        {searchResults.length ? (
          <div className="search-candidate-strip" role="list" aria-label="搜索候选序列">
            {searchResults.map((candidate) => {
              const [lng, lat] = candidate.position;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  role="listitem"
                  className={`candidate-strip-item${candidate.id === activeCandidateId ? ' active' : ''}`}
                  onClick={() => selectCandidate(candidate)}
                  title={candidate.address || candidate.name}
                >
                  <span className="candidate-strip-item-no">{candidate.index}</span>
                  <span className="candidate-strip-item-main">
                    <span className="candidate-strip-item-name">{candidate.name}</span>
                    {candidate.address ? <span className="candidate-strip-item-addr">{candidate.address}</span> : null}
                    <span className="candidate-strip-item-meta">
                      {candidate.type ? <span className="candidate-strip-item-type">{candidate.type}</span> : null}
                      <span className="candidate-strip-item-coord">{`${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        {activeTool === 'route' ? <div className="directions-mode-bar" role="group" aria-label={text('出行方式', 'Travel mode')}>{[['driving', Car, text('驾车', 'Drive')], ['walking', Footprints, text('步行', 'Walk')], ['cycling', Bike, text('骑行', 'Cycle')]].map(([mode, Icon, label]) => <button key={mode} className={routeTravelMode === mode ? 'active' : ''} aria-pressed={routeTravelMode === mode} onClick={() => setRouteTravelMode(mode)}><Icon size={17} />{label}</button>)}</div> : null}
        {toolInstruction ? <div className="tool-instruction">{draftPoints.length ? `${draftPoints.length} ${text('个顶点', 'vertices')} · ` : ''}{toolInstruction}{canFinishDraft ? <button className="finish-drawing-button" onClick={() => finishDraft()} aria-label={text('完成绘制', 'Finish drawing')}>{text('完成', 'Finish')}</button> : null}<button onClick={() => { setActiveTool('pan'); setDraftPoints([]); setHoverPoint(null); }} aria-label={text('取消绘制', 'Cancel drawing')}><X size={15} /></button></div> : null}
        {canEdit && selectedFeatureContext && activeTool === 'pan' ? <div className="selected-edit-tip">{selectedFeatureContext.feature.type === 'Point' ? text('拖动标记以调整位置', 'Drag the marker to move this place') : text('拖动顶点以调整形状', 'Drag a vertex to reshape this feature')}</div> : null}
        <span className="visually-hidden" role="status" data-testid="draft-status">{draftPoints.length ? text(`已放置 ${draftPoints.length} 个绘图顶点`, `${draftPoints.length} drawing vertices placed`) : ''}</span>
        <AmapMap
          activeTool={activeTool}
          className="editor-map"
          draftMarker={draftPoint ? { position: draftPoint.geometry.coordinates, color: draftPoint.style?.color } : null}
          draftPoints={draftPoints}
          hoverPoint={hoverPoint}
          mapData={mapData}
          editable={canEdit}
          trafficVisible={trafficVisible}
          markerColor={selectedLayer?.style.color || '#1a73e8'}
          onCandidateClick={selectCandidate}
          onFeatureSelect={(feature, layer) => selectFeature(feature, layer, false, false)}
          onFeatureGeometryChange={(feature, geometry) => persistGeometry(feature, geometry).catch(() => {})}
          onMapClick={handleMapClick}
          onMapDoubleClick={handleDoubleClick}
          onMouseMove={(point) => setHoverPoint(activeTool === 'pan' || !point ? null : [point.lng, point.lat])}
          onMoveEnd={(center) => { currentCenterRef.current = center; }}
          onPopupClose={() => setActiveCandidateId(null)}
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
        <div className="map-control-stack"><button onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.querySelector('.editor-page').requestFullscreen) await document.querySelector('.editor-page').requestFullscreen(); else setToast(text('当前浏览器不支持全屏。', 'Fullscreen is unavailable.')); } catch { setToast(text('无法进入全屏。', 'Unable to enter fullscreen.')); } }} aria-label={text('全屏', 'Fullscreen')}>{fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}</button><span /><button onClick={locateUser} aria-label={t('editor.locate')}><LocateFixed size={19} /></button><span /><button disabled={zoomState.zoom === null || zoomState.zoom >= zoomState.maxZoom} onClick={() => mapRef.current?.zoomIn()} aria-label={t('editor.zoomIn')}><ZoomIn size={19} /></button><button disabled={zoomState.zoom === null || zoomState.zoom <= zoomState.minZoom} onClick={() => mapRef.current?.zoomOut()} aria-label={t('editor.zoomOut')}><ZoomOut size={19} /></button></div>
        <section className={`base-map-stack${basePicker ? ' open' : ''}`} data-base-picker-root aria-label={t('editor.basemap')}>
          <button className="base-map-stack-toggle" onClick={() => setBasePicker((value) => !value)} aria-expanded={basePicker} aria-label={t('editor.switchBasemap', { name: activeBaseMap.name })} title={`${t('editor.basemap')} · ${activeBaseMap.name}`}>
            <span className="base-map-stack-thumb" style={baseMapPreviewStyle(activeBaseMapKey)} />
            <Layers size={15} />
            <span className="base-map-toggle-label">{t('editor.basemap')}</span>
          </button>
          {basePicker ? (
            <div className="base-map-stack-fan">
              {Object.entries(BASE_MAPS).map(([key, value]) => (
                <button key={key} type="button" className={activeBaseMapKey === key ? 'active' : ''} aria-pressed={activeBaseMapKey === key} aria-label={`${value.name}（${value.provider}）`} title={`${value.englishName} · ${value.description}`} onClick={() => { updateMap({ base_map: key }); setBasePicker(false); }}>
                  <span className="base-map-stack-card" style={baseMapPreviewStyle(key)} />
                  <span className="base-map-stack-label">{value.name}</span>
                </button>
              ))}
              <button type="button" className={`traffic-toggle${trafficVisible ? ' active' : ''}`} aria-pressed={trafficVisible} onClick={() => setTrafficVisible((visible) => !visible)}><Car size={22} /><span className="base-map-stack-label">{text('实时路况', 'Traffic')}</span></button>
            </div>
          ) : null}
        </section>
      </section>

      <input ref={importRef} type="file" className="visually-hidden" accept=".csv,.tsv,.geojson,.json,.kml,.gpx" onChange={importFile} />
      <input ref={quickMediaInputRef} type="file" className="visually-hidden" accept={MEDIA_ACCEPT} multiple onChange={handleQuickMediaSelection} aria-label="上传地点图片或视频" />
      {featureDialog && !draftPoint ? <FeatureDialog feature={featureDialog} layers={mapData.layers} defaultLayerId={selectedLayer?.id} onSave={saveFeatureDialog} onUploadAttachments={uploadFeatureAttachments} onDeleteAttachment={deleteFeatureAttachment} onDelete={(feature) => { if (window.confirm(`删除“${feature.name}”？`)) { deleteFeature(feature); setFeatureDialog(null); } }} onClose={() => setFeatureDialog(null)} /> : null}
      {shareDialog ? <ShareDialog map={mapData} share={share} onGenerate={generateShare} onClose={() => setShareDialog(false)} /> : null}
      {tableLayer ? <DataTableDialog layer={mapData.layers.find((layer) => layer.id === tableLayer.id) || tableLayer} onEdit={(feature) => setFeatureDialog({ ...feature, layerId: tableLayer.id })} onDelete={(feature) => deleteFeature(feature)} onClose={() => setTableLayer(null)} /> : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </main>
  );
}

function PreviewEditorMap({ mapData, onExit }) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedContext, setSelectedContext] = useState(null);
  const popup = selectedContext?.feature.type === 'Point' ? {
    position: selectedContext.feature.geometry.coordinates,
    content: <div className="feature-popup"><b>{selectedContext.feature.name}</b><p>{selectedContext.feature.description || selectedContext.layer.name}</p><FeatureMediaGallery attachments={selectedContext.feature.attachments} featureName={selectedContext.feature.name} compact /></div>,
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
        onFeatureSelect={(feature, layer) => setSelectedContext({ feature, layer })}
        onMapClick={() => setSelectedContext(null)}
        popup={popup}
        selectedFeatureId={selectedContext?.feature.id || null}
        showZoomControls
      />
    </main>
  );
}
