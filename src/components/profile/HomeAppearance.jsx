import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Image, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n/index.jsx';
import LibraryHero from '../library/LibraryHero.jsx';
import { getHeroTitle, getHomeSlides } from '../library/heroContent.js';
import './home-appearance.css';

const MAX_BACKGROUND_SIZE = 10 * 1024 * 1024;
const MAX_SLIDES = 100;
const BACKGROUND_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);
const BACKGROUND_FILE_PATTERN = /\.(?:jpe?g|png|webp|gif|avif)$/i;

function draftsFromUser(user) {
  const source = getHomeSlides(user);
  return source.map((item) => ({
    id: item.id,
    title: item.title || null,
    backgroundUrl: item.backgroundUrl || '',
    pendingFile: null,
    previewUrl: '',
    clearBackground: false,
  }));
}

function metadataSignature(slides) {
  return JSON.stringify(slides.map(({ id, title }) => ({ id, title: title ?? '' })));
}

function validateBackground(file, t) {
  const mimeUnknown = !file.type || file.type === 'application/octet-stream';
  const validType = BACKGROUND_TYPES.has(file.type)
    || (mimeUnknown && BACKGROUND_FILE_PATTERN.test(file.name));
  if (!validType) return t('profile.homeBackgroundInvalidType');
  if (file.size > MAX_BACKGROUND_SIZE) return t('profile.homeBackgroundTooLarge');
  return '';
}

