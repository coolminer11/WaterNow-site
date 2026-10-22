/*
 * WaterNow's own map, shared by the share page (s/) and the live page (live/): MapLibre GL JS drawing OpenFreeMap's
 * vector tiles with our style (assets/map/), light or dark with the system, labels in the page language.
 */
(function (root) {
  "use strict";
  var STYLES = new URL("map/", document.currentScript.src).href;

  /**
   * A map in `container` looking at center ([lon, lat]) and zoom, with one marker (a div of class markerClass).
   * Returns {show(lat, lon, zoom)}, or null with the container hidden when this browser can't draw it (MapLibre
   * blocked, no WebGL): the rest of the page works without it.
   */
  root.WN.map = function (container, lang, center, zoom, markerClass) {
    var gl = root.maplibregl, map;
    try {
      map = new gl.Map({ container: container, center: center, zoom: zoom, attributionControl: { compact: false } });
    } catch (e) {
      container.classList.add("hidden");
      return null;
    }
    map.addControl(new gl.NavigationControl({ visualizePitch: true }));

    // 3D buildings only while the map is tilted: seen from straight above they would just hide the outlines.
    function tilt() { return map.getPitch() > 0 ? "visible" : "none"; }
    map.on("pitch", function () { if (map.getLayer("building-3d")) map.setLayoutProperty("building-3d", "visibility", tilt()); });

    // The style files read in English ("name:en"); this puts the page's language first (lang is one of WN.LANGS).
    // Japanese goes to the local name before the romanised one: in Japan "name" already is Japanese.
    function prepare(previous, style) {
      style.layers.forEach(function (layer) {
        var field = layer.layout && layer.layout["text-field"];
        if (field && field[0] === "coalesce") {
          field[1] = ["get", "name:" + lang];
          if (lang === "ja") layer.layout["text-field"] = ["coalesce", ["get", "name:ja"], ["get", "name"], ["get", "name:latin"]];
        }
        if (layer.id === "building-3d") layer.layout.visibility = tilt();
      });
      return style;
    }
    var dark = root.matchMedia("(prefers-color-scheme: dark)");
    function paint() { map.setStyle(STYLES + "waternow-" + (dark.matches ? "dark" : "light") + ".json", { transformStyle: prepare }); }
    paint();
    dark.addEventListener("change", paint);

    var dot = document.createElement("div");
    dot.className = markerClass;
    var marker = new gl.Marker({ element: dot }), placed = false, target = null, loaded = false, flown = false;
    // First a gentle flight in (a jump with prefers-reduced-motion: MapLibre's own rule), then the camera follows.
    function go() {
      if (flown) map.easeTo({ center: target.center });
      else { flown = true; map.flyTo({ center: target.center, zoom: target.zoom, speed: 0.8 }); }
    }
    map.once("load", function () { loaded = true; if (target) go(); });

    return {
      show: function (lat, lon, zoom) {
        if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return; // also NaN: MapLibre would throw
        target = { center: [lon, lat], zoom: zoom };
        marker.setLngLat(target.center);
        if (!placed) { marker.addTo(map); placed = true; }
        if (loaded) go();
      }
    };
  };
})(this);
