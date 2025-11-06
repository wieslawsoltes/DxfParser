(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], function () { return factory(root); });
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
  } else {
    factory(root);
  }
}((function () {
  if (typeof globalThis !== "undefined") return globalThis;
  if (typeof self !== "undefined") return self;
  if (typeof window !== "undefined") return window;
  if (typeof global !== "undefined") return global;
  return {};
}()), function (root) {
  'use strict';

  const namespace = root.DxfRendering = root.DxfRendering || {};
  const globalScope = root;
  const DEFAULT_SANS = 'Arial, "Helvetica Neue", Helvetica, sans-serif';
  const DEFAULT_SERIF = '"Times New Roman", Times, serif';
  const DEFAULT_MONO = '"Consolas", "Liberation Mono", Menlo, monospace';

  const SHX_FALLBACKS = {
    'txt': DEFAULT_MONO,
    'simplex': DEFAULT_SANS,
    'romans': DEFAULT_SERIF,
    'romand': DEFAULT_SERIF,
    'romant': DEFAULT_SERIF,
    'gdt': DEFAULT_SANS,
    'iso': DEFAULT_SANS,
    'iso3098': DEFAULT_SANS,
    'arial': DEFAULT_SANS
  };

  const DEGREE = '\u00B0';
  const DIAMETER = '\u2300';
  const PLUS_MINUS = '\u00B1';
  const CENTERLINE = '\u2104';
  const SQUARE = '\u00B2';
  const CUBIC = '\u00B3';

  class TextLayoutEngine {
    constructor(options = {}) {
      this.styleCatalog = options.styleCatalog || {};
      this.devicePixelRatio = options.devicePixelRatio || ((globalScope && globalScope.devicePixelRatio) || 1);
      this._document = options.document || (globalScope && globalScope.document) || null;
      this.fieldContext = options.fieldContext || null;
      this.headerVariables = options.headerVariables || null;
      this.fieldResolver = typeof options.fieldResolver === 'function' ? options.fieldResolver : null;
      this._styleCache = Object.create(null);
      this._canvas = null;
      this._ctx = null;
      this._measurementAvailable = !!this._document;
    }

    configure(options = {}) {
      if (options.styleCatalog) {
        this.styleCatalog = options.styleCatalog;
      }
      if (options.document) {
        this._document = options.document;
      }
      if (Object.prototype.hasOwnProperty.call(options, 'devicePixelRatio')) {
        this.devicePixelRatio = options.devicePixelRatio || 1;
      } else {
        this.devicePixelRatio = (globalScope && globalScope.devicePixelRatio) || this.devicePixelRatio || 1;
      }
      if (Object.prototype.hasOwnProperty.call(options, 'fieldContext')) {
        this.fieldContext = options.fieldContext || null;
      }
      if (Object.prototype.hasOwnProperty.call(options, 'headerVariables')) {
        this.headerVariables = options.headerVariables || null;
      } else if (options.fieldContext && options.fieldContext.headerVariables) {
        this.headerVariables = options.fieldContext.headerVariables;
      }
      if (Object.prototype.hasOwnProperty.call(options, 'fieldResolver')) {
        this.fieldResolver = typeof options.fieldResolver === 'function'
          ? options.fieldResolver
          : null;
      }
      this._measurementAvailable = !!this._document;
      this._styleCache = Object.create(null);
    }

    layout(rawText, env = {}) {
      if (!rawText) {
        return null;
      }
      const kind = rawText.kind || rawText.type || 'TEXT';
      const style = this._resolveTextStyle(rawText);
      const baseContent = this._extractContent(kind, rawText);
      if (baseContent == null || baseContent.length === 0) {
        return null;
      }

      const frameScale = env.frameScale || 1;
      const worldHeight = rawText.worldHeight || (rawText.baseHeight || 12);
      const fontSizePx = Math.max(4, worldHeight * frameScale);
      const lineHeightMultiplier = this._computeLineSpacing(kind, rawText, style);
      const lineHeightPx = fontSizePx * lineHeightMultiplier;

      const effectiveWidthFactor = this._resolveWidthFactor(rawText, style);
      const maxWidthWorld = this._resolveReferenceWidth(kind, rawText);
      const maxWidthPx = maxWidthWorld ? maxWidthWorld * frameScale : null;
      const rotationRad = rawText.rotation || 0;
      const rotationDeg = rotationRad * 180 / Math.PI;
      const alignments = this._resolveAlignment(kind, rawText);

      if (kind === 'MTEXT' && rawText.decodedMText) {
        return this._layoutMText({
          rawText,
          style,
          baseContent,
          fontSizePx,
          lineHeightPx,
          lineHeightMultiplier,
          frameScale,
          maxWidthPx,
          effectiveWidthFactor,
          rotationRad,
          rotationDeg
        });
      }

      const geometry = rawText.geometry || {};

      const decodedLines = this._splitIntoLines(baseContent);
      const measured = this._wrapLines(decodedLines, {
        fontSizePx,
        widthFactor: effectiveWidthFactor,
        maxWidthPx,
        font: style.font
      });

      const lines = measured.lines;
      if (!lines.length) {
        return null;
      }

      const widthPx = measured.maxEffectiveWidth || 0;
      const baseWidthPx = widthPx && effectiveWidthFactor !== 0
        ? widthPx / effectiveWidthFactor
        : measured.maxBaseWidth || 0;
      const heightPx = lineHeightPx * lines.length;
      const anchor = this._computeAnchorOffsets(baseWidthPx, heightPx, alignments.horizontal, alignments.vertical, lineHeightPx, kind);

      const backgroundCss = this._resolveBackground(rawText);
      const backgroundMetrics = this._computeBackgroundMetrics(
        geometry,
        widthPx,
        heightPx,
        frameScale
      );

      const layout = {
        kind,
        screenPosition: rawText.screenPosition || [0, 0],
        rotationRad,
        rotationDeg,
        colorCss: rawText.color && rawText.color.css ? rawText.color.css : '#ffffff',
        fontFamily: style.fontFamily,
        fontStyle: style.fontStyle,
        fontWeight: style.fontWeight,
        fontSize: fontSizePx,
        lineHeight: lineHeightPx,
        textAlign: alignments.textAlign,
        widthPx,
        baseWidthPx,
        heightPx,
        maxWidth: maxWidthPx,
        lines,
        anchor,
        backgroundCss,
        backgroundOffsets: geometry.backgroundOffsets || null,
        backgroundScale: geometry.backgroundScale ?? null,
        widthFactor: effectiveWidthFactor,
        rawContent: baseContent
      };
      if (backgroundMetrics) {
        layout.backgroundMetrics = backgroundMetrics;
      }
      if (rawText.decodedMText) {
        if (Array.isArray(rawText.decodedMText.runs)) {
          layout.richRuns = rawText.decodedMText.runs;
        }
        if (Array.isArray(rawText.decodedMText.paragraphs)) {
          layout.paragraphs = rawText.decodedMText.paragraphs;
        }
      }
      return layout;
    }

    _layoutMText(params) {
      const {
        rawText,
        style,
        baseContent,
        fontSizePx,
        lineHeightPx,
        lineHeightMultiplier,
        frameScale,
        maxWidthPx,
        effectiveWidthFactor,
        rotationRad,
        rotationDeg
      } = params;

      const geometry = rawText.geometry || {};
      const decoded = rawText.decodedMText || this._decodeMText(baseContent, {
        rawText,
        fieldContext: this.fieldContext,
        headerVariables: this.headerVariables
      });
      const runs = Array.isArray(decoded.runs) ? decoded.runs : [];
      const paragraphsMeta = Array.isArray(decoded.paragraphs) ? decoded.paragraphs : [];
      const runsByParagraph = new Map();
      runs.forEach((run) => {
        const index = Number.isInteger(run.paragraphIndex) ? run.paragraphIndex : 0;
        if (!runsByParagraph.has(index)) {
          runsByParagraph.set(index, []);
        }
        runsByParagraph.get(index).push(run);
      });

      const paragraphIndices = Array.from(runsByParagraph.keys()).sort((a, b) => a - b);
      if (!paragraphIndices.length) {
        paragraphIndices.push(0);
      }

      const backgroundCss = this._resolveBackground(rawText);
      const manualColumnBreaks = [];
      const convertUnitToPx = (unitValue) => {
        if (!Number.isFinite(unitValue)) {
          return 0;
        }
        return unitValue * frameScale;
      };

      const resolveIndentSpec = (indentMeta, listMeta) => {
        const fallbackLeft = listMeta && Number.isFinite(listMeta.indent?.value)
          ? listMeta.indent.value
          : null;
        const fallbackFirst = listMeta && Number.isFinite(listMeta.indent?.firstLine)
          ? listMeta.indent.firstLine
          : null;
        const fallbackRight = listMeta && Number.isFinite(listMeta.indent?.hanging)
          ? listMeta.indent.hanging
          : null;
        return {
          firstLine: Number.isFinite(indentMeta?.firstLine)
            ? indentMeta.firstLine
            : (fallbackFirst != null ? fallbackFirst : (indentMeta?.left ?? fallbackLeft ?? 0)),
          rest: Number.isFinite(indentMeta?.left)
            ? indentMeta.left
            : (fallbackLeft != null ? fallbackLeft : 0),
          right: Number.isFinite(indentMeta?.right)
            ? indentMeta.right
            : (fallbackRight != null ? fallbackRight : 0)
        };
      };

      const resolveTabStopsPx = (tabs) => {
        if (!Array.isArray(tabs) || !tabs.length) {
          return [];
        }
        return tabs
          .map((tab) => ({
            type: tab.type || 'set',
            positionPx: convertUnitToPx(tab.value),
            raw: tab.raw || null
          }))
          .filter((entry) => Number.isFinite(entry.positionPx) && entry.positionPx >= 0)
          .sort((a, b) => a.positionPx - b.positionPx);
      };

      const listCounters = new Map();
      const resolveListMarker = (listMeta) => {
        if (!listMeta || !listMeta.kind) {
          return null;
        }
        const level = Number.isFinite(listMeta.level) ? listMeta.level : 0;
        const styleKey = (listMeta.style || '').toLowerCase();
        const counterKey = `${listMeta.kind}:${level}:${styleKey}`;
        let counterState = listCounters.get(counterKey) || { value: 0 };
        let currentValue = counterState.value;
        if (listMeta.kind === 'numbered') {
          if (Number.isFinite(listMeta.start)) {
            currentValue = listMeta.start;
          } else {
            currentValue = currentValue + 1;
          }
          counterState = { value: currentValue };
          listCounters.set(counterKey, counterState);
        } else {
          // bullet lists do not auto-increment but we keep state in case formatting needs it
          counterState = { value: Number.isFinite(listMeta.start) ? listMeta.start : currentValue };
          listCounters.set(counterKey, counterState);
        }
        if (listMeta.kind === 'bullet') {
          return {
            type: 'bullet',
            text: listMeta.bullet && listMeta.bullet.length ? listMeta.bullet : '•',
            level,
            counter: counterState.value,
            style: null,
            spacingPx: null
          };
        }
        const toRoman = (num) => {
          if (!Number.isFinite(num) || num <= 0) {
            return `${num}`;
          }
          const romans = [
            ['M', 1000],
            ['CM', 900],
            ['D', 500],
            ['CD', 400],
            ['C', 100],
            ['XC', 90],
            ['L', 50],
            ['XL', 40],
            ['X', 10],
            ['IX', 9],
            ['V', 5],
            ['IV', 4],
            ['I', 1]
          ];
          let remaining = Math.floor(num);
          let result = '';
          romans.forEach(([symbol, value]) => {
            while (remaining >= value) {
              result += symbol;
              remaining -= value;
            }
          });
          return result || `${num}`;
        };
        const formatNumber = (value, style) => {
          switch ((style || '').toLowerCase()) {
            case 'a':
            case 'lower':
            case 'loweralpha':
              return String.fromCharCode(((value - 1) % 26) + 97);
            case 'A':
            case 'upper':
            case 'upperalpha':
              return String.fromCharCode(((value - 1) % 26) + 65);
            case 'i':
            case 'lowerroman':
              return toRoman(value).toLowerCase();
            case 'I':
            case 'upperroman':
              return toRoman(value).toUpperCase();
            default:
              return `${value}`;
          }
        };
        const markerText = formatNumber(counterState.value || 0, listMeta.style) + '.';
        return {
          type: 'numbered',
          text: markerText,
          level,
          counter: counterState.value || 0,
          style: listMeta.style || null,
          spacingPx: null
        };
      };

      const paragraphLayouts = [];
      const lineStrings = [];
      const flattenLines = [];

      let overallMaxWidth = 0;
      let totalHeightPx = 0;

      const baseParagraphAlignment = this._resolveAlignment(rawText.kind || rawText.type || 'TEXT', rawText);

      paragraphIndices.forEach((paragraphIndex) => {
        const paragraphRuns = runsByParagraph.get(paragraphIndex) || [];
        const meta = paragraphsMeta.find((entry) => entry.index === paragraphIndex) || {};
        const paragraphAlignment = this._normalizeParagraphAlignment(meta.alignment, baseParagraphAlignment);
        const paragraphSpacingStyle = meta.lineSpacingStyle != null ? meta.lineSpacingStyle : geometry.lineSpacingStyle;
        const paragraphSpacing = meta.lineSpacing != null ? meta.lineSpacing : geometry.lineSpacing;
        const indentSpec = resolveIndentSpec(meta.indent || null, meta.list || null);
        const indentFirstPx = convertUnitToPx(indentSpec.firstLine || 0);
        const indentRestPx = convertUnitToPx(indentSpec.rest || 0);
        const rightIndentPx = convertUnitToPx(indentSpec.right || 0);
        const tabStopsPx = resolveTabStopsPx(meta.tabs || []);
        const listMarkerSpec = resolveListMarker(meta.list || null);
        const baseFontDescriptor = this._buildFontDescriptor(style, {});

        const lines = [];
        const applyListMarkerToLine = (line, marker) => {
          if (!marker || line.listMarkerApplied) {
            return;
          }
          const markerStyle = marker.style || {};
          const markerFontDescriptor = this._buildFontDescriptor(style, markerStyle);
          const markerFontSizePx = Math.max(1, fontSizePx * (markerStyle.heightScale && markerStyle.heightScale > 0 ? markerStyle.heightScale : 1));
          const markerWidth = this._measureStyledRun(marker.text, markerStyle, markerFontSizePx, markerFontDescriptor.font);
          const spacingPx = Number.isFinite(marker.spacingPx) ? marker.spacingPx : Math.max(2, fontSizePx * 0.4);
          if (markerWidth > 0 || marker.text) {
            line.segments.push({
              type: 'listMarker',
              text: marker.text,
              style: markerStyle,
              widthPx: markerWidth,
              fontSizePx: markerFontSizePx,
              font: markerFontDescriptor.font,
              marker
            });
            line.widthPx += markerWidth;
            line.text += marker.text;
            line.hasTextContent = true;
          }
          if (spacingPx > 0) {
            line.segments.push({
              type: 'markerSpacing',
              text: '',
              style: {},
              widthPx: spacingPx,
              fontSizePx: markerFontSizePx,
              font: markerFontDescriptor.font,
              marker
            });
            line.widthPx += spacingPx;
          }
          line.listMarker = {
            type: marker.type,
            counter: marker.counter,
            widthPx: markerWidth,
            spacingPx,
            text: marker.text
          };
          line.listMarkerApplied = true;
        };
        const createLine = (indentPx, applyMarker = false) => {
          const line = this._createEmptyLine(lineHeightPx);
          line.indentPx = indentPx;
          line.rightIndentPx = rightIndentPx;
          line.tabStops = tabStopsPx;
          line.nextTabIndex = 0;
          line.hasTextContent = false;
          line.columnIndex = 0;
          line.globalIndex = -1;
          line.paragraphIndex = paragraphIndex;
          if (indentPx > 0) {
            line.segments.push({
              type: 'indent',
              text: '',
              style: {},
              widthPx: indentPx,
              fontSizePx: lineHeightPx,
              font: baseFontDescriptor.font
            });
            line.widthPx += indentPx;
          }
          line.listMarkerApplied = false;
          if (applyMarker && listMarkerSpec) {
            applyListMarkerToLine(line, listMarkerSpec);
          }
          return line;
        };
        let currentLine = createLine(indentFirstPx, !!listMarkerSpec);
        let pendingColumnBreak = false;

        const finalizeLine = (force = false) => {
          const hasDrawableSegments = currentLine.segments.some((segment) => {
            return segment && typeof segment.text === 'string' && segment.text.length > 0;
          }) || currentLine.text.length > 0;
          if (!hasDrawableSegments && !force) {
            return;
          }
          if (!hasDrawableSegments && force) {
            if (pendingColumnBreak) {
              manualColumnBreaks.push(flattenLines.length);
              pendingColumnBreak = false;
              currentLine = createLine(indentFirstPx, !!listMarkerSpec);
            } else {
              currentLine = createLine(indentRestPx, false);
            }
            return;
          }
          const globalIndex = flattenLines.length;
          currentLine.globalIndex = globalIndex;
          lines.push(currentLine);
          lineStrings.push(currentLine.text);
          flattenLines.push(currentLine);
          const effectiveWidth = currentLine.widthPx + (currentLine.rightIndentPx > 0 ? currentLine.rightIndentPx : 0);
          overallMaxWidth = Math.max(overallMaxWidth, effectiveWidth);
          const lineSpacing = this._computeParagraphLineHeight(
            currentLine.heightPx,
            paragraphSpacing,
            paragraphSpacingStyle,
            frameScale
          );
          totalHeightPx += lineSpacing;
          if (pendingColumnBreak) {
            manualColumnBreaks.push(flattenLines.length);
          }
          const nextIndentPx = pendingColumnBreak ? indentFirstPx : indentRestPx;
          const applyMarkerNext = pendingColumnBreak && !!listMarkerSpec;
          pendingColumnBreak = false;
          currentLine = createLine(nextIndentPx, applyMarkerNext);
        };

        const advanceToNextTab = (line) => {
          const tabStops = line.tabStops || [];
          const indentPx = line.indentPx || 0;
          const currentWidth = indentPx + line.widthPx;
          let target = null;
          for (let idx = line.nextTabIndex ?? 0; idx < tabStops.length; idx += 1) {
            const stop = tabStops[idx];
            if (!stop || !Number.isFinite(stop.positionPx)) {
              continue;
            }
            if (stop.positionPx >= currentWidth - 0.5) {
              target = stop.positionPx;
              line.nextTabIndex = idx + 1;
              break;
            }
          }
          if (target == null) {
            const defaultSpacing = Math.max(fontSizePx * 4, 4);
            const multiples = Math.floor(currentWidth / defaultSpacing) + 1;
            target = multiples * defaultSpacing;
          }
          const delta = target - currentWidth;
          if (delta > 0) {
            line.segments.push({
              type: 'tab',
              text: '',
              style: {},
              widthPx: delta,
              fontSizePx: line.heightPx,
              font: baseFontDescriptor.font
            });
            line.widthPx += delta;
          }
        };

        const appendSegmentToLine = (line, segmentText, run) => {
          if (segmentText == null) {
            return;
          }
          const textValue = String(segmentText);
          if (!textValue.length) {
            return;
          }
          const fontDescriptor = this._buildFontDescriptor(style, run.style);
          const runHeightScale = Number.isFinite(run.style && run.style.heightScale)
            ? Math.max(0.01, run.style.heightScale)
            : 1;
          const runFontSizePx = Math.max(1, fontSizePx * runHeightScale);
          const runLineHeight = Math.max(lineHeightPx, runFontSizePx * lineHeightMultiplier);
          const segmentWidth = this._measureStyledRun(
            textValue,
            run.style,
            runFontSizePx,
            fontDescriptor.font
          );
          if (segmentWidth > 0 || textValue.length > 0) {
            line.segments.push({
              type: run.type === 'field' ? 'field' : 'text',
              text: textValue,
              style: run.style,
              widthPx: segmentWidth,
              fontSizePx: runFontSizePx,
              font: fontDescriptor.font,
              field: run.field || null
            });
            line.text += textValue;
            line.widthPx += segmentWidth;
            line.heightPx = Math.max(line.heightPx, runLineHeight);
            line.hasTextContent = true;
          }
        };

        paragraphRuns.forEach((run) => {
          if (run.type === 'paragraphBreak') {
            finalizeLine();
            return;
          }
          if (run.type === 'columnBreak') {
            pendingColumnBreak = true;
            finalizeLine(true);
            return;
          }
          if (run.type === 'fraction') {
            const fractionSegment = this._createFractionSegment(
              style,
              run,
              fontSizePx,
              lineHeightMultiplier
            );
            if (fractionSegment) {
              currentLine.segments.push(fractionSegment);
              currentLine.text += run.text || '';
              currentLine.widthPx += fractionSegment.widthPx || 0;
              currentLine.heightPx = Math.max(
                currentLine.heightPx,
                Math.max(lineHeightPx, fractionSegment.heightPx || 0)
              );
              currentLine.hasTextContent = true;
            }
            return;
          }
          if (run.type !== 'text' && run.type !== 'field') {
            return;
          }
          const rawSegments = String(run.text || '').split('\n');
          rawSegments.forEach((segment, index) => {
            const tabParts = segment.split('\t');
            tabParts.forEach((part, partIndex) => {
              if (part.length) {
                appendSegmentToLine(currentLine, part, run);
              }
              if (partIndex < tabParts.length - 1) {
                advanceToNextTab(currentLine);
              }
            });
            if (index < rawSegments.length - 1) {
              finalizeLine(true);
            }
          });
        });

        finalizeLine(true);

        paragraphLayouts.push({
          index: paragraphIndex,
          alignment: paragraphAlignment,
          lineSpacing: paragraphSpacing,
          lineSpacingStyle: paragraphSpacingStyle,
          lines,
          indent: meta && meta.indent
            ? {
                left: meta.indent.left ?? null,
                firstLine: meta.indent.firstLine ?? null,
                right: meta.indent.right ?? null
              }
            : { left: null, firstLine: null, right: null },
          tabs: Array.isArray(meta.tabs)
            ? meta.tabs.map((tab) => ({
                type: tab.type || null,
                value: tab.value ?? null,
                raw: tab.raw ?? null
              }))
            : [],
          list: meta && meta.list
            ? {
                kind: meta.list.kind || null,
                level: meta.list.level ?? 0,
                start: meta.list.start ?? 1,
                style: meta.list.style || null,
                bullet: meta.list.bullet || null,
                indent: meta.list.indent
                  ? {
                      value: meta.list.indent.value ?? null,
                      firstLine: meta.list.indent.firstLine ?? null,
                      hanging: meta.list.indent.hanging ?? null
                    }
                  : null,
                format: meta.list.format || null,
                raw: { ...(meta.list.raw || {}) }
              }
            : null
        });
      });

      const columnLayouts = this._buildColumnLayouts(
        paragraphLayouts,
        geometry.columns || null,
        manualColumnBreaks,
        flattenLines
      );

      if (totalHeightPx <= 0) {
        totalHeightPx = lineHeightPx;
      }

      const widthPx = overallMaxWidth || (maxWidthPx || fontSizePx);
      const baseWidthPx = widthPx && effectiveWidthFactor !== 0
        ? widthPx / effectiveWidthFactor
        : widthPx;

      const anchor = this._computeAnchorOffsets(
        widthPx,
        totalHeightPx,
        baseParagraphAlignment.horizontal,
        baseParagraphAlignment.vertical,
        lineHeightPx,
        rawText.kind || rawText.type || 'TEXT'
      );

      const layout = {
        kind: rawText.kind || rawText.type || 'TEXT',
        screenPosition: rawText.screenPosition || [0, 0],
        rotationRad,
        rotationDeg,
        colorCss: rawText.color && rawText.color.css ? rawText.color.css : '#ffffff',
        fontFamily: style.fontFamily,
        fontStyle: style.fontStyle,
        fontWeight: style.fontWeight,
        fontSize: fontSizePx,
        lineHeight: lineHeightPx,
        textAlign: paragraphLayouts.length
          ? paragraphLayouts[0].alignment.textAlign
          : baseParagraphAlignment.textAlign,
        widthPx,
        baseWidthPx,
        heightPx: totalHeightPx,
        maxWidth: maxWidthPx,
        lines: lineStrings.length ? lineStrings : [baseContent],
        anchor,
        backgroundCss,
        widthFactor: effectiveWidthFactor,
        rawContent: baseContent,
        paragraphLayouts,
        columnLayouts,
        verticalWriting: this._isVerticalWriting(geometry),
        backgroundOffsets: geometry.backgroundOffsets || null,
        backgroundScale: geometry.backgroundScale ?? null,
        lineCount: lineStrings.length,
        frameScale,
        manualColumnBreaks: manualColumnBreaks.length ? manualColumnBreaks.slice() : null
      };

      const backgroundMetrics = this._computeBackgroundMetrics(
        geometry,
        widthPx,
        totalHeightPx,
        frameScale
      );
      if (backgroundMetrics) {
        layout.backgroundMetrics = backgroundMetrics;
      }

      if (rawText.decodedMText) {
        layout.paragraphs = rawText.decodedMText.paragraphs || [];
        layout.richRuns = rawText.decodedMText.runs || [];
      }

      return layout;
    }

    _extractContent(kind, rawText) {
      switch (kind) {
        case 'TEXT':
          return this._decodeDxfText(rawText.content || rawText.geometry?.content || '');
        case 'MTEXT': {
          const content = rawText.geometry ? rawText.geometry.text : rawText.content;
          const decoded = this._decodeMText(content || '', {
            rawText,
            fieldContext: this.fieldContext,
            headerVariables: this.headerVariables
          });
          if (rawText && typeof rawText === 'object') {
            rawText.decodedMText = decoded;
          }
          return decoded.text;
        }
        case 'TOLERANCE': {
          if (rawText.geometry && Array.isArray(rawText.geometry.segments) && rawText.geometry.segments.length) {
            const joined = rawText.geometry.segments.join('\n');
            return this._decodeDxfText(joined);
          }
          const fallback = rawText.geometry?.text || rawText.content || '';
          return this._decodeDxfText(fallback);
        }
        case 'ATTDEF':
        case 'ATTRIB': {
          const geometry = rawText.geometry || {};
          const source = rawText.content != null
            ? rawText.content
            : (geometry.content ?? geometry.value ?? geometry.defaultValue ?? '');
          return this._decodeDxfText(source);
        }
        default:
          return this._decodeDxfText(rawText.content || '');
      }
    }

    _decodeMText(value, context = {}) {
      if (!value || typeof value !== 'string') {
        return { text: '', runs: [], paragraphs: [] };
      }

      const MULTI_COMMANDS = new Set(['BG', 'BC', 'TC', 'TA', 'TS', 'PI', 'PN', 'PL', 'PT', 'LI', 'LN', 'LT', 'U+']);

      const fieldContext = context.fieldContext || this.fieldContext || null;
      const headerVariables = context.headerVariables
        || this.headerVariables
        || (fieldContext && fieldContext.headerVariables ? fieldContext.headerVariables : null);
      const fieldResolver = typeof context.fieldResolver === 'function'
        ? context.fieldResolver
        : (this.fieldResolver || null);
      const rawTextContext = context.rawText || null;

      const clampByte = (num) => Math.max(0, Math.min(255, Math.round(num)));

      const parseColorSpec = (raw) => {
        if (!raw) {
          return null;
        }
        const trimmed = raw.trim();
        if (!trimmed) {
          return null;
        }
        if (trimmed.startsWith('#') && /^[#][0-9A-Fa-f]{6}$/.test(trimmed)) {
          const r = parseInt(trimmed.slice(1, 3), 16);
          const g = parseInt(trimmed.slice(3, 5), 16);
          const b = parseInt(trimmed.slice(5, 7), 16);
          return { type: 'rgb', r, g, b, raw: trimmed };
        }
        if (trimmed.includes(',')) {
          const parts = trimmed.split(',').map((token) => parseFloat(token.trim()));
          if (parts.length === 3 && parts.every((component) => Number.isFinite(component))) {
            return {
              type: 'rgb',
              r: clampByte(parts[0]),
              g: clampByte(parts[1]),
              b: clampByte(parts[2]),
              raw: trimmed
            };
          }
        }
        const numeric = parseInt(trimmed, 10);
        if (Number.isFinite(numeric)) {
          return { type: 'aci', index: numeric, raw: trimmed };
        }
        return { type: 'raw', value: trimmed };
      };

      const baseState = () => ({
        bold: false,
        italic: false,
        underline: false,
        overline: false,
        strike: false,
        color: null,
        font: null,
        heightScale: 1,
        heightMode: 'relative',
        widthScale: 1,
        oblique: 0,
        tracking: 0,
        alignment: null,
        background: null,
        lineSpacing: null,
        lineSpacingStyle: null
      });

      const cloneState = (state) => ({
        bold: state.bold,
        italic: state.italic,
        underline: state.underline,
        overline: state.overline,
        strike: state.strike,
        color: state.color ? { ...state.color } : null,
        font: state.font,
        heightScale: state.heightScale,
        heightMode: state.heightMode,
        widthScale: state.widthScale,
        oblique: state.oblique,
        tracking: state.tracking,
        alignment: state.alignment,
        background: state.background
          ? {
              enabled: !!state.background.enabled,
              color: state.background.color ? { ...state.background.color } : null,
              raw: state.background.raw ?? null
          }
          : null
      });

      const deepCloneState = (src) => ({
        ...src,
        color: src.color ? { ...src.color } : null,
        background: src.background
          ? {
              ...src.background,
              color: src.background.color ? { ...src.background.color } : null
            }
          : null
      });

      const createListState = () => ({
        kind: null,
        level: 0,
        start: 1,
        style: null,
        bullet: null,
        indent: {
          value: null,
          firstLine: null,
          hanging: null
        },
        format: null,
        raw: Object.create(null)
      });

      const cloneListState = (listState) => {
        if (!listState) {
          return null;
        }
        return {
          kind: listState.kind,
          level: listState.level,
          start: listState.start,
          style: listState.style,
          bullet: listState.bullet,
          indent: {
            value: listState.indent?.value ?? null,
            firstLine: listState.indent?.firstLine ?? null,
            hanging: listState.indent?.hanging ?? null
          },
          format: listState.format,
          raw: { ...(listState.raw || {}) }
        };
      };

      const baseParagraphState = () => ({
        indent: {
          left: null,
          firstLine: null,
          right: null
        },
        tabs: [],
        list: null
      });

      const cloneParagraphState = (paragraphState) => ({
        indent: {
          left: paragraphState.indent?.left ?? null,
          firstLine: paragraphState.indent?.firstLine ?? null,
          right: paragraphState.indent?.right ?? null
        },
        tabs: Array.isArray(paragraphState.tabs)
          ? paragraphState.tabs.map((tab) => ({
              type: tab.type || null,
              value: tab.value ?? null,
              raw: tab.raw ?? null
            }))
          : [],
        list: cloneListState(paragraphState.list)
      });

      const readParameter = (startIndex) => {
        let text = '';
        let idx = startIndex;
        let terminated = false;
        while (idx < value.length) {
          const current = value[idx];
          if (current === ';') {
            terminated = true;
            break;
          }
          text += current;
          idx += 1;
        }
        return { text: text.trim(), nextIndex: idx, terminated };
      };

      const parseStackSequence = (content) => {
        if (!content) {
          return null;
        }
        const cleaned = content.replace(/[{}]/g, '').trim();
        if (!cleaned) {
          return null;
        }
        let separator = null;
        if (cleaned.includes('^')) {
          separator = '^';
        } else if (cleaned.includes('/')) {
          separator = '/';
        } else {
          return null;
        }
        const parts = cleaned.split(separator);
        if (parts.length !== 2) {
          return null;
        }
        const numerator = parts[0] != null ? parts[0].trim() : '';
        const denominator = parts[1] != null ? parts[1].trim() : '';
        if (!numerator || !denominator) {
          return null;
        }
        const type = separator === '^' ? 'stacked' : 'diagonal';
        const display = `${numerator}/${denominator}`;
        return {
          type,
          numerator,
          denominator,
          display,
          raw: content
        };
      };

      const extractFieldSequence = (startIndex) => {
        if (value[startIndex] !== '%' || value[startIndex + 1] !== '<') {
          return null;
        }
        let depth = 0;
        let idx = startIndex;
        let content = '';
        while (idx < value.length) {
          const current = value[idx];
          const next = value[idx + 1];
          if (current === '%' && next === '<') {
            depth += 1;
            if (depth > 1) {
              content += '%<';
            }
            idx += 2;
            continue;
          }
          if (current === '>' && next === '%') {
            depth -= 1;
            if (depth <= 0) {
              return {
                raw: content,
                nextIndex: idx + 1
              };
            }
            content += '>%';
            idx += 2;
            continue;
          }
          content += current;
          idx += 1;
        }
        return null;
      };

      const resolveKnownFieldVariable = (identifier) => {
        if (!identifier) {
          return undefined;
        }
        const upper = identifier.replace(/^\$+/, '').toUpperCase();
        const drawingProps = fieldContext && fieldContext.drawingProperties
          ? fieldContext.drawingProperties
          : (typeof fieldContext === 'object' ? fieldContext : null);
        const metadata = drawingProps && drawingProps.metadata
          ? drawingProps.metadata
          : (fieldContext && fieldContext.metadata ? fieldContext.metadata : null);
        const units = drawingProps && drawingProps.units
          ? drawingProps.units
          : (fieldContext && fieldContext.units ? fieldContext.units : null);
        switch (upper) {
          case 'ACADVER':
            return metadata && metadata.acadVersion != null ? metadata.acadVersion : undefined;
          case 'LASTSAVEDBY':
            return metadata && metadata.lastSavedBy != null ? metadata.lastSavedBy : undefined;
          case 'PROJECTNAME':
            return metadata && metadata.projectName != null ? metadata.projectName : undefined;
          case 'TDCREATE':
            return metadata && metadata.created != null ? metadata.created : undefined;
          case 'TDUPDATE':
            return metadata && metadata.updated != null ? metadata.updated : undefined;
          case 'TDINDWG':
            return metadata && metadata.totalEditingTime != null ? metadata.totalEditingTime : undefined;
          case 'TDUSRTIMER':
            return metadata && metadata.userTimer != null ? metadata.userTimer : undefined;
          case 'LTSCALE':
            return units && units.ltScale != null ? units.ltScale : undefined;
          case 'CELTSCALE':
            return units && units.celTScale != null ? units.celTScale : undefined;
          case 'PSLTSCALE':
            return units && units.psLtScale != null ? units.psLtScale : undefined;
          case 'INSUNITS':
            return units && units.insUnits != null ? units.insUnits : undefined;
          case 'INSUNITSSOURCE':
            return units && units.insUnitsSource != null ? units.insUnitsSource : undefined;
          case 'INSUNITSTARGET':
            return units && units.insUnitsTarget != null ? units.insUnitsTarget : undefined;
          default:
            return undefined;
        }
      };

      const lookupFieldVariable = (name) => {
        if (!name) {
          return null;
        }
        const cleaned = String(name).trim();
        if (!cleaned) {
          return null;
        }
        const normalized = cleaned.replace(/^\$+/, '').trim();
        if (!normalized) {
          return null;
        }
        const upperName = normalized.toUpperCase();
        const knownValue = resolveKnownFieldVariable(normalized);
        if (knownValue !== undefined) {
          return knownValue;
        }
        if (headerVariables && typeof headerVariables === 'object') {
          const direct = headerVariables[upperName];
          if (direct != null) {
            if (typeof direct === 'object') {
              if (Array.isArray(direct.values) && direct.values.length) {
                return direct.values[0];
              }
              if (Object.prototype.hasOwnProperty.call(direct, 'value')) {
                return direct.value;
              }
            }
            if (Array.isArray(direct) && direct.length) {
              return direct[0];
            }
            if (direct != null) {
              return direct;
            }
          }
        }
        const stack = [];
        const visited = new Set();
        const pushIfObject = (candidate) => {
          if (!candidate || typeof candidate !== 'object') {
            return;
          }
          if (visited.has(candidate)) {
            return;
          }
          visited.add(candidate);
          stack.push(candidate);
        };
        if (fieldContext && typeof fieldContext === 'object') {
          if (fieldContext.drawingProperties) {
            pushIfObject(fieldContext.drawingProperties);
          }
          if (fieldContext.metadata) {
            pushIfObject(fieldContext.metadata);
          }
          if (fieldContext.geographic) {
            pushIfObject(fieldContext.geographic);
          }
          if (fieldContext.units) {
            pushIfObject(fieldContext.units);
          }
          if (fieldContext.additional && Array.isArray(fieldContext.additional)) {
            fieldContext.additional.forEach(pushIfObject);
          }
        }
        if (rawTextContext && rawTextContext.entity) {
          pushIfObject(rawTextContext.entity);
          if (rawTextContext.entity.resolved) {
            pushIfObject(rawTextContext.entity.resolved);
          }
        }
        if (rawTextContext && rawTextContext.geometry) {
          pushIfObject(rawTextContext.geometry);
        }
        while (stack.length) {
          const current = stack.pop();
          if (current == null) {
            continue;
          }
          if (Array.isArray(current)) {
            for (let i = 0; i < current.length; i += 1) {
              pushIfObject(current[i]);
            }
            continue;
          }
          const keys = Object.keys(current);
          for (let i = 0; i < keys.length; i += 1) {
            const key = keys[i];
            const valueCandidate = current[key];
            if (key && key.toUpperCase() === upperName) {
              return valueCandidate;
            }
            if (valueCandidate && typeof valueCandidate === 'object') {
              pushIfObject(valueCandidate);
            }
          }
        }
        return null;
      };

      const formatFieldValue = (value, formatSpec, name) => {
        if (value == null) {
          return name ? `[${name}]` : '';
        }
        if (Array.isArray(value)) {
          if (!value.length) {
            return name ? `[${name}]` : '';
          }
          return formatFieldValue(value[0], formatSpec, name);
        }
        if (typeof value === 'object') {
          if (value && typeof value.iso === 'string') {
            if (formatSpec && /^%tc/i.test(formatSpec) && typeof value.locale === 'string') {
              return value.locale;
            }
            return value.iso;
          }
          if (value && Number.isFinite(value.unixMillis)) {
            const date = new Date(value.unixMillis);
            if (!Number.isNaN(date.getTime())) {
              return date.toISOString();
            }
          }
          if (value && Number.isFinite(value.julian)) {
            const millis = (value.julian - 2440587.5) * 86400000;
            if (Number.isFinite(millis)) {
              const date = new Date(millis);
              if (!Number.isNaN(date.getTime())) {
                return date.toISOString();
              }
            }
          }
          if (Number.isFinite(value.days) && Number.isFinite(value.hours)) {
            if (formatSpec && /^%td/i.test(formatSpec)) {
              return `${value.days.toFixed(3)}d`;
            }
            return `${value.hours.toFixed(2)}h`;
          }
          if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
            const coords = [value.x, value.y];
            if (Number.isFinite(value.z)) {
              coords.push(value.z);
            }
            return coords.map((component) => {
              if (!Number.isFinite(component)) {
                return '0';
              }
              const absVal = Math.abs(component);
              if (absVal >= 1) {
                return component.toFixed(3);
              }
              if (absVal >= 1e-3) {
                return component.toFixed(4);
              }
              return component.toPrecision(4);
            }).join(', ');
          }
          if (Object.prototype.hasOwnProperty.call(value, 'value')) {
            return formatFieldValue(value.value, formatSpec, name);
          }
          if (value.values && Array.isArray(value.values) && value.values.length) {
            return formatFieldValue(value.values[0], formatSpec, name);
          }
          if (value.description && typeof value.description === 'string') {
            return value.description;
          }
          if (value.label && typeof value.label === 'string') {
            return value.label;
          }
        }
        if (typeof value === 'number') {
          if (formatSpec && /^%lu/i.test(formatSpec)) {
            const match = formatSpec.match(/%lu(\d+)/i);
            const precision = match ? Math.min(Math.max(parseInt(match[1], 10), 0), 10) : 4;
            return value.toFixed(precision);
          }
          if (formatSpec && /^%pr/i.test(formatSpec)) {
            const match = formatSpec.match(/%pr(\d+)/i);
            const precision = match ? Math.min(Math.max(parseInt(match[1], 10), 0), 10) : 4;
            return value.toFixed(precision);
          }
          return Number.isInteger(value) ? `${value}` : value.toString();
        }
        if (typeof value === 'string') {
          return value;
        }
        return value != null ? String(value) : (name ? `[${name}]` : '');
      };

      const evaluateField = (rawExpression) => {
        if (!rawExpression && rawExpression !== '') {
          return null;
        }
        const trimmed = String(rawExpression).trim();
        if (!trimmed) {
          return { text: '', meta: { type: 'empty', raw: rawExpression } };
        }
        const lower = trimmed.toLowerCase();
        if (lower.startsWith('\\acvar')) {
          const remainder = trimmed.slice(6).trim();
          let varName = '';
          let rest = remainder;
          if (rest.startsWith('"')) {
            const quoteEnd = rest.indexOf('"', 1);
            if (quoteEnd > 1) {
              varName = rest.slice(1, quoteEnd);
              rest = rest.slice(quoteEnd + 1).trim();
            } else {
              varName = rest.replace(/"/g, '');
              rest = '';
            }
          } else {
            const parts = rest.split(/\s+/);
            varName = parts.shift() || '';
            rest = parts.join(' ');
          }
          const formatMatch = rest.match(/\\f\s*"([^"]*)"/i);
          const formatSpec = formatMatch ? formatMatch[1] : null;
          const normalizedName = varName ? varName.replace(/^\$+/, '') : '';
          const resolved = lookupFieldVariable(varName || normalizedName);
          const text = formatFieldValue(resolved, formatSpec, normalizedName || varName);
          return {
            text,
            meta: {
              type: 'AcVar',
              name: normalizedName || varName,
              original: varName,
              format: formatSpec,
              value: resolved,
              raw: rawExpression
            }
          };
        }
        if (typeof fieldResolver === 'function') {
          try {
            const result = fieldResolver(trimmed, {
              raw: rawExpression,
              context: fieldContext,
              rawText: rawTextContext
            });
            if (result && typeof result.text === 'string') {
              return {
                text: result.text,
                meta: Object.assign({
                  type: 'custom',
                  raw: rawExpression
                }, result.meta || {})
              };
            }
          } catch (err) {
            // ignore resolver exceptions to avoid breaking parsing
          }
        }
        return {
          text: trimmed,
          meta: {
            type: 'raw',
            raw: rawExpression
          }
        };
      };

      let state = baseState();
      const stack = [];
      const runs = [];
      const paragraphs = [];
      let buffer = '';

      let paragraphState = baseParagraphState();
      let paragraphStartRun = 0;
      let paragraphAlignment = state.alignment;
      let paragraphHasContent = false;
      let currentParagraphIndex = 0;

      const ensureListState = () => {
        if (!paragraphState.list) {
          paragraphState.list = createListState();
        }
        return paragraphState.list;
      };

      const setParagraphIndent = (key, rawValue) => {
        if (!paragraphState.indent) {
          paragraphState.indent = { left: null, firstLine: null, right: null };
        }
        const numeric = rawValue != null && rawValue !== '' ? parseFloat(rawValue) : null;
        paragraphState.indent[key] = Number.isFinite(numeric) ? numeric : null;
      };

      const addTabStop = (type, rawValue) => {
        const numeric = rawValue != null && rawValue !== '' ? parseFloat(rawValue) : null;
        const valueNumeric = Number.isFinite(numeric) ? numeric : null;
        paragraphState.tabs.push({
          type,
          value: valueNumeric,
          raw: rawValue != null && rawValue !== '' ? rawValue : null
        });
      };

      const updateListRaw = (listState, key, rawValue) => {
        if (!listState.raw) {
          listState.raw = Object.create(null);
        }
        listState.raw[key] = rawValue;
      };

      const flush = () => {
        if (!buffer) {
          return;
        }
        runs.push({
          type: 'text',
          text: buffer,
          style: cloneState(state),
          paragraphIndex: currentParagraphIndex
        });
        buffer = '';
        paragraphHasContent = true;
      };

      const pushChar = (ch) => {
        buffer += ch;
      };

      const commitParagraph = (force = false) => {
        const hasRuns = runs.length > paragraphStartRun;
        if (!hasRuns && !force) {
          return;
        }
        const endRun = hasRuns ? runs.length - 1 : paragraphStartRun - 1;
        const indentMeta = paragraphState.indent
          ? {
              left: paragraphState.indent.left,
              firstLine: paragraphState.indent.firstLine,
              right: paragraphState.indent.right
            }
          : { left: null, firstLine: null, right: null };
        const tabsMeta = Array.isArray(paragraphState.tabs)
          ? paragraphState.tabs.map((tab) => ({
              type: tab.type || null,
              value: tab.value ?? null,
              raw: tab.raw ?? null
            }))
          : [];
        const listMeta = cloneListState(paragraphState.list);
        paragraphs.push({
          index: paragraphs.length,
          startRun: paragraphStartRun,
          endRun,
          alignment: paragraphAlignment,
          lineSpacing: state.lineSpacing ?? null,
          lineSpacingStyle: state.lineSpacingStyle ?? null,
          hasContent: paragraphHasContent && hasRuns,
          indent: indentMeta,
          tabs: tabsMeta,
          list: listMeta
        });
        currentParagraphIndex = paragraphs.length;
        paragraphStartRun = runs.length;
        paragraphHasContent = false;
        paragraphAlignment = state.alignment;
        paragraphState = baseParagraphState();
      };

      const pushParagraphBreak = () => {
        runs.push({
          type: 'paragraphBreak',
          text: '\n',
          style: cloneState(state),
          paragraphIndex: currentParagraphIndex
        });
        commitParagraph(true);
      };

      for (let i = 0; i < value.length; i += 1) {
        const ch = value[i];
        if (ch === '%' && value[i + 1] === '<') {
          flush();
          const sequence = extractFieldSequence(i);
          if (sequence) {
            const evaluated = evaluateField(sequence.raw);
            const fieldText = evaluated && typeof evaluated.text === 'string' ? evaluated.text : '';
            runs.push({
              type: 'field',
              text: fieldText,
              style: cloneState(state),
              paragraphIndex: currentParagraphIndex,
              field: evaluated ? evaluated.meta : { type: 'raw', raw: sequence.raw }
            });
            if (fieldText) {
              paragraphHasContent = true;
            }
            i = sequence.nextIndex;
            continue;
          }
        }
        if (ch === '{') {
          stack.push({
            state: deepCloneState(state),
            paragraphAlignment,
            paragraphState: cloneParagraphState(paragraphState)
          });
          continue;
        }
        if (ch === '}') {
          flush();
          const popped = stack.pop();
          if (popped) {
            state = deepCloneState(popped.state);
            paragraphAlignment = popped.paragraphAlignment ?? state.alignment;
            paragraphState = popped.paragraphState
              ? cloneParagraphState(popped.paragraphState)
              : baseParagraphState();
          } else {
            state = baseState();
            paragraphAlignment = state.alignment;
            paragraphState = baseParagraphState();
          }
          continue;
        }
        if (ch === '^') {
          const next = value[i + 1];
          if (!next) {
            continue;
          }
          flush();
          const code = next.toLowerCase();
          if (code === 'i') {
            state.italic = !state.italic;
          } else if (code === 'o') {
            state.overline = !state.overline;
          } else if (code === 'b') {
            state.bold = !state.bold;
          } else if (code === 'j') {
            pushParagraphBreak();
          }
          i += 1;
          continue;
        }
        if (ch === '\\') {
          if (i + 1 >= value.length) {
            break;
          }
          let commandStart = i + 1;
          let commandLength = 1;
          let commandChar = value[commandStart];
          const peek = value[commandStart + 1];
          if (peek != null) {
            const twoCharCandidate = (commandChar + peek).toUpperCase();
            if (MULTI_COMMANDS.has(twoCharCandidate)) {
              commandChar = twoCharCandidate;
              commandLength = 2;
            }
          }
          const commandRaw = value.substr(commandStart, commandLength);
          const command = commandChar.toUpperCase();
          i = commandStart + commandLength - 1;

          switch (command) {
            case '\\':
              pushChar('\\');
              break;
            case '{':
              pushChar('{');
              break;
            case '}':
              pushChar('}');
              break;
            case '~':
              pushChar('\u00A0');
              break;
            case 'P':
            case 'N':
              flush();
              pushParagraphBreak();
              break;
            case 'X':
              flush();
              runs.push({
                type: 'columnBreak',
                text: '',
                style: cloneState(state),
                paragraphIndex: currentParagraphIndex
              });
              break;
            case 'B': {
              flush();
              const lower = commandRaw === commandRaw.toLowerCase();
              state.bold = lower;
              break;
            }
            case 'I': {
              flush();
              const lower = commandRaw === commandRaw.toLowerCase();
              state.italic = lower;
              break;
            }
            case 'L':
              flush();
              state.underline = true;
              break;
            case 'l':
              flush();
              state.underline = false;
              break;
            case 'O':
              flush();
              state.overline = true;
              break;
            case 'o':
              flush();
              state.overline = false;
              break;
            case 'K':
              flush();
              state.strike = true;
              break;
            case 'k':
              flush();
              state.strike = false;
              break;
            case 'A': {
              const param = readParameter(i + 1);
              if (param.text) {
                state.alignment = param.text;
                paragraphAlignment = state.alignment;
              }
              i = param.nextIndex;
              break;
            }
            case 'C':
            case 'c': {
              const param = readParameter(i + 1);
              flush();
              state.color = parseColorSpec(param.text);
              i = param.nextIndex;
              break;
            }
            case 'BG': {
              const param = readParameter(i + 1);
              if (!state.background) {
                state.background = {};
              }
              state.background.enabled = param.text ? param.text.trim() !== '0' : false;
              state.background.raw = param.text;
              i = param.nextIndex;
              break;
            }
            case 'BC': {
              const param = readParameter(i + 1);
              if (!state.background) {
                state.background = {};
              }
              state.background.color = parseColorSpec(param.text);
              if (state.background.color) {
                state.background.raw = param.text;
              }
              i = param.nextIndex;
              break;
            }
            case 'F': {
              const param = readParameter(i + 1);
              flush();
              if (param.text) {
                const [font] = param.text.split('|');
                state.font = font || null;
              } else {
                state.font = null;
              }
              i = param.nextIndex;
              break;
            }
            case 'H': {
              const param = readParameter(i + 1);
              if (param.text) {
                const isRelative = /[xX]$/.test(param.text);
                const cleaned = param.text.replace(/[xX]$/, '');
                const numeric = parseFloat(cleaned);
                if (Number.isFinite(numeric) && numeric !== 0) {
                  flush();
                  state.heightScale = Math.abs(numeric);
                  state.heightMode = isRelative ? 'relative' : 'absolute';
                }
              }
              i = param.nextIndex;
              break;
            }
            case 'W': {
              const param = readParameter(i + 1);
              if (param.text) {
                const numeric = parseFloat(param.text);
                if (Number.isFinite(numeric) && numeric !== 0) {
                  flush();
                  state.widthScale = Math.abs(numeric);
                }
              }
              i = param.nextIndex;
              break;
            }
            case 'T': {
              const param = readParameter(i + 1);
              if (!param.terminated) {
                flush();
                pushChar('\t');
                i = commandStart;
              } else {
                if (param.text) {
                  const numeric = parseFloat(param.text);
                  if (Number.isFinite(numeric)) {
                    flush();
                    state.tracking = numeric;
                  }
                }
                i = param.nextIndex;
              }
              break;
            }
            case 'Q': {
              const param = readParameter(i + 1);
              if (param.text) {
                const numeric = parseFloat(param.text);
                if (Number.isFinite(numeric)) {
                  flush();
                  state.oblique = numeric;
                }
              }
              i = param.nextIndex;
              break;
            }
            case 'S': {
              const param = readParameter(i + 1);
              const stackSpec = parseStackSequence(param.text);
              flush();
              if (stackSpec) {
                runs.push({
                  type: 'fraction',
                  text: stackSpec.display,
                  style: cloneState(state),
                  paragraphIndex: currentParagraphIndex,
                  fraction: {
                    type: stackSpec.type,
                    numerator: stackSpec.numerator,
                    denominator: stackSpec.denominator,
                    raw: stackSpec.raw
                  }
                });
                paragraphHasContent = true;
              } else if (param.text) {
                pushChar(param.text);
              }
              i = param.nextIndex;
              break;
            }
            case 'TC': {
              const param = readParameter(i + 1);
              addTabStop('center', param.text);
              i = param.nextIndex;
              break;
            }
            case 'TA': {
              const param = readParameter(i + 1);
              addTabStop('aligned', param.text);
              i = param.nextIndex;
              break;
            }
            case 'TS': {
              const param = readParameter(i + 1);
              addTabStop('set', param.text);
              i = param.nextIndex;
              break;
            }
            case 'PI': {
              const param = readParameter(i + 1);
              const listState = ensureListState();
              listState.kind = 'bullet';
              listState.bullet = param.text && param.text.length ? param.text : (listState.bullet || '•');
              updateListRaw(listState, 'PI', param.text);
              i = param.nextIndex;
              break;
            }
            case 'PN': {
              const param = readParameter(i + 1);
              const listState = ensureListState();
              listState.kind = listState.kind || 'numbered';
              const numeric = param.text ? parseInt(param.text, 10) : NaN;
              if (Number.isFinite(numeric)) {
                listState.start = numeric;
              } else if (param.text) {
                listState.format = param.text;
              }
              updateListRaw(listState, 'PN', param.text);
              i = param.nextIndex;
              break;
            }
            case 'PL': {
              const param = readParameter(i + 1);
              const listState = ensureListState();
              const numeric = param.text ? parseInt(param.text, 10) : NaN;
              if (Number.isFinite(numeric)) {
                listState.level = numeric;
              }
              updateListRaw(listState, 'PL', param.text);
              i = param.nextIndex;
              break;
            }
            case 'PT': {
              const param = readParameter(i + 1);
              const listState = ensureListState();
              listState.style = param.text || listState.style;
              updateListRaw(listState, 'PT', param.text);
              i = param.nextIndex;
              break;
            }
            case 'LI': {
              const param = readParameter(i + 1);
              const listState = ensureListState();
              setParagraphIndent('left', param.text);
              const numeric = param.text ? parseFloat(param.text) : NaN;
              if (Number.isFinite(numeric)) {
                listState.indent.value = numeric;
              }
              updateListRaw(listState, 'LI', param.text);
              i = param.nextIndex;
              break;
            }
            case 'LN': {
              const param = readParameter(i + 1);
              const listState = ensureListState();
              setParagraphIndent('firstLine', param.text);
              const numeric = param.text ? parseFloat(param.text) : NaN;
              if (Number.isFinite(numeric)) {
                listState.indent.firstLine = numeric;
              } else if (param.text) {
                listState.format = listState.format || param.text;
              }
              updateListRaw(listState, 'LN', param.text);
              i = param.nextIndex;
              break;
            }
            case 'LT': {
              const param = readParameter(i + 1);
              const listState = ensureListState();
              setParagraphIndent('right', param.text);
              const numeric = param.text ? parseFloat(param.text) : NaN;
              if (Number.isFinite(numeric)) {
                listState.indent.hanging = numeric;
              }
              updateListRaw(listState, 'LT', param.text);
              i = param.nextIndex;
              break;
            }
            case 'U+': {
              const hex = value.substr(i + 1, 4);
              if (/^[0-9A-Fa-f]{4}$/.test(hex)) {
                const codePoint = parseInt(hex, 16);
                flush();
                pushChar(String.fromCharCode(codePoint));
                i += 4;
              }
              break;
            }
            default:
              pushChar(`\\${commandRaw}`);
              break;
          }
          continue;
        }
        if (ch === '\r') {
          continue;
        }
        if (ch === '\n') {
          flush();
          pushParagraphBreak();
          continue;
        }
        pushChar(ch);
      }

      flush();
      commitParagraph(paragraphs.length === 0);

      runs.forEach((run) => {
        if (run.type === 'text' || run.type === 'field' || run.type === 'fraction') {
          run.text = this._decodeDxfText(run.text);
        }
      });

      const mergedText = runs.map((run) => run.text || '').join('');
      const filteredRuns = runs.filter((run) => run.type !== 'text' || (run.text && run.text.length));

      return {
        text: mergedText,
        runs: filteredRuns,
        paragraphs
      };
    }

    _decodeDxfText(value) {
      if (!value || typeof value !== 'string') {
        return '';
      }
      return value
        .replace(/%%c/gi, DIAMETER)
        .replace(/%%d/gi, DEGREE)
        .replace(/%%p/gi, PLUS_MINUS)
        .replace(/%%v/gi, CENTERLINE)
        .replace(/%%²/gi, SQUARE)
        .replace(/%%³/gi, CUBIC)
        .replace(/\\~/g, '\u00A0')
        .replace(/\\n/gi, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\([^\\])/g, '$1');
    }

    _splitIntoLines(content) {
      return content.split(/\r?\n/);
    }

    _wrapLines(lines, options) {
      const assembled = [];
      let maxBaseWidth = 0;
      let maxEffectiveWidth = 0;
      lines.forEach((line) => {
        if (line === '') {
          assembled.push({ text: '', baseWidth: 0, effectiveWidth: 0 });
          return;
        }
        if (!options.maxWidthPx || options.maxWidthPx <= 0) {
          const baseWidth = this._measureWidth(line, options.fontSizePx, options.font);
          const effectiveWidth = baseWidth * options.widthFactor;
          maxBaseWidth = Math.max(maxBaseWidth, baseWidth);
          maxEffectiveWidth = Math.max(maxEffectiveWidth, effectiveWidth);
          assembled.push({ text: line, baseWidth, effectiveWidth });
          return;
        }
        const wrapped = this._wrapParagraph(line, options);
        wrapped.lines.forEach((segment) => {
          maxBaseWidth = Math.max(maxBaseWidth, segment.baseWidth);
          maxEffectiveWidth = Math.max(maxEffectiveWidth, segment.effectiveWidth);
          assembled.push(segment);
        });
      });

      const limit = options.maxWidthPx && options.maxWidthPx > 0 ? options.maxWidthPx : null;
      if (limit != null) {
        maxEffectiveWidth = Math.min(maxEffectiveWidth, limit);
      }

      return {
        lines: assembled.map((segment) => segment.text),
        maxBaseWidth: assembled.length ? maxBaseWidth : 0,
        maxEffectiveWidth: assembled.length ? maxEffectiveWidth : 0
      };
    }

    _wrapParagraph(text, options) {
      const words = text.split(/\s+/);
      const maxWidth = options.maxWidthPx;
      const segments = [];
      let current = '';
      let currentBaseWidth = 0;

      words.forEach((word, index) => {
        if (word === '') {
          return;
        }
        const candidate = current ? `${current} ${word}` : word;
        const baseWidth = this._measureWidth(candidate, options.fontSizePx, options.font);
        const effectiveWidth = baseWidth * options.widthFactor;

        if (effectiveWidth <= maxWidth || current === '') {
          current = candidate;
          currentBaseWidth = baseWidth;
        } else {
          segments.push({
            text: current,
            baseWidth: currentBaseWidth,
            effectiveWidth: currentBaseWidth * options.widthFactor
          });
          current = word;
          currentBaseWidth = this._measureWidth(current, options.fontSizePx, options.font);
        }

        if (index === words.length - 1 && current) {
          segments.push({
            text: current,
            baseWidth: currentBaseWidth,
            effectiveWidth: currentBaseWidth * options.widthFactor
          });
        }
      });

      if (!segments.length && current) {
        const baseWidth = this._measureWidth(current, options.fontSizePx, options.font);
        segments.push({
          text: current,
          baseWidth,
          effectiveWidth: baseWidth * options.widthFactor
        });
      }

      if (!segments.length) {
        segments.push({ text: '', baseWidth: 0, effectiveWidth: 0 });
      }

      return { lines: segments };
    }

    _measureWidth(text, fontSizePx, font) {
      if (!text || !text.length) {
        return 0;
      }
      const ctx = this._ensureContext();
      let baseWidth;
      if (ctx) {
        ctx.font = font.replace('{size}', `${fontSizePx}px`);
        baseWidth = ctx.measureText(text).width;
      } else {
        baseWidth = text.length * fontSizePx * 0.6;
      }
      return baseWidth;
    }

    _ensureContext() {
      if (!this._measurementAvailable || !this._document) {
        return null;
      }
      if (!this._canvas) {
        try {
          this._canvas = this._document.createElement('canvas');
          this._ctx = this._canvas.getContext('2d');
        } catch (err) {
          this._measurementAvailable = false;
          this._canvas = null;
          this._ctx = null;
          return null;
        }
      }
      return this._ctx;
    }

    _resolveTextStyle(rawText) {
      const styleKey = rawText.styleName || rawText.entity?.textStyle || rawText.geometry?.textStyle || 'STANDARD';
      if (this._styleCache[styleKey]) {
        return this._styleCache[styleKey];
      }
      const catalogEntry = this.styleCatalog[styleKey] || {};
      const fontFamily = this._deriveFontFamily(catalogEntry);
      const fontStyle = Math.abs(catalogEntry.obliqueAngle || 0) > 1 ? 'oblique' : 'normal';
      const fontWeight = (catalogEntry.flags & 1) ? 'bold' : '400';
      const font = `${fontStyle} ${fontWeight} {size} ${fontFamily}`;
      const style = {
        name: styleKey,
        fontFamily,
        fontStyle,
        fontWeight,
        font,
        widthFactor: catalogEntry.widthFactor || 1,
        lineSpacing: catalogEntry.lineSpacing || 1
      };
      this._styleCache[styleKey] = style;
      return style;
    }

    _deriveFontFamily(styleEntry) {
      if (!styleEntry) {
        return DEFAULT_SANS;
      }
      const fileName = styleEntry.fontFileName ? styleEntry.fontFileName.toLowerCase() : null;
      if (!fileName) {
        return DEFAULT_SANS;
      }
      const baseName = fileName.replace(/\.[^.]+$/, '');
      if (styleEntry.isShx) {
        const fallback = SHX_FALLBACKS[baseName] || DEFAULT_SANS;
        return fallback;
      }
      if (styleEntry.isTrueType && baseName) {
        return `"${baseName}", ${DEFAULT_SANS}`;
      }
      return DEFAULT_SANS;
    }

    _computeLineSpacing(kind, rawText, style) {
      if (kind === 'MTEXT') {
        const geometry = rawText.geometry || {};
        const spacingStyle = geometry.lineSpacingStyle || 1;
        const spacingFactor = geometry.lineSpacing || 1;
        if (spacingStyle === 2 && spacingFactor > 0) {
          return spacingFactor;
        }
        return Math.max(1.0, spacingFactor || 1);
      }
      return 1.2;
    }

    _resolveReferenceWidth(kind, rawText) {
      if (kind === 'MTEXT') {
        const geometry = rawText.geometry || {};
        if (geometry.referenceWidth && geometry.referenceWidth > 0) {
          const scale = rawText.scaleMagnitude || 1;
          return geometry.referenceWidth * scale;
        }
      }
      return null;
    }

    _resolveWidthFactor(rawText, style) {
      const geometry = rawText.geometry || {};
      if (geometry.widthFactor && geometry.widthFactor > 0) {
        return geometry.widthFactor;
      }
      return style.widthFactor || 1;
    }

    _resolveAlignment(kind, rawText) {
      if (kind === 'MTEXT') {
        const attachment = rawText.geometry?.attachment || 1;
        const horizontal = ((attachment - 1) % 3);
        const vertical = Math.floor((attachment - 1) / 3);
        const mapH = ['left', 'center', 'right'];
        const mapV = ['top', 'middle', 'bottom'];
        return {
          horizontal: mapH[horizontal] || 'left',
          vertical: mapV[vertical] || 'top',
          textAlign: mapH[horizontal] || 'left'
        };
      }
      const alignment = rawText.geometry?.alignment || {};
      const mapH = {
        0: 'left',
        1: 'center',
        2: 'right',
        3: 'center',
        4: 'center',
        5: 'left'
      };
      const mapV = {
        0: 'bottom',
        1: 'bottom',
        2: 'middle',
        3: 'top'
      };
      const horizontal = mapH[alignment.horizontal] || 'left';
      const vertical = mapV[alignment.vertical] || 'bottom';
      return {
        horizontal,
        vertical,
        textAlign: horizontal
      };
    }

    _computeAnchorOffsets(widthPx, heightPx, horizontal, vertical, lineHeightPx, kind) {
      let offsetX = 0;
      if (horizontal === 'center') {
        offsetX = -widthPx / 2;
      } else if (horizontal === 'right') {
        offsetX = -widthPx;
      }

      let offsetY = 0;
      if (vertical === 'middle') {
        offsetY = -heightPx / 2;
      } else if (vertical === 'bottom' || vertical === 'baseline') {
        offsetY = -heightPx;
      } else if (vertical === 'top') {
        offsetY = 0;
      }
      if (kind === 'TEXT' && vertical === 'bottom') {
        offsetY += lineHeightPx * 0.15;
      }
      return { x: offsetX, y: offsetY };
    }

    _computeBackgroundMetrics(geometry, widthPx, heightPx, frameScale) {
      if (!geometry) {
        return null;
      }
      const maskWidth = Number(widthPx) || 0;
      const maskHeight = Number(heightPx) || 0;
      if (!(maskWidth > 0 && maskHeight > 0)) {
        return null;
      }
      const offsets = geometry.backgroundOffsets || null;
      const parseOffset = (value) => {
        if (value == null) {
          return 0;
        }
        if (typeof value === 'number') {
          return Number.isFinite(value) ? value * frameScale : 0;
        }
        if (typeof value === 'string') {
          const numeric = parseFloat(value);
          if (Number.isFinite(numeric)) {
            return numeric * frameScale;
          }
        }
        return 0;
      };
      let left = offsets ? parseOffset(offsets['46']) : 0;
      let top = offsets ? parseOffset(offsets['47']) : 0;
      let right = offsets ? parseOffset(offsets['48']) : 0;
      let bottom = offsets ? parseOffset(offsets['49']) : 0;
      let scale = geometry.backgroundScale;
      if (!Number.isFinite(scale) || scale <= 0) {
        scale = 1;
      }
      if (scale !== 1) {
        const widthDelta = maskWidth * (scale - 1);
        const heightDelta = maskHeight * (scale - 1);
        left += widthDelta / 2;
        right += widthDelta / 2;
        top += heightDelta / 2;
        bottom += heightDelta / 2;
      }
      return {
        x: -left,
        y: -top,
        width: maskWidth + left + right,
        height: maskHeight + top + bottom,
        offsetsPx: {
          left,
          top,
          right,
          bottom
        },
        scale
      };
    }

    _createEmptyLine(baseLineHeight) {
      return {
        segments: [],
        text: '',
        widthPx: 0,
        heightPx: baseLineHeight
      };
    }

    _buildFontDescriptor(baseStyle, runStyle = {}) {
      const fontStyle = runStyle.italic ? 'italic' : (baseStyle.fontStyle || 'normal');
      const fontWeight = runStyle.bold ? 'bold' : (baseStyle.fontWeight || '400');
      const family = runStyle.font
        ? `"${runStyle.font}", ${baseStyle.fontFamily || DEFAULT_SANS}`
        : (baseStyle.fontFamily || DEFAULT_SANS);
      return {
        font: `${fontStyle} ${fontWeight} {size} ${family}`,
        fontFamily: family
      };
    }

    _measureStyledRun(text, runStyle = {}, fontSizePx, fontTemplate) {
      if (!text || !text.length) {
        return 0;
      }
      const baseWidth = this._measureWidth(text, fontSizePx, fontTemplate);
      const widthScale = Number.isFinite(runStyle.widthScale) && runStyle.widthScale > 0
        ? runStyle.widthScale
        : 1;
      let finalWidth = baseWidth * widthScale;
      if (Number.isFinite(runStyle.tracking) && runStyle.tracking !== 0 && text.length > 1) {
        finalWidth += runStyle.tracking * fontSizePx * (text.length - 1);
      }
      if (Number.isFinite(runStyle.oblique) && runStyle.oblique !== 0) {
        const radians = runStyle.oblique * Math.PI / 180;
        finalWidth += Math.abs(Math.tan(radians) * fontSizePx);
      }
      return finalWidth;
    }

    _createFractionSegment(baseStyle, run, baseFontSizePx, lineHeightMultiplier) {
      if (!run || run.type !== 'fraction' || !run.fraction) {
        return null;
      }
      const fractionInfo = run.fraction || {};
      const numeratorText = (fractionInfo.numerator || '').trim();
      const denominatorText = (fractionInfo.denominator || '').trim();
      if (!numeratorText || !denominatorText) {
        return null;
      }
      const runStyle = run.style || {};
      const fontDescriptor = this._buildFontDescriptor(baseStyle, runStyle);
      const runHeightScale = Number.isFinite(runStyle.heightScale) && runStyle.heightScale > 0
        ? Math.max(0.01, runStyle.heightScale)
        : 1;
      const widthScale = Number.isFinite(runStyle.widthScale) && runStyle.widthScale > 0
        ? runStyle.widthScale
        : 1;
      const runFontSizePx = Math.max(1, baseFontSizePx * runHeightScale);
      const fractionScale = 0.9;
      const numeratorFontSize = Math.max(1, runFontSizePx * fractionScale);
      const denominatorFontSize = Math.max(1, runFontSizePx * fractionScale);
      const numeratorWidth = this._measureStyledRun(
        numeratorText,
        runStyle,
        numeratorFontSize,
        fontDescriptor.font
      );
      const denominatorWidth = this._measureStyledRun(
        denominatorText,
        runStyle,
        denominatorFontSize,
        fontDescriptor.font
      );
      const contentWidth = Math.max(numeratorWidth, denominatorWidth);
      const paddingPx = Math.max(1, runFontSizePx * 0.1);
      const gapPx = Math.max(1, runFontSizePx * 0.15);
      const barThicknessPx = Math.max(1, runFontSizePx * 0.06);
      const heightPx = numeratorFontSize + denominatorFontSize + (gapPx * 2) + barThicknessPx;
      const widthPx = contentWidth + (paddingPx * 2);
      const baseWidthPx = widthPx / widthScale;
      const basePaddingPx = paddingPx / widthScale;
      const numeratorBaseWidth = numeratorWidth / widthScale;
      const denominatorBaseWidth = denominatorWidth / widthScale;
      const ascentPx = numeratorFontSize + gapPx + (barThicknessPx * 0.5);
      const descentPx = denominatorFontSize + gapPx + (barThicknessPx * 0.5);
      const runLineHeight = Math.max(heightPx, runFontSizePx * lineHeightMultiplier);
      return {
        type: 'fraction',
        text: run.text,
        style: runStyle,
        widthPx,
        heightPx: Math.max(heightPx, runLineHeight),
        ascentPx,
        descentPx,
        fontSizePx: runFontSizePx,
        font: fontDescriptor.font,
        gapPx,
        barThicknessPx,
        paddingPx,
        baseWidthPx,
        basePaddingPx,
        fraction: fractionInfo,
        numerator: {
          text: numeratorText,
          widthPx: numeratorWidth,
          fontSizePx: numeratorFontSize,
          baseWidthPx: numeratorBaseWidth
        },
        denominator: {
          text: denominatorText,
          widthPx: denominatorWidth,
          fontSizePx: denominatorFontSize,
          baseWidthPx: denominatorBaseWidth
        }
      };
    }

    _normalizeParagraphAlignment(value, fallback) {
      if (value == null || value === '') {
        return fallback;
      }
      const numeric = parseInt(String(value).trim(), 10);
      if (!Number.isFinite(numeric)) {
        return fallback;
      }
      const map = {
        0: { horizontal: 'left', vertical: 'bottom' },
        1: { horizontal: 'center', vertical: 'bottom' },
        2: { horizontal: 'right', vertical: 'bottom' },
        3: { horizontal: 'left', vertical: 'middle' },
        4: { horizontal: 'center', vertical: 'middle' },
        5: { horizontal: 'right', vertical: 'middle' },
        6: { horizontal: 'left', vertical: 'top' },
        7: { horizontal: 'center', vertical: 'top' },
        8: { horizontal: 'right', vertical: 'top' }
      };
      const resolved = map[numeric];
      if (!resolved) {
        return fallback;
      }
      return {
        horizontal: resolved.horizontal,
        vertical: resolved.vertical,
        textAlign: resolved.horizontal
      };
    }

    _computeParagraphLineHeight(lineHeightPx, spacingValue, spacingStyle, frameScale) {
      if (Number.isFinite(spacingValue) && spacingValue > 0) {
        const scaled = spacingValue * frameScale;
        if (spacingStyle === 2) {
          return scaled;
        }
        return Math.max(lineHeightPx, scaled);
      }
      return lineHeightPx;
    }

    _buildColumnLayouts(paragraphLayouts, columnsMeta, manualBreaks = []) {
      const hasManual = Array.isArray(manualBreaks) && manualBreaks.length > 0;
      if (!columnsMeta && !hasManual) {
        return null;
      }
      const lines = [];
      paragraphLayouts.forEach((paragraph) => {
        paragraph.lines.forEach((line) => {
          lines.push(line);
        });
      });
      if (!lines.length) {
        return null;
      }
      const assignColumnMetadata = (layouts, computedCount) => {
        if (!Array.isArray(layouts) || !layouts.length) {
          return [];
        }
        const resolvedCount = Math.max(computedCount || layouts.length, 1);
        const widths = new Array(resolvedCount).fill(0);
        layouts.forEach((layoutEntry) => {
          if (!layoutEntry || !Number.isInteger(layoutEntry.index)) {
            return;
          }
          const columnIndex = layoutEntry.index;
          let order = 0;
          if (Number.isInteger(layoutEntry.lineStart) && Number.isInteger(layoutEntry.lineEnd)) {
            for (let idx = Math.max(0, layoutEntry.lineStart); idx <= layoutEntry.lineEnd && idx < lines.length; idx += 1) {
              const line = lines[idx];
              if (!line) {
                continue;
              }
              line.columnIndex = columnIndex;
              line.columnOrder = order;
              line.columnCount = resolvedCount;
              widths[columnIndex] = Math.max(
                widths[columnIndex],
                (line.widthPx || 0) + (line.rightIndentPx || 0)
              );
              order += 1;
            }
          }
        });
        return widths;
      };

      if (columnsMeta) {
        const desiredCount = Number.isFinite(columnsMeta.count) && columnsMeta.count > 0
          ? columnsMeta.count
          : (Number.isFinite(columnsMeta.type) && columnsMeta.type > 0 ? columnsMeta.type : 1);
        if (desiredCount && desiredCount > 1) {
          const columnCount = Math.max(1, desiredCount);
          const perColumn = Math.ceil(lines.length / columnCount);
          const layouts = [];
          for (let c = 0; c < columnCount; c += 1) {
            const startIndex = c * perColumn;
            const endIndex = Math.min((c + 1) * perColumn, lines.length);
            const slice = lines.slice(startIndex, endIndex);
            if (!slice.length) {
              layouts.push({
                index: c,
                lines: [],
                lineStart: startIndex,
                lineEnd: startIndex - 1,
                widthPx: 0,
                maxWidthPx: 0
              });
              continue;
            }
            const maxWidth = slice.reduce((acc, line) => Math.max(acc, line.widthPx || 0), 0);
            layouts.push({
              index: c,
              lines: slice.map((line) => line.text),
              lineStart: startIndex,
              lineEnd: endIndex - 1,
              widthPx: maxWidth,
              maxWidthPx: maxWidth
            });
          }
          const rawMeta = Object.assign({}, columnsMeta.raw || {});
          if (hasManual) {
            rawMeta.manualBreaks = manualBreaks.slice();
          }
          const widthsPx = assignColumnMetadata(layouts, columnCount);
          return {
            count: columnCount,
            flow: columnsMeta.flow ?? null,
            layouts,
            raw: rawMeta,
            widthsPx
          };
        }
        if (!hasManual) {
          return null;
        }
      }
      if (!hasManual) {
        return null;
      }
      const sortedBreaks = Array.from(new Set(manualBreaks
        .map((idx) => Math.max(0, Math.min(Math.floor(idx), lines.length)))))
        .filter((idx) => idx > 0 && idx < lines.length)
        .sort((a, b) => a - b);
      const segments = [];
      let start = 0;
      sortedBreaks.forEach((breakIndex) => {
        if (breakIndex > start) {
          segments.push({ start, end: breakIndex });
          start = breakIndex;
        }
      });
      if (start < lines.length) {
        segments.push({ start, end: lines.length });
      }
      if (!segments.length) {
        return null;
      }
      const layouts = segments.map((segment, columnIndex) => {
        const slice = lines.slice(segment.start, segment.end);
        const maxWidth = slice.reduce((acc, line) => Math.max(acc, line.widthPx || 0), 0);
        return {
          index: columnIndex,
          lines: slice.map((line) => line.text),
          lineStart: segment.start,
          lineEnd: segment.end - 1,
          widthPx: maxWidth,
          maxWidthPx: maxWidth
        };
      });
      const widthsPx = assignColumnMetadata(layouts, layouts.length);
      return {
        count: layouts.length,
        flow: columnsMeta && columnsMeta.flow != null ? columnsMeta.flow : null,
        layouts,
        raw: {
          manualBreaks: sortedBreaks,
          columnsMeta: columnsMeta && columnsMeta.raw ? columnsMeta.raw : null
        },
        widthsPx
      };
    }

    _isVerticalWriting(geometry) {
      if (!geometry || geometry.drawingDirection == null) {
        return false;
      }
      const dir = parseInt(geometry.drawingDirection, 10);
      return dir === 1 || dir === 3;
    }

    _resolveBackground(rawText) {
      const geometry = rawText.geometry || {};
      const background = geometry.background || {};
      const fillFlag = geometry.backgroundFill != null
        ? geometry.backgroundFill
        : (background.fillType != null ? background.fillType : 0);
      if (!fillFlag) {
        return null;
      }
      const transparency = geometry.backgroundTransparency || background.transparency || null;
      const alpha = transparency && typeof transparency.alpha === 'number'
        ? Math.max(0, Math.min(1, transparency.alpha))
        : 1;
      if (geometry.backgroundTrueColor) {
        return this._createRgba(geometry.backgroundTrueColor, alpha);
      }
      if (Number.isInteger(geometry.backgroundColorNumber)) {
        return this._createRgba(this._aciToRgb(geometry.backgroundColorNumber), alpha);
      }
      if (background.trueColor) {
        return this._createRgba(background.trueColor, alpha);
      }
      if (Number.isInteger(background.colorNumber)) {
        return this._createRgba(this._aciToRgb(background.colorNumber), alpha);
      }
      if (rawText.entity && rawText.entity.trueColor) {
        return this._createRgba(rawText.entity.trueColor, Math.max(0.05, Math.min(1, alpha * 0.2)));
      }
      const fallbackAlpha = Math.max(0.05, Math.min(1, alpha * 0.25));
      return `rgba(0,0,0,${fallbackAlpha.toFixed(3)})`;
    }

    _createRgba(color, alphaFallback) {
      if (!color) {
        return `rgba(0,0,0,${alphaFallback})`;
      }
      if (color.css) {
        return color.css;
      }
      const r = Math.round((color.r ?? 0) * 255);
      const g = Math.round((color.g ?? 0) * 255);
      const b = Math.round((color.b ?? 0) * 255);
      const a = color.a != null ? color.a : alphaFallback;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    _aciToRgb(index) {
      const table = {
        1: { r: 255, g: 0, b: 0 },
        2: { r: 255, g: 255, b: 0 },
        3: { r: 0, g: 255, b: 0 },
        4: { r: 0, g: 255, b: 255 },
        5: { r: 0, g: 0, b: 255 },
        6: { r: 255, g: 0, b: 255 },
        7: { r: 255, g: 255, b: 255 }
      };
      if (table[index]) {
        return table[index];
      }
      return { r: 210, g: 227, b: 255 };
    }
  }

  namespace.TextLayoutEngine = TextLayoutEngine;

  return {
    TextLayoutEngine
  };
}));
