# ae-tools

Petits scripts After Effects pour gagner du temps.

| Outil | À quoi ça sert |
|---|---|
| **SafeZones** | Affiche la safe zone d'une plateforme (TikTok, Reels, Shorts…) sur la comp active. C'est un calque guide, il ne sort pas au rendu. |
| **QuickLabels** | Applique une couleur de label en un clic (keyframes, calques ou éléments du Projet). Alt + clic sélectionne tous les calques de cette couleur. |

## Installation (une seule fois)

1. Télécharge le loader de l'outil voulu dans le dossier [`_loaders`](_loaders) (`SafeZones.jsx`, `QuickLabels.jsx`).
2. Copie-le dans le dossier **ScriptUI Panels** d'After Effects :
   - **Mac** : `Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels/`
   - **Windows** : `C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels\`
3. Dans After Effects : **Préférences > Scripts et expressions** → coche **Autoriser les scripts à écrire des fichiers et à accéder au réseau**.
4. Redémarre After Effects. L'outil apparaît dans le menu **Fenêtre**.

## Mises à jour

Automatiques. À chaque ouverture du panneau, le loader récupère la dernière version publiée ici et la garde en cache pour fonctionner hors ligne. Une alerte s'affiche quand il y a du nouveau.
