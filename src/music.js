export const NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const NOTE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export const DURATIONS = [
  { id: "whole", label: "全音符", ticks: 16, symbol: "w" },
  { id: "half", label: "二分", ticks: 8, symbol: "h" },
  { id: "quarter", label: "四分", ticks: 4, symbol: "q" },
  { id: "eighth", label: "八分", ticks: 2, symbol: "e" },
  { id: "sixteenth", label: "十六分", ticks: 1, symbol: "s" }
];

export const METERS = {
  "4/4": { beats: 4, beatUnit: 4, ticksPerMeasure: 16, strongTicks: [0, 8] },
  "3/4": { beats: 3, beatUnit: 4, ticksPerMeasure: 12, strongTicks: [0] },
  "2/4": { beats: 2, beatUnit: 4, ticksPerMeasure: 8, strongTicks: [0] },
  "3/8": { beats: 3, beatUnit: 8, ticksPerMeasure: 6, strongTicks: [0] }
};

const FLAT_TO_SHARP = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#"
};

export const KEYS = [
  ["C", "major", "C大调"],
  ["Db", "major", "Db大调"],
  ["D", "major", "D大调"],
  ["Eb", "major", "Eb大调"],
  ["E", "major", "E大调"],
  ["F", "major", "F大调"],
  ["F#", "major", "F#大调"],
  ["G", "major", "G大调"],
  ["Ab", "major", "Ab大调"],
  ["A", "major", "A大调"],
  ["Bb", "major", "Bb大调"],
  ["B", "major", "B大调"],
  ["A", "minor", "a小调"],
  ["Bb", "minor", "bb小调"],
  ["B", "minor", "b小调"],
  ["C", "minor", "c小调"],
  ["C#", "minor", "c#小调"],
  ["D", "minor", "d小调"],
  ["Eb", "minor", "eb小调"],
  ["E", "minor", "e小调"],
  ["F", "minor", "f小调"],
  ["F#", "minor", "f#小调"],
  ["G", "minor", "g小调"],
  ["G#", "minor", "g#小调"]
].map(([tonic, mode, label]) => ({ id: `${tonic}-${mode}`, tonic, mode, label }));

export function normalizeNoteName(name) {
  return FLAT_TO_SHARP[name] || name;
}

export function pitchClass(name) {
  const clean = normalizeNoteName(name.replace(/[0-9]/g, ""));
  const index = NOTE_NAMES_SHARP.indexOf(clean);
  if (index < 0) {
    throw new Error(`Unknown note: ${name}`);
  }
  return index;
}

export function noteNameFromPc(pc, preferFlats = false) {
  const names = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  return names[((pc % 12) + 12) % 12];
}

export function parseNote(note) {
  const match = /^([A-G](?:#|b)?)(-?\d+)$/.exec(note);
  if (!match) {
    throw new Error(`Invalid note: ${note}`);
  }
  return { name: match[1], octave: Number(match[2]), pc: pitchClass(match[1]) };
}

export function midiFromNote(note) {
  const parsed = parseNote(note);
  return (parsed.octave + 1) * 12 + parsed.pc;
}

export function frequencyFromNote(note) {
  return 440 * 2 ** ((midiFromNote(note) - 69) / 12);
}

export function getDuration(id) {
  const duration = DURATIONS.find((item) => item.id === id);
  if (!duration) {
    throw new Error(`Unknown duration: ${id}`);
  }
  return duration;
}

export function getMeter(meter) {
  const found = METERS[meter];
  if (!found) {
    throw new Error(`Unknown meter: ${meter}`);
  }
  return found;
}

export function keyFromId(id) {
  const found = KEYS.find((key) => key.id === id);
  if (!found) {
    throw new Error(`Unknown key: ${id}`);
  }
  return found;
}

export function barTickFromAbsoluteTick(absTick, meter) {
  const { ticksPerMeasure } = getMeter(meter);
  return {
    bar: Math.floor(absTick / ticksPerMeasure) + 1,
    tick: absTick % ticksPerMeasure
  };
}

export function absoluteTick(bar, tick, meter) {
  return (bar - 1) * getMeter(meter).ticksPerMeasure + tick;
}

export function keyScalePcs(key) {
  const tonic = pitchClass(key.tonic);
  const intervals = key.mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  return intervals.map((interval) => (tonic + interval) % 12);
}

export function chordName(rootPc, quality, preferFlats = false) {
  return `${noteNameFromPc(rootPc, preferFlats)}${quality}`;
}

export function transposePc(rootPc, interval) {
  return (rootPc + interval + 120) % 12;
}

export function isStrongTick(tick, meter) {
  return getMeter(meter).strongTicks.includes(tick);
}
