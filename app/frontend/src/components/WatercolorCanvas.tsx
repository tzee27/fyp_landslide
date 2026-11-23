import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";
type Bloom = {
  x: number;
  y: number;
  born: number;
  seed: number;
  color: string;
};
// Deliberately composed ridge lines, not a scientific terrain model.
const ridges = [
  { y: 0.48, amp: 0.12, color: "#9aafc5" },
  { y: 0.57, amp: 0.17, color: "#b89eb8" },
  { y: 0.65, amp: 0.14, color: "#6e9c98" },
  { y: 0.75, amp: 0.12, color: "#71966d" },
  { y: 0.85, amp: 0.1, color: "#b9996a" },
];
function ridge(x: number, layer: number) {
  return (
    Math.sin(x * 10 + layer * 1.8) * 0.48 +
    Math.sin(x * 23 + layer * 0.7) * 0.23 +
    Math.sin(x * 47 + layer) * 0.1 +
    Math.sin(x * 91) * 0.035
  );
}
export default function WatercolorCanvas({
  compact = false,
  paused = false,
}: {
  compact?: boolean;
  paused?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setFailed(true);
      return;
    }
    const host = canvas.parentElement!.parentElement!;
    let frame = 0,
      visible = true,
      disposed = false,
      last = 0,
      elapsed = 0,
      width = 1,
      height = 1;
    let blooms: Bloom[] = [];
    let lastPointer = 0;
    const texture = document.createElement("canvas");
    texture.width = 160;
    texture.height = 160;
    const paper = texture.getContext("2d");
    if (paper) {
      let seed = 18;
      for (let i = 0; i < 2600; i++) {
        seed = (seed * 16807) % 2147483647;
        const x = seed % 160;
        seed = (seed * 16807) % 2147483647;
        paper.fillStyle =
          i % 3 ? "rgba(76,76,48,.045)" : "rgba(255,255,255,.20)";
        paper.fillRect(x, seed % 160, 1, 1);
      }
    }
    const mountain = (layer: number, offset = 0) => {
      const r = ridges[layer];
      ctx.beginPath();
      ctx.moveTo(-5, height + 5);
      for (let i = 0; i <= 100; i++) {
        const x = i / 100;
        ctx.lineTo(
          x * width,
          (r.y + ridge(x, layer) * r.amp) * height + offset,
        );
      }
      ctx.lineTo(width + 5, height + 5);
      ctx.closePath();
    };
    const paint = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const reveal = reduced || paused ? 1 : Math.min(1, elapsed / 2400);
      for (let layer = 0; layer < ridges.length; layer++) {
        const wash = ridges[layer];
        for (let pass = 0; pass < 7; pass++) {
          const drift =
            reduced || paused ? 0 : Math.sin(time / 10000 + layer) * 1.5;
          mountain(layer, drift + (pass - 3) * 1.3);
          ctx.globalAlpha = (0.045 + layer * 0.004) * reveal;
          ctx.fillStyle = wash.color;
          ctx.fill();
        }
        mountain(layer);
        ctx.save();
        ctx.clip();
        const fade = ctx.createLinearGradient(0, height * 0.5, 0, height);
        fade.addColorStop(0, "#fffcf700");
        fade.addColorStop(1, "#fffcf766");
        ctx.globalAlpha = 1;
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
      // Irregular translucent pigment edges expand along the mountain washes.
      ctx.save();
      mountain(0);
      ctx.clip();
      for (const b of blooms) {
        const age = reduced ? 1200 : elapsed - b.born;
        const spread = 18 + Math.min(age / 32, 95);
        const alpha = reduced ? 0.12 : Math.max(0, 1 - age / 4300) * 0.13;
        ctx.globalCompositeOperation = "multiply";
        for (let pass = 0; pass < 6; pass++) {
          ctx.beginPath();
          for (let i = 0; i <= 48; i++) {
            const angle = (i / 48) * Math.PI * 2;
            const edge =
              1 +
              0.14 * Math.sin(angle * 5 + b.seed) +
              0.09 * Math.sin(angle * 9 + b.seed * 2);
            const radius = spread * (1 + pass * 0.065) * edge;
            const x = b.x + Math.cos(angle) * radius * 1.6,
              y = b.y + Math.sin(angle) * radius * 0.66;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fillStyle = b.color;
          ctx.globalAlpha = alpha / 4;
          ctx.fill();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 0.5;
      const pattern = ctx.createPattern(texture, "repeat");
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      // The same ridgelines appear as delicate dry-brush contour strokes.
      for (let l = 1; l < 4; l++) {
        mountain(l, 5);
        ctx.strokeStyle = "rgba(65,105,88,.13)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    };
    const animate = (time: number) => {
      frame = 0;
      if (disposed || !visible || document.hidden) return;
      if (time - last < 65) {
        frame = requestAnimationFrame(animate);
        return;
      }
      const delta = Math.min(time - last, 100);
      last = time;
      if (!paused && !reduced) elapsed += delta;
      paint(elapsed);
      blooms = blooms.filter((b) => elapsed - b.born < 4400);
      if (
        !reduced &&
        !paused &&
        (!compact || elapsed < 2800 || blooms.length > 0)
      )
        frame = requestAnimationFrame(animate);
    };
    const wake = () => {
      if (!frame && !disposed && visible && !document.hidden) {
        last = performance.now();
        frame = requestAnimationFrame(animate);
      }
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(devicePixelRatio, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(elapsed);
      wake();
    };
    const pointer = (event: PointerEvent) => {
      if (paused) return;
      const now = performance.now();
      if (now - lastPointer < 85) return;
      lastPointer = now;
      const r = canvas.getBoundingClientRect();
      const x = event.clientX - r.left,
        y = event.clientY - r.top;
      if (x < 0 || x > width || y < 0 || y > height) return;
      const palette = ["#648c77", "#8b72a3", "#4e9aac", "#bf8868"];
      blooms.push({
        x,
        y,
        born: elapsed,
        seed: x * 0.03,
        color: palette[Math.floor((x / Math.max(width, 1)) * 4) % 4],
      });
      blooms = blooms.slice(-9);
      paint(elapsed);
      wake();
    };
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else wake();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (!visible) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else wake();
    });
    intersection.observe(canvas);
    host.addEventListener("pointermove", pointer, { passive: true });
    host.addEventListener("pointerdown", pointer, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    resize();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection.disconnect();
      host.removeEventListener("pointermove", pointer);
      host.removeEventListener("pointerdown", pointer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [compact, paused, reduced]);
  return (
    <div
      className={
        "watercolour " +
        (compact ? "watercolour-compact" : "") +
        (failed ? " watercolour-fallback" : "")
      }
      aria-hidden="true"
      data-motion={reduced ? "reduced" : paused ? "paused" : "active"}
    >
      <canvas ref={ref} />
      {failed && (
        <svg viewBox="0 0 800 300" preserveAspectRatio="none">
          <path
            d="M0 270 Q100 220 190 250 L330 110 420 180 550 60 800 220V300H0Z"
            fill="#adc5ba"
          />
          <path
            d="M0 300 L250 240 410 160 590 245 710 180 800 230V300Z"
            fill="#bbcbd1"
          />
        </svg>
      )}
    </div>
  );
}
