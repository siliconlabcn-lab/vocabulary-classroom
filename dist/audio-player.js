let context;
let generation = 0;
let playingSource;
let finishCurrent;
const buffers = new Map();

function audioContext() {
  if (!context) {
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) throw new Error('Audio playback is unavailable');
    context = new AudioContext({ sampleRate: 24000 });
  }
  return context;
}

async function loadBuffer(path, audio) {
  const cached = buffers.get(path);
  if (cached) {
    buffers.delete(path);
    buffers.set(path, cached);
    return cached;
  }
  const pending = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(path, { signal: controller.signal });
      if (!response.ok) throw new Error('Audio file could not be loaded');
      return audio.decodeAudioData(await response.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
  })();
  buffers.set(path, pending);
  while (buffers.size > 3) buffers.delete(buffers.keys().next().value);
  try {
    return await pending;
  } catch (error) {
    if (buffers.get(path) === pending) buffers.delete(path);
    throw error;
  }
}

export function stopPronunciation() {
  generation++;
  if (playingSource) {
    playingSource.onended = null;
    playingSource.stop();
    playingSource.disconnect();
    playingSource = null;
  }
  finishCurrent?.();
  finishCurrent = null;
}

export async function playPronunciation(recordings, { onFinish, onError }) {
  stopPronunciation();
  const token = generation;
  try {
    const audio = audioContext();
    // Resume during the user's click, before fetching audio.
    await audio.resume();
    if (token !== generation) return;
    for (const recording of recordings) {
      const [path, , , , , segment] = recording;
      const buffer = await loadBuffer(path, audio);
      if (token !== generation) return;
      const start = segment?.start ?? 0;
      const end = Math.min(segment?.end ?? buffer.duration, buffer.duration);
      if (end <= start) throw new Error('The pronunciation range is invalid');
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.connect(audio.destination);
      playingSource = source;
      // AudioBufferSourceNode stops on a sample boundary, including while the
      // page is in the background. The following word is never played.
      await new Promise(resolve => {
        finishCurrent = resolve;
        source.onended = resolve;
        source.start(audio.currentTime + 0.08, start, end - start);
      });
      source.disconnect();
      if (token !== generation) return;
      playingSource = null;
      finishCurrent = null;
    }
    if (token === generation) onFinish();
  } catch (error) {
    if (token !== generation) return;
    stopPronunciation();
    onError(error);
  }
}
