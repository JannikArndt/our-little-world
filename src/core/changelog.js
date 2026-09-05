// What has changed in our little world.
//
// Not part of the language tables: an entry is written once per language and
// never has to exist in both before it can ship. Reached from the 📜 history,
// which is where somebody curious would look anyway.

export const VERSION = '1.1';

export const CHANGELOG = [
  {
    v: '1.1', date: '2026-09-05',
    en: [
      'The guide now says what to do: “Build a house for Ted!” rather than “Ted has nowhere to sleep tonight.”',
      'Whoever the guide names is drawn on the card and ringed out in the world, so you can see who Ted actually is.',
      'Every step that can be counted carries its count — 2/3 🪨 says why a step is ticked.',
      'New: build a fishing boat at the old landing, then take her out and catch supper.',
      'New: build a playground on the green by the water. Lina and Sam will not leave it alone.',
      'New: plant saplings on the stumps. They grow back into trees while you play.',
      'Two children live in the village now.',
    ],
    de: [
      'Der Wegweiser sagt jetzt, was zu tun ist: „Baut ein Haus für Ted!“ statt „Ted hat heute Nacht keinen Schlafplatz.“',
      'Wen der Wegweiser nennt, wird auf der Karte gezeichnet und in der Welt eingekreist — so sieht man, wer Ted überhaupt ist.',
      'Jeder Schritt, den man zählen kann, zeigt seine Zahl — 2/3 🪨 sagt, warum ein Haken da ist.',
      'Neu: am alten Anleger ein Fischerboot bauen und damit Abendessen fangen.',
      'Neu: einen Spielplatz auf der Wiese am Wasser bauen. Lina und Sam gehen da nicht mehr weg.',
      'Neu: Setzlinge auf die Baumstümpfe pflanzen. Sie werden beim Spielen wieder zu Bäumen.',
      'Im Dorf wohnen jetzt zwei Kinder.',
    ],
  },
  {
    v: '1.0', date: '2026-08-01',
    en: [
      'The first little world: a river, a forest, a field, two people who know different things, and five minutes at a time.',
    ],
    de: [
      'Die erste kleine Welt: ein Fluss, ein Wald, ein Feld, zwei Leute, die Verschiedenes können — und immer fünf Minuten.',
    ],
  },
];

/** The entries in whichever language, falling back to English. */
export function changelog(lang) {
  return CHANGELOG.map(e => ({ v: e.v, date: e.date, lines: e[lang] || e.en }));
}
