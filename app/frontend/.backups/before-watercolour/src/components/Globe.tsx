import { useEffect, useRef, useState } from "react";
import { geoOrthographic, geoPath, geoGraticule10 } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
export default function Globe() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const focus = useRef(false);
  const paused = useRef(false);
  const [error, setError] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) {
      setError(true);
      return;
    }
    let frame = 0,
      alive = true;
    let rotation: [number, number, number] = [-107, -10, 0];
    let drag = false,
      previous = [0, 0],
      scale = 1;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let land: GeoJSON.FeatureCollection;
    const projection = geoOrthographic().clipAngle(90);
    let lastDraw = 0;
    const draw = (now = 0) => {
      if (!alive) return;
      if (now - lastDraw < 40) {
        frame = requestAnimationFrame(draw);
        return;
      }
      lastDraw = now;
      const width = el.clientWidth,
        height = el.clientHeight;
      const dpr = Math.min(devicePixelRatio, 2);
      if (el.width !== width * dpr || el.height !== height * dpr) {
        el.width = width * dpr;
        el.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (focus.current) {
        rotation[0] += (-109 - rotation[0]) * (reduced ? 1 : 0.06);
        rotation[1] += (-5 - rotation[1]) * (reduced ? 1 : 0.06);
      } else if (!drag && !reduced && !paused.current) rotation[0] += 0.025;
      const radius = Math.min(width, height) * 0.385 * scale;
      projection
        .translate([width * 0.5, height * 0.5])
        .scale(radius)
        .rotate(rotation);
      const p = geoPath(projection, ctx);
      ctx.beginPath();
      p({ type: "Sphere" });
      const shade = ctx.createRadialGradient(
        width * 0.42,
        height * 0.36,
        radius * 0.1,
        width * 0.54,
        height * 0.55,
        radius,
      );
      shade.addColorStop(0, "#17343c");
      shade.addColorStop(0.7, "#0d222b");
      shade.addColorStop(1, "#050b12");
      ctx.fillStyle = shade;
      ctx.shadowColor = "#507f83";
      ctx.shadowBlur = 35;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#749e9c55";
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.beginPath();
      p(geoGraticule10());
      ctx.strokeStyle = "#7da7ae16";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      if (land) {
        ctx.beginPath();
        p(land);
        ctx.fillStyle = "#42675f";
        ctx.fill();
        ctx.strokeStyle = "#a2c7b449";
        ctx.lineWidth = 0.65;
        ctx.stroke();
        const malaysia = land.features.find((f) => String(f.id) === "458");
        if (malaysia) {
          ctx.beginPath();
          p(malaysia);
          ctx.fillStyle = "#d7ac77";
          ctx.fill();
        }
        ctx.save();
        ctx.beginPath();
        p(land);
        ctx.clip();
        ctx.fillStyle = "#aecac057";
        for (let x = 0; x < width; x += 5)
          for (let y = 0; y < height; y += 5) {
            ctx.beginPath();
            ctx.arc(x, y, 0.65, 0, Math.PI * 2);
            ctx.fill();
          }
        ctx.restore();
      }
      const point = projection([109, 4]);
      if (point && Math.cos(((109 + rotation[0]) * Math.PI) / 180) > 0) {
        ctx.beginPath();
        ctx.arc(point[0], point[1], 7, 0, Math.PI * 2);
        ctx.strokeStyle = "#d7ac77";
        ctx.stroke();
        ctx.fillStyle = "#f0ede6";
        ctx.font = '10px "DM Sans", sans-serif';
        ctx.fillText("M A L A Y S I A", point[0] + 18, point[1] + 3);
      }
      frame = requestAnimationFrame(draw);
    };
    fetch("/data/world.json")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((topo: Topology<{ countries: GeometryCollection }>) => {
        land = feature(topo, topo.objects.countries);
      })
      .catch(() => setError(true));
    draw();
    const down = (e: PointerEvent) => {
      drag = true;
      focus.current = false;
      setFocused(false);
      previous = [e.clientX, e.clientY];
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      rotation[0] += (e.clientX - previous[0]) * 0.25;
      rotation[1] = Math.max(
        -70,
        Math.min(70, rotation[1] - (e.clientY - previous[1]) * 0.25),
      );
      previous = [e.clientX, e.clientY];
    };
    const up = () => {
      drag = false;
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      scale = Math.max(0.8, Math.min(1.25, scale - e.deltaY * 0.001));
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, []);
  return (
    <div className="globe-stage">
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <span className="globe-coordinate">04° 12′ N / 109° 27′ E</span>
      <canvas
        ref={canvas}
        aria-label="Interactive Earth. Drag to rotate; control-scroll to zoom."
      />
      <div className="globe-controls">
        <button
          onClick={() => {
            focus.current = true;
            setFocused(true);
          }}
        >
          {focused ? "Malaysia in focus" : "Focus on Malaysia"} <span>↗</span>
        </button>
        <button
          aria-pressed={stopped}
          onClick={() => {
            paused.current = !paused.current;
            setStopped(paused.current);
          }}
        >
          {stopped ? "Resume rotation" : "Pause rotation"}
        </button>
      </div>
      <span className="globe-caption">
        {error
          ? "Geography unavailable · use the Explorer"
          : "DRAG TO EXPLORE · CTRL + SCROLL TO ZOOM"}
      </span>
    </div>
  );
}
