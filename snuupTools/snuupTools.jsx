/*
    snuupTools — petit panneau dockable pour After Effects
    -------------------------------------------------------
    Une rangée de boutons-icônes, responsive (ligne, colonne ou grille selon
    la forme du panneau) :

      Purge     : vide tous les caches mémoire (image, annulation, instantanés).
      Rendu     : ajoute à la file de rendu les compos sélectionnées dans le
                  panneau Projet, sinon la compo active.
      Scale     : Bake Group Scale -> Size sur les calques de forme sélectionnés.
      Repères   : menu pour poser des repères sur le centre ou les bords des
                  calques sélectionnés.
      Null      : crée un null parent pour les calques sélectionnés.
                    clic              -> null au centre de la sélection
                    Shift + clic      -> null au centre de la compo
                    Cmd/Ctrl + clic   -> un null au point d'ancrage de chaque
                                         calque (sans parentage)
                    Cmd/Ctrl + Shift  -> chaque calque parenté à son propre null
                    Alt + clic        -> options

    Distribution : ce fichier est chargé automatiquement par le loader
    _loaders/snuupTools.jsx (repo GitHub snuupG/ae-tools).
    Pour publier une mise à jour : modifier VERSION ci-dessous + la version
    dans manifest.json, puis Commit et Push.
*/

