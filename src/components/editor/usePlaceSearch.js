import { useCallback, useEffect, useRef, useState } from 'react';
import { getAMapPlace, reverseGeocodeAMap, searchAMapPlaces, suggestAMapPlaces } from '../../amap.js';

// Search coordinates are stored in WGS84; the AMap adapter handles display conversion.
export default function usePlaceSearch({ getBounds, onLocate, toast } = {}) {
  const [query, setQueryState] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpenState] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mode, setMode] = useState(null);
  const [searchHereNeeded, setSearchHereNeeded] = useState(false);
  const requestRef = useRef({ search: 0, details: 0, suggestions: 0 });
  const contextRef = useRef(null);
  const optionsRef = useRef({ getBounds, onLocate, toast });
  optionsRef.current = { getBounds, onLocate, toast };

  useEffect(() => () => {
    requestRef.current.search += 1;
    requestRef.current.details += 1;
    requestRef.current.suggestions += 1;
  }, []);

  const setSuggestionsOpen = useCallback((open) => {
    setSuggestionsOpenState(open);
    if (!open) {
      requestRef.current.suggestions += 1;
      setSuggestions([]);
      setSuggestionIndex(-1);
    }
  }, []);

  const setQuery = useCallback((value) => {
    requestRef.current.search += 1;
    requestRef.current.suggestions += 1;
    setLoading(false);
    setQueryState(value);
    setSuggestionsOpenState(true);
    setSuggestions([]);
    setSuggestionIndex(-1);
  }, []);

  useEffect(() => {
    const requestId = ++requestRef.current.suggestions;
    if (!suggestionsOpen || query.trim().length < 2) return undefined;
    const timeout = window.setTimeout(async () => {
      try {
        const places = await suggestAMapPlaces(query.trim());
        if (requestId !== requestRef.current.suggestions) return;
        setSuggestions(places.slice(0, 8));
        setSuggestionIndex(-1);
      } catch {
        if (requestId === requestRef.current.suggestions) setSuggestions([]);
      }
    }, 240);
    return () => window.clearTimeout(timeout);
  }, [query, suggestionsOpen]);

  const onSearch = useCallback(async (settings = {}) => {
    if (settings?.preventDefault) { settings.preventDefault(); settings = {}; }
    const term = String(settings.query ?? query).trim();
    if (!term) return [];
    const bounds = settings.bounds || (settings.withinBounds ? optionsRef.current.getBounds?.() : null);
    if (settings.withinBounds && !bounds) {
      setError('当前地图范围不可用，请稍后再试。');
      return [];
    }
    const nextPage = settings.page || 1;
    const requestId = ++requestRef.current.search;
    requestRef.current.details += 1;
    setSuggestionsOpen(false);
    setSelectedPlace(null);
    setDetailLoading(false);
    setMode('results');
    setError('');
    setLoading(true);
    setSearchHereNeeded(false);
    setQueryState(term);
    try {
      const response = await searchAMapPlaces(term, { page: nextPage, ...(bounds ? { bounds } : {}) });
      if (requestId !== requestRef.current.search) return [];
      contextRef.current = { query: term, bounds };
      setResults(response.places);
      setTotal(response.total);
      setPage(response.page);
      return response.places;
    } catch (searchError) {
      if (requestId !== requestRef.current.search) return [];
      contextRef.current = { query: term, bounds };
      setResults([]);
      setTotal(0);
      setPage(nextPage);
      setError(searchError.message || '地图搜索暂不可用。');
      return [];
    } finally {
      if (requestId === requestRef.current.search) setLoading(false);
    }
  }, [query, setSuggestionsOpen]);

  const openDetail = useCallback(async (place) => {
    if (!place) return null;
    const requestId = ++requestRef.current.details;
    requestRef.current.search += 1;
    setLoading(false);
    setSuggestionsOpen(false);
    setSelectedPlace(place);
    setMode('detail');
    setError('');
    if (place.position) optionsRef.current.onLocate?.(place);
    const poiId = place.poiId || (place.id?.startsWith('amap-') ? place.id.slice(5) : place.source === 'AMap' ? place.id : null);
    if (!poiId) {
      setDetailLoading(false);
      return place;
    }
    setDetailLoading(true);
    try {
      const details = await getAMapPlace(poiId);
      if (requestId !== requestRef.current.details) return null;
      const enriched = { ...place, ...details, index: place.index || details.index };
      setSelectedPlace(enriched);
      if (!place.position && enriched.position) optionsRef.current.onLocate?.(enriched);
      return enriched;
    } catch (detailError) {
      if (requestId === requestRef.current.details) setError(detailError.message || '地点详情暂不可用，已保留基础信息。');
      return place;
    } finally {
      if (requestId === requestRef.current.details) setDetailLoading(false);
    }
  }, [setSuggestionsOpen]);

  const chooseSuggestion = useCallback(async (place) => {
    setQueryState(place.name);
    requestRef.current.search += 1;
    setLoading(false);
    setSuggestionsOpen(false);
    if (place.position || place.poiId) {
      setResults([{ ...place, index: 1 }]);
      setTotal(1);
      setPage(1);
      contextRef.current = { query: place.name, bounds: null };
      return openDetail({ ...place, index: 1 });
    }
    return onSearch({ query: place.name });
  }, [onSearch, openDetail, setSuggestionsOpen]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      setSuggestionsOpen(false);
      return;
    }
    if (!suggestionsOpen || !suggestions.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSuggestionIndex((index) => {
        if (index < 0) return event.key === 'ArrowDown' ? 0 : suggestions.length - 1;
        return (index + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
      });
    } else if (event.key === 'Enter' && suggestionIndex >= 0) {
      event.preventDefault();
      chooseSuggestion(suggestions[suggestionIndex]);
    }
  }, [chooseSuggestion, setSuggestionsOpen, suggestionIndex, suggestions, suggestionsOpen]);

  const backToResults = useCallback(() => {
    requestRef.current.details += 1;
    setSelectedPlace(null);
    setDetailLoading(false);
    setError('');
    setMode(results.length || contextRef.current ? 'results' : null);
  }, [results.length]);

  const clear = useCallback(() => {
    requestRef.current.search += 1;
    requestRef.current.details += 1;
    setSuggestionsOpen(false);
    setQueryState('');
    setResults([]);
    setTotal(0);
    setPage(1);
    setSelectedPlace(null);
    setDetailLoading(false);
    setLoading(false);
    setMode(null);
    setError('');
    setSearchHereNeeded(false);
    contextRef.current = null;
  }, [setSuggestionsOpen]);

  const searchThisArea = useCallback((bounds = optionsRef.current.getBounds?.()) => onSearch({
    query: contextRef.current?.query || query, withinBounds: true, bounds,
  }), [onSearch, query]);

  const setViewChanged = useCallback(() => {
    if (contextRef.current?.query) setSearchHereNeeded(true);
  }, []);

  const nextPage = useCallback(() => {
    if (!loading && page < 100 && page * 10 < total && contextRef.current) {
      return onSearch({ ...contextRef.current, page: page + 1 });
    }
    return Promise.resolve([]);
  }, [loading, onSearch, page, total]);

  const previousPage = useCallback(() => {
    if (!loading && page > 1 && contextRef.current) {
      return onSearch({ ...contextRef.current, page: page - 1 });
    }
    return Promise.resolve([]);
  }, [loading, onSearch, page]);

  const reverseGeocodeDetail = useCallback(async (position) => {
    const requestId = ++requestRef.current.details;
    requestRef.current.search += 1;
    setLoading(false);
    setSuggestionsOpen(false);
    const preliminary = { id: `coordinate-${position.join('-')}`, name: '选定的位置', position, coordinateSystem: 'WGS84', photos: [] };
    setSelectedPlace(preliminary);
    setMode('detail');
    setDetailLoading(true);
    setError('');
    optionsRef.current.onLocate?.(preliminary);
    try {
      const place = await reverseGeocodeAMap(position);
      if (requestId !== requestRef.current.details) return null;
      setSelectedPlace(place);
      return place;
    } catch (detailError) {
      if (requestId === requestRef.current.details) setError(detailError.message || '地址解析暂不可用。');
      return preliminary;
    } finally {
      if (requestId === requestRef.current.details) setDetailLoading(false);
    }
  }, [setSuggestionsOpen]);

  return {
    query, setQuery, suggestions, suggestionsOpen, setSuggestionsOpen,
    activeSuggestion: suggestionIndex, suggestionIndex, results, total, page, pageSize: 10,
    loading, error, selectedPlace, detailLoading, mode, searchHereNeeded,
    maxPage: Math.max(1, Math.min(100, Math.ceil(total / 10))),
    activeCandidateId: selectedPlace?.id || null,
    onSearch, chooseSuggestion, handleKeyDown, openDetail, backToResults, clear,
    searchThisArea, setViewChanged, nextPage, previousPage, reverseGeocodeDetail,
  };
}
