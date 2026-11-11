import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Folder, Plus } from 'lucide-react';
import useProtectedImage from '../../useProtectedImage.js';
import { getHeroTitle, getHomeSlides } from './heroContent.js';
import './asset-feedback.css';

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
      className={`dashboard-hero dashboard-hero--${activeIndex}`}
      data-slide-id={activeSlide.id}
      aria-roledescription="carousel"
      aria-label={title.replace(/\n/g, ' ')}
      style={background ? { backgroundImage: `url(${JSON.stringify(background)})` } : undefined}
    >
      <div className="dashboard-hero-copy">
        <h1>{title}</h1>
        {onCreateMap || onCreateProject ? (
        <div className="dashboard-hero-actions">
          {onCreateMap ? <button className="dashboard-primary" onClick={onCreateMap}>
            <Plus size={17} />
            {t('library.createMap')}
          </button> : null}
          {onCreateProject ? <button className="dashboard-secondary" onClick={onCreateProject}>
            <Folder size={17} />
            {t('library.createProject')}
          </button> : null}
        </div>
        ) : null}
      </div>
      {backgroundUrlOverride === undefined && savedBackground.error ? (
        <div className="dashboard-asset-feedback dashboard-asset-feedback--hero" role="alert">
          <span>{t('dashboard.assetLoadFailed')}</span>
          <button type="button" onClick={savedBackground.retry}>
            {t('dashboard.retryImage')}
          </button>
        </div>
      ) : null}
      {slides.length > 1 ? <div className="dashboard-hero-pagination">
        <div className="dashboard-hero-dots" ref={dotsRef}>
          {slides.map((item, value) => (
            <button
              key={item.id}
              className={value === activeIndex ? 'active' : ''}
              onClick={() => setSlide(value)}
              aria-label={t('dashboard.slide', { n: value + 1 })}
              aria-pressed={value === activeIndex}
            />
          ))}
        </div>
        <span>{String(activeIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</span>
        <button
          className="dashboard-carousel-arrow"
          onClick={() => setSlide((activeIndex + slides.length - 1) % slides.length)}
          aria-label={t('dashboard.previousSlide')}
          title={t('dashboard.previousSlide')}
        >
          <ArrowLeft size={18} />
        </button>
        <button
          className="dashboard-carousel-arrow next"
          onClick={() => setSlide((activeIndex + 1) % slides.length)}
          aria-label={t('dashboard.nextSlide')}
          title={t('dashboard.nextSlide')}
        >
          <ArrowRight size={18} />
        </button>
      </div> : null}
    </section>
  );
}
