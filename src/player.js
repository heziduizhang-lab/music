import { chordPitches } from "./harmonyEngine.js";
import { absoluteTick, frequencyFromNote, getMeter } from "./music.js";

const MEDIUM_SECONDS_PER_TICK = 0.125;
const SPEED_SECONDS_PER_TICK = {
  fast: 0.085,
  medium: MEDIUM_SECONDS_PER_TICK,
  slow: 0.18
};
const MELODY_MIX_GAIN = 2.35;
const HARMONY_MIX_GAIN = 0.48;
const SAMPLE_GAIN_SCALE = 1.45;
const PEDAL_RELEASE_SECONDS = 0.85;
const SAMPLE_PACK_BASE = "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM";
const SAMPLE_INSTRUMENTS = {
  piano: "acoustic_grand_piano",
  violin: "violin",
  clarinet: "clarinet"
};
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

let samplePackPromise = null;

function waitWithTimeout(promise, timeoutMs = 900) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs))
  ]);
}

export function getInstrumentPreset(name) {
  const presets = {
    clarinet: {
      waveform: "square",
      filterType: "lowpass",
      filterFrequency: 1450,
      attack: 0.035,
      decay: 0.42,
      sustain: 0.68,
      release: 0.08,
      gain: 0.055
    },
    piano: {
      waveform: "triangle",
      filterType: "lowpass",
      filterFrequency: 2600,
      attack: 0.006,
      decay: 0.16,
      sustain: 0.22,
      release: 0.04,
      gain: 0.328
    },
    violin: {
      waveform: "sawtooth",
      filterType: "lowpass",
      filterFrequency: 2100,
      attack: 0.12,
      decay: 0.42,
      sustain: 0.62,
      release: 0.16,
      gain: 0.095
    }
  };
  return presets[name] || presets.piano;
}

export function createArpeggioEvents(notes, startTick, durationTicks, style = "pop") {
  if (!notes.length || durationTicks <= 0) return [];
  const upper = notes.slice(1).length ? notes.slice(1) : notes;
  const pattern = style === "jazz" ? [0, 2, 1, 3, 2, 1] : [0, 1, 0, 2];
  const step = style === "jazz" ? 1 : 2;
  const events = [];

  events.push({ note: notes[0], tick: startTick, durationTicks: Math.min(durationTicks, 4), gain: 0.38, role: "bass" });
  for (let offset = 0, index = 0; offset < durationTicks; offset += step, index += 1) {
    const note = upper[pattern[index % pattern.length] % upper.length];
    events.push({
      note,
      tick: startTick + offset,
      durationTicks: Math.min(step * 1.8, durationTicks - offset),
      gain: style === "jazz" ? 0.296 : 0.336,
      role: "piano-arp"
    });
  }
  return events;
}

export function createSlowArpeggioEvents(notes, startTick, durationTicks, style = "pop") {
  if (!notes.length || durationTicks <= 0) return [];
  const upper = notes.slice(1).length ? notes.slice(1) : notes;
  const pattern = style === "jazz" ? [0, 1, 2, 3, 2, 1] : [0, 1, 2, 1];
  const step = style === "jazz" ? 2 : 4;
  const events = [];

  events.push({ note: notes[0], tick: startTick, durationTicks: Math.min(durationTicks, 6), gain: 0.34, role: "bass" });
  for (let offset = 0, index = 0; offset < durationTicks; offset += step, index += 1) {
    const note = upper[pattern[index % pattern.length] % upper.length];
    events.push({
      note,
      tick: startTick + offset,
      durationTicks: Math.min(step * 1.6, durationTicks - offset),
      gain: style === "jazz" ? 0.24 : 0.27,
      role: "piano-slow-arp"
    });
  }
  return events;
}

export function createBlockEvents(notes, startTick, durationTicks) {
  if (!notes.length || durationTicks <= 0) return [];
  const length = Math.max(1, durationTicks);
  return notes.slice(0, 5).map((note, index) => ({
    note,
    tick: startTick,
    durationTicks: length,
    gain: index === 0 ? 0.38 : 0.312,
    role: index === 0 ? "bass" : "piano-block",
    pedal: true
  }));
}

export function createAccompanimentEvents(notes, startTick, durationTicks, texture = "arpeggio", style = "pop") {
  if (texture === "block") return createBlockEvents(notes, startTick, durationTicks);
  if (texture === "slowArpeggio") return createSlowArpeggioEvents(notes, startTick, durationTicks, style);
  return createArpeggioEvents(notes, startTick, durationTicks, style);
}

