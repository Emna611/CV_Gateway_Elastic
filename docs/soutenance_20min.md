# Soutenance PFE — CV-Gateway Elastic
### Support de préparation : déroulé minuté, script de démo, questions du jury

Emna Mansouri — TEK-UP — Ingénieur GLSI — Elastic Solutions
Encadrant professionnel : M. Abdelmonam Kouka · Encadrant académique : M. Ghassen Khaled

---

## 1. Ce que ton projet est réellement (analyse du code)

Avant le déroulé, la lecture complète du dépôt. Elle sert à deux choses : choisir les
arguments qui tiennent devant un jury technique, et repérer les points où le rapport et le
code ne disent pas exactement la même chose.

### 1.1 Trois services, un contrat clair

| Service | Techno | Port | Ce qu'il fait vraiment |
|---|---|---|---|
| `ai_engine` | Python 3.11 · Flask · Ultralytics YOLO11 · OpenCV | 5000 | Ouvre la source, exécute l'inférence, applique les règles temporelles, diffuse le MJPEG annoté, pousse les événements vers Laravel |
| `backend` | Laravel 12 · PHP 8.2 · SQLite | 8000 | Valide et persiste occupations + alertes, stocke les captures, met en file les e-mails, sert les exports CSV |
| `queue` | Laravel `queue:work` | — | Envoie les e-mails SMTP hors du chemin critique |
| `frontend` | React 19 · Vite · Nginx | 3000 | Assistant de configuration 3 étapes + dashboard de supervision. Aucune inférence, aucune base |

Volumétrie : ~2 400 lignes Python, ~2 800 lignes PHP, ~4 400 lignes JS/JSX, ~2 800 lignes CSS.

### 1.2 Les sept décisions d'ingénierie qui font la valeur du projet

Ce sont elles qu'il faut savoir raconter. Une détection YOLO, tout le monde sait en faire.

**1. La confirmation temporelle — le cœur du système.** Une détection brute n'est jamais une
alerte. Chaque état doit persister au-delà d'un seuil configurable avant de remonter.
`sleep_timers` / `fatigue_timers` dans `sleep_detector.py`, `_phone_since` et `_present_since`
dans `office.py`, `_missing_since` dans `kitchen.py`. Le champ `confirmed` distingue un signe
passager d'un état maintenu, et seul un état confirmé lève une alerte. C'est ce qui transforme
un flux de détections bruyant en information exploitable.

**2. Les zones sont normalisées entre 0 et 1, jamais en pixels.** La règle est vérifiée côté
serveur (`store.py::_validate_zones`), pas seulement dans l'éditeur, et la conversion en pixels
est refaite à chaque image (`polygon_pixels`). Conséquence : une configuration tracée sur un
flux 768×432 reste valable sur une caméra 1920×1080.

**3. Une chaise avec un manteau n'occupe pas un poste.** `_is_real_person` exige au moins
4 points clés visibles parmi épaules et hanches. Et l'ancrage d'occupation est le buste
(`_torso_in_polygon`), pas les pieds qui dépassent dans l'allée. Le recouvrement est mesuré par
échantillonnage 5×5 de la boîte et doit atteindre 22 %.

**4. Le live ne dérive pas.** Sur RTSP, OpenCV accumule les images pendant l'inférence : le flux
se décale de plusieurs secondes. `_LiveGrabber` est un thread dédié qui vide le tampon et ne
garde que la dernière image. Sur un fichier, c'est l'inverse : lecture séquentielle cadencée sur
le fps source, sinon toutes les durées mesurées seraient fausses.

**5. Aucune étape n'est affichée réussie avant de l'être.** `import torch` coûte ~170 s à froid.
Le `_Warmup` le paie au démarrage du service, pendant que l'opérateur configure. La séquence de
démarrage a 4 étapes et l'étape « pipeline » ne passe au vert qu'après qu'une première image a
réellement traversé toute la chaîne.

**6. `config.yaml` est la source unique de vérité.** Le frontend ne code aucun seuil en dur : il
affiche ce que l'API déclare. Chaque classe activable déclare les seuils qu'elle gouverne et les
modèles qu'elle exige. Désactiver « usage du téléphone » évite donc de charger
`phone_model.pt` en mémoire. Et `PATCH /api/engine/detections` change les classes actives
pendant que le pipeline tourne, sans redémarrage.

**7. L'inférence n'attend jamais Laravel.** `ingest.py` pousse dans une file à un seul fil : la
boucle d'inférence rend la main immédiatement, l'ordre `enter`/`exit` d'une zone est préservé, et
si Laravel est arrêté l'échec est journalisé sans interrompre le moteur.

### 1.3 Sécurité effectivement implémentée

- Jeton partagé `X-Ingest-Token` sur toutes les écritures (middleware `VerifyIngestToken`), 401 sans jeton.
- Mots de passe RTSP masqués partout où l'URL sort du moteur (`mask_credentials`).
- Traversée de répertoire bloquée sur les uploads (`resolve_upload` contraint à `data/`).
- Jetons de frame validés par expression régulière (`^[0-9a-f]{32}\.jpg$`).
- Captures en stockage privé, servies par contrôleur et jamais exposées en statique.
- Secrets hors du dépôt : `.env` injecté par `env_file`, jamais versionné.

