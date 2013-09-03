(function(global) {

  "use strict";

  var fabric = global.fabric || (global.fabric = { }),
      extend = fabric.util.object.extend;

  if (fabric.StagedPainter) {
    fabric.warn('fabric.StagedPainter is already defined.');
    return;
  }

  /**
   * StagedPainter class
   * @class fabric.StagedPainter
   * @extends fabric.Object
   */
  fabric.StagedPainter = fabric.util.createClass(fabric.Object, /** @lends fabric.StagedPainter.prototype */ {

    /**
     * Type of an object
     * @type String
     * @default
     */
    type: 'staged_image',

    /**
     * Constructor
     * @param {Painter} painter instance of jsCanvas builder from toClass()
     * @param {Object} [options] Options object
     * @return {fabric.StagedPainter} thisArg
     */
    initialize: function(painter, options) {
      options || (options = { });

      this.painter = painter;
      // create an auxillary canvas for rasterising the image
      this.auxCanvas = fabric.util.createCanvasElement();
      this.auxCanvas.width = this.painter.plan.w;
      this.auxCanvas.height = this.painter.plan.h;
      this.painter.renderImmediately(this.auxCanvas.getContext('2d'));

      // create a 'stage' canvas for re-rasterising the image based on scale & top, left
      this.stagingCanvas = fabric.util.createCanvasElement();
      this.stagingCanvas.style.display = 'none';
      this.staging = {
        ready: false, // whether there is anything on this canvas.
        processing: false,
        fullImage: false, // if the full image - ignore the bounding box
        vbbox: null,
        bbox: { // bounding box as per the "source" image
          top: 0,
          left: 0,
          bottom: 0,
          right: 0
        },
        dMax: 2500,
        scale: 1 // scale compared to the source image
      };


      this.callSuper('initialize', options);
      this._initElement(this.auxCanvas);
      this._originalImage = this.getElement();
      this._initConfig(options);

      this.filters = [ ];

      if (options.filters) {
        this.filters = options.filters;
        this.applyFilters();
      }

      this.createStage = _.debounce(_.bind(this.createStage, this), 200);
    },

    updateDmax: function(){
      if (typeof this.canvas === "undefined"){
        this.staging.dMax = 2500;
      } else {
        this.staging.dMax = Math.ceil(Math.max(this.canvas.width, this.canvas.height) * 1.4);
      }
    },
    /**
     * Returns image element which this instance if based on
     * @return {HTMLImageElement} Image element
     */
    getElement: function() {
      return this._element;
    },

    /**
     * Sets image element for this instance to a specified one
     * @param {HTMLImageElement} element
     * @return {fabric.StagedPainter} thisArg
     * @chainable
     */
    setElement: function(element) {
      this._element = element;
      this._initConfig();
      return this;
    },

    /**
     * Returns original size of an image
     * @return {Object} object with "width" and "height" properties
     */
    getOriginalSize: function() {
      var element = this.getElement();
      return {
        width: element.width,
        height: element.height
      };
    },


    renderStage: function (ctx, vWidth, vHeight){
      var bbox, scale;
      // can only render special stage if it's ready
      if (!this.staging.ready){
        return false;
      }
      // need to check that the scaleX & scaleY are equal
      if (this.scaleX !== this.scaleY){
        return false;
      }

      scale = this.scaleX;
      // if the aux canvas' scale is closer to the current scale - use it
      if (Math.abs(scale - this.staging.scale) >= Math.abs(scale - this.auxScale)){
        return false;
      }

      if (!this.staging.fullImage){
        // make bounding box from top,left, scale, angle and width/height
        bbox = this.getViewportBbox(vWidth, vHeight);
        if (bbox.left < this.staging.bbox.left || this.staging.bbox.right < bbox.right || bbox.top < this.staging.bbox.top || this.staging.bbox.bottom < bbox.bottom){
          return false;
        }

        var center, vLeft, vTop, c2;
        center = this.rotate(this.width / 2, this.height / 2);
        vLeft = center.x * scale - this.left;
        vTop = center.y * scale - this.top;

        c2 = this.rotate(this.staging.bbox.left + (this.staging.bbox.right - this.staging.bbox.left)/2, this.staging.bbox.top + (this.staging.bbox.bottom - this.staging.bbox.top)/2);

        ctx.save();
        ctx.translate(c2.x * scale - vLeft, c2.y * scale - vTop);
        ctx.rotate(fabric.util.degreesToRadians(this.angle));
        ctx.scale(
          this.scaleX * (this.flipX ? -1 : 1) / this.staging.scale,
          this.scaleY * (this.flipY ? -1 : 1) / this.staging.scale
        );
/*

        ctx.beginPath();
        ctx.fillStyle = '#ff0000';
        ctx.rect(
          -(this.staging.bbox.right - this.staging.bbox.left) * this.staging.scale/ 2,
          -(this.staging.bbox.bottom - this.staging.bbox.top) * this.staging.scale/ 2,
          (this.staging.bbox.right - this.staging.bbox.left) * this.staging.scale,
          (this.staging.bbox.bottom - this.staging.bbox.top)* this.staging.scale
        );
        ctx.fill();
        ctx.closePath();
*/

        ctx.drawImage(
          this.stagingCanvas,
          -(this.staging.bbox.right - this.staging.bbox.left) * this.staging.scale/ 2,
          -(this.staging.bbox.bottom - this.staging.bbox.top) * this.staging.scale/ 2,
          (this.staging.bbox.right - this.staging.bbox.left)* this.staging.scale,
          (this.staging.bbox.bottom - this.staging.bbox.top)* this.staging.scale
        );
        ctx.restore();
        return true;

      } else {
        // as in .. the src document isn't mutilated!
        ctx.save();
        ctx.translate(this.left, this.top);
        ctx.rotate(fabric.util.degreesToRadians(this.angle));
        ctx.scale(
          this.scaleX * (this.flipX ? -1 : 1) / this.staging.scale,
          this.scaleY * (this.flipY ? -1 : 1) / this.staging.scale
        );

        ctx.drawImage(
          this.stagingCanvas,
          -this.width * this.staging.scale / 2,
          -this.height * this.staging.scale/ 2,
          this.width * this.staging.scale,
          this.height * this.staging.scale
        );
        ctx.restore();
        return true;
      }
    },

    rotate: function(x, y, cw) {
      var d;
      if (cw == null) {
        cw = true;
      }
      if (this.angle == 0) {
        return {
          x: x,
          y: y
        };
      } else if (this.angle == 180) {
        return {
          x: this.width - x,
          y: this.height - y
        };
      } else {
        if (this.angle == 90) {
          d = this.height;
        } else {
          d = this.width;
        }
        if (cw === (this.angle == 90)) {
          return {
            x: d - y,
            y: x
          };
        } else {
          return {
            x: y,
            y: d - x
          };
        }
      }
    },

    getViewportBbox: function(vWidth, vHeight){
      var center, vLeft, vTop, x1, y1, x2, y2, _ref, scale;

      scale = this.scaleX;
      center = this.rotate(this.width / 2, this.height / 2);
      vLeft = center.x * scale - this.left;
      vTop = center.y * scale - this.top;

      x1 = vLeft / scale;
      y1 = vTop / scale;
      _ref = this.rotate(x1, y1, false);
      x1 = _ref.x; y1 = _ref.y;

      x1 = Math.min(this.width, Math.max(0, x1));
      y1 = Math.min(this.height, Math.max(0, y1));

      x2 = (vWidth + vLeft) / scale;
      y2 = (vHeight + vTop) / scale;
      _ref = this.rotate(x2, y2, false);
      x2 = _ref.x; y2 = _ref.y;

      x2 = Math.min(this.width, Math.max(0, x2));
      y2 = Math.min(this.height, Math.max(0, y2));

      return {
       left: Math.min(x1, x2),
       right: Math.max(x1, x2),
       top: Math.min(y1, y2),
       bottom: Math.max(y1, y2)
      };
    },

    createStage: function(vWidth, vHeight){
      var bbox, dsWidth, dsHeight, ctx, dMax, scale, b, tbbox, _this = this;

      if (this.staging.processing){
        return;
      }

      // request a stage for the current
      if (this.scaleX !== this.scaleY){
        return;
      }
      scale = this.scaleX;
      dMax = this.staging.dMax / scale;


      dsWidth = this.width * scale;
      dsHeight = this.height * scale;
      if (dsWidth <= this.staging.dMax && dsHeight <= this.staging.dMax){

        if(this.staging.ready && this.staging.fullImage && this.staging.scale == scale){
          // already set -up
          return;
        }

        this.staging.ready = false;
        this.staging.processing = true;
        this.staging.fullImage = true;
        this.staging.scale = scale;

        this.stagingCanvas.width  = dsWidth;
        this.stagingCanvas.height = dsHeight;
        ctx = this.stagingCanvas.getContext('2d');
        ctx.clearRect(0 ,0, dsWidth, dsHeight);
        ctx.save();
        ctx.scale(scale, scale);
        this.painter.render(ctx, function(){
          ctx.restore();
          _this.staging.processing = false;
          _this.staging.ready = true;
          _this.canvas.renderAll(_this.layer);
        });

        return;
      }

      bbox = this.getViewportBbox(vWidth, vHeight);
      if ((bbox.right - bbox.left) > dMax || (bbox.bottom - bbox.top) > dMax){
        return;
      }

      if (this.staging.ready && !this.staging.fullImage && this.staging.scale == scale){
        if (this.staging.bbox.left <= bbox.left && bbox.right <= this.staging.bbox.right && this.staging.bbox.top <= bbox.top &&  bbox.bottom <= this.staging.bbox.bottom){
          return;
        }
      }
      b = {
        x: bbox.left + (bbox.right - bbox.left)  /2,
        y: bbox.top + (bbox.bottom - bbox.top)  /2,
        width: Math.min(dMax, this.width),
        height: Math.min(dMax, this.height)
      };

      if (b.x - b.width / 2 < 0){
        b.x = b.width / 2;
      } else if (b.x + b.width / 2 > this.width){
        b.x = this.width - b.width / 2;
      }

      if (b.y - b.height / 2 < 0){
        b.y = b.height / 2;
      } else if (b.y + b.height / 2 > this.height){
        b.y = this.height - b.height / 2;
      }

      this.staging.vbbox = bbox;
      this.staging.bbox = {
        top: b.y - b.height / 2,
        left: b.x - b.width / 2,
        bottom: b.y + b.height / 2,
        right: b.x + b.width / 2
      };

      this.stagingCanvas.width = b.width * scale;
      this.stagingCanvas.height = b.height * scale;
      ctx = this.stagingCanvas.getContext('2d');
      ctx.clearRect(0 ,0, b.width * scale, b.height * scale);

      ctx.save();
      ctx.translate(-this.staging.bbox.left * scale, -this.staging.bbox.top * scale);
      ctx.scale(scale, scale);
      this.staging.ready = false;
      this.staging.processing = true;
      this.staging.fullImage = false;
      this.staging.scale = scale;
      this.painter.render(ctx, function(){
        ctx.restore();
        _this.staging.processing = false;
        _this.staging.ready = true;
        _this.canvas.renderAll(_this.layer);
      });

    },

     checkCreateStage: function(vWidth, vHeight){
      var vbbox, dsWidth, dsHeight, ctx, dMax, scale, b, tbbox, _this = this;

      if (!this.staging.processing){
        return;
      }

      // request a stage for the current
      if (this.scaleX !== this.scaleY){
        return;
      }
      scale = this.scaleX;

      dsWidth = this.width * scale;
      dsHeight = this.height * scale;
      if (dsWidth <= this.staging.dMax && dsHeight <= this.staging.dMax){
        if(this.staging.fullImage && this.staging.scale == scale){
          // already set -up
          return;
        }
      } else {
        if (!this.staging.fullImage && this.staging.scale == scale){
          vbbox = this.getViewportBbox(vWidth, vHeight);
          if (this.staging.vbbox.left == vbbox.left && this.staging.vbbox.right == vbbox.right && this.staging.vbbox.top == vbbox.top &&  this.staging.vbbox.bottom == vbbox.bottom){
            return;
          }
        }
      }
      ctx = this.stagingCanvas.getContext('2d');
      this.painter.cancel(ctx);
      this.staging.ready = false;
      this.staging.processing = false;
    },
    /**
     * Renders image on a specified context
     * @param {CanvasRenderingContext2D} ctx Context to render on
     * @param {Boolean} [noTransform] When true, context is not transformed
     * @param {Number} width
     * @param {Number} height
     */
    render: function(ctx, noTransform, width, height) {
      // do not render if object is not visible
      if (!this.visible) return;

      this.updateDmax();

      if (this.staging.processing){
        // cancel processing?
        // if current scale doesn't match  or no longer in bounding box?
        this.checkCreateStage(width, height);
      }
      if (!this.staging.processing){
        this.createStage(width, height);
      }

      ctx.save();
      this.transform(ctx);
      ctx.beginPath();
      ctx.fillStyle = 'white';
      ctx.fillRect(
        -this.width / 2,
        -this.height / 2,
        this.width,
        this.height
      );
      ctx.closePath();
      ctx.restore();

      if (!this.renderStage(ctx, width, height)){
        ctx.save();
        this.transform(ctx);
        this._render(ctx);
        ctx.restore();
      }
    },

    /**
     * @private
     * @param {CanvasRenderingContext2D} ctx Context to render on
     */
    _stroke: function(ctx) {
      ctx.save();
      ctx.lineWidth = this.strokeWidth;
      ctx.lineCap = this.strokeLineCap;
      ctx.lineJoin = this.strokeLineJoin;
      ctx.miterLimit = this.strokeMiterLimit;
      ctx.strokeStyle = this.stroke.toLive
        ? this.stroke.toLive(ctx)
        : this.stroke;

      ctx.beginPath();
      ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);
      ctx.closePath();
      ctx.restore();
    },

    /**
     * @private
     * @param {CanvasRenderingContext2D} ctx Context to render on
     */
    _renderDashedStroke: function(ctx) {
     var x = -this.width/2,
         y = -this.height/2,
         w = this.width,
         h = this.height;

      ctx.save();
      ctx.lineWidth = this.strokeWidth;
      ctx.lineCap = this.strokeLineCap;
      ctx.lineJoin = this.strokeLineJoin;
      ctx.miterLimit = this.strokeMiterLimit;
      ctx.strokeStyle = this.stroke.toLive
        ? this.stroke.toLive(ctx)
        : this.stroke;

      ctx.beginPath();
      fabric.util.drawDashedLine(ctx, x, y, x+w, y, this.strokeDashArray);
      fabric.util.drawDashedLine(ctx, x+w, y, x+w, y+h, this.strokeDashArray);
      fabric.util.drawDashedLine(ctx, x+w, y+h, x, y+h, this.strokeDashArray);
      fabric.util.drawDashedLine(ctx, x, y+h, x, y, this.strokeDashArray);
      ctx.closePath();
      ctx.restore();
    },

    /**
     * Returns object representation of an instance
     * @param {Array} propertiesToInclude
     * @return {Object} propertiesToInclude Object representation of an instance
     */
    toObject: function(propertiesToInclude) {
      return extend(this.callSuper('toObject', propertiesToInclude), {
        src: this._originalImage.src || this._originalImage._src,
        filters: this.filters.concat()
      });
    },

    /* _TO_SVG_START_ */
    /**
     * Returns SVG representation of an instance
     * @return {String} svg representation of an instance
     */
    toSVG: function() {
      var markup = [];

      markup.push(
        '<g transform="', this.getSvgTransform(), '">',
          '<image xlink:href="', this.getSvgSrc(),
            '" style="', this.getSvgStyles(),
            // we're essentially moving origin of transformation from top/left corner to the center of the shape
            // by wrapping it in container <g> element with actual transformation, then offsetting object to the top/left
            // so that object's center aligns with container's left/top
            '" transform="translate(' + (-this.width/2) + ' ' + (-this.height/2) + ')',
            '" width="', this.width,
            '" height="', this.height,
          '"></image>'
      );

      if (this.stroke || this.strokeDashArray) {
        var origFill = this.fill;
        this.fill = null;
        markup.push(
          '<rect ',
            'x="', (-1 * this.width / 2), '" y="', (-1 * this.height / 2),
            '" width="', this.width, '" height="', this.height,
            '" style="', this.getSvgStyles(),
          '"/>'
        );
        this.fill = origFill;
      }

      markup.push('</g>');

      return markup.join('');
    },
    /* _TO_SVG_END_ */

    /**
     * Returns source of an image
     * @return {String} Source of an image
     */
    getSrc: function() {
      return this.getElement().src || this.getElement()._src;
    },

    /**
     * Returns string representation of an instance
     * @return {String} String representation of an instance
     */
    toString: function() {
      return '#<fabric.StagedPainter: { src: "' + this.getSrc() + '" }>';
    },

    /**
     * Returns a clone of an instance
     * @param {Function} callback Callback is invoked with a clone as a first argument
     * @param {Array} propertiesToInclude
     */
    clone: function(callback, propertiesToInclude) {
      this.constructor.fromObject(this.toObject(propertiesToInclude), callback);
    },

    /**
     * Applies filters assigned to this image (from "filters" array)
     * @mthod applyFilters
     * @param {Function} callback Callback is invoked when all filters have been applied and new image is generated
     * @return {fabric.StagedPainter} thisArg
     * @chainable
     */
    applyFilters: function(callback) {

      if (this.filters.length === 0) {
        this.setElement(this._originalImage);
        callback && callback();
        return;
      }

      var imgEl = this._originalImage,
          canvasEl = fabric.util.createCanvasElement(),
          replacement = fabric.util.createImage(),
          _this = this;

      canvasEl.width = imgEl.width;
      canvasEl.height = imgEl.height;

      canvasEl.getContext('2d').drawImage(imgEl, 0, 0, imgEl.width, imgEl.height);

      this.filters.forEach(function(filter) {
        filter && filter.applyTo(canvasEl);
      });

       /** @ignore */

      replacement.width = imgEl.width;
      replacement.height = imgEl.height;

      if (fabric.isLikelyNode) {
        // cut off data:image/png;base64, part in the beginning
        var base64str = canvasEl.toDataURL('image/png').substring(22);
        replacement.src = new Buffer(base64str, 'base64');

        // onload doesn't fire in some node versions, so we invoke callback manually
        _this._element = replacement;
        callback && callback();
      }
      else {
        replacement.onload = function() {
          _this._element = replacement;
          callback && callback();
          replacement.onload = canvasEl = imgEl = null;
        };
        replacement.src = canvasEl.toDataURL('image/png');
      }

      return this;
    },

    /**
     * @private
     * @param ctx
     */
    _render: function(ctx) {
      ctx.drawImage(
        this._element,
        -this.width / 2,
        -this.height / 2,
        this.width,
        this.height
      );
    },

    /**
     * @private
     */
    _resetWidthHeight: function() {
      var element = this.getElement();

      this.set('width', element.width);
      this.set('height', element.height);
    },

    /**
     * The Image class's initialization method. This method is automatically
     * called by the constructor.
     * @private
     * @param {HTMLImageElement|String} el The element representing the image
     */
    _initElement: function(element) {
      this.setElement(fabric.util.getById(element));
      fabric.util.addClass(this.getElement(), fabric.StagedPainter.CSS_CANVAS);
    },

    /**
     * @private
     * @param {Object} [options] Options object
     */
    _initConfig: function(options) {
      options || (options = { });
      this.setOptions(options);
      this._setWidthHeight(options);
    },

    /**
     * @private
     * @param {Object} object Object with filters property
     */
    _initFilters: function(object) {
      if (object.filters && object.filters.length) {
        this.filters = object.filters.map(function(filterObj) {
          return filterObj && fabric.StagedPainter.filters[filterObj.type].fromObject(filterObj);
        });
      }
    },

    /**
     * @private
     * @param {Object} [options] Object with width/height properties
     */
    _setWidthHeight: function(options) {
      this.width = 'width' in options
        ? options.width
        : (this.getElement().width || 0);

      this.height = 'height' in options
        ? options.height
        : (this.getElement().height || 0);
    },

    /**
     * Returns complexity of an instance
     * @return {Number} complexity of this instance
     */
    complexity: function() {
      return 1;
    }
  });

  /**
   * Default CSS class name for canvas
   * @static
   * @type String
   */
  fabric.StagedPainter.CSS_CANVAS = "canvas-img";

  /**
   * Alias for getSrc
   * @static
   */
  fabric.StagedPainter.prototype.getSvgSrc = fabric.StagedPainter.prototype.getSrc;

  /**
   * Creates an instance of fabric.StagedPainter from its object representation
   * @static
   * @param {Object} object
   * @param {Function} [callback] Callback to invoke when an image instance is created
   */
  fabric.StagedPainter.fromObject = function(object, callback) {
    var img = fabric.document.createElement('img'),
        src = object.src;

    if (object.width) {
      img.width = object.width;
    }

    if (object.height) {
      img.height = object.height;
    }

    /** @ignore */
    img.onload = function() {
      fabric.StagedPainter.prototype._initFilters.call(object, object);

      var instance = new fabric.StagedPainter(img, object);
      callback && callback(instance);
      img = img.onload = img.onerror = null;
    };

    /** @ignore */
    img.onerror = function() {
      fabric.log('Error loading ' + img.src);
      callback && callback(null, true);
      img = img.onload = img.onerror = null;
    };

    img.src = src;
  };

  /* _FROM_SVG_START_ */
  /**
   * List of attribute names to account for when parsing SVG element (used by {@link fabric.StagedPainter.fromElement})
   * @static
   * @see http://www.w3.org/TR/SVG/struct.html#ImageElement
   */
  fabric.StagedPainter.ATTRIBUTE_NAMES = fabric.SHARED_ATTRIBUTES.concat('x y width height xlink:href'.split(' '));

  /**
   * Returns {@link fabric.StagedPainter} instance from an SVG element
   * @static
   * @param {SVGElement} element Element to parse
   * @param {Function} callback Callback to execute when fabric.StagedPainter object is created
   * @param {Object} [options] Options object
   * @return {fabric.StagedPainter} Instance of fabric.StagedPainter
   */
  fabric.StagedPainter.fromElement = function(element, callback, options) {
    var parsedAttributes = fabric.parseAttributes(element, fabric.StagedPainter.ATTRIBUTE_NAMES);

    fabric.StagedPainter.fromURL(parsedAttributes['xlink:href'], callback,
      extend((options ? fabric.util.object.clone(options) : { }), parsedAttributes));
  };
  /* _FROM_SVG_END_ */

  /**
   * Indicates that instances of this type are async
   * @static
   * @type Boolean
   */
  fabric.StagedPainter.async = true;

})(typeof exports !== 'undefined' ? exports : this);