(function snuupTools(thisObj) {

    var SCRIPT_NAME = "snuupTools";
    var VERSION = "1.0";
    var SETTINGS_SECTION = "snuupTools";

    var BTN = 30;      // taille d'un bouton
    var ICON = 16;     // taille de l'icône dans le bouton
    var GAP = 3;       // espace entre les boutons
    var MARGIN = 4;    // marge autour du panneau

    var ORANGE = [0xEE / 255, 0x73 / 255, 0x23 / 255, 1];   // #EE7323
    var BG = [0.16, 0.16, 0.16, 1];
    var DARK = [0.12, 0.12, 0.12, 1];

    // ------------------------------------------------------------------
    // Utilitaires
    // ------------------------------------------------------------------
    function getSetting(key, def) {
        try {
            if (app.settings.haveSetting(SETTINGS_SECTION, key)) {
                return app.settings.getSetting(SETTINGS_SECTION, key);
            }
        } catch (e) {}
        return def;
    }

    function setSetting(key, val) {
        try { app.settings.saveSetting(SETTINGS_SECTION, key, String(val)); } catch (e) {}
    }

    function getComp() {
        var c = app.project ? app.project.activeItem : null;
        return (c && c instanceof CompItem) ? c : null;
    }

    function keys() {
        var k = ScriptUI.environment.keyboardState;
        return { shift: k.shiftKey, cmd: k.ctrlKey || k.metaKey, alt: k.altKey };
    }

    // Point de l'espace d'un calque -> espace de la compo (2D : ancre, échelle,
    // rotation Z, position, puis toute la chaîne de parents).
    function layerToComp(layer, pt, t) {
        var tr = layer.property("ADBE Transform Group");
        var a = tr.property("ADBE Anchor Point").valueAtTime(t, false);
        var s = tr.property("ADBE Scale").valueAtTime(t, false);
        var p = tr.property("ADBE Position").valueAtTime(t, false);
        var r = 0;
        try { r = tr.property("ADBE Rotate Z").valueAtTime(t, false) * Math.PI / 180; } catch (e) {}
        var x = (pt[0] - a[0]) * s[0] / 100;
        var y = (pt[1] - a[1]) * s[1] / 100;
        var X = x * Math.cos(r) - y * Math.sin(r) + p[0];
        var Y = x * Math.sin(r) + y * Math.cos(r) + p[1];
        return layer.parent ? layerToComp(layer.parent, [X, Y], t) : [X, Y];
    }

    // Calques sélectionnés qui ont un contenu (pas les caméras / lumières)
    function visualLayers(comp) {
        var out = [];
        var sel = comp.selectedLayers;
        for (var i = 0; i < sel.length; i++) {
            if (typeof sel[i].sourceRectAtTime === "function") out.push(sel[i]);
        }
        return out;
    }

    // Boîte englobante (espace compo) des calques donnés au temps courant
    function selectionBounds(comp, layers) {
        var t = comp.time;
        var b = null;
        for (var i = 0; i < layers.length; i++) {
            var rc = layers[i].sourceRectAtTime(t, false);
            var corners = [
                [rc.left, rc.top], [rc.left + rc.width, rc.top],
                [rc.left + rc.width, rc.top + rc.height], [rc.left, rc.top + rc.height]
            ];
            for (var c = 0; c < 4; c++) {
                var q = layerToComp(layers[i], corners[c], t);
                if (!b) { b = { l: q[0], r: q[0], t: q[1], b: q[1] }; continue; }
                if (q[0] < b.l) b.l = q[0];
                if (q[0] > b.r) b.r = q[0];
                if (q[1] < b.t) b.t = q[1];
                if (q[1] > b.b) b.b = q[1];
            }
        }
        return b;
    }

    // ------------------------------------------------------------------
    // 1. Purge
    // ------------------------------------------------------------------
    function purgeCache() {
        try {
            app.purge(PurgeTarget.ALL_CACHES);
        } catch (e) {
            alert(SCRIPT_NAME + " : impossible de purger le cache.\n" + e.toString());
        }
    }

    // ------------------------------------------------------------------
    // 2. File de rendu
    // ------------------------------------------------------------------
    function addToRenderQueue() {
        var comps = [];
        var sel = app.project.selection;
        for (var i = 0; i < sel.length; i++) {
            if (sel[i] instanceof CompItem) comps.push(sel[i]);
        }
        if (!comps.length) {
            var c = getComp();
            if (c) comps.push(c);
        }
        if (!comps.length) {
            alert("Sélectionne une ou plusieurs compos dans le panneau Projet, ou ouvre une compo.");
            return;
        }
        app.beginUndoGroup(SCRIPT_NAME + " : file de rendu");
        try {
            for (var j = 0; j < comps.length; j++) app.project.renderQueue.items.add(comps[j]);
        } finally {
            app.endUndoGroup();
        }
        try { app.project.renderQueue.showWindow(true); } catch (e) {}
    }

    // ------------------------------------------------------------------
    // 3. Bake Group Scale -> Size
    //    Pour chaque calque de forme sélectionné, reporte le Scale des groupes
    //    dans le Size / Position des Rectangle et Ellipse Paths (et les points
    //    de dégradé), puis remet le Scale du groupe à 100 %. La Roundness n'est
    //    pas touchée. Scale animé -> clés de Size aux mêmes temps et easing.
    //    Non gérés (groupe ignoré et listé) : groupes imbriqués dans un groupe
    //    scalé, Bezier Paths, Polystar, Repeater, Round Corners, expressions,
    //    scale négatif.
    // ------------------------------------------------------------------
    var BAKE_DUPLICATE = true;      // true : corrige une copie et désactive l'original
    var BAKE_SCALE_STROKES = false; // false : épaisseur de contour conservée

    var BAKE_ALLOWED = {
        "ADBE Vector Shape - Rect": true,
        "ADBE Vector Shape - Ellipse": true,
        "ADBE Vector Graphic - Fill": true,
        "ADBE Vector Graphic - Stroke": true,
        "ADBE Vector Graphic - G-Fill": true,
        "ADBE Vector Graphic - G-Stroke": true,
        "ADBE Vector Filter - Trim": true,
        "ADBE Vector Filter - Merge": true
    };

    function bakeGroupScale() {
        var comp = getComp();
        if (!comp) { alert("Ouvre une compo et sélectionne un ou plusieurs calques de forme."); return; }
        var sel = comp.selectedLayers;
        var shapes = [];
        for (var i = 0; i < sel.length; i++) {
            if (sel[i] instanceof ShapeLayer) shapes.push(sel[i]);
        }
        if (!shapes.length) { alert("Aucun calque de forme sélectionné."); return; }

        var report = [];
        var problems = 0;

        function hasExpr(p) {
            return p.canSetExpression && p.expressionEnabled && p.expression !== "";
        }

        function skip(msg) { report.push(msg); problems++; }

        function walk(contents, path) {
            for (var i = 1; i <= contents.numProperties; i++) {
                var p = contents.property(i);
                if (p.matchName === "ADBE Vector Group") {
                    var label = path + " > " + p.name;
                    walk(p.property("ADBE Vectors Group"), label);
                    processGroup(p, label);
                }
            }
        }

        function processGroup(g, label) {
            var tr = g.property("ADBE Vector Transform Group");
            var sc = tr.property("ADBE Vector Scale");
            var an = tr.property("ADBE Vector Anchor");

            var animated = sc.numKeys > 0;
            if (!animated && sc.value[0] === 100 && sc.value[1] === 100) return;

            if (hasExpr(sc)) { skip(label + " : Scale avec expression -> ignoré"); return; }
            if (an.numKeys > 0 || hasExpr(an)) { skip(label + " : Anchor Point animé -> ignoré"); return; }

            var scaleVals = [];
            if (animated) { for (var k = 1; k <= sc.numKeys; k++) scaleVals.push(sc.keyValue(k)); }
            else scaleVals.push(sc.value);
            for (var s = 0; s < scaleVals.length; s++) {
                if (scaleVals[s][0] <= 0 || scaleVals[s][1] <= 0) {
                    skip(label + " : Scale négatif ou nul (flip) -> ignoré");
                    return;
                }
            }

            var a = an.value;
            var items = g.property("ADBE Vectors Group");
            var targets = [];

            for (var i = 1; i <= items.numProperties; i++) {
                var it = items.property(i);
                var m = it.matchName;
                if (!BAKE_ALLOWED[m]) {
                    skip(label + " : contient \"" + it.name + "\" (non géré) -> ignoré");
                    return;
                }
                if (m === "ADBE Vector Shape - Rect") {
                    targets.push({ p: it.property("ADBE Vector Rect Size"), k: "size" });
                    targets.push({ p: it.property("ADBE Vector Rect Position"), k: "pos" });
                } else if (m === "ADBE Vector Shape - Ellipse") {
                    targets.push({ p: it.property("ADBE Vector Ellipse Size"), k: "size" });
                    targets.push({ p: it.property("ADBE Vector Ellipse Position"), k: "pos" });
                } else if (m === "ADBE Vector Graphic - G-Fill" || m === "ADBE Vector Graphic - G-Stroke") {
                    targets.push({ p: it.property("ADBE Vector Grad Start Pt"), k: "pos" });
                    targets.push({ p: it.property("ADBE Vector Grad End Pt"), k: "pos" });
                }
                if (BAKE_SCALE_STROKES && (m === "ADBE Vector Graphic - Stroke" || m === "ADBE Vector Graphic - G-Stroke")) {
                    targets.push({ p: it.property("ADBE Vector Stroke Width"), k: "width" });
                }
            }

            for (var t = 0; t < targets.length; t++) {
                if (hasExpr(targets[t].p)) {
                    skip(label + " : expression sur " + targets[t].p.name + " -> ignoré");
                    return;
                }
                if (animated && targets[t].p.numKeys > 0) {
                    skip(label + " : Scale ET " + targets[t].p.name + " animés -> ignoré");
                    return;
                }
            }

            for (var u = 0; u < targets.length; u++) bake(targets[u], sc, a);

            while (sc.numKeys > 0) sc.removeKey(sc.numKeys);
            sc.setValue([100, 100]);
            report.push(label + " : OK" + (animated ? " (scale animé converti)" : ""));
        }

        function mapVal(kind, v, s, a) {
            if (kind === "size") return [v[0] * s[0], v[1] * s[1]];
            if (kind === "pos") return [a[0] + (v[0] - a[0]) * s[0], a[1] + (v[1] - a[1]) * s[1]];
            return v * Math.sqrt(s[0] * s[1]); // width
        }

        function bake(t, sc, a) {
            var p = t.p, k, s;

            if (sc.numKeys === 0) {
                s = [sc.value[0] / 100, sc.value[1] / 100];
                if (p.numKeys === 0) {
                    p.setValue(mapVal(t.k, p.value, s, a));
                } else {
                    for (k = 1; k <= p.numKeys; k++) {
                        p.setValueAtKey(k, mapVal(t.k, p.keyValue(k), s, a));
                        if (p.isSpatial) {
                            try {
                                var ti = p.keyInSpatialTangent(k), to = p.keyOutSpatialTangent(k);
                                p.setSpatialTangentsAtKey(k,
                                    [ti[0] * s[0], ti[1] * s[1]],
                                    [to[0] * s[0], to[1] * s[1]]);
                            } catch (e) {}
                        }
                    }
                }
                return;
            }

            // Scale animé, propriété statique : une clé par clé de Scale
            var base = p.value;
            if (t.k === "pos" && base[0] === a[0] && base[1] === a[1]) return; // centré sur l'ancre

            for (k = 1; k <= sc.numKeys; k++) {
                var sv = sc.keyValue(k);
                s = [sv[0] / 100, sv[1] / 100];
                var idx = p.addKey(sc.keyTime(k));
                p.setValueAtKey(idx, mapVal(t.k, base, s, a));
            }
            for (k = 1; k <= sc.numKeys; k++) {
                var id = p.nearestKeyIndex(sc.keyTime(k));
                try { p.setInterpolationTypeAtKey(id, sc.keyInInterpolationType(k), sc.keyOutInterpolationType(k)); } catch (e1) {}
                try {
                    p.setTemporalEaseAtKey(id,
                        convEase(sc.keyInTemporalEase(k), t.k, base, a, p),
                        convEase(sc.keyOutTemporalEase(k), t.k, base, a, p));
                } catch (e2) {}
                if (p.isSpatial) {
                    try {
                        p.setSpatialAutoBezierAtKey(id, false);
                        p.setSpatialTangentsAtKey(id, [0, 0], [0, 0]);
                    } catch (e3) {}
                }
            }
        }

        // Convertit l'easing du Scale (en %/s) en easing de la propriété cible
        function convEase(src, kind, base, a, p) {
            function e(d) { return src[Math.min(d, src.length - 1)]; }
            var out = [];
            if (kind === "size") {
                for (var d = 0; d < 2; d++) out.push(new KeyframeEase(e(d).speed * base[d] / 100, e(d).influence));
            } else if (kind === "pos") {
                var vx = e(0).speed * (base[0] - a[0]) / 100;
                var vy = e(1).speed * (base[1] - a[1]) / 100;
                if (p.isSpatial) {
                    out.push(new KeyframeEase(Math.sqrt(vx * vx + vy * vy), e(0).influence));
                } else {
                    out.push(new KeyframeEase(vx, e(0).influence));
                    out.push(new KeyframeEase(vy, e(1).influence));
                }
            } else {
                out.push(new KeyframeEase(e(0).speed * base / 100, e(0).influence));
            }
            return out;
        }

        app.beginUndoGroup(SCRIPT_NAME + " : Bake Group Scale");
        try {
            for (var j = 0; j < shapes.length; j++) {
                var target = shapes[j];
                if (BAKE_DUPLICATE) {
                    target = shapes[j].duplicate();
                    target.name = shapes[j].name + " FIX";
                    shapes[j].enabled = false;
                }
                walk(target.property("ADBE Root Vectors Group"), target.name);
            }
        } finally {
            app.endUndoGroup();
        }

        // Silencieux si tout s'est bien passé, sinon on affiche le détail
        if (!report.length) alert("Aucun groupe avec un Scale différent de 100 % trouvé.");
        else if (problems) alert(report.join("\n"));
    }

    // ------------------------------------------------------------------
    // 4. Repères
    // ------------------------------------------------------------------
    var GUIDE_ACTIONS = [
        { label: "Centre",          h: ["cy"],       v: ["cx"] },
        { label: "Haut",            h: ["t"],        v: [] },
        { label: "Bas",             h: ["b"],        v: [] },
        { label: "Gauche",          h: [],           v: ["l"] },
        { label: "Droite",          h: [],           v: ["r"] },
        { label: "Contour",         h: ["t", "b"],   v: ["l", "r"] },
        { label: "Contour + centre", h: ["t", "cy", "b"], v: ["l", "cx", "r"] }
    ];

    function placeGuides(action) {
        var comp = getComp();
        if (!comp) { alert("Ouvre une compo."); return; }
        if (typeof comp.addGuide !== "function") { alert("Les repères par script demandent After Effects 2019 (16.1) ou plus récent."); return; }
        var layers = visualLayers(comp);
        if (!layers.length) { alert("Sélectionne un ou plusieurs calques."); return; }

        var b = selectionBounds(comp, layers);
        var at = { t: b.t, b: b.b, l: b.l, r: b.r, cx: (b.l + b.r) / 2, cy: (b.t + b.b) / 2 };

        app.beginUndoGroup(SCRIPT_NAME + " : repères");
        try {
            var i;
            for (i = 0; i < action.h.length; i++) comp.addGuide(0, at[action.h[i]]); // 0 = horizontal
            for (i = 0; i < action.v.length; i++) comp.addGuide(1, at[action.v[i]]); // 1 = vertical
        } finally {
            app.endUndoGroup();
        }
    }

    function clearGuides() {
        var comp = getComp();
        if (!comp) { alert("Ouvre une compo."); return; }
        if (typeof comp.removeGuide !== "function") return;
        app.beginUndoGroup(SCRIPT_NAME + " : effacer les repères");
        try {
            for (var i = comp.guides.length - 1; i >= 0; i--) comp.removeGuide(i);
        } finally {
            app.endUndoGroup();
        }
    }

    function guidesMenu() {
        var d = new Window("dialog", "Repères");
        d.orientation = "column";
        d.alignChildren = ["fill", "top"];
        d.margins = 10;
        d.spacing = 4;

        // L'action est lancée après la fermeture de la fenêtre
        var chosen = null;
        function addItem(text, fn) {
            var b = d.add("button", undefined, text);
            b.onClick = function () { chosen = fn; d.close(); };
        }

        for (var i = 0; i < GUIDE_ACTIONS.length; i++) {
            (function (a) { addItem(a.label, function () { placeGuides(a); }); })(GUIDE_ACTIONS[i]);
        }
        d.add("panel").preferredSize.height = 1; // séparateur
        addItem("Effacer tous les repères", clearGuides);
        var cancel = d.add("button", undefined, "Annuler", { name: "cancel" });
        cancel.onClick = function () { d.close(); };

        d.show();
        if (chosen) chosen();
    }

    // ------------------------------------------------------------------
    // 5. Null
    // ------------------------------------------------------------------
    var LABEL_NAMES = [
        "Aucun", "Rouge", "Jaune", "Aqua", "Rose", "Lavande", "Pêche", "Vert d'eau",
        "Bleu", "Vert", "Violet", "Orange", "Marron", "Fuchsia", "Cyan", "Grès", "Vert foncé"
    ];

    function nullOptions() {
        return {
            askName: getSetting("nullAskName", "1") === "1",
            shape: getSetting("nullShape", "0") === "1",
            labelFromSel: getSetting("nullLabelFromSel", "1") === "1",
            label: parseInt(getSetting("nullLabel", "1"), 10) || 0,
            centerAnchor: getSetting("nullCenterAnchor", "1") === "1"
        };
    }

    function nullOptionsDialog() {
        var o = nullOptions();
        var d = new Window("dialog", "Null - options");
        d.orientation = "column";
        d.alignChildren = ["fill", "top"];
        d.margins = 12;
        d.spacing = 8;

        var cbAsk = d.add("checkbox", undefined, "Demander un nom (plusieurs calques)");
        cbAsk.value = o.askName;

        var gType = d.add("group");
        gType.add("statictext", undefined, "Type :");
        var ddType = gType.add("dropdownlist", undefined, ["Calque Null", "Calque de forme"]);
        ddType.selection = o.shape ? 1 : 0;

        var gLab = d.add("group");
        gLab.add("statictext", undefined, "Label :");
        var ddLab = gLab.add("dropdownlist", undefined, ["Depuis les calques", "Couleur fixe"]);
        ddLab.selection = o.labelFromSel ? 0 : 1;
        var ddCol = gLab.add("dropdownlist", undefined, LABEL_NAMES);
        ddCol.selection = o.label;
        ddCol.enabled = !o.labelFromSel;
        ddLab.onChange = function () { ddCol.enabled = ddLab.selection.index === 1; };

        var cbCenter = d.add("checkbox", undefined, "Point d'ancrage au centre du null");
        cbCenter.value = o.centerAnchor;

        var gBtn = d.add("group");
        gBtn.alignment = "right";
        gBtn.add("button", undefined, "Annuler", { name: "cancel" });
        var ok = gBtn.add("button", undefined, "OK", { name: "ok" });
        ok.onClick = function () {
            setSetting("nullAskName", cbAsk.value ? "1" : "0");
            setSetting("nullShape", ddType.selection.index === 1 ? "1" : "0");
            setSetting("nullLabelFromSel", ddLab.selection.index === 0 ? "1" : "0");
            setSetting("nullLabel", ddCol.selection.index);
            setSetting("nullCenterAnchor", cbCenter.value ? "1" : "0");
            d.close();
        };
        d.show();
    }

    function mostCommonLabel(layers) {
        var count = {};
        var best = layers[0].label, bestN = 0;
        for (var i = 0; i < layers.length; i++) {
            var l = layers[i].label;
            count[l] = (count[l] || 0) + 1;
            if (count[l] > bestN) { best = l; bestN = count[l]; }
        }
        return best;
    }

    function isIn(arr, x) {
        for (var i = 0; i < arr.length; i++) if (arr[i] === x) return true;
        return false;
    }

    // Crée un null (ou un calque de forme guide) à la position donnée, aligné
    // en durée et en label sur les calques de référence, placé au-dessus d'eux.
    function makeNull(comp, name, pos, refs, o) {
        var n, anchor;
        if (o.shape) {
            n = comp.layers.addShape();
            var grp = n.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
            grp.name = "Null";
            var rect = grp.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
            rect.property("ADBE Vector Rect Size").setValue([100, 100]);
            n.property("ADBE Transform Group").property("ADBE Opacity").setValue(0);
            n.guideLayer = true;
            anchor = o.centerAnchor ? [0, 0] : [-50, -50];
        } else {
            n = comp.layers.addNull();
            anchor = o.centerAnchor ? [50, 50] : [0, 0];
        }
        n.name = name;

        var is3D = false;
        var inP = null, outP = null, top = null;
        for (var i = 0; i < refs.length; i++) {
            if (refs[i].threeDLayer) is3D = true;
            if (inP === null || refs[i].inPoint < inP) inP = refs[i].inPoint;
            if (outP === null || refs[i].outPoint > outP) outP = refs[i].outPoint;
            if (top === null || refs[i].index < top.index) top = refs[i];
        }
        if (is3D) n.threeDLayer = true;

        var tr = n.property("ADBE Transform Group");
        tr.property("ADBE Anchor Point").setValue(is3D ? [anchor[0], anchor[1], 0] : anchor);
        tr.property("ADBE Position").setValue(is3D ? [pos[0], pos[1], 0] : pos);

        if (refs.length) {
            try { n.inPoint = inP; n.outPoint = outP; } catch (e) {}
            n.moveBefore(top);
            n.label = o.labelFromSel ? mostCommonLabel(refs) : o.label;
        } else {
            n.label = o.labelFromSel ? n.label : o.label;
        }
        return n;
    }

    function createNull() {
        var k = keys();
        if (k.alt) { nullOptionsDialog(); return; }

        var comp = getComp();
        if (!comp) { alert("Ouvre une compo."); return; }
        var o = nullOptions();
        var sel = comp.selectedLayers;
        var t = comp.time;
        var i, n;

        // Un null par calque (Cmd/Ctrl, + Shift pour parenter)
        if (k.cmd) {
            if (!sel.length) { alert("Sélectionne un ou plusieurs calques."); return; }
            app.beginUndoGroup(SCRIPT_NAME + (k.shift ? " : un null par calque" : " : null au point d'ancrage"));
            try {
                for (i = 0; i < sel.length; i++) {
                    var lay = sel[i];
                    var a = lay.property("ADBE Transform Group").property("ADBE Anchor Point").valueAtTime(t, false);
                    n = makeNull(comp, lay.name + " Null", layerToComp(lay, a, t), [lay], o);
                    if (lay.parent) n.parent = lay.parent;
                    if (k.shift) lay.parent = n;
                }
            } finally {
                app.endUndoGroup();
            }
            return;
        }

        // Un seul null pour toute la sélection
        var name = "Null";
        if (sel.length === 1) {
            name = sel[0].name + " Null";
        } else if (sel.length > 1 && o.askName) {
            var answer = prompt("Que regroupes-tu ?", "Mes calques", "Nouveau null");
            if (answer === null) return;
            name = answer + " Null";
        }

        var pos;
        if (k.shift || !sel.length) {
            pos = [comp.width / 2, comp.height / 2];
        } else {
            var sx = 0, sy = 0;
            for (i = 0; i < sel.length; i++) {
                var anc = sel[i].property("ADBE Transform Group").property("ADBE Anchor Point").valueAtTime(t, false);
                var q = layerToComp(sel[i], anc, t);
                sx += q[0];
                sy += q[1];
            }
            pos = [sx / sel.length, sy / sel.length];
        }

        app.beginUndoGroup(SCRIPT_NAME + " : null");
        try {
            n = makeNull(comp, name, pos, sel, o);

            // On ne re-parente que les calques dont le parent n'est pas lui-même
            // sélectionné, pour garder la hiérarchie existante.
            var roots = [];
            for (i = 0; i < sel.length; i++) {
                if (!sel[i].parent || !isIn(sel, sel[i].parent)) roots.push(sel[i]);
            }

            // Si toutes ces racines ont le même parent, le null le prend aussi
            var shared = roots.length ? roots[0].parent : null;
            for (i = 1; i < roots.length; i++) {
                if (roots[i].parent !== shared) { shared = null; break; }
            }
            if (shared) n.parent = shared;

            for (i = 0; i < roots.length; i++) roots[i].parent = n;
        } finally {
            app.endUndoGroup();
        }
    }

    // ------------------------------------------------------------------
    // Icônes (dessinées dans une boîte 16 x 16)
    // ------------------------------------------------------------------
    function poly(g, ox, oy, pts) {
        g.moveTo(ox + pts[0][0], oy + pts[0][1]);
        for (var i = 1; i < pts.length; i++) g.lineTo(ox + pts[i][0], oy + pts[i][1]);
    }

    var ICONS = {
        purge: function (g, ox, oy) {          // poubelle
            poly(g, ox, oy, [[1.5, 4], [14.5, 4]]);
            poly(g, ox, oy, [[6, 4], [6, 1.5], [10, 1.5], [10, 4]]);
            poly(g, ox, oy, [[3.5, 4], [4.5, 15], [11.5, 15], [12.5, 4]]);
            poly(g, ox, oy, [[6.5, 7], [6.5, 12.5]]);
            poly(g, ox, oy, [[9.5, 7], [9.5, 12.5]]);
        },
        render: function (g, ox, oy) {         // export : bac + flèche
            poly(g, ox, oy, [[1.5, 9.5], [1.5, 14.5], [14.5, 14.5], [14.5, 9.5]]);
            poly(g, ox, oy, [[8, 11], [8, 1.5]]);
            poly(g, ox, oy, [[4.5, 5], [8, 1.5], [11.5, 5]]);
        },
        scale: function (g, ox, oy) {          // petit carré + flèche diagonale
            poly(g, ox, oy, [[1.5, 9.5], [6.5, 9.5], [6.5, 14.5], [1.5, 14.5], [1.5, 9.5]]);
            poly(g, ox, oy, [[1.5, 6.5], [1.5, 1.5], [14.5, 1.5], [14.5, 14.5], [9.5, 14.5]]);
            poly(g, ox, oy, [[6.5, 9.5], [11.5, 4.5]]);
            poly(g, ox, oy, [[8, 4.5], [11.5, 4.5], [11.5, 8]]);
        },
        guides: function (g, ox, oy) {         // calque + repères en croix
            poly(g, ox, oy, [[4, 4], [12, 4], [12, 12], [4, 12], [4, 4]]);
            poly(g, ox, oy, [[0.5, 8], [15.5, 8]]);
            poly(g, ox, oy, [[8, 0.5], [8, 15.5]]);
        },
        nul: function (g, ox, oy) {            // carré de null
            poly(g, ox, oy, [[2, 2], [14, 2], [14, 14], [2, 14], [2, 2]]);
            poly(g, ox, oy, [[8, 5.5], [8, 10.5]]);
            poly(g, ox, oy, [[5.5, 8], [10.5, 8]]);
        }
    };

    function drawButton(state) {
        var g = this.graphics;
        var w = this.size[0], h = this.size[1];
        var hot = state && (state.mouseOver || state.leftButtonPressed);

        g.newPath();
        g.rectPath(0, 0, w, h);
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, hot ? ORANGE : BG));

        g.newPath();
        ICONS[this.iconName](g, Math.round((w - ICON) / 2), Math.round((h - ICON) / 2));
        g.strokePath(g.newPen(g.PenType.SOLID_COLOR, hot ? DARK : ORANGE, 1.5));
    }

    // ------------------------------------------------------------------
    // Interface
    // ------------------------------------------------------------------
    var BUTTONS = [
        { icon: "purge",  fn: purgeCache,
          tip: "Purger le cache (toute la mémoire)" },
        { icon: "render", fn: addToRenderQueue,
          tip: "Ajouter à la file de rendu\n(compos sélectionnées dans le Projet, sinon la compo active)" },
        { icon: "scale",  fn: bakeGroupScale,
          tip: "Bake Group Scale -> Size\n(calques de forme sélectionnés)" },
        { icon: "guides", fn: guidesMenu,
          tip: "Repères sur les calques sélectionnés\n(centre, haut, bas, côtés...)" },
        { icon: "nul",    fn: createNull,
          tip: "Null parent pour la sélection\n" +
               "Shift : null au centre de la compo\n" +
               "Cmd/Ctrl : un null au point d'ancrage de chaque calque\n" +
               "Cmd/Ctrl + Shift : chaque calque parenté à son propre null\n" +
               "Alt : options" }
    ];

    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });

        win.orientation = "row";
        win.alignChildren = ["left", "top"];
        win.spacing = GAP;
        win.margins = MARGIN;

        var cells = [];
        for (var i = 0; i < BUTTONS.length; i++) {
            var def = BUTTONS[i];
            var b = win.add("button", undefined, "");
            b.preferredSize = [BTN, BTN];
            b.iconName = def.icon;
            b.snAction = def.fn;
            b.helpTip = def.tip + "\n\n" + SCRIPT_NAME + " v" + VERSION;
            b.onDraw = drawButton;
            b.onClick = function () {
                try { this.snAction(); }
                catch (e) { alert(SCRIPT_NAME + " : " + e.toString() + " (ligne " + e.line + ")"); }
            };
            cells.push(b);
        }

        // Disposition responsive : on remplit chaque ligne jusqu'à la largeur
        // du panneau, puis on passe à la ligne suivante.
        function reflow() {
            var W = win.size ? win.size.width : 0;
            var x = MARGIN, y = MARGIN;
            for (var c = 0; c < cells.length; c++) {
                if (x > MARGIN && x + BTN > W - MARGIN) {
                    x = MARGIN;
                    y += BTN + GAP;
                }
                cells[c].size = [BTN, BTN];
                cells[c].location = [x, y];
                x += BTN + GAP;
            }
        }

        // Le layout automatique de ScriptUI peut se relancer tout seul (dock,
        // changement d'espace de travail) : on repasse derrière à chaque fois.
        try {
            var lm = win.layout;
            var autoLayout = lm.layout;
            lm.layout = function (recalc) {
                autoLayout.call(lm, recalc);
                reflow();
            };
        } catch (e) {}

        win.onResizing = win.onResize = reflow;

        win.layout.layout(true);
        return win;
    }

    // Si on est lancé par le loader, on récupère son panneau dockable
    var host = $.global.__aeToolsHost || thisObj;
    $.global.__aeToolsHost = undefined;

    var ui = buildUI(host);
    if (ui instanceof Window) {
        ui.center();
        ui.show();
    }

})(this);
