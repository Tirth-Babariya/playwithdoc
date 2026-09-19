"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { installNetGuard } from "@/lib/netguard";

/**
 * Cosmetic layer: cursor spotlight on cards, scroll-reveal, and the scroll-progress line.
 * Purely visual — the site works without it, and content can never stay hidden (see the failsafe below).
 */
export function Effects() {
  const pathname = usePathname();
  const scan = useRef<() => void>(() => {});

  useEffect(() => {
    const root = document.documentElement;
    installNetGuard();

    /* Spotlight: feed pointer position to the hovered card as CSS variables. */
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(".card, .ud-item, .fc:not(.add), .next-item, .hero-search");
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    /* Scroll progress → CSS variable used by the thin line under the navbar. */
    let sr = 0;
    const onScroll = () => {
      cancelAnimationFrame(sr);
      sr = requestAnimationFrame(() => {
        const max = root.scrollHeight - innerHeight;
        root.style.setProperty("--scroll", max > 0 ? String(Math.min(1, Math.max(0, scrollY / max))) : "0");
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    /* Scroll reveal. `scan` finds any [data-reveal] element that hasn't been handled yet — including ones
       that appear later, e.g. after client-side navigation back to the home page. */
    const canAnimate = !matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window;
    let io: IntersectionObserver | undefined;
    let mo: MutationObserver | undefined;
    let pending = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    if (canAnimate) {
      root.classList.add("reveal-on");
      io = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io!.unobserve(e.target); }
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });

      scan.current = () => {
        const vh = innerHeight;
        let fresh = false;
        document.querySelectorAll<HTMLElement>("[data-reveal]:not(.in):not([data-seen])").forEach((el) => {
          el.dataset.seen = "1";
          fresh = true;
          if (el.getBoundingClientRect().top < vh * 0.98) el.classList.add("in");
          else io!.observe(el);
        });
        if (fresh) {
          // Failsafe: whatever is on screen a moment later must be visible, whatever happened above.
          const t = setTimeout(() => {
            timers.delete(t);
            document.querySelectorAll<HTMLElement>("[data-reveal]:not(.in)").forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add("in"); });
          }, 1200);
          timers.add(t);
        }
      };
      scan.current();
      mo = new MutationObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => scan.current()); });
      mo.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      io?.disconnect(); mo?.disconnect();
      timers.forEach(clearTimeout);
      root.classList.remove("reveal-on");
      cancelAnimationFrame(raf); cancelAnimationFrame(sr); cancelAnimationFrame(pending);
    };
  }, []);

  // Also re-scan on every route change (belt and braces alongside the MutationObserver).
  useEffect(() => { scan.current(); window.dispatchEvent(new Event("scroll")); }, [pathname]);

  return null;
}