export default function HomeAppearance() {
  const { user, refresh } = useAuth();
  const { t } = useI18n();
  const [slides, setSlides] = useState(() => draftsFromUser(user));
  const [selectedId, setSelectedId] = useState(() => slides[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const baselineRef = useRef(metadataSignature(slides));
  const fileInputRef = useRef(null);
  const uploadTargetRef = useRef('');
  const tabRefs = useRef(new Map());
  const objectUrlsRef = useRef(new Map());

  const revokePreview = (id) => {
    const url = objectUrlsRef.current.get(id);
    if (url) URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(id);
  };
  const revokeAllPreviews = () => {
    for (const url of objectUrlsRef.current.values()) URL.revokeObjectURL(url);
    objectUrlsRef.current.clear();
  };

  useEffect(() => {
    const next = draftsFromUser(user);
    revokeAllPreviews();
    setSlides(next);
    baselineRef.current = metadataSignature(next);
    setSelectedId(next[0]?.id || '');
    setError('');
    setMessage('');
  }, [user?.id]);

  useEffect(() => () => revokeAllPreviews(), []);

  const selectedIndex = Math.max(0, slides.findIndex((item) => item.id === selectedId));
  const selected = slides[selectedIndex];
  const hasPendingBackgrounds = slides.some((item) => item.pendingFile || item.clearBackground);
  const dirty = metadataSignature(slides) !== baselineRef.current || hasPendingBackgrounds;
  const previewSlides = useMemo(() => slides.map((item) => ({
    id: item.id,
    title: item.title ?? '',
    backgroundUrl: item.previewUrl || (item.clearBackground ? '' : item.backgroundUrl),
  })), [slides]);

  const clearFeedback = () => {
    setError('');
    setMessage('');
  };
  const patchSlide = (id, patch) => {
    clearFeedback();
    setSlides((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };
  const selectSlide = (id) => {
    if (!busy) setSelectedId(id);
  };
  const moveTabFocus = (event, index) => {
    if (!slides.length) return;
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % slides.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + slides.length) % slides.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = slides.length - 1;
    else return;
    event.preventDefault();
    const id = slides[nextIndex].id;
    setSelectedId(id);
    tabRefs.current.get(id)?.focus();
  };

  const addSlide = () => {
    if (busy || slides.length >= MAX_SLIDES) return;
    const id = crypto.randomUUID();
    const item = {
      id,
      title: t('profile.newHomeSlideTitle', { n: slides.length + 1 }),
      backgroundUrl: '',
      pendingFile: null,
      previewUrl: '',
      clearBackground: false,
    };
    clearFeedback();
    setSlides((current) => [...current, item]);
    setSelectedId(id);
    requestAnimationFrame(() => tabRefs.current.get(id)?.focus());
  };

  const removeSlide = () => {
    if (busy || slides.length <= 1 || !selected) return;
    const removedId = selected.id;
    const next = slides.filter((item) => item.id !== removedId);
    const nextSelected = next[Math.min(selectedIndex, next.length - 1)];
    revokePreview(removedId);
    clearFeedback();
    setSlides(next);
    setSelectedId(nextSelected.id);
    requestAnimationFrame(() => tabRefs.current.get(nextSelected.id)?.focus());
  };

  const moveSlide = (direction) => {
    const target = selectedIndex + direction;
    if (busy || !selected || target < 0 || target >= slides.length) return;
    const next = [...slides];
    [next[selectedIndex], next[target]] = [next[target], next[selectedIndex]];
    clearFeedback();
    setSlides(next);
    requestAnimationFrame(() => tabRefs.current.get(selected.id)?.focus());
  };

  const chooseBackground = () => {
    if (!selected || busy) return;
    uploadTargetRef.current = selected.id;
    fileInputRef.current?.click();
  };
  const stageBackground = (file, targetId) => {
    if (!file || !targetId || busy) return;
    const validationError = validateBackground(file, t);
    if (validationError) {
      setError(validationError);
      setMessage('');
      return;
    }
    revokePreview(targetId);
    const previewUrl = URL.createObjectURL(file);
    objectUrlsRef.current.set(targetId, previewUrl);
    patchSlide(targetId, { pendingFile: file, previewUrl, clearBackground: false });
  };
  const resetBackground = () => {
    if (!selected || busy) return;
    revokePreview(selected.id);
    patchSlide(selected.id, { pendingFile: null, previewUrl: '', clearBackground: true });
  };

  const saveSlides = async (event) => {
    event.preventDefault();
    if (busy || !dirty) return;
    for (let index = 0; index < slides.length; index += 1) {
      if (slides[index].title === null) continue;
      const title = slides[index].title.trim();
      if (!title) {
        setSelectedId(slides[index].id);
        setError(t('profile.homeTitleRequired'));
        return;
      }
      if (title.split(/\r?\n/).length > 2) {
        setSelectedId(slides[index].id);
        setError(t('profile.homeTitleTooManyLines'));
        return;
      }
    }

    setBusy(true);
    clearFeedback();
    const normalized = slides.map((item) => ({
      ...item,
      title: item.title === null ? null : item.title.trim(),
    }));
    try {
      await api.updateHomeAppearance({
        slides: normalized.map(({ id, title }) => ({ id, title: title ?? '' })),
      });
      baselineRef.current = metadataSignature(normalized);

      const backgroundJobs = normalized.flatMap((item) => {
        if (item.pendingFile) {
          return [{ id: item.id, run: () => api.uploadHomeBackground(item.pendingFile, item.id) }];
        }
        if (item.clearBackground) {
          return [{ id: item.id, run: () => api.resetHomeBackground(item.id) }];
        }
        return [];
      });
      const results = await Promise.allSettled(backgroundJobs.map(({ run }) => run()));
      const failedIds = new Set();
      results.forEach((result, index) => {
        if (result.status === 'rejected') failedIds.add(backgroundJobs[index].id);
        else revokePreview(backgroundJobs[index].id);
      });

      const freshUser = await refresh();
      const freshSlides = freshUser ? draftsFromUser(freshUser) : null;
      setSlides((current) => {
        if (!freshSlides) {
          return current.map((item) => failedIds.has(item.id)
            ? { ...item, title: item.title === null ? null : item.title.trim() }
            : { ...item, title: item.title === null ? null : item.title.trim(), pendingFile: null, previewUrl: '', clearBackground: false });
        }
        return freshSlides.map((fresh) => {
          const pending = current.find((item) => item.id === fresh.id);
          return failedIds.has(fresh.id) && pending
            ? { ...fresh, pendingFile: pending.pendingFile, previewUrl: pending.previewUrl, clearBackground: pending.clearBackground }
            : fresh;
        });
      });
      baselineRef.current = metadataSignature(normalized);
      const availableSlides = freshSlides || normalized;
      setSelectedId((current) => availableSlides.some((item) => item.id === current) ? current : availableSlides[0]?.id || '');
      if (failedIds.size) {
        setError(t('profile.homeSlidesPartiallySaved', { n: failedIds.size }));
      } else {
        setMessage(t('profile.homeSlidesSaved'));
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

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
            slide={selectedIndex}
            setSlide={(index) => selectSlide(slides[index]?.id)}
            slidesOverride={previewSlides}
            backgroundUrlOverride={selected?.previewUrl || selected?.clearBackground
              ? selected.previewUrl
              : undefined}
            onCreateMap={undefined}
            onCreateProject={undefined}
          />
        </div>

        <form className="home-appearance-controls" onSubmit={saveSlides}>
          <section className="home-appearance-control-group">
            <div className="home-appearance-group-heading">
              <div>
                <h3>{t('profile.homeSlides')}</h3>
                <p>{t('profile.homeSlidesHint')}</p>
              </div>
              <button type="button" className="profile-secondary-button" disabled={busy || slides.length >= MAX_SLIDES} onClick={addSlide}>
                <Plus size={14} />{t('profile.addHomeSlide')}
              </button>
            </div>

            <div className="home-appearance-tabs" role="tablist" aria-label={t('profile.homeSlides')}>
              {slides.map((item, index) => (
                <button
                  key={item.id}
                  ref={(element) => {
                    if (element) tabRefs.current.set(item.id, element);
                    else tabRefs.current.delete(item.id);
                  }}
                  type="button"
                  role="tab"
                  id={`home-appearance-tab-${item.id}`}
                  aria-controls={`home-appearance-panel-${item.id}`}
                  aria-selected={item.id === selectedId}
                  tabIndex={item.id === selectedId ? 0 : -1}
                  className={item.id === selectedId ? 'active' : ''}
                  disabled={busy}
                  onClick={() => selectSlide(item.id)}
                  onKeyDown={(event) => moveTabFocus(event, index)}
                >
                  {t('profile.homeSlide', { n: index + 1 })}
                </button>
              ))}
            </div>

            {selected ? <div id={`home-appearance-panel-${selected.id}`} role="tabpanel" aria-labelledby={`home-appearance-tab-${selected.id}`} className="home-appearance-slide-editor">
              <label className="profile-field">
                <span>{t('profile.homeTitle')}</span>
                <textarea
                  aria-label={t('profile.homeTitle')}
                  rows={2}
                  maxLength={120}
                  value={selected.title ?? getHeroTitle(t, selectedIndex, [])}
                  disabled={busy}
                  onChange={(event) => patchSlide(selected.id, { title: event.target.value })}
                />
              </label>

              <div className="home-appearance-background-row">
                <div>
                  <h4>{t('profile.homeBackground')}</h4>
                  <p>{t('profile.homeBackgroundHint')}</p>
                </div>
                <div className="home-appearance-actions">
                  <button type="button" className="profile-secondary-button" disabled={busy} onClick={chooseBackground}>
                    <Upload size={14} />{selected.pendingFile ? t('profile.replacePendingBackground') : t('profile.changeHomeBackground')}
                  </button>
                  {(selected.backgroundUrl || selected.pendingFile) && !selected.clearBackground ? <button type="button" className="home-appearance-reset" disabled={busy} onClick={resetBackground}>
                    <RotateCcw size={14} />{t('profile.resetHomeBackground')}
                  </button> : null}
                </div>
              </div>

              <div className="home-appearance-order-actions">
                <button type="button" disabled={busy || selectedIndex === 0} onClick={() => moveSlide(-1)}><ArrowLeft size={14} />{t('profile.moveHomeSlideEarlier')}</button>
                <button type="button" disabled={busy || selectedIndex === slides.length - 1} onClick={() => moveSlide(1)}>{t('profile.moveHomeSlideLater')}<ArrowRight size={14} /></button>
                <button type="button" className="danger" title={slides.length <= 1 ? t('profile.keepOneHomeSlide') : undefined} disabled={busy || slides.length <= 1} onClick={removeSlide}><Trash2 size={14} />{t('profile.removeHomeSlide')}</button>
              </div>
            </div> : null}

            {error ? <div className="inline-error" role="alert">{error}</div> : null}
            {message ? <div className="inline-success" role="status">{message}</div> : null}
            <div className="home-appearance-save-row">
              <span>{t('profile.homeSlideCount', { n: slides.length })}</span>
              <button type="submit" className="profile-primary-button" disabled={busy || !dirty}>
                {busy ? t('profile.homeSlidesSaving') : t('profile.saveHomeSlides')}
              </button>
            </div>
          </section>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) stageBackground(file, uploadTargetRef.current);
            }}
          />
        </form>
      </div>
    </section>
  );
}
