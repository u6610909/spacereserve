/**
 * The one place that decides how a room photo is framed. Whatever size or
 * aspect ratio staff upload — a phone photo, a screenshot, a wide panorama —
 * this always crops it to the same 4:3 frame via `object-cover`, so a grid
 * of rooms never has one photo taller than the rest. No image yet gets the
 * same frame with a neutral placeholder glyph instead of empty space.
 */
export function RoomImage({
  src,
  alt,
  className = '',
  rounded = 'rounded-lg',
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  rounded?: string;
}) {
  return (
    <div className={`aspect-[4/3] w-full shrink-0 overflow-hidden ${rounded} bg-slate-100 ${className}`}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-300">
          <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="9" cy="10" r="1.75" fill="currentColor" />
            <path
              d="M4 17l5-5 3 3 3-3.5L20 16"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
