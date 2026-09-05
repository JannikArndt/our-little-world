// What has changed in our little world.
//
// Not part of the language tables: an entry is written once per language and
// never has to exist in both before it can ship. Reached from the 📜 history,
// which is where somebody curious would look anyway.

export const VERSION = '1.2';

export const CHANGELOG = [
  {
    v: '1.2', date: '2026-09-05',
    en: [
      'Clean water: dig a well in the middle of the village. Until there is one, everybody drinks from the river, and sooner or later somebody gets a poorly tummy — a slow walk home and a sit down, nothing worse.',
      'Build the little house at the bottom of the garden, and what used to end up in the river stops doing so: the water is safe again and the fishing is better for it.',
      'Fence the wheat field. The sheep keep to the meadow — unless you take one in yourself, which still works.',
      'Everything fits on a phone now: nothing hides under the notch, and a card\u2019s buttons are always the last thing on screen.',
      'A world is never thrown away to make room for something new. Adding to the village no longer resets it.',
      'The relay remembers the last world it saw in a room, so opening the page second no longer loses your village.',
    ],
    de: [
      'Sauberes Wasser: grabt einen Brunnen mitten im Dorf. Solange es keinen gibt, trinken alle aus dem Fluss — und irgendwann hat jemand Bauchweh. Langsam nach Hause, hinsetzen, mehr passiert nicht.',
      'Baut das Häuschen hinten im Garten, dann landet nicht mehr alles im Fluss: das Wasser ist wieder in Ordnung, und die Fische kommen zurück.',
      'Zäunt das Weizenfeld ein. Die Schafe bleiben auf der Wiese — außer ihr führt eines selbst hinein, das geht weiterhin.',
      'Alles passt jetzt aufs Handy: nichts versteckt sich hinter der Kamera, und die Knöpfe einer Karte sind immer das Unterste auf dem Bildschirm.',
      'Für etwas Neues wird keine Welt mehr weggeworfen. Das Dorf zu erweitern setzt es nicht zurück.',
      'Der Relay merkt sich die zuletzt gesehene Welt eines Raums — wer die Seite als Zweiter öffnet, verliert sein Dorf nicht mehr.',
    ],
  },
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
