/*
    Quick Labels — panneau dockable pour After Effects
    ----------------------------------------------------
    - Clic sur une couleur      : applique le label aux keyframes sélectionnées (AE 22.6+),
                                 sinon aux calques sélectionnés,
                                 sinon aux éléments sélectionnés du panneau Projet.
    - Alt + clic sur une couleur : sélectionne tous les calques de ce label.
    - Bouton "Sel"             : sélectionne tous les calques ayant le même label
                                 que le(s) calque(s) sélectionné(s).

    Distribution : ce fichier est charge automatiquement par le loader
    _loaders/QuickLabels.jsx (repo GitHub snuupG/ae-tools).
    Pour publier une mise a jour : modifier VERSION ci-dessous + la version
    dans manifest.json, puis Commit et Push.
*/

(function QuickLabels(thisObj) {

    var SCRIPT_NAME = "Quick Labels";
    var VERSION = "1.0.0";
    var BTN = 22;

    // ------------------------------------------------------------------
    // Couleurs par défaut d'After Effects (utilisées si la lecture des prefs échoue)
    // ------------------------------------------------------------------
    var DEFAULT = [
        ["Aucun",       "555555"],
        ["Rouge",       "B53838"],
        ["Jaune",       "E4D84C"],
        ["Aqua",        "A9CBC7"],
        ["Rose",        "E5BCC9"],
        ["Lavande",     "A9A9CA"],
        ["Pêche",       "E7C19E"],
        ["Vert d'eau",  "B3C7B3"],
        ["Bleu",        "677DE0"],
        ["Vert",        "4AA44C"],
        ["Violet",      "8E2C9A"],
        ["Orange",      "E8920D"],
        ["Marron",      "7F452A"],
        ["Fuchsia",     "F46DD6"],
        ["Cyan",        "3DA2A5"],
        ["Grès",        "A89677"],
        ["Vert foncé",  "1E401E"]
    ];

    function hexToRgb(hex) {
        return [
            parseInt(hex.substr(0, 2), 16) / 255,
            parseInt(hex.substr(2, 2), 16) / 255,
            parseInt(hex.substr(4, 2), 16) / 255
        ];
    }

    // ExtendScript décode les octets bruts des prefs en Windows-1252 :
    // les octets 0x80–0x9F deviennent des caractères Unicode "hauts". On les ramène à leur octet.
    var CP1252 = {
        8364: 0x80, 8218: 0x82, 402: 0x83, 8222: 0x84, 8230: 0x85, 8224: 0x86, 8225: 0x87,
        710: 0x88, 8240: 0x89, 352: 0x8A, 8249: 0x8B, 338: 0x8C, 381: 0x8E, 8216: 0x91,
        8217: 0x92, 8220: 0x93, 8221: 0x94, 8226: 0x95, 8211: 0x96, 8212: 0x97, 732: 0x98,
        8482: 0x99, 353: 0x9A, 8250: 0x9B, 339: 0x9C, 382: 0x9E, 376: 0x9F
    };

    function charToByte(ch) {
        var c = ch.charCodeAt(0);
        if (c <= 255) return c;
        if (CP1252.hasOwnProperty(c)) return CP1252[c];
        return -1; // octet illisible
    }

    function isValidRgb(rgb) {
        for (var i = 0; i < 3; i++) {
            if (isNaN(rgb[i]) || rgb[i] < 0 || rgb[i] > 1) return false;
        }
        return true;
    }

    // Tente de lire la palette et les noms personnalisés dans les préférences
    function getLabels() {
        var labels = [];
        for (var i = 0; i <= 16; i++) {
            var name = DEFAULT[i][0];
            var rgb = hexToRgb(DEFAULT[i][1]);

            if (i > 0) {
                try {
                    var raw = app.preferences.getPrefAsString(
                        "Label Preference Color Section 5",
                        "Label Color ID 2 # " + i,
                        PREFType.PREF_Type_MACHINE_INDEPENDENT
                    );
                    raw = String(raw);
                    var parsed = null;
                    var clean = raw.replace(/"/g, "");

                    if (/^[0-9A-Fa-f]{8}$/.test(clean)) {
                        parsed = hexToRgb(clean.substr(2, 6));     // format texte AARRGGBB
                    } else if (raw.length >= 3) {
                        var s = raw.substr(raw.length - 3, 3);     // 3 derniers octets = R, G, B
                        var r = charToByte(s.charAt(0));
                        var g = charToByte(s.charAt(1));
                        var b = charToByte(s.charAt(2));
                        if (r >= 0 && g >= 0 && b >= 0) parsed = [r / 255, g / 255, b / 255];
                    }

                    if (parsed && isValidRgb(parsed)) rgb = parsed;
                } catch (e) {}

                try {
                    var n = app.preferences.getPrefAsString(
                        "Label Preference Text Section 7",
                        "Label Text ID 2 # " + i,
                        PREFType.PREF_Type_MACHINE_INDEPENDENT
                    );
                    if (n) name = String(n).replace(/"/g, "");
                } catch (e) {}
            }
            labels.push({ index: i, name: name, rgb: rgb });
        }
        return labels;
    }

    // ------------------------------------------------------------------
    // Logique
    // ------------------------------------------------------------------
    function getComp() {
        var c = app.project.activeItem;
        return (c && c instanceof CompItem) ? c : null;
    }

    function getSelectedKeys(comp) {
        var out = [];
        if (!comp) return out;
        var props = comp.selectedProperties;
        for (var i = 0; i < props.length; i++) {
            var p = props[i];
            if (p.propertyType === PropertyType.PROPERTY && p.numKeys > 0) {
                var k = p.selectedKeys;
                if (k && k.length) out.push({ prop: p, keys: k });
            }
        }
        return out;
    }

    function applyLabel(idx) {
        if (ScriptUI.environment.keyboardState.altKey) {
            selectByLabels([idx]);
            return;
        }

        var comp = getComp();
        app.beginUndoGroup(SCRIPT_NAME + " : couleur");
        try {
            var done = false;

            // 1. Keyframes
            var keySel = getSelectedKeys(comp);
            if (keySel.length && typeof keySel[0].prop.setLabelAtKey === "function") {
                for (var i = 0; i < keySel.length; i++) {
                    for (var j = 0; j < keySel[i].keys.length; j++) {
                        try { keySel[i].prop.setLabelAtKey(keySel[i].keys[j], idx); } catch (e) {}
                    }
                }
                done = true;
            }

            // 2. Calques
            if (!done && comp && comp.selectedLayers.length) {
                var layers = comp.selectedLayers;
                for (var l = 0; l < layers.length; l++) {
                    try { layers[l].label = idx; } catch (e) {}
                }
                done = true;
            }

            // 3. Éléments du panneau Projet
            if (!done) {
                var items = app.project.selection;
                for (var m = 0; m < items.length; m++) {
                    try { items[m].label = idx; } catch (e) {}
                }
            }
        } finally {
            app.endUndoGroup();
        }
    }

    function selectByLabels(labelList) {
        var comp = getComp();
        if (!comp) return;
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            var match = false;
            for (var j = 0; j < labelList.length; j++) {
                if (layer.label === labelList[j]) { match = true; break; }
            }
            try { layer.selected = match; } catch (e) {}
        }
    }

    function selectSameLabelGroup() {
        var comp = getComp();
        if (!comp || !comp.selectedLayers.length) return;
        var list = [];
        var sel = comp.selectedLayers;
        for (var i = 0; i < sel.length; i++) {
            var found = false;
            for (var j = 0; j < list.length; j++) if (list[j] === sel[i].label) found = true;
            if (!found) list.push(sel[i].label);
        }
        selectByLabels(list);
    }

    // ------------------------------------------------------------------
    // Interface
    // ------------------------------------------------------------------
    function drawSwatch() {
        var g = this.graphics;
        var w = this.size[0], h = this.size[1];

        g.newPath();
        g.rectPath(1, 1, w - 2, h - 2);
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [this.rgb[0], this.rgb[1], this.rgb[2], 1]));

        if (this.labelIndex === 0) { // croix pour "Aucun"
            var pen = g.newPen(g.PenType.SOLID_COLOR, [0.85, 0.85, 0.85, 1], 2);
            g.newPath();
            g.moveTo(6, 6);     g.lineTo(w - 6, h - 6);
            g.moveTo(w - 6, 6); g.lineTo(6, h - 6);
            g.strokePath(pen);
        }
    }

    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });

        win.orientation = "row";
        win.alignChildren = ["left", "top"];
        win.spacing = 4;
        win.margins = 4;

        var swatches = win.add("group");
        swatches.orientation = "row";
        swatches.spacing = 2;

        var labels = getLabels();
        // Ordre : couleurs 1 → 16, puis "Aucun" à la fin
        var order = [];
        for (var i = 1; i <= 16; i++) order.push(i);
        order.push(0);

        for (var k = 0; k < order.length; k++) {
            var lab = labels[order[k]];
            var b = swatches.add("button", undefined, "");
            b.preferredSize = [BTN, BTN];
            b.labelIndex = lab.index;
            b.rgb = lab.rgb;
            b.helpTip = lab.name + "\nAlt + clic : sélectionner ce groupe";
            b.onDraw = drawSwatch;
            b.onClick = function () { applyLabel(this.labelIndex); };
        }

        var selBtn = win.add("button", undefined, "Sel");
        selBtn.preferredSize = [36, BTN];
        selBtn.helpTip = "Sélectionne tous les calques ayant le même label que la sélection\n" + SCRIPT_NAME + " v" + VERSION;
        selBtn.onClick = selectSameLabelGroup;

        // Bascule horizontal / vertical selon la forme du panneau
        win.onResizing = win.onResize = function () {
            var vertical = this.size.height > this.size.width;
            this.orientation = vertical ? "column" : "row";
            swatches.orientation = vertical ? "column" : "row";
            this.layout.layout(true);
        };

        win.layout.layout(true);
        return win;
    }

    // Si on est lance par le loader, on recupere son panneau dockable
    var host = $.global.__aeToolsHost || thisObj;
    $.global.__aeToolsHost = undefined;

    var ui = buildUI(host);
    if (ui instanceof Window) {
        ui.center();
        ui.show();
    }

})(this);
