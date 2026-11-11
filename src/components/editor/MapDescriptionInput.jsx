import { useLayoutEffect, useRef } from 'react';

function fitDescription(node) {
  if (!node?.clientWidth) return;
  node.style.height = 'auto';
  node.style.height = `${node.scrollHeight}px`;
}

export default function MapDescriptionInput(props) {
  const inputRef = useRef(null);

  useLayoutEffect(() => {
    fitDescription(inputRef.current);
  }, [props.value]);

  useLayoutEffect(() => {
    const node = inputRef.current;
    let width = node.clientWidth;
    const observer = new ResizeObserver(() => {
      if (node.clientWidth === width) return;
      width = node.clientWidth;
      fitDescription(node);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <textarea {...props} ref={inputRef} className="map-description-input" rows="1" />;
}
