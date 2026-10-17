import { tableFieldValue } from '../../table-data.js';

function recordKey(featureId, field) {
  return `${typeof featureId}:${String(featureId)}:${field}`;
}

function errorMessage(error) {
  return error?.message || String(error || 'Save failed');
}

export function createTableAutosave({ save, onChange, delay = 650 }) {
  if (typeof save !== 'function') throw new TypeError('save must be a function');

  const records = new Map();
  let timer = null;
  let drainPromise = null;
  let disposed = false;
  let lastNotification = '';

  const getSnapshot = () => {
    const fields = [...records.values()].map(({ featureId, field, value, savedValue, status, error }) => ({
      featureId,
      field,
      value,
      savedValue,
      status,
      error,
    }));
    return {
      fields,
      dirty: fields.some((item) => item.value !== item.savedValue),
      pending: Boolean(timer || drainPromise || fields.some((item) => item.status === 'saving')),
      error: fields.find((item) => item.error)?.error || '',
    };
  };

  const notify = () => {
    if (disposed || typeof onChange !== 'function') return;
    const next = getSnapshot();
    const signature = JSON.stringify(next);
    if (signature === lastNotification) return;
    lastNotification = signature;
    onChange(next);
  };

  const nextRecord = () => [...records.values()].find((record) => !record.inFlight && !record.deferred
    && (record.status === 'dirty' || record.status === 'error'));

  const drain = async () => {
    let successful = true;
    while (true) {
      const record = nextRecord();
      if (!record) break;
      const sentValue = record.value;
      const baseValue = record.savedValue;
      record.inFlight = true;
      record.status = 'saving';
      record.error = '';
      notify();
      try {
        const persistedValue = await save({
          featureId: record.featureId,
          field: record.field,
          value: sentValue,
          baseValue,
        });
        if (typeof persistedValue !== 'string') throw new TypeError('save must resolve to a string');
        record.savedValue = persistedValue;
        record.error = '';
        if (record.value === sentValue) {
          record.value = persistedValue;
          record.status = 'clean';
        } else {
          record.status = record.value === persistedValue ? 'clean' : 'dirty';
        }
      } catch (error) {
        if (typeof error?.latestValue === 'string') record.savedValue = error.latestValue;
        record.status = 'error';
        record.error = errorMessage(error);
        successful = false;
      } finally {
        record.inFlight = false;
        notify();
      }
      if (!successful) break;
    }
    return successful;
  };

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (drainPromise) return drainPromise;
    drainPromise = drain().finally(() => {
      drainPromise = null;
      notify();
    });
    notify();
    return drainPromise;
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, Math.max(0, delay));
    notify();
  };

  const change = (featureId, field, value, baseline, { defer = false } = {}) => {
    const key = recordKey(featureId, field);
    let record = records.get(key);
    if (!record) {
      record = {
        featureId,
        field,
        value: baseline,
        savedValue: baseline,
        status: 'clean',
        error: '',
        inFlight: false,
        deferred: false,
      };
      records.set(key, record);
    }
    record.deferred = defer;
    record.value = value;
    record.error = '';
    if (!record.inFlight) record.status = value === record.savedValue ? 'clean' : 'dirty';
    if (record.status === 'clean') {
      if (timer && !nextRecord()) {
        clearTimeout(timer);
        timer = null;
      }
      notify();
      return;
    }
    if (defer) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      notify();
      return;
    }
    schedule();
  };

  const read = (featureId, field, fallback) => records.get(recordKey(featureId, field))?.value ?? fallback;

  const sync = (features = []) => {
    const featureById = new Map();
    for (const feature of features) {
      if (!feature) continue;
      featureById.set(`${typeof feature.id}:${String(feature.id)}`, feature);
    }
    let changed = false;
    for (const record of records.values()) {
      if (record.inFlight || record.status !== 'clean') continue;
      const feature = featureById.get(`${typeof record.featureId}:${String(record.featureId)}`);
      if (!feature) continue;
      const next = tableFieldValue(feature, record.field);
      if (record.value === next && record.savedValue === next) continue;
      record.value = next;
      record.savedValue = next;
      record.error = '';
      changed = true;
    }
    if (changed) notify();
  };

  const snapshot = () => getSnapshot();

  const discard = () => {
    if (drainPromise || [...records.values()].some((record) => record.inFlight)) return false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    for (const record of records.values()) {
      record.value = record.savedValue;
      record.status = 'clean';
      record.error = '';
      record.deferred = false;
    }
    notify();
    return true;
  };

  const dispose = () => {
    disposed = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    return flush();
  };

  return { change, read, sync, snapshot, flush, discard, dispose };
}
