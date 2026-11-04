# Geo-FS-Renderer-Fixer
A simple bookmarklet and/or Javascript for stopping geo-fs from rendering more. Compatible with new Geo-FS 4.0
A small client-side script for GeoFS (the browser-based flight simulator built on CesiumJS) that cuts down unnecessary rendering. It's aimed at people running a lot of addons and/or high graphics settings, where Cesium ends up redrawing the whole scene far more often than it needs to.

It does not modify anything on the server, give you any flight/physics advantage, or affect other players — it only changes how often your own browser redraws the screen. It's a performance tool, not a cheat.

The problem
By default, Cesium redraws the entire scene every single frame (up to your display's refresh rate) even when nothing on screen has changed. At high graphics settings — PBR shaders, water reflections, volumetric clouds — every one of those redraws is expensive. On top of that, GeoFS addons that touch entities or primitives (liveries, overlays, HUDs, etc.) each tend to trigger Cesium to invalidate the scene and redraw, so the more addons you run, the more often this happens.

This script gives you three tools to deal with it:

Function	What it does
enableOnDemand()	Switches Cesium to render only when something actually changes (camera move, animation tick), instead of continuously. Usually the single biggest fix.
diagnose(seconds)	Counts frames actually rendered over a time window and logs stack traces for what's requesting redraws — use it to find which addon is the worst offender.
freeze() / unfreeze()	Fully stops/resumes the render loop and new tile requests. The scene stays frozen exactly as it looked — handy for screenshots or killing GPU load entirely while paused.
probe() is included to confirm the script can actually find GeoFS's Cesium viewer on your build — run this first.

Compatibility
GeoFS has exposed its Cesium Viewer at window.geofs.api.viewer since at least v3.x, and every community addon (livery selectors, lightning effects, HD terrain tweaks) hooks in the same way. This script tries that path plus a couple of fallbacks, and probe() will tell you plainly whether it found anything. If GeoFS changes this internal structure in a future update and probe() comes back empty, open the browser console, inspect window.geofs, and update the findViewer() candidates list in the script with the new path.

Tested conceptually against GeoFS 4.0 beta's publicly documented changes (UI/settings revamp, GPWS, co-pilot system) — none of those are known to touch the Cesium viewer's location, but this hasn't been independently verified against the beta's internals.

Installation
Desktop (Chrome / Firefox / Edge) — Tampermonkey
Install the Tampermonkey extension.
Click the Tampermonkey icon → Create a new script, delete the placeholder, and paste in the contents of geofs-render-freeze.user.js.
Save (Ctrl+S). It auto-runs on www.geo-fs.com and beta.geo-fs.com.
Open GeoFS, open DevTools (F12) → Console. You should see [GeoFSRenderFreeze] Loaded.
iPad / mobile Safari — Bookmarklet
Mobile Safari doesn't support browser extensions like Tampermonkey, so use the bookmarklet build instead:

Open any page in Safari, tap Share → Add Bookmark, and save it (e.g. name it "GeoFS Fix").
Open Bookmarks, swipe/tap to Edit the bookmark you just made.
Replace its URL with the full contents of bookmarklet.txt (a single javascript:(function(){...})(); line).
Tap Done.
Open GeoFS, let it fully load, then open Bookmarks and tap your saved bookmark to run it.
The bookmarklet auto-applies enableOnDemand() on tap and shows an alert() confirming success or failure, since iPad Safari has no built-in console. For probe()/diagnose() output on iPad, connect it to a Mac via cable and use Safari → Develop → [your iPad] → [GeoFS tab] (Web Inspector) with Web Inspector enabled under Settings → Safari → Advanced on the iPad.

Usage
Once loaded, everything is available under window.GeoFSRenderFreeze in the console:

js
GeoFSRenderFreeze.probe();             // confirm the viewer was found
GeoFSRenderFreeze.enableOnDemand();    // stop redrawing when nothing's changed
GeoFSRenderFreeze.disableOnDemand();   // back to continuous rendering
GeoFSRenderFreeze.diagnose(20);        // log what's triggering redraws over 20s
GeoFSRenderFreeze.freeze();            // hard stop: no more frames, no more tiles
GeoFSRenderFreeze.unfreeze();          // resume normal rendering
GeoFSRenderFreeze.isFrozen();          // true/false
Finding a problem addon
Run GeoFSRenderFreeze.diagnose(20) with your usual addons enabled and fly normally for 20 seconds.
Note the frame count and any repeated stack traces logged.
Disable one addon, repeat, and compare. The addon whose removal drops the frame count/call volume the most is your culprit.
Files
geofs-render-freeze.user.js — the full Tampermonkey userscript (commented, readable).
bookmarklet.txt — a minified, single-line javascript: build of the same script for use as a Safari/mobile bookmarklet.
Disclaimer
Unofficial, community-made, not affiliated with GeoFS or Xavier Tassin. Since it hooks into GeoFS's internal (undocumented) objects, a future GeoFS update can break it without warning — if that happens, run probe() and update findViewer() accordingly.

License
MIT — do whatever you want with it.
