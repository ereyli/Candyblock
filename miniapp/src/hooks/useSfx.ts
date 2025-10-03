'use client';

// WebAudio SFX helper — now with a simple master bus (compressor+gain)
// The overall tone is punchier and more polished; volumes are higher by default.

import { useCallback, useMemo } from 'react';

type Wave = OscillatorType;

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;

// Louder overall output but controlled by a compressor to avoid nasty clipping.
const OUT_GAIN = 0.9; // 0..1

const getCtx = () => {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AC) {
      audioCtx = new AC();
      // Build master chain once
      compressor = audioCtx.createDynamicsCompressor();
      try {
        compressor.threshold.setValueAtTime(-12, audioCtx.currentTime);
        compressor.knee.setValueAtTime(18, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(6, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0.002, audioCtx.currentTime);
        compressor.release.setValueAtTime(0.12, audioCtx.currentTime);
      } catch {}
      masterGain = audioCtx.createGain();
      masterGain.gain.value = OUT_GAIN;
      compressor.connect(masterGain).connect(audioCtx.destination);
    }
  }
  return audioCtx;
};

const env = (gain: GainNode, ctx: AudioContext, startTime: number, a = 0.003, d = 0.12, level = 0.08) => {
  gain.gain.cancelScheduledValues(startTime);
  gain.gain.setValueAtTime(0.00005, startTime);
  gain.gain.linearRampToValueAtTime(level, startTime + a);
  gain.gain.exponentialRampToValueAtTime(0.00005, startTime + a + d);
};

const tone = (
  freq: number,
  duration: number,
  type: Wave = 'sine',
  level = 0.08,
  attack = 0.005,
  decay = 0.12
) => {
  const ctx = getCtx();
  if (!ctx) return;
  const now = Math.max(ctx.currentTime, 0.01);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  env(gain, ctx, now, attack, decay, level);
  if (masterGain) osc.connect(gain).connect(compressor!);
  else osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + attack + decay + duration);
};

const noise = (duration = 0.08, level = 0.05, cutoff = 6000) => {
  const ctx = getCtx();
  if (!ctx) return;
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) data[i] = (Math.random() * 2 - 1) * 0.6;
  const src = ctx.createBufferSource();
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(cutoff, ctx.currentTime);
  const gain = ctx.createGain();
  src.buffer = buffer;
  gain.gain.value = level;
  if (masterGain) src.connect(filt).connect(gain).connect(compressor!);
  else src.connect(filt).connect(gain).connect(ctx.destination);
  src.start();
  src.stop(ctx.currentTime + duration);
};

export const useSfx = () => {
  const resume = useCallback(async () => {
    const ctx = getCtx();
    if (ctx && ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        // ignore
      }
    }
  }, []);

  const api = useMemo(() => {
    return {
      resume,
      select: () => tone(540, 0.02, 'triangle', 0.03, 0.002, 0.06),
      invalid: () => {
        tone(180, 0.02, 'square', 0.05, 0.002, 0.08);
        setTimeout(() => tone(150, 0.02, 'square', 0.04, 0.002, 0.08), 40);
      },
      pop: (count = 3) => {
        const n = Math.min(6, Math.max(1, Math.floor(count / 2)));
        for (let i = 0; i < n; i += 1) {
          const f1 = 520 + Math.random() * 140;
          setTimeout(() => {
            // tiny burst of filtered noise + quick pitch-up chirp
            noise(0.018, 0.03, 5000);
            const ctx = getCtx();
            if (!ctx) return;
            const now = ctx.currentTime + 0.001;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f1, now);
            osc.frequency.linearRampToValueAtTime(f1 + 180, now + 0.06);
            env(gain, ctx, now, 0.002, 0.08, 0.06);
            if (masterGain) osc.connect(gain).connect(compressor!); else osc.connect(gain).connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.12);
          }, i * 26);
        }
      },
      drop: (avgDistance = 1) => {
        const base = 220 - Math.min(120, avgDistance * 20);
        tone(base, 0.05, 'sawtooth', 0.06, 0.003, 0.09);
      },
      spawn: (count = 1) => {
        noise(0.05 + Math.min(0.15, count * 0.01), 0.035, 6500);
        tone(880, 0.025, 'triangle', 0.05, 0.002, 0.08);
      },
      milestone: () => tone(920, 0.06, 'triangle', 0.08, 0.004, 0.14),
      extraMoves: () => {
        tone(660, 0.06, 'sine', 0.08, 0.004, 0.14);
        setTimeout(() => tone(990, 0.06, 'sine', 0.07, 0.004, 0.14), 70);
      },
      bomb: () => {
        // low-end thump + stronger filtered noise burst and slight pitch drop
        noise(0.12, 0.07, 5500);
        const ctx = getCtx(); if (!ctx) return;
        const now = ctx.currentTime + 0.001;
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.18);
        env(gain, ctx, now, 0.006, 0.22, 0.08);
        if (masterGain) osc.connect(gain).connect(compressor!); else osc.connect(gain).connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.24);
      },
      missionComplete: () => {
        const seq = [660, 880, 990];
        seq.forEach((f, i) => setTimeout(() => tone(f, 0.06, 'triangle', 0.07, 0.004, 0.14), i * 110));
      },
      win: () => {
        const seq = [660, 880, 990, 1320];
        seq.forEach((f, i) => setTimeout(() => tone(f, 0.08, 'sine', 0.08, 0.005, 0.16), i * 140));
      },
      lose: () => {
        tone(220, 0.12, 'sawtooth', 0.07, 0.006, 0.3);
        setTimeout(() => tone(160, 0.1, 'sawtooth', 0.06, 0.006, 0.25), 120);
      }
    };
  }, [resume]);

  return api;
};

export type SfxApi = ReturnType<typeof useSfx>;
