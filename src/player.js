import { chordPitches } from "./harmonyEngine.js";
import { absoluteTick, frequencyFromNote, getMeter } from "./music.js";

const SECONDS_PER_TICK = 0.125;

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
      gain: 0.164
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

  events.push({ note: notes[0], tick: startTick, durationTicks: Math.min(durationTicks, 4), gain: 0.19, role: "bass" });
  for (let offset = 0, index = 0; offset < durationTicks; offset += step, index += 1) {
    const note = upper[pattern[index % pattern.length] % upper.length];
    events.push({
      note,
      tick: startTick + offset,
      durationTicks: Math.min(step * 1.8, durationTicks - offset),
      gain: style === "jazz" ? 0.148 : 0.168,
      role: "piano-arp"
    });
  }
  return events;
}

export function createBlockEvents(notes, startTick, durationTicks) {
  if (!notes.length || durationTicks <= 0) return [];
  const length = Math.max(1, Math.min(durationTicks, 8));
  return notes.slice(0, 5).map((note, index) => ({
    note,
    tick: startTick,
    durationTicks: length,
    gain: index === 0 ? 0.19 : 0.156,
    role: index === 0 ? "bass" : "piano-block"
  }));
}

export class Player {
  constructor() {
    this.context = null;
    this.nodes = [];
  }

  ensureContext() {
    if (!this.context) {
      this.context = new AudioContext();
    }
    return this.context;
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
  }

  preview(note) {
    const context = this.ensureContext();
    const start = context.currentTime;
    this.playTone(note, start, 0.22, 0.08, "triangle");
  }

  previewChord(chordSymbol) {
    const context = this.ensureContext();
    const start = context.currentTime + 0.02;
    const notes = chordPitches(chordSymbol, 3);
    for (const event of createBlockEvents(notes, 0, 6)) {
      this.playTone(event.note, start, event.durationTicks * SECONDS_PER_TICK, event.gain * 1.25, getInstrumentPreset("piano"));
    }
  }

  playSong(song) {
    this.stop();
    const context = this.ensureContext();
    const start = context.currentTime + 0.08;
    const meter = getMeter(song.meter);
    const harmony = song.harmony?.[song.selectedStyle] || [];

    for (const event of song.melody) {
      if (event.type === "rest") continue;
      const when = start + absoluteTick(event.bar, event.tick, song.meter) * SECONDS_PER_TICK;
      const duration = event.durationTicks * SECONDS_PER_TICK * 0.9;
      this.playTone(event.note, when, duration, 0.075, getInstrumentPreset("clarinet"));
    }

    for (const chord of harmony) {
      const when = start + absoluteTick(chord.bar, chord.tick, song.meter) * SECONDS_PER_TICK;
      const next = harmony.find((item) => absoluteTick(item.bar, item.tick, song.meter) > absoluteTick(chord.bar, chord.tick, song.meter));
      const endTick = next ? absoluteTick(next.bar, next.tick, song.meter) : chord.bar * meter.ticksPerMeasure;
      const chordStartTick = absoluteTick(chord.bar, chord.tick, song.meter);
      const durationTicks = Math.max(2, endTick - chordStartTick);
      const notes = chordPitches(chord.chord, 3);
      const events = song.texture === "block"
        ? createBlockEvents(notes, chordStartTick, durationTicks)
        : createArpeggioEvents(notes, chordStartTick, durationTicks, song.selectedStyle);
      for (const event of events) {
        const eventWhen = start + event.tick * SECONDS_PER_TICK;
        this.playTone(event.note, eventWhen, event.durationTicks * SECONDS_PER_TICK * 0.92, event.gain, getInstrumentPreset("piano"));
      }
    }
  }

  playTone(note, when, duration, gainValue, presetOrType) {
    const context = this.ensureContext();
    const preset = typeof presetOrType === "string" ? { waveform: presetOrType, attack: 0.02, decay: duration, sustain: 0.4, release: 0.03 } : presetOrType;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = preset.waveform;
    oscillator.frequency.value = frequencyFromNote(note);
    filter.type = preset.filterType || "lowpass";
    filter.frequency.value = preset.filterFrequency || 2400;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(gainValue, when + (preset.attack || 0.02));
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue * (preset.sustain || 0.35)), when + Math.min(duration, preset.decay || duration));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration + (preset.release || 0.03));
    oscillator.connect(filter).connect(gain).connect(context.destination);
    oscillator.start(when);
    oscillator.stop(when + duration + (preset.release || 0.03) + 0.02);
    this.nodes.push(oscillator);
  }
}
