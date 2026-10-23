// Legal texts shown under Settings → Legal (and linked from the login and onboarding screens).
//
// THESE ARE TEMPLATES. Replace every [placeholder in brackets] with your real details, have the texts
// reviewed by a lawyer / data-protection expert, then set LEGAL_IS_TEMPLATE to false so the
// "template" banner disappears.
export const LEGAL_IS_TEMPLATE = true;

export type LegalDoc = "impressum" | "datenschutz" | "nutzungsbedingungen";
export type LegalSection = { heading?: string; body: string };
export type LegalText = { title: string; updated: string; sections: LegalSection[] };

const UPDATED_DE = "Stand: [Datum, z. B. 1. November 2026]";
const UPDATED_EN = "Last updated: [date, e.g. 1 November 2026]";

const DE: Record<LegalDoc, LegalText> = {
  impressum: {
    title: "Impressum",
    updated: UPDATED_DE,
    sections: [
      { body: "Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)" },
      { heading: "Anbieter", body: "[Vor- und Nachname bzw. Firmenname inkl. Rechtsform]\n[Straße Hausnummer]\n[PLZ Ort]\nDeutschland" },
      { heading: "Kontakt", body: "E-Mail: [kontakt@deine-domain.de]\nTelefon: [+49 …]" },
      { heading: "Vertretungsberechtigt", body: "[Nur bei Firmen: Geschäftsführer/in bzw. Inhaber/in]" },
      { heading: "Registereintrag", body: "[Falls vorhanden: Registergericht und Registernummer, z. B. Amtsgericht Mannheim, HRB …]" },
      { heading: "Umsatzsteuer-ID", body: "[Falls vorhanden: Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG]" },
      { heading: "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV", body: "[Vor- und Nachname, Anschrift wie oben]" },
      { heading: "Inhalte von Nutzerinnen und Nutzern", body: "Events, Deals, Bewertungen und Nachrichten werden von Nutzerinnen und Nutzern bzw. Unternehmen erstellt; für diese Inhalte sind die jeweiligen Ersteller verantwortlich. Rechtswidrige Inhalte kannst du in der App über „Melden“ oder per E-Mail an [kontakt@deine-domain.de] melden. Wir prüfen Meldungen umgehend." },
      { heading: "Verbraucherstreitbeilegung", body: "Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen." },
    ],
  },
  datenschutz: {
    title: "Datenschutzerklärung",
    updated: UPDATED_DE,
    sections: [
      { heading: "1. Verantwortlicher", body: "Verantwortlich für die Datenverarbeitung in LocalLoop ist [Name/Firma, Anschrift, E-Mail] (siehe Impressum). [Falls vorhanden: Datenschutzbeauftragte/r: Name, E-Mail]" },
      { heading: "2. Welche Daten wir verarbeiten", body: "• Konto: E-Mail-Adresse, Name, Profilbild, Kurzbeschreibung, Instagram-Name, Geburtsdatum (für Altersgrenzen), Kontotyp; bei Business-Konten zusätzlich Firmenname, Kategorie, Adresse, Webseite.\n• Anmeldung: Bei Google oder Apple erhalten wir Name und E-Mail-Adresse vom jeweiligen Anbieter; bei der Anmeldung per E-Mail senden wir dir einen Einmal-Code.\n• Nutzung: Check-ins (mit der gewählten Sichtbarkeit), gemerkte Events, Beitrittsanfragen, Chat-Nachrichten, Bewertungen, Crews, gesicherte und eingelöste Deals, Meldungen und Blockierungen, Benachrichtigungen.\n• Selfie zur Identitätsprüfung, falls du sie nutzt.\n• Standort: Er wird auf deinem Gerät genutzt, um die Karte zu zentrieren, Entfernungen zu berechnen und „Vor Ort“ beim Check-in zu erkennen. Deine Koordinaten speichern wir nicht auf unseren Servern; beim Check-in wird nur gespeichert, ob du vor Ort bist.\n• Push-Benachrichtigungen: das Geräte-Token, wenn du Benachrichtigungen erlaubst.\n• Technische Daten: Server-Protokolle (z. B. IP-Adresse, Zeitpunkt), die beim Aufruf der App entstehen." },
      { heading: "3. Zwecke und Rechtsgrundlagen", body: "• Bereitstellung der App und deines Kontos, Events, Chats und Deals: Art. 6 Abs. 1 lit. b DSGVO.\n• Standortzugriff und Push-Benachrichtigungen nur mit deiner Einwilligung in den Systemeinstellungen: Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG. Du kannst sie dort jederzeit widerrufen.\n• Sicherheit, Missbrauchsabwehr und Moderation (Wortfilter, Meldungen): Art. 6 Abs. 1 lit. f DSGVO." },
      { heading: "4. Empfänger und Dienstleister", body: "• Hosting und Datenbank: [Anbieter, z. B. Emergent, Sitz/Land]\n• Versand von Push-Benachrichtigungen: [Anbieter]\n• Anmeldung: Google Ireland Ltd. bzw. Apple Distribution International Ltd.\n• E-Mail-Versand der Anmeldecodes: [z. B. Resend, Inc., USA]\n• Karten: Apple Maps bzw. Google Maps; Kartendaten lädt dein Gerät direkt beim Anbieter.\n• Beispielbilder: Unsplash.\nMit den Dienstleistern bestehen Verträge zur Auftragsverarbeitung nach Art. 28 DSGVO [bitte prüfen]. Für Übermittlungen in Drittländer wie die USA stützen wir uns auf [z. B. das EU-US Data Privacy Framework bzw. Standardvertragsklauseln]." },
      { heading: "5. Was andere sehen", body: "Name, Profilbild, Alter, Kurzbeschreibung und deine Check-ins (je nach gewählter Sichtbarkeit: öffentlich, nur Freunde oder anonym) sind für andere sichtbar. Business-Profile sind öffentlich. Chat-Nachrichten sehen alle Teilnehmenden des jeweiligen Events." },
      { heading: "6. Speicherdauer", body: "Wir speichern deine Daten, solange dein Konto besteht. Wenn du dein Konto löschst (Einstellungen → Konto löschen), entfernen wir Profil, Check-ins, Nachrichten, Bewertungen, Merklisten, Anfragen, Blockierungen und deine Meldungen. Bereits eingelöste Deals bleiben ohne Bezug zu deiner Person für die Statistik des Unternehmens erhalten. Meldungen anderer über dich bewahren wir zur Missbrauchsabwehr bis zu [6 Monate] auf. Server-Protokolle werden nach [7 Tagen] gelöscht." },
      { heading: "7. Deine Rechte", body: "Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21) sowie auf Widerruf erteilter Einwilligungen (Art. 7 Abs. 3). Schreib uns dazu an [datenschutz@deine-domain.de]." },
      { heading: "8. Beschwerderecht", body: "Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei [der für den Anbieter zuständigen Behörde, in Baden-Württemberg: Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg]." },
      { heading: "9. Mindestalter", body: "LocalLoop darf ab 16 Jahren genutzt werden." },
    ],
  },
  nutzungsbedingungen: {
    title: "Nutzungsbedingungen",
    updated: UPDATED_DE,
    sections: [
      { heading: "1. Geltungsbereich", body: "Diese Bedingungen gelten für die Nutzung der App LocalLoop, angeboten von [Anbieter, siehe Impressum]. Mit der Registrierung stimmst du ihnen zu." },
      { heading: "2. Konto und Mindestalter", body: "Die Nutzung ist ab 16 Jahren erlaubt. Deine Angaben müssen der Wahrheit entsprechen; das Geburtsdatum kann nach der Registrierung nicht mehr geändert werden. Events mit Altersfreigabe 18+ werden jüngeren Nutzerinnen und Nutzern nicht angezeigt. Pro Person ist ein Konto erlaubt; gib deine Zugangsdaten nicht weiter." },
      { heading: "3. Community-Richtlinien (keine Toleranz)", body: "Nicht erlaubt sind:\n• Hassrede, Diskriminierung, Belästigung, Mobbing und Drohungen\n• Gewaltverherrlichung und Aufrufe zu Straftaten\n• sexuelle oder pornografische Inhalte\n• Spam, Betrug, Fake-Profile und Fake-Events\n• Inhalte, die Rechte anderer verletzen, und das Veröffentlichen persönlicher Daten anderer\nBeleidigende Wörter werden automatisch gefiltert. Wer gegen die Richtlinien verstößt, kann gesperrt werden." },
      { heading: "4. Melden und Blockieren", body: "Du kannst Profile, Events und Nachrichten melden und Personen blockieren. Wir prüfen Meldungen innerhalb von [24 Stunden], entfernen unzulässige Inhalte und können Konten vorübergehend oder dauerhaft sperren." },
      { heading: "5. Events und Deals", body: "Events werden von Nutzerinnen und Nutzern sowie Unternehmen eingestellt; LocalLoop ist nicht Veranstalter. Deals sind Angebote der jeweiligen Unternehmen. Ein Vertrag über einen Deal kommt ausschließlich mit dem Unternehmen zustande. Jeder Deal gilt pro Person einmal und nur, solange er verfügbar ist." },
      { heading: "6. Deine Inhalte", body: "Du bleibst Inhaber deiner Inhalte (Texte, Bilder, Nachrichten). Du räumst uns das einfache, unentgeltliche Recht ein, sie in der App anzuzeigen, solange dein Konto besteht. Du darfst nur Inhalte hochladen, an denen du die nötigen Rechte hast." },
      { heading: "7. Verfügbarkeit und Haftung", body: "Die Nutzung ist kostenlos. Wir bemühen uns um eine ständige Verfügbarkeit, können sie aber nicht garantieren. Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit. Im Übrigen haften wir nur bei Verletzung wesentlicher Pflichten und begrenzt auf den vorhersehbaren, typischen Schaden." },
      { heading: "8. Kündigung", body: "Du kannst dein Konto jederzeit unter Einstellungen → Konto löschen beenden. Bei Verstößen gegen diese Bedingungen können wir Konten sperren oder löschen." },
      { heading: "9. Änderungen", body: "Wir können diese Bedingungen anpassen, wenn es dafür einen sachlichen Grund gibt. Über wesentliche Änderungen informieren wir dich rechtzeitig in der App." },
      { heading: "10. Anwendbares Recht", body: "Es gilt deutsches Recht. Zwingende Verbraucherschutzvorschriften des Landes, in dem du lebst, bleiben unberührt." },
    ],
  },
};

