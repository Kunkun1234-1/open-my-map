import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import useProtectedImage from '../../useProtectedImage.js';
import { getHeroTitle, getHomeSlides } from './heroContent.js';
import './asset-feedback.css';

const ATLAS_PLATES = [
  '/images/paris-map.webp',
  '/images/hero-coastal-watercolor-v1.webp',
  '/images/hero-mountain-contours-v1.webp',
];

export default function LibraryHero({
  t,
  slide,
  setSlide,
  onCreateMap,
  onCreateProject,
  user,
  backgroundUrlOverride,
  titlesOverride,
  slidesOverride,
}) {
  const slides = slidesOverride?.length ? slidesOverride : getHomeSlides(user);
  const activeIndex = Math.min(Math.max(0, slide), slides.length - 1);
  const activeSlide = slides[activeIndex];
  const savedBackground = useProtectedImage(backgroundUrlOverride === undefined ? activeSlide.backgroundUrl : '');
  const background = backgroundUrlOverride ?? savedBackground.url;
  const title = getHeroTitle(t, activeIndex, titlesOverride ?? slides.map((item) => item.title));
  const leadTitle = title === 'Map your ideas,\nexplore a bigger world.';
  const dotsRef = useRef(null);
  useEffect(() => {
    const dots = dotsRef.current;
    const activeDot = dots?.children[activeIndex];
    if (!dots || !activeDot) return;
    const left = activeDot.offsetLeft - dots.offsetLeft;
    if (left < dots.scrollLeft) dots.scrollLeft = left;
    else if (left + activeDot.offsetWidth > dots.scrollLeft + dots.clientWidth) {
      dots.scrollLeft = left + activeDot.offsetWidth - dots.clientWidth;
    }
  }, [activeIndex, slides.length]);

  return (
    <section
      className="workspace-hero"
      data-slide-id={activeSlide.id}
      aria-roledescription="carousel"
      aria-label={title.replace(/\n/g, ' ')}
    >
      <div className="workspace-hero-copy">
        <h1>{leadTitle ? <>Map your ideas,<br />explore a <em>bigger world.</em></> : title}</h1>
        {onCreateMap || onCreateProject ? (
          <div className="workspace-hero-actions">
            {onCreateMap ? <button type="button" className="dashboard-primary" onClick={onCreateMap}>
              {t('library.createMap')}
            </button> : null}
            {onCreateProject ? <button type="button" className="dashboard-secondary" onClick={onCreateProject}>
              {t('library.createProject')}
            </button> : null}
          </div>
        ) : null}
      </div>
      <div className="workspace-hero-art" aria-hidden="true">
        <img
          className={background ? 'is-custom' : activeIndex === 0 ? 'is-paris-plate' : undefined}
          src={background || ATLAS_PLATES[Math.min(activeIndex, 2)]}
          alt=""
          fetchPriority="high"
          decoding="async"
        />
      </div>
      {backgroundUrlOverride === undefined && savedBackground.error ? (
        <div className="dashboard-asset-feedback dashboard-asset-feedback--hero" role="alert">
          <span>{t('dashboard.assetLoadFailed')}</span>
          <button type="button" onClick={savedBackground.retry}>{t('dashboard.retryImage')}</button>
        </div>
      ) : null}
      {slides.length > 1 ? (
        <div className="workspace-hero-caption">
          <div className="workspace-hero-pagination">
            <div className="workspace-hero-dots" ref={dotsRef}>
              {slides.map((item, value) => (
                <button
                  type="button"
                  key={item.id}
                  className={value === activeIndex ? 'active' : ''}
                  onClick={() => setSlide(value)}
                  aria-label={t('dashboard.slide', { n: value + 1 })}
                  aria-pressed={value === activeIndex}
                />
              ))}
            </div>
            <span>{String(activeIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</span>
            <button type="button" className="workspace-hero-arrow"
              onClick={() => setSlide((activeIndex + slides.length - 1) % slides.length)}
              aria-label={t('dashboard.previousSlide')} title={t('dashboard.previousSlide')}>
              <ArrowLeft size={15} strokeWidth={1.5} />
            </button>
            <button type="button" className="workspace-hero-arrow"
              onClick={() => setSlide((activeIndex + 1) % slides.length)}
              aria-label={t('dashboard.nextSlide')} title={t('dashboard.nextSlide')}>
              <ArrowRight size={15} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
