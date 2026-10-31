# Monstro Party — version 2

Jeu de plateau et de mini-jeux en ligne, de 2 à 8 joueurs, dans le navigateur (PC ou téléphone).

## L'univers
L'archipel de Monstralia. 12 Monstros originaux, chacun avec son histoire, s'affrontent pour devenir la Superstar.
4 régions, chacune avec son boss, sa monnaie, son étoile et sa case spéciale :

| Plateau | Boss | Monnaie | Étoile | Particularité |
|---|---|---|---|---|
| Vallée Jurassique | Magmator | 🦴 os | 🥚 Œuf d'or (20) | 🌋 Éruption, ☄️ pluie de météores |
| Île aux Pirates | Capitaine Calamarde | 🪙 doublons | 🦪 Perle (prix de 10 à 30) | 💣 Canon, ⚔️ abordage |
| Méga City | Docteur Chaos | 💠 crédits | 🏅 Médaille (2 en jeu) | ⚡ Super-vitesse, 🔌 panne de courant |
| Mine Profonde | La Reine Taupe | 🔶 pépites | 💎 Cristal (1 fois sur 4 : Cristal géant = 2) | 🕳️ passages secrets, 🪨 éboulement, 🛤️ wagon fou |

## Options de partie (choisies par l'hôte)
- Taille du plateau : petit (30 cases), moyen (50 cases), grand (80 cases, deux zones reliées par des ponts).
- Étages : un niveau supérieur, relié par des escaliers (plateaux moyen et grand).
- Nombre de tours : 5 à 25.
- Pouvoirs spéciaux : désactivés, au choix ou aléatoires (10 pouvoirs indépendants du Monstro).
- Événements aléatoires : oui ou non.
- Étoiles bonus à la fin : 3 tirées au hasard parmi 12, ou aucune.
- Jeux d'argent : oui ou non (casino, paris sur les mini-jeux, tickets à gratter).
- Boosters de cartes : oui ou non.

## Règles
- À chaque tour : utiliser un objet (facultatif), puis choisir son dé : normal (1-10), prudent (3-6), risqué (1-3 ou 12-16). Le dernier du classement a aussi le dé revanche (5-12).
- Cases : bleue, rouge, ❓ événement, 🎁 objet, 🛒 boutique, 🪺 nid à compagnon, 🎲 Chance, 🌀 Chamboulement, case du boss.
- Les cases 🎲 Chance et 🌀 Chamboulement peuvent tout renverser (transfert d'étoile, partage des pièces, positions mélangées…).
- Les 3 derniers tours : la roue de la Dernière ligne droite aide le dernier, et les cases comptent double.
- Objets (3 maximum) : double dé, triple dé, dé pipé, grappin, échangeur, bouclier, piège, boussole d'étoile, fantôme voleur, boîte mystère.
- Compagnons (1 à la fois) : Piou, Chauvy, Tortulle, Rouxi, Bzz, Draki, Hibou, Poulpi.

## Jeux d'argent (avec la monnaie du jeu)
- 🎰 Case Casino : machine à sous (×2, ×5, 777 = ×10), roulette (rouge/noir ×2, vert ×14), pile ou face (×2). Mise de 5, 10 ou 20.
- 💸 Paris avant chaque mini-jeu : 5 ou 10 sur un joueur (×3) ou une équipe / la réussite (×2).
- 🎟️ Ticket à gratter (boutique) : de 0 à 50 pièces.
- Étoiles bonus Flambeur (le plus misé) et Veinard (le plus gagné au jeu).

## Boosters et cartes
- Un booster contient 3 cartes. On l'obtient à la boutique (6 pièces), en gagnant un mini-jeu chacun pour soi, ou parfois sur une case 🎁.
- 30 cartes : 20 communes (les 12 Monstros, les 4 boss, les 4 régions) pour la collection, sans effet.
- Rares (25 %) : Petite bourse (+5), Trouvaille (objet), Élan (+2 au prochain dé), Assurance (bouclier).
- Épiques (10 %) : Grosse bourse (+12), Ami fidèle (compagnon), Turbo (+5 au prochain dé), Raton voleur (6 pièces au premier).
- Légendaires (3 %) : Étoile filante (+1 étoile), Trésor de Monstralia (+25).
- Album 🃏 consultable pendant la partie, et étoile bonus « Collectionneur » possible à la fin.

## 13 mini-jeux
Chacun pour soi, équipes (bleu contre rouge selon la dernière case), un contre tous, et coopération :
Dégaine !, Gâteau Turbo, Chrono Parfait, Compte-les !, Les Coffres, Monstro Kart, Ballons Pop, Patate Bombe,
Mémo-Monstre, Tir à la corde, Les Portes du Gardien, Le Coffre-fort, Synchro Parfaite.

## Lancer le jeu sur ton PC (pour tester)
1. Installe Node.js (version LTS) depuis nodejs.org.
2. Dans ce dossier, ouvre un terminal et tape : `node server.js`
3. Ouvre http://localhost:3000 dans ton navigateur.

## Le mettre en ligne pour jouer avec tes potes (gratuit)
1. Mets ce dossier sur GitHub, dans un nouveau dépôt.
2. Sur render.com, crée un « Web Service » relié à ce dépôt.
   - Build Command : laisser vide
   - Start Command : `node server.js`
   - Instance : Free
3. Render te donne une adresse en `https://….onrender.com`. Partage-la : tu crées la partie, tes potes entrent le code.

Aucune dépendance à installer : le jeu n'utilise que Node.js.