const EN: Record<LegalDoc, LegalText> = {
  impressum: {
    title: "Legal notice (Impressum)",
    updated: UPDATED_EN,
    sections: [
      { body: "Information pursuant to § 5 German Digital Services Act (DDG)" },
      { heading: "Provider", body: "[First and last name or company name incl. legal form]\n[Street and number]\n[Postcode, city]\nGermany" },
      { heading: "Contact", body: "Email: [contact@your-domain.com]\nPhone: [+49 …]" },
      { heading: "Represented by", body: "[Companies only: managing director / owner]" },
      { heading: "Commercial register", body: "[If applicable: register court and number]" },
      { heading: "VAT ID", body: "[If applicable: VAT identification number pursuant to § 27a UStG]" },
      { heading: "Responsible for content (§ 18 (2) MStV)", body: "[Name, address as above]" },
      { heading: "User content", body: "Events, deals, reviews and messages are created by users and businesses, who are responsible for them. You can report illegal content in the app via “Report” or by email to [contact@your-domain.com]. We review reports promptly." },
      { heading: "Consumer dispute resolution", body: "We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board." },
    ],
  },
  datenschutz: {
    title: "Privacy policy",
    updated: UPDATED_EN,
    sections: [
      { heading: "1. Controller", body: "The controller for data processing in LocalLoop is [name/company, address, email] (see legal notice). [If applicable: data protection officer: name, email]" },
      { heading: "2. Data we process", body: "• Account: email address, name, profile picture, short bio, Instagram name, date of birth (for age limits), account type; for business accounts also business name, category, address, website.\n• Sign-in: with Google or Apple we receive your name and email address from that provider; with email sign-in we send you a one-time code.\n• Usage: check-ins (with the visibility you choose), saved events, join requests, chat messages, reviews, crews, claimed and redeemed deals, reports and blocks, notifications.\n• Selfie for identity verification, if you use it.\n• Location: used on your device to center the map, calculate distances and detect “at venue” when checking in. We don't store your coordinates on our servers; a check-in only stores whether you are at the venue.\n• Push notifications: your device token if you allow notifications.\n• Technical data: server logs (e.g. IP address, time) created when the app is used." },
      { heading: "3. Purposes and legal bases", body: "• Providing the app, your account, events, chats and deals: Art. 6 (1) (b) GDPR.\n• Location access and push notifications only with your consent in the system settings: Art. 6 (1) (a) GDPR, § 25 (1) TDDDG. You can withdraw it there at any time.\n• Security, abuse prevention and moderation (word filter, reports): Art. 6 (1) (f) GDPR." },
      { heading: "4. Recipients and service providers", body: "• Hosting and database: [provider, e.g. Emergent, country]\n• Push notifications: [provider]\n• Sign-in: Google Ireland Ltd. or Apple Distribution International Ltd.\n• Sending sign-in codes by email: [e.g. Resend, Inc., USA]\n• Maps: Apple Maps or Google Maps; your device loads map data directly from the provider.\n• Sample images: Unsplash.\nData processing agreements under Art. 28 GDPR are in place with these providers [please check]. For transfers to third countries such as the USA we rely on [e.g. the EU-US Data Privacy Framework or standard contractual clauses]." },
      { heading: "5. What others see", body: "Your name, profile picture, age, short bio and your check-ins (depending on the visibility you choose: public, friends only or anonymous) are visible to others. Business profiles are public. Chat messages are visible to everyone taking part in that event." },
      { heading: "6. Retention", body: "We keep your data as long as your account exists. When you delete your account (Settings → Delete account) we remove your profile, check-ins, messages, reviews, saved events, requests, blocks and your reports. Deals that were already redeemed stay in the business's statistics without any link to you. Reports by others about you are kept for up to [6 months] to prevent abuse. Server logs are deleted after [7 days]." },
      { heading: "7. Your rights", body: "You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20) and to object (Art. 21), and you can withdraw consent at any time (Art. 7 (3)). Contact us at [privacy@your-domain.com]." },
      { heading: "8. Right to lodge a complaint", body: "You can lodge a complaint with a data protection supervisory authority, for example [the authority responsible for the provider; in Baden-Württemberg: Landesbeauftragter für den Datenschutz und die Informationsfreiheit Baden-Württemberg]." },
      { heading: "9. Minimum age", body: "LocalLoop may be used from the age of 16." },
    ],
  },
  nutzungsbedingungen: {
    title: "Terms of use",
    updated: UPDATED_EN,
    sections: [
      { heading: "1. Scope", body: "These terms apply to the use of the LocalLoop app, provided by [provider, see legal notice]. By registering you agree to them." },
      { heading: "2. Account and minimum age", body: "You must be at least 16 years old. Your details must be true; your date of birth can't be changed after registration. Events rated 18+ are hidden from younger users. One account per person; don't share your login." },
      { heading: "3. Community guidelines (zero tolerance)", body: "Not allowed:\n• hate speech, discrimination, harassment, bullying and threats\n• glorifying violence or calling for crimes\n• sexual or pornographic content\n• spam, fraud, fake profiles and fake events\n• content that infringes others' rights, and publishing other people's personal data\nOffensive words are filtered automatically. Accounts that break these rules can be banned." },
      { heading: "4. Reporting and blocking", body: "You can report profiles, events and messages and block people. We review reports within [24 hours], remove content that breaks the rules and can suspend or ban accounts." },
      { heading: "5. Events and deals", body: "Events are posted by users and businesses; LocalLoop is not the organizer. Deals are offers made by the respective businesses, and any contract about a deal is concluded only with that business. Each deal can be used once per person and only while it is available." },
      { heading: "6. Your content", body: "You keep the rights to your content (texts, images, messages). You grant us a simple, free right to show it in the app as long as your account exists. Only upload content you have the rights to." },
      { heading: "7. Availability and liability", body: "The app is free. We aim for constant availability but can't guarantee it. We are liable without limitation for intent and gross negligence and for injury to life, body or health. Otherwise we are only liable for breaches of essential obligations, limited to the foreseeable, typical damage." },
      { heading: "8. Termination", body: "You can end your account at any time under Settings → Delete account. We can suspend or delete accounts that break these terms." },
      { heading: "9. Changes", body: "We may change these terms for a valid reason and will inform you about significant changes in the app in good time." },
      { heading: "10. Governing law", body: "German law applies. Mandatory consumer protection rules of your country of residence remain unaffected." },
    ],
  },
};

export const LEGAL_DOCS: LegalDoc[] = ["impressum", "datenschutz", "nutzungsbedingungen"];

export function legalText(doc: LegalDoc, lang: string): LegalText {
  return (lang === "de" ? DE : EN)[doc];
}
