import { useEffect, useRef, useState } from 'react';
import { Image, Upload } from 'lucide-react';
import { api } from '../../api.js';
import LibraryDialog from './LibraryDialog.jsx';
import { coverStyle } from './helpers.js';
import { cardCoverMode } from './mapPreview.js';
import MapCardPreview from './MapCardPreview.jsx';
import './asset-feedback.css';

const MAX_COVER_SIZE = 10 * 1024 * 1024;
const COVER_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

export default function CardCover({
  entity,
  kind,
  index,
  t,
  editable,
  disabled,
  onOpen,
  openLabel,
  onRefresh,
  onToast,
}) {
  const [loadedCoverUrl, setLoadedCoverUrl] = useState('');
  const [coverLoadError, setCoverLoadError] = useState(false);
  const [coverRequestVersion, setCoverRequestVersion] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshFailed, setRefreshFailed] = useState(false);
  const fileInputRef = useRef(null);
  const chooseButtonRef = useRef(null);
  const previewUrlRef = useRef('');

  const defaultStyle = coverStyle(entity, index);
  const showMapPreview = cardCoverMode(entity, kind) === 'map';
  const coverStyleValue = loadedCoverUrl
    ? { ...defaultStyle, backgroundImage: `url("${loadedCoverUrl}")` }
    : defaultStyle;
  const previewStyle = previewUrl
    ? { ...defaultStyle, backgroundImage: `url("${previewUrl}")` }
    : coverStyleValue;

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setLoadedCoverUrl('');
    setCoverLoadError(false);
    if (!entity.cover_url) return undefined;

    api
      .fetchCover(entity.cover_url)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setLoadedCoverUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        if (active) {
          setLoadedCoverUrl('');
          setCoverLoadError(true);
        }
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [coverRequestVersion, entity.cover_url, entity.id, kind]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    },
    [],
  );

  const replacePreviewUrl = (nextUrl = '') => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  };

  const clearSelection = () => {
    setSelectedFile(null);
    replacePreviewUrl();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openDialog = () => {
    if (!editable || disabled) return;
    clearSelection();
    setError('');
    setRefreshFailed(false);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (busy) return;
    clearSelection();
    setDialogOpen(false);
    setError('');
    setRefreshFailed(false);
  };

  const selectFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const unknownMime = !file.type || file.type === 'application/octet-stream';
    const supportedExtension = /\.(jpe?g|png|webp|gif|avif)$/i.test(file.name);
    if (!COVER_TYPES.has(file.type) && !(unknownMime && supportedExtension)) {
      clearSelection();
      setError(t('dashboard.coverInvalidType'));
      return;
    }
    if (file.size > MAX_COVER_SIZE) {
      clearSelection();
      setError(t('dashboard.coverTooLarge'));
      return;
    }
    setError('');
    setRefreshFailed(false);
    setSelectedFile(file);
    replacePreviewUrl(URL.createObjectURL(file));
  };

  const finishMutation = async (successKey) => {
    onToast(t(successKey));
    clearSelection();
    try {
      await onRefresh();
      setDialogOpen(false);
      setError('');
      setRefreshFailed(false);
    } catch {
      setError(t('dashboard.coverRefreshFailed'));
      setRefreshFailed(true);
    }
  };

  const upload = async (event) => {
    event.preventDefault();
    if (!selectedFile || busy || refreshFailed) return;
    setBusy(true);
    setError('');
    try {
      await api.uploadCover(kind, entity.id, selectedFile);
      await finishMutation('dashboard.coverSaved');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (busy || refreshFailed) return;
    setBusy(true);
    setError('');
    try {
      await api.resetCover(kind, entity.id);
      await finishMutation('dashboard.coverReset');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const retryRefresh = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRefresh();
      setDialogOpen(false);
      setError('');
      setRefreshFailed(false);
    } catch {
      setError(t('dashboard.coverRefreshFailed'));
      setRefreshFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {showMapPreview ? <MapCardPreview key={`${entity.id}:${entity.version}:${entity.updated_at}`} mapId={entity.id} t={t} /> : null}
      <button
        type="button"
        className={`dashboard-map-cover${showMapPreview ? ' has-map-preview' : ''}`}
        style={showMapPreview ? undefined : coverStyleValue}
        disabled={disabled}
        onClick={onOpen}
        aria-label={openLabel}
      />
      {coverLoadError && entity.cover_url ? (
        <div className="dashboard-asset-feedback dashboard-asset-feedback--cover" role="alert">
          <span>{t('dashboard.assetLoadFailed')}</span>
          <button
            type="button"
            onClick={() => setCoverRequestVersion((version) => version + 1)}
          >
            {t('dashboard.retryImage')}
          </button>
        </div>
      ) : null}
      {editable && !disabled ? (
        <button
          type="button"
          className="dashboard-cover-change"
          onClick={openDialog}
        >
          <Image size={13} />
          {t('dashboard.changeCover')}
        </button>
      ) : null}

      {dialogOpen ? (
        <LibraryDialog
          title={t('dashboard.changeCover')}
          onClose={closeDialog}
          closeLabel={t('common.close')}
          initialFocusRef={chooseButtonRef}
        >
          <form className="dialog-form" onSubmit={upload}>
            {error ? (
              <div className="inline-error" role="alert">
                <span>{error}</span>
                {refreshFailed ? (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={retryRefresh}
                  >
                    {t('common.refresh')}
                  </button>
                ) : null}
              </div>
            ) : null}
            <div
              className="dashboard-cover-preview"
              style={previewStyle}
              role="img"
              aria-label={t('dashboard.coverPreview')}
            >
              {showMapPreview && !previewUrl ? <MapCardPreview mapId={entity.id} t={t} /> : null}
            </div>
            <p className="dashboard-project-delete-hint">
              {t('dashboard.coverHint')}
              {kind === 'maps' ? ` ${t('dashboard.mapCoverHint')}` : ''}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              onChange={selectFile}
            />
            <div className="dialog-actions">
              <button
                ref={chooseButtonRef}
                type="button"
                className="text-button"
                disabled={busy || refreshFailed}
                onClick={() => fileInputRef.current?.click()}
              >
                <Image size={15} />
                {t('dashboard.chooseCoverImage')}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy || refreshFailed}
                onClick={reset}
              >
                {t(kind === 'maps' ? 'dashboard.automaticCover' : 'dashboard.resetCover')}
              </button>
            </div>
            <footer className="dialog-actions">
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={closeDialog}
              >
                {t('common.cancel')}
              </button>
              <button
                className="dashboard-primary"
                disabled={!selectedFile || busy || refreshFailed}
              >
                <Upload size={15} />
                {t(
                  busy
                    ? 'dashboard.coverUploading'
                    : 'dashboard.uploadCover',
                )}
              </button>
            </footer>
          </form>
        </LibraryDialog>
      ) : null}
    </>
  );
}
