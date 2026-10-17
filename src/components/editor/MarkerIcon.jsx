import { createElement } from 'react';
import { getMarkerIcon } from '../marker-icons.js';

export default function MarkerIcon({ icon = 'pin', size = 20, ...props }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {getMarkerIcon(icon).nodes.map(([tag, attributes], index) => createElement(tag, { ...attributes, key: index }))}
    </svg>
  );
}
