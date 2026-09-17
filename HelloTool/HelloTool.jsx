/*  HelloTool.jsx
    Le "vrai" script. C'est ce fichier que tu modifies pour faire une mise a jour.
    Pense aussi a changer le numero de version dans manifest.json.
*/
(function (thisObj) {
    var VERSION = "1.1.0";

    function buildUI(host) {
        var win = (host instanceof Panel)
            ? host
            : new Window("palette", "HelloTool", undefined, { resizeable: true });

        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.spacing = 8;
        win.margins = 10;

        win.add("statictext", undefined, "HelloTool v" + VERSION);

        // Bouton rouge
        var btn = win.add("button", undefined, "Créer un solide rouge");
        btn.onClick = function () {
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) {
                alert("Sélectionne d'abord une composition.");
                return;
            }
            app.beginUndoGroup("HelloTool");
            comp.layers.addSolid([1, 0, 0], "Hello Solid", comp.width, comp.height, comp.pixelAspect);
            app.endUndoGroup();
        };

        // Bouton bleu (v1.1.0)
        var btnBleu = win.add("button", undefined, "Créer un solide bleu");
        btnBleu.onClick = function () {
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) {
                alert("Sélectionne d'abord une composition.");
                return;
            }
            app.beginUndoGroup("HelloTool bleu");
            comp.layers.addSolid([0, 0.4, 1], "Hello Blue", comp.width, comp.height, comp.pixelAspect);
            app.endUndoGroup();
        };

        win.onResizing = win.onResize = function () { this.layout.resize(); };
        win.layout.layout(true);
        return win;
    }

    // Si on est lance par le loader, on recupere son panneau dockable
    var host = $.global.__aeToolsHost || thisObj;
    $.global.__aeToolsHost = undefined;

    var ui = buildUI(host);
    if (ui instanceof Window) { ui.center(); ui.show(); }
})(this);
