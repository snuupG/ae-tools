/**
 * SAFE ZONES — After Effects ScriptUI Panel
 * v1.0
 *
 * Generates a platform safe-zone overlay as a shape layer in the active comp:
 * the unsafe area is filled, the safe area is outlined. Created as a GUIDE
 * LAYER, so it shows in the viewer and never renders on export.
 *
 * DISTRIBUTION
 *   Loaded automatically by the loader _loaders/SafeZones.jsx
 *   (GitHub repo snuupG/ae-tools). To publish an update: bump VERSION below
 *   AND the version in manifest.json, then Commit + Push.
 *
 * CHANGELOG v2.5
 *   - TikTok values verified against the official In-Feed safe zone template
 *     downloaded from TikTok Ads Manager Help (2880x5120 RGBA). Margins read
 *     from the alpha channel: the fully transparent region is the safe area.
 *     Top / bottom / sides / rail width all confirmed exact. The rail START
 *     was wrong by 120px and is now corrected.
 */

(function (thisObj) {

    // ---------------------------------------------------------------------
    // CONSTANTS
    // ---------------------------------------------------------------------

    var SCRIPT_NAME = "Safe Zones";
    var VERSION = "1.0";
    var PREFIX = "[SZ] ";
    var SETTINGS_SECTION = "SafeZonesPanel";

    // ---------------------------------------------------------------------
    // SAFE ZONES
    // Margins in pixels, relative to the "ref" resolution. Converted to ratios
    // internally, so they hold at any comp size.
    //
    // "rail" = the action rail, which reaches higher than the caption block.
    // Below fromY the right margin widens to rail.right. That is what makes the
    // safe area an L rather than a rectangle.
    //
    // Sourcing (checked 2026-08-07, https://www.solidlabs.com/social-safe-zones):
    //   measured  = read from the platform's own template alpha channel
    //   published = quoted from platform documentation
    //   no spec   = platform publishes nothing; comfort margins, ours
    //
    // Every published safe zone is scoped to ADS. No platform publishes an
    // organic one. Organic posts carry no CTA button and no Sponsored label, so
    // their real bottom margin is smaller - these are conservative for organic,
    // which is the safe direction to be wrong in.
    // ---------------------------------------------------------------------

    var SAFE_ZONES = [
        // VERIFIED - read from the alpha channel of TikTok's official In-Feed
        // safe zone template (Ads Manager Help, 2880x5120 RGBA, scale 1:2.6667).
        // Transparent region = safe area. Every margin below is exact.
        //   left/right 120px : NOT a UI margin - this is the device crop guard.
        //     A 9:16 asset on a 19.5:9 phone is scaled to fill and cropped
        //     sideways (measured: 98px per side on an iPhone 16 Pro).
        //   bottom 660px : covers the caption at full expansion. The collapsed
        //     two-line state measures ~330px on a real device.
        //   rail : right margin widens to 300px from y=840 (43.75% height).
        { name: "TikTok", ref: [1080, 1920],
          top: 240, bottom: 660, left: 120, right: 120,
          rail: { right: 300, fromY: 840 } },

        // published - "leave at least 14% of the top, 35% of the bottom and 6%
        // on each side". Rail notch measured from Meta's diagram: the right 21%
        // is unsafe down to 40% of the height.
        { name: "Instagram - Reels", ref: [1080, 1920],
          top: 269, bottom: 672, left: 65, right: 65,
          rail: { right: 227, fromY: 1152 } },

        // no spec - Meta says keep the bottom and sides clear but publishes no
        // number. No UI sits on the creative in feed; this is breathing room.
        { name: "Instagram - 4:5", ref: [1080, 1350],
          top: 60, bottom: 90, left: 60, right: 60, rail: null },

        // published - since March 2026 Meta governs Stories and Reels with a
        // single 9:16 safe zone, so these numbers are identical to Reels above.
        // The 14% / 20% still quoted for Stories is the stale pre-2026 figure.
        { name: "Instagram - Story", ref: [1080, 1920],
          top: 269, bottom: 672, left: 65, right: 65,
          rail: { right: 227, fromY: 1152 } },

        // published - "avoid the top 10%, the bottom 25%, the right-hand 10%".
        // Google specifies no left margin. Valid for Shorts-only delivery; an
        // asset also serving in-stream needs 288/672/48/192.
        { name: "Youtube - Shorts", ref: [1080, 1920],
          top: 192, bottom: 480, left: 0, right: 108, rail: null },

        // no spec - progress bar and controls at the bottom, title and buttons
        // at the top when paused. Comfort margins, ours.
        { name: "Youtube - 16:9", ref: [1920, 1080],
          top: 90, bottom: 130, left: 90, right: 90, rail: null },

        // published but stale - the Snap Ads PDF carries a 2017 creation date
        // and still lists 3-10s ads. The current specs page publishes no pixels.
        { name: "Snapchat", ref: [1080, 1920],
          top: 150, bottom: 150, left: 0, right: 0, rail: null },

        // no spec - LinkedIn publishes resolution, file size and duration, but
        // no safe zone. Figures quoted elsewhere are Reels' numbers reused.
        { name: "Linkedin", ref: [1080, 1920],
          top: 110, bottom: 230, left: 60, right: 60, rail: null }
    ];

    // ---------------------------------------------------------------------
    // HELPERS (ExtendScript = ES3)
    // ---------------------------------------------------------------------

    function getSetting(key, def) {
        try {
            if (app.settings.haveSetting(SETTINGS_SECTION, key)) {
                return app.settings.getSetting(SETTINGS_SECTION, key);
            }
        } catch (e) { }
        return def;
    }

    function setSetting(key, val) {
        try { app.settings.saveSetting(SETTINGS_SECTION, key, String(val)); } catch (e) { }
    }

    function activeComp() {
        var it = app.project ? app.project.activeItem : null;
        if (it && it instanceof CompItem) { return it; }
        return null;
    }

    function hexToRGB(hex) {
        return [((hex >> 16) & 0xFF) / 255, ((hex >> 8) & 0xFF) / 255, (hex & 0xFF) / 255];
    }

    function rgbToHex(rgb) {
        return (Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255);
    }

    function rgbToHexString(rgb) {
        var h = rgbToHex(rgb).toString(16).toUpperCase();
        while (h.length < 6) { h = "0" + h; }
        return h;
    }

    function isSZLayer(layer) {
        return layer.name.length >= PREFIX.length && layer.name.substring(0, PREFIX.length) === PREFIX;
    }

    // ---------------------------------------------------------------------
    // COLOR PICKER
    // ScriptUI groups with a custom onDraw do not render reliably inside a
    // docked panel, so every swatch is a BUTTON: even if onDraw never fires,
    // a clickable control with the hex code on it is still visible.
    // ---------------------------------------------------------------------

    var SWATCH_PRESETS = [
        "FF7A00", "FF3B30", "FFD400", "34C759",
        "00E5FF", "2D7DFF", "FF2D9E", "FFFFFF",
        "B0B0B0", "000000", "0A1428", "8B5CF6"
    ];

    function hexStringToRGB(str) {
        var cleaned = "";
        for (var i = 0; i < str.length; i++) {
            if ("0123456789abcdefABCDEF".indexOf(str.charAt(i)) >= 0) { cleaned += str.charAt(i); }
        }
        if (cleaned.length === 3) {
            cleaned = cleaned.charAt(0) + cleaned.charAt(0) + cleaned.charAt(1) +
                      cleaned.charAt(1) + cleaned.charAt(2) + cleaned.charAt(2);
        }
        if (cleaned.length !== 6) { return null; }
        return hexToRGB(parseInt(cleaned, 16));
    }

    function paintSwatch(btn, rgb, w, h) {
        btn.swColor = [rgb[0], rgb[1], rgb[2]];
        btn.swW = w;
        btn.swH = h;
        btn.text = rgbToHexString(rgb);
        btn.onDraw = function () {
            var g = this.graphics;
            var c = this.swColor;
            g.newPath();
            g.rectPath(0, 0, this.swW, this.swH);
            g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [c[0], c[1], c[2], 1]));
            g.newPath();
            g.rectPath(0, 0, this.swW, this.swH);
            g.strokePath(g.newPen(g.PenType.SOLID_COLOR, [0.4, 0.4, 0.4, 1], 1));
        };
    }

    function redraw(el) {
        try { el.notify("onDraw"); } catch (e) { }
        try { el.hide(); el.show(); } catch (e2) { }
    }

    function makeSwatchButton(parent, rgb, w, h) {
        var btn = parent.add("button", undefined, "");
        btn.preferredSize = [w, h];
        paintSwatch(btn, rgb, w, h);
        return btn;
    }

    function colorDialog(initial, title) {
        var cur = [initial[0], initial[1], initial[2]];
        var d = new Window("dialog", title || "Choose a color");
        d.orientation = "column";
        d.alignChildren = ["fill", "top"];
        d.margins = 14;
        d.spacing = 10;

        var top = d.add("group");
        top.alignChildren = ["left", "top"];
        top.spacing = 12;

        var preview = top.add("button", undefined, "");
        preview.preferredSize = [110, 76];
        paintSwatch(preview, cur, 110, 76);

        var fields = top.add("group");
        fields.orientation = "column";
        fields.alignChildren = ["left", "top"];
        fields.spacing = 6;

        var gHex = fields.add("group");
        gHex.add("statictext", undefined, "HEX  #");
        var etHex = gHex.add("edittext", undefined, rgbToHexString(cur));
        etHex.characters = 8;

        var gRGB = fields.add("group");
        gRGB.spacing = 4;
        gRGB.add("statictext", undefined, "R");
        var etR = gRGB.add("edittext", undefined, "0");
        etR.characters = 4;
        gRGB.add("statictext", undefined, "G");
        var etG = gRGB.add("edittext", undefined, "0");
        etG.characters = 4;
        gRGB.add("statictext", undefined, "B");
        var etB = gRGB.add("edittext", undefined, "0");
        etB.characters = 4;

        var pal = d.add("panel", undefined, "Presets");
        pal.orientation = "column";
        pal.alignChildren = ["left", "top"];
        pal.margins = [10, 16, 10, 10];
        pal.spacing = 4;
        var rows = [pal.add("group"), pal.add("group"), pal.add("group")];
        rows[0].spacing = 4; rows[1].spacing = 4; rows[2].spacing = 4;

        function syncFields(skipHex) {
            if (!skipHex) { etHex.text = rgbToHexString(cur); }
            etR.text = String(Math.round(cur[0] * 255));
            etG.text = String(Math.round(cur[1] * 255));
            etB.text = String(Math.round(cur[2] * 255));
            paintSwatch(preview, cur, 110, 76);
            redraw(preview);
        }

        function bindPreset(btn) {
            btn.onClick = function () {
                cur = [btn.swColor[0], btn.swColor[1], btn.swColor[2]];
                syncFields(false);
            };
        }

        for (var i = 0; i < SWATCH_PRESETS.length; i++) {
            bindPreset(makeSwatchButton(rows[Math.floor(i / 4)],
                       hexToRGB(parseInt(SWATCH_PRESETS[i], 16)), 40, 24));
        }

        etHex.onChange = function () {
            var c = hexStringToRGB(etHex.text);
            if (c) { cur = c; syncFields(true); etHex.text = rgbToHexString(cur); }
            else { etHex.text = rgbToHexString(cur); }
        };

        function readByte(field, idx) {
            var n = parseInt(field.text, 10);
            if (isNaN(n)) { n = Math.round(cur[idx] * 255); }
            if (n < 0) { n = 0; }
            if (n > 255) { n = 255; }
            cur[idx] = n / 255;
            syncFields(false);
        }
        etR.onChange = function () { readByte(etR, 0); };
        etG.onChange = function () { readByte(etG, 1); };
        etB.onChange = function () { readByte(etB, 2); };

        var btns = d.add("group");
        btns.alignment = "right";
        var bCancel = btns.add("button", undefined, "Cancel", { name: "cancel" });
        var bOK = btns.add("button", undefined, "OK", { name: "ok" });

        var accepted = false;
        bOK.onClick = function () { accepted = true; d.close(); };
        bCancel.onClick = function () { accepted = false; d.close(); };

        syncFields(false);
        d.show();
        return accepted ? cur : null;
    }

    // ---------------------------------------------------------------------
    // GEOMETRY
    // ---------------------------------------------------------------------

    function referenceFrame(comp, preset, mode) {
        if (mode !== 1) {
            return { x: 0, y: 0, w: comp.width, h: comp.height };
        }
        var ratio = preset.ref[0] / preset.ref[1];
        var w, h;
        if (comp.width / comp.height > ratio) { h = comp.height; w = h * ratio; }
        else { w = comp.width; h = w / ratio; }
        return { x: (comp.width - w) / 2, y: (comp.height - h) / 2, w: w, h: h };
    }

    // Safe area as a closed polygon. Six points when the platform has an action
    // rail, four otherwise:
    //
    //   L,T ---------------- R,T
    //    |                    |
    //    |          NR,NY --- R,NY    <- rail starts here
    //    |            |
    //   L,B -------- NR,B
    function safePolygon(frame, preset) {
        var L = frame.x + (preset.left / preset.ref[0]) * frame.w;
        var R = frame.x + frame.w - (preset.right / preset.ref[0]) * frame.w;
        var T = frame.y + (preset.top / preset.ref[1]) * frame.h;
        var B = frame.y + frame.h - (preset.bottom / preset.ref[1]) * frame.h;

        if (preset.rail) {
            var NR = frame.x + frame.w - (preset.rail.right / preset.ref[0]) * frame.w;
            var NY = frame.y + (preset.rail.fromY / preset.ref[1]) * frame.h;
            if (NR < R && NY > T && NY < B) {
                return [[L, T], [R, T], [R, NY], [NR, NY], [NR, B], [L, B]];
            }
        }
        return [[L, T], [R, T], [R, B], [L, B]];
    }

    // ---------------------------------------------------------------------
    // SHAPE BUILDING
    // ---------------------------------------------------------------------

    // Arbitrary closed path. All tangents zero, so the corners stay square.
    function addPolyPath(vectors, pts) {
        var grp = vectors.addProperty("ADBE Vector Shape - Group");
        var shape = new Shape();
        var verts = [];
        var tIn = [];
        var tOut = [];
        for (var i = 0; i < pts.length; i++) {
            verts.push([pts[i][0], pts[i][1]]);
            tIn.push([0, 0]);
            tOut.push([0, 0]);
        }
        shape.vertices = verts;
        shape.inTangents = tIn;
        shape.outTangents = tOut;
        shape.closed = true;
        grp.property("ADBE Vector Shape").setValue(shape);
        return grp;
    }

    function addRectPath(vectors, pos, size) {
        var rect = vectors.addProperty("ADBE Vector Shape - Rect");
        rect.property("ADBE Vector Rect Size").setValue([size[0], size[1]]);
        rect.property("ADBE Vector Rect Position").setValue([pos[0], pos[1]]);
        return rect;
    }

    function buildOverlay(comp, preset, opts) {
        var frame = referenceFrame(comp, preset, opts.frameMode);
        var poly = safePolygon(frame, preset);

        var lay = comp.layers.addShape();
        lay.name = PREFIX + preset.name;
        var tr = lay.property("ADBE Transform Group");
        tr.property("ADBE Anchor Point").setValue([0, 0]);
        tr.property("ADBE Position").setValue([0, 0]);

        var root = lay.property("ADBE Root Vectors Group");

        // Unsafe area: full-comp rect + safe polygon in the same group, with an
        // even-odd fill rule punching the safe area out of the fill.
        if (opts.showFill) {
            var gFill = root.addProperty("ADBE Vector Group");
            gFill.name = "Unsafe area";
            var vFill = gFill.property("ADBE Vectors Group");
            addRectPath(vFill, [comp.width / 2, comp.height / 2], [comp.width, comp.height]);
            addPolyPath(vFill, poly);
            var fill = vFill.addProperty("ADBE Vector Graphic - Fill");
            try { fill.property("ADBE Vector Fill Rule").setValue(2); } catch (e) { }
            fill.property("ADBE Vector Fill Color").setValue(opts.fillColor);
            fill.property("ADBE Vector Fill Opacity").setValue(opts.fillOpacity);
        }

        if (opts.showStroke) {
            var gLine = root.addProperty("ADBE Vector Group");
            gLine.name = "Safe area";
            var vLine = gLine.property("ADBE Vectors Group");
            addPolyPath(vLine, poly);
            var stroke = vLine.addProperty("ADBE Vector Graphic - Stroke");
            stroke.property("ADBE Vector Stroke Color").setValue(opts.lineColor);
            stroke.property("ADBE Vector Stroke Width").setValue(opts.strokeWidth);
        }

        // Reference frame outline, only when the preset ratio differs from comp
        if (opts.frameMode === 1 && (Math.abs(frame.w - comp.width) > 1 || Math.abs(frame.h - comp.height) > 1)) {
            var gFrame = root.addProperty("ADBE Vector Group");
            gFrame.name = "Frame " + preset.ref[0] + "x" + preset.ref[1];
            var vFrame = gFrame.property("ADBE Vectors Group");
            addRectPath(vFrame, [frame.x + frame.w / 2, frame.y + frame.h / 2], [frame.w, frame.h]);
            var st2 = vFrame.addProperty("ADBE Vector Graphic - Stroke");
            st2.property("ADBE Vector Stroke Color").setValue(opts.lineColor);
            st2.property("ADBE Vector Stroke Width").setValue(opts.strokeWidth * 2);
        }

        lay.guideLayer = true;
        lay.label = opts.labelColor;
        lay.comment = "Safe zone overlay - " + SCRIPT_NAME + " v" + VERSION;

        var textLay = null;
        if (opts.showLabels) {
            try {
                var L = poly[0][0];
                var T = poly[0][1];
                textLay = comp.layers.addText(preset.name);
                textLay.name = PREFIX + preset.name + " \u00B7 label";
                var srcText = textLay.property("ADBE Text Properties").property("ADBE Text Document");
                var doc = srcText.value;
                doc.fontSize = Math.max(12, Math.round(comp.height / 55));
                doc.applyFill = true;
                doc.fillColor = opts.lineColor;
                doc.applyStroke = false;
                srcText.setValue(doc);
                var ttr = textLay.property("ADBE Transform Group");
                ttr.property("ADBE Anchor Point").setValue([0, 0]);
                ttr.property("ADBE Position").setValue([L + doc.fontSize * 0.4, T + doc.fontSize * 1.3]);
                textLay.guideLayer = true;
                textLay.label = opts.labelColor;
                textLay.locked = true;
            } catch (e) { textLay = null; }
        }

        lay.moveToBeginning();
        if (textLay) { textLay.moveToBeginning(); }
        lay.locked = true;
        return lay;
    }

    // ---------------------------------------------------------------------
    // ACTIONS
    // ---------------------------------------------------------------------

    function removeOverlays(comp) {
        var removed = 0;
        for (var i = comp.numLayers; i >= 1; i--) {
            var l = comp.layer(i);
            if (isSZLayer(l)) {
                l.locked = false;
                l.remove();
                removed++;
            }
        }
        return removed;
    }

    function toggleOverlays(comp) {
        var found = null;
        var i;
        for (i = 1; i <= comp.numLayers; i++) {
            if (isSZLayer(comp.layer(i))) { found = comp.layer(i); break; }
        }
        if (!found) { return -1; }
        var target = !found.enabled;
        for (i = 1; i <= comp.numLayers; i++) {
            var l = comp.layer(i);
            if (isSZLayer(l)) {
                var wasLocked = l.locked;
                l.locked = false;
                l.enabled = target;
                l.locked = wasLocked;
            }
        }
        return target ? 1 : 0;
    }

    // ---------------------------------------------------------------------
    // UI
    // ---------------------------------------------------------------------

    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME + " v" + VERSION, undefined, { resizeable: true });

        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.spacing = 8;
        win.margins = 10;

        var lineColor = hexToRGB(parseInt(getSetting("lineColor", "16742400"), 10));
        var fillColor = hexToRGB(parseInt(getSetting("fillColor", "0"), 10));

        // --- Platform
        var grpPlat = win.add("group");
        grpPlat.alignChildren = ["left", "center"];
        var lblPlat = grpPlat.add("statictext", undefined, "Platform");
        lblPlat.preferredSize.width = 58;
        var ddPlat = grpPlat.add("dropdownlist", undefined, []);
        ddPlat.preferredSize.width = 200;

        for (var i = 0; i < SAFE_ZONES.length; i++) { ddPlat.add("item", SAFE_ZONES[i].name); }
        var lastPreset = getSetting("lastPreset", "");
        for (var j = 0; j < ddPlat.items.length; j++) {
            if (ddPlat.items[j].text === lastPreset) { ddPlat.selection = j; break; }
        }
        if (!ddPlat.selection) { ddPlat.selection = 0; }

        // --- Overlay options
        var pOpt = win.add("panel", undefined, "Overlay");
        pOpt.orientation = "column";
        pOpt.alignChildren = ["fill", "top"];
        pOpt.margins = [10, 16, 10, 10];
        pOpt.spacing = 6;

        var cbFill = pOpt.add("checkbox", undefined, "Fill unsafe area");
        cbFill.value = getSetting("showFill", "1") === "1";

        var grpOpa = pOpt.add("group");
        grpOpa.alignChildren = ["left", "center"];
        var lblOpa = grpOpa.add("statictext", undefined, "Opacity");
        lblOpa.preferredSize.width = 56;
        var sldOpa = grpOpa.add("slider", undefined, Number(getSetting("fillOpacity", "55")), 0, 100);
        sldOpa.preferredSize.width = 120;
        var txtOpa = grpOpa.add("statictext", undefined, "100%");
        txtOpa.preferredSize.width = 40;

        var cbStroke = pOpt.add("checkbox", undefined, "Safe area outline");
        cbStroke.value = getSetting("showStroke", "1") === "1";

        var cbLabels = pOpt.add("checkbox", undefined, "Label");
        cbLabels.value = getSetting("showLabels", "1") === "1";

        var grpFrame = pOpt.add("group");
        grpFrame.alignChildren = ["left", "center"];
        var lblFrame = grpFrame.add("statictext", undefined, "Frame");
        lblFrame.preferredSize.width = 56;
        var ddFrame = grpFrame.add("dropdownlist", undefined, ["Full comp", "Preset ratio (centered)"]);
        ddFrame.selection = Number(getSetting("frameMode", "0"));
        ddFrame.helpTip = "Preset ratio: useful when working in 16:9 and delivering a 9:16 crop.";

        var grpCol = pOpt.add("group");
        grpCol.alignChildren = ["left", "center"];
        grpCol.spacing = 8;
        var lblCol = grpCol.add("statictext", undefined, "Colors");
        lblCol.preferredSize.width = 56;
        grpCol.add("statictext", undefined, "Fill");
        var swFill = makeSwatchButton(grpCol, fillColor, 58, 22);
        grpCol.add("statictext", undefined, "Line");
        var swLine = makeSwatchButton(grpCol, lineColor, 58, 22);

        // --- Actions
        var grpBtn = win.add("group");
        grpBtn.alignChildren = ["fill", "center"];
        var btnApply = grpBtn.add("button", undefined, "Apply");
        var btnToggle = grpBtn.add("button", undefined, "Show / Hide");
        var btnClear = grpBtn.add("button", undefined, "Clear");

        var status = win.add("statictext", undefined, "Ready.");
        status.characters = 38;

        function say(msg) { status.text = msg; }
        function syncOpa() { txtOpa.text = Math.round(sldOpa.value) + "%"; }
        syncOpa();

        function currentOptions() {
            return {
                showFill: cbFill.value,
                fillOpacity: Math.round(sldOpa.value),
                showStroke: cbStroke.value,
                showLabels: cbLabels.value,
                frameMode: ddFrame.selection ? ddFrame.selection.index : 0,
                lineColor: lineColor,
                fillColor: fillColor,
                strokeWidth: 3,
                labelColor: 11
            };
        }

        function saveOptions() {
            setSetting("showFill", cbFill.value ? "1" : "0");
            setSetting("fillOpacity", Math.round(sldOpa.value));
            setSetting("showStroke", cbStroke.value ? "1" : "0");
            setSetting("showLabels", cbLabels.value ? "1" : "0");
            setSetting("frameMode", ddFrame.selection ? ddFrame.selection.index : 0);
            setSetting("lineColor", rgbToHex(lineColor));
            setSetting("fillColor", rgbToHex(fillColor));
            if (ddPlat.selection) { setSetting("lastPreset", ddPlat.selection.text); }
        }

        function currentPreset() {
            if (!ddPlat.selection) { return null; }
            for (var k = 0; k < SAFE_ZONES.length; k++) {
                if (SAFE_ZONES[k].name === ddPlat.selection.text) { return SAFE_ZONES[k]; }
            }
            return null;
        }

        // --- Handlers
        sldOpa.onChanging = syncOpa;

        swFill.onClick = function () {
            var c = colorDialog(fillColor, "Fill color");
            if (c) {
                fillColor = c;
                paintSwatch(swFill, fillColor, 58, 22);
                redraw(swFill);
                setSetting("fillColor", rgbToHex(fillColor));
                say("Fill color: #" + rgbToHexString(fillColor));
            }
        };

        swLine.onClick = function () {
            var c = colorDialog(lineColor, "Line color");
            if (c) {
                lineColor = c;
                paintSwatch(swLine, lineColor, 58, 22);
                redraw(swLine);
                setSetting("lineColor", rgbToHex(lineColor));
                say("Line color: #" + rgbToHexString(lineColor));
            }
        };

        btnApply.onClick = function () {
            var comp = activeComp();
            if (!comp) { say("No active composition."); return; }
            var preset = currentPreset();
            if (!preset) { say("No platform selected."); return; }

            app.beginUndoGroup(SCRIPT_NAME + ": apply");
            try {
                removeOverlays(comp);
                buildOverlay(comp, preset, currentOptions());
                saveOptions();
                say(preset.name + " applied.");
            } catch (err) {
                say("Error: " + err.toString());
            }
            app.endUndoGroup();
        };

        btnToggle.onClick = function () {
            var comp = activeComp();
            if (!comp) { say("No active composition."); return; }
            app.beginUndoGroup(SCRIPT_NAME + ": show/hide");
            var r = toggleOverlays(comp);
            app.endUndoGroup();
            if (r === -1) { say("Nothing to toggle in this comp."); }
            else { say(r === 1 ? "Overlay visible." : "Overlay hidden."); }
        };

        btnClear.onClick = function () {
            var comp = activeComp();
            if (!comp) { say("No active composition."); return; }
            app.beginUndoGroup(SCRIPT_NAME + ": clear");
            var n = removeOverlays(comp);
            app.endUndoGroup();
            say(n ? n + " layer(s) removed." : "Nothing to remove.");
        };

        win.onResizing = win.onResize = function () { this.layout.resize(); };

        if (win instanceof Window) {
            win.center();
            win.show();
        } else {
            win.layout.layout(true);
            win.layout.resize();
        }

        return win;
    }

    // Launched by the loader: use its dockable panel
    var host = $.global.__aeToolsHost || thisObj;
    $.global.__aeToolsHost = undefined;

    buildUI(host);

})(this);
