import { useEffect, useMemo, useState } from 'react';
import { Eye, Layers, Menu, Search, Share2, X } from 'lucide-react';
import { api } from '../api.js';
import { navigate } from '../App.jsx';
import { LanguageSwitch, useI18n } from '../i18n/index.jsx';
import AmapMap from './AmapMap.jsx';
import FeatureMediaGallery from './FeatureMediaGallery.jsx';

export default function PublicView({ token }) {
  const { t } = useI18n();
  const [mapData, setMapData] = useState(null);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState({});
  const [selectedContext, setSelectedContext] = useState(null);

  useEffect(() => {
    api.publicMap(token).then((data) => {
      setMapData(data);
      setVisible(Object.fromEntries(data.layers.map((layer) => [layer.id, layer.visible])));
      document.title = `${data.name} - Open My Map`;
    }).catch((requestError) => setError(requestError.message));
  }, [token]);

  const filteredLayers = useMemo(() => mapData?.layers.map((layer) => ({
    ...layer,
    features: layer.features.filter((feature) => !query || feature.name.toLowerCase().includes(query.toLowerCase())),
  })) || [], [mapData, query]);
  const renderedMapData = useMemo(() => mapData ? {
    ...mapData,
    layers: filteredLayers.map((layer) => ({ ...layer, visible: Boolean(visible[layer.id]) })),
  } : null, [filteredLayers, mapData, visible]);
  const selectedFeatureVisible = renderedMapData?.layers.some((layer) => (
    layer.visible && layer.features.some((feature) => feature.id === selectedContext?.feature.id)
  ));
  const visibleSelectedContext = selectedFeatureVisible ? selectedContext : null;

  if (error) return <div className="full-error"><X size={36} /><h1>{t('editor.mapDeleted')}</h1><p>{error}</p><button className="primary-button" onClick={() => navigate('/')}>Open My Map</button></div>;
  if (!mapData) return <div className="full-loading"><span className="brand-mark"><i /><i /><i /></span><p>{t('public.loading')}</p></div>;

  const popup = visibleSelectedContext?.feature.type === 'Point' ? {
    position: visibleSelectedContext.feature.geometry.coordinates,
    content: <div className="feature-popup"><b>{visibleSelectedContext.feature.name}</b><p>{visibleSelectedContext.feature.description || visibleSelectedContext.layer.name}</p><FeatureMediaGallery attachments={visibleSelectedContext.feature.attachments} featureName={visibleSelectedContext.feature.name} compact /></div>,
  } : null;

  return (
    <main className="public-map-page">
      <aside className={panelOpen ? 'public-view-panel' : 'public-view-panel closed'}>
        <header className="public-view-header">
          <button className="icon-button" onClick={() => setPanelOpen((value) => !value)} aria-label={t('editor.collapsePanel')}><Menu size={21} /></button>
          <div><h1>{mapData.name}</h1><p>{mapData.description}</p></div>
          <LanguageSwitch className="public-lang-switch" />
          <button className="icon-button" onClick={() => navigator.clipboard.writeText(window.location.href)} aria-label={t('editor.share')}><Share2 size={19} /></button>
        </header>
        <div className="public-meta"><Eye size={15} /> {t('editor.readOnly')} · Open My Map</div>
        <label className="public-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('editor.searchPlace')} /></label>
        <div className="public-layers">
          {filteredLayers.map((layer) => <section key={layer.id}>
            <label><input type="checkbox" checked={Boolean(visible[layer.id])} onChange={() => setVisible((state) => ({ ...state, [layer.id]: !state[layer.id] }))} /><span className="layer-dot" style={{ background: layer.style.color || '#1a73e8' }} /><b>{layer.name}</b></label>
            {visible[layer.id] ? layer.features.map((feature) => <p key={feature.id}>{feature.name}{feature.attachments?.length ? <span className="public-media-count">{feature.attachments.length}</span> : null}</p>) : null}
          </section>)}
        </div>
        <footer><Layers size={16} /> Open My Map</footer>
      </aside>
      {!panelOpen ? <button className="public-panel-open" onClick={() => setPanelOpen(true)}><Menu size={20} /> {mapData.name}</button> : null}
      <AmapMap
        className="public-map"
        mapData={renderedMapData}
        onFeatureSelect={(feature, layer) => setSelectedContext({ feature, layer })}
        onMapClick={() => setSelectedContext(null)}
        popup={popup}
        selectedFeatureId={visibleSelectedContext?.feature.id || null}
        showZoomControls
      />
    </main>
  );
}
