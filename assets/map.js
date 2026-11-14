/*
 * WaterNow's own map, shared by the share page (s/) and the live page (live/): MapLibre GL JS drawing OpenFreeMap's
 * vector tiles with our style (assets/map/), light or dark with the system, labels in the page language.
 */
(function (root) {
  "use strict";
  var STYLES = new URL("map/", document.currentScript.src).href;

  // MapLibre's own words (the buttons' tooltips, what a screen reader says for the map, its buttons and the marker) in
  // the page's language: MapLibre only speaks English. The app's words where it has them (MapStrings: zoom_in,
  // zoom_out, to_north). Keys: MapLibre's locale ids (map.test.js checks each one exists in the vendored build).
  var STRINGS = {
    en: { "AttributionControl.ToggleAttribution": "Toggle attribution",
      "Map.Title": "Map", "Marker.Title": "Map marker", "NavigationControl.ZoomIn": "Zoom in",
      "NavigationControl.ZoomOut": "Zoom out", "NavigationControl.ResetBearing": "Drag to rotate map, click to reset north" },
    fr: { "AttributionControl.ToggleAttribution": "Afficher ou masquer les crédits",
      "Map.Title": "Carte", "Marker.Title": "Repère sur la carte", "NavigationControl.ZoomIn": "Zoom avant",
      "NavigationControl.ZoomOut": "Zoom arrière", "NavigationControl.ResetBearing": "Orienter la carte vers le nord" },
    es: { "AttributionControl.ToggleAttribution": "Mostrar u ocultar los créditos",
      "Map.Title": "Mapa", "Marker.Title": "Marcador del mapa", "NavigationControl.ZoomIn": "Acercar",
      "NavigationControl.ZoomOut": "Alejar", "NavigationControl.ResetBearing": "Orientar el mapa al norte" },
    de: { "AttributionControl.ToggleAttribution": "Quellenangaben ein- oder ausblenden",
      "Map.Title": "Karte", "Marker.Title": "Kartenmarkierung", "NavigationControl.ZoomIn": "Vergrößern",
      "NavigationControl.ZoomOut": "Verkleinern", "NavigationControl.ResetBearing": "Karte nach Norden ausrichten" },
    pt: { "AttributionControl.ToggleAttribution": "Mostrar ou ocultar os créditos",
      "Map.Title": "Mapa", "Marker.Title": "Marcador no mapa", "NavigationControl.ZoomIn": "Aproximar",
      "NavigationControl.ZoomOut": "Afastar", "NavigationControl.ResetBearing": "Virar o mapa para o norte" },
    ja: { "AttributionControl.ToggleAttribution": "クレジットの表示を切り替える",
      "Map.Title": "マップ", "Marker.Title": "マップ上のマーカー", "NavigationControl.ZoomIn": "ズームイン",
      "NavigationControl.ZoomOut": "ズームアウト", "NavigationControl.ResetBearing": "マップを北向きにする" },
    ro: { "AttributionControl.ToggleAttribution": "Afișează sau ascunde sursele",
      "Map.Title": "Hartă", "Marker.Title": "Marcaj pe hartă", "NavigationControl.ZoomIn": "Mărește",
      "NavigationControl.ZoomOut": "Micșorează", "NavigationControl.ResetBearing": "Orientează harta spre nord" }
  };

  /**
   * A map in `container` looking at center ([lon, lat]) and zoom, with one marker (a div of class markerClass).
   * [label] (the page's own words, "Carte du point d'eau") names the map for screen readers: it goes to MapLibre's own
   * labelled region, since a role="img" wrapper hid or contradicted the zoom buttons inside it.
   * Returns {gl, show(lat, lon, zoom), hide()}, or null with the container hidden when this browser can't draw it (MapLibre
   * blocked, no WebGL): the rest of the page works without it.
   */
  root.WN.map = function (container, lang, center, zoom, markerClass, label) {
    var gl = root.maplibregl, map;
    var locale = label ? Object.assign({}, STRINGS[lang], { "Map.Title": label }) : STRINGS[lang];
    try {
      map = new gl.Map({ container: container, center: center, zoom: zoom, attributionControl: { compact: false }, locale: locale });
    } catch (e) {
      container.classList.add("hidden");
      return null;
    }
    map.addControl(new gl.NavigationControl({ visualizePitch: true }));
    // Until the first full draw (or 10 s without one: offline) the container shimmers and the canvas waits unseen;
    // then the map fades in (map.css).
    function drawn() { container.classList.remove("is-loading"); }
    container.classList.add("is-loading");
    setTimeout(drawn, 10000);

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
    map.once("load", function () { loaded = true; drawn(); if (target) go(); });

    return {
      gl: map, // the MapLibre map itself, for a page adding its own layers (stats/: the heat map)
      show: function (lat, lon, zoom) {
        if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return; // also NaN: MapLibre would throw
        target = { center: [lon, lat], zoom: zoom };
        marker.setLngLat(target.center);
        if (!placed) { marker.addTo(map); placed = true; }
        if (loaded) go();
      },
      // A position that stopped being live (live.js headline): the marker goes, the camera stays where it was.
      hide: function () { if (placed) { marker.remove(); placed = false; } }
    };
  };
})(this);
