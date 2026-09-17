/*  QuickLabels.jsx (loader)
    A installer UNE SEULE FOIS dans le dossier "ScriptUI Panels" d'After Effects.
    Il telecharge la derniere version de QuickLabels depuis GitHub, la garde en cache
    (pour fonctionner hors ligne) puis la lance.
*/
(function (thisObj) {
    // ---------- Configuration ----------
    var TOOL   = "QuickLabels";
    var USER   = "snuupG";
    var REPO   = "ae-tools";
    var BRANCH = "main";   // mets "dev" sur ton poste pour tester avant de publier
    // -----------------------------------

    var BASE = "https://raw.githubusercontent.com/" + USER + "/" + REPO + "/" + BRANCH + "/";

    var cacheDir = new Folder(Folder.userData.fsName + "/" + USER + "_" + REPO + "/" + BRANCH);
    if (!cacheDir.exists) cacheDir.create();

    var manifestFile = new File(cacheDir.fsName + "/manifest.json");
    var toolFile     = new File(cacheDir.fsName + "/" + TOOL + ".jsx");
    var versionFile  = new File(cacheDir.fsName + "/" + TOOL + ".version");

    function readText(f) {
        if (!f.exists) return null;
        f.encoding = "UTF-8";
        f.open("r");
        var s = f.read();
        f.close();
        return s.replace(/^\uFEFF/, "");
    }

    function writeText(f, s) {
        f.encoding = "UTF-8";
        f.open("w");
        f.write(s);
        f.close();
    }

    function networkAllowed() {
        try {
            return app.preferences.getPrefAsLong("Main Pref Section", "Pref_SCRIPTING_FILE_NETWORK_SECURITY") == 1;
        } catch (e) { return true; }
    }

    // Telecharge dans un fichier temporaire, et ne remplace le cache que si tout s'est bien passe
    function download(url, dest) {
        var tmp = new File(dest.fsName + ".tmp");
        if (tmp.exists) tmp.remove();
        var cmd = 'curl -s -f -L --max-time 5 -o "' + tmp.fsName + '" "' + url + "?t=" + new Date().getTime() + '"';
        try { system.callSystem(cmd); } catch (e) { return false; }
        if (tmp.exists && tmp.length > 0) {
            if (dest.exists) dest.remove();
            return tmp.rename(dest.name);
        }
        if (tmp.exists) tmp.remove();
        return false;
    }

    // ---------- Mise a jour ----------
    if (networkAllowed()) {
        download(BASE + "manifest.json", manifestFile);

        var info = null;
        try {
            var manifest = eval("(" + readText(manifestFile) + ")");
            info = manifest.tools[TOOL];
        } catch (e) {}

        if (info) {
            var localVersion = readText(versionFile);
            if (info.version != localVersion || !toolFile.exists) {
                if (download(BASE + info.file, toolFile)) {
                    writeText(versionFile, info.version);
                    if (localVersion) {
                        alert(TOOL + " a \u00e9t\u00e9 mis \u00e0 jour en v" + info.version +
                              (info.notes ? "\n\nNouveaut\u00e9s : " + info.notes : ""));
                    }
                }
            }
        }
    } else if (!toolFile.exists) {
        alert(TOOL + " : active \"Autoriser les scripts \u00e0 \u00e9crire des fichiers et \u00e0 acc\u00e9der au r\u00e9seau\"\n" +
              "(Pr\u00e9f\u00e9rences > Scripts et expressions), puis relance After Effects.");
        return;
    }

    // ---------- Lancement ----------
    var code = readText(toolFile);
    if (!code) {
        alert(TOOL + " : impossible de charger le script (hors ligne et aucun cache).");
        return;
    }
    $.global.__aeToolsHost = thisObj;
    try {
        eval(code);
    } catch (e) {
        $.global.__aeToolsHost = undefined;
        alert(TOOL + " : erreur dans le script\n" + e.toString() + " (ligne " + e.line + ")");
    }
})(this);
