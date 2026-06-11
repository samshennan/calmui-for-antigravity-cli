/**
 * ANSI / terminal-control cleanup for agy's "drip" (typewriter) print output.
 *
 * agy renders the answer to a TTY using cursor moves + incremental writes. When
 * we run it under node-pty we receive that raw stream. For v1 we collect the
 * stream and normalise it to plain text. These helpers are pure + unit-tested so
 * the messy parsing logic is verifiable without spawning a process.
 */

// CSI sequences (colour, cursor moves, erase, etc.): ESC [ ... final-byte
const CSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;
// OSC sequences (title, hyperlinks): ESC ] ... BEL | ESC \
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
// Other single ESC sequences (e.g. ESC ( B charset)
const ESC_SINGLE = /\x1b[()][0-9A-Za-z]/g;
// Lone escapes / control chars we never want in rendered text
const STRAY = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/** Remove all ANSI escape sequences from a chunk. Leaves \n and \t. */
export function stripAnsi(input: string): string {
  return input
    .replace(OSC, '')
    .replace(CSI, '')
    .replace(ESC_SINGLE, '')
    .replace(STRAY, (m) => (m === '\t' ? m : ''));
}

/**
 * Collapse carriage-return repaints: terminals use `\r` to rewrite the current
 * line. Keep only the final state of each line. (agy's drip can repaint the
 * active line as it types.)
 */
export function applyCarriageReturns(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (!line.includes('\r')) return line;
      // last segment after a CR wins for the overwritten prefix
      const segs = line.split('\r');
      let out = '';
      for (const seg of segs) {
        out = seg + out.slice(seg.length);
      }
      return out;
    })
    .join('\n');
}

/** Full normalisation pipeline: raw pty bytes -> clean assistant text. */
export function normalizeDrip(raw: string): string {
  const stripped = stripAnsi(raw);
  const collapsed = applyCarriageReturns(stripped);
  // trim trailing spaces per line + collapse 3+ blank lines to 2
  return collapsed
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/u, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
