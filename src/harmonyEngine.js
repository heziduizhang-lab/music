import {
  absoluteTick,
  chordName,
  getMeter,
  isStrongTick,
  keyFromId,
  noteNameFromPc,
  pitchClass,
  transposePc
} from "./music.js";

const QUALITY_INTERVALS = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  add9: [0, 4, 7, 2],
  madd9: [0, 3, 7, 2],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  "7sus4": [0, 5, 7, 10],
  "9": [0, 4, 7, 10, 2],
  maj9: [0, 4, 7, 11, 2],
  m9: [0, 3, 7, 10, 2],
  "7b9": [0, 4, 7, 10, 1],
  "7#9": [0, 4, 7, 10, 3],
  "13": [0, 4, 7, 10, 2, 9]
};

const QUALITY_ROLE = {
  "": "triad",
  m: "triad",
  dim: "triad",
  aug: "triad",
  sus2: "suspended",
  sus4: "suspended",
  "6": "color",
  m6: "color",
  add9: "color",
  madd9: "color",
  "7": "seventh",
  maj7: "seventh",
  m7: "seventh",
  dim7: "seventh",
  m7b5: "seventh",
  "7sus4": "suspended",
  "9": "ninth",
  maj9: "ninth",
  m9: "ninth",
  "7b9": "altered",
  "7#9": "altered",
  "13": "extended"
};

const MAJOR_ROMANS = [
  { degree: 0, roman: "I", quality: "", function: "tonic", stability: 5 },
  { degree: 2, roman: "ii", quality: "m", function: "predominant", stability: 3 },
  { degree: 4, roman: "iii", quality: "m", function: "tonic", stability: 2 },
  { degree: 5, roman: "IV", quality: "", function: "predominant", stability: 4 },
  { degree: 7, roman: "V", quality: "", function: "dominant", stability: 4 },
  { degree: 9, roman: "vi", quality: "m", function: "tonic", stability: 4 },
  { degree: 11, roman: "vii", quality: "dim", function: "dominant", stability: 1 }
];

const MINOR_ROMANS = [
  { degree: 0, roman: "i", quality: "m", function: "tonic", stability: 5 },
  { degree: 2, roman: "ii", quality: "dim", function: "predominant", stability: 2 },
  { degree: 3, roman: "III", quality: "", function: "tonic", stability: 3 },
  { degree: 5, roman: "iv", quality: "m", function: "predominant", stability: 4 },
  { degree: 7, roman: "V", quality: "", function: "dominant", stability: 4 },
  { degree: 8, roman: "VI", quality: "", function: "tonic", stability: 4 },
  { degree: 10, roman: "VII", quality: "", function: "dominant", stability: 3 }
];

const COMMON_PROGRESSIONS = [
  ["I", "V", "vi", "IV"],
  ["I", "vi", "IV", "V"],
  ["vi", "IV", "I", "V"],
  ["ii", "V", "I"],
  ["i", "VI", "III", "VII"],
  ["i", "iv", "V", "i"]
];

function makeChord(rootPc, quality, meta = {}) {
  const intervals = QUALITY_INTERVALS[quality];
  const tones = intervals.map((interval) => transposePc(rootPc, interval));
  const baseName = chordName(rootPc, quality, meta.preferFlats);
  const bassPc = meta.bassPc ?? rootPc;
  const bassName = noteNameFromPc(bassPc, meta.preferFlats);
  return {
    name: bassPc === rootPc ? baseName : `${baseName}/${bassName}`,
    rootPc,
    bassPc,
    quality,
    tones,
    role: QUALITY_ROLE[quality] || "color",
    inversion: bassPc !== rootPc,
    ...meta
  };
}

function addChord(list, rootPc, quality, meta) {
  if (!QUALITY_INTERVALS[quality]) return;
  list.push(makeChord(rootPc, quality, meta));
}

function addInversions(list, chord) {
  if (!["triad", "seventh"].includes(chord.role) || chord.quality === "dim") return;
  const { name, tones, inversion, bassPc: originalBass, ...meta } = chord;
  for (const bassPc of chord.tones.slice(1, Math.min(3, chord.tones.length))) {
    list.push(makeChord(chord.rootPc, chord.quality, {
      ...meta,
      bassPc,
      stability: chord.stability - 0.55,
      color: "inversion"
    }));
  }
}

