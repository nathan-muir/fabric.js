(function(global) {

  "use strict";



  function searchLineWidthText(ctx, line, maxWidth){
    var low = 0;
    var high = line.length - 1;
    var mid;
    var measuredWidth;
    while (low != high){
      mid = ((high - low)/2 + low)>>>0;
      measuredWidth = ctx.measureText(line.substr(0, mid + 1)).width;
      if (measuredWidth > maxWidth){
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    return low;
  }

  function wrapText(ctx, maxWidth, maxHeight, lineHeight, text) {
    var unwrappedLines = text.split('\n');
    var wrappedLines = [];
    var longestLineIdx, endOfLastWordIdx, textLineIdx, unwrappedLine, remainingText, i, longestPossibleLine;

    for (textLineIdx = 0; textLineIdx < unwrappedLines.length; textLineIdx++) {

      if ((wrappedLines.length + 1) * lineHeight > maxHeight) {
        break;
      }

      unwrappedLine = unwrappedLines[textLineIdx].trim();

      if (!unwrappedLine.length) {
        wrappedLines.push("");
        continue;
      }

      remainingText = unwrappedLine;
      while (remainingText.length) {

        // Find the most number of characters, shorter than maxWidth
        if (ctx.measureText(remainingText).width < maxWidth){
          wrappedLines.push(remainingText);
          remainingText = ''
        } else {
          longestLineIdx = searchLineWidthText(ctx, remainingText, maxWidth);
          longestPossibleLine = remainingText.substr(0, longestLineIdx).trimRight();

          // if next line doesn't start with a space, find the last space on the current line
          if (!/\s/.test(remainingText.charAt(longestLineIdx))) {
            endOfLastWordIdx = longestPossibleLine.lastIndexOf(" ");
            if (endOfLastWordIdx !== -1){
              // remove the last word from the current line
              longestPossibleLine = longestPossibleLine.substr(0, endOfLastWordIdx);
            }
          }
          wrappedLines.push(longestPossibleLine);
          remainingText = remainingText.substr(longestPossibleLine.length, remainingText.length).trimLeft()
        }

        if ((wrappedLines.length + 1) * lineHeight > maxHeight) {
          break;
        }
      }

    }
    return wrappedLines;
  }

  var fabric = global.fabric || (global.fabric = { }),
      extend = fabric.util.object.extend,
      clone = fabric.util.object.clone,
      toFixed = fabric.util.toFixed,
      supportsLineDash = fabric.StaticCanvas.supports('setLineDash');

  if (fabric.TextBox) {
    fabric.warn('fabric.TextBox is already defined');
    return;
  }

  /**
   * Text class
   * @class fabric.TextBox
   * @extends fabric.Object
   * @return {fabric.TextBox} thisArg
   */
  fabric.TextBox = fabric.util.createClass(fabric.Object, /** @lends fabric.TextBox.prototype */ {

    /**
     * Properties which when set cause object to change dimensions
     * @type Object
     * @private
     */
    _textWrapAffectingProps: {
      fontSize: true,
      fontWeight: true,
      fontFamily: true,
      fontStyle: true,
      lineHeight: true,
      stroke: true,
      strokeWidth: true,
      text: true,
      width: true,
      height: true
    },

    /**
     * Type of an object
     * @type String
     * @default
     */
    type:                 'text-box',

    /**
     * Font size (in pixels)
     * @type Number
     * @default
     */
    fontSize:             40,

    /**
     * Font weight (e.g. bold, normal, 400, 600, 800)
     * @type Number
     * @default
     */
    fontWeight:           'normal',

    /**
     * Font family
     * @type String
     * @default
     */
    fontFamily:           'Times New Roman',


    /**
     * Text alignment. Possible values: "left", "center", or "right".
     * @type String
     * @default
     */
    textAlign:            'left',

    /**
     * Font style . Possible values: "", "normal", "italic" or "oblique".
     * @type String
     * @default
     */
    fontStyle:            '',

    /**
     * Line height
     * @type Number
     * @default
     */
    lineHeight:           1.3,

    /**
     * Background color of an entire text box
     * @type String
     * @default
     */
    backgroundColor:      '',
    /**
     * When defined, an object is rendered via border and this property specifies its color
     * @type String
     * @default
     */
    border:                   null,

    /**
     * Width of a border used to render this object
     * @type Number
     * @default
     */
    borderWidth:              1,

    /**
     * Array specifying dash pattern of an object's border (border must be defined)
     * @type Array
     */
    borderDashArray:          null,

    /**
     * Line endings style of an object's border (one of "butt", "round", "square")
     * @type String
     * @default
     */
    borderLineCap:            'butt',

    /**
     * Corner style of an object's border (one of "bevil", "round", "miter")
     * @type String
     * @default
     */
    borderLineJoin:           'miter',

    /**
     * Maximum miter length (used for borderLineJoin = "miter") of an object's border
     * @type Number
     * @default
     */
    borderMiterLimit:         10,

    /**
     * If used, sets the `width` automatically based on padding
     */
    outerWidth: 0,

    /**
     * If used, sets the height automatically, based on padding
     */
    outerHeight: 0,
    /**
     * Padding on top of text - used for coloring background area
     * @type Number
     * @default
     */
    paddingTop: 0,
    /**
     * Padding on top of text - used for coloring background area
     * @type Number
     * @default
     */
    paddingBottom: 0,
    /**
     * Padding on top of text - used for coloring background area
     * @type Number
     * @default
     */
    paddingLeft: 0,
    /**
     * Padding on top of text - used for coloring background area
     * @type Number
     * @default
     */
    paddingRight: 0,

    /**
     * Constructor
     * @param {String} text Text string
     * @param {Object} [options] Options object
     * @return {fabric.Text} thisArg
     */
    initialize: function(text, options) {
      options = options || { };

      this.text = text;
      this.wrappedLines = null;
      this.setOptions(options);
      this.setCoords();
    },

    /**
     * Renders text object on offscreen canvas, so that it would get dimensions
     * @private
     */
    _clearWrappedLines: function() {
      this.wrappedLines = null;
    },

    /**
     * Returns string representation of an instance
     * @return {String} String representation of text object
     */
    toString: function() {
      return '#<fabric.TextBox (' + this.complexity() +
        '): { "text": "' + this.text + '", "fontFamily": "' + this.fontFamily + '" }>';
    },

    /**
     * @private
     * @param {CanvasRenderingContext2D} ctx Context to render on
     */
    _render: function(ctx) {

      if (this.wrappedLines == null){
        ctx.save();

        this._setTextStyles(ctx);
        this.wrappedLines = wrapText(ctx, this.width, this.height, this.lineHeight * this.fontSize, this.text);

        ctx.restore();
      }


      this.transform(ctx, fabric.isLikelyNode);

      this._renderTextBoxBackground(ctx);

      this._renderTextBoxBorder(ctx);

      this._setTextStyles(ctx);

      var textLines = this.wrappedLines;

      ctx.save();
      if (this.textAlign !== 'left') {
        ctx.translate(this.textAlign === 'center' ? (this.width / 2) : this.width, 0);
      }
      this.clipTo && fabric.util.clipContext(this, ctx);
      this._renderTextFill(ctx, textLines);
      this._renderTextStroke(ctx, textLines);
      this.clipTo && ctx.restore();
      ctx.restore();

      this._setBoundaries(ctx, textLines);
      this._totalLineHeight = 0;

      this.setCoords();
    },


    /**
     * @private
     * @param {CanvasRenderingContext2D} ctx Context to render on
     * @param {Array} textLines Array of all text lines
     */
    _setBoundaries: function(ctx, textLines) {
      this._boundaries = [ ];

      for (var i = 0, len = textLines.length; i < len; i++) {

        var lineWidth = this._getLineWidth(ctx, textLines[i]);
        var lineLeftOffset = this._getLineLeftOffset(lineWidth);

        this._boundaries.push({
          height: this.fontSize * this.lineHeight,
          width: lineWidth,
          left: lineLeftOffset
        });
      }
    },

    /**
     * @private
     * @param {CanvasRenderingContext2D} ctx Context to render on
     */
    _setTextStyles: function(ctx) {
      if (this.fill) {
        ctx.fillStyle = this.fill.toLive
            ? this.fill.toLive(ctx)
            : this.fill;
      }
      if (this.stroke) {
        ctx.lineWidth = this.strokeWidth;
        ctx.lineCap = this.strokeLineCap;
        ctx.lineJoin = this.strokeLineJoin;
        ctx.miterLimit = this.strokeMiterLimit;
        ctx.strokeStyle = this.stroke.toLive
          ? this.stroke.toLive(ctx)
          : this.stroke;
      }
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = this.textAlign;
      ctx.font = this._getFontDeclaration();
    },

    /**
     * @private
     * @param {CanvasRenderingContext2D} ctx Context to render on
     * @param {Array} textLines Array of all text lines
     * @return {Number} Height of fabric.Text object
     */
    _getTextHeight: function(ctx, textLines) {
      return this.fontSize * textLines.length * this.lineHeight;
    },

    /**
     * @private
     * @param {CanvasRenderingContext2D} ctx Context to render on
     * @param {Array} textLines Array of all text lines
     * @return {Number} Maximum width of fabric.Text object
     */
    _getTextWidth: function(ctx, textLines) {
      var maxWidth = ctx.measureText(textLines[0]).width;

      for (var i = 1, len = textLines.length; i < len; i++) {
        var currentLineWidth = ctx.measureText(textLines[i]).width;
        if (currentLineWidth > maxWidth) {
          maxWidth = currentLineWidth;
        }
      }
      return maxWidth;
    },


    /**
     * @private
     * @param {CanvasRenderingContext2D} ctx Context to render on
     * @param {Array} textLines Array of all text lines
     */
    _renderTextFill: function(ctx, textLines) {
      if (!this.fill) return;

      this._boundaries = [ ];
      for (var i = 0, len = textLines.length; i < len; i++) {
        ctx.fillText(
          textLines[i],
          -this.width / 2,
          -this.height / 2 + (i * this.fontSize * this.lineHeight) + this.fontSize
        );
      }
    },

    /**
     * @private
     * @param {CanvasRenderingContext2D} ctx Context to render on
     * @param {Array} textLines Array of all text lines
     */
    _renderTextStroke: function(ctx, textLines) {
      if (!this.stroke) return;

      ctx.save();
      if (this.strokeDashArray) {
        // Spec requires the concatenation of two copies the dash list when the number of elements is odd
        if (1 & this.strokeDashArray.length) {
          this.strokeDashArray.push.apply(this.strokeDashArray, this.strokeDashArray);
        }
        supportsLineDash && ctx.setLineDash(this.strokeDashArray);
      }

      ctx.beginPath();
      for (var i = 0, len = textLines.length; i < len; i++) {
        ctx.strokeText(
          textLines[i],
          -this.width / 2,
          -this.height / 2 + (i * this.fontSize * this.lineHeight) + this.fontSize
        );
      }
      ctx.closePath();
      ctx.restore();
    },


    /**
     * @private
     * @param {CanvasRenderingContext2D} ctx Context to render on
     */
    _renderTextBoxBackground: function(ctx) {
      if (!this.backgroundColor) return;

      ctx.save();
      ctx.fillStyle = this.backgroundColor;

      ctx.fillRect(
        -this.width / 2 - this.paddingLeft,
        -this.height / 2 - this.paddingTop,
        this.width  + this.paddingLeft + this.paddingRight,
        this.height + this.paddingTop + this.paddingRight
      );

      ctx.restore();
    },

    /**
     * @private
     * @param {CanvasRenderingContext2D} ctx Context to render on
     */
    _renderTextBoxBorder: function(ctx){
      if (!this.border) return;

      ctx.save();

      ctx.lineWidth = this.borderWidth;
      ctx.lineCap = this.borderLineCap;
      ctx.lineJoin = this.borderLineJoin;
      ctx.miterLimit = this.borderMiterLimit;
      ctx.borderStyle = this.border;

      if (ctx.setLineDash && this.borderDashArray){
        ctx.setLineDash(this.borderDashArray);
      }

      ctx.strokeRect(
        -this.width / 2 - this.paddingLeft,
        -this.height / 2 - this.paddingTop,
        this.width  + this.paddingLeft + this.paddingRight,
        this.height + this.paddingTop + this.paddingRight
      );

      ctx.restore();
    },
    /**
     * @private
     * @param {Number} lineWidth Width of text line
     * @return {Number} Line left offset
     */
    _getLineLeftOffset: function(lineWidth) {
      if (this.textAlign === 'center') {
        return (this.width - lineWidth) / 2;
      }
      if (this.textAlign === 'right') {
        return this.width - lineWidth;
      }
      return 0;
    },

    /**
     * @private
     * @param {CanvasRenderingContext2D} ctx Context to render on
     * @param {String} line Text line
     * @return {Number} Line width
     */
    _getLineWidth: function(ctx, line) {
      return this.textAlign === 'justify'
        ? this.width
        : ctx.measureText(line).width;
    },


    /**
     * @private
     */
    _getFontDeclaration: function() {
      return [
        // node-canvas needs "weight style", while browsers need "style weight"
        (fabric.isLikelyNode ? this.fontWeight : this.fontStyle),
        (fabric.isLikelyNode ? this.fontStyle : this.fontWeight),
        this.fontSize + 'px',
        (fabric.isLikelyNode ? ('"' + this.fontFamily + '"') : this.fontFamily)
      ].join(' ');
    },

    /**
     * Renders text instance on a specified context
     * @param {CanvasRenderingContext2D} ctx Context to render on
     * @param {Boolean} [noTransform] When true, context is not transformed
     * @param {Boolean} [hitCanvasMode=false]
     */
    render: function(ctx, noTransform, hitCanvasMode) {
      // do not render if object is not visible
      if (!this.visible) return;

      if (hitCanvasMode && this.noHitMode) return;

      ctx.save();
      if (hitCanvasMode){
        this.transform(ctx, fabric.isLikelyNode);
        ctx.globalAlpha = 1;
        ctx.fillStyle = this._serialToRgb();
        ctx.strokeStyle = this._serialToRgb();
        ctx.fillRect(
          -this.width / 2 - this.paddingLeft,
          -this.height / 2 - this.paddingTop,
          this.width  + this.paddingLeft + this.paddingRight,
          this.height + this.paddingTop + this.paddingRight
        );
      } else {
        this._render(ctx);
        if (!noTransform && this.active) {
          this.drawBorders(ctx);
          this.drawControls(ctx);
        }
      }
      ctx.restore();
    },

    /**
     * Sets "color" of an instance (alias of `set('fill', &hellip;)`)
     * @param {String} value
     * @return {fabric.Text} thisArg
     * @chainable
     */
    setColor: function(value) {
      this.set('fill', value);
      return this;
    },

    /**
     * Returns actual text value of an instance
     * @return {String}
     */
    getText: function() {
      return this.text;
    },

    /**
     * Sets specified property to a specified value
     * @param {String} name
     * @param {Any} value
     * @return {fabric.Text} thisArg
     * @chainable
     */
    _set: function(name, value) {
      if (name == 'padding'){
        this.set('paddingLeft', value);
        this.set('paddingRight', value);
        this.set('paddingTop', value);
        this.set('paddingBottom', value);
        return
      }
      this.callSuper('_set', name, value);

      if (name == 'outerWidth' || (this.outerWidth && (name == 'paddingLeft' || name == 'paddingRight'))){
        this.set('width', this.outerWidth - this.paddingLeft - this.paddingRight);
      } else if (name == 'outerHeight' || (this.outerHeight && (name == 'paddingTop' || name == 'paddingBottom'))){
        this.set('height', this.outerHeight - this.paddingTop - this.paddingBottom);
      }

      if (name in this._textWrapAffectingProps) {
        this._clearWrappedLines();
        this.setCoords();
      }
    },

    /**
     * Returns complexity of an instance
     * @return {Number} complexity
     */
    complexity: function() {
      return 1;
    }
  });


  fabric.util.createAccessors(fabric.TextBox);

})(typeof exports !== 'undefined' ? exports : this);
