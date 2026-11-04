// ==UserScript==
// @name         GeoFS Render Freeze
// @namespace    geofs-render-freeze
// @version      1.1.0
// @description  Cuts down unnecessary CesiumJS redraws in GeoFS (on-demand rendering + a diagnostic), plus a full freeze/unfreeze. Works on the main site and the 4.0 beta.
// @author       you
// @match        https://www.geo-fs.com/geofs.php?v=*
// @match        https://beta.geo-fs.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
 
(function () {
  "use strict";
 
  const LOG = "[GeoFSRenderFreeze]";
  let frozen = false;
  let savedMaxRequests = null;
 
  // GeoFS has exposed its Cesium Viewer at window.geofs.api.viewer since at
  // least v3.x (confirmed by multiple community addons). These are fallback
  // spots in case the 4.0 beta nests or renames it — run probe() to see
  // exactly what this build exposes, and add another candidate here if
  // none of these match.
  function findViewer() {
    const candidates = [
      () => window.geofs && window.geofs.api && window.geofs.api.viewer,
      () => window.geofs && window.geofs.viewer,
      () => window.viewer,
    ];
    for (const get of candidates) {
      try {
        const v = get();
        if (v && v.scene && v.clock) return v;
      } catch (e) {
        /* ignore and try next candidate */
      }
    }
    return null;
  }
 
  function probe() {
    const viewer = findViewer();
    console.log(LOG, "Cesium global present:", typeof window.Cesium !== "undefined");
    console.log(LOG, "window.geofs present:", !!window.geofs, "| window.geofs.api present:", !!(window.geofs && window.geofs.api));
    console.log(LOG, "viewer found:", !!viewer, viewer || "(none)");
    if (!viewer) {
      console.warn(
        LOG,
        "Could not locate the Cesium viewer automatically. Inspect `window.geofs` in the console, find the Viewer instance, and add its path to findViewer()."
      );
    }
    return viewer;
  }
 
  function freeze() {
    const viewer = findViewer();
    if (!viewer) {
      console.warn(LOG, "No viewer found — nothing to freeze. Run GeoFSRenderFreeze.probe() to debug.");
      return false;
    }
    if (frozen) {
      console.log(LOG, "Already frozen.");
      return true;
    }
 
    // 1) Stop Cesium's own render loop — no further frames get drawn, so
    //    the view stays exactly as it last looked.
    viewer.useDefaultRenderLoop = false;
 
    // 2) Stop new tile/imagery requests from going out while frozen.
    //    (Anything already in flight may still land, but won't be drawn
    //    since the render loop above is off.)
    if (window.Cesium && window.Cesium.RequestScheduler) {
      savedMaxRequests = window.Cesium.RequestScheduler.maximumRequests;
      window.Cesium.RequestScheduler.maximumRequests = 0;
    }
 
    frozen = true;
    console.log(LOG, "Frozen. Call GeoFSRenderFreeze.unfreeze() to resume.");
    return true;
  }
 
  function unfreeze() {
    const viewer = findViewer();
    if (!viewer) {
      console.warn(LOG, "No viewer found.");
      return false;
    }
 
    viewer.useDefaultRenderLoop = true;
 
    if (window.Cesium && window.Cesium.RequestScheduler && savedMaxRequests !== null) {
      window.Cesium.RequestScheduler.maximumRequests = savedMaxRequests;
      savedMaxRequests = null;
    }
 
    frozen = false;
    console.log(LOG, "Resumed normal rendering.");
    return true;
  }
 
  // --- On-demand rendering ---------------------------------------------
  // By default Cesium redraws the *entire* scene every single frame (up to
  // your monitor's refresh rate) even when nothing moved. At high quality
  // settings (water SSR, volumetric clouds, PBR shaders) that's expensive.
  // requestRenderMode tells Cesium to only redraw when something actually
  // changes (camera move, an entity updates, a clock tick, etc.), which is
  // usually the single biggest win for "it's rendering constantly for no
  // reason." This does NOT stop you from flying — it just stops wasted
  // frames when the view is static.
  let onDemandPrev = null; // { requestRenderMode, maximumRenderTimeChange }
 
  function enableOnDemand(maximumRenderTimeChange = Infinity) {
    const viewer = findViewer();
    if (!viewer) {
      console.warn(LOG, "No viewer found — can't enable on-demand rendering.");
      return false;
    }
    const scene = viewer.scene;
    onDemandPrev = {
      requestRenderMode: scene.requestRenderMode,
      maximumRenderTimeChange: scene.maximumRenderTimeChange,
    };
    scene.requestRenderMode = true;
    // maximumRenderTimeChange forces a redraw after this many seconds pass
    // even with nothing new to show. Infinity disables that periodic forced
    // redraw entirely — if GeoFS (or an addon) relies on a low value here to
    // keep instruments/clock ticking visually, lower this instead, e.g. 1.
    scene.maximumRenderTimeChange = maximumRenderTimeChange;
    scene.requestRender(); // draw one frame now so the view doesn't go blank
    console.log(
      LOG,
      `On-demand rendering enabled (maximumRenderTimeChange=${maximumRenderTimeChange}). Call GeoFSRenderFreeze.disableOnDemand() to go back to continuous rendering.`
    );
    return true;
  }
 
  function disableOnDemand() {
    const viewer = findViewer();
    if (!viewer) {
      console.warn(LOG, "No viewer found.");
      return false;
    }
    const scene = viewer.scene;
    if (onDemandPrev) {
      scene.requestRenderMode = onDemandPrev.requestRenderMode;
      scene.maximumRenderTimeChange = onDemandPrev.maximumRenderTimeChange;
      onDemandPrev = null;
    } else {
      scene.requestRenderMode = false;
    }
    console.log(LOG, "Back to continuous rendering.");
    return true;
  }
 
  // --- Diagnostic ---------------------------------------------------------
  // Counts actual rendered frames over a window, and (while requestRenderMode
  // is on) logs stack traces for the first few calls that *ask* for a
  // redraw — handy for spotting which addon is repeatedly invalidating the
  // scene. Run this before and after disabling addons one at a time to
  // narrow down the culprit.
  function diagnose(seconds = 20, logCallers = true) {
    const viewer = findViewer();
    if (!viewer) {
      console.warn(LOG, "No viewer found — can't diagnose.");
      return;
    }
    const scene = viewer.scene;
    let frameCount = 0;
    let callerLogsLeft = logCallers ? 8 : 0;
    const start = performance.now();
 
    const removePostRender = scene.postRender.addEventListener(() => frameCount++);
 
    let originalRequestRender = null;
    if (callerLogsLeft > 0 && typeof scene.requestRender === "function") {
      originalRequestRender = scene.requestRender.bind(scene);
      scene.requestRender = function (...args) {
        if (callerLogsLeft > 0) {
          callerLogsLeft--;
          console.log(LOG, "requestRender() called from:", new Error().stack);
        }
        return originalRequestRender(...args);
      };
    }
 
    console.log(LOG, `Diagnosing for ${seconds}s (requestRenderMode is ${scene.requestRenderMode ? "ON" : "OFF — every frame renders regardless"})...`);
 
    setTimeout(() => {
      removePostRender();
      if (originalRequestRender) scene.requestRender = originalRequestRender;
      const elapsed = (performance.now() - start) / 1000;
      console.log(LOG, `${frameCount} frames rendered in ${elapsed.toFixed(1)}s (~${(frameCount / elapsed).toFixed(1)} fps).`);
    }, seconds * 1000);
  }
 
  window.GeoFSRenderFreeze = {
    freeze,
    unfreeze,
    enableOnDemand,
    disableOnDemand,
    diagnose,
    probe,
    isFrozen: () => frozen,
  };
 
  console.log(
    LOG,
    "Loaded. GeoFSRenderFreeze.enableOnDemand() to cut wasted redraws, .diagnose() to see what's triggering them, .freeze()/.unfreeze() for a hard stop, .probe() to debug."
  );
})();