export function buildCandidates(keyId, style = "pop") {
  const key = keyFromId(keyId);
  const tonicPc = pitchClass(key.tonic);
  const preferFlats = ["F", "Bb", "Eb"].includes(key.tonic);
  const romans = key.mode === "major" ? MAJOR_ROMANS : MINOR_ROMANS;
  const list = [];

  for (const item of romans) {
    const rootPc = transposePc(tonicPc, item.degree);
    addChord(list, rootPc, item.quality, { ...item, color: "plain", preferFlats });
    addChord(list, rootPc, item.quality === "m" ? "m7" : item.function === "dominant" ? "7" : item.quality === "dim" ? "m7b5" : "maj7", {
      ...item,
      stability: item.stability - 0.35,
      color: "seventh",
      preferFlats
    });
    if (style === "jazz") {
      const ninth = item.quality === "m" ? "m9" : item.function === "dominant" ? "9" : item.quality === "dim" ? "m7b5" : "maj9";
      addChord(list, rootPc, ninth, { ...item, stability: item.stability - 0.75, color: "ninth", preferFlats });
      addChord(list, rootPc, item.quality === "m" ? "m6" : "6", { ...item, stability: item.stability - 0.65, color: "sixth", preferFlats });
      addChord(list, rootPc, item.quality === "m" ? "madd9" : "add9", { ...item, stability: item.stability - 0.7, color: "add", preferFlats });
      if (item.function === "dominant") {
        addChord(list, rootPc, "7sus4", { ...item, stability: item.stability - 0.7, color: "suspension", preferFlats });
        addChord(list, rootPc, "7b9", { ...item, stability: item.stability - 1.0, color: "altered", preferFlats });
        addChord(list, rootPc, "13", { ...item, stability: item.stability - 1.1, color: "extended", preferFlats });
      }
    }
  }

  const plain = list.filter((chord) => chord.color === "plain");
  plain.forEach((chord) => addInversions(list, chord));

  for (const target of romans.filter((item) => item.function !== "dominant")) {
    const targetRoot = transposePc(tonicPc, target.degree);
    const dominantRoot = transposePc(targetRoot, 7);
    const dominantQualities = style === "jazz" ? ["7", "9", "7b9", "7#9"] : ["7"];
    dominantQualities.forEach((quality, index) =>
      addChord(list, dominantRoot, quality, {
        roman: `V/${target.roman}`,
        function: "dominant",
        stability: 2.4 - index * 0.35,
        color: index ? "altered-secondary" : "secondary",
        targetRoman: target.roman,
        preferFlats
      })
    );
  }

  if (key.mode === "major") {
    const borrowed = [
      { degree: 3, roman: "bIII", quality: "", function: "color" },
      { degree: 5, roman: "iv", quality: "m", function: "predominant" },
      { degree: 8, roman: "bVI", quality: "", function: "color" },
      { degree: 10, roman: "bVII", quality: "", function: "dominant" }
    ];
    borrowed.forEach((item) =>
      addChord(list, transposePc(tonicPc, item.degree), style === "jazz" && item.quality === "" ? "maj7" : item.quality, {
        ...item,
        stability: 2.2,
        color: "modal-borrowed",
        preferFlats
      })
    );
  }

  const byName = new Map();
  for (const chord of list) {
    if (!byName.has(chord.name)) byName.set(chord.name, chord);
  }
  return [...byName.values()];
}

export function analyzeMeasures(song) {
  const meter = getMeter(song.meter);
  const measureCount = Math.max(
    4,
    ...song.melody.map((event) => event.bar + Math.floor((event.tick + event.durationTicks - 1) / meter.ticksPerMeasure))
  );
  const measures = Array.from({ length: measureCount }, (_, index) => ({
    bar: index + 1,
    notes: [],
    weightedPcs: new Map(),
    endingPc: null,
    phraseEnding: false
  }));

  for (const event of song.melody) {
    const measure = measures[event.bar - 1];
    if (!measure) continue;
    if (event.type === "rest") {
      if (event.tick + event.durationTicks >= meter.ticksPerMeasure) measure.phraseEnding = true;
      continue;
    }
    const pc = pitchClass(event.note);
    const weight =
      1 +
      event.durationTicks * 0.35 +
      (isStrongTick(event.tick, song.meter) ? 2.5 : 0) +
      (event.tick + event.durationTicks >= meter.ticksPerMeasure ? 1.2 : 0);
    measure.notes.push({ ...event, pc, weight });
    measure.weightedPcs.set(pc, (measure.weightedPcs.get(pc) || 0) + weight);
    measure.endingPc = pc;
    if (event.durationTicks >= 6 && event.tick + event.durationTicks >= meter.ticksPerMeasure) measure.phraseEnding = true;
  }

  for (const measure of measures) {
    for (const note of measure.notes) {
      const repeated = measure.notes.filter((item) => item.pc === note.pc).length;
      if (repeated > 1) {
        measure.weightedPcs.set(note.pc, (measure.weightedPcs.get(note.pc) || 0) + repeated * 0.4);
      }
    }
  }
  return measures;
}

