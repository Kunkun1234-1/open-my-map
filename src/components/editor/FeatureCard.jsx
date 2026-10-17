import { useEffect, useRef, useState } from 'react';
import { Camera, GitFork, MapPin, Move, PaintBucket, Pencil, Route, Ruler, Shapes, Trash2, X } from 'lucide-react';
import FeatureMediaGallery from '../FeatureMediaGallery.jsx';
import { geometryCoordinates } from '../map-engine-utils.js';
import { formatRouteDuration } from '../../routing.js';
import { formatArea, formatDistance } from './MeasurePanel.jsx';
import { measurementArea, measurementDistance } from './measurement.js';
import MarkerStylePopover from './MarkerStylePopover.jsx';

export const COLORS = ['#1a73e8', '#00897b', '#8e24aa', '#e85d4a', '#f9ab00', '#d93025', '#5f6368', '#039be5'];

export default function FeatureCard({ feature, layer, canEdit, busy = false, lang, onClose, onCopyCoordinates, onStyle, onStylePreview, onSave, onMedia, onRoute, onAdjust, onDelete }) {
  const [styleOpen, setStyleOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(feature.name);
  const [draftDescription, setDraftDescription] = useState(feature.description || '');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const styleButtonRef = useRef(null);
  const text = (zh, en) => lang === 'en' ? en : zh;
  const isPoint = feature.type === 'Point';
  const isPolygon = feature.type === 'Polygon';
  const routeData = feature.style?.routeData;
  const coordinates = isPoint ? `${Number(feature.geometry.coordinates[1]).toFixed(5)}, ${Number(feature.geometry.coordinates[0]).toFixed(5)}` : '';
  const rings = isPolygon ? feature.geometry.coordinates : [];
  const distance = routeData && Number.isFinite(routeData.distance) ? routeData.distance
    : isPolygon ? rings.reduce((total, ring) => total + measurementDistance(ring, true), 0)
      : measurementDistance(geometryCoordinates(feature.geometry));
  const area = isPolygon ? Math.max(0, measurementArea(rings[0] || []) - rings.slice(1).reduce((total, ring) => total + measurementArea(ring), 0)) : 0;
  const description = feature.description?.trim();
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
      className="my-maps-place-card feature-detail-card"
      aria-label={`${feature.name} ${isPoint ? text('地点详情', 'place details') : text('详情', 'details')}`}
      onClickCapture={(event) => { event.nativeEvent.openMyMapCardInteraction = true; }}
    >
      {editing && canEdit ? (
        <form className="place-card-edit-form" onSubmit={saveInlineEdit}>
          <div className="place-card-edit-fields">
            <input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} aria-label={isPoint ? '地点名称' : '要素名称'} />
            <textarea rows="3" value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} aria-label={isPoint ? '地点说明' : '要素说明'} placeholder="添加说明" />
            {editError ? <p role="alert">{editError}</p> : null}
          </div>
          <button type="button" className="place-card-close" onClick={onClose} aria-label={isPoint ? '关闭地点详情' : '关闭要素详情'} title="关闭"><X size={21} /></button>
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
              {description ? <p>{description}</p> : null}
            </div>
            <button type="button" className="place-card-close" onClick={onClose} aria-label={isPoint ? '关闭地点详情' : '关闭要素详情'} title="关闭"><X size={21} /></button>
          </header>
          <FeatureMediaGallery attachments={feature.attachments} featureName={feature.name} compact />
          <footer className="place-card-footer">
            {isPoint ? <button type="button" className="place-card-coordinates" onClick={onCopyCoordinates} aria-label={`复制坐标 ${coordinates}`} title="复制坐标">
              <MapPin size={14} /><span>{coordinates}</span>
            </button> : <div className="feature-card-metrics">
              {isPolygon ? <span title={text('面积', 'Area')} aria-label={`${text('面积', 'Area')} ${formatArea(area, lang)}`}><Shapes size={15} />{formatArea(area, lang)}</span> : null}
              <span title={isPolygon ? text('周长', 'Perimeter') : text('长度', 'Length')} aria-label={`${isPolygon ? text('周长', 'Perimeter') : text('长度', 'Length')} ${formatDistance(distance, lang)}`}><Ruler size={15} />{formatDistance(distance, lang)}</span>
              {routeData && Number.isFinite(routeData.duration) ? <span>{formatRouteDuration(routeData.duration, lang)}</span> : null}
            </div>}
            <nav className="place-card-actions" aria-label={isPoint ? '地点操作' : '要素操作'}>
              {canEdit ? <>
              {!(routeData && onRoute) ? <button type="button" disabled={busy} onClick={() => { setStyleOpen(false); onAdjust(); }} aria-label={isPoint ? text('调整位置', 'Adjust position') : text('调整形状', 'Adjust shape')} title={isPoint ? text('调整位置', 'Adjust position') : text('调整形状', 'Adjust shape')}><Move size={18} /></button> : null}
              <button ref={styleButtonRef} type="button" disabled={busy} className={styleOpen ? 'active' : ''} onClick={() => setStyleOpen((open) => !open)} aria-label={isPoint ? '设置地点样式' : '设置要素样式'} aria-expanded={styleOpen} aria-haspopup="dialog" title="设置样式"><PaintBucket size={18} /></button>
              <button type="button" disabled={busy} onClick={() => { setStyleOpen(false); setEditing(true); }} aria-label={isPoint ? '编辑地点' : '编辑要素信息'} title="编辑信息"><Pencil size={18} /></button>
              <button type="button" disabled={busy} onClick={onMedia} aria-label="上传图片或视频" title="添加图片或视频"><Camera size={18} /></button></> : null}
              {isPoint && onRoute ? <button type="button" onClick={onRoute} aria-label="以此地点为路线起点" title="添加路线"><GitFork size={18} /></button> : null}
              {canEdit ? <button type="button" disabled={busy} className="danger" onClick={onDelete} aria-label={isPoint ? '删除地点' : '删除要素'} title="删除"><Trash2 size={18} /></button> : null}
            </nav>

          </footer>
          {styleOpen && canEdit ? <MarkerStylePopover onPreview={onStylePreview} busy={busy} featureType={feature.type} featureStyle={feature.style} layerStyle={layer.style} showIcons={isPoint} anchorRef={styleButtonRef} name={feature.name} color={currentColor} icon={feature.style?.icon || layer.style?.icon} inheritIcon={!feature.style?.icon} lang={lang} onSave={onStyle} onClose={() => setStyleOpen(false)} /> : null}
          {routeData && onRoute ? <div className="feature-card-edit-actions">
            <button type="button" onClick={onRoute}><Route size={15} />{canEdit ? text('编辑路线', 'Edit directions') : text('查看路线', 'View directions')}</button>
          </div> : null}
        </>
      )}
    </article>
  );
}
