import { ArrowLeft, ArrowRight, Folder, Plus, Settings2 } from 'lucide-react';
import useProtectedImage from '../../useProtectedImage.js';
import { getHeroTitle } from './heroContent.js';

export default function LibraryHero({
  t,
  slide,
  setSlide,
  onCreateMap,
  onCreateProject,
  user,
  backgroundUrlOverride,
  titlesOverride,
  onSettings,
}) {
  const savedBackground = useProtectedImage(backgroundUrlOverride === undefined ? user?.homeBackgroundUrl : '');
  const background = backgroundUrlOverride ?? savedBackground;
  const title = getHeroTitle(t, slide, titlesOverride ?? user?.homeHeroTitles);
  return (
    <section
      className={`dashboard-hero dashboard-hero--${slide}`}
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
      {onSettings ? <button type="button" className="dashboard-hero-settings" onClick={onSettings} aria-label={t('profile.homeAppearance')} title={t('profile.homeAppearance')}><Settings2 size={16} /></button> : null}
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
