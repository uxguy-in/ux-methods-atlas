import { Children, useEffect, useId, useState } from 'react';

// Open everything before printing, so a printed page never loses the hidden part of a list or section.
function useOpenForPrint(setOpen) {
  useEffect(() => {
    const open = () => setOpen(true);
    window.addEventListener('beforeprint', open);
    return () => window.removeEventListener('beforeprint', open);
  }, [setOpen]);
}

function Toggle({ open, controls, onClick, children }) {
  return (
    <button type="button" className="show-more no-print" aria-expanded={open} aria-controls={controls} onClick={onClick}>
      {children}<span className="show-more-icon" aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
  );
}

// A list that shows its first `limit` items and keeps the rest behind a "Show all N" button.
// `keep(i)` marks items that stay visible when collapsed (a suggested option, say).
// A list only one item over the limit is shown in full: hiding a single item saves nothing.
export function ShowMoreList({ children, limit = 4, keep, noun = 'items', as: Tag = 'div', className, ...rest }) {
  const items = Children.toArray(children);
  const [open, setOpen] = useState(false);
  const id = useId();
  useOpenForPrint(setOpen);
  const collapsible = items.length > limit + 1;
  const shown = !collapsible || open ? items : items.filter((_, i) => i < limit || keep?.(i));
  return (
    <>
      <Tag id={id} className={className} {...rest}>{shown}</Tag>
      {collapsible && (
        <Toggle open={open} controls={id} onClick={() => setOpen((v) => !v)}>
          {open ? 'Show fewer' : `Show all ${items.length} ${noun}`}
        </Toggle>
      )}
    </>
  );
}

// A long block of text that is cut to a few lines, with a fade, until the reader asks for the rest.
// Pass `long={false}` to render it in full with no button.
export function ShowMoreText({ children, long = true, className = '' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  useOpenForPrint(setOpen);
  if (!long) return <div className={className}>{children}</div>;
  return (
    <>
      <div id={id} className={`${className} ${open ? '' : 'sm-clamp'}`.trim()}>{children}</div>
      <Toggle open={open} controls={id} onClick={() => setOpen((v) => !v)}>{open ? 'Show less' : 'Show more'}</Toggle>
    </>
  );
}
