"use client";

/**
 * The visual centrepiece: a minimalist side-profile sneaker (toe pointing left)
 * drawn as layered SVG. Each layer is positioned/scaled from the normalized
 * ShoeSpec knobs, with CSS transitions so any change animates smoothly.
 * `buildProgress` (0..1) progressively reveals the layers for the "creating your
 * shoe" screen. A real parametric configurator would replace this component
 * while keeping the same props.
 */

import { useId } from "react";
import type { ShoeColor, ShoeSpec } from "@/lib/engine/types";

const COLOR_MAP: Record<
  ShoeColor,
  { body: string; panel: string; accent: string; sole: string }
> = {
  black: { body: "#3d3d45", panel: "#52525c", accent: "#212125", sole: "#ecebe8" },
  beige: { body: "#d0bb96", panel: "#e0d0b2", accent: "#a3875f", sole: "#f3eee4" },
  navy: { body: "#35476d", panel: "#475b8e", accent: "#1e2a46", sole: "#eef0f3" },
  gray: { body: "#939a9f", panel: "#aeb4b8", accent: "#6b7176", sole: "#eef0f1" },
};

const EASE = "480ms cubic-bezier(0.22, 0.61, 0.36, 1)";

function reveal(progress: number | undefined, start: number, end: number) {
  if (progress === undefined) return { opacity: 1, ty: 0 };
  const t = Math.min(1, Math.max(0, (progress - start) / (end - start)));
  return { opacity: t, ty: (1 - t) * 12 };
}