### 1.4 Tests

Deux fichiers de tests fonctionnels Laravel, 17 cas. À noter pour le jury : le test e-mail
n'inspecte pas un rendu de prévisualisation, il lit le message Symfony réellement livré par le
transport, vérifie l'objet, le fuseau, la durée observée, et que la capture est bien une pièce
jointe **inline** en `cid:` — pas un lien distant qu'un client mail bloquerait.

---

## 2. Déroulé minuté — 18 diapositives, 20 minutes

Répartition : 12 min de fond, 5 min 30 de démo, 2 min 30 d'ouverture et de conclusion.
Garde un chronomètre visible. Le seul repère qui compte : **être sur la démo à 11 min 30**.

| # | Diapositive | Durée | Cumul |
|---|---|---|---|
| 1 | Page de titre | 0:30 | 0:30 |
| 2 | Plan | 0:20 | 0:50 |
| 3 | Elastic Solutions et Elastic-Watch | 0:50 | 1:40 |
| 4 | Problématique | 1:20 | 3:00 |
| 5 | Étude de l'existant et positionnement | 1:10 | 4:10 |
| 6 | Objectifs et périmètre | 0:50 | 5:00 |
| 7 | Méthodologie CRISP-DM | 0:40 | 5:40 |
| 8 | Données et rééquilibrage | 1:10 | 6:50 |
| 9 | Modélisation itérative — 4 versions | 1:20 | 8:10 |
| 10 | Le choix final : pose et règles temporelles | 1:20 | 9:30 |
| 11 | Architecture des services | 1:10 | 10:40 |
| 12 | Pipeline d'une frame | 0:50 | 11:30 |
| 13 | **DÉMONSTRATION** | 5:30 | 17:00 |
| 14 | Résultats des modèles | 0:50 | 17:50 |
| 15 | Limites assumées | 0:40 | 18:30 |
| 16 | Déploiement et intégration continue | 0:40 | 19:10 |
| 17 | Perspectives | 0:30 | 19:40 |
| 18 | Conclusion | 0:20 | 20:00 |

---

### Diapo 1 — Page de titre · 0:30

**Visuel** : titre du projet, ton nom, les deux encadrants, logos TEK-UP et Elastic Solutions,
année 2025-2026.

**À dire** : « Bonjour. Je suis Emna Mansouri, et je vais vous présenter mon projet de fin
d'études réalisé chez Elastic Solutions : un système de traçabilité comportementale par vision
par ordinateur pour des environnements professionnels sensibles. Le système s'appelle
CV-Gateway Elastic. »

Ne lis pas le titre long de ton rapport à voix haute. Il est écrit, ça suffit.

---

### Diapo 2 — Plan · 0:20

**Visuel** : 5 blocs — Contexte · Données et modèles · Architecture · Démonstration · Résultats.
Mets en évidence le bloc Démonstration.

**À dire** : « Je commence par le contexte et la problématique, puis le travail sur les données
et les modèles, l'architecture du système, une démonstration en direct d'environ cinq minutes,
et je termine par les résultats et les limites. »

---

### Diapo 3 — Elastic Solutions et Elastic-Watch · 0:50

**Visuel** : logo, fiche d'identité en trois lignes (2021, Technopole El Ghazela, 10-20
collaborateurs, IA/IoT/Big Data), et à droite un encadré « Elastic-Watch : détection d'objets ».

**À dire** : « Elastic Solutions est une startup deep-tech tunisienne fondée en 2021, implantée à
la Technopole El Ghazela, spécialisée en intelligence artificielle, IoT et Big Data. Son produit
phare, Elastic-Watch, fait de la surveillance intelligente — mais uniquement par détection
d'objets : il constate qu'un élément est présent ou absent. Mon projet a été défini comme une
extension de ce produit. »

---

### Diapo 4 — Problématique · 1:20

**Visuel** : à gauche trois limites du CCTV classique (attention de l'opérateur, réactivité,
traçabilité). À droite, la phrase-clé isolée : **« constater la présence d'un objet ≠ qualifier
l'état d'une personne »**. En bas, la question de recherche encadrée.

**À dire** : « Trois besoins clients revenaient : connaître le taux réel d'occupation des
espaces, détecter les baisses de vigilance des opérateurs, et documenter les non-conformités
d'hygiène pour les audits réglementaires. Aucun des trois ne se résout par détection d'objets,
parce qu'il ne s'agit pas de constater la présence d'un objet mais de qualifier un état humain.

Et le CCTV classique ne répond pas non plus : la vigilance d'un opérateur qui surveille
plusieurs écrans décline en quelques dizaines de minutes, les incidents sont constatés a
posteriori, et rien n'est documenté de façon exploitable.

D'où ma question : comment automatiser, en temps réel et sur des flux multi-sources, la
détection de comportements à risque, tout en produisant une traçabilité structurée ? »

C'est ta diapositive la plus importante. Ralentis. Fais une pause après la question.

---

