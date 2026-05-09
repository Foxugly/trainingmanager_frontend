import { LanguageCode } from '../../core/i18n/available-languages';

export interface ContributeReason {
  slug: 'oss' | 'hosting' | 'maintenance' | 'features';
  icon: string;
  title: string;
  body: string;
}

export interface ContributePageUiText {
  intro: { title: string; lead: string };
  reasons: { title: string; items: ReadonlyArray<ContributeReason> };
  donate: { title: string; intro: string; cta: string; redirect_note: string };
  thanks: { title: string; body: string };
}

const REASON_DEFS = [
  { slug: 'oss', icon: 'pi-code' },
  { slug: 'hosting', icon: 'pi-server' },
  { slug: 'maintenance', icon: 'pi-shield' },
  { slug: 'features', icon: 'pi-sparkles' },
] as const;

type ReasonSlug = typeof REASON_DEFS[number]['slug'];

interface ReasonContent { title: string; body: string }

interface ContributeContent {
  intro: { title: string; lead: string };
  reasons: { title: string; items: Record<ReasonSlug, ReasonContent> };
  donate: { title: string; intro: string; cta: string; redirect_note: string };
  thanks: { title: string; body: string };
}

function build(content: ContributeContent): ContributePageUiText {
  return {
    intro: content.intro,
    reasons: {
      title: content.reasons.title,
      items: REASON_DEFS.map((def) => ({
        slug: def.slug,
        icon: def.icon,
        title: content.reasons.items[def.slug].title,
        body: content.reasons.items[def.slug].body,
      })),
    },
    donate: content.donate,
    thanks: content.thanks,
  };
}

const FR_CONTENT: ContributeContent = {
  intro: {
    title: 'Aidez Training Manager à grandir',
    lead: "Training Manager est un projet libre et open source. Votre soutien permet de maintenir la plateforme, corriger les bugs et développer de nouvelles fonctionnalités.",
  },
  reasons: {
    title: 'Pourquoi soutenir Training Manager ?',
    items: {
      oss: { title: 'Open source et gratuit', body: "Pas d'abonnement, pas de publicité. Le code est libre et le restera." },
      hosting: { title: 'Hébergement et infrastructure', body: "Serveurs, certificats SSL et envoi d'emails ont un coût bien réel." },
      maintenance: { title: 'Maintenance continue', body: 'Mises à jour de sécurité, correctifs et compatibilité avec les nouvelles versions.' },
      features: { title: 'Nouvelles fonctionnalités', body: 'Chaque contribution accélère le développement des fonctionnalités demandées par la communauté.' },
    },
  },
  donate: {
    title: 'Faire un don',
    intro: 'Les dons sont gérés via GitHub Sponsors. Vous pouvez faire un don ponctuel ou mettre en place un soutien récurrent.',
    cta: 'Soutenir sur GitHub Sponsors',
    redirect_note: 'Vous serez redirigé vers GitHub Sponsors dans un nouvel onglet.',
  },
  thanks: { title: 'Merci !', body: 'Chaque contribution, aussi petite soit-elle, fait une différence. Merci de croire en ce projet.' },
};

const EN_CONTENT: ContributeContent = {
  intro: {
    title: 'Help Training Manager grow',
    lead: 'Training Manager is a free, open-source project. Your support helps maintain the platform, fix bugs and develop new features.',
  },
  reasons: {
    title: 'Why support Training Manager?',
    items: {
      oss: { title: 'Open-source and free', body: 'No subscription, no ads. The code is free and will remain so.' },
      hosting: { title: 'Hosting and infrastructure', body: 'Servers, SSL certificates and email delivery have a real cost.' },
      maintenance: { title: 'Ongoing maintenance', body: 'Security updates, bug fixes and compatibility with new releases.' },
      features: { title: 'New features', body: 'Every contribution accelerates the development of community-requested features.' },
    },
  },
  donate: {
    title: 'Make a donation',
    intro: 'Donations are handled through GitHub Sponsors. You can make a one-time donation or set up recurring support.',
    cta: 'Support on GitHub Sponsors',
    redirect_note: 'You will be redirected to GitHub Sponsors in a new tab.',
  },
  thanks: { title: 'Thank you!', body: 'Every contribution, however small, makes a difference. Thank you for believing in this project.' },
};