export function ShoeVisual({
  spec,
  buildProgress,
  className,
}: {
  spec: ShoeSpec;
  buildProgress?: number;
  className?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const c = COLOR_MAP[spec.config.color];

  const stackLift = spec.midsoleThickness * 9;
  const midsoleGrow = 1 + spec.midsoleThickness * 0.5;
  const toeShift = -spec.toeBoxSpace * 12;
  const toeGrow = 1 + spec.toeBoxSpace * 0.1;
  const instepLift = -spec.instepVolume * 9;
  const puff = 1 + spec.widthScale * 0.09;
  const shadowW = 150 + spec.widthScale * 24;
  const heelStroke = 3 + spec.heelCounterStiffness * 4;

  const L = {
    outsole: reveal(buildProgress, 0, 0.14),
    midsole: reveal(buildProgress, 0.14, 0.32),
    upper: reveal(buildProgress, 0.32, 0.54),
    toe: reveal(buildProgress, 0.54, 0.7),
    collar: reveal(buildProgress, 0.7, 0.84),
    lace: reveal(buildProgress, 0.84, 0.96),
    mark: reveal(buildProgress, 0.95, 1),
  };

  return (
    <svg
      viewBox="0 0 400 190"
      className={className}
      role="img"
      aria-label="Representación de tu zapatilla"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <defs>
        <linearGradient id={`${gid}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.panel} />
          <stop offset="1" stopColor={c.body} />
        </linearGradient>
      </defs>

      {/* ground shadow */}
      <ellipse
        cx="198"
        cy="170"
        rx={shadowW}
        ry="8"
        fill="#000"
        opacity={buildProgress === undefined ? 0.08 : Math.min(0.08, buildProgress)}
        style={{ transition: `rx ${EASE}, opacity ${EASE}` }}
      />

      <g
        style={{
          transform: `translateY(${-stackLift}px)`,
          transition: `transform ${EASE}`,
        }}
      >
        {/* ---- outsole: thin, toe spring at left, heel bevel at right -- */}
        <g
          style={{
            opacity: L.outsole.opacity,
            transform: `translateY(${L.outsole.ty}px)`,
            transition: `opacity ${EASE}, transform ${EASE}`,
          }}
        >
          <path
            d="M36 146
               C26 144 24 135 34 131
               C110 122 250 122 322 132
               C338 134 344 139 340 145
               C336 151 324 152 310 151
               L54 151
               C43 151 38 150 36 146 Z"
            fill={c.accent}
          />
        </g>

        {/* ---- midsole wedge (thicker toward heel) --------------------- */}
        <g
          style={{
            opacity: L.midsole.opacity,
            transform: `translateY(${L.midsole.ty}px) scaleY(${midsoleGrow})`,
            transformOrigin: "190px 138px",
            transition: `opacity ${EASE}, transform ${EASE}`,
          }}
        >
          <path
            d="M38 138
               C30 138 30 127 42 122
               C110 108 150 105 200 105
               C270 105 305 112 326 122
               C336 127 335 138 322 139
               C240 139 110 139 38 138 Z"
            fill={c.sole}
            stroke="#00000010"
            strokeWidth="1"
          />
          <path
            d="M46 131 C140 122 260 122 318 131"
            fill="none"
            stroke="#0000000e"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>

        {/* ---- upper: one silhouette from toe to heel ---------------- */}
        <g
          style={{
            opacity: L.upper.opacity,
            transform: `translateY(${L.upper.ty}px) scaleY(${puff})`,
            transformOrigin: "190px 120px",
            transition: `opacity ${EASE}, transform ${EASE}`,
          }}
        >
          <path
            d="M40 121
               C34 100 44 82 74 74
               C118 60 172 62 210 74
               C220 78 224 86 236 86
               C236 68 248 60 270 62
               C288 64 300 74 306 90
               C316 104 318 114 312 121
               Z"
            fill={`url(#${gid}-body)`}
          />
          {/* vamp stitch line */}
          <path
            d="M54 116 C104 84 168 80 220 90"
            fill="none"
            stroke="#00000016"
            strokeWidth="1.5"
          />
          {/* heel counter seam */}
          <path
            d="M300 121 C302 100 296 84 276 80"
            fill="none"
            stroke={c.accent}
            strokeWidth={heelStroke}
            strokeLinecap="round"
            style={{ transition: `stroke-width ${EASE}` }}
          />
          {/* brand mark */}
          <g style={{ opacity: L.mark.opacity, transition: `opacity ${EASE}` }}>
            <circle cx="140" cy="106" r="3.5" fill={c.accent} />
            <path
              d="M148 106 q10 -9 22 -1"
              fill="none"
              stroke={c.accent}
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </g>
        </g>

        {/* ---- toe box (front, morphs with toeBoxSpace) --------------- */}
        <g
          style={{
            opacity: L.toe.opacity,
            transform: `translateY(${L.toe.ty}px) translateX(${toeShift}px) scaleX(${toeGrow})`,
            transformOrigin: "64px 104px",
            transition: `opacity ${EASE}, transform ${EASE}`,
          }}
        >
          <path
            d="M40 121 C34 100 44 82 74 74 C84 70 94 68 104 67 L106 121 Z"
            fill={c.accent}
            opacity="0.9"
          />
          <path
            d="M46 116 C42 98 48 84 68 76"
            fill="none"
            stroke={c.panel}
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.5"
          />
        </g>

        {/* ---- collar + tongue (morph up with instepVolume) ---------- */}
        <g
          style={{
            opacity: L.collar.opacity,
            transform: `translateY(${L.collar.ty + instepLift}px)`,
            transition: `opacity ${EASE}, transform ${EASE}`,
          }}
        >
          {/* ankle opening scoop */}
          <ellipse
            cx="258"
            cy="78"
            rx="18"
            ry="10"
            fill={c.accent}
            opacity="0.45"
            transform="rotate(-18 258 78)"
          />
          {/* tongue tip peeking from the throat */}
          <path
            d="M228 88 C227 76 232 69 242 68 C250 70 251 80 250 90 Z"
            fill={c.panel}
          />
          {/* heel pull tab (small, attached) */}
          <path
            d="M292 80 C296 68 308 68 310 80 C311 86 306 88 302 88"
            fill="none"
            stroke={c.accent}
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        </g>

        {/* ---- closure ------------------------------------------------ */}
        <g
          style={{
            opacity: L.lace.opacity,
            transform: `translateY(${L.lace.ty + instepLift}px)`,
            transition: `opacity ${EASE}, transform ${EASE}`,
          }}
        >
          <Closure kind={spec.config.closure} accent={c.accent} panel={c.panel} />
        </g>
      </g>
    </svg>
  );
}

function Closure({
  kind,
  accent,
  panel,
}: {
  kind: ShoeSpec["config"]["closure"];
  accent: string;
  panel: string;
}) {
  if (kind === "laces") {
    return (
      <g stroke={accent} strokeWidth="3.5" strokeLinecap="round" fill="none">
        <path d="M142 112 L196 92" />
        <path d="M142 101 L196 82" />
        <path d="M150 90 L200 74" />
        <path d="M142 112 L196 82" opacity="0.3" />
        <path d="M142 101 L196 92" opacity="0.3" />
      </g>
    );
  }
  if (kind === "velcro") {
    return (
      <g fill={panel} stroke={accent} strokeWidth="2.5">
        <rect x="140" y="98" width="62" height="14" rx="5" />
        <rect x="148" y="80" width="62" height="14" rx="5" />
        <rect x="190" y="98" width="12" height="14" rx="3" fill={accent} />
        <rect x="198" y="80" width="12" height="14" rx="3" fill={accent} />
      </g>
    );
  }
  return (
    <g>
      <path
        d="M142 108 C160 84 190 80 206 90 C208 102 202 110 194 114 C174 108 154 110 142 116 Z"
        fill={panel}
      />
      <g stroke={accent} strokeWidth="2" opacity="0.4">
        <path d="M150 102 L198 94" />
        <path d="M150 110 L198 104" />
      </g>
    </g>
  );
}