### Diapo 5 — Étude de l'existant et positionnement · 1:10

**Visuel** : le tableau comparatif du rapport, réduit à 5 lignes seulement — Détection
automatique / **Estimation de pose** / Occupation par zone avec durée / Multi-scénario /
Traitement local. Trois colonnes : CCTV, plateformes IA existantes, CV-Gateway. Surligne la
ligne « Estimation de pose ».

**À dire** : « J'ai évalué les plateformes de vidéosurveillance intelligente du marché. Le point
bloquant est structurel, pas commercial : elles sont conçues autour de la boîte englobante et ne
prennent pas en charge les sorties d'estimation de pose. Or sans les points clés du corps, on ne
peut pas mesurer une inclinaison de tête ni distinguer l'activité de l'inactivité.

C'est ce constat qui a fondé mon choix d'architecture : développer un moteur d'inférence dédié
plutôt que de configurer une plateforme existante. »

Si on te demande de nommer les plateformes : Milestone XProtect, Genetec Security Center — tu
les cites dans ton chapitre 2.

---

### Diapo 6 — Objectifs et périmètre · 0:50

**Visuel** : cinq objectifs de détection en deux colonnes (Bureau : occupation, activité,
vigilance, téléphone — Cuisine : conformité EPI), puis une bande basse avec les trois contraintes
de conception.

**À dire** : « Cinq objectifs de détection sur deux scénarios. Côté bureau : l'occupation des
postes avec sa durée, la qualification actif/inactif, la fatigue et l'endormissement, l'usage du
téléphone. Côté cuisine : le port des gants, du tablier et de la charlotte.

Et trois contraintes qui ont structuré toute la conception. Non-intrusivité : aucune
identification nominative, le système raisonne sur des zones et des états anonymes. Traitement
local : aucune image ne sort du réseau de l'organisation. Et réutilisation de l'infrastructure
caméras existante, sans matériel supplémentaire. »

La contrainte de non-intrusivité désamorce par avance la question RGPD. Ne l'oublie pas.

---

### Diapo 7 — Méthodologie CRISP-DM · 0:40

**Visuel** : la roue des six phases. Annote-la avec **où le projet a réellement bouclé** : une
flèche de retour de « Évaluation » vers « Modélisation », marquée « 4 itérations ».

**À dire** : « J'ai retenu CRISP-DM parce que l'essentiel de l'effort a porté sur les données, et
surtout parce que le cycle est itératif. Sur ce projet, la boucle Modélisation-Évaluation a
tourné quatre fois avant d'aboutir, et c'est ce que je vais vous montrer maintenant. »

Ne détaille pas les six phases une par une : le jury les connaît, et ça coûte 40 secondes pour
rien. Annoter la boucle réellement parcourue vaut beaucoup mieux.

---

### Diapo 8 — Données et rééquilibrage · 1:10

**Visuel** : le tableau avant/après augmentation du dataset PPE (17 104 → 34 101 instances), avec
deux barres empilées côte à côte pour rendre le déséquilibre visible.

**À dire** : « Le dataset cuisine comptait six classes et un déséquilibre marqué : la classe
gloves était représentée près de cinq fois plus que no_hairnet. Sur un modèle YOLO, ce
déséquilibre biaise les prédictions vers les classes majoritaires et dégrade le rappel des
classes rares — précisément celles qui portent l'alerte.

J'ai appliqué une augmentation ciblée par classe, et non une augmentation globale : les classes
minoritaires ont été suréchantillonnées jusqu'à environ 5 500 instances chacune. Le ratio de
déséquilibre passe de 4,9 pour 1 à quasiment 1 pour 1.

Une difficulté propre à ce dataset : les gants occupent souvent moins de 5 % de la surface de
l'image. C'est un problème de petits objets, ce qui explique les seuils de confiance différenciés
par classe que j'ai retenus. »

---

### Diapo 9 — Modélisation itérative du modèle Bureau · 1:20

**Visuel** : les quatre versions en frise horizontale, chaque case portant le problème rencontré
et la décision prise. Le tableau 4.1 de ton rapport, mis en scène.

**À dire** : « Le modèle bureau a été reformulé quatre fois, et chaque échec a été instructif.

Version 1, classification d'image sur quatre comportements : déséquilibre sévère, une classe à
56 % des images. Version 2, je passe à YOLO11m : les métriques brutes montent, mais je découvre
une limite conceptuelle — une classification globale par image ne dit pas *qui*, dans une scène
à plusieurs personnes, adopte le comportement détecté. Ça disqualifie l'approche.

Version 3, je reformule en détection d'objets à cinq classes. Une classe, assis_bureau, a un
rappel de 45 %. Je rééquilibre à 700 images par classe, et elle se dégrade encore : 13 % de
rappel. Ce résultat est le plus intéressant du projet, parce qu'il prouve que le problème
n'était pas quantitatif mais conceptuel : assis_bureau chevauche visuellement la classe pc, la
frontière n'est pas discriminante. Aucun volume de données n'aurait corrigé ça.

Je supprime la classe. La version finale à quatre classes atteint 98 % de mAP@50. »

