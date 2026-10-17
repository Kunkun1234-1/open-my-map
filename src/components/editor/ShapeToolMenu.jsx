import { useEffect, useRef, useState } from 'react';
import { Circle, RectangleHorizontal, Shapes } from 'lucide-react';
import { SHAPE_TOOLS } from './shape-drawing.js';
import './shape-tool-menu.css';

const OPTIONS = [
  ['polygon', Shapes, '自由绘制', 'Free polygon'],
  ['rectangle', RectangleHorizontal, '矩形', 'Rectangle'],
  ['circle', Circle, '圆形', 'Circle'],
];

export default function ShapeToolMenu({ activeTool, onTool, disabled, lang = 'zh' }) {
  const [open, setOpen] = useState(false);
  const controlRef = useRef(null);
  const focusOnOpenRef = useRef(false);
  const text = (zh, en) => lang === 'en' ? en : zh;
  const active = SHAPE_TOOLS.includes(activeTool);
  const [, Icon, zh, en] = OPTIONS.find(([tool]) => tool === activeTool) || OPTIONS[0];
  const openForSelection = () => {
    focusOnOpenRef.current = !open;
    if (open) controlRef.current.querySelector('[role="menuitem"]')?.focus();
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    if (focusOnOpenRef.current) controlRef.current.querySelector('[role="menuitem"]')?.focus();
    focusOnOpenRef.current = false;
    const dismiss = (event) => { if (!controlRef.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); controlRef.current.querySelector('.shape-tool-button')?.focus(); }
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', dismiss, true); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="shape-tool-control" ref={controlRef}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse' && !disabled) setOpen(true); }}
      onPointerLeave={(event) => { if (event.pointerType === 'mouse') setOpen(false); }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button type="button" className={`tool-button shape-tool-button${active ? ' active' : ''}`} disabled={disabled} onClick={openForSelection} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); openForSelection(); } }} aria-label={text('绘制图形', 'Draw a shape')} title={active ? `${text('绘制图形', 'Draw a shape')}：${text(zh, en)}` : text('绘制图形', 'Draw a shape')} aria-haspopup="menu" aria-expanded={open && !disabled}>
        <Icon size={17} />
      </button>
      {open && !disabled ? <div className="shape-tool-menu" role="menu" aria-label={text('图形类别', 'Shape types')} onKeyDown={(event) => {
        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault();
        const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]')];
        const index = items.indexOf(document.activeElement);
        items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }}>
        {OPTIONS.map(([tool, OptionIcon, optionZh, optionEn]) => <button key={tool} type="button" role="menuitem" className={tool === activeTool ? 'active' : ''} onClick={() => { setOpen(false); onTool(tool); controlRef.current.querySelector('.shape-tool-button')?.focus(); }}><OptionIcon size={18} /><span>{text(optionZh, optionEn)}</span></button>)}
      </div> : null}
    </div>
  );
}
