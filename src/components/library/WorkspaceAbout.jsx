import { ArrowRight, Mail, MapPin, Route, Users } from 'lucide-react';

const contactEmail = 'hello@maptalk.example';
const useCases = [
  { key: 'places', Icon: MapPin },
  { key: 'routes', Icon: Route },
  { key: 'collaboration', Icon: Users },
];

export default function WorkspaceAbout({ lang, t, onOpenMaps }) {
  const english = lang === 'en';

  return (
    <section className="workspace-about" aria-labelledby="workspace-about-heading">
      <header className="workspace-about-intro">
        <div className="workspace-about-copy">
          <h1 id="workspace-about-heading">{t('dashboard.aboutPage.title')}</h1>
          <p>{t('dashboard.aboutPage.intro')}</p>
          <div className="workspace-about-actions">
            <button type="button" className="dashboard-primary" onClick={onOpenMaps}>
              {t('dashboard.aboutPage.openMaps')}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="workspace-about-brand">
          <img
            className="workspace-about-mark"
            src={english ? '/images/map-talk-logo-en.svg' : '/images/map-talk-logo-zh.svg'}
            width="320"
            height="90"
            alt={english ? 'Map Talk' : t('common.appName')}
          />
        </div>
      </header>

      <section className="workspace-about-uses" aria-labelledby="workspace-about-uses-title">
        <h2 id="workspace-about-uses-title">{t('dashboard.aboutPage.uses')}</h2>
        <ul className="workspace-about-cases">
          {useCases.map(({ key, Icon }) => (
            <li key={key}>
              <Icon size={23} aria-hidden="true" />
              <h3>{t(`dashboard.aboutPage.${key}.title`)}</h3>
              <p>{t(`dashboard.aboutPage.${key}.description`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="workspace-about-contact" id="workspace-about-contact" aria-labelledby="workspace-about-contact-title">
        <div>
          <h2 id="workspace-about-contact-title">{t('dashboard.aboutPage.contact')}</h2>
          <p>{t('dashboard.aboutPage.contactDescription')}</p>
          <p className="workspace-about-contact-note">{t('dashboard.aboutPage.exampleEmail')}</p>
        </div>
        <div className="workspace-about-actions">
          <a className="dashboard-primary" href={`mailto:${contactEmail}`}>
            <Mail size={16} aria-hidden="true" />
            {contactEmail}
          </a>
        </div>
      </section>
    </section>
  );
}
