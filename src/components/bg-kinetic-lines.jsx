"use client";;
import { useRef } from "react";
import { useGSAP } from "@gsap/react";

import { gsap } from "@/lib/gsap";
import { cn } from "@/lib/utils";

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 600;
const HORIZONTAL_OVERSCAN = VIEWBOX_WIDTH * 0.08;
const VERTICAL_OVERSCAN = VIEWBOX_HEIGHT * 0.08;

const KINETIC_LINES_CSS = `
.te-kinetic-lines {
  color: var(--foreground, CanvasText);
}
.te-kinetic-lines__svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.te-kinetic-lines__base,
.te-kinetic-lines__accent {
  fill: none;
  stroke-width: var(--kinetic-line-width, 1.25);
  vector-effect: non-scaling-stroke;
}
.te-kinetic-lines__base {
  stroke: var(--kinetic-line, var(--border, currentColor));
  opacity: 0.58;
}
.te-kinetic-lines__accent {
  stroke: var(--kinetic-line-accent, var(--primary, currentColor));
  opacity: 0.9;
}
`;

function finiteOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function seededUnit(seed, index, salt) {
  let value =
    Math.trunc(seed) ^
    Math.imul(index + 1, 0x9e3779b1) ^
    Math.imul(salt + 1, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4_294_967_296;
}

function formatCoordinate(value) {
  return Number(value.toFixed(2));
}

function makePathGeometry(count, curvature, spread, seed, direction) {
  const horizontal = direction === "left" || direction === "right";
  const reverse = direction === "left" || direction === "up";
  const crossSize = horizontal ? VIEWBOX_HEIGHT : VIEWBOX_WIDTH;
  const usedCrossAxis = crossSize * spread;
  const crossStart = (crossSize - usedCrossAxis) / 2;
  const crossStep = usedCrossAxis / Math.max(1, count - 1);
  const alongStart = horizontal ? -HORIZONTAL_OVERSCAN : -VERTICAL_OVERSCAN;
  const alongEnd = horizontal
    ? VIEWBOX_WIDTH + HORIZONTAL_OVERSCAN
    : VIEWBOX_HEIGHT + VERTICAL_OVERSCAN;
  const controlOne = horizontal ? VIEWBOX_WIDTH * 0.28 : VIEWBOX_HEIGHT * 0.28;
  const controlTwo = horizontal ? VIEWBOX_WIDTH * 0.72 : VIEWBOX_HEIGHT * 0.72;
  const bendScale = (horizontal ? VIEWBOX_HEIGHT : VIEWBOX_WIDTH) * 0.22;

  return Array.from({ length: count }, (_, index) => {
    const edge = index === 0 || index === count - 1;
    const jitter = edge
      ? 0
      : (seededUnit(seed, index, 0) - 0.5) * crossStep * 0.42;
    const cross = crossStart + crossStep * index + jitter;
    const bendOne =
      (seededUnit(seed, index, 1) * 2 - 1) * bendScale * curvature;
    const bendTwo =
      (seededUnit(seed, index, 2) * 2 - 1) * bendScale * curvature;

    const start = horizontal
      ? [alongStart, cross]
      : [cross, alongStart];
    const end = horizontal ? [alongEnd, cross] : [cross, alongEnd];
    const firstControl = horizontal
      ? [controlOne, cross + bendOne]
      : [cross + bendOne, controlOne];
    const secondControl = horizontal
      ? [controlTwo, cross + bendTwo]
      : [cross + bendTwo, controlTwo];
    const points = reverse
      ? [end, secondControl, firstControl, start]
      : [start, firstControl, secondControl, end];
    const [pathStart, first, second, pathEnd] = points;

    if (!pathStart || !first || !second || !pathEnd) {
      throw new Error("Kinetic line geometry is incomplete.");
    }

    return {
      d: `M ${formatCoordinate(pathStart[0] ?? 0)} ${formatCoordinate(
        pathStart[1] ?? 0,
      )} C ${formatCoordinate(first[0] ?? 0)} ${formatCoordinate(
        first[1] ?? 0,
      )}, ${formatCoordinate(second[0] ?? 0)} ${formatCoordinate(
        second[1] ?? 0,
      )}, ${formatCoordinate(pathEnd[0] ?? 0)} ${formatCoordinate(
        pathEnd[1] ?? 0,
      )}`,
      phase: -index / count,
    };
  });
}

/**
 * Decorative SVG line field with deterministic cubic paths and one travelling
 * accent dash per line. A single scoped GSAP tween advances every accent at
 * the same linear rate while initial dash offsets distribute their phases
 * across the cycle. The tween pauses whenever the layer is fully offscreen or
 * the document is hidden. With reduced motion, no tween is created and the
 * complete base field plus deterministic accent positions remain visible.
 */
export function BgKineticLines({
  lineCount = 18,
  curvature = 0.34,
  speed = 7,
  trailLength = 0.28,
  direction = "right",
  spread = 0.82,
  seed = 11,
  className
}) {
  const rootRef = useRef(null);
  const count = Math.round(clamp(finiteOr(lineCount, 18), 8, 36));
  const safeCurvature = clamp(finiteOr(curvature, 0.34), 0, 0.75);
  const safeSpeed = clamp(finiteOr(speed, 7), 2.5, 18);
  const safeTrailLength = clamp(finiteOr(trailLength, 0.28), 0.08, 0.62);
  const safeSpread = clamp(finiteOr(spread, 0.82), 0.45, 1);
  const safeSeed = Math.trunc(finiteOr(seed, 11));
  const safeDirection = ["left", "right", "up", "down"].includes(
    direction,
  )
    ? direction
    : "right";
  const paths = makePathGeometry(
    count,
    safeCurvature,
    safeSpread,
    safeSeed,
    safeDirection,
  );

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const accents = gsap.utils.toArray(root.querySelectorAll(".te-kinetic-lines__accent"));
      let tween;
      let canAnimate = false;
      let isIntersecting = false;

      const syncPlayback = () => {
        const paused = !canAnimate || !isIntersecting || document.hidden;
        root.dataset.paused = String(paused);
        if (!tween) return;
        if (paused) {
          tween.pause();
        } else {
          tween.resume();
        }
      };

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return;
          isIntersecting = entry.isIntersecting;
          syncPlayback();
        },
        { threshold: 0 },
      );
      const handleVisibilityChange = () => {
        syncPlayback();
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);
      observer.observe(root);

      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        canAnimate = true;
        root.dataset.motion = "full";
        tween = gsap.to(accents, {
          attr: { "stroke-dashoffset": "-=1" },
          duration: safeSpeed,
          ease: "none",
          repeat: -1,
          paused: true,
        });
        syncPlayback();

        return () => {
          tween = undefined;
          canAnimate = false;
          root.dataset.motion = "reduced";
          syncPlayback();
        };
      });
      syncPlayback();

      return () => {
        observer.disconnect();
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
      };
    },
    {
      scope: rootRef,
      dependencies: [
        count,
        safeCurvature,
        safeSpeed,
        safeTrailLength,
        safeDirection,
        safeSpread,
        safeSeed,
      ],
      revertOnUpdate: true,
    },
  );

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={cn(
        "te-kinetic-lines pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
      data-curvature={safeCurvature}
      data-direction={safeDirection}
      data-line-count={count}
      data-motion="reduced"
      data-paused="true"
      data-seed={safeSeed}
      data-speed={safeSpeed}
      data-spread={safeSpread}
      data-trail-length={safeTrailLength}
    >
      <style href="te-bg-kinetic-lines" precedence="medium">
        {KINETIC_LINES_CSS}
      </style>
      <svg
        aria-hidden="true"
        className="te-kinetic-lines__svg"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        role="presentation"
        focusable="false"
      >
        <g>
          {paths.map((path, index) => (
            <path
              key={`base-${index}`}
              className="te-kinetic-lines__base"
              d={path.d}
            />
          ))}
        </g>
        <g>
          {paths.map((path, index) => (
            <path
              key={`accent-${index}`}
              className="te-kinetic-lines__accent"
              d={path.d}
              pathLength="1"
              strokeDasharray={`${safeTrailLength} ${1 - safeTrailLength}`}
              strokeDashoffset={path.phase}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
