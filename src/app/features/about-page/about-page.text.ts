import { LanguageCode } from '../../core/i18n/available-languages';

export type AboutTab = 'company' | 'legal' | 'technical';

export type CompanyRowText =
  | { key: 'company' | 'vat'; label: string; kind: 'text'; value: string }
  | { key: 'address'; label: string; kind: 'multiline'; lines: string[] }
  | { key: 'email'; label: string; kind: 'email' }
  | { key: 'phone'; label: string; kind: 'phone' }
  | { key: 'website'; label: string; kind: 'website' };

export interface AboutPageUiText {
  intro: { title: string; lead: string; view_repo: string };
  tabs: { company: string; legal: string; technical: string };
  company: { title: string; lead: string; email_cta: string; rows: ReadonlyArray<CompanyRowText> };
  legal: {
    title: string; lead: string;
    sections: ReadonlyArray<{ slug: string; title: string; items: ReadonlyArray<string> }>;
  };
  technical: {
    title: string; lead: string;
    sections: ReadonlyArray<{ slug: string; title: string; intro: string; items: ReadonlyArray<string> }>;
  };
}

interface CompanyRowContent {
  company: { label: string; value: string };
  vat: { label: string; value: string };
  address: { label: string; lines: string[] };
  email: { label: string };
  phone: { label: string };
  website: { label: string };
}

interface AboutContent {
  intro: { title: string; lead: string; view_repo: string };
  tabs: { company: string; legal: string; technical: string };
  company: { title: string; lead: string; email_cta: string; rows: CompanyRowContent };
  legal: {
    title: string; lead: string;
    controller: { title: string; items: string[] };
    collected: { title: string; items: string[] };
    basis: { title: string; items: string[] };
    rights: { title: string; items: string[] };
    retention: { title: string; items: string[] };
    security: { title: string; items: string[] };
    cookies: { title: string; items: string[] };
  };
  technical: {
    title: string; lead: string;
    repo: { title: string; intro: string; items: string[] };
    backend: { title: string; intro: string; items: string[] };
    frontend: { title: string; intro: string; items: string[] };
  };
}

function build(c: AboutContent): AboutPageUiText {
  return {
    intro: c.intro,
    tabs: c.tabs,
    company: {
      title: c.company.title,
      lead: c.company.lead,
      email_cta: c.company.email_cta,
      rows: [
        { key: 'company', label: c.company.rows.company.label, kind: 'text', value: c.company.rows.company.value },
        { key: 'vat', label: c.company.rows.vat.label, kind: 'text', value: c.company.rows.vat.value },
        { key: 'address', label: c.company.rows.address.label, kind: 'multiline', lines: c.company.rows.address.lines },
        { key: 'email', label: c.company.rows.email.label, kind: 'email' },
        { key: 'phone', label: c.company.rows.phone.label, kind: 'phone' },
        { key: 'website', label: c.company.rows.website.label, kind: 'website' },
      ],
    },
    legal: {
      title: c.legal.title,
      lead: c.legal.lead,
      sections: [
        { slug: 'controller', title: c.legal.controller.title, items: c.legal.controller.items },
        { slug: 'collected', title: c.legal.collected.title, items: c.legal.collected.items },
        { slug: 'basis', title: c.legal.basis.title, items: c.legal.basis.items },
        { slug: 'rights', title: c.legal.rights.title, items: c.legal.rights.items },
        { slug: 'retention', title: c.legal.retention.title, items: c.legal.retention.items },
        { slug: 'security', title: c.legal.security.title, items: c.legal.security.items },
        { slug: 'cookies', title: c.legal.cookies.title, items: c.legal.cookies.items },
      ],
    },
    technical: {
      title: c.technical.title,
      lead: c.technical.lead,
      sections: [
        { slug: 'repo', title: c.technical.repo.title, intro: c.technical.repo.intro, items: c.technical.repo.items },
        { slug: 'backend', title: c.technical.backend.title, intro: c.technical.backend.intro, items: c.technical.backend.items },
        { slug: 'frontend', title: c.technical.frontend.title, intro: c.technical.frontend.intro, items: c.technical.frontend.items },
      ],
    },
  };
}