function progressionBonus(chord, previousChord, bar) {
  if (!previousChord) return chord.function === "tonic" ? 2 : 0;
  let score = 0;
  if (previousChord.function === "tonic" && chord.function === "predominant") score += 1.2;
  if (previousChord.function === "predominant" && chord.function === "dominant") score += 1.4;
  if (previousChord.function === "dominant" && chord.function === "tonic") score += 1.8;
  if (previousChord.name === chord.name) score -= 0.6;
  const bassMove = Math.abs(shortestPcDistance(previousChord.bassPc, chord.bassPc));
  if (bassMove <= 2) score += 0.8;
  if (bassMove === 7 || bassMove === 5) score += 0.45;
  if (chord.inversion && bassMove <= 2) score += 0.7;
  for (const progression of COMMON_PROGRESSIONS) {
    const expected = progression[(bar - 1) % progression.length];
    if (chord.roman === expected) score += 1;
  }
  return score;
}

function shortestPcDistance(a, b) {
  const up = (b - a + 12) % 12;
  return up > 6 ? up - 12 : up;
}

function melodyFit(chord, pc, style) {
  if (chord.tones.includes(pc)) return 1.45;
  const rel = transposePc(pc, -chord.rootPc);
  const stableTensions = [2, 9];
  const brighterTensions = [5, 11];
  const alteredTensions = [1, 3, 8];
  if (stableTensions.includes(rel)) return chord.role === "triad" && style === "pop" ? 0.3 : 0.75;
  if (brighterTensions.includes(rel)) return style === "jazz" || chord.color !== "plain" ? 0.55 : -0.25;
  if (alteredTensions.includes(rel)) return style === "jazz" && chord.function === "dominant" ? 0.35 : -0.65;
  return style === "jazz" ? -0.55 : -0.95;
}

function scoreChord(chord, measure, previousChord, style, isFinal) {
  if (measure.notes.length === 0) {
    return chord.function === "tonic" ? 3 + chord.stability : chord.stability;
  }
  let score = chord.stability + progressionBonus(chord, previousChord, measure.bar);
  for (const [pc, weight] of measure.weightedPcs.entries()) {
    score += weight * melodyFit(chord, pc, style);
  }
  if (isFinal && chord.function === "tonic") score += 3;
  if (style === "pop" && !["plain", "inversion", "seventh"].includes(chord.color)) score -= 1.8;
  if (style === "pop" && chord.inversion) score += 0.2;
  if (style === "jazz" && chord.color !== "plain") score += 0.75;
  if (style === "jazz" && ["ninth", "extended", "altered"].includes(chord.color)) score += 0.5;
  if (chord.color === "modal-borrowed") score -= style === "jazz" ? 0.3 : 1.1;
  return score;
}

