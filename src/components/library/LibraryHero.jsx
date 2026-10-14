import { ArrowLeft, ArrowRight, Folder, Plus } from 'lucide-react';

export default function LibraryHero({
  t,
  slide,
  setSlide,
  onCreateMap,
  onCreateProject,
}) {
  const suffix = slide === 0 ? '' : slide + 1;
  return (
    <section
      className={`dashboard-hero dashboard-hero--${slide}`}
      aria-label={t('dashboard.heroTitle')}
    >
      <div className="dashboard-hero-copy">
        <p className="dashboard-eyebrow">{t('dashboard.eyebrow')}</p>
        <h1>
          {t(`dashboard.heroTitle${suffix}`)}
          <br />
          {t(`dashboard.heroTitleSecond${suffix}`)}
        </h1>
        <p className="dashboard-hero-description">
          {t(`dashboard.heroDescription${suffix}`)}
        </p>
        <div className="dashboard-hero-actions">
          <button className="dashboard-primary" onClick={onCreateMap}>
            <Plus size={17} />
            {t('library.createMap')}
          </button>
          <button className="dashboard-secondary" onClick={onCreateProject}>
            <Folder size={17} />
            {t('library.createProject')}
          </button>
        </div>
      </div>
      <div className="dashboard-hero-pagination">
        <div className="dashboard-hero-dots">
          {[0, 1, 2].map((value) => (
            <button
              key={value}
              className={value === slide ? 'active' : ''}
              onClick={() => setSlide(value)}
              aria-label={t('dashboard.slide', { n: value + 1 })}
              aria-pressed={value === slide}
            />
          ))}
        </div>
        <span>0{slide + 1} / 03</span>
        <button
          className="dashboard-carousel-arrow"
          onClick={() => setSlide((slide + 2) % 3)}
          aria-label={t('dashboard.previousSlide')}
        >
          <ArrowLeft size={15} />
        </button>
        <button
          className="dashboard-carousel-arrow next"
          onClick={() => setSlide((slide + 1) % 3)}
          aria-label={t('dashboard.nextSlide')}
        >
          <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}