const FR_CONTENT: AboutContent = {
  intro: {
    title: 'Training Manager',
    lead: "Plateforme de gestion d'équipes, programmes et entraînements pour les coachs : planification, présences, suivi et génération assistée par IA des séances.",
    view_repo: 'Voir le dépôt',
  },
  tabs: { company: 'Société', legal: 'Mentions légales', technical: 'Technique' },
  company: {
    title: 'Société',
    lead: 'Informations légales et coordonnées de la société qui édite Training Manager.',
    email_cta: 'Envoyez-moi un email',
    rows: {
      company: { label: 'Société', value: 'Foxugly SRL' },
      vat: { label: 'TVA / BCE', value: 'BE 1004.770.045' },
      address: { label: 'Adresse', lines: ['rue Nicolas Defrêcheux 22', '1030 Schaerbeek', 'Belgique'] },
      email: { label: 'Email' },
      phone: { label: 'Téléphone' },
      website: { label: 'Site' },
    },
  },
  legal: {
    title: 'Mentions légales et protection des données',
    lead: 'Training Manager respecte les réglementations européennes en matière de protection des données personnelles.',
    controller: {
      title: 'Responsable du traitement',
      items: [
        "Le responsable du traitement est l'administrateur de l'instance Training Manager déployée.",
        "Pour toute question sur vos données personnelles, contactez l'administrateur de votre instance.",
      ],
    },
    collected: {
      title: 'Données collectées',
      items: [
        "Données d'identification : nom d'utilisateur, adresse email, prénom, nom.",
        "Données d'activité : équipes, programmes, séances, présences, préférences de langue.",
        'Données techniques : journaux de connexion strictement nécessaires à la sécurité.',
      ],
    },
    basis: {
      title: 'Base légale et finalités (RGPD art. 6)',
      items: [
        "Exécution d'un contrat : gestion de votre compte, organisation de vos équipes et suivi de vos séances.",
        'Intérêt légitime : sécurité de la plateforme, prévention des abus, amélioration du service.',
        'Consentement : envoi de notifications optionnelles (révocable à tout moment).',
      ],
    },
    rights: {
      title: 'Vos droits (RGPD art. 15-22)',
      items: [
        "Droit d'accès : obtenir une copie de vos données personnelles.",
        'Droit de rectification : corriger des données inexactes ou incomplètes.',
        "Droit à l'effacement : demander la suppression de vos données.",
        'Droit à la portabilité : recevoir vos données dans un format structuré et lisible.',
        "Droit d'opposition : vous opposer au traitement dans certains cas.",
        'Droit de réclamation : déposer une plainte auprès de votre autorité de contrôle nationale.',
      ],
    },
    retention: {
      title: 'Conservation des données',
      items: [
        'Les données de compte sont conservées pendant la durée de votre inscription.',
        "Les données d'équipes et de séances sont conservées tant que l'équipe est active.",
        "Lors de la suppression d'un compte, vos données personnelles sont supprimées ou anonymisées sous 30 jours.",
      ],
    },
    security: {
      title: 'Sécurité',
      items: [
        'Les communications sont chiffrées via HTTPS/TLS.',
        "Les mots de passe sont hachés à l'aide d'un algorithme irréversible (PBKDF2).",
        "L'authentification repose sur des jetons JWT à durée de vie courte.",
      ],
    },
    cookies: {
      title: 'Cookies',
      items: [
        "Training Manager n'utilise pas de cookies de pistage ni de cookies publicitaires.",
        'Seuls les cookies techniques strictement nécessaires (session, préférence de langue) sont utilisés.',
      ],
    },
  },
  technical: {
    title: 'Détails techniques',
    lead: "Le projet est composé d'un frontend Angular et d'un backend Django partageant un contrat OpenAPI.",
    repo: {
      title: 'Dépôt',
      intro: 'Code source, CI et artefacts de contrat sont hébergés sur GitHub.',
      items: ['Repos séparés : trainingmanager_frontend (Angular) et trainingmanager (Django).', 'CI GitHub Actions sur les deux côtés.'],
    },
    backend: {
      title: 'Backend',
      intro: 'API REST, règles métier et sécurité applicative.',
      items: ['Django · Django REST Framework', 'drf-spectacular (OpenAPI)', 'Simple JWT · django-filter · django-parler', 'Celery'],
    },
    frontend: {
      title: 'Frontend',
      intro: "Single-page app pour l'administration et l'accès aux séances.",
      items: ['Angular 21 · TypeScript 5.9 (strict)', 'PrimeNG 21 · Tailwind 4', 'Transloco 8', 'Vitest 4 · openapi-generator-cli'],
    },
  },
};

