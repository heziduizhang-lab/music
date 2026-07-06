import { generateHarmony, getReplacementGroups } from "./harmonyEngine.js";
import { absoluteTick, barTickFromAbsoluteTick, DURATIONS, getDuration, getMeter, KEYS } from "./music.js";
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
  texture: "arpeggio",
  speed: "medium",
  melodyTone: "clarinet",
  harmonyTone: "piano",
  melodyVolume: 1,
  harmonyVolume: 1,
  currentDuration: "quarter",
  dotted: false,
  cursorAbsTick: 0,
  playStartAbsTick: 0,
  playheadAbsTick: 0,
  melody: [],
  harmony: { pop: [], jazz: [] },
  lockedHarmony: { pop: {}, jazz: {} },
  selectedChord: null,
  message: "选择时值后点击钢琴键输入旋律。"
};

const player = new Player();
let playheadFrame = null;

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
  for (const id of ["key", "meter", "style", "texture", "speed", "melodyTone", "melodyVolume", "harmonyTone", "harmonyVolume", "generate", "play", "stop", "undo", "delete", "clear", "editor", "durations", "keyboard", "dotted", "rest", "message", "replacementPanel", "replacementTitle", "replacementOptions"]) {
    els[id] = document.getElementById(id);
  }
}

function renderSelectors() {
  els.key.innerHTML = KEYS.map((key) => `<option value="${key.id}">${key.label}</option>`).join("");
  els.key.value = state.keyId;
  els.meter.value = state.meter;
  els.style.value = state.selectedStyle;
  els.texture.value = state.texture;
  els.speed.value = state.speed;
  els.melodyTone.value = state.melodyTone;
  els.melodyVolume.value = String(state.melodyVolume);
  els.harmonyTone.value = state.harmonyTone;
  els.harmonyVolume.value = String(state.harmonyVolume);
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
  els.texture.addEventListener("change", () => {
    state.texture = els.texture.value;
  });
  els.speed.addEventListener("change", () => {
    state.speed = els.speed.value;
  });
  els.melodyTone.addEventListener("change", () => {
    state.melodyTone = els.melodyTone.value;
  });
  els.melodyVolume.addEventListener("change", () => {
    state.melodyVolume = Number(els.melodyVolume.value);
  });
  els.harmonyTone.addEventListener("change", () => {
    state.harmonyTone = els.harmonyTone.value;
  });
  els.harmonyVolume.addEventListener("change", () => {
    state.harmonyVolume = Number(els.harmonyVolume.value);
  });
  els.generate.addEventListener("click", generate);
  els.play.addEventListener("click", async () => {
    els.play.disabled = true;
    try {
      await player.unlockAudio();
      const playback = await player.playSong(state);
      startPlayheadAnimation(playback);
    } catch {
      setMessage("手机浏览器没有成功启动音频，请先点一下钢琴键，再点播放。");
      render();
    } finally {
      els.play.disabled = false;
    }
  });
  els.stop.addEventListener("click", () => {
    player.stop();
    stopPlayheadAnimation();
  });
  els.undo.addEventListener("click", undo);
  els.delete.addEventListener("click", deleteLast);
  els.clear.addEventListener("click", clearAll);
  els.dotted.addEventListener("click", () => {
    state.dotted = !state.dotted;
    renderDurationState();
  });
  els.rest.addEventListener("click", insertRest);
  document.addEventListener("click", (event) => {
    if (!els.replacementPanel.contains(event.target) && !event.target.closest(".chord-pill") && !event.target.closest(".note-chip")) {
      closeReplacements();
    }
  });
  els.editor.addEventListener("click", setPlayheadFromEditor);
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
    player.preview(key.dataset.note, state.melodyVolume).catch(() => {
      setMessage("手机浏览器没有成功启动音频，请再点一次钢琴键试听。");
      render();
    });
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
  stopPlayheadAnimation();
  state.cursorAbsTick = 0;
  state.playStartAbsTick = 0;
  state.playheadAbsTick = 0;
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
  els.texture.value = state.texture;
  els.speed.value = state.speed;
  els.melodyTone.value = state.melodyTone;
  els.melodyVolume.value = String(state.melodyVolume);
  els.harmonyTone.value = state.harmonyTone;
  els.harmonyVolume.value = String(state.harmonyVolume);
  els.message.textContent = state.message;
  renderEditor();
}

