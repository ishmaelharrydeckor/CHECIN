import { useEffect, useRef, useState } from "react";

/** True when the person has asked their device to avoid animation. */
function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * Fades each [data-reveal] element up as it scrolls into view (the CSS is in styles.css).
 *
 * The hidden starting state only exists once this has run (the `reveal-ready` class), so a page that
 * is printed, read without JavaScript or before it has loaded simply shows everything. Reduced-motion
 * settings turn the movement off in CSS, and each element is revealed once and then left alone.
 */
export function useScrollReveal() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const root = document.documentElement;
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    root.classList.add("reveal-ready");
    for (const el of items) io.observe(el);
    return () => {
      io.disconnect();
      root.classList.remove("reveal-ready");
    };
  }, []);
}

/**
 * A whole number that counts up to its final value the first time it is on screen. It renders the
 * final value on the server and for anyone who prefers reduced motion, so the text is always right.
 */
export function CountUp({ to, durationMs = 1100 }: { to: number; durationMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(to);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
    let frame = 0;
    setValue(0);
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / durationMs);
          setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to, durationMs]);

  return <span ref={ref}>{value}</span>;
}

/**
 * Headline that comes into focus letter by letter: each letter starts blurred and transparent and
 * sharpens in a short stagger (the CSS is `.focus-letter` in styles.css, pure CSS so there is no wait
 * for JavaScript). Screen readers read the sentence once; the individual letters are hidden from them.
 * People who ask for less motion see the finished sentence at once.
 */
export function FocusText({ text, startDelayMs = 150 }: { text: string; startDelayMs?: number }) {
  let index = 0;
  return (
    <span aria-label={text} role="text">
      {text.split(" ").map((word, w, words) => (
        <span key={w} aria-hidden className="inline-block whitespace-nowrap">
          {Array.from(word).map((ch) => (
            <span
              key={index}
              className="focus-letter inline-block"
              style={{ ["--focus-delay" as string]: `${startDelayMs + index++ * 26}ms` }}
            >
              {ch}
            </span>
          ))}
          {w < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}