const EN_CONTENT: AboutContent = {
  intro: {
    title: 'Training Manager',
    lead: 'Team, program and training session management for coaches: scheduling, attendance, tracking, and AI-assisted session generation.',
    view_repo: 'View repository',
  },
  tabs: { company: 'Company', legal: 'Legal notice', technical: 'Technical' },
  company: {
    title: 'Company',
    lead: 'Legal information and contact details of the company that operates Training Manager.',
    email_cta: 'Send me an email',
    rows: {
      company: { label: 'Company', value: 'Foxugly SRL' },
      vat: { label: 'VAT / BCE', value: 'BE 1004.770.045' },
      address: { label: 'Address', lines: ['rue Nicolas Defrêcheux 22', '1030 Schaerbeek', 'Belgium'] },
      email: { label: 'Email' },
      phone: { label: 'Phone' },
      website: { label: 'Website' },
    },
  },
  legal: {
    title: 'Legal notice & data protection',
    lead: 'Training Manager complies with European regulations on personal data protection.',
    controller: {
      title: 'Data controller',
      items: [
        'The data controller is the administrator of the deployed Training Manager instance.',
        'For any question regarding your personal data, contact the administrator of your instance.',
      ],
    },
    collected: {
      title: 'Data collected',
      items: [
        'Identification data: username, email address, first name, last name.',
        'Activity data: teams, programs, sessions, attendance, language preferences.',
        'Technical data: connection logs strictly necessary for security.',
      ],
    },
    basis: {
      title: 'Legal basis and purposes (GDPR Art. 6)',
      items: [
        'Performance of a contract: managing your account, organizing your teams and tracking your sessions.',
        'Legitimate interest: platform security, abuse prevention, service improvement.',
        'Consent: sending optional notifications (revocable at any time).',
      ],
    },
    rights: {
      title: 'Your rights (GDPR Art. 15-22)',
      items: [
        'Right of access: obtain a copy of your personal data.',
        'Right to rectification: correct inaccurate or incomplete data.',
        'Right to erasure: request the deletion of your data.',
        'Right to data portability: receive your data in a structured, readable format.',
        'Right to object: object to processing in certain cases.',
        'Right to lodge a complaint: file a complaint with your national supervisory authority.',
      ],
    },
    retention: {
      title: 'Data retention',
      items: [
        'Account data is retained for the duration of your registration.',
        'Team and session data is retained as long as the team is active.',
        'Upon account deletion, your personal data is deleted or anonymized within 30 days.',
      ],
    },
    security: {
      title: 'Security',
      items: [
        'Communications are encrypted via HTTPS/TLS.',
        'Passwords are hashed using an irreversible algorithm (PBKDF2).',
        'Authentication relies on short-lived JWT tokens.',
      ],
    },
    cookies: {
      title: 'Cookies',
      items: [
        'Training Manager does not use tracking cookies or advertising cookies.',
        'Only strictly necessary technical cookies (session, language preference) are used.',
      ],
    },
  },
  technical: {
    title: 'Technical details',
    lead: 'The project consists of an Angular frontend and a Django backend sharing an OpenAPI contract.',
    repo: {
      title: 'Repository',
      intro: 'Source code, CI and contract artifacts are hosted on GitHub.',
      items: ['Separate repos: trainingmanager_frontend (Angular) and trainingmanager (Django).', 'GitHub Actions CI on both sides.'],
    },
    backend: {
      title: 'Backend',
      intro: 'REST API, business rules and application security.',
      items: ['Django · Django REST Framework', 'drf-spectacular (OpenAPI)', 'Simple JWT · django-filter · django-parler', 'Celery'],
    },
    frontend: {
      title: 'Frontend',
      intro: 'Single-page app for administration and session access.',
      items: ['Angular 21 · TypeScript 5.9 (strict)', 'PrimeNG 21 · Tailwind 4', 'Transloco 8', 'Vitest 4 · openapi-generator-cli'],
    },
  },
};

