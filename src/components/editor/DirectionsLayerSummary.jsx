import { Bike, Car, Footprints, Pencil, Route } from 'lucide-react';
import { formatRouteDistance, formatRouteDuration } from '../../routing.js';

function routeStops(feature) {
  const savedStops = feature?.style?.routeData?.stops;
  if (savedStops?.length) return savedStops;
  const coordinates = feature?.geometry?.coordinates;
  if (feature?.geometry?.type !== 'LineString' || !coordinates?.length) return [];
  return [coordinates[0], coordinates[coordinates.length - 1]].map((position) => ({ position }));
}

function stopName(stop, index, lang) {
  if (stop.text?.trim()) return stop.text;
  if (stop.address?.trim()) return stop.address;
  if (stop.position?.length >= 2) {
    return `${Number(stop.position[0]).toFixed(5)}, ${Number(stop.position[1]).toFixed(5)}`;
  }
  return lang === 'en' ? `Stop ${index + 1}` : `路线点 ${index + 1}`;
}

export default function DirectionsLayerSummary({ layer, feature, canEdit, lang = 'zh', onOpen, onSelectStop }) {
  const text = (zh, en) => (lang === 'en' ? en : zh);
  const data = feature?.style?.routeData;
  const mode = data?.mode || 'driving';
  const ModeIcon = mode === 'walking' ? Footprints : mode === 'cycling' ? Bike : Car;
  const modeLabel =
    mode === 'walking'
      ? text('步行', 'Walking')
      : mode === 'cycling'
        ? text('骑行', 'Cycling')
        : text('驾车', 'Driving');
  const stops = routeStops(feature);
  const hasDistance = Number.isFinite(Number(data?.distance)) && data?.distance !== undefined;
  const hasDuration = Number.isFinite(Number(data?.duration)) && data?.duration !== undefined;

  if (!feature) {
    return (
      <p className="directions-layer-empty">
        <Route size={16} />
        {text('此路线图层还没有路线。', 'This directions layer has no route yet.')}
      </p>
    );
  }

  return (
    <div
      className="directions-layer-summary"
      data-testid="directions-layer-summary"
      data-feature-id={feature.id}
    >
      <div className="directions-layer-mode">
        <ModeIcon size={16} />
        <span>{modeLabel}</span>
        {hasDistance ? <small>{formatRouteDistance(Number(data.distance), lang)}</small> : null}
        {hasDuration ? <small>{formatRouteDuration(Number(data.duration), lang)}</small> : null}
      </div>
      <ol
        className="directions-layer-stops"
        aria-label={text(`${layer.name} 的路线地点`, `Stops in ${layer.name}`)}
      >
        {stops.map((stop, index) => (
          <li key={index}>
            <span className="directions-layer-stop-letter" aria-hidden="true">
              {String.fromCharCode(65 + index)}
            </span>
            <button
              type="button"
              onClick={() => onSelectStop ? onSelectStop(stop, index) : onOpen?.()}
              disabled={!onSelectStop && !onOpen}
              aria-label={text(
                `查看路线点 ${String.fromCharCode(65 + index)}：${stopName(stop, index, lang)}`,
                `View stop ${String.fromCharCode(65 + index)}: ${stopName(stop, index, lang)}`,
              )}
            >
              <b>{stopName(stop, index, lang)}</b>
              {stop.address && stop.address !== stop.text ? <small>{stop.address}</small> : null}
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="directions-layer-open" onClick={onOpen} disabled={!onOpen}>
        <Pencil size={14} />
        {canEdit ? text('编辑路线', 'Edit directions') : text('查看路线', 'View directions')}
      </button>
    </div>
  );
}
