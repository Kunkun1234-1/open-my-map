import { useEffect, useRef, useState } from 'react';
import { Image } from 'lucide-react';
import useLibraryCover from './useLibraryCover.js';
import './asset-feedback.css';

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
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const cover = useLibraryCover(entity, kind, { useDefault: value.mode === 'reset' });

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

  const displayedUrl = (value.mode === 'upload' && previewUrl) || cover.url;

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
      <img
        className="dashboard-cover-preview"
        src={displayedUrl}
        alt={t('dashboard.coverPreview')}
        onError={cover.onError}
      />
      {cover.error && value.mode !== 'upload' && value.mode !== 'reset' ? (
        <div className="dashboard-asset-feedback dashboard-asset-feedback--inline" role="alert">
          <span>{t('dashboard.assetLoadFailed')}</span>
          <button
            type="button"
            onClick={cover.retry}
          >
            {t('dashboard.retryImage')}
          </button>
        </div>
      ) : null}
      <p className="dashboard-project-delete-hint">
        {t('dashboard.coverHint')}
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
          {t('dashboard.resetCover')}
        </button>
      </div>
    </fieldset>
  );
}
