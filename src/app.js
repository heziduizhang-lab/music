import { generateHarmony, getReplacementGroups } from "./harmonyEngine.js";
import { barTickFromAbsoluteTick, DURATIONS, getDuration, getMeter, KEYS } from "./music.js";
import { Player } from "./player.js";

const keyboardNotes = [
  "C2", "C#2", "D2", "D#2", "E2", "F2", "F#2", "G2", "G#2", "A2", "A#2", "B2",
  "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
  "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4"
];
const whiteNames = new Set(["C", "D", "E", "F", "G", "A", "B"]);

const state = {
  keyId: "C-major",
  meter: "4/4",
  selectedStyle: "pop",
  currentDuration: "quarter",
  dotted: false,
  cursorAbsTick: 0,
  melody: [],
  harmony: { pop: [], jazz: [] },
  lockedHarmony: { pop: {}, jazz: {} },
  selectedChord: null,
  message: "选择时值后点击钢琴键输入旋律。"
};

const player = new Player();

const els = {};

function init() {
  bindElements();
  renderSelectors();
  renderDurationButtons();
  renderKeyboard();
  bindToolbar();
  render();
}

function bindElements() {
  for (const id of ["key", "meter", "style", "generate", "play", "stop", "undo", "delete", "clear", "editor", "durations", "keyboard", "dotted", "rest", "message", "replacementPanel", "replacementTitle", "replacementOptions"]) {
    els[id] = document.getElementById(id);
  }
}

function renderSelectors() {
  els.key.innerHTML = KEYS.map((key) => `<option value="${key.id}">${key.label}</option>`).join("");
  els.key.value = state.keyId;
  els.meter.value = state.meter;
  els.style.value = state.selectedStyle;
}

function bindToolbar() {
  els.key.addEventListener("change", () => {
    state.keyId = els.key.value;
    clearHarmony();
    render();
  });
  els.meter.addEventListener("change", () => {
    state.meter = els.meter.value;
    clearHarmony();
    render();
  });
  els.style.addEventListener("change", () => {
    state.selectedStyle = els.style.value;
    render();
  });
  els.generate.addEventListener("click", generate);
  els.play.addEventListener("click", () => player.playSong(state));
  els.stop.addEventListener("click", () => player.stop());
  els.undo.addEventListener("click", undo);
  els.delete.addEventListener("click", deleteLast);
  els.clear.addEventListener("click", clearAll);
  els.dotted.addEventListener("click", () => {
    state.dotted = !state.dotted;
    renderDurationState();
  });
  els.rest.addEventListener("click", insertRest);
  document.addEventListener("click", (event) => {
    if (!els.replacementPanel.contains(event.target) && !event.target.closest(".chord-pill")) {
      closeReplacements();
    }
  });
}

function renderDurationButtons() {
  els.durations.innerHTML = DURATIONS.map((duration) => `<button class="duration-button" data-duration="${duration.id}" title="${duration.label}">${duration.label}</button>`).join("");
  els.durations.addEventListener("click", (event) => {
    const button = event.target.closest("[data-duration]");
    if (!button) return;
    state.currentDuration = button.dataset.duration;
    renderDurationState();
  });
  renderDurationState();
}

function renderDurationState() {
  els.durations.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.duration === state.currentDuration);
  });
  els.dotted.classList.toggle("is-active", state.dotted);
}

function renderKeyboard() {
  els.keyboard.innerHTML = keyboardNotes.map((note) => {
    const name = note.replace(/[0-9]/g, "");
    const type = whiteNames.has(name) ? "white" : "black";
    return `<button class="piano-key ${type}" data-note="${note}" title="${note}"><span>${note}</span></button>`;
  }).join("");
  els.keyboard.addEventListener("click", (event) => {
    const key = event.target.closest("[data-note]");
    if (!key) return;
    insertNote(key.dataset.note);
    player.preview(key.dataset.note);
  });
}

function insertNote(note) {
  const durationTicks = currentDurationTicks();
  const pos = barTickFromAbsoluteTick(state.cursorAbsTick, state.meter);
  state.melody.push({ bar: pos.bar, tick: pos.tick, note, durationTicks });
  state.cursorAbsTick += durationTicks;
  clearHarmony();
  setMessage(`${note} 已输入。`);
  render();
}

function insertRest() {
  const durationTicks = currentDurationTicks();
  const pos = barTickFromAbsoluteTick(state.cursorAbsTick, state.meter);
  state.melody.push({ bar: pos.bar, tick: pos.tick, type: "rest", durationTicks });
  state.cursorAbsTick += durationTicks;
  clearHarmony();
  setMessage("休止符已输入。");
  render();
}

function currentDurationTicks() {
  const base = getDuration(state.currentDuration).ticks;
  return state.dotted ? Math.round(base * 1.5) : base;
}

function undo() {
  const event = state.melody.pop();
  if (!event) return;
  state.cursorAbsTick = Math.max(0, state.cursorAbsTick - event.durationTicks);
  clearHarmony();
  setMessage("已撤销上一步。");
  render();
}

