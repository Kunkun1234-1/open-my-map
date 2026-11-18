import useLibraryCover from './useLibraryCover.js';
import './asset-feedback.css';

export default function CardCover({
  entity,
  kind,
  t,
  disabled,
  onOpen,
  openLabel,
  className = 'dashboard-card-cover',
  loading = 'lazy',
}) {
  const cover = useLibraryCover(entity, kind);
  return (
    <div className={className}>
      <button
        type="button"
        className="dashboard-map-cover"
        disabled={disabled}
        onClick={onOpen}
        aria-label={openLabel}
      >
        <img
          className="dashboard-cover-photo"
          src={cover.url}
          alt=""
          loading={loading}
          decoding="async"
          onError={cover.onError}
        />
      </button>
      {cover.error ? (
        <div className="dashboard-asset-feedback dashboard-asset-feedback--cover" role="alert">
          <span>{t('dashboard.assetLoadFailed')}</span>
          <button type="button" onClick={cover.retry}>
            {t('dashboard.retryImage')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
