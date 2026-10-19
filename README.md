# CV-Gateway Elastic

Plateforme de vision par ordinateur pour la **traçabilité comportementale** (bureau) et le **contrôle de conformité EPI** (cuisine).

PFE — Emna Mansouri · TEK-UP · Elastic Solutions  
Dépôt : [github.com/Emna611/CV_Gateway_Elastic](https://github.com/Emna611/CV_Gateway_Elastic)

L’opérateur choisit un scénario, configure la source et les seuils, lance le moteur, puis supervise le flux annoté avec un journal d’alertes exportable.

---

## Architecture

Trois services autonomes. Le frontend ne fait **ni inférence ni persistance**.

| Service | Techno | Port | Rôle |
|---|---|---|---|
| `frontend` | React 19 · Vite | [3000](http://localhost:3000) | Assistant de configuration + dashboard |
| `backend` | Laravel 12 · PHP 8.2 · SQLite | [8000](http://127.0.0.1:8000) | Occupations, alertes, e-mails, exports CSV |
| `ai_engine` | Python 3.11 · Flask · YOLO11 · OpenCV | [5000](http://127.0.0.1:5000) | Source, inférence, règles temporelles, MJPEG |

En développement, Vite proxifie `/api/export` vers Laravel et le reste de `/api` vers Flask.

```
Opérateur → Frontend (:3000)
                ↓ config / start
           Moteur Flask + YOLO (:5000)
                ↓ alertes / occupations (async)
           Laravel + SQLite (:8000) → file e-mail
```

---

## Scénarios et modèles

Les **trois poids déployés** sont dans ce dépôt. Les datasets d’entraînement (plusieurs Go) restent hors Git.

| Scénario | Fichier | Chemin dans le dépôt |
|---|---|---|
| Bureau | `yolo11m-pose.pt` | `ai_engine/models/yolo11m-pose.pt` |
| Bureau | `phone_model.pt` | `ai_engine/models/phone_model.pt` |
| Cuisine | `bestfinal.pt` | `ai_engine/models/bestfinal.pt` |

`config.yaml` est la source unique des seuils : le frontend n’en code aucun en dur.

Une détection YOLO n’est jamais une alerte : l’état doit **persister** au-delà du seuil configuré (occupation, fatigue, téléphone, EPI manquant).

---

## Prérequis (lancement local)

- PHP 8.2+, Composer, Node.js 20+
- Python 3.11 et un venv avec `ai_engine/requirements.txt` (Torch, Ultralytics, OpenCV, Flask, yt-dlp)
- Les trois fichiers `.pt` (inclus au clone, chemins ci-dessus)
- Pour une source **YouTube** : [Deno](https://deno.land) 2.3+ (PATH ou `%USERPROFILE%\.deno\bin`)

---

## Démarrage local (Windows)

1. Copier `backend/.env.example` vers `backend/.env`, puis :

```bash
cd backend
composer install
php artisan key:generate
php artisan migrate
```

2. Installer le frontend :

```bash
cd frontend
npm install
```

3. Installer le moteur (venv dédié ou celui d’`Office_Monitoring_v2`) :

```bash
cd ai_engine
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
```

4. Lancer toute la pile :

```powershell
.\start.ps1
```

ou `start.bat`. Cinq fenêtres s’ouvrent : Laravel, queue, scheduler (rapport quotidien), Flask, Vite. L’interface est sur **http://localhost:3000**.

Lancement manuel du moteur : `ai_engine/run.ps1`.

---

## Docker

```bash
docker compose up --build
```

Puis http://localhost:3000.

Les `.pt` sont copiés dans l’image via `ai_engine/models/`. Pour installer Torch dans l’image moteur :

```bash
docker compose build --build-arg INSTALL_ML=1 ai_engine
```

---

## Configuration e-mail

Dans `backend/.env` : `MAIL_USERNAME` et `MAIL_PASSWORD` (Gmail : mot de passe d’application). Sans ces valeurs, les jobs répondent « SMTP non configuré ».

Le jeton partagé `INGEST_TOKEN` doit être identique côté Laravel et moteur (`X-Ingest-Token`). Ne jamais committer `.env`.

---

## Tests

```bash
# Laravel (PHPUnit)
docker build -f backend/Dockerfile --target test backend

# Frontend (build Vite)
docker build -f frontend/Dockerfile --target test frontend

# Moteur (syntaxe Python)
docker build -f ai_engine/Dockerfile --target test ai_engine
```

La CI GitHub Actions (`.github/workflows/ci.yml`) exécute ces trois cibles sur `main`.

---

## Structure

```
frontend/     Interface React
backend/      API Laravel, SQLite, files d’e-mail
ai_engine/    Flask, pipelines bureau / cuisine
docs/         Schémas d’architecture
```