C'est ta meilleure diapositive pour montrer une démarche d'ingénieur. Le jury retient ça.

---

### Diapo 10 — Le choix final : pose et règles temporelles · 1:20

**Visuel** : deux blocs. À gauche « Détection de comportement » avec la mention *évaluée,
98 % mAP@50*. À droite « Estimation de pose + moteur de règles » avec la mention **déployée**.
Entre les deux, trois flèches portant les trois raisons du choix.

**À dire** : « Il faut que je sois précise sur un point, parce que c'est un choix d'architecture
assumé. Le modèle de détection comportementale que je viens de décrire a été entraîné et évalué,
mais **le pipeline déployé n'est pas celui-là**. Il repose sur yolo11m-pose pré-entraîné COCO,
plus un modèle dédié pour le téléphone, plus un moteur de règles géométriques et temporelles.

Trois raisons. Premièrement, un modèle de détection me donne un état à l'instant t ; il ne me
donne pas la durée. Or mes trois besoins clients sont tous des durées : combien de temps le poste
est occupé, depuis combien de temps la personne est immobile, depuis combien de temps le gant
manque. La durée exige un suivi d'identité image après image, que la pose fournit avec le
tracking.

Deuxièmement, la pose est mesurable et explicable. Je calcule un angle nez-épaules, une distance
poignet-tête. Devant un auditeur d'hygiène ou de sécurité, je peux justifier pourquoi une alerte
a été levée. Un score de classe, non.

Troisièmement, les poids COCO généralisent sur un nouveau site sans réentraînement. Un modèle
comportemental entraîné sur mes images de bureau devrait être réannoté à chaque déploiement.

Le modèle entraîné reste dans le dépôt et documente la démarche. Le produit livré utilise la
pose. »

**Cette diapositive est indispensable.** Sans elle, un jury attentif verra que le 98 % de mAP
annoncé ne concerne pas le code qui tourne dans la démo, et la question arrivera de façon
beaucoup moins confortable.

---

### Diapo 11 — Architecture des services · 1:10

**Visuel** : `docs/architecture_globale.png`, tel quel. Il est propre et fidèle au code.

**À dire** : « Quatre processus. Un frontend React servi par Nginx, qui ne fait aucune inférence
et n'a aucune base : il ne fait qu'appeler des API. Une API Laravel qui valide et persiste. Un
worker de file qui envoie les e-mails. Et le moteur d'inférence en Python et Flask.

Deux points de conception. D'abord, l'isolement des pannes : si le moteur d'inférence tombe, le
tableau de bord et l'historique des alertes restent consultables. Ensuite, l'ingestion vers
Laravel est asynchrone, dans une file à un seul fil. La boucle d'inférence ne bloque jamais sur
une requête HTTP, et l'ordre des événements d'entrée et de sortie de zone est préservé. Si
Laravel est arrêté, le moteur continue de tourner et journalise l'échec. »

---

### Diapo 12 — Pipeline d'une frame · 0:50

**Visuel** : `docs/architecture_bureau.png`. Garde `architecture_cuisine.png` en diapositive de
secours pour les questions.

**À dire** : « Le trajet d'une image, côté bureau. La frame arrive, yolo11m-pose produit les
boîtes, les identifiants de suivi et dix-sept points clés par personne. Trois traitements en
parallèle : les zones d'occupation, où le polygone normalisé est projeté en pixels et où
l'occupation n'est validée qu'après trois secondes de présence continue ; la vigilance, par
analyse de la posture ; et la détection de téléphone, dont le modèle n'est chargé que si la
classe est active.

Tout converge vers un générateur d'événements. Et le point important : **un signe non confirmé
ne remonte pas**. Un état doit persister au-delà de son seuil pour devenir un événement. »

---

### Diapo 13 — DÉMONSTRATION · 5:30

**Choix recommandé : le scénario Bureau en direct, la Cuisine par un clip de 40 secondes.**

Raison technique impérative : `EngineManager` n'autorise **qu'une seule session à la fois**
(« Une analyse est déjà en cours »). Tu ne peux donc pas montrer les deux scénarios en direct en
parallèle, et un basculement coûte un rechargement de poids en pleine soutenance. Le bureau est
aussi le scénario qui porte ta contribution : zones, occupations, pose, export.

#### Réglage à faire AVANT la soutenance

Ta configuration bureau enregistrée a `sleeping: 300` et `fatigue: 30`. Cinq minutes
d'immobilité, aucune alerte de sommeil ne se déclenchera pendant la démo. **Modifie les seuils
dans l'écran de configuration et enregistre** :

| Seuil | Valeur actuelle | Valeur démo | Pourquoi |
|---|---|---|---|
| `zone_occupied` | 7 s | **3 s** | les postes se colorent vite |
| `fatigue` | 30 s | **10 s** | une alerte FATIGUE en début de démo |
| `sleeping` | 300 s | **30 s** | l'alerte critique tombe dans la fenêtre de démo |
| `on_phone` | 5 s | 5 s | correct |

Et dans le panneau e-mail, coche **`sleeping`** en plus de `on_phone` : c'est l'alerte critique
que tu veux voir arriver dans ta boîte.

