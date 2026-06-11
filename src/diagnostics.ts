import * as vscode from 'vscode';
import type { AgyTransport } from './transport/AgyTransport';

/**
 * Install hint shown when the agy binary is not found on PATH.
 * Default Windows path: %LOCALAPPDATA%\agy\bin\agy.exe
 * Override via the `calmui-agy.agyPath` VS Code setting.
 */
const INSTALL_HINT =
  'Install Antigravity CLI (agy), then fully quit and reopen the editor ' +
  'so PATH changes are picked up.';

const PATH_HINT =
  'Tip: on Windows the default install path is ' +
  '%LOCALAPPDATA%\\agy\\bin\\agy.exe. ' +
  'You can set `calmui-agy.agyPath` in VS Code settings to point directly ' +
  'to the executable without relying on PATH.';

const QUIT_HINT =
  'Note: fully quit and reopen the editor (a window reload is not always ' +
  'enough to refresh PATH).';

/** Single diagnostic check result. */
interface CheckResult {
  label: string;
  passed: boolean;
  detail?: string;
}

/**
 * Run the CalmUI diagnostics suite and display a modal report.
 *
 * Checks performed (in order):
 *  1. agy binary detection (no probe)
 *  2. Auth probe — only if binary found
 *  3. Terminal handoff — always ready in v1
 */
export async function runDiagnostics(
  transport: AgyTransport,
  agyPath: string,
): Promise<void> {
  const results: CheckResult[] = [];

  // ── Check 1: agy binary ────────────────────────────────────────────────────
  const availability = await transport.checkAvailability(false);

  if (availability.found) {
    const parts: string[] = [];
    if (availability.version) {
      parts.push(`version ${availability.version}`);
    }
    if (availability.resolvedPath) {
      parts.push(`path: ${availability.resolvedPath}`);
    }
    results.push({
      label: 'agy binary',
      passed: true,
      detail: parts.length > 0 ? parts.join(', ') : undefined,
    });
  } else {
    const notFoundDetail = [
      availability.detail ?? 'agy binary not found on PATH.',
      INSTALL_HINT,
      QUIT_HINT,
      PATH_HINT,
      `Current setting: calmui-agy.agyPath = "${agyPath}"`,
    ].join('\n');

    results.push({
      label: 'agy binary',
      passed: false,
      detail: notFoundDetail,
    });
  }

  // ── Check 2: auth probe (only when binary found) ───────────────────────────
  if (availability.found) {
    let probeResult: CheckResult;

    try {
      const probeAvailability = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'CalmUI: probing agy auth…',
          cancellable: false,
        },
        () => transport.checkAvailability(true),
      );

      probeResult = {
        label: 'Auth probe',
        passed: probeAvailability.authedProbeOk === true,
        detail: probeAvailability.authedProbeOk
          ? 'Authentication and model reachable.'
          : probeAvailability.detail ?? 'Probe returned no detail.',
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err);
      probeResult = {
        label: 'Auth probe',
        passed: false,
        detail: `Probe threw an error: ${message}`,
      };
    }

    results.push(probeResult);
  }

  // ── Check 3: terminal handoff ──────────────────────────────────────────────
  results.push({
    label: 'Terminal handoff',
    passed: true,
    detail: 'Ready (CalmUI: Open Antigravity Terminal).',
  });

  // ── Build report ───────────────────────────────────────────────────────────
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  const lines = results.map((r) => {
    const marker = r.passed ? '✓' : '✗';
    const header = `${marker} ${r.label}`;
    return r.detail ? `${header}\n  ${r.detail.split('\n').join('\n  ')}` : header;
  });

  const fullReport = lines.join('\n\n');

  const summaryLine =
    passedCount === totalCount
      ? `CalmUI Diagnostics: ${passedCount}/${totalCount} checks passed`
      : availability.found
        ? `CalmUI Diagnostics: ${passedCount}/${totalCount} checks passed`
        : 'CalmUI Diagnostics: agy not found';

  void vscode.window.showInformationMessage(summaryLine, {
    modal: true,
    detail: fullReport,
  } as vscode.MessageOptions);
}
