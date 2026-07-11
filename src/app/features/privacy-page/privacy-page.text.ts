import { LanguageCode } from '../../core/i18n/available-languages';

export interface PrivacySection {
  slug: 'data' | 'use' | 'sharing' | 'retention' | 'rights';
  title: string;
  body: string;
}

export interface PrivacyPageUiText {
  intro: { title: string; lead: string };
  sections: ReadonlyArray<PrivacySection>;
  contact: { title: string; body: string; cta: string };
}

const SECTION_SLUGS = ['data', 'use', 'sharing', 'retention', 'rights'] as const;
type SectionSlug = (typeof SECTION_SLUGS)[number];

interface PrivacyContent {
  intro: { title: string; lead: string };
  sections: Record<SectionSlug, { title: string; body: string }>;
  contact: { title: string; body: string; cta: string };
}

function build(content: PrivacyContent): PrivacyPageUiText {
  return {
    intro: content.intro,
    sections: SECTION_SLUGS.map((slug) => ({
      slug,
      title: content.sections[slug].title,
      body: content.sections[slug].body,
    })),
    contact: content.contact,
  };
}

const FR_CONTENT: PrivacyContent = {
  intro: {
    title: 'Politique de confidentialité',
    lead: "Training Manager est édité par Foxugly SRL. Nous respectons votre vie privée et ne collectons que les données nécessaires au fonctionnement du service.",
  },
  sections: {
    data: {
      title: 'Données que nous collectons',
      body: "Les informations de votre compte (nom, adresse email) et les données que vous saisissez pour gérer vos équipes, entraînements et statistiques.",
    },
    use: {
      title: 'Comment nous les utilisons',
      body: "Uniquement pour fournir le service : authentification, gestion de vos équipes et envoi des emails transactionnels (confirmation, réinitialisation de mot de passe).",
    },
    sharing: {
      title: 'Partage avec des tiers',
      body: "Nous ne vendons pas vos données. Elles ne sont partagées qu'avec les prestataires techniques strictement nécessaires (hébergement, envoi d'emails).",
    },
    retention: {
      title: 'Conservation',
      body: 'Vos données sont conservées tant que votre compte est actif. Vous pouvez demander leur suppression à tout moment.',
    },
    rights: {
      title: 'Vos droits',
      body: "Conformément au RGPD, vous pouvez accéder à vos données, les rectifier, les exporter ou en demander l'effacement.",
    },
  },
  contact: {
    title: 'Nous contacter',
    body: 'Pour toute question relative à vos données personnelles, contactez-nous à :',
    cta: 'Envoyer un email',
  },
};

const EN_CONTENT: PrivacyContent = {
  intro: {
    title: 'Privacy Policy',
    lead: 'Training Manager is operated by Foxugly SRL. We respect your privacy and only collect the data required to run the service.',
  },
  sections: {
    data: {
      title: 'Data we collect',
      body: 'Your account details (name, email address) and the data you enter to manage your teams, training sessions and statistics.',
    },
    use: {
      title: 'How we use it',
      body: 'Solely to provide the service: authentication, managing your teams and sending transactional emails (confirmation, password reset).',
    },
    sharing: {
      title: 'Sharing with third parties',
      body: 'We do not sell your data. It is only shared with the technical providers strictly required (hosting, email delivery).',
    },
    retention: {
      title: 'Retention',
      body: 'Your data is kept for as long as your account is active. You may request its deletion at any time.',
    },
    rights: {
      title: 'Your rights',
      body: 'Under the GDPR, you may access, correct, export or request the erasure of your data.',
    },
  },
  contact: {
    title: 'Contact us',
    body: 'For any question about your personal data, reach out to us at:',
    cta: 'Send an email',
  },
};

