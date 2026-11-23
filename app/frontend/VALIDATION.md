# Validation — 6 November 2026

- TypeScript checking and Vite production build passed after the redesign.
- `npm test`: all six Canvas tests passed (mouse/touch pigment response, reduced motion, manual pause, hidden-tab suspension/resumption, finite compact animation, and unavailable-Canvas fallback).
- All five public pages loaded. Navigation contains no Model Insights link; `/models` shows the standard page-not-found view. The previous component is archived outside the source tree.
- Overview: pale globe and layered watercolour mountains rendered. Malaysia focus, zoom, keyboard input and painting pause/resume controls exercised. Desktop and 390px phone layouts visually inspected.
- Explorer: light OpenStreetMap basemap, Malaysia outline and classifications rendered. Cameron Highlands search changed the camera and opened location inspection. Hiding susceptibility changed the legend.
- Analytics: Kundasang + seven-day window changed the displayed sample rainfall total to 203 mm.
- Incidents: Sabah filter yielded one fixture; selecting it updated the detail view and URL to the Kundasang example.
- Methodology: SoilGrids search returned the matching source. A clipped accessibility label caused phone-width document overflow; positioning its scrolling container fixed this. Overview and Methodology had no horizontal document overflow at 390px.
- Mobile navigation opened and navigated to Overview. No browser console errors were captured at the final check.

Manual checks used the in-app Chromium browser. These are targeted checks, not full cross-browser, screen-reader or physical touch-device certification. Reduced motion and Canvas fallback were verified with isolated lifecycle tests, not by changing operating-system settings. Satellite/topographic providers and every map zoom were not exhaustively tested.

The build retains the existing warning for the lazy MapLibre chunk (about 1.08 MB before gzip); its worker is explicitly bundled. External tiles require internet. Real backend contracts, model evaluation, source verification, environmental layers and temporal comparison remain pending. Fixture data, ML types and prediction-adapter architecture are preserved.