Si le jury demande pourquoi 30 secondes : « c'est un seuil de démonstration, la valeur métier par
défaut est de cinq minutes ; le seuil est un paramètre opérateur, pas une constante du code. »
Dis-le toi-même en montrant le curseur, ça devient un argument au lieu d'une faiblesse.

#### Déroulé, 8 étapes

**A. Écran d'accueil — 0:25**
Montre les deux cartes de scénario. « Chaque carte annonce les états détectables avec leur
sévérité, et les modèles qui seront chargés. Je choisis Bureau. »

**B. Configuration de la source — 0:40**
La source est déjà renseignée. Clique **Tester la source**. « Le test n'est pas déclaratif : le
moteur ouvre réellement le fichier et décode une image. Il me renvoie la résolution, le nombre
d'images par seconde, et cette première frame — qui va me servir de fond pour tracer les zones. »

**C. Les zones — 0:50**
C'est ton moment fort visuel. Les six postes sont déjà tracés. « Ces polygones sont stockés
normalisés entre 0 et 1, jamais en pixels — la règle est vérifiée côté serveur. Concrètement, la
configuration que je trace ici sur un flux 768×432 reste valable si on branche demain une caméra
en 1920×1080. » **Trace un septième poste en direct** (3-4 clics), puis supprime-le. Ça prouve que
l'éditeur est fonctionnel et pas une capture d'écran.

**D. Classes et seuils — 0:35**
« Les trois classes sont activables indépendamment, et l'interface n'affiche que les seuils
gouvernés par les classes actives — parce que tout vient d'un fichier de configuration côté
serveur, le frontend ne code aucun seuil en dur. Si je désactive le téléphone, le moteur ne
chargera même pas le modèle correspondant. » Montre le panneau e-mail avec le destinataire et le
délai anti-spam.

**E. Séquence de démarrage — 0:35**
Clique **Démarrer**. Laisse la checklist se dérouler sans commenter les deux premières secondes.
« Quatre étapes, et aucune n'est affichée réussie avant de l'être réellement. La dernière, le
démarrage du pipeline, ne passe au vert qu'après qu'une première image a effectivement traversé
toute la chaîne — c'est la seule preuve que l'ensemble fonctionne. »

**F. Supervision en direct — 1:30**
Le flux annoté apparaît. Point chaque élément :
- les polygones changent de couleur selon l'état, le libellé indique le poste et son état ;
- les boîtes personnes portent l'identifiant de suivi et l'état, avec le motif : *tête sur la
  table (12 s)* ;
- le panneau latéral liste les postes avec leur durée d'occupation cumulée ;
- les KPI : FPS, personnes, alertes, résolution.

« Deux à quatre images par seconde, en inférence CPU sur un i5 portable. C'est suffisant : les
phénomènes que je mesure se comptent en dizaines de secondes, pas en millisecondes. »

Attends une alerte. Quand elle tombe, elle apparaît dans le panneau avec sa sévérité, et une
capture horodatée est jointe. **Montre les classes activables en direct** : décoche « usage du
téléphone », le panneau de seuils se réduit immédiatement — sans redémarrer l'analyse.

**G. Traçabilité et export — 0:45**
Onglet **Journal**. « Ce n'est plus la mémoire de la session, c'est la base : chaque occupation
est une ligne avec entrée, sortie et durée, chaque alerte est une ligne avec sa capture. »
Clique **Export Occupations**. Ouvre le CSV **dans Excel** : il s'ouvre en colonnes propres, avec
les accents. « BOM UTF-8, point-virgule comme séparateur, virgule décimale : c'est un export
destiné à un responsable qualité tunisien ou français, pas à un développeur. »

**H. Notification et cuisine — 0:40**
Bascule sur l'onglet webmail déjà ouvert. Montre l'e-mail : objet avec le type, le poste et
l'horodatage à la seconde, et **la capture affichée dans le corps du message**. « La capture est
une pièce jointe inline, pas un lien distant — un client mail d'entreprise bloquerait un lien.
Et l'envoi passe par un worker de file : le pipeline d'inférence n'attend jamais le serveur SMTP.
Un anti-spam par type et par destinataire évite la saturation. »

Puis lance ton **clip de 40 s du scénario Cuisine** : bandeau CONFORME 3/3 qui bascule en NON
CONFORME, panneau par équipement, alerte NO_GLOVE. « Même socle, seul le pipeline d'inférence
change — c'est ce qui permet d'ajouter un scénario sans toucher au noyau. »

#### Checklist de pré-vol — à faire 20 minutes avant

- [ ] **Lancer les 4 services au moins 15 min avant** pour que le warmup Torch soit terminé
      (`python app.py`, `php artisan serve`, `php artisan queue:work`, `npm run dev`).
- [ ] Vérifier `http://127.0.0.1:5000/api/health` → `inference.ready: true` et `smtp.configured: true`.
- [ ] Seuils de démo enregistrés (tableau ci-dessus), `sleeping` coché dans les types d'e-mail.
- [ ] Envoyer un **e-mail de test** et vérifier la réception. Webmail ouvert dans un onglet, déjà
      connecté, boîte de réception vide et triée par date décroissante.