const NL_CONTENT: PrivacyContent = {
  intro: {
    title: 'Privacybeleid',
    lead: 'Training Manager wordt beheerd door Foxugly SRL. Wij respecteren uw privacy en verzamelen alleen de gegevens die nodig zijn om de dienst te laten werken.',
  },
  sections: {
    data: {
      title: 'Gegevens die we verzamelen',
      body: 'Uw accountgegevens (naam, e-mailadres) en de gegevens die u invoert om uw teams, trainingen en statistieken te beheren.',
    },
    use: {
      title: 'Hoe we ze gebruiken',
      body: 'Uitsluitend om de dienst te leveren: authenticatie, beheer van uw teams en het versturen van transactionele e-mails (bevestiging, wachtwoordherstel).',
    },
    sharing: {
      title: 'Delen met derden',
      body: 'Wij verkopen uw gegevens niet. Ze worden alleen gedeeld met de strikt noodzakelijke technische dienstverleners (hosting, e-mailverzending).',
    },
    retention: {
      title: 'Bewaring',
      body: 'Uw gegevens worden bewaard zolang uw account actief is. U kunt op elk moment om verwijdering vragen.',
    },
    rights: {
      title: 'Uw rechten',
      body: 'Onder de AVG kunt u uw gegevens inzien, corrigeren, exporteren of om verwijdering verzoeken.',
    },
  },
  contact: {
    title: 'Contacteer ons',
    body: 'Voor vragen over uw persoonsgegevens kunt u ons bereiken op:',
    cta: 'Een e-mail sturen',
  },
};

const IT_CONTENT: PrivacyContent = {
  intro: {
    title: 'Informativa sulla privacy',
    lead: 'Training Manager è gestito da Foxugly SRL. Rispettiamo la tua privacy e raccogliamo solo i dati necessari al funzionamento del servizio.',
  },
  sections: {
    data: {
      title: 'Dati che raccogliamo',
      body: "I dati del tuo account (nome, indirizzo email) e i dati che inserisci per gestire squadre, allenamenti e statistiche.",
    },
    use: {
      title: 'Come li utilizziamo',
      body: 'Esclusivamente per fornire il servizio: autenticazione, gestione delle tue squadre e invio di email transazionali (conferma, reimpostazione password).',
    },
    sharing: {
      title: 'Condivisione con terzi',
      body: 'Non vendiamo i tuoi dati. Vengono condivisi solo con i fornitori tecnici strettamente necessari (hosting, invio email).',
    },
    retention: {
      title: 'Conservazione',
      body: 'I tuoi dati sono conservati finché il tuo account è attivo. Puoi richiederne la cancellazione in qualsiasi momento.',
    },
    rights: {
      title: 'I tuoi diritti',
      body: 'Ai sensi del GDPR, puoi accedere ai tuoi dati, rettificarli, esportarli o richiederne la cancellazione.',
    },
  },
  contact: {
    title: 'Contattaci',
    body: 'Per qualsiasi domanda sui tuoi dati personali, scrivici a:',
    cta: 'Invia un’email',
  },
};

const ES_CONTENT: PrivacyContent = {
  intro: {
    title: 'Política de privacidad',
    lead: 'Training Manager está gestionado por Foxugly SRL. Respetamos tu privacidad y solo recopilamos los datos necesarios para el funcionamiento del servicio.',
  },
  sections: {
    data: {
      title: 'Datos que recopilamos',
      body: 'Los datos de tu cuenta (nombre, dirección de correo) y los datos que introduces para gestionar tus equipos, entrenamientos y estadísticas.',
    },
    use: {
      title: 'Cómo los utilizamos',
      body: 'Únicamente para prestar el servicio: autenticación, gestión de tus equipos y envío de correos transaccionales (confirmación, restablecimiento de contraseña).',
    },
    sharing: {
      title: 'Compartir con terceros',
      body: 'No vendemos tus datos. Solo se comparten con los proveedores técnicos estrictamente necesarios (alojamiento, envío de correos).',
    },
    retention: {
      title: 'Conservación',
      body: 'Tus datos se conservan mientras tu cuenta esté activa. Puedes solicitar su eliminación en cualquier momento.',
    },
    rights: {
      title: 'Tus derechos',
      body: 'De acuerdo con el RGPD, puedes acceder a tus datos, rectificarlos, exportarlos o solicitar su supresión.',
    },
  },
  contact: {
    title: 'Contáctanos',
    body: 'Para cualquier pregunta sobre tus datos personales, escríbenos a:',
    cta: 'Enviar un correo',
  },
};

const UI_TEXT: Record<LanguageCode, PrivacyPageUiText> = {
  fr: build(FR_CONTENT),
  en: build(EN_CONTENT),
  nl: build(NL_CONTENT),
  it: build(IT_CONTENT),
  es: build(ES_CONTENT),
};

export function getPrivacyPageUiText(lang: LanguageCode): PrivacyPageUiText {
  return UI_TEXT[lang] ?? UI_TEXT.en;
}
