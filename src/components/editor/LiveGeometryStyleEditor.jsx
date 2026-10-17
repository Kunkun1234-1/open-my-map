import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { geometryStyleValues } from './GeometryStyleFields.jsx';
import ReferenceGeometryStyleFields from './ReferenceGeometryStyleFields.jsx';

export default function LiveGeometryStyleEditor({ type, style, layerStyle, onSave, onPreview, lang = 'zh' }) {
  const [value, setValue] = useState(() => geometryStyleValues(type, style, layerStyle));
  const [status, setStatus] = useState('saved');
  const draftRef = useRef(value);
  const savedRef = useRef(value);
  const dirtyRef = useRef({});
  const pendingRef = useRef({});
  const failedRef = useRef(null);
  const timerRef = useRef(null);
  const inFlightRef = useRef(false);
  const closedRetryRef = useRef(false);
  const mountedRef = useRef(true);
  const callbacksRef = useRef({});
  callbacksRef.current = { onSave, onPreview, type, style, layerStyle };
  const text = (zh, en) => lang === 'en' ? en : zh;
  const report = (next) => { if (mountedRef.current) setStatus(next); };

  const flush = async () => {
    clearTimeout(timerRef.current);
    if (inFlightRef.current || !Object.keys(pendingRef.current).length) return;
    const patch = Object.fromEntries(Object.entries(pendingRef.current).filter(([field, next]) => savedRef.current[field] !== next));
    pendingRef.current = {};
    if (!Object.keys(patch).length) return;
    inFlightRef.current = true;
    report('saving');
    let success = false;
    try { success = await callbacksRef.current.onSave(patch) !== false; }
    catch { /* The parent reports the request error; restore its saved map state. */ }
    if (success) {
      savedRef.current = { ...savedRef.current, ...patch };
      for (const [field, next] of Object.entries(patch)) {
        if (draftRef.current[field] === next) delete dirtyRef.current[field];
      }
      if (!Object.keys(dirtyRef.current).length) {
        if (mountedRef.current) callbacksRef.current.onPreview?.(null);
        report('saved');
      } else report('editing');
    } else {
      failedRef.current = { ...patch, ...dirtyRef.current, ...pendingRef.current };
      if (!mountedRef.current && !closedRetryRef.current && Object.keys(pendingRef.current).length) {
        // A closed panel has no retry button. Try its final gesture once rather
        // than dropping changes collected while the first request was pending.
        closedRetryRef.current = true;
        pendingRef.current = failedRef.current;
        inFlightRef.current = false;
        flush();
        return;
      }
      pendingRef.current = {};
      dirtyRef.current = {};
      const current = callbacksRef.current;
      const restored = geometryStyleValues(current.type, current.style, current.layerStyle);
      savedRef.current = restored;
      draftRef.current = restored;
      if (mountedRef.current) {
        setValue(restored);
        current.onPreview?.(null);
        report('error');
      }
    }
    inFlightRef.current = false;
    // Changes committed while a request was in flight form the next single write.
    if (Object.keys(pendingRef.current).length) flush();
  };
  const change = (patch) => {
    draftRef.current = { ...draftRef.current, ...patch };
    dirtyRef.current = { ...dirtyRef.current, ...patch };
    for (const [field, next] of Object.entries(patch)) {
      if (!inFlightRef.current && savedRef.current[field] === next) { delete dirtyRef.current[field]; delete pendingRef.current[field]; }
    }
    setValue(draftRef.current);
    callbacksRef.current.onPreview?.(Object.keys(dirtyRef.current).length ? draftRef.current : null);
    report(Object.keys(dirtyRef.current).length ? 'editing' : 'saved');
  };
  const commit = (patch) => {
    const changes = Object.fromEntries(Object.entries(patch).filter(([field, next]) => field in dirtyRef.current && (savedRef.current[field] !== next || inFlightRef.current)));
    if (!Object.keys(changes).length) return;
    pendingRef.current = { ...pendingRef.current, ...changes };
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 220);
  };
  const baseline = JSON.stringify(geometryStyleValues(type, style, layerStyle));
  useEffect(() => {
    if (inFlightRef.current || Object.keys(dirtyRef.current).length || Object.keys(pendingRef.current).length) return;
    const next = JSON.parse(baseline);
    savedRef.current = next;
    draftRef.current = next;
    setValue(next);
  }, [baseline, status]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
      // Closing or selecting another feature must not discard the last gesture.
      pendingRef.current = { ...pendingRef.current, ...dirtyRef.current };
      flush();
      callbacksRef.current.onPreview?.(null);
    };
  }, []);

  return <div className="geometry-style-editor geometry-style-live">
    <ReferenceGeometryStyleFields type={type} value={value} onChange={change} onCommit={commit} lang={lang} />
    <footer className={`geometry-style-save-state is-${status}`} role="status" aria-live="polite">
      {status === 'saving' ? <LoaderCircle size={13} className="geometry-style-saving-icon" /> : status === 'saved' ? <Check size={13} /> : <span className="geometry-style-status-dot" />}
      <span>{status === 'saving' ? text('保存中…', 'Saving…') : status === 'editing' ? text('实时预览', 'Live preview') : status === 'error' ? text('保存失败，已恢复', 'Save failed; changes restored') : text('更改自动保存', 'Changes save automatically')}</span>
      {status === 'error' ? <button type="button" onClick={() => { const patch = failedRef.current; if (patch) { change(patch); commit(patch); } }}>{text('重试', 'Retry')}</button> : <span className="geometry-style-live-label">{text('即时生效', 'Live')}</span>}
    </footer>
  </div>;
}