- [ ] Vider le journal de la session précédente, mais **garder l'historique des 7 jours** : la
      courbe de tendance est vide sinon.
- [ ] Excel ouvert et prêt, associé aux `.csv`.
- [ ] Windows en mode Concentration, notifications coupées, Cursor et Slack fermés.
- [ ] Zoom navigateur à 100 %, résolution d'écran vérifiée sur **le vidéoprojecteur de la salle**.
- [ ] **Vidéo de secours de 2 minutes** de toute la démo, sur le bureau et sur une clé USB.
- [ ] Chargeur branché. Le mode économie d'énergie fait chuter le FPS.

#### Si ça casse en direct

Une seule règle : **ne débogue jamais devant le jury.** Tu as 10 secondes pour décider.

| Symptôme | Réaction |
|---|---|
| Le moteur ne démarre pas | « Une analyse occupe déjà le moteur » → clic Arrêter, puis Relancer. Sinon : passe à la vidéo de secours. |
| Le flux MJPEG se fige | Recharge la page une fois. Si ça persiste : « le flux d'aperçu s'est interrompu, l'analyse continue » → montre le Journal, qui prouve que le pipeline tourne. |
| Aucune alerte ne tombe | N'attends pas. « L'alerte demande une confirmation temporelle, c'est volontaire » → passe au Journal et montre les alertes de la session précédente. |
| L'e-mail n'arrive pas | Ne rafraîchis pas trois fois. Montre un e-mail reçu la veille, gardé exprès dans la boîte. |
| Tout est cassé | Vidéo de secours, sans t'excuser. Enchaîne : « voici la même séquence enregistrée ce matin ». |

Garde **une capture d'écran de chaque étape** dans les diapositives de secours, à la fin du
support. Un jury pardonne une démo qui échoue, pas un candidat qui perd trois minutes à réparer.

---

### Diapo 14 — Résultats · 0:50

**Visuel** : deux tableaux compacts côte à côte (Bureau : moyenne 97,6 % / 97,6 % / 98,9 % sur le
test — Cuisine : 90,7 % / 85,4 % / 90,9 %), et en bas le tableau du pipeline temps réel.

**À dire** : « Sur le modèle bureau, 98,9 % de mAP@50 sur l'ensemble de test, avec un rappel
homogène entre les classes. Sur le modèle cuisine, 90,9 % de mAP@50 sur six classes.

Deux lectures honnêtes de ces chiffres. D'abord, le mAP@50-95 du modèle cuisine reste à 56,6 % :
c'est la localisation fine qui pèche, et c'est cohérent avec la nature des petits objets comme
les gants. Ensuite, les classes négatives — no_glove, no_hairnet — ont logiquement un rappel plus
faible, parce que détecter une absence est plus difficile que détecter une présence.

Et dans un système de surveillance, c'est le rappel qui compte plus que la précision : un faux
positif fatigue un opérateur, un faux négatif laisse passer un risque. »

Cette dernière phrase est celle à retenir. Elle montre que tu as compris ce que les métriques
veulent dire dans *ton* contexte métier, pas seulement leur formule.

---

### Diapo 15 — Limites assumées · 0:40

**Visuel** : la figure du faux positif documenté (main contre la joue), et deux limites listées.

**À dire** : « Deux faux positifs récurrents, que j'assume et que je documente. Une main appuyée
contre la joue maintenue au-delà du seuil est interprétée comme un signe de somnolence, alors que
c'est souvent une posture de concentration. Et dans les scènes denses, deux personnes très proches
peuvent voir leurs points clés mal attribués, ce qui duplique une alerte.

Les deux sont atténués par l'ajustement du seuil de confirmation, pas résolus. Une troisième
limite d'architecture : le moteur ne traite aujourd'hui **qu'une session d'analyse à la fois**.
Le passage au multi-caméras simultané est une évolution identifiée, pas une propriété de la
version actuelle. »

Annoncer soi-même ses limites est ce qui distingue un ingénieur d'un vendeur. Le jury va chercher
les failles : il vaut mieux qu'il te trouve lucide qu'il te prenne en défaut.

---

### Diapo 16 — Déploiement et intégration continue · 0:40

**Visuel** : `docs/architecture_deploiement.png` et le tableau des quatre travaux de CI avec les
durées réelles (15 s / 53 s / 7 s / 2 min 09 — total 3 min 07).

**À dire** : « L'ensemble se reconstruit et démarre par une seule commande,
`docker compose up --build`, sans registre d'images ni infrastructure externe.

Trois choix. La persistance par volumes nommés : les données survivent à la reconstruction des
conteneurs. Le montage des poids en lecture seule : on remplace un modèle entraîné sans
reconstruire l'image du moteur. Et l'externalisation complète des secrets dans un fichier
d'environnement jamais versionné.

Côté intégration continue, quatre travaux GitHub Actions à chaque poussée, en un peu plus de trois
minutes : compilation du frontend, tests Laravel, validation du moteur Python, construction des
images. Aucune régression ne peut entrer sur la branche principale. »