export function mixGain(part, gainValue) {
  return gainValue * (part === "melody" ? MELODY_MIX_GAIN : HARMONY_MIX_GAIN);
}

export function applyVolume(gainValue, volume = 1) {
  return gainValue * Math.max(0, Math.min(1, Number(volume)));
}

export function getTickSeconds(speed = "medium") {
  return SPEED_SECONDS_PER_TICK[speed] || SPEED_SECONDS_PER_TICK.medium;
}

export function songEndTick(song) {
  const melodyEnd = (song.melody || []).reduce((max, event) => {
    return Math.max(max, absoluteTick(event.bar, event.tick, song.meter) + event.durationTicks);
  }, 0);
  const harmony = song.harmony?.[song.selectedStyle] || [];
  const meter = getMeter(song.meter);
  const harmonyEnd = harmony.reduce((max, chord) => Math.max(max, chord.bar * meter.ticksPerMeasure), 0);
  return Math.max(melodyEnd, harmonyEnd, meter.ticksPerMeasure * 4);
}

export function sampleKeyCandidates(note) {
  const midi = midiFromNote(note);
  const octave = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  return [...new Set([note, `${SHARP_NAMES[pc]}${octave}`, `${FLAT_NAMES[pc]}${octave}`, midi, String(midi)])];
}

export function createPreviewChordEvents(notes) {
  return notes.slice(0, 5).map((note, index) => ({
    note,
    tick: 0,
    durationTicks: 12,
    gain: index === 0 ? 0.38 : 0.312,
    role: index === 0 ? "preview-bass" : "piano-preview-block",
    pedal: true
  }));
}

