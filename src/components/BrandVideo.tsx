import { useEffect, useRef, useState } from "react";

/**
 * Autoplaying, control-free brand video.
 * Picks the landscape source on laptops/desktops and the portrait source on
 * phones & tablets. Plays automatically when scrolled into view (or hovered)
 * and pauses when it leaves the viewport.
 */
export function BrandVideo({
  landscape,
  portrait,
  className = "",
  loop = true,
  onEnded,
  autoStart = false,
}: {
  landscape: string;
  portrait: string;
  className?: string;
  loop?: boolean;
  onEnded?: () => void;
  autoStart?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [portraitMode, setPortraitMode] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    const apply = () => setPortraitMode(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (autoStart) {
      void el.play().catch(() => {});
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) void el.play().catch(() => {});
          else el.pause();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [autoStart, portraitMode]);

  return (
    <video
      ref={ref}
      key={portraitMode ? "p" : "l"}
      src={portraitMode ? portrait : landscape}
      muted
      autoPlay
      loop={loop}
      playsInline
      preload="auto"
      onEnded={onEnded}
      onMouseEnter={() => void ref.current?.play().catch(() => {})}
      controls={false}
      disablePictureInPicture
      className={className}
    />
  );
}
