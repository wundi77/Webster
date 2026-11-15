import type { ReactNode, SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const mk = (children: ReactNode) => (p: P) => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>{children}</svg>
);

export const Icons = {
  logo: (p: P) => (
    <svg width={20} height={20} viewBox="0 0 32 32" aria-hidden {...p}>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M7 10l4 12 5-9 5 9 4-12" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  move: mk(<path d="M3.5 2.5l9 4.8-4 1.3-1.9 3.9z" />),
  board: mk(<path d="M4.5 1.5v13M11.5 1.5v13M1.5 4.5h13M1.5 11.5h13" />),
  rect: mk(<rect x="2.5" y="3.5" width="11" height="9" rx="1" />),
  ellipse: mk(<circle cx="8" cy="8" r="5.5" />),
  text: mk(<path d="M3 3.5h10M8 3.5v9.5M6.2 13h3.6" />),
  image: mk(<><rect x="2" y="2.5" width="12" height="11" rx="1.2" /><circle cx="5.8" cy="6" r="1.2" /><path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3" /></>),
  hand: mk(<path d="M5.5 8.5V4a1 1 0 012 0v3.5M7.5 7V3a1 1 0 012 0v4M9.5 7V4a1 1 0 012 0v5c0 2.8-1.8 4.5-4.2 4.5-1.8 0-2.9-.8-3.8-2.3L2 8.8a1 1 0 011.6-1.1l1.9 1.8" />),
  eye: mk(<><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></>),
  eyeOff: mk(<><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><path d="M2.5 13.5l11-11" /></>),
  lock: mk(<><rect x="3.5" y="7" width="9" height="6.5" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></>),
  unlock: mk(<><rect x="3.5" y="7" width="9" height="6.5" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 014.8-1" /></>),
  plus: mk(<path d="M8 3v10M3 8h10" />),
  minus: mk(<path d="M3.5 8h9" />),
  close: mk(<path d="M4 4l8 8M12 4l-8 8" />),
  trash: mk(<path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9" />),
  template: mk(<><rect x="2.5" y="2.5" width="11" height="11" rx="1.2" /><path d="M2.5 6h11M6.5 6v7.5" /></>),
  home: mk(<path d="M2.5 7.5L8 3l5.5 4.5M4 6.5v6.5h3v-3.5h2V13h3V6.5" />),
  chevronRight: mk(<path d="M6 4l4 4-4 4" />),
  chevronDown: mk(<path d="M4 6l4 4 4-4" />),
  undo: mk(<path d="M5 6.5h5a3 3 0 010 6H7M5 6.5L7.5 4M5 6.5L7.5 9" />),
  redo: mk(<path d="M11 6.5H6a3 3 0 000 6h3M11 6.5L8.5 4M11 6.5L8.5 9" />),
  sun: mk(<><circle cx="8" cy="8" r="2.8" /><path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" /></>),
  moon: mk(<path d="M13.2 9.6A5.5 5.5 0 016.4 2.8a5.5 5.5 0 106.8 6.8z" />),
  alignLeft: mk(<path d="M2.5 2v12M5 5h8M5 10.5h5" />),
  alignHCenter: mk(<path d="M8 2v12M4 5h8M5.5 10.5h5" />),
  alignRight: mk(<path d="M13.5 2v12M3 5h8M6 10.5h5" />),
  alignTop: mk(<path d="M2 2.5h12M5 5v8M10.5 5v5" />),
  alignVCenter: mk(<path d="M2 8h12M5 4v8M10.5 5.5v5" />),
  alignBottom: mk(<path d="M2 13.5h12M5 3v8M10.5 6v5" />),
  distH: mk(<path d="M2.5 2v12M13.5 2v12M6.5 5v6M9.5 5v6" />),
  distV: mk(<path d="M2 2.5h12M2 13.5h12M5 6.5h6M5 9.5h6" />),
  textLeft: mk(<path d="M2.5 4h11M2.5 8h7M2.5 12h9" />),
  textCenter: mk(<path d="M2.5 4h11M4.5 8h7M3.5 12h9" />),
  textRight: mk(<path d="M2.5 4h11M6.5 8h7M4.5 12h9" />),
  textJustify: mk(<path d="M2.5 4h11M2.5 8h11M2.5 12h11" />),
  growWidth: mk(<path d="M2 8h12M4.5 5.5L2 8l2.5 2.5M11.5 5.5L14 8l-2.5 2.5" />),
  growHeight: mk(<path d="M8 2v12M5.5 4.5L8 2l2.5 2.5M5.5 11.5L8 14l2.5-2.5" />),
  growFixed: mk(<rect x="3" y="3" width="10" height="10" rx="1" />),
  italic: mk(<path d="M7 3h5M4 13h5M10 3L6 13" />),
  underline: mk(<path d="M4.5 2.5v5a3.5 3.5 0 007 0v-5M3.5 14h9" />),
  strike: mk(<path d="M3 8h10M11 4.6C10.5 3.3 9.4 2.5 8 2.5c-1.8 0-3 1-3 2.4M5 11.3c.5 1.3 1.6 2.2 3 2.2 1.9 0 3-1 3-2.5" />),
  rotate: mk(<path d="M13 8a5 5 0 11-1.5-3.6M13 2.5v2.4h-2.4" />),
  radius: mk(<path d="M2.5 13.5V7.5a5 5 0 015-5h6" />),
  corners: mk(<path d="M2.5 6.5v-2a2 2 0 012-2h2M9.5 2.5h2a2 2 0 012 2v2M13.5 9.5v2a2 2 0 01-2 2h-2M6.5 13.5h-2a2 2 0 01-2-2v-2" />),
  swap: mk(<path d="M4 2.5v11M4 13.5L2 11.5M4 13.5l2-2M12 13.5v-11M12 2.5l-2 2M12 2.5l2 2" />),
  desktop: mk(<><rect x="1.5" y="2.5" width="13" height="8.5" rx="1" /><path d="M5.5 13.5h5M8 11v2.5" /></>),
  tablet: mk(<><rect x="3" y="1.5" width="10" height="13" rx="1.3" /><path d="M7 12.3h2" /></>),
  mobile: mk(<><rect x="4.5" y="1.5" width="7" height="13" rx="1.3" /><path d="M7.2 12.3h1.6" /></>),
  flexRow: mk(<><rect x="1.5" y="4" width="3.5" height="8" rx=".6" /><rect x="6.25" y="4" width="3.5" height="8" rx=".6" /><rect x="11" y="4" width="3.5" height="8" rx=".6" /></>),
  flexCol: mk(<><rect x="4" y="1.5" width="8" height="3.5" rx=".6" /><rect x="4" y="6.25" width="8" height="3.5" rx=".6" /><rect x="4" y="11" width="8" height="3.5" rx=".6" /></>),
  grid: mk(<><rect x="2" y="2" width="5" height="5" rx=".6" /><rect x="9" y="2" width="5" height="5" rx=".6" /><rect x="2" y="9" width="5" height="5" rx=".6" /><rect x="9" y="9" width="5" height="5" rx=".6" /></>),
  wrap: mk(<path d="M2 4.5h9.5a2.5 2.5 0 010 5H5M7 7.5L5 9.5l2 2M2 13h5" />),
  gapH: mk(<><path d="M2 2v12M14 2v12" /><path d="M5.5 8h5M5.5 8l1.5-1.5M5.5 8L7 9.5M10.5 8L9 6.5M10.5 8L9 9.5" /></>),
  gapV: mk(<><path d="M2 2h12M2 14h12" /><path d="M8 5.5v5M8 5.5L6.5 7M8 5.5L9.5 7M8 10.5L6.5 9M8 10.5L9.5 9" /></>),
  padH: mk(<><rect x="2" y="2" width="12" height="12" rx="1" /><path d="M5 5v6M11 5v6" /></>),
  padV: mk(<><rect x="2" y="2" width="12" height="12" rx="1" /><path d="M5 5h6M5 11h6" /></>),
  padT: mk(<><rect x="2" y="2" width="12" height="12" rx="1" opacity=".4" /><path d="M2 2.5h12" strokeWidth={2} /></>),
  padR: mk(<><rect x="2" y="2" width="12" height="12" rx="1" opacity=".4" /><path d="M13.5 2v12" strokeWidth={2} /></>),
  padB: mk(<><rect x="2" y="2" width="12" height="12" rx="1" opacity=".4" /><path d="M2 13.5h12" strokeWidth={2} /></>),
  padL: mk(<><rect x="2" y="2" width="12" height="12" rx="1" opacity=".4" /><path d="M2.5 2v12" strokeWidth={2} /></>),
  alignStart: mk(<><path d="M2.5 2v12" /><rect x="4.5" y="4" width="8" height="3" rx=".6" /><rect x="4.5" y="9" width="5" height="3" rx=".6" /></>),
  alignCenter: mk(<><path d="M8 2v12" /><rect x="3" y="4" width="10" height="3" rx=".6" /><rect x="5" y="9" width="6" height="3" rx=".6" /></>),
  alignEnd: mk(<><path d="M13.5 2v12" /><rect x="3.5" y="4" width="8" height="3" rx=".6" /><rect x="6.5" y="9" width="5" height="3" rx=".6" /></>),
  alignStretch: mk(<><path d="M2.5 2v12M13.5 2v12" /><rect x="4.5" y="4" width="7" height="3" rx=".6" /><rect x="4.5" y="9" width="7" height="3" rx=".6" /></>),
  sizeFixed: mk(<path d="M3 5v6M13 5v6M3 8h10" />),
  sizeFill: mk(<path d="M2 8h12M4.5 5.5L2 8l2.5 2.5M11.5 5.5L14 8l-2.5 2.5" />),
  sizeAuto: mk(<path d="M6 5L3 8l3 3M10 5l3 3-3 3" />),
  absolute: mk(<><rect x="2" y="2" width="12" height="12" rx="1" strokeDasharray="2 2" /><rect x="6" y="6" width="5" height="5" rx=".6" /></>),
  reset: mk(<path d="M3 8a5 5 0 105-5H5.5M5.5 3L7.5 1M5.5 3l2 2" />),
  component: mk(<path d="M8 1.8l2.2 2.2L8 6.2 5.8 4zM12 5.8l2.2 2.2L12 10.2 9.8 8zM4 5.8L6.2 8 4 10.2 1.8 8zM8 9.8l2.2 2.2L8 14.2 5.8 12z" />),
  instance: mk(<path d="M8 2l6 6-6 6-6-6z" />),
  edit: mk(<path d="M10.5 2.5l3 3-8 8H2.5v-3zM9 4l3 3" />),
  unlink: mk(<path d="M6.5 9.5l-1.6 1.6a2.1 2.1 0 01-3-3L3.5 6.5M9.5 6.5l1.6-1.6a2.1 2.1 0 013 3l-1.6 1.6M2 2l2 2M14 14l-2-2M10 1.5v2M14.5 6h-2" />),
  target: mk(<><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2" /></>),
  library: mk(<><rect x="2" y="2.5" width="3" height="11" rx=".6" /><rect x="6.5" y="2.5" width="3" height="11" rx=".6" /><path d="M11 3.2l2.8-.7 1.7 10.5-2.8.7z" /></>),
  link: mk(<path d="M6.8 9.2a2.8 2.8 0 004 0l2.4-2.4a2.8 2.8 0 00-4-4L8 4M9.2 6.8a2.8 2.8 0 00-4 0L2.8 9.2a2.8 2.8 0 004 4L8 12" />),
  play: mk(<path d="M4.5 2.8v10.4L13 8z" />),
  pointer: mk(<path d="M5 2v9.5l2.4-2.2 1.7 4 1.6-.7-1.7-3.9 3.2-.2z" />),
  sparkle: mk(<path d="M8 2l1.3 3.7L13 7 9.3 8.3 8 12 6.7 8.3 3 7l3.7-1.3zM12.5 11.5l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" />),
  file: mk(<path d="M4 1.5h5l3.5 3.5v9.5h-8.5zM9 1.5V5h3.5" />),
  download: mk(<path d="M8 2v8.5M4.5 7L8 10.5 11.5 7M2.5 12.5v1.5h11v-1.5" />),
  pin: mk(<><path d="M8 14.5s4.5-4.2 4.5-7.8a4.5 4.5 0 00-9 0c0 3.6 4.5 7.8 4.5 7.8z" /><circle cx="8" cy="6.7" r="1.6" /></>),
  video: mk(<><rect x="1.5" y="3.5" width="9.5" height="9" rx="1.5" /><path d="M11 7l3.5-2v6L11 9" /></>),
  globe: mk(<><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c1.8 1.8 2.6 3.8 2.6 6S9.8 12.2 8 14C6.2 12.2 5.4 10.2 5.4 8S6.2 3.8 8 2z" /></>),
  shapes: mk(<><path d="M5 2.5l3.5 6h-7z" /><circle cx="11.5" cy="5.5" r="3" /><rect x="7.5" y="9.5" width="6" height="4.5" rx=".5" /></>),
  star: mk(<path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />),
  line: mk(<path d="M3 13L13 3" />),
  pipette: mk(<><path d="M10.5 2.5l3 3-1.6 1.6-3-3z" /><path d="M9.4 4.6l-6 6L3 13l2.4-.4 6-6" /></>),
  arrow: mk(<path d="M3 13L13 3M7 3h6v6" />),
  triangle: mk(<path d="M8 2.5l6 11H2z" />),
  hexagon: mk(<path d="M8 1.8l5.5 3.1v6.2L8 14.2l-5.5-3.1V4.9z" />),
  smile: mk(<><circle cx="8" cy="8" r="6" /><path d="M5.5 9.5c.6 1 1.4 1.5 2.5 1.5s1.9-.5 2.5-1.5M6 6.3v.2M10 6.3v.2" /></>),
  save: mk(<><path d="M3 2.5h8l2.5 2.5v8.5a.5.5 0 01-.5.5H3a.5.5 0 01-.5-.5V3a.5.5 0 01.5-.5z" /><path d="M5 2.5v3.5h5V2.5M4.5 13.5V9.5h7v4" /></>),
  history: mk(<><path d="M2.5 8a5.5 5.5 0 101.6-3.9L2.5 5.7" /><path d="M2.5 2.5v3.2h3.2M8 5v3.2l2.2 1.4" /></>),
  copy: mk(<><rect x="5" y="5" width="8.5" height="8.5" rx="1" /><path d="M11 5V3.5a1 1 0 00-1-1H3.5a1 1 0 00-1 1V10a1 1 0 001 1H5" /></>),
};

export const TypeIcon = ({ type, main, instance }: { type: string; main?: boolean; instance?: boolean }) => {
  if (main) return <Icons.component className="ticon comp" />;
  if (instance) return <Icons.instance className="ticon comp" />;
  const I = type === 'board' ? Icons.board : type === 'rect' ? Icons.rect : type === 'ellipse' ? Icons.ellipse
    : type === 'text' ? Icons.text : type === 'vector' ? Icons.shapes : Icons.image;
  return <I className="ticon" />;
};
