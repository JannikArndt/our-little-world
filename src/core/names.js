// World names. A world is found by its name, so the name has to be sayable by
// a five year old over FaceTime, typable with two fingers, and recognisable
// before you can read: two words and a picture — "sunny-otter 🦦".
//
// Shared by the browser and the server, so it is plain data and pure
// functions and imports nothing.

export const ADJECTIVES = [
  'sunny', 'golden', 'quiet', 'happy', 'sleepy', 'windy', 'misty', 'merry',
  'wild', 'soft', 'brave', 'clever', 'warm', 'silver', 'green', 'little',
  'cosy', 'jolly', 'snowy', 'rainy', 'starry', 'mossy', 'sandy', 'breezy',
  'bright', 'tiny', 'round', 'fluffy', 'lucky', 'friendly',
];

// The picture is the point: a child who cannot read yet still knows which one
// is theirs. Animals only, so the emoji is never ambiguous.
export const ANIMALS = [
  { word: 'otter', emoji: '🦦' }, { word: 'fox', emoji: '🦊' },
  { word: 'owl', emoji: '🦉' }, { word: 'bear', emoji: '🐻' },
  { word: 'deer', emoji: '🦌' }, { word: 'frog', emoji: '🐸' },
  { word: 'whale', emoji: '🐳' }, { word: 'panda', emoji: '🐼' },
  { word: 'tiger', emoji: '🐯' }, { word: 'koala', emoji: '🐨' },
  { word: 'duck', emoji: '🦆' }, { word: 'bee', emoji: '🐝' },
  { word: 'snail', emoji: '🐌' }, { word: 'turtle', emoji: '🐢' },
  { word: 'seal', emoji: '🦭' }, { word: 'mouse', emoji: '🐭' },
  { word: 'rabbit', emoji: '🐰' }, { word: 'horse', emoji: '🐴' },
  { word: 'sheep', emoji: '🐑' }, { word: 'cat', emoji: '🐱' },
  { word: 'dog', emoji: '🐶' }, { word: 'penguin', emoji: '🐧' },
  { word: 'squirrel', emoji: '🐿️' }, { word: 'elephant', emoji: '🐘' },
  { word: 'giraffe', emoji: '🦒' }, { word: 'dolphin', emoji: '🐬' },
  { word: 'crab', emoji: '🦀' }, { word: 'butterfly', emoji: '🦋' },
  { word: 'hedgehog', emoji: '🦔' }, { word: 'ladybird', emoji: '🐞' },
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * A fresh two word name. `taken` (anything with a .has(), or a plain array)
 * says which ones are in use; after a few tries we add a number rather than
 * loop forever.
 */
export function randomName(taken) {
  const has = (n) => {
    if (!taken) return false;
    if (typeof taken.has === 'function') return taken.has(n);
    return taken.indexOf(n) >= 0;
  };
  for (let i = 0; i < 30; i++) {
    const n = pick(ADJECTIVES) + '-' + pick(ANIMALS).word;
    if (!has(n)) return n;
  }
  for (let i = 2; i < 9999; i++) {
    const n = pick(ADJECTIVES) + '-' + pick(ANIMALS).word + '-' + i;
    if (!has(n)) return n;
  }
  return 'world-' + Date.now().toString(36);
}

/** The animal in the name, or a globe for a name somebody typed themselves. */
export function worldEmoji(name) {
  const parts = String(name || '').toLowerCase().split('-');
  for (const p of parts) {
    for (const a of ANIMALS) if (a.word === p) return a.emoji;
  }
  return '🌍';
}

/** "sunny-otter" -> "Sunny Otter", for showing rather than for storing. */
export function prettyName(name) {
  return String(name || '')
    .split('-')
    .filter((w) => w.length)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * What a name is allowed to be, wherever it came from — a link, a text field,
 * an old ?room= bookmark. Lower case letters, digits and dashes; '' if there
 * is nothing usable left.
 */
export function cleanName(text) {
  const n = String(text == null ? '' : text)
    .trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return n;
}
