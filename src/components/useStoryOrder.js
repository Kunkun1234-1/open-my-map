import { useCallback, useEffect, useRef, useState } from 'react';
import { moveStoryRecord, orderStoryRecords } from './shared-map-utils.js';

const STORAGE_VERSION = 1;

function sameOrder(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function storageKey(mapId) {
  return `open-my-map:story-order:${mapId}`;
}

function allStoryRecords(mapData) {
  return (mapData?.layers || []).flatMap((layer) => (layer.features || []).map((feature) => ({ feature })));
}

export function storyOrderForMap(mapData, preferredOrder = mapData?.story_order) {
  return orderStoryRecords(allStoryRecords(mapData), preferredOrder).map((record) => record.feature.id);
}

function readLocalOrder(mapData) {
  if (mapData?.id == null) return storyOrderForMap(mapData);
  try {
    const stored = JSON.parse(globalThis.sessionStorage?.getItem(storageKey(mapData.id)) || 'null');
    const featureIds = Array.isArray(stored) ? stored : stored?.featureIds;
    return storyOrderForMap(mapData, featureIds);
  } catch {
    return storyOrderForMap(mapData);
  }
}

function writeLocalOrder(mapId, featureIds) {
  if (mapId == null) return;
  try {
    globalThis.sessionStorage?.setItem(storageKey(mapId), JSON.stringify({
      version: STORAGE_VERSION,
      featureIds,
    }));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
    // The in-memory order remains usable for the current page.
  }
}

export default function useStoryOrder({ mapData, onSaveOrder, localOnly = false }) {
  const initialOrder = () => (localOnly ? readLocalOrder(mapData) : storyOrderForMap(mapData));
  const [order, setOrder] = useState(initialOrder);
  const [saving, setSaving] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [error, setError] = useState('');
  const orderRef = useRef(order);
  const mapRef = useRef(mapData);
  const saveRef = useRef(onSaveOrder);
  const savingRef = useRef(false);
  const needsRefreshRef = useRef(false);
  const mountedRef = useRef(false);
  const requestRef = useRef(0);
  const mapIdRef = useRef(mapData?.id);

  mapRef.current = mapData;
  saveRef.current = onSaveOrder;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const mapChanged = mapIdRef.current !== mapData?.id;
    if (mapChanged) {
      mapIdRef.current = mapData?.id;
      requestRef.current += 1;
      savingRef.current = false;
      needsRefreshRef.current = false;
      setSaving(false);
      setNeedsRefresh(false);
      setError('');
    }
    if (savingRef.current || needsRefreshRef.current) return;
    const nextOrder = localOnly ? readLocalOrder(mapData) : storyOrderForMap(mapData);
    orderRef.current = nextOrder;
    setOrder((current) => (sameOrder(current, nextOrder) ? current : nextOrder));
  }, [localOnly, mapData?.id, mapData?.layers, mapData?.story_order, mapData?.version]);

  const move = useCallback(async (sourceId, targetId) => {
    if (savingRef.current || needsRefreshRef.current) return false;
    const currentOrder = storyOrderForMap(mapRef.current, orderRef.current);
    const nextOrder = moveStoryRecord(currentOrder, sourceId, targetId);
    if (nextOrder === currentOrder || sameOrder(currentOrder, nextOrder)) return false;

    if (!localOnly && typeof saveRef.current !== 'function') {
      setError('编辑权限仍在加载，请稍后再试。');
      return false;
    }

    orderRef.current = nextOrder;
    setOrder(nextOrder);
    setError('');

    if (localOnly) {
      writeLocalOrder(mapRef.current?.id, nextOrder);
      return true;
    }

    const request = ++requestRef.current;
    const mapId = mapRef.current?.id;
    const expectedVersion = mapRef.current?.version;
    savingRef.current = true;
    setSaving(true);
    try {
      const savedMap = await saveRef.current(nextOrder, expectedVersion);
      if (!mountedRef.current || request !== requestRef.current || mapId !== mapRef.current?.id) return false;
      const latestMap = mapRef.current;
      const latestVersion = Number(latestMap?.version);
      const savedVersion = Number(savedMap?.version);
      const receivedNewerMap = Number.isFinite(latestVersion) && Number.isFinite(savedVersion)
        && latestVersion > savedVersion;
      const confirmedMap = receivedNewerMap ? latestMap : savedMap || latestMap;
      const confirmedOrder = storyOrderForMap(
        confirmedMap,
        receivedNewerMap ? latestMap?.story_order : savedMap?.story_order || nextOrder,
      );
      orderRef.current = confirmedOrder;
      setOrder(confirmedOrder);
      return true;
    } catch (saveError) {
      if (!mountedRef.current || request !== requestRef.current || mapId !== mapRef.current?.id) return false;
      if (saveError?.operationSaved) {
        const latestMap = mapRef.current;
        const latestVersion = Number(latestMap?.version);
        if (Number.isFinite(latestVersion) && latestVersion > Number(expectedVersion)) {
          const latestOrder = storyOrderForMap(latestMap);
          orderRef.current = latestOrder;
          setOrder(latestOrder);
        }
        needsRefreshRef.current = true;
        setNeedsRefresh(true);
        setError('故事顺序已保存，但最新状态未能验证。请刷新地图后继续调整。');
        return false;
      }
      const serverOrder = storyOrderForMap(mapRef.current);
      orderRef.current = serverOrder;
      setOrder(serverOrder);
      setError(saveError?.conflict || saveError?.status === 409
        ? '地图已被更新，顺序已恢复为最新状态。请重新拖动。'
        : saveError?.message || '故事顺序保存失败，已恢复保存前的顺序。');
      return false;
    } finally {
      if (mountedRef.current && request === requestRef.current && mapId === mapRef.current?.id) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }, [localOnly]);

  return { order, saving, needsRefresh, error, move };
}