const NL_CONTENT: AboutContent = {
  intro: {
    title: 'Training Manager',
    lead: "Beheer van teams, programma's en trainingen voor coaches: planning, aanwezigheden, opvolging en AI-ondersteunde sessieaanmaak.",
    view_repo: 'Repository bekijken',
  },
  tabs: { company: 'Bedrijf', legal: 'Juridische vermeldingen', technical: 'Technisch' },
  company: {
    title: 'Bedrijf',
    lead: 'Juridische informatie en contactgegevens van het bedrijf dat Training Manager beheert.',
    email_cta: 'Stuur me een e-mail',
    rows: {
      company: { label: 'Bedrijf', value: 'Foxugly SRL' },
      vat: { label: 'BTW / KBO', value: 'BE 1004.770.045' },
      address: { label: 'Adres', lines: ['rue Nicolas Defrêcheux 22', '1030 Schaarbeek', 'België'] },
      email: { label: 'E-mail' },
      phone: { label: 'Telefoon' },
      website: { label: 'Website' },
    },
  },
  legal: {
    title: 'Juridische vermeldingen en gegevensbescherming',
    lead: 'Training Manager voldoet aan de Europese regelgeving inzake bescherming van persoonsgegevens.',
    controller: {
      title: 'Verwerkingsverantwoordelijke',
      items: [
        'De verwerkingsverantwoordelijke is de beheerder van de ingezette Training Manager-instantie.',
        'Voor vragen over je persoonsgegevens, neem contact op met de beheerder van je instantie.',
      ],
    },
    collected: {
      title: 'Verzamelde gegevens',
      items: [
        'Identificatiegegevens: gebruikersnaam, e-mailadres, voornaam, achternaam.',
        "Activiteitsgegevens: teams, programma's, sessies, aanwezigheden, taalvoorkeuren.",
        'Technische gegevens: verbindingslogs die strikt noodzakelijk zijn voor de beveiliging.',
      ],
    },
    basis: {
      title: 'Rechtsgrond en doeleinden (AVG art. 6)',
      items: [
        'Uitvoering van een overeenkomst: beheer van je account, organisatie van je teams en opvolging van je sessies.',
        'Gerechtvaardigd belang: beveiliging van het platform, misbruikpreventie, verbetering van de dienst.',
        'Toestemming: verzenden van optionele meldingen (op elk moment intrekbaar).',
      ],
    },
    rights: {
      title: 'Je rechten (AVG art. 15-22)',
      items: [
        'Recht op inzage: een kopie van je persoonsgegevens verkrijgen.',
        'Recht op rectificatie: onjuiste of onvolledige gegevens corrigeren.',
        'Recht op wissing: verzoeken om verwijdering van je gegevens.',
        'Recht op gegevensoverdraagbaarheid: je gegevens ontvangen in een gestructureerd, leesbaar formaat.',
        'Recht van bezwaar: bezwaar maken tegen verwerking in bepaalde gevallen.',
        'Recht om een klacht in te dienen: een klacht indienen bij je nationale toezichthoudende autoriteit.',
      ],
    },
    retention: {
      title: 'Bewaring van gegevens',
      items: [
        'Accountgegevens worden bewaard voor de duur van je inschrijving.',
        'Team- en sessiegegevens worden bewaard zolang het team actief is.',
        'Bij verwijdering van een account worden je persoonsgegevens binnen 30 dagen verwijderd of geanonimiseerd.',
      ],
    },
    security: {
      title: 'Beveiliging',
      items: [
        'Communicatie is versleuteld via HTTPS/TLS.',
        'Wachtwoorden worden gehasht met een onomkeerbaar algoritme (PBKDF2).',
        'Authenticatie is gebaseerd op kortlevende JWT-tokens.',
      ],
    },
    cookies: {
      title: 'Cookies',
      items: [
        'Training Manager gebruikt geen tracking- of advertentiecookies.',
        'Alleen strikt noodzakelijke technische cookies (sessie, taalvoorkeur) worden gebruikt.',
      ],
    },
  },
  technical: {
    title: 'Technische details',
    lead: 'Het project bestaat uit een Angular-frontend en een Django-backend die een OpenAPI-contract delen.',
    repo: {
      title: 'Repository',
      intro: 'Broncode, CI en contractartefacten worden gehost op GitHub.',
      items: ['Gescheiden repos: trainingmanager_frontend (Angular) en trainingmanager (Django).', 'GitHub Actions CI aan beide kanten.'],
    },
    backend: {
      title: 'Backend',
      intro: 'REST-API, businessregels en applicatiebeveiliging.',
      items: ['Django · Django REST Framework', 'drf-spectacular (OpenAPI)', 'Simple JWT · django-filter · django-parler', 'Celery'],
    },
    frontend: {
      title: 'Frontend',
      intro: 'Single-page app voor administratie en toegang tot sessies.',
      items: ['Angular 21 · TypeScript 5.9 (strict)', 'PrimeNG 21 · Tailwind 4', 'Transloco 8', 'Vitest 4 · openapi-generator-cli'],
    },
  },
};

