import { useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import FeatureMediaGallery from './FeatureMediaGallery.jsx';
import './story-presentation.css';

function ignoresStoryKeys(target) {
  if (!(target instanceof Element)) return false;
  const tagName = target.tagName.toLowerCase();
  return ['input', 'textarea', 'select', 'button', 'video', 'audio', 'a'].includes(tagName)
    || target.isContentEditable
    || Boolean(target.closest('[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], [role="slider"], video, audio, a, button'));
}

export default function StoryPresentation({ records = [], selectedId, showDetails = false, onCloseDetails, onSelect, text }) {
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

  return <section className="story-presentation" aria-label={text('故事浏览', 'Story browsing')}>
    {showDetails ? <article className="story-presentation-card" role="dialog" aria-label={feature.name}>
      <header>
        <div>
          <span>{layer.name}</span>
          <h2>{feature.name}</h2>
        </div>
        <button type="button" onClick={onCloseDetails} aria-label={text('隐藏详情', 'Hide details')} title={text('隐藏详情', 'Hide details')}><X size={18} /></button>
      </header>
      {feature.description ? <p>{feature.description}</p> : null}
      <FeatureMediaGallery attachments={feature.attachments} featureName={feature.name} compact />
    </article> : null}

    <nav className="story-presentation-nav" aria-label={text('按顺序浏览', 'Browse in story order')}>
      <button type="button" disabled={!previous} onClick={() => choose(previous)} aria-label={text('上一个', 'Previous')} title={text('上一个', 'Previous')}><ChevronLeft size={22} /></button>
      <button type="button" disabled={!next} onClick={() => choose(next)} aria-label={text('下一个', 'Next')} title={text('下一个', 'Next')}><ChevronRight size={22} /></button>
    </nav>
  </section>;
}