function renderEditor() {
  const meter = getMeter(state.meter);
  const minBars = Math.max(4, Math.ceil(Math.max(state.cursorAbsTick, state.playheadAbsTick, 1) / meter.ticksPerMeasure));
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
    <section class="measure" data-bar="${bar}">
      <div class="measure-number">第 ${bar} 小节</div>
      <div class="chord-row">
        ${chords.length ? chords.map((chord) => `<button class="chord-pill" style="left:${(chord.tick / meter.ticksPerMeasure) * 100}%" data-bar="${bar}" data-tick="${chord.tick}" data-chord="${chord.chord}">${chord.chord}</button>`).join("") : '<span class="chord-placeholder">和弦</span>'}
      </div>
      <div class="staff">
        ${emptySlots.map((tick) => `<span class="tick ${tick % 4 === 0 ? "beat" : ""} ${cursor.bar === bar && cursor.tick === tick ? "cursor" : ""}" style="left:${(tick / meter.ticksPerMeasure) * 100}%"></span>`).join("")}
        ${renderPlayhead(bar, meter)}
        ${notes.map((event) => renderEvent(event, meter)).join("")}
      </div>
    </section>
  `;
}

function renderPlayhead(bar, meter) {
  const position = barTickFromAbsoluteTick(state.playheadAbsTick, state.meter);
  if (position.bar !== bar) return "";
  const left = (position.tick / meter.ticksPerMeasure) * 100;
  return `<span class="playhead-line" style="left:${left}%"></span>`;
}

function setPlayheadFromEditor(event) {
  if (event.target.closest(".chord-pill") || event.target.closest(".note-chip")) return;
  const staff = event.target.closest(".staff");
  if (!staff) return;
  const measure = staff.closest(".measure");
  const bar = Number(measure?.dataset.bar);
  if (!bar) return;
  const rect = staff.getBoundingClientRect();
  const meter = getMeter(state.meter);
  const ratio = Math.max(0, Math.min(0.999, (event.clientX - rect.left) / rect.width));
  const tick = Math.floor(ratio * meter.ticksPerMeasure);
  state.playStartAbsTick = absoluteTick(bar, tick, state.meter);
  state.playheadAbsTick = state.playStartAbsTick;
  stopPlayheadAnimation(false);
  setMessage(`播放位置已设为第 ${bar} 小节第 ${tick + 1} 格。`);
  render();
}

function startPlayheadAnimation(playback) {
  stopPlayheadAnimation(false);
  state.playStartAbsTick = playback.startAbsTick;
  state.playheadAbsTick = playback.startAbsTick;
  render();
  const endAbsTick = Math.max(playback.endAbsTick, playback.startAbsTick);
  const animate = () => {
    const contextTime = player.context?.currentTime ?? 0;
    const elapsed = Math.max(0, contextTime - playback.startTime);
    state.playheadAbsTick = Math.min(endAbsTick, playback.startAbsTick + elapsed / playback.tickSeconds);
    updatePlayheadDom();
    if (state.playheadAbsTick < endAbsTick) {
      playheadFrame = requestAnimationFrame(animate);
    } else {
      state.playStartAbsTick = 0;
      state.playheadAbsTick = 0;
      playheadFrame = null;
      render();
    }
  };
  playheadFrame = requestAnimationFrame(animate);
}

function stopPlayheadAnimation(syncStart = true) {
  if (playheadFrame) {
    cancelAnimationFrame(playheadFrame);
    playheadFrame = null;
  }
  if (syncStart) state.playStartAbsTick = state.playheadAbsTick;
}

function updatePlayheadDom() {
  const meter = getMeter(state.meter);
  const position = barTickFromAbsoluteTick(state.playheadAbsTick, state.meter);
  const measures = els.editor.querySelectorAll(".measure");
  measures.forEach((measure) => {
    const line = measure.querySelector(".playhead-line");
    const bar = Number(measure.dataset.bar);
    if (!line) return;
    line.hidden = bar !== position.bar;
    if (bar === position.bar) line.style.left = `${(position.tick / meter.ticksPerMeasure) * 100}%`;
  });
  if (!els.editor.querySelector(`.measure[data-bar="${position.bar}"] .playhead-line`)) {
    render();
  }
}

function renderEvent(event, meter) {
  const left = (event.tick / meter.ticksPerMeasure) * 100;
  const width = Math.max(6, (event.durationTicks / meter.ticksPerMeasure) * 100 - 1);
  const label = event.type === "rest" ? "休" : event.note;
  if (event.type === "rest") {
    return `<div class="note-chip rest-chip" style="left:${left}%;width:${width}%">${label}</div>`;
  }
  return `<button class="note-chip note-button" style="left:${left}%;width:${width}%" data-bar="${event.bar}" data-tick="${event.tick}" data-note="${event.note}" title="给 ${event.note} 添加或修改和弦">${label}</button>`;
}

document.addEventListener("click", (event) => {
  const chordButton = event.target.closest(".chord-pill");
  if (!chordButton) return;
  player.previewChord(chordButton.dataset.chord, state.harmonyVolume).catch(() => {
    setMessage("手机浏览器没有成功启动音频，请先点一下钢琴键。");
    render();
  });
  openReplacements(chordButton, Number(chordButton.dataset.bar), Number(chordButton.dataset.tick), chordButton.dataset.chord, "replace");
});

document.addEventListener("click", (event) => {
  const noteButton = event.target.closest(".note-button");
  if (!noteButton) return;
  openReplacements(noteButton, Number(noteButton.dataset.bar), Number(noteButton.dataset.tick), noteButton.dataset.note, "note");
});

function openReplacements(anchor, bar, tick, target, mode = "replace") {
  const currentChord = findChordAt(bar, tick) || findNearestChord(bar, tick) || target;
  state.selectedChord = { bar, tick, chord: currentChord, mode, note: mode === "note" ? target : null };
  const groups = getReplacementGroups(state, bar, currentChord, state.selectedStyle);
  els.replacementTitle.textContent = mode === "note" ? `给 ${target} 配和弦` : `替换 ${currentChord}`;
  els.replacementOptions.innerHTML = groups.map((group) => `<button data-replacement="${group.chord}"><span>${group.label}</span><strong>${group.chord}</strong></button>`).join("");
  const rect = anchor.getBoundingClientRect();
  els.replacementPanel.style.left = `${Math.min(rect.left, window.innerWidth - 230)}px`;
  els.replacementPanel.style.top = `${rect.bottom + 8}px`;
  els.replacementPanel.hidden = false;
  els.replacementOptions.querySelectorAll("[data-replacement]").forEach((button) => {
    button.addEventListener("mouseenter", () => player.previewChord(button.dataset.replacement, state.harmonyVolume).catch(() => {}));
    button.addEventListener("focus", () => player.previewChord(button.dataset.replacement, state.harmonyVolume).catch(() => {}));
    button.addEventListener("click", () => {
      player.previewChord(button.dataset.replacement, state.harmonyVolume).catch(() => {});
      applyReplacement(button.dataset.replacement);
    });
  });
}

function applyReplacement(chord) {
  const selected = state.selectedChord;
  if (!selected) return;
  state.lockedHarmony[state.selectedStyle][`${selected.bar}:${selected.tick}`] = chord;
  state.harmony = generateHarmony(state, state.lockedHarmony);
  const subject = selected.mode === "note" ? `${selected.note} 上方` : `第 ${selected.bar} 小节`;
  setMessage(`${subject}已设为 ${chord}，后续和弦已重新计算。`);
  closeReplacements();
  render();
}

function findChordAt(bar, tick) {
  const harmony = state.harmony[state.selectedStyle] || [];
  return harmony.find((item) => item.bar === bar && item.tick === tick)?.chord;
}

function findNearestChord(bar, tick) {
  const harmony = state.harmony[state.selectedStyle] || [];
  return harmony
    .filter((item) => item.bar === bar && item.tick <= tick)
    .sort((a, b) => b.tick - a.tick)[0]?.chord || harmony.find((item) => item.bar === bar)?.chord;
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
player.loadSamplePack();
