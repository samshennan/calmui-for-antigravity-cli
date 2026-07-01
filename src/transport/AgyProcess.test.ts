import { describe, it, expect, vi } from 'vitest';

// AgyProcess imports `vscode` at module load; stub it so the pure helpers are
// importable in a plain node test environment.
vi.mock('vscode', () => ({
  window: { createTerminal: vi.fn() },
}));

import { buildAgyArgs, parseModelsOutput, quoteForCmd } from './AgyProcess';

describe('buildAgyArgs', () => {
  it('a fresh turn is just -p <prompt>', () => {
    expect(buildAgyArgs('hello', {})).toEqual(['-p', 'hello']);
  });

  it('appends model, timeout and add-dir', () => {
    const args = buildAgyArgs('hi', {
      model: 'gemini-3-pro',
      printTimeoutSeconds: 60,
      includeDirectories: ['/a', '/b'],
    });
    expect(args).toEqual([
      '-p', 'hi',
      '--model', 'gemini-3-pro',
      '--print-timeout', '60s',
      '--add-dir', '/a',
      '--add-dir', '/b',
    ]);
  });

  it('an explicit conversationId wins over continue (unambiguous)', () => {
    const args = buildAgyArgs('hi', { conversationId: 'abc-123', continue: true });
    expect(args).toContain('--conversation');
    expect(args).toContain('abc-123');
    expect(args).not.toContain('-c');
  });

  it('falls back to -c when continuing without a captured id', () => {
    const args = buildAgyArgs('hi', { continue: true });
    expect(args).toContain('-c');
    expect(args).not.toContain('--conversation');
  });
});

describe('parseModelsOutput', () => {
  it('keeps only the leading model-id token per line', () => {
    const raw = 'gemini-3-pro   Google flagship\ngemini-3.5-flash  fast\n';
    expect(parseModelsOutput(raw)).toEqual([
      { label: 'gemini-3-pro', value: 'gemini-3-pro' },
      { label: 'gemini-3.5-flash', value: 'gemini-3.5-flash' },
    ]);
  });

  it('skips headers, prose and blank lines, and de-dupes', () => {
    const raw = 'Available models:\n\ngemini-3-pro\ngemini-3-pro\nThe quick brown fox\nname\n';
    expect(parseModelsOutput(raw)).toEqual([
      { label: 'gemini-3-pro', value: 'gemini-3-pro' },
    ]);
  });

  it('never returns a whole descriptive line as a --model value', () => {
    const out = parseModelsOutput('gemini-3-pro - the best model for coding tasks');
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe('gemini-3-pro');
    expect(out[0].value).not.toContain(' ');
  });

  it('returns empty for garbage/empty output', () => {
    expect(parseModelsOutput('')).toEqual([]);
    expect(parseModelsOutput('\n\n   \n')).toEqual([]);
  });
});

describe('quoteForCmd', () => {
  it('wraps in double quotes', () => {
    expect(quoteForCmd('agy')).toBe('"agy"');
  });

  it('escapes cmd metacharacters so they cannot break out', () => {
    const q = quoteForCmd('a & del b | c > d');
    expect(q).toContain('^&');
    expect(q).toContain('^|');
    expect(q).toContain('^>');
  });

  it('doubles % to defeat env expansion and escapes embedded quotes', () => {
    expect(quoteForCmd('%PATH%')).toContain('%%PATH%%');
    expect(quoteForCmd('say "hi"')).toContain('\\"hi\\"');
  });
});
