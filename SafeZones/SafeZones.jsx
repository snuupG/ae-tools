/**
 * SAFE ZONES — After Effects ScriptUI Panel
 * v1.2
 *
 * Generates a platform safe-zone overlay as a single shape layer in the
 * active comp: the unsafe area is filled, the safe area stays clear. Created
 * as a GUIDE LAYER, so it shows in the viewer and never renders on export.
 *
 * DISTRIBUTION
 *   Loaded automatically by the loader _loaders/SafeZones.jsx
 *   (GitHub repo snuupG/ae-tools). To publish an update: bump VERSION below
 *   AND the version in manifest.json, then Commit + Push.
 *
 * CHANGELOG v1.2
 *   - Platform list reordered and renamed. Removed Instagram Story and
 *     Snapchat Spotlight, merged the two YouTube 16:9 presets (title safe),
 *     added Instagram 4:5 and Linkedin.
 *
 * CHANGELOG v1.1
 *   - Simplified: one shape layer only. Removed the safe-area outline, the
 *     text label and the "Frame" option (the overlay always covers the comp).
 *   - Safe zone values updated from "Safe zones social media - organique"
 *     (The Source, 07/10/2026).
 */

(function (thisObj) {

    // ---------------------------------------------------------------------
    // CONSTANTS
    // ---------------------------------------------------------------------

    var SCRIPT_NAME = "Safe Zones";
    var VERSION = "1.2";
    var PREFIX = "[SZ] ";
    var SETTINGS_SECTION = "SafeZonesPanel";

    // ---------------------------------------------------------------------
    // SAFE ZONES
    // Margins in pixels, relative to the "ref" resolution. Converted to ratios
    // internally, so they hold at any comp size with the same aspect ratio.
    //
    // "rail" = the action rail on the right. Below fromY the right margin
    // widens to rail.right, which makes the safe area an L instead of a
    // rectangle.
    //
    // Source: "Safe zones social media - organique" (The Source, 07/10/2026).
    // No platform publishes an organic safe zone. Official numbers only exist
    // in the Ads docs; organic UI = Ads UI minus the ad elements, so Ads
    // margins are the most solid reference and slightly conservative.
    //   [OFFICIEL]  = published by the platform (Ads docs)
    //   [MESURE]    = measured on an official template / preview
    //   [CONSENSUS] = repeated by creator / agency sources, no platform source
    // ---------------------------------------------------------------------

    var SAFE_ZONES = [
        // [MESURE on OFFICIEL template] TikTok Ads Manager Help, In-Feed
        // Standard Version LTR (720x1280, scaled x1.5). Safe rect
        // x 120 -> 960, y 240 -> 1260, plus button column x > 780 for y >= 840.
        { name: "Tiktok", ref: [1080, 1920],
          top: 240, bottom: 660, left: 120, right: 120,
          rail: { right: 300, fromY: 840 } },

        // [OFFICIEL] Meta Ads Guide, Instagram Reels ad specs: 14% top,
        // 35% bottom, 6% each side. Safe rect x 65 -> 1015, y 269 -> 1248.
        // The like/comment/share rail sits on the right of the bottom zone:
        // avoid text hugging the right edge in the lower third.
        { name: "Instagram - Reels", ref: [1080, 1920],
          top: 269, bottom: 672, left: 65, right: 65, rail: null },

        // [CONSENSUS] No UI sits on a feed post. The profile grid crops every
        // thumbnail to 3:4 centered (Jan 2025), so a 1080x1350 post loses
        // ~34px per side. 60px sides cover that crop; top / bottom are
        // breathing room (bottom slightly larger for the tag / mute icons).
        { name: "Instagram - 4:5", ref: [1080, 1350],
          top: 60, bottom: 90, left: 60, right: 60, rail: null },

        // [CONSENSUS] 150px top (name / headline), 150px bottom (swipe-up /
        // action zone). Safe rect x 0 -> 1080, y 150 -> 1770.
        { name: "Snapchat", ref: [1080, 1920],
          top: 150, bottom: 150, left: 0, right: 0, rail: null },

        // [CONSENSUS] LinkedIn publishes no safe zone. Values from third-party
        // checkers (aicarousels, AdKit): 108 top, 320 bottom (caption),
        // 60 left, 120 right (action rail). Safe rect x 60 -> 960, y 108 -> 1600.
        { name: "Linkedin", ref: [1080, 1920],
          top: 108, bottom: 320, left: 60, right: 120, rail: null },

        // [OFFICIEL] Google Ads Help, "Safe zones for vertical video ads on
        // YouTube". Right margin = like/dislike/comment/share rail.
        // Safe rect x 48 -> 888, y 288 -> 1248. Not centered on x = 540.
        { name: "Youtube - Short", ref: [1080, 1920],
          top: 288, bottom: 672, left: 48, right: 192, rail: null },

        // [norme SMPTE] Title safe 90%: texts and subtitles stay inside.
        // Safe rect x 96 -> 1824, y 54 -> 1026. (Action safe 93% would be
        // 67 / 38 px - title safe is the stricter of the two.)
        { name: "Youtube - 16:9", ref: [1920, 1080],
          top: 54, bottom: 54, left: 96, right: 96, rail: null },

        // Intersection of the strictest 9:16 values (one master for all):
        // top/right YT Shorts, bottom Meta Reels / YT Shorts, left TikTok,
        // plus the TikTok button column. Safe rect x 120 -> 888, y 288 -> 1248.
        { name: "Universal - 9:16", ref: [1080, 1920],
          top: 288, bottom: 672, left: 120, right: 192,
          rail: { right: 300, fromY: 840 } }
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

    // Safe area as a closed polygon, mapped onto the full comp. Six points
    // when the platform has an action rail, four otherwise:
    //
    //   L,T ---------------- R,T
    //    |                    |
    //    |          NR,NY --- R,NY    <- rail starts here
    //    |            |
    //   L,B -------- NR,B
    function safePolygon(comp, preset) {
        var W = comp.width;
        var H = comp.height;
        var L = (preset.left / preset.ref[0]) * W;
        var R = W - (preset.right / preset.ref[0]) * W;
        var T = (preset.top / preset.ref[1]) * H;
        var B = H - (preset.bottom / preset.ref[1]) * H;

        if (preset.rail) {
            var NR = W - (preset.rail.right / preset.ref[0]) * W;
            var NY = (preset.rail.fromY / preset.ref[1]) * H;
            if (NR < R && NY > T && NY < B) {
                return [[L, T], [R, T], [R, NY], [NR, NY], [NR, B], [L, B]];
            }
        }
        return [[L, T], [R, T], [R, B], [L, B]];
    }

    // True when the comp aspect ratio differs from the preset's by more than 1%
    function ratioMismatch(comp, preset) {
        var a = comp.width / comp.height;
        var b = preset.ref[0] / preset.ref[1];
        return Math.abs(a - b) / b > 0.01;
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
        var poly = safePolygon(comp, preset);

        var lay = comp.layers.addShape();
        lay.name = PREFIX + preset.name;
        var tr = lay.property("ADBE Transform Group");
        tr.property("ADBE Anchor Point").setValue([0, 0]);
        tr.property("ADBE Position").setValue([0, 0]);

        // Unsafe area: full-comp rect + safe polygon in the same group, with an
        // even-odd fill rule punching the safe area out of the fill.
        var root = lay.property("ADBE Root Vectors Group");
        var gFill = root.addProperty("ADBE Vector Group");
        gFill.name = "Unsafe area";
        var vFill = gFill.property("ADBE Vectors Group");
        addRectPath(vFill, [comp.width / 2, comp.height / 2], [comp.width, comp.height]);
        addPolyPath(vFill, poly);
        var fill = vFill.addProperty("ADBE Vector Graphic - Fill");
        try { fill.property("ADBE Vector Fill Rule").setValue(2); } catch (e) { }
        fill.property("ADBE Vector Fill Color").setValue(opts.fillColor);
        fill.property("ADBE Vector Fill Opacity").setValue(opts.fillOpacity);

        lay.guideLayer = true;
        lay.label = opts.labelColor;
        lay.comment = "Safe zone overlay - " + SCRIPT_NAME + " v" + VERSION;
        lay.moveToBeginning();
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

        var fillColor = hexToRGB(parseInt(getSetting("fillColor", "0"), 10));

        // --- Platform
        var grpPlat = win.add("group");
        grpPlat.alignChildren = ["left", "center"];
        var lblPlat = grpPlat.add("statictext", undefined, "Platform");
        lblPlat.preferredSize.width = 56;
        var ddPlat = grpPlat.add("dropdownlist", undefined, []);
        ddPlat.preferredSize.width = 200;

        for (var i = 0; i < SAFE_ZONES.length; i++) { ddPlat.add("item", SAFE_ZONES[i].name); }
        var lastPreset = getSetting("lastPreset", "");
        for (var j = 0; j < ddPlat.items.length; j++) {
            if (ddPlat.items[j].text === lastPreset) { ddPlat.selection = j; break; }
        }
        if (!ddPlat.selection) { ddPlat.selection = 0; }

        // --- Opacity
        var grpOpa = win.add("group");
        grpOpa.alignChildren = ["left", "center"];
        var lblOpa = grpOpa.add("statictext", undefined, "Opacity");
        lblOpa.preferredSize.width = 56;
        var sldOpa = grpOpa.add("slider", undefined, Number(getSetting("fillOpacity", "55")), 0, 100);
        sldOpa.preferredSize.width = 150;
        var txtOpa = grpOpa.add("statictext", undefined, "100%");
        txtOpa.preferredSize.width = 40;

        // --- Color
        var grpCol = win.add("group");
        grpCol.alignChildren = ["left", "center"];
        var lblCol = grpCol.add("statictext", undefined, "Color");
        lblCol.preferredSize.width = 56;
        var swFill = makeSwatchButton(grpCol, fillColor, 58, 22);

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
                fillOpacity: Math.round(sldOpa.value),
                fillColor: fillColor,
                labelColor: 11
            };
        }

        function saveOptions() {
            setSetting("fillOpacity", Math.round(sldOpa.value));
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
            var c = colorDialog(fillColor, "Overlay color");
            if (c) {
                fillColor = c;
                paintSwatch(swFill, fillColor, 58, 22);
                redraw(swFill);
                setSetting("fillColor", rgbToHex(fillColor));
                say("Color: #" + rgbToHexString(fillColor));
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
                if (ratioMismatch(comp, preset)) {
                    say(preset.name + " applied - comp is not " + preset.ref[0] + "x" + preset.ref[1] + " ratio.");
                } else {
                    say(preset.name + " applied.");
                }
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
