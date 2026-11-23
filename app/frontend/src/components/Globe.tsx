import { useEffect, useRef } from "react";
import { geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { useReducedMotion } from "../hooks/useReducedMotion";

export default function Globe() {
  const globe = useRef<HTMLDivElement>(null);
  const overlay = useRef<SVGSVGElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = globe.current!;
    const svg = overlay.current!;
    const abort = new AbortController();
    const options = { signal: abort.signal };
    const projection = geoOrthographic().translate([500, 500]).scale(498);
    const path = geoPath(projection);
    const grid = geoGraticule10();
    let land: GeoJSON.FeatureCollection | undefined;
    let malaysia: GeoJSON.Feature | undefined;
    let longitude = 0, latitude = 0, frame = 0, timer = 0;
    let returning = false;
    let pointer: number | null = null;
    let previousX = 0, previousY = 0;
    let lastFrame = 0;
    const gridPath = svg.querySelector(".earth-grid")!;
    const countryPath = svg.querySelector("#earth-countries")!;
    const malaysiaPath = svg.querySelector(".earth-malaysia")!;

    function draw(now: number) {
      frame = 0;
      if (returning) {
        const decay = reduced ? 0 : Math.exp(-Math.min(now - lastFrame, 80) / 155);
        longitude *= decay;
        latitude *= decay;
        if (Math.max(Math.abs(longitude), Math.abs(latitude)) < 0.12) {
          longitude = latitude = 0;
          returning = false;
        }
      }
      lastFrame = now;
      const exploring = !!land && (longitude !== 0 || latitude !== 0);
      svg.style.display = exploring ? "block" : "none";
      if (exploring && land) {
        projection.rotate([-109 + longitude, -4 + latitude, 0]);
        gridPath.setAttribute("d", path(grid) || "");
        countryPath.setAttribute("d", path(land) || "");
        malaysiaPath.setAttribute("d", malaysia ? path(malaysia) || "" : "");
      }
      const point = exploring ? projection([109, 4])! : [500, 500];
      el.style.setProperty("--marker-x", point[0] / 10 + "%");
      el.style.setProperty("--marker-y", point[1] / 10 + "%");
      if (returning) frame = requestAnimationFrame(draw);
    }
    function redraw() {
      if (!frame) frame = requestAnimationFrame(draw);
    }
    function home(delay: number) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        returning = true;
        lastFrame = performance.now();
        redraw();
      }, delay);
    }
    function turn(dx: number, dy: number) {
      window.clearTimeout(timer);
      returning = false;
      longitude = Math.max(-70, Math.min(70, longitude + dx));
      latitude = Math.max(-42, Math.min(42, latitude + dy));
      redraw();
    }
    fetch("/data/world.json", options).then(response => {
      if (!response.ok) throw Error("Geography unavailable");
      return response.json();
    }).then((world: Topology<{ countries: GeometryCollection }>) => {
      if (abort.signal.aborted) return;
      land = feature(world, world.objects.countries);
      malaysia = land.features.find(country => String(country.id) === "458");
      redraw();
    }).catch(() => { /* The illustrated home view remains available. */ });

    el.addEventListener("wheel", event => {
      if (event.ctrlKey || pointer !== null) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      turn(delta * unit * 0.12, 0);
      home(220);
    }, { ...options, passive: true });
    el.addEventListener("pointerdown", event => {
      if (!event.isPrimary || event.button !== 0) return;
      pointer = event.pointerId;
      previousX = event.clientX;
      previousY = event.clientY;
      el.setPointerCapture(pointer);
    }, options);
    el.addEventListener("pointermove", event => {
      if (event.pointerId !== pointer) return;
      turn((event.clientX - previousX) * 0.18, (previousY - event.clientY) * 0.18);
      previousX = event.clientX;
      previousY = event.clientY;
    }, options);
    function release(event: PointerEvent) {
      if (pointer !== event.pointerId) return;
      pointer = null;
      if (longitude || latitude) home(0);
    }
    el.addEventListener("lostpointercapture", release, options);
    el.addEventListener("pointerup", release, options);
    el.addEventListener("pointercancel", release, options);
    el.addEventListener("keydown", event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      turn(event.key === "ArrowLeft" ? -12 : 12, 0);
      home(220);
    }, options);
    return () => {
      abort.abort();
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [reduced]);

  return (
    <div className="globe-stage">
      <div ref={globe} className="atlas-earth" role="group" tabIndex={0}
        aria-label="Earth centred on Malaysia. Scroll, drag or use the left and right arrow keys to explore. The globe returns to Malaysia.">
        <img src="/data/atlas-earth.svg" alt="" draggable={false} />
        <svg ref={overlay} className="earth-exploration" viewBox="0 0 1000 1000" aria-hidden="true">
          <defs>
            <radialGradient id="earth-sea" cx="36%" cy="34%" r="73%"><stop stopColor="#f4f8ed"/><stop offset=".7" stopColor="#d7e7e6"/><stop offset="1" stopColor="#aec8cf"/></radialGradient>
            <linearGradient id="earth-land" gradientUnits="userSpaceOnUse" x1="170" y1="140" x2="870" y2="800"><stop stopColor="#8caf83"/><stop offset=".35" stopColor="#bed0a2"/><stop offset=".65" stopColor="#78a590"/><stop offset="1" stopColor="#c7b58b"/></linearGradient>
            <pattern id="earth-grain" width="140" height="5" patternUnits="userSpaceOnUse"><path d="M0 2 Q35 1 70 2 T140 2" fill="none" stroke="#f8f6f0" opacity=".28" strokeWidth=".65"/></pattern>
            <path id="earth-countries"/>
          </defs>
          <circle cx="500" cy="500" r="498" fill="url(#earth-sea)" stroke="#789b8e"/>
          <path className="earth-grid" fill="none" stroke="#557f7b" opacity=".23" strokeWidth=".65"/>
          <use href="#earth-countries" fill="url(#earth-land)" stroke="#51765e" strokeOpacity=".55" strokeWidth=".7"/>
          <use href="#earth-countries" fill="url(#earth-grain)"/>
          <path className="earth-malaysia" fill="#b67556" stroke="#855e45" strokeWidth=".8"/>
        </svg>
        <span className="earth-marker" aria-hidden="true">Malaysia</span>
        <span className="earth-beacon" aria-hidden="true" />
      </div>
    </div>
  );
}
