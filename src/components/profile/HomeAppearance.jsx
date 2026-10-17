import { useEffect, useRef, useState } from 'react';
import { Image, RotateCcw, Upload } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n/index.jsx';
import LibraryHero from '../library/LibraryHero.jsx';
import { getHeroTitle } from '../library/heroContent.js';
import './home-appearance.css';

const MAX_BACKGROUND_SIZE = 10 * 1024 * 1024;
const BACKGROUND_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);
const BACKGROUND_FILE_PATTERN = /\.(?:jpe?g|png|webp|gif|avif)$/i;

function initialDrafts(titles) {
  return Array.from({ length: 3 }, (_, index) => titles?.[index] || null);
}

export default function HomeAppearance() {
  const { user, refresh } = useAuth();
  const { t } = useI18n();
  const [slide, setSlide] = useState(0);
  const [drafts, setDrafts] = useState(() =>
    initialDrafts(user?.homeHeroTitles),
  );
  const [titlesDirty, setTitlesDirty] = useState(false);
  const [titlesBusy, setTitlesBusy] = useState(false);
  const [titlesError, setTitlesError] = useState('');
  const [titlesMessage, setTitlesMessage] = useState('');
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [backgroundError, setBackgroundError] = useState('');
  const [backgroundMessage, setBackgroundMessage] = useState('');
  const backgroundInputRef = useRef(null);
  const tabRefs = useRef([]);

  useEffect(() => {
    setDrafts(initialDrafts(user?.homeHeroTitles));
    setTitlesDirty(false);
    setTitlesError('');
    setTitlesMessage('');
    setSlide(0);
  }, [user?.id]);

  const updateDraft = (value) => {
    setDrafts((current) =>
      current.map((draft, index) => (index === slide ? value : draft)),
    );
    setTitlesDirty(true);
    setTitlesError('');
    setTitlesMessage('');
  };

  const resetCurrentTitle = () => {
    setDrafts((current) =>
      current.map((draft, index) => (index === slide ? null : draft)),
    );
    setTitlesDirty(true);
    setTitlesError('');
    setTitlesMessage('');
  };

  const moveTabFocus = (event, index) => {
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % 3;
    else if (event.key === 'ArrowLeft') nextIndex = (index + 2) % 3;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = 2;
    else return;
    event.preventDefault();
    setSlide(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  };

  const saveTitles = async (event) => {
    event.preventDefault();
    const payload = [];
    for (let index = 0; index < drafts.length; index += 1) {
      const draft = drafts[index];
      if (draft === null) {
        payload.push('');
        continue;
      }
      const trimmed = draft.trim();
      if (!trimmed) {
        setSlide(index);
        setTitlesError(t('profile.homeTitleRequired'));
        setTitlesMessage('');
        return;
      }
      if (trimmed.split(/\r?\n/).length > 2) {
        setSlide(index);
        setTitlesError(t('profile.homeTitleTooManyLines'));
        setTitlesMessage('');
        return;
      }
      const defaultTitle = getHeroTitle(t, index, []);
      payload.push(trimmed === defaultTitle ? '' : trimmed);
    }

    setTitlesBusy(true);
    setTitlesError('');
    setTitlesMessage('');
    try {
      await api.updateHomeAppearance({ titles: payload });
      setDrafts(initialDrafts(payload));
      setTitlesDirty(false);
      setTitlesMessage(t('profile.homeTitlesSaved'));
      await refresh();
    } catch (requestError) {
      setTitlesError(requestError.message);
    } finally {
      setTitlesBusy(false);
    }
  };

  const changeBackground = async (file) => {
    if (!file || backgroundBusy) return;
    const mimeUnknown =
      !file.type || file.type === 'application/octet-stream';
    const validType =
      BACKGROUND_TYPES.has(file.type) ||
      (mimeUnknown && BACKGROUND_FILE_PATTERN.test(file.name));
    if (!validType) {
      setBackgroundError(t('profile.homeBackgroundInvalidType'));
      setBackgroundMessage('');
      return;
    }
    if (file.size > MAX_BACKGROUND_SIZE) {
      setBackgroundError(t('profile.homeBackgroundTooLarge'));
      setBackgroundMessage('');
      return;
    }

    setBackgroundBusy(true);
    setBackgroundError('');
    setBackgroundMessage('');
    try {
      await api.uploadHomeBackground(file);
      await refresh();
      setBackgroundMessage(t('profile.homeBackgroundSaved'));
    } catch (requestError) {
      setBackgroundError(requestError.message);
    } finally {
      setBackgroundBusy(false);
    }
  };

  const resetBackground = async () => {
    if (backgroundBusy) return;
    setBackgroundBusy(true);
    setBackgroundError('');
    setBackgroundMessage('');
    try {
      await api.resetHomeBackground();
      await refresh();
      setBackgroundMessage(t('profile.homeBackgroundReset'));
    } catch (requestError) {
      setBackgroundError(requestError.message);
    } finally {
      setBackgroundBusy(false);
    }
  };

  const previewTitles = drafts.map((draft) => draft ?? '');
  const currentTitle = drafts[slide] ?? getHeroTitle(t, slide, []);

  return (
    <section id="home-appearance" className="profile-panel home-appearance-panel">
      <div className="profile-panel-heading">
        <Image size={20} />
        <div>
          <h2>{t('profile.homeAppearance')}</h2>
          <p>{t('profile.homeAppearanceHint')}</p>
        </div>
      </div>

      <div className="home-appearance-layout">
        <div className="home-appearance-preview">
          <LibraryHero
            t={t}
            user={user}
            slide={slide}
            setSlide={setSlide}
            titlesOverride={previewTitles}
            onCreateMap={undefined}
            onCreateProject={undefined}
          />
        </div>

        <div className="home-appearance-controls">
          <section className="home-appearance-control-group">
            <div>
              <h3>{t('profile.homeBackground')}</h3>
              <p>{t('profile.homeBackgroundHint')}</p>
            </div>
            {backgroundError ? (
              <div className="inline-error" role="alert">
                {backgroundError}
              </div>
            ) : null}
            {backgroundMessage ? (
              <div className="inline-success" role="status">
                {backgroundMessage}
              </div>
            ) : null}
            <input
              ref={backgroundInputRef}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) changeBackground(file);
              }}
            />
            <div className="home-appearance-actions">
              <button
                type="button"
                className="profile-secondary-button"
                disabled={backgroundBusy}
                onClick={() => backgroundInputRef.current?.click()}
              >
                <Upload size={14} />
                {t(
                  backgroundBusy
                    ? 'profile.homeBackgroundUploading'
                    : 'profile.changeHomeBackground',
                )}
              </button>
              {user?.homeBackgroundUrl ? (
                <button
                  type="button"
                  className="home-appearance-reset"
                  disabled={backgroundBusy}
                  onClick={resetBackground}
                >
                  <RotateCcw size={14} />
                  {t('profile.resetHomeBackground')}
                </button>
              ) : null}
            </div>
          </section>

          <form className="home-appearance-control-group" onSubmit={saveTitles}>
            <div>
              <h3>{t('profile.homeTitles')}</h3>
              <p>{t('profile.homeTitlesHint')}</p>
            </div>
            <div className="home-appearance-tabs" role="tablist">
              {[0, 1, 2].map((index) => (
                <button
                  key={index}
                  ref={(element) => { tabRefs.current[index] = element; }}
                  type="button"
                  role="tab"
                  id={`home-appearance-tab-${index}`}
                  aria-controls={`home-appearance-title-panel-${index}`}
                  aria-selected={slide === index}
                  tabIndex={slide === index ? 0 : -1}
                  className={slide === index ? 'active' : ''}
                  disabled={titlesBusy}
                  onClick={() => setSlide(index)}
                  onKeyDown={(event) => moveTabFocus(event, index)}
                >
                  {t('profile.homeSlide', { n: index + 1 })}
                </button>
              ))}
            </div>
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                id={`home-appearance-title-panel-${index}`}
                role="tabpanel"
                aria-labelledby={`home-appearance-tab-${index}`}
                hidden={slide !== index}
              >
                {slide === index ? (
                  <label className="profile-field">
                    <span>{t('profile.homeTitle')}</span>
                    <textarea
                aria-label={t('profile.homeTitle')}
                      rows={2}
                      maxLength={120}
                      value={currentTitle}
                      disabled={titlesBusy}
                      onChange={(event) => updateDraft(event.target.value)}
                    />
                  </label>
                ) : null}
              </div>
            ))}
            {titlesError ? (
              <div className="inline-error" role="alert">
                {titlesError}
              </div>
            ) : null}
            {titlesMessage ? (
              <div className="inline-success" role="status">
                {titlesMessage}
              </div>
            ) : null}
            <div className="home-appearance-actions is-title-actions">
              <button
                type="button"
                className="home-appearance-reset"
                disabled={titlesBusy}
                onClick={resetCurrentTitle}
              >
                <RotateCcw size={14} />
                {t('profile.resetHomeTitle')}
              </button>
              <button
                type="submit"
                className="profile-primary-button"
                disabled={titlesBusy || !titlesDirty}
              >
                {t(
                  titlesBusy
                    ? 'common.loading'
                    : 'profile.saveHomeTitles',
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
