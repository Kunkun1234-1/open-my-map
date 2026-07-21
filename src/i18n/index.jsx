import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { en } from './en.js';
import { zh } from './zh.js';

const STORAGE_KEY = 'open-my-map-lang';
const catalogs = { zh, en };

const I18nContext = createContext({
  lang: 'zh',
  setLang: () => {},
  t: (key) => key,
});

function readStoredLang() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
  } catch {
    // ignore
  }
  const browser = String(navigator.language || '').toLowerCase();
  return browser.startsWith('zh') ? 'zh' : 'en';
}

function lookup(catalog, key) {
  return key.split('.').reduce((value, part) => (
    value && typeof value === 'object' ? value[part] : undefined
  ), catalog);
}

function format(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, name) => (
    Object.hasOwn(vars, name) ? String(vars[name]) : `{${name}}`
  ));
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => (
    typeof window === 'undefined' ? 'zh' : readStoredLang()
  ));

  const setLang = (next) => {
    const value = next === 'en' ? 'en' : 'zh';
    setLangState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  }, [lang]);

  const value = useMemo(() => {
    const catalog = catalogs[lang] || zh;
    const t = (key, vars) => {
      const raw = lookup(catalog, key) ?? lookup(zh, key) ?? key;
      return vars ? format(raw, vars) : raw;
    };
    return { lang, setLang, t };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function LanguageSwitch({ className = '' }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className={`language-switch ${className}`.trim()} role="group" aria-label={t('common.language')}>
      <button
        type="button"
        className={lang === 'zh' ? 'active' : ''}
        onClick={() => setLang('zh')}
        aria-pressed={lang === 'zh'}
      >
        {t('common.chinese')}
      </button>
      <button
        type="button"
        className={lang === 'en' ? 'active' : ''}
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
      >
        {t('common.english')}
      </button>
    </div>
  );
}
