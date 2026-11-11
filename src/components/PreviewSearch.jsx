import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MapPin, Pentagon, Route, Search, X } from 'lucide-react';
import {
  PREVIEW_SEARCH_RESULT_LIMIT,
  filterPreviewRecords,
  previewRecordKind,
} from './preview-search-utils.js';

const defaultText = (zh) => zh;

function ResultIcon({ kind }) {
  if (kind === 'point') return <MapPin size={17} aria-hidden="true" />;
  if (kind === 'area') return <Pentagon size={17} aria-hidden="true" />;
  return <Route size={17} aria-hidden="true" />;
}

export default function PreviewSearch({
  open,
  records = [],
  onSelect,
  onClose,
  text = defaultText,
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const composingRef = useRef(false);
  const resultRefs = useRef(new Map());
  const listId = useId();
  const results = useMemo(
    () => filterPreviewRecords(records, query),
    [records, query],
  );

  useEffect(() => {
    if (!open) {
      composingRef.current = false;
      setQuery('');
      setActiveIndex(0);
      return;
    }
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    if (open) resultRefs.current.get(activeIndex)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const choose = (record) => {
    if (record?.feature) onSelect?.(record.feature);
  };
  const handleKeyDown = (event) => {
    if (composingRef.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose?.();
      return;
    }
    if (!results.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (current + direction + results.length) % results.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(results.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[activeIndex] || results[0]);
    }
  };

  return (
    <section
      id="preview-search"
      className={'preview-search' + (open ? ' is-open' : '')}
      inert={!open}
      aria-hidden={!open}
      aria-label={text('搜索当前地图', 'Search this map')}
      onKeyDown={(event) => {
        if (event.target !== inputRef.current && event.key === 'Escape' && !composingRef.current && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
          event.preventDefault();
          onClose?.();
        }
      }}
    >
      <form
        className="preview-search-box"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (composingRef.current) return;
          choose(results[activeIndex] || results[0]);
        }}
      >
        <Search size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label={text('搜索当前地图', 'Search this map')}
          aria-controls={listId}
          aria-expanded={open}
          aria-autocomplete="list"
          aria-activedescendant={results.length ? listId + '-' + activeIndex : undefined}
          autoComplete="off"
          placeholder={text('搜索名称、说明或图层', 'Search names, descriptions or layers')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          onKeyDown={handleKeyDown}
        />
        {query ? (
          <button
            type="button"
            className="preview-search-clear"
            onClick={() => {
              setQuery('');
              setActiveIndex(0);
              inputRef.current?.focus();
            }}
            aria-label={text('清除搜索', 'Clear search')}
          >
            {text('清空', 'Clear')}
          </button>
        ) : null}
        <button
          type="button"
          className="preview-search-close"
          onClick={onClose}
          aria-label={text('关闭搜索', 'Close search')}
        >
          <X size={18} />
        </button>
      </form>

      <div className="preview-search-dropdown">
        <p className="preview-search-summary" aria-live="polite"><span>{text('地图内搜索', 'Search this map')}</span><span>{text(results.length + ' 条结果', results.length + ' results')}</span></p>
        <div className="preview-search-results" id={listId} role="listbox" aria-label={text('地图搜索结果', 'Map search results')}>
        {results.map((record, index) => {
          const { feature, layer } = record;
          const kind = previewRecordKind(feature);
          return (
            <button
              key={(layer?.id ?? 'layer') + '-' + feature.id}
              ref={(element) => {
                if (element) resultRefs.current.set(index, element);
                else resultRefs.current.delete(index);
              }}
              id={listId + '-' + index}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={'preview-search-result' + (index === activeIndex ? ' active' : '')}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(record)}
            >
              <span className={'preview-search-result-icon is-' + kind}>
                <ResultIcon kind={kind} />
              </span>
              <span>
                <strong>{feature.name || text('未命名记录', 'Untitled record')}</strong>
                <small>{layer?.name || text('未分类', 'Uncategorized')}{feature.description ? ' · ' + feature.description : ''}</small>
              </span>
            </button>
          );
        })}
        {!results.length ? (
          <div className="preview-search-empty" role="status">
            <Search size={22} aria-hidden="true" />
            <span>{text('没有匹配的地图内容', 'No matching map content')}</span>
          </div>
        ) : null}
        {records.length > PREVIEW_SEARCH_RESULT_LIMIT && results.length === PREVIEW_SEARCH_RESULT_LIMIT ? (
          <p className="preview-search-limit">
            {text('仅显示前 ' + PREVIEW_SEARCH_RESULT_LIMIT + ' 条结果', 'Showing the first ' + PREVIEW_SEARCH_RESULT_LIMIT + ' results')}
          </p>
        ) : null}
        </div>
      </div>
    </section>
  );
}