function pickMeasureChord(measure, candidates, previousChord, style, isFinal) {
  const ranked = candidates
    .map((chord) => ({ chord, score: scoreChord(chord, measure, previousChord, style, isFinal) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.chord || candidates[0];
}

function tickStartsForMeter(meterName, density) {
  const meter = getMeter(meterName);
  if (density === "measure") return [0];
  if (density === "half") {
    if (meterName === "4/4") return [0, 8];
    if (meterName === "2/4") return [0, 4];
    if (meterName === "3/4") return [0, 8];
    if (meterName === "3/8") return [0, 3];
  }
  const beatTicks = meter.beatUnit === 8 ? 2 : 4;
  const starts = [];
  for (let tick = 0; tick < meter.ticksPerMeasure; tick += beatTicks) starts.push(tick);
  return starts;
}

function segmentMeasure(measure, startTick, endTick) {
  const notes = measure.notes.filter((note) => note.tick >= startTick && note.tick < endTick);
  const weightedPcs = new Map();
  let endingPc = null;
  for (const note of notes) {
    const localWeight = note.weight + (note.tick === startTick ? 0.8 : 0);
    weightedPcs.set(note.pc, (weightedPcs.get(note.pc) || 0) + localWeight);
    endingPc = note.pc;
  }
  return {
    bar: measure.bar,
    startTick,
    endTick,
    notes,
    weightedPcs,
    endingPc,
    phraseEnding: notes.some((note) => note.durationTicks >= 6 && note.tick + note.durationTicks >= endTick)
  };
}

function lockedChordFor(locks, bar, tick) {
  return locks?.[`${bar}:${tick}`] || (tick === 0 ? locks?.[bar] : undefined);
}

function uniqueSortedTicks(ticks, meterName) {
  const max = getMeter(meterName).ticksPerMeasure;
  return [...new Set(ticks.filter((tick) => tick >= 0 && tick < max))].sort((a, b) => a - b);
}

function collapseRepeated(chords) {
  return chords.filter((item, index) => {
    if (index === 0) return true;
    if (item.locked) return true;
    const previous = chords[index - 1].chord;
    const current = item.chord;
    if (current.name === previous.name) return false;
    return !(current.rootPc === previous.rootPc && current.roman === previous.roman && current.function === previous.function);
  });
}

function pickAdaptiveChords(measure, candidates, previousChord, style, isFinalMeasure, meterName, locks = {}, keyId) {
  const meter = getMeter(meterName);
  const lockedTicks = Object.keys(locks)
    .map((key) => {
      const [bar, tick] = key.includes(":") ? key.split(":").map(Number) : [Number(key), 0];
      return bar === measure.bar ? tick : null;
    })
    .filter((tick) => tick !== null);
  const densityOptions = measure.phraseEnding ? ["measure", "half"] : ["measure", "half", "beat"];
  let best = null;

  for (const density of densityOptions) {
    const rawStarts = tickStartsForMeter(meterName, density);
    const noteStartTicks = new Set(measure.notes.map((note) => note.tick));
    const starts = uniqueSortedTicks(
      [
        0,
        ...rawStarts.filter((tick) => tick === 0 || noteStartTicks.has(tick)),
        ...lockedTicks
      ],
      meterName
    );
    let localPrevious = previousChord;
    let total = 0;
    const picked = [];
    starts.forEach((start, index) => {
      const end = starts[index + 1] ?? meter.ticksPerMeasure;
      const segment = segmentMeasure(measure, start, end);
      const locked = lockedChordFor(locks, measure.bar, start);
      const chord = locked
        ? findOrCreateChord(locked, candidates, keyId, style)
        : pickMeasureChord(segment, candidates, localPrevious, style, isFinalMeasure && index === starts.length - 1);
      total += scoreChord(chord, segment, localPrevious, style, isFinalMeasure && index === starts.length - 1);
      picked.push({ bar: measure.bar, tick: start, chord, locked: Boolean(locked) });
      localPrevious = chord;
    });

    const collapsed = collapseRepeated(picked);
    const extraChordPenalty = style === "pop" ? 2.2 : 1.35;
    const busyMeasurePenalty = density === "beat" && style === "pop" ? 1.6 : 0;
    const phraseEndingPenalty = measure.notes.some((note) => note.durationTicks >= 6 && note.tick + note.durationTicks >= meter.ticksPerMeasure)
      ? (collapsed.length - 1) * (style === "pop" ? 1.4 : 0.9)
      : 0;
    total -= (collapsed.length - 1) * extraChordPenalty + busyMeasurePenalty + phraseEndingPenalty;
    if (!best || total > best.score) best = { score: total, chords: collapsed, lastChord: localPrevious };
  }

  return best || { score: 0, chords: [{ bar: measure.bar, tick: 0, chord: candidates[0] }], lastChord: candidates[0] };
}

function findOrCreateChord(symbol, candidates, keyId, style) {
  const found = candidates.find((item) => item.name === symbol);
  if (found) return found;
  const parsed = parseChordSymbol(symbol);
  if (!parsed) return candidates[0];
  const key = keyFromId(keyId);
  return makeChord(parsed.rootPc, parsed.quality, {
    roman: "user",
    function: "color",
    stability: 2,
    color: "user",
    bassPc: parsed.bassPc,
    preferFlats: ["F", "Bb", "Eb"].includes(key.tonic),
    style
  });
}

function parseChordSymbol(symbol) {
  const [main, bass] = symbol.split("/");
  const match = /^([A-G](?:#|b)?)(.*)$/.exec(main);
  if (!match || !QUALITY_INTERVALS[match[2]]) return null;
  return {
    rootPc: pitchClass(match[1]),
    quality: match[2],
    bassPc: bass ? pitchClass(bass) : pitchClass(match[1])
  };
}

export function generateHarmony(song, locks = {}) {
  const measures = analyzeMeasures(song);
  const popCandidates = buildCandidates(song.keyId, "pop");
  const jazzCandidates = buildCandidates(song.keyId, "jazz");
  const pop = [];
  const jazz = [];
  let previousPop = null;
  let previousJazz = null;

  measures.forEach((measure, index) => {
    const isFinal = index === measures.length - 1;
    const popChoice = pickAdaptiveChords(measure, popCandidates, previousPop, "pop", isFinal, song.meter, locks.pop || {}, song.keyId);
    popChoice.chords.forEach((item) => pop.push({ bar: item.bar, tick: item.tick, chord: item.chord.name, roman: item.chord.roman }));
    previousPop = popChoice.lastChord;

    const jazzChoice = pickAdaptiveChords(measure, jazzCandidates, previousJazz || previousPop, "jazz", isFinal, song.meter, locks.jazz || {}, song.keyId);
    jazzChoice.chords.forEach((item) => jazz.push({ bar: item.bar, tick: item.tick, chord: item.chord.name, roman: item.chord.roman }));
    previousJazz = jazzChoice.lastChord;
  });

  return { pop, jazz };
}

export function getReplacementGroups(song, bar, currentChord, style = "pop") {
  const measures = analyzeMeasures(song);
  const measure = measures[bar - 1];
  const candidates = buildCandidates(song.keyId, style === "jazz" ? "jazz" : "pop");
  const previousName = song.harmony?.[style]?.find((item) => item.bar === bar - 1)?.chord;
  const previousChord = previousName ? findOrCreateChord(previousName, candidates, song.keyId, style) : null;
  const ranked = candidates
    .filter((item) => item.name !== currentChord)
    .map((chord) => ({ chord, score: scoreChord(chord, measure, previousChord, style, false) }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.chord);

  const used = new Set();
  const pick = (predicate, fallbackIndex = 0) => {
    const match = ranked.find((item) => !used.has(item.name) && predicate(item));
    const fallback = match || ranked.find((item, index) => !used.has(item.name) && index >= fallbackIndex) || candidates[0];
    if (fallback) used.add(fallback.name);
    return fallback;
  };
  const groups = [
    { id: "stable", label: "更稳定", chord: pick((item) => item.function === "tonic" && ["plain", "inversion"].includes(item.color)) },
    { id: "pop", label: "更流行", chord: pick((item) => ["plain", "seventh", "inversion"].includes(item.color) && ["I", "vi", "IV", "V", "i", "VI"].includes(item.roman), 1) },
    { id: "jazz", label: "更爵士", chord: pick((item) => ["seventh", "ninth", "extended", "altered", "secondary"].includes(item.color), 2) },
    { id: "tense", label: "更有张力", chord: pick((item) => item.function === "dominant" || item.color.includes("secondary") || item.color === "altered", 3) },
    { id: "smooth", label: "更顺滑", chord: pick((item) => item.inversion || item.tones.includes(measure?.endingPc), 4) }
  ];

  return groups
    .filter((group) => group.chord)
    .map((group) => ({ id: group.id, label: group.label, chord: group.chord.name, roman: group.chord.roman }));
}

export function chordPitches(chordSymbol, octave = 3) {
  const parsed = parseChordSymbol(chordSymbol);
  if (!parsed) return [];
  const intervals = QUALITY_INTERVALS[parsed.quality] || QUALITY_INTERVALS[""];
  const upper = intervals.slice(0, 4).map((interval) => {
    const pc = transposePc(parsed.rootPc, interval);
    const name = noteNameFromPc(pc);
    const oct = pc < parsed.rootPc ? octave + 1 : octave;
    return `${name}${oct}`;
  });
  if (parsed.bassPc !== parsed.rootPc) {
    return [`${noteNameFromPc(parsed.bassPc)}${octave - 1}`, ...upper];
  }
  return upper;
}

export function chordAbsoluteTick(item, meter) {
  return absoluteTick(item.bar, item.tick, meter);
}