const IT_CONTENT: AboutContent = {
  intro: {
    title: 'Training Manager',
    lead: 'Gestione di squadre, programmi e sessioni di allenamento per coach: pianificazione, presenze, monitoraggio e generazione assistita da IA delle sessioni.',
    view_repo: 'Vedi il repository',
  },
  tabs: { company: 'Azienda', legal: 'Note legali', technical: 'Tecnico' },
  company: {
    title: 'Azienda',
    lead: 'Informazioni legali e dati di contatto della società che gestisce Training Manager.',
    email_cta: 'Inviami un email',
    rows: {
      company: { label: 'Società', value: 'Foxugly SRL' },
      vat: { label: 'P.IVA / BCE', value: 'BE 1004.770.045' },
      address: { label: 'Indirizzo', lines: ['rue Nicolas Defrêcheux 22', '1030 Schaerbeek', 'Belgio'] },
      email: { label: 'Email' },
      phone: { label: 'Telefono' },
      website: { label: 'Sito web' },
    },
  },
  legal: {
    title: 'Note legali e protezione dei dati',
    lead: 'Training Manager rispetta le normative europee in materia di protezione dei dati personali.',
    controller: {
      title: 'Titolare del trattamento',
      items: [
        "Il titolare del trattamento è l'amministratore dell'istanza Training Manager distribuita.",
        "Per qualsiasi domanda sui tuoi dati personali, contatta l'amministratore della tua istanza.",
      ],
    },
    collected: {
      title: 'Dati raccolti',
      items: [
        'Dati di identificazione: nome utente, indirizzo email, nome, cognome.',
        'Dati di attività: squadre, programmi, sessioni, presenze, preferenze di lingua.',
        'Dati tecnici: log di connessione strettamente necessari per la sicurezza.',
      ],
    },
    basis: {
      title: 'Base giuridica e finalità (GDPR art. 6)',
      items: [
        'Esecuzione di un contratto: gestione del tuo account, organizzazione delle squadre e monitoraggio delle sessioni.',
        'Interesse legittimo: sicurezza della piattaforma, prevenzione degli abusi, miglioramento del servizio.',
        'Consenso: invio di notifiche opzionali (revocabile in qualsiasi momento).',
      ],
    },
    rights: {
      title: 'I tuoi diritti (GDPR art. 15-22)',
      items: [
        'Diritto di accesso: ottenere una copia dei tuoi dati personali.',
        'Diritto di rettifica: correggere dati inesatti o incompleti.',
        'Diritto alla cancellazione: richiedere la cancellazione dei tuoi dati.',
        'Diritto alla portabilità: ricevere i tuoi dati in un formato strutturato e leggibile.',
        'Diritto di opposizione: opporti al trattamento in determinati casi.',
        "Diritto di reclamo: presentare un reclamo all'autorità di controllo nazionale.",
      ],
    },
    retention: {
      title: 'Conservazione dei dati',
      items: [
        "I dati dell'account sono conservati per la durata della tua iscrizione.",
        'I dati di squadre e sessioni sono conservati finché la squadra è attiva.',
        "Alla cancellazione di un account, i tuoi dati personali vengono eliminati o anonimizzati entro 30 giorni.",
      ],
    },
    security: {
      title: 'Sicurezza',
      items: [
        'Le comunicazioni sono cifrate tramite HTTPS/TLS.',
        'Le password sono sottoposte a hashing con un algoritmo irreversibile (PBKDF2).',
        "L'autenticazione si basa su token JWT a breve durata.",
      ],
    },
    cookies: {
      title: 'Cookie',
      items: [
        'Training Manager non utilizza cookie di tracciamento o pubblicitari.',
        'Vengono utilizzati solo cookie tecnici strettamente necessari (sessione, preferenza di lingua).',
      ],
    },
  },
  technical: {
    title: 'Dettagli tecnici',
    lead: 'Il progetto è composto da un frontend Angular e un backend Django che condividono un contratto OpenAPI.',
    repo: {
      title: 'Repository',
      intro: 'Codice sorgente, CI e artefatti del contratto sono ospitati su GitHub.',
      items: ['Repo separati: trainingmanager_frontend (Angular) e trainingmanager (Django).', 'CI GitHub Actions su entrambi i lati.'],
    },
    backend: {
      title: 'Backend',
      intro: 'API REST, regole di business e sicurezza applicativa.',
      items: ['Django · Django REST Framework', 'drf-spectacular (OpenAPI)', 'Simple JWT · django-filter · django-parler', 'Celery'],
    },
    frontend: {
      title: 'Frontend',
      intro: "Single-page app per l'amministrazione e l'accesso alle sessioni.",
      items: ['Angular 21 · TypeScript 5.9 (strict)', 'PrimeNG 21 · Tailwind 4', 'Transloco 8', 'Vitest 4 · openapi-generator-cli'],
    },
  },
};