---

### Diapo 17 — Perspectives · 0:30

**Visuel** : quatre perspectives seulement, avec un pictogramme. Multi-caméras · Edge NVIDIA
Jetson · Apprentissage continu sur faux positifs · Extension télédétection Copernicus.

**À dire** : « Quatre directions. Le multi-caméras simultané, qui est la limite d'architecture que
je viens de citer. Le portage en edge sur NVIDIA Jetson, pour un traitement au plus près des
caméras. Un réentraînement continu à partir des faux positifs annotés par les opérateurs — le
système produit déjà les captures horodatées nécessaires. Et une extension vers l'imagerie
satellitaire Copernicus : la modularité du moteur permettrait d'ajouter un module d'acquisition
satellitaire réutilisant toute la chaîne d'alerte existante. »

Ne liste pas les six perspectives du rapport. Quatre bien dites valent mieux que six récitées.

---

### Diapo 18 — Conclusion · 0:20

**Visuel** : trois lignes de synthèse, puis « Merci de votre attention ».

**À dire** : « Pour conclure : un système multi-scénario et multi-source, déployable par une seule
commande, dont la contribution propre n'est pas la détection elle-même mais la couche de
confirmation temporelle qui transforme des détections bruyantes en information traçable et
exploitable. Merci de votre attention, je suis à votre disposition pour vos questions. »

Finir sur la contribution, pas sur la liste des technologies. C'est la dernière phrase que le jury
entend avant de délibérer.

---

## 3. Questions du jury — réponses préparées

### 3.1 Les trois questions qui peuvent te déstabiliser

**« Vous annoncez 98 % de mAP. Ce modèle tourne-t-il dans la démonstration ? »**

Réponds directement, sans détour : « Non, et c'est un choix documenté. Le modèle de détection
comportementale a été entraîné et évalué — c'est le résultat des quatre itérations. Le pipeline
déployé utilise l'estimation de pose plus un moteur de règles, pour trois raisons : la détection
donne un état instantané mais pas de durée, alors que mes trois besoins métier sont tous des
durées ; la pose est explicable devant un auditeur, un score de classe non ; et les poids COCO
généralisent sur un nouveau site sans réannotation. Le modèle entraîné documente la démarche, la
pose constitue le produit. » — Si la diapo 10 est bien faite, cette question n'arrivera pas.

**« Deux à quatre images par seconde, c'est du temps réel ? »**

« Ça dépend du phénomène mesuré. Pour détecter une intrusion ou une chute, non — il faudrait du
GPU. Mais les états que je qualifie se confirment en dizaines de secondes : trois secondes pour
valider une occupation, dix pour la fatigue, cinq minutes pour l'endormissement. À deux images
par seconde j'ai déjà soixante observations pour confirmer une fatigue. La latence de bout en
bout, de l'acquisition à l'affichage de l'alerte, reste sous deux secondes. Le facteur limitant
est mon matériel de test — un i5 portable en inférence CPU — pas l'architecture. »

**« Comment garantissez-vous le respect du RGPD ? »**

« Par la conception, sur trois points. Aucune identification nominative : les identifiants de
suivi sont locaux à une session et détruits à l'arrêt, le système raisonne sur des zones et des
états anonymes. Traitement intégralement local : aucune image ne sort du réseau. Et une
minimisation du stockage : je ne conserve pas la vidéo, seulement une capture par alerte
confirmée, plus une purge du journal exposée dans l'interface. La base légale reste un intérêt
légitime de sécurité au travail, avec information des salariés — c'est une obligation
organisationnelle de l'employeur, pas une propriété du logiciel. »

### 3.2 Questions techniques probables

| Question | Réponse courte |
|---|---|
| Pourquoi Flask et pas FastAPI ? | Le besoin est un service unique, à état, avec un thread d'inférence : l'asynchrone n'apporte rien ici, le goulot est le GPU/CPU. Flask suffit et réduit les dépendances. |
| Pourquoi SQLite ? | Volumétrie d'un pilote mono-site. Eloquent isole le SGBD : passer à PostgreSQL ne change aucune ligne de code applicatif. |
| Pourquoi MJPEG et pas WebRTC/WebSocket ? | MJPEG sur `multipart/x-mixed-replace` fonctionne dans une balise `<img>`, sans négociation ni dépendance client. Sur un réseau local et à 2-4 fps, le surcoût de bande passante est acceptable. WebRTC serait justifié en multi-caméras sur WAN. |
| Comment évitez-vous l'inondation d'alertes ? | Trois niveaux : la confirmation temporelle par seuil, une alerte levée une seule fois par état (`_alerted`, `state['alert']`), et un anti-spam e-mail par type et destinataire en base. |
| Que se passe-t-il si Laravel tombe ? | Le moteur continue. L'ingestion est asynchrone dans une file bornée à 500 éléments, l'échec est journalisé. La supervision live reste fonctionnelle car elle lit directement le moteur. |
| Comment ajoute-t-on un troisième scénario ? | Une entrée dans `config.yaml` (modèles, classes, seuils), une classe pipeline exposant `process`, `stats`, `drain_events`, `apply_detections`, et son enregistrement dans `PIPELINES`. Aucune modification du noyau, de l'API ni du frontend. |
| Pourquoi des seuils de confiance différents par classe EPI ? | Le modèle n'a pas la même séparabilité sur chaque équipement. Les gants sont petits et souvent occlus : seuil bas à 0,35 pour privilégier le rappel. La charlotte est bien contrastée : 0,65. C'est un arbitrage rappel/précision par criticité hygiénique. |
| Comment les zones résistent-elles à un changement de caméra ? | Coordonnées normalisées 0-1, vérifiées côté serveur au moment de l'enregistrement, reprojetées en pixels à chaque image. Un changement de résolution est transparent. |
| Comment distinguez-vous une personne d'une chaise avec un manteau ? | Il faut au moins quatre points clés visibles parmi les épaules et les hanches, et l'ancrage d'occupation est le buste, pas la boîte entière. |
| Avez-vous des tests ? | 17 cas fonctionnels Laravel, exécutés en CI. Le test e-mail inspecte le message Symfony réellement livré : objet, fuseau, durée, et le fait que la capture soit une pièce jointe inline. |