export function collectSongSampleRequests(song) {
  const requests = [];
  const harmony = song.harmony?.[song.selectedStyle] || [];
  const meter = getMeter(song.meter);

  for (const event of song.melody || []) {
    if (event.type !== "rest") {
      requests.push({ instrument: song.melodyTone || "clarinet", note: event.note });
    }
  }

  for (const chord of harmony) {
    const next = harmony.find((item) => absoluteTick(item.bar, item.tick, song.meter) > absoluteTick(chord.bar, chord.tick, song.meter));
    const endTick = next ? absoluteTick(next.bar, next.tick, song.meter) : chord.bar * meter.ticksPerMeasure;
    const chordStartTick = absoluteTick(chord.bar, chord.tick, song.meter);
    const durationTicks = Math.max(2, endTick - chordStartTick);
    const notes = chordPitches(chord.chord, 3);
    for (const event of createAccompanimentEvents(notes, chordStartTick, durationTicks, song.texture, song.selectedStyle)) {
      requests.push({ instrument: song.harmonyTone || "piano", note: event.note });
    }
  }

  const seen = new Set();
  return requests.filter((request) => {
    const key = `${request.instrument}:${request.note}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class Player {
  constructor() {
    this.context = null;
    this.nodes = [];
    this.previewNodes = [];
    this.previewToken = 0;
    this.sampleBuffers = new Map();
  }

  ensureContext() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("AudioContext is not supported in this browser.");
      this.context = new AudioContextClass();
    }
    return this.context;
  }

  async unlockAudio() {
    const context = this.ensureContext();
    await context.resume?.();
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = context.createBuffer(1, 1, context.sampleRate);
    gain.gain.value = 0;
    source.connect(gain).connect(context.destination);
    source.start();
    source.stop(context.currentTime + 0.01);
  }

  loadSamplePack() {
    if (samplePackPromise) return samplePackPromise;
    if (typeof window === "undefined" || typeof document === "undefined") {
      samplePackPromise = Promise.resolve(false);
      return samplePackPromise;
    }
    window.MIDI = window.MIDI || {};
    window.MIDI.Soundfont = window.MIDI.Soundfont || {};
    const loads = Object.values(SAMPLE_INSTRUMENTS).map((instrument) => {
      if (window.MIDI.Soundfont[instrument]) return Promise.resolve(true);
      return new Promise((resolve) => {
        const script = document.createElement("script");
        const timer = setTimeout(() => resolve(false), 3500);
        script.src = `${SAMPLE_PACK_BASE}/${instrument}-mp3.js`;
        script.async = true;
        script.onload = () => {
          clearTimeout(timer);
          resolve(Boolean(window.MIDI.Soundfont[instrument]));
        };
        script.onerror = () => {
          clearTimeout(timer);
          resolve(false);
        };
        document.head.appendChild(script);
      });
    });
    samplePackPromise = Promise.all(loads).then((results) => results.some(Boolean));
    return samplePackPromise;
  }

  async prepareSong(song) {
    await this.loadSamplePack();
    await this.preloadSamples(collectSongSampleRequests(song));
  }

  warmPianoSamples(notes) {
    this.loadSamplePack()
      .then(() => this.preloadSamples(notes.map((note) => ({ instrument: "piano", note }))))
      .catch(() => {});
  }

  async preloadSamples(requests) {
    if (typeof window === "undefined") return;
    const context = this.ensureContext();
    await Promise.all(requests.map(async ({ instrument, note }) => {
      const key = `${instrument}:${note}`;
      if (this.sampleBuffers.has(key)) return;
      const entry = this.getSampleEntry(instrument, note);
      if (!entry) return;
      try {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 2500) : null;
        const response = await fetch(entry.url, controller ? { signal: controller.signal } : undefined);
        if (timer) clearTimeout(timer);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await context.decodeAudioData(arrayBuffer);
        this.sampleBuffers.set(key, { buffer, sourceMidi: entry.sourceMidi });
      } catch {
        this.sampleBuffers.set(key, null);
      }
    }));
  }

  getSampleEntry(instrumentName, note) {
    const instrument = SAMPLE_INSTRUMENTS[instrumentName];
    const data = instrument && typeof window !== "undefined" ? window.MIDI?.Soundfont?.[instrument] : null;
    if (!data) return null;
    for (const key of sampleKeyCandidates(note)) {
      if (data[key]) return { url: data[key], sourceMidi: midiFromNote(note) };
    }
    const targetMidi = midiFromNote(note);
    let nearest = null;
    for (const [key, url] of Object.entries(data)) {
      const sourceMidi = /^-?\d+$/.test(String(key)) ? Number(key) : midiFromNote(String(key));
      if (!Number.isFinite(sourceMidi)) continue;
      const distance = Math.abs(sourceMidi - targetMidi);
      if (!nearest || distance < nearest.distance) nearest = { url, sourceMidi, distance };
    }
    if (nearest && nearest.distance <= 12) return nearest;
    return null;
  }

  stop() {
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {
        // Already stopped.
      }
    }
    this.nodes = [];
    this.stopPreview();
  }

  stopPreview() {
    this.previewToken += 1;
    this.clearPreviewNodes();
  }

  clearPreviewNodes() {
    for (const node of this.previewNodes) {
      try {
        node.stop();
      } catch {
        // Already stopped.
      }
    }
    this.previewNodes = [];
  }

  async preview(note, volume = 1) {
    const previewToken = this.beginPreview();
    if (Number(volume) <= 0) return;
    await this.unlockAudio();
    await this.loadSamplePack();
    await this.preloadSamples([{ instrument: "piano", note }]);
    const context = this.ensureContext();
    if (previewToken !== this.previewToken) return;
    const start = context.currentTime;
    this.playTone(note, start, 0.22, applyVolume(0.09, volume), getInstrumentPreset("piano"), "piano", "preview");
  }

  async previewChord(chordSymbol, volume = 1) {
    const previewToken = this.beginPreview();
    if (Number(volume) <= 0) return;
    await this.unlockAudio();
    await this.loadSamplePack();
    const notes = chordPitches(chordSymbol, 3);
    await this.preloadSamples(notes.map((note) => ({ instrument: "piano", note })));
    const context = this.ensureContext();
    const start = context.currentTime + 0.02;
    if (previewToken !== this.previewToken) return;
    for (const event of createPreviewChordEvents(notes)) {
      this.playTone(event.note, start, event.durationTicks * MEDIUM_SECONDS_PER_TICK, applyVolume(event.gain * 1.25, volume), getInstrumentPreset("piano"), "piano", "preview", { pedal: event.pedal });
    }
  }

  beginPreview() {
    this.previewToken += 1;
    this.clearPreviewNodes();
    return this.previewToken;
  }

  async playSong(song) {
    this.stop();
    const context = this.ensureContext();
    await this.unlockAudio();
    await this.prepareSong(song);
    const start = context.currentTime + 0.18;
    const startAbsTick = Math.max(0, Number(song.playStartAbsTick) || 0);
    const tickSeconds = getTickSeconds(song.speed);
    const meter = getMeter(song.meter);
    const harmony = song.harmony?.[song.selectedStyle] || [];

    for (const event of song.melody) {
      if (event.type === "rest") continue;
      const eventStartTick = absoluteTick(event.bar, event.tick, song.meter);
      const eventEndTick = eventStartTick + event.durationTicks;
      if (eventEndTick <= startAbsTick) continue;
      const audibleStartTick = Math.max(eventStartTick, startAbsTick);
      const when = start + (audibleStartTick - startAbsTick) * tickSeconds;
      const duration = (eventEndTick - audibleStartTick) * tickSeconds * 0.9;
      const melodyPreset = getInstrumentPreset(song.melodyTone || "clarinet");
      const melodyGain = melodyPreset.gain ?? 0.075;
      this.playTone(event.note, when, duration, applyVolume(mixGain("melody", melodyGain), song.melodyVolume), melodyPreset, song.melodyTone || "clarinet");
    }

    for (const chord of harmony) {
      const next = harmony.find((item) => absoluteTick(item.bar, item.tick, song.meter) > absoluteTick(chord.bar, chord.tick, song.meter));
      const endTick = next ? absoluteTick(next.bar, next.tick, song.meter) : chord.bar * meter.ticksPerMeasure;
      const chordStartTick = absoluteTick(chord.bar, chord.tick, song.meter);
      if (endTick <= startAbsTick) continue;
      const audibleStartTick = Math.max(chordStartTick, startAbsTick);
      const durationTicks = Math.max(2, endTick - audibleStartTick);
      const notes = chordPitches(chord.chord, 3);
      const events = createAccompanimentEvents(notes, audibleStartTick, durationTicks, song.texture, song.selectedStyle);
      const harmonyPreset = getInstrumentPreset(song.harmonyTone || "piano");
      for (const event of events) {
        const eventWhen = start + (event.tick - startAbsTick) * tickSeconds;
        this.playTone(event.note, eventWhen, event.durationTicks * tickSeconds * 0.92, applyVolume(mixGain("harmony", event.gain), song.harmonyVolume), harmonyPreset, song.harmonyTone || "piano", "song", { pedal: event.pedal && (song.harmonyTone || "piano") === "piano" });
      }
    }
    return { startTime: start, startAbsTick, tickSeconds, endAbsTick: songEndTick(song) };
  }

  playTone(note, when, duration, gainValue, presetOrType, instrumentName = "piano", group = "song", options = {}) {
    const context = this.ensureContext();
    const preset = typeof presetOrType === "string" ? { waveform: presetOrType, attack: 0.02, decay: duration, sustain: 0.4, release: 0.03 } : presetOrType;
    const release = options.pedal ? Math.max(preset.release || 0.04, PEDAL_RELEASE_SECONDS) : (preset.release || 0.03);
    const sustain = options.pedal ? Math.max(preset.sustain || 0.35, 0.68) : (preset.sustain || 0.35);
    if (this.playSample(note, when, duration, gainValue, { ...preset, release, sustain }, instrumentName, group)) return;
    if (SAMPLE_INSTRUMENTS[instrumentName]) return;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = preset.waveform;
    oscillator.frequency.value = frequencyFromNote(note);
    filter.type = preset.filterType || "lowpass";
    filter.frequency.value = preset.filterFrequency || 2400;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(gainValue, when + (preset.attack || 0.02));
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue * sustain), when + Math.min(duration, preset.decay || duration));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration + release);
    oscillator.connect(filter).connect(gain).connect(context.destination);
    oscillator.start(when);
    oscillator.stop(when + duration + release + 0.02);
    this.trackNode(oscillator, group);
  }

  playSample(note, when, duration, gainValue, preset, instrumentName, group = "song") {
    const sample = this.sampleBuffers.get(`${instrumentName}:${note}`);
    if (!sample?.buffer) return false;
    const context = this.ensureContext();
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = sample.buffer;
    const semitoneShift = midiFromNote(note) - sample.sourceMidi;
    source.playbackRate.value = Math.pow(2, semitoneShift / 12);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue * SAMPLE_GAIN_SCALE), when + (preset.attack || 0.01));
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue * SAMPLE_GAIN_SCALE * (preset.sustain || 0.42)), when + Math.min(duration, preset.decay || duration));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration + (preset.release || 0.04));
    source.connect(gain).connect(context.destination);
    source.start(when);
    source.stop(when + duration + (preset.release || 0.04) + 0.03);
    this.trackNode(source, group);
    return true;
  }

  trackNode(node, group) {
    if (group === "preview") {
      this.previewNodes.push(node);
      return;
    }
    this.nodes.push(node);
  }
}

export function midiFromNote(note) {
  const match = /^([A-G])([#b]?)(-?\d+)$/.exec(note);
  if (!match) return 60;
  const [, letter, accidental, octaveText] = match;
  const pitchClasses = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const accidentalOffset = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return (Number(octaveText) + 1) * 12 + pitchClasses[letter] + accidentalOffset;
}
