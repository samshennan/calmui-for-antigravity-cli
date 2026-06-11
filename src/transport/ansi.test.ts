import { describe, it, expect } from 'vitest';
import { stripAnsi, applyCarriageReturns, normalizeDrip } from './ansi';

describe('stripAnsi', () => {
  it('removes colour CSI sequences', () => {
    expect(stripAnsi('\x1b[32mCALMUI_TEST_OK\x1b[0m')).toBe('CALMUI_TEST_OK');
  });

  it('removes cursor-move CSI sequences', () => {
    expect(stripAnsi('a\x1b[2Kb\x1b[1Gc')).toBe('abc');
  });

  it('removes OSC hyperlink sequences', () => {
    const link = '\x1b]8;;https://x\x07text\x1b]8;;\x07';
    expect(stripAnsi(link)).toBe('text');
  });

  it('keeps newlines and tabs', () => {
    expect(stripAnsi('one\ntwo\tthree')).toBe('one\ntwo\tthree');
  });
});

describe('applyCarriageReturns', () => {
  it('keeps the final state of a repainted line', () => {
    expect(applyCarriageReturns('loading...\rdone      ')).toBe('done      ');
  });
});

describe('normalizeDrip', () => {
  it('cleans a realistic dripped answer', () => {
    const raw = '\x1b[?25l\x1b[32mHello\x1b[0m world\x1b[?25h\n\n\n';
    expect(normalizeDrip(raw)).toBe('Hello world');
  });
});
