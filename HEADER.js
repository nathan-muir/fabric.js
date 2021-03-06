/*! Fabric.js Copyright 2008-2013, Printio (Juriy Zaytsev, Maxim Chernyak) */

fabric = { version: "1.2.0" };

this.fabric = fabric;

if (typeof exports !== 'undefined') {
  exports.fabric = fabric;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  fabric.document = document;
  fabric.window = window;
}
else {
  // assume we're running under node.js when document/window are not present
  fabric.document = require("jsdom").jsdom("<!DOCTYPE html><html><head></head><body></body></html>");
  fabric.window = fabric.document.createWindow();
}

/**
 * True when in environment that supports touch events
 * @type boolean
 */
fabric.isTouchSupported = "ontouchstart" in fabric.document.documentElement;

/**
 * True when in environment that's probably Node.js
 * @type boolean
 */
fabric.isLikelyNode = typeof Buffer !== 'undefined' && typeof window === 'undefined';


fabric.window.requestAnimationFrame = fabric.window.requestAnimationFrame ||
    fabric.window.webkitRequestAnimationFrame ||
    fabric.window.mozRequestAnimationFrame ||
    fabric.window.oRequestAnimationFrame ||
    fabric.window.msRequestAnimationFrame ||
    function (callback) {
      fabric.window.setTimeout(callback, 1000 / 60);
    };