const NL_CONTENT: ContributeContent = {
  intro: {
    title: 'Help Training Manager groeien',
    lead: 'Training Manager is een vrij, open-source project. Jouw steun helpt het platform te onderhouden, bugs op te lossen en nieuwe functies te ontwikkelen.',
  },
  reasons: {
    title: 'Waarom Training Manager steunen?',
    items: {
      oss: { title: 'Open source en gratis', body: 'Geen abonnement, geen reclame. De code is vrij en blijft dat.' },
      hosting: { title: 'Hosting en infrastructuur', body: 'Servers, SSL-certificaten en e-maillevering hebben een reële kost.' },
      maintenance: { title: 'Doorlopend onderhoud', body: 'Beveiligingsupdates, foutoplossingen en compatibiliteit met nieuwe versies.' },
      features: { title: 'Nieuwe functies', body: 'Elke bijdrage versnelt de ontwikkeling van door de community gevraagde functies.' },
    },
  },
  donate: {
    title: 'Een donatie doen',
    intro: 'Donaties worden afgehandeld via GitHub Sponsors. Je kunt een eenmalige donatie doen of terugkerende steun instellen.',
    cta: 'Steunen op GitHub Sponsors',
    redirect_note: 'Je wordt doorverwezen naar GitHub Sponsors in een nieuw tabblad.',
  },
  thanks: { title: 'Bedankt!', body: 'Elke bijdrage, hoe klein ook, maakt een verschil. Bedankt om in dit project te geloven.' },
};

const IT_CONTENT: ContributeContent = {
  intro: {
    title: 'Aiuta Training Manager a crescere',
    lead: 'Training Manager è un progetto libero e open source. Il tuo sostegno aiuta a mantenere la piattaforma, correggere bug e sviluppare nuove funzionalità.',
  },
  reasons: {
    title: 'Perché sostenere Training Manager?',
    items: {
      oss: { title: 'Open source e gratuito', body: 'Nessun abbonamento, nessuna pubblicità. Il codice è libero e tale rimarrà.' },
      hosting: { title: 'Hosting e infrastruttura', body: 'Server, certificati SSL e invio email hanno un costo reale.' },
      maintenance: { title: 'Manutenzione continua', body: 'Aggiornamenti di sicurezza, correzioni di bug e compatibilità con le nuove versioni.' },
      features: { title: 'Nuove funzionalità', body: 'Ogni contributo accelera lo sviluppo delle funzionalità richieste dalla community.' },
    },
  },
  donate: {
    title: 'Fai una donazione',
    intro: 'Le donazioni sono gestite tramite GitHub Sponsors. Puoi fare una donazione una tantum o impostare un sostegno ricorrente.',
    cta: 'Sostieni su GitHub Sponsors',
    redirect_note: 'Sarai reindirizzato a GitHub Sponsors in una nuova scheda.',
  },
  thanks: { title: 'Grazie!', body: 'Ogni contributo, per quanto piccolo, fa la differenza. Grazie per credere in questo progetto.' },
};

const ES_CONTENT: ContributeContent = {
  intro: {
    title: 'Ayuda a Training Manager a crecer',
    lead: 'Training Manager es un proyecto libre y de código abierto. Tu apoyo ayuda a mantener la plataforma, corregir errores y desarrollar nuevas funciones.',
  },
  reasons: {
    title: '¿Por qué apoyar a Training Manager?',
    items: {
      oss: { title: 'Código abierto y gratuito', body: 'Sin suscripción, sin anuncios. El código es libre y lo seguirá siendo.' },
      hosting: { title: 'Alojamiento e infraestructura', body: 'Servidores, certificados SSL y envío de correos tienen un coste real.' },
      maintenance: { title: 'Mantenimiento continuo', body: 'Actualizaciones de seguridad, correcciones y compatibilidad con nuevas versiones.' },
      features: { title: 'Nuevas funciones', body: 'Cada contribución acelera el desarrollo de las funciones solicitadas por la comunidad.' },
    },
  },
  donate: {
    title: 'Hacer una donación',
    intro: 'Las donaciones se gestionan a través de GitHub Sponsors. Puedes hacer una donación única o configurar un apoyo recurrente.',
    cta: 'Apoyar en GitHub Sponsors',
    redirect_note: 'Serás redirigido a GitHub Sponsors en una nueva pestaña.',
  },
  thanks: { title: '¡Gracias!', body: 'Cada contribución, por pequeña que sea, marca la diferencia. Gracias por creer en este proyecto.' },
};

const FR = build(FR_CONTENT);
const EN = build(EN_CONTENT);
const NL = build(NL_CONTENT);
const IT = build(IT_CONTENT);
const ES = build(ES_CONTENT);

const UI_TEXT: Record<LanguageCode, ContributePageUiText> = { fr: FR, en: EN, nl: NL, it: IT, es: ES };

export function getContributePageUiText(lang: LanguageCode): ContributePageUiText {
  return UI_TEXT[lang] ?? EN;
}
