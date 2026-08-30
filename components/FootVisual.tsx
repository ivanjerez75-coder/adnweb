"use client";

/**
 * Top-down foot silhouette. Subtle markers reflect the detected features so the
 * scan and profile screens feel specific to the user. Not a medical diagram.
 */

import { useId } from "react";
import type { FootFeature } from "@/lib/engine/types";

export function FootVisual({
  side = "right",
  flags = [],
  scanning = false,
  className,
}: {
  side?: "left" | "right";
  flags?: FootFeature[];
  scanning?: boolean;
  className?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const has = (f: FootFeature) => flags.includes(f);

  return (
    <svg
      viewBox="0 0 160 260"
      className={className}
      role="img"
      aria-label={`Pie ${side === "left" ? "izquierdo" : "derecho"}`}
      style={{
        width: "100%",
        height: "auto",
        display: "block",
        transform: side === "left" ? "scaleX(-1)" : undefined,
      }}
    >
      <defs>
        <radialGradient id={`${gid}-swell`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--color-brand)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--color-brand)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* swelling glow */}
      {(has("swollen-feet") || has("swollen-ankles")) && (
        <ellipse
          cx="80"
          cy={has("swollen-ankles") ? 210 : 150}
          rx="70"
          ry="60"
          fill={`url(#${gid}-swell)`}
        />
      )}

      {/* sole outline */}
      <path
        d="M80 12
           C112 12 124 40 122 78
           C121 104 116 122 118 150
           C120 182 116 214 104 234
           C96 248 64 248 56 234
           C44 214 40 182 42 150
           C44 122 39 104 38 78
           C36 40 48 12 80 12 Z"
        fill="var(--color-surface)"
        stroke="var(--color-line)"
        strokeWidth="2"
      />

      {/* toes */}
      <g fill="var(--color-surface-2)" stroke="var(--color-line)" strokeWidth="1.5">
        <ellipse cx="66" cy="20" rx="11" ry="13" />
        <ellipse cx="86" cy="16" rx="8" ry="11" />
        <ellipse cx="100" cy="20" rx="7" ry="10" />
        <ellipse cx="112" cy="28" rx="6" ry="9" />
        <ellipse cx="121" cy="40" rx="5.5" ry="8" />
      </g>

      {/* high instep band */}
      {has("high-instep") && (
        <path
          d="M44 132 Q80 118 118 132 L116 150 Q80 138 46 150 Z"
          fill="var(--color-brand)"
          opacity="0.16"
        />
      )}

      {/* bunion */}
      {has("bunion") && (
        <>
          <path
            d="M40 60 Q26 66 30 84 Q34 98 46 96 Q44 78 48 62 Z"
            fill="var(--color-brand)"
            opacity="0.22"
          />
          <circle cx="36" cy="78" r="4" fill="var(--color-brand)" />
        </>
      )}

      {/* hammer toes */}
      {has("hammer-toes") && (
        <g stroke="var(--color-brand)" strokeWidth="2.5" fill="none" strokeLinecap="round">
          <path d="M86 12 l0 -6 l5 0" />
          <path d="M100 16 l0 -6 l5 1" />
          <path d="M112 24 l1 -6 l5 1" />
        </g>
      )}

      {/* scan sweep */}
      {scanning && (
        <rect
          x="24"
          y="122"
          width="112"
          height="4"
          rx="2"
          fill="var(--color-brand)"
          opacity="0.9"
          style={{ animation: "nonna-scan-line 2.4s ease-in-out infinite" }}
        />
      )}
    </svg>
  );
}