### 3.3 Deux questions de fond, non techniques

**« Quel est l'apport réel par rapport à Elastic-Watch ? »** — « Elastic-Watch constate la
présence d'un objet. J'apporte deux choses qu'il n'avait pas : l'estimation de pose, qui permet
de qualifier un état humain, et la persistance temporelle, qui transforme une détection instantanée
en durée mesurée. C'est ce qui rend possible les trois besoins clients qui avaient motivé le
projet. »

**« Qu'avez-vous appris ? »** — Ne réponds pas « la rigueur ». Réponds : « Que le volume de
données ne corrige pas une erreur de formulation. Sur la version 3, j'ai rééquilibré une classe
qui avait un mauvais rappel, et elle s'est dégradée. C'est ce résultat contre-intuitif qui m'a
fait comprendre que la frontière entre deux de mes classes n'était pas discriminante, et que la
bonne décision était de supprimer la classe plutôt que d'ajouter des images. »

---

## 4. Cohérence rapport / code — à connaître avant d'entrer

Ces écarts existent parce que ton rapport décrit en partie un prototype antérieur. Aucun n'est
grave, mais si un membre du jury lit le rapport en écoutant, il peut relever. Prépare la phrase.

| Le rapport dit | Le code fait | Ta phrase si on te le demande |
|---|---|---|
| « WebSocket natif » (tableau 1.2) | MJPEG `multipart/x-mixed-replace` + sondage HTTP à 1 s | « Diffusion temps réel par MJPEG plutôt que WebSocket, pour fonctionner dans une balise image sans dépendance client. » |
| `main.py`, `core/video_streamer.py`, `alert_sender.py`, `scenarios/bureau/detector.py` (§4.3.1) | `app.py`, `engine/sources.py`, `engine/ingest.py`, `engine/pipelines/office.py` | « L'arborescence a été refactorisée en fin de projet ; la correspondance est directe, un module par responsabilité. » |
| `GET/POST /api/alerts` (§4.4.1) | `POST /api/ingest/alerts` et `GET /api/export/alerts` | « Les routes ont été séparées : l'ingestion authentifiée par jeton d'un côté, la restitution de l'autre. » |
| Événement `AlertCreated` (§4.4.1) | `SendAlertEmail::dispatch()` directement | « Le job est mis en file directement, sans passer par un événement intermédiaire. » |
| « Cooldown 10 s par type dans CameraWorker » | Anti-spam en base, en minutes, côté Laravel (défaut 5 min) | « L'anti-spam a été déplacé côté backend et exprimé en minutes, réglable par l'opérateur. » |
| « 3 caméras simultanées » (tableau 4.8) | `EngineManager` : **une seule session à la fois** | Dis-le comme une limite (diapo 15) plutôt que de le laisser découvrir. |
| `best.pt (ppe_finetune_gloves_v2)` (tableau 3.3) | `bestfinal.pt` | Simple renommage du fichier livré. |
| Modèle bureau 4 classes, mAP 98 % | Pipeline déployé = `yolo11m-pose.pt` + `phone_model.pt` + règles | **C'est l'écart important. Traite-le en diapositive 10, de ton plein gré.** |

---

## 5. Trois règles pour le jour J

**Sur la forme.** Ton support ne doit contenir aucune diapositive que tu lis. Le texte des
diapositives est pour le jury, ta narration est ailleurs. Une idée par diapositive, jamais deux.

**Sur le rythme.** Les 3 premières minutes et les 3 dernières décident de l'impression finale.
Apprends la problématique (diapo 4) et la conclusion (diapo 18) par cœur, mot pour mot. Le milieu
peut s'improviser, ces deux-là non.

**Sur la démo.** Répète-la **trois fois en entier, chronomètre en main**, dont une fois sur le
matériel de la salle si tu peux y accéder. Une démo répétée trois fois ne tombe presque jamais en
panne — et si elle tombe, tu as la vidéo, et tu enchaînes sans t'excuser.

