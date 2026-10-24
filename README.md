# Carnet de l'entraîneur

Application de suivi des entraînements de tir à l'arc, pour un entraîneur qui intervient dans plusieurs clubs (FFTA et UFOLEP) :
séances et pointage, suivi individuel et feuilles de marque, évaluations techniques, carnets d'entraînement des archers,
bibliothèque d'exercices, concours et résultats, matériel prêté.

## Installation sur la tablette ou l'ordinateur
Ouvre l'adresse de l'appli dans Chrome, connecte-toi, puis menu ⋮ › « Installer l'application » (ou « Ajouter à l'écran d'accueil »).
L'appli fonctionne aussi sans réseau : les modifications sont envoyées dès que la connexion revient.

## Fonctionnement
- `index.html` : l'application (même code que le carnet Claude).
- `backend.js` : données et fichiers sur Supabase, copie locale hors connexion, connexion par e-mail.
- `sw.js` : fonctionnement hors connexion et accès aux fichiers (`_blob/<id>`).
- `config.js` : adresse du projet Supabase et clé publique « anon ».

L'import des classements PDF se fait avec Claude : l'appli prépare un texte à coller dans une conversation Claude, puis on recolle la réponse.

## Reprise des données
Dans le carnet Claude : Paramètres › Données › Télécharger la sauvegarde (ZIP « Données et fichiers »).
Dans cette appli : Paramètres › Données › Restaurer une sauvegarde.
