import { useEffect, useMemo, useRef } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, MapPin, X } from 'lucide-react';
import FeatureMediaGallery from './FeatureMediaGallery.jsx';
import './story-presentation.css';

function ignoresStoryKeys(target) {
  if (!(target instanceof Element)) return false;
  const tagName = target.tagName.toLowerCase();
  return ['input', 'textarea', 'select', 'button', 'video', 'audio', 'a'].includes(tagName)
    || target.isContentEditable
    || Boolean(target.closest('[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], [role="slider"], video, audio, a, button'));
}

export default function StoryPresentation({ records = [], selectedId, showDetails = false, onCloseDetails, onOpenDetails, onSelect, onLocate, placement = 'overlay', text }) {
  const reopenRef = useRef(null);
  const closeRef = useRef(null);
  const currentIndex = useMemo(() => {
    const selectedIndex = records.findIndex(({ feature }) => feature.id === selectedId);
    return selectedIndex >= 0 ? selectedIndex : 0;
  }, [records, selectedId]);
  const current = records[currentIndex] || null;
  useEffect(() => {
    if (!current || records.length < 2) return undefined;
    function handleKeyDown(event) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || ignoresStoryKeys(event.target)) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const nextIndex = currentIndex + (event.key === 'ArrowLeft' ? -1 : 1);
      const next = records[nextIndex];
      if (!next) return;
      event.preventDefault();
      onSelect(next.feature, next.layer);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [current, currentIndex, onSelect, records]);

  if (!current) return null;

  const { feature, layer } = current;
  const previous = records[currentIndex - 1];
  const next = records[currentIndex + 1];
  const choose = (record) => {
    if (!record) return;
    onSelect(record.feature, record.layer);
  };

  const rail = placement === 'rail';
  const navigation = (
    <nav className="story-presentation-nav" aria-label={text('按顺序浏览', 'Browse in story order')}>
      <button type="button" disabled={!previous} onClick={() => choose(previous)} aria-label={text('上一个', 'Previous')} title={text('上一个', 'Previous')}><ChevronLeft size={rail ? 18 : 22} />{rail ? <span>{text('上一条', 'Previous')}</span> : null}</button>
      {rail ? <span className="story-position">{currentIndex + 1} / {records.length}</span> : null}
      <button type="button" disabled={!next} onClick={() => choose(next)} aria-label={text('下一个', 'Next')} title={text('下一个', 'Next')}>{rail ? <span>{text('下一条', 'Next')}</span> : null}<ChevronRight size={rail ? 18 : 22} /></button>
    </nav>
  );

  return <section className={`story-presentation${rail ? ' story-presentation-rail' : ''}`} aria-label={text('故事浏览', 'Story browsing')}>
    {showDetails ? <article className="story-presentation-card" role={rail ? 'region' : 'dialog'} aria-label={feature.name}>
      <header>
        <div>
          <span>{layer.name}</span>
          <h2>{feature.name}</h2>
        </div>
        <button ref={closeRef} type="button" onClick={() => { onCloseDetails?.(); requestAnimationFrame(() => reopenRef.current?.focus()); }} aria-label={text('隐藏详情', 'Hide details')} title={text('隐藏详情', 'Hide details')}><X size={18} /></button>
      </header>
      {rail ? <FeatureMediaGallery attachments={feature.attachments} featureName={feature.name} /> : null}
      {feature.description ? <p>{feature.description}</p> : null}
      {!rail ? <FeatureMediaGallery attachments={feature.attachments} featureName={feature.name} compact /> : null}
      {rail && onLocate ? <button type="button" className="story-locate" onClick={onLocate}><MapPin size={15} />{text('在地图上定位', 'Show on map')}</button> : null}
      {rail ? navigation : null}
    </article> : null}

    {!rail ? navigation : !showDetails ? onOpenDetails ? <div className="story-presentation-minimized">
      <button ref={reopenRef} type="button" className="story-presentation-reopen" aria-label={text('展开详情', 'Show details')} aria-expanded={false} onClick={() => { onOpenDetails(); requestAnimationFrame(() => closeRef.current?.focus()); }}>
        <MapPin size={17} aria-hidden="true" />
        <span><strong>{feature.name}</strong><small>{text('展开详情', 'Show details')}</small></span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {navigation}
    </div> : navigation : null}
  </section>;
}