const ES_CONTENT: AboutContent = {
  intro: {
    title: 'Training Manager',
    lead: 'Gestión de equipos, programas y sesiones de entrenamiento para coaches: planificación, asistencias, seguimiento y generación de sesiones asistida por IA.',
    view_repo: 'Ver el repositorio',
  },
  tabs: { company: 'Empresa', legal: 'Aviso legal', technical: 'Técnico' },
  company: {
    title: 'Empresa',
    lead: 'Información legal y datos de contacto de la empresa que gestiona Training Manager.',
    email_cta: 'Enviarme un correo',
    rows: {
      company: { label: 'Empresa', value: 'Foxugly SRL' },
      vat: { label: 'IVA / BCE', value: 'BE 1004.770.045' },
      address: { label: 'Dirección', lines: ['rue Nicolas Defrêcheux 22', '1030 Schaerbeek', 'Bélgica'] },
      email: { label: 'Correo' },
      phone: { label: 'Teléfono' },
      website: { label: 'Sitio web' },
    },
  },
  legal: {
    title: 'Aviso legal y protección de datos',
    lead: 'Training Manager cumple con las normativas europeas en materia de protección de datos personales.',
    controller: {
      title: 'Responsable del tratamiento',
      items: [
        'El responsable del tratamiento es el administrador de la instancia desplegada de Training Manager.',
        'Para cualquier consulta sobre tus datos personales, ponte en contacto con el administrador de tu instancia.',
      ],
    },
    collected: {
      title: 'Datos recopilados',
      items: [
        'Datos de identificación: nombre de usuario, dirección de correo electrónico, nombre, apellidos.',
        'Datos de actividad: equipos, programas, sesiones, asistencias, preferencias de idioma.',
        'Datos técnicos: registros de conexión estrictamente necesarios para la seguridad.',
      ],
    },
    basis: {
      title: 'Base legal y finalidades (RGPD art. 6)',
      items: [
        'Ejecución de un contrato: gestión de tu cuenta, organización de tus equipos y seguimiento de tus sesiones.',
        'Interés legítimo: seguridad de la plataforma, prevención de abusos, mejora del servicio.',
        'Consentimiento: envío de notificaciones opcionales (revocable en cualquier momento).',
      ],
    },
    rights: {
      title: 'Tus derechos (RGPD art. 15-22)',
      items: [
        'Derecho de acceso: obtener una copia de tus datos personales.',
        'Derecho de rectificación: corregir datos inexactos o incompletos.',
        'Derecho de supresión: solicitar la eliminación de tus datos.',
        'Derecho a la portabilidad: recibir tus datos en un formato estructurado y legible.',
        'Derecho de oposición: oponerte al tratamiento en determinados casos.',
        'Derecho de reclamación: presentar una reclamación ante tu autoridad de control nacional.',
      ],
    },
    retention: {
      title: 'Conservación de datos',
      items: [
        'Los datos de cuenta se conservan durante la duración de tu inscripción.',
        'Los datos de equipos y sesiones se conservan mientras el equipo esté activo.',
        'Al eliminar una cuenta, tus datos personales se eliminan o anonimizan en un plazo de 30 días.',
      ],
    },
    security: {
      title: 'Seguridad',
      items: [
        'Las comunicaciones están cifradas mediante HTTPS/TLS.',
        'Las contraseñas se cifran con un algoritmo irreversible (PBKDF2).',
        'La autenticación se basa en tokens JWT de corta duración.',
      ],
    },
    cookies: {
      title: 'Cookies',
      items: [
        'Training Manager no utiliza cookies de seguimiento ni publicitarias.',
        'Solo se utilizan cookies técnicas estrictamente necesarias (sesión, preferencia de idioma).',
      ],
    },
  },
  technical: {
    title: 'Detalles técnicos',
    lead: 'El proyecto consta de un frontend Angular y un backend Django que comparten un contrato OpenAPI.',
    repo: {
      title: 'Repositorio',
      intro: 'Código fuente, CI y artefactos del contrato se alojan en GitHub.',
      items: ['Repos separados: trainingmanager_frontend (Angular) y trainingmanager (Django).', 'CI GitHub Actions en ambos lados.'],
    },
    backend: {
      title: 'Backend',
      intro: 'API REST, reglas de negocio y seguridad de la aplicación.',
      items: ['Django · Django REST Framework', 'drf-spectacular (OpenAPI)', 'Simple JWT · django-filter · django-parler', 'Celery'],
    },
    frontend: {
      title: 'Frontend',
      intro: 'Single-page app para la administración y el acceso a las sesiones.',
      items: ['Angular 21 · TypeScript 5.9 (strict)', 'PrimeNG 21 · Tailwind 4', 'Transloco 8', 'Vitest 4 · openapi-generator-cli'],
    },
  },
};

const FR = build(FR_CONTENT);
const EN = build(EN_CONTENT);
const NL = build(NL_CONTENT);
const IT = build(IT_CONTENT);
const ES = build(ES_CONTENT);

const UI_TEXT: Record<LanguageCode, AboutPageUiText> = { fr: FR, en: EN, nl: NL, it: IT, es: ES };

export function getAboutPageUiText(lang: LanguageCode): AboutPageUiText {
  return UI_TEXT[lang] ?? EN;
}
