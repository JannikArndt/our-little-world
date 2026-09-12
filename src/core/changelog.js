// What has changed in our little world.
//
// Not part of the language tables: an entry is written once per language and
// never has to exist in both before it can ship. Reached from the 📜 history,
// which is where somebody curious would look anyway.

export const VERSION = '2.0';

export const CHANGELOG = [
  {
    v: '2.0', date: '2026-09-12',
    en: [
      'Tap anything and it still tells you what it needs — but when it is the other player\'s job, it says so instead of offering to send them a message. Two people in the same room can just say it out loud, and that is rather the point of playing this together.',
      'Pinching to zoom stays where you put it. Two fingers coming off a pinch looked exactly like the double tap that means "show me the whole world", so the zoom you had just chosen was thrown straight away — which is why it only worked sometimes. The world now also grows out of the spot between your fingers rather than the middle of the screen.',
      'Tapping the green past the edge of the map no longer offers to build a road out there. It puts away whatever was open, which is what that tap is usually for.',
      'The river is widest where it runs off the top and the bottom of the map, and narrowest where the bridge goes. It used to pinch tighter at the edges than at the crossing, so the one place you are told to build looked like the wrong one.',
      'Nothing pops up after you lay a road. The road is right there on the ground.',
    ],
    de: [
      'Tipp etwas an, und es sagt weiterhin, was es braucht — aber wenn es die Aufgabe des anderen ist, sagt es das, statt anzubieten, eine Nachricht rüberzuschicken. Zwei Leute in einem Zimmer können sich das einfach sagen, und genau darum spielt man das zusammen.',
      'Der Zoom bleibt, wo du ihn hingezogen hast. Zwei Finger, die von einer Zoomgeste hochgehen, sahen genauso aus wie das Doppeltippen für „zeig mir die ganze Welt“ — deshalb ging der gerade gewählte Zoom sofort wieder verloren, und deshalb hat es nur manchmal geklappt. Außerdem wächst die Welt jetzt aus der Stelle zwischen deinen Fingern heraus statt aus der Bildmitte.',
      'Ein Tipp ins Grüne jenseits des Kartenrands bietet nicht mehr an, dort draußen einen Weg zu bauen. Er schließt, was offen war — dafür tippt man da meistens hin.',
      'Der Fluss ist oben und unten am Kartenrand am breitesten und genau dort am schmalsten, wo die Brücke hin soll. Vorher war er an den Rändern enger als an der Furt, und damit sah die eine vorgesehene Stelle nach der falschen aus.',
      'Nach einem gebauten Weg erscheint keine Meldung mehr. Der Weg liegt ja da.',
    ],
  },
  {
    v: '1.9', date: '2026-09-12',
    en: [
      'Tap somebody and they answer. No card, no sentence to read: their name floats up over their head and they wave, wink, hop, or go bashful and trot a few tiles off.',
      'And there is more to catch them at. People dance, run, sit down, stop and natter in twos — and every so often two of them have a little squabble, which a tap breaks up with hearts over both of them.',
      'A new 👥 in the top row lists everybody: their name, whose house they live in, what they want, and what they are up to this minute. Tap a row and the world goes to them, with a ring round them so you know which one they are. The sheep are in there too.',
      'The village basket says more than a number now. How many loaves are in it, how many the village eats in a day, and how many days that leaves — so six people eating three a day makes seven loaves about two days, and somebody moving into a new house makes it fewer.',
      'Fill the basket and people come and eat. They notice bread arriving instead of waiting until they are starving, they walk over, and you can watch them eat it.',
      'The mill shows what the percentage means. The ring round the stone fills as you turn it and ten boxes fill one by one beside the number, so seven out of ten and 70% say the same thing at the same time.',
      'The sawmill has a second level. Cut three logs perfectly and the dashed planks above the log go away: what is left is 4 × 3 and the ruler underneath.',
      'A road you laid could disappear on your own screen while standing perfectly well on the other. It cannot any more — nothing you do gets taken back by a message that left before you did it.',
      'And the game fetches a newer version by itself, once you are not in the middle of anything. It saves the village first, and comes back on the same world a blink later.',
    ],
    de: [
      'Tipp jemanden an, und er antwortet. Keine Karte, kein Satz zum Lesen: sein Name schwebt über seinem Kopf, und er winkt, zwinkert, hüpft — oder wird verlegen und trabt ein paar Felder weiter.',
      'Und es gibt mehr zu entdecken. Die Leute tanzen, rennen, setzen sich hin, bleiben zu zweit stehen und quatschen — und ab und zu zanken sich zwei, was ein Antippen mit Herzchen über beiden beendet.',
      'Neu oben in der Reihe: 👥 zeigt alle. Wie sie heißen, in wessen Haus sie wohnen, was sie brauchen und was sie gerade machen. Tipp eine Zeile an, und die Welt fährt zu ihnen hin, mit einem Ring drum herum. Die Schafe stehen auch mit drin.',
      'Der Dorfkorb sagt mehr als eine Zahl. Wie viele Brote drin sind, wie viele das Dorf am Tag isst und wie viele Tage das reicht — sechs Leute, drei Brote am Tag, sieben Brote also ungefähr zwei Tage. Und wenn jemand ins neue Haus einzieht, werden es weniger.',
      'Füll den Korb, und die Leute kommen und essen. Sie merken jetzt, wenn Brot ankommt, statt zu warten, bis sie fast verhungern — sie laufen hin, und man kann ihnen beim Essen zusehen.',
      'Die Mühle zeigt, was die Prozente bedeuten. Der Ring um den Stein füllt sich beim Drehen, und daneben füllen sich zehn Kästchen eins nach dem anderen: sieben von zehn und 70 % sagen dasselbe.',
      'Die Sägerei hat eine zweite Stufe. Schneide drei Stämme perfekt, und die gestrichelten Bretter über dem Stamm verschwinden: übrig bleiben 4 × 3 und das Lineal darunter.',
      'Ein Weg, den du gebaut hast, konnte auf deinem eigenen Bildschirm verschwinden, während er auf dem anderen bestens dalag. Das geht nicht mehr — nichts, was du tust, wird von einer Nachricht zurückgenommen, die vorher losgeschickt wurde.',
      'Und das Spiel holt sich eine neuere Fassung von allein, sobald du gerade nichts Wichtiges machst. Vorher wird das Dorf gespeichert, und einen Wimpernschlag später ist dieselbe Welt wieder da.',
    ],
  },
  {
    v: '1.8', date: '2026-09-10',
    en: [
      'Felling a tree is a different job. No more wind and no more choosing a side: there is one big tree, and you cut the notch into it yourself. A mark shows where the axe should land and moves to the other lip of the notch after every swing, so each one has to be aimed.',
      'And the rule you can see: every clean bite is a log. They stack up on the grass beside you while you work, and that pile is what the tree gives — so a carefully cut tree is worth more than a hacked-at one.',
      'The more trees you have had down, the bigger the mark you have to hit. Your hand is drawn at the top of the picture, with an axe for every step you have earned.',
      'Nothing pops up afterwards to tell you what happened. The tree goes over, the logs are lying there, and that is the whole story.',
    ],
    de: [
      'Bäume fällt man jetzt anders. Kein Wind mehr und keine Seite mehr auszusuchen: da steht ein großer Baum, und die Kerbe schlägst du selbst hinein. Eine Markierung zeigt, wo die Axt hin soll, und wandert nach jedem Hieb auf die andere Kante der Kerbe — jeder Schlag will also gezielt sein.',
      'Und die Regel sieht man: jeder saubere Hieb ist ein Stamm. Sie stapeln sich neben dir im Gras, während du arbeitest, und dieser Stapel ist das, was der Baum hergibt — ein sorgfältig geschlagener Baum ist mehr wert als ein zerhackter.',
      'Je mehr Bäume du schon umgelegt hast, desto größer ist die Markierung, die du treffen musst. Oben im Bild steht, wie geübt deine Hand ist, mit einer Axt für jede Stufe.',
      'Hinterher springt nichts mehr auf, um zu erzählen, was passiert ist. Der Baum fällt, die Stämme liegen da, und das ist die ganze Geschichte.',
    ],
  },
  {
    v: '1.7', date: '2026-09-10',
    en: [
      'Nothing is laid over the village any more. What needs doing has moved behind your own chip, where a red number says how many things are waiting — so the tree you were about to fell is never hidden under a card that comes straight back when you tap it away.',
      'And it is the whole list now. Three things wrong means three lines, each one opening the card that explains it, instead of only the most pressing one.',
      'Your own chip also keeps a tally of what you have done: felled three trees, built a house, harvested six fields.',
      'The world can be pushed further about, far enough to bring any corner of it into the middle of the screen, so anything at all can be tapped in clear air.',
    ],
    de: [
      'Über dem Dorf liegt nichts mehr. Was zu tun ist, steht jetzt hinter dem eigenen Schild, mit einer roten Zahl davor, wie viel wartet — der Baum, den du gerade fällen wolltest, verschwindet nicht mehr unter einer Karte, die nach dem Wegtippen sofort wiederkommt.',
      'Und es ist die ganze Liste. Drei Dinge im Argen heißt drei Zeilen, jede öffnet ihre eigene Erklärung — nicht mehr nur die dringendste.',
      'Hinter dem eigenen Schild steht außerdem, was du geschafft hast: drei Bäume gefällt, ein Haus gebaut, sechs Felder geerntet.',
      'Die Welt lässt sich weiter verschieben — weit genug, um jede Ecke in die Mitte des Bildschirms zu holen, damit alles im Freien angetippt werden kann.',
    ],
  },
  {
    v: '1.6', date: '2026-09-10',
    en: [
      'The top row is tidier. Your own chip now holds what needs doing and what you can do, one skill to a line, so you can see at a glance what this pair of hands is for.',
      'The language, what is new, fetching the game again and the ways out have moved behind the day, on the right — out of the way of playing, and still one tap away.',
      'A few menu rows had been showing their picture twice. They show it once.',
    ],
    de: [
      'Oben ist mehr Ruhe. Hinter dem eigenen Schild steht jetzt, was zu tun ist und was du kannst — eine Sache pro Zeile, damit auf einen Blick klar ist, wofür diese Hände da sind.',
      'Die Sprache, was neu ist, das Spiel neu holen und die Wege hinaus sind hinter den Tag gezogen, nach rechts — weg vom Spielen, und trotzdem einen Tipp entfernt.',
      'Ein paar Menüzeilen hatten ihr Bild doppelt. Jetzt steht es einmal da.',
    ],
  },
  {
    v: '1.5', date: '2026-09-07',
    en: [
      '“Start this world over” really does start it over, and puts you straight into the first morning. The server had been keeping its own copy of the village and handing it back, so the world you had just cleared turned up again a moment later.',
    ],
    de: [
      '„Diese Welt neu anfangen“ fängt sie jetzt wirklich neu an — und ihr steht gleich im ersten Morgen. Der Server hatte noch eine eigene Kopie des Dorfes und gab sie zurück: die eben geräumte Welt war kurz darauf wieder da.',
    ],
  },
  {
    v: '1.4', date: '2026-09-07',
    en: [
      'Worlds have names of their own now. Start one and it becomes Sunny Otter 🦦 — with a picture, so whoever cannot read yet still knows which one is theirs.',
      'Nobody types anything to find each other. One of you starts a world, the other taps “Join a world” and it is sitting at the top of the list with the free spot named. Once both spots are taken the world is not listed any more.',
      '“Share the link” hands the world to whatever the device shares with, and saying the name out loud works just as well.',
      'Both devices keep the world at the front door under “Your worlds”, so coming back next weekend is one tap and no conversation about what it was called. Worlds nobody opens for a fortnight are forgotten.',
    ],
    de: [
      'Welten haben jetzt eigene Namen. Fang eine an, und sie heißt Sunny Otter 🦦 — mit Bild, damit auch wer noch nicht lesen kann sieht, welche seine ist.',
      'Niemand muss mehr etwas eintippen, um sich zu finden. Eine Person fängt eine Welt an, die andere tippt auf „Bei einer Welt mitmachen“ — dort steht sie ganz oben, mit dem freien Platz dabei. Sind beide Plätze belegt, steht die Welt nicht mehr in der Liste.',
      '„Link teilen“ gibt die Welt an das weiter, womit das Gerät sonst teilt — und den Namen laut zu sagen tut es genauso.',
      'Beide Geräte behalten die Welt an der Haustür unter „Deine Welten“: nächstes Wochenende ist es ein Tipp, ohne Gespräch darüber, wie sie noch mal hieß. Welten, die zwei Wochen niemand öffnet, werden vergessen.',
    ],
  },
  {
    v: '1.3', date: '2026-09-06',
    en: [
      'The world says less. Notes that turned up on their own — arriving in the middle of a morning, being told to turn the phone sideways, the splash when a bridge gives way — are gone. What you are looking at already says it.',
      'Added to a Home Screen, the game can now fetch itself again: “↻ Fetch the game again” sits at the front door and in the 📜 history, and says so more loudly once a newer version is actually waiting. The village is saved before it goes.',
    ],
    de: [
      'Die Welt sagt weniger. Zettel, die von allein kamen — mitten in einen Morgen kommen, das Handy quer drehen, der Platsch, wenn eine Brücke nachgibt — sind weg. Was man sieht, sagt es schon.',
      'Auf dem Home-Bildschirm kann sich das Spiel jetzt selbst neu holen: „↻ Das Spiel neu holen“ steht an der Haustür und im 📜 Verlauf — und sagt deutlicher Bescheid, wenn wirklich eine neuere Fassung wartet. Vorher wird das Dorf gespeichert.',
    ],
  },
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