function deleteLast() {
  undo();
}

function clearAll() {
  player.stop();
  state.cursorAbsTick = 0;
  state.melody = [];
  state.harmony = { pop: [], jazz: [] };
  state.lockedHarmony = { pop: {}, jazz: {} };
  closeReplacements();
  setMessage("已清空，可以重新输入。");
  render();
}

function clearHarmony() {
  state.harmony = { pop: [], jazz: [] };
  state.lockedHarmony = { pop: {}, jazz: {} };
  closeReplacements();
}

function generate() {
  if (state.melody.filter((event) => event.type !== "rest").length === 0) {
    setMessage("请先输入至少一个旋律音。");
    render();
    return;
  }
  state.harmony = generateHarmony(state, state.lockedHarmony);
  setMessage("和弦已输出在旋律上方。");
  render();
}

function render() {
  renderDurationState();
  els.style.value = state.selectedStyle;
  els.message.textContent = state.message;
  renderEditor();
}

function renderEditor() {
  const meter = getMeter(state.meter);
  const minBars = Math.max(4, Math.ceil(Math.max(state.cursorAbsTick, 1) / meter.ticksPerMeasure));
  const harmony = state.harmony[state.selectedStyle] || [];
  const bars = Array.from({ length: minBars }, (_, index) => index + 1);
  els.editor.innerHTML = bars.map((bar) => renderBar(bar, meter, harmony)).join("");
}

function renderBar(bar, meter, harmony) {
  const notes = state.melody.filter((event) => event.bar === bar);
  const chords = harmony.filter((item) => item.bar === bar);
  const cursor = barTickFromAbsoluteTick(state.cursorAbsTick, state.meter);
  const emptySlots = Array.from({ length: meter.ticksPerMeasure }, (_, tick) => tick);
  return `
    <section class="measure">
      <div class="measure-number">第 ${bar} 小节</div>
      <div class="chord-row">
        ${chords.length ? chords.map((chord) => `<button class="chord-pill" style="left:${(chord.tick / meter.ticksPerMeasure) * 100}%" data-bar="${bar}" data-tick="${chord.tick}" data-chord="${chord.chord}">${chord.chord}</button>`).join("") : '<span class="chord-placeholder">和弦</span>'}
      </div>
      <div class="staff">
        ${emptySlots.map((tick) => `<span class="tick ${tick % 4 === 0 ? "beat" : ""} ${cursor.bar === bar && cursor.tick === tick ? "cursor" : ""}" style="left:${(tick / meter.ticksPerMeasure) * 100}%"></span>`).join("")}
        ${notes.map((event) => renderEvent(event, meter)).join("")}
      </div>
    </section>
  `;
}

function renderEvent(event, meter) {
  const left = (event.tick / meter.ticksPerMeasure) * 100;
  const width = Math.max(6, (event.durationTicks / meter.ticksPerMeasure) * 100 - 1);
  const label = event.type === "rest" ? "休" : event.note;
  return `<div class="note-chip ${event.type === "rest" ? "rest-chip" : ""}" style="left:${left}%;width:${width}%">${label}</div>`;
}

document.addEventListener("click", (event) => {
  const chordButton = event.target.closest(".chord-pill");
  if (!chordButton) return;
  openReplacements(chordButton, Number(chordButton.dataset.bar), Number(chordButton.dataset.tick), chordButton.dataset.chord);
});

function openReplacements(anchor, bar, tick, chord) {
  state.selectedChord = { bar, tick, chord };
  const groups = getReplacementGroups(state, bar, chord, state.selectedStyle);
  els.replacementTitle.textContent = `替换 ${chord}`;
  els.replacementOptions.innerHTML = groups.map((group) => `<button data-replacement="${group.chord}"><span>${group.label}</span><strong>${group.chord}</strong></button>`).join("");
  const rect = anchor.getBoundingClientRect();
  els.replacementPanel.style.left = `${Math.min(rect.left, window.innerWidth - 230)}px`;
  els.replacementPanel.style.top = `${rect.bottom + 8}px`;
  els.replacementPanel.hidden = false;
  els.replacementOptions.querySelectorAll("[data-replacement]").forEach((button) => {
    button.addEventListener("click", () => applyReplacement(button.dataset.replacement));
  });
}

function applyReplacement(chord) {
  const selected = state.selectedChord;
  if (!selected) return;
  state.lockedHarmony[state.selectedStyle][`${selected.bar}:${selected.tick}`] = chord;
  state.harmony = generateHarmony(state, state.lockedHarmony);
  setMessage(`第 ${selected.bar} 小节已替换为 ${chord}，后续和弦已重新计算。`);
  closeReplacements();
  render();
}

function closeReplacements() {
  if (!els.replacementPanel) return;
  els.replacementPanel.hidden = true;
  state.selectedChord = null;
}

function setMessage(message) {
  state.message = message;
}

init();
