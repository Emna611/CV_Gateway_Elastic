/* Source unique de vérité des scénarios.
   Réutilisée par l'écran d'accueil (phase 1) et la configuration (phase 2). */

export const SEVERITY_LABELS = {
    info: 'Information',
    moderate: 'Modéré',
    high: 'Élevé',
    critical: 'Critique',
    compliant: 'Conforme',
};

export const SCENARIOS = {
    bureau: {
        id: 'bureau',
        path: '/scenario/bureau',
        title: 'Environnement Bureau',
        subtitle: 'Supervision des postes de travail',
        description:
            "Analyse comportementale des employés en open space par estimation de pose et détection d'objets. Le moteur suit l'occupation de chaque poste et qualifie l'état de vigilance de la personne présente.",
        hasZones: true,
        models: ['yolo11m-pose.pt', 'phone_model.pt'],
        states: [
            {
                code: 'ZONE_OCCUPIED',
                severity: 'info',
                detail: "présence et durée d'occupation par poste",
            },
            {
                code: 'ACTIVE / IDLE',
                severity: 'info',
                detail: "actif dès qu'une personne est dans la zone, inactif hors zone",
            },
            {
                code: 'FATIGUE',
                severity: 'high',
                detail: 'baisse de vigilance (posture affaissée)',
            },
            {
                code: 'SLEEPING',
                severity: 'critical',
                detail: 'endormissement avéré',
            },
            {
                code: 'ON_PHONE',
                severity: 'moderate',
                detail: 'usage du téléphone au poste',
            },
        ],
    },

    cuisine: {
        id: 'cuisine',
        path: '/scenario/cuisine',
        title: 'Environnement Cuisine',
        subtitle: 'Conformité aux équipements de protection',
        description:
            "Vérification automatique du port des EPI réglementaires par le personnel de cuisine. Chaque personne détectée est évaluée sur les trois équipements obligatoires et signalée dès qu'un manquement persiste.",
        hasZones: false,
        models: ['bestfinal.pt'],
        states: [
            {
                code: 'GLOVE / NO_GLOVE',
                severity: 'critical',
                detail: 'gants',
            },
            {
                code: 'HAIRNET / NO_HAIRNET',
                severity: 'critical',
                detail: 'charlotte',
            },
            {
                code: 'APRON / NO_APRON',
                severity: 'high',
                detail: 'tablier',
            },
            {
                code: 'PPE_COMPLIANT',
                severity: 'compliant',
                detail: 'conformité totale 3/3',
            },
        ],
    },
};

export const SCENARIO_LIST = [SCENARIOS.bureau, SCENARIOS.cuisine];
