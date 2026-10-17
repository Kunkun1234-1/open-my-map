import { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { api } from '../../api.js';
import { AMAP_CONFIGURED } from '../../amap.js';
import AmapMap from '../AmapMap.jsx';
import { previewViewport } from './mapPreview.js';
import './map-card-preview.css';

// Only visible cards create a map. Scrolling a card away releases its renderer.
export default function MapCardPreview({ mapId, t }) {
  const hostRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [readyKey, setReadyKey] = useState('');
  const [size, setSize] = useState({ width: 0, height: 0 });
  const renderKey = `${size.width}:${size.height}`;
  const ready = visible && readyKey === renderKey;

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setSize((current) => current.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, []);
  const preview = useMemo(() => data ? previewViewport(data, size.width, size.height) : null, [data, size]);

  useEffect(() => {
    if (!window.IntersectionObserver) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
    }, { rootMargin: '64px' });
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || data || !AMAP_CONFIGURED) return;
    let active = true;
    setFailed(false);
    api.mapPreview(mapId).then((preview) => {
      if (active) setData(preview);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [visible, mapId, data]);

  useEffect(() => {
    if (!visible) setReadyKey('');
    const host = hostRef.current;
    const observer = new MutationObserver(() => {
      if (host.querySelector('[data-amap-status="error"]')) setFailed(true);
    });
    observer.observe(host, { attributes: true, subtree: true, attributeFilter: ['data-amap-status'] });
    return () => observer.disconnect();
  }, [visible]);

  const unavailable = failed || !AMAP_CONFIGURED;
  return (
    <div ref={hostRef} className="dashboard-map-preview" data-preview-state={unavailable ? 'unavailable' : ready ? 'ready' : 'loading'} aria-hidden="true" inert>
      {visible && preview && size.width > 0 && !unavailable ? (
        <AmapMap key={renderKey} mapData={preview} thumbnail poiEnabled={false}
          onReady={() => setReadyKey(renderKey)} />
      ) : null}
      {!ready || unavailable ? <div className="dashboard-map-preview-status">
        <MapIcon size={21} strokeWidth={1.4} />
        <span>{t(unavailable ? 'dashboard.mapPreviewUnavailable' : 'dashboard.mapPreviewLoading')}</span>
      </div> : null}
    </div>
  );
}
