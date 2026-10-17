import { useEffect, useRef, useState } from 'react';
import { Image } from 'lucide-react';
import { api } from '../../api.js';
import { coverStyle } from './helpers.js';
import MapCardPreview from './MapCardPreview.jsx';

const MAX_COVER_SIZE = 10 * 1024 * 1024;
const COVER_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);
const COVER_FILE_PATTERN = /\.(?:jpe?g|png|webp|gif|avif)$/i;

export default function CoverField({
  entity,
  kind = 'projects',
  value,
  onChange,
  t,
  disabled,
}) {
  const [loadedCoverUrl, setLoadedCoverUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setLoadedCoverUrl('');
    if (!entity.cover_url) return undefined;

    api
      .fetchCover(entity.cover_url)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setLoadedCoverUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        if (active) setLoadedCoverUrl('');
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entity.cover_url, entity.id]);

  useEffect(() => {
    let objectUrl = '';
    if (value.mode === 'upload' && value.file) {
      objectUrl = URL.createObjectURL(value.file);
      setPreviewUrl(objectUrl);
    } else {
      setPreviewUrl('');
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [value.file, value.mode]);

  const defaultStyle = coverStyle(entity);
  const showMapPreview = kind === 'maps' && Number(entity.feature_count) > 0
    && value.mode !== 'upload' && (value.mode === 'reset' || !entity.cover_url);
  const existingStyle = loadedCoverUrl
    ? { ...defaultStyle, backgroundImage: `url("${loadedCoverUrl}")` }
    : defaultStyle;
  const previewStyle =
    value.mode === 'reset'
      ? defaultStyle
      : previewUrl
        ? { ...defaultStyle, backgroundImage: `url("${previewUrl}")` }
        : existingStyle;

  const selectFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const mimeUnknown =
      !file.type || file.type === 'application/octet-stream';
    const validType =
      COVER_TYPES.has(file.type) ||
      (mimeUnknown && COVER_FILE_PATTERN.test(file.name));
    if (!validType) {
      setError(t('dashboard.coverInvalidType'));
      onChange({ mode: 'invalid' });
      return;
    }
    if (file.size > MAX_COVER_SIZE) {
      setError(t('dashboard.coverTooLarge'));
      onChange({ mode: 'invalid' });
      return;
    }
    setError('');
    onChange({ mode: 'upload', file });
  };

  return (
    <fieldset className="dashboard-project-cover-field" disabled={disabled}>
      <legend>{t(kind === 'maps' ? 'dashboard.mapCover' : 'dashboard.projectCover')}</legend>
      {error ? (
        <div className="inline-error" role="alert">
          {error}
        </div>
      ) : null}
      <div
        className="dashboard-cover-preview"
        style={previewStyle}
        role="img"
        aria-label={t('dashboard.coverPreview')}
      >
        {showMapPreview ? <MapCardPreview key={`${entity.id}:${entity.version}`} mapId={entity.id} t={t} /> : null}
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
          type="button"
          className="text-button"
          onClick={() => fileInputRef.current?.click()}
        >
          <Image size={15} />
          {t('dashboard.chooseCoverImage')}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setError('');
            onChange({ mode: 'reset' });
          }}
        >
          {t(kind === 'maps' ? 'dashboard.automaticCover' : 'dashboard.resetCover')}
        </button>
      </div>
    </fieldset>
  );
}
