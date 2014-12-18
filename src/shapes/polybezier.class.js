(function(global) {

  "use strict";

  var fabric = global.fabric || (global.fabric = { }),
      toFixed = fabric.util.toFixed,
      min = fabric.util.array.min,
      max = fabric.util.array.max,
      path2dSupported = (typeof fabric.window.Path2D != "undefined"),
      pi3 = Math.PI / 3;

  if (fabric.Polybezier) {
    fabric.warn('fabric.Polybezier is already defined');
    return;
  }

  /**
   * Polyline class
   * @class fabric.Polyline
   * @extends fabric.Object
   */
  fabric.Polybezier = fabric.util.createClass(fabric.Object, /** @lends fabric.Polybezier.prototype */ {

    /**
     * Type of an object
     * @type String
     * @default
     */
    type: 'polybezier',

    /**
     * @type Path2D
     */
    path2d: null,

    /**
     * Constructor
     * @param {Array} points Array of points
     * @param {Object} [options] Options object
     * @return {fabric.Polyline} thisArg
     */
    initialize: function(points, options) {
      options = options || { };

      this.callSuper('initialize', options);
      this.points = points;
      this.path2d = null;
      this.commands = null;
      this._calcDimensions();
      this.setCoords();
    },
    /**
     * @private
     * @param {String} key
     * @param {Any} value
     */
    _set: function(key, value) {
      this[key] = value;
      if (key == "points") {
        this._calcDimensions();
      }
      return this;
    },

    /**
     *
     * @private
     */
    _calcDimensions: function() {

      var bezier = this._readBezier(this.points);

      this.width = bezier.bbox.width;
      this.height = bezier.bbox.height;

      this.left = bezier.bbox.left;
      this.top = bezier.bbox.top;

      // clear path2d
      this.path2d = null;
      this.commands = bezier.commands;
    },
    /**
     *
     * @param q
     * @returns {{commands: Array, bbox: {width: (Any|*|number), height: (Any|*|number), left: number, top: number}}}
     * @private
     */
    _readBezier: function(q) {
      var controlPoint, i, px, py, x1, x2, y1, y2,
          commands = [], w, h,
          boundX = [], boundY= [];

      if (q.length < 6){
        return {
          commands: [],
          bbox: {
            width: 1,
            height: 1
          }
        }
      }
      commands.push([q[0], q[1]]);
      boundX.push(q[0]);
      boundY.push(q[1]);
      i = 2;
      while (i < q.length) {
        x1 = q[i - 2];
        y1 = q[i - 1];
        px = q[i];
        py = q[i + 1];
        x2 = q[i + 2];
        y2 = q[i + 3];

        if (px === x2 && py === y2) {
          px = px - 0.0001;
        }

        controlPoint = this._calculateControlPointFromPassthrough(x1, y1, px, py, x2, y2);

        boundX.push(x1, x2, controlPoint.x);
        boundY.push(y1, y2, controlPoint.y);

        commands.push([controlPoint.x, controlPoint.y, x2, y2]);
        i += 4;
      }

      w = max(boundX)||1;
      h = max(boundY)||1;

      //MAY compute minX, then offset each point by this.left, this.top
      return {
        commands: commands,
        bbox: {
          width: w,
          height: h,
          left: 0,
          top: 0
        }
      }
    },

    /**
     *  Solve P(t) = P1*t^2 + Pcontrol*2*t*(1-t) + P2*(1-t)^2
     *   for Pcontrol, Ppassthrough
     *   Where x = X(Ppassthrough), y=Y(Ppassthrough), t = D(P1,Ppassthrough)/D(P0,Ppassthrough)+D(Ppassthrough,P2)
     * @param x1
     * @param y1
     * @param px
     * @param py
     * @param x2
     * @param y2
     * @returns {{x: number, y: number}}
     * @private
     */
    _calculateControlPointFromPassthrough: function(x1, y1, px, py, x2, y2) {
      var t, tInv;
      t = this._distanceRatio(x1, y1, px, py, x2, y2);
      tInv = 1 - t;
      return {
        x: (px / (2 * t * tInv)) - (x2 * t / (2 * tInv)) - (x1 * tInv / (2 * t)),
        y: (py / (2 * t * tInv)) - (y2 * t / (2 * tInv)) - (y1 * tInv / (2 * t))
      };
    },
    /**
     *
     * @param x0
     * @param y0
     * @param x1
     * @param y1
     * @param x2
     * @param y2
     * @returns {number}
     * @private
     */
    _distanceRatio: function(x0, y0, x1, y1, x2, y2) {
      var d0, d1, h0, h1, w0, w1;
      w0 = x0 - x1;
      h0 = y0 - y1;
      d0 = Math.sqrt(w0 * w0 + h0 * h0);
      w1 = x2 - x1;
      h1 = y2 - y1;
      d1 = Math.sqrt(w1 * w1 + h1 * h1);
      return d0 / (d0 + d1);
    },
    /**
     *  bound = u(1-t)2 + 2v(1-t)t + wt2
     *  (with t = ((u-v) / (u-2v+w)), with {u = start, v = control, w = end})
     * @param u
     * @param v
     * @param w
     * @returns {number}
     * @private
     */
    _bezierExtent: function(u, v, w) {
      var t, tInv;
      t = (u - v) / (u - 2 * v + w);
      tInv = 1 - t;
      return u * tInv * tInv + 2 * v * tInv * t + w * t * t;
    },

    /**
     * @private
     * @param {CanvasRenderingContext2D} ctx Context to render on
     */
    _render: function(ctx) {
      if (!this.commands.length){
        return;
      }
      if (path2dSupported){ //assumed `supportsLineDash`
        if (!this.path2d){
          this.path2d = new Path2D();
          this.__render(this.path2d);
        }
        this.fill && ctx.fill(this.path2d);
        if (this.stroke || this.strokeDashArray){
          ctx.save();
          if (this.strokeDashArray) {
            var strokeDashArray;
            if (this.strokeWidthInvariant){
              var scale = this.scaleX;
              strokeDashArray = this.strokeDashArray.map(function(v){
                return v / scale;
              });
            } else {
              strokeDashArray = this.strokeDashArray;
            }
            ctx.setLineDash(strokeDashArray)
          }
          ctx.stroke(this.path2d);
          ctx.restore();
        }
      } else {
        ctx.beginPath();
        this.__render(ctx);
        this._renderFill(ctx);
        if (this.stroke || this.strokeDashArray) {
          this._renderStroke(ctx);
        }

      }
    },

    /**
     *
     * @param ctx
     * @private
     */
    __render: function(ctx){
      var i, I, c = this.commands;
      ctx.moveTo(c[0][0], c[0][1]);
      for (i=1,I=c.length; i<I; i++){
        ctx.quadraticCurveTo.apply(ctx, c[i]);
      }
    }

  });


})(typeof exports !== 'undefined' ? exports : this);
