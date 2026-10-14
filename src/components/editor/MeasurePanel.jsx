import { Ruler, Shapes, Trash2, Undo2, X } from 'lucide-react';

function formatDistance(distance, lang) {
  const value = Number(distance) || 0;
  const useKilometers = value >= 1000;
  return `${(useKilometers ? value / 1000 : value).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', { maximumFractionDigits: useKilometers ? 2 : 1 })} ${lang === 'en' ? (useKilometers ? 'km' : 'm') : useKilometers ? '千米' : '米'}`;
}

function formatArea(area, lang) {
  const value = Number(area) || 0;
  const useKilometers = value >= 1000000;
  return `${(useKilometers ? value / 1000000 : value).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', { maximumFractionDigits: useKilometers ? 3 : 1 })} ${lang === 'en' ? (useKilometers ? 'km²' : 'm²') : useKilometers ? '平方千米' : '平方米'}`;
}

export default function MeasurePanel({
  points = [],
  distance = 0,
  area = 0,
  closed = false,
  onClear,
  onRemoveLast,
  onClose,
  onToggleClosed,
  lang = 'zh',
}) {
  const text = (zh, en) => (lang === 'en' ? en : zh);
  return (
    <section
      className="editor-measure-panel"
      data-testid="measure-panel"
      aria-label={text('测量距离与面积', 'Measure distance and area')}
    >
      <header>
        <Ruler size={20} />
        <h2>{text('测量距离', 'Measure distance')}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label={text('关闭测量', 'Close measurement')}
        >
          <X size={20} />
        </button>
      </header>
      <div className="measure-result" aria-live="polite" aria-atomic="true">
        <span>{closed ? text('总周长', 'Total perimeter') : text('总距离', 'Total distance')}</span>
        <strong data-testid="measure-distance">{formatDistance(distance, lang)}</strong>
        {closed ? (
          <div className="measure-area-result">
            <span>{text('区域面积', 'Area')}</span>
            <strong data-testid="measure-area">{formatArea(area, lang)}</strong>
          </div>
        ) : null}
      </div>
      <p className="measure-instruction">
        {text(
          '点击地图添加测量点，拖动圆点调整位置，点击圆点将它移除。',
          'Click the map to add points. Drag a point to move it, or click it to remove it.',
        )}
      </p>
      <div className="measure-panel-actions">
        <button type="button" aria-pressed={closed} disabled={points.length < 3} onClick={onToggleClosed}>
          <Shapes size={16} />
          {closed ? text('取消闭合', 'Open shape') : text('闭合测量面积', 'Close to measure area')}
        </button>
        <button type="button" disabled={!points.length} onClick={onRemoveLast}>
          <Undo2 size={16} />
          {text('移除最后一点', 'Remove last point')}
        </button>
        <button type="button" disabled={!points.length} onClick={onClear}>
          <Trash2 size={16} />
          {text('清除测量', 'Clear measurement')}
        </button>
      </div>
      <footer>
        {points.length} {text('个测量点', 'measurement points')}
      </footer>
    </section>
  );
}
