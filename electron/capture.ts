import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { desktopCapturer, nativeImage, screen } from 'electron'

export interface CapturedScreen {
  capturedAt: number
  dataUrl: string
  height: number
  protectedWindows?: string[]
  width: number
}

export interface CaptureBatch {
  protectedWindows: string[]
  rescuedWindows: string[]
  screens: CapturedScreen[]
}

export interface ProtectedCapture {
  imageFile: string
  title: string
}

export interface ProtectedCaptureResult {
  rescuedTitles: string[]
  screens: CapturedScreen[]
  titles: string[]
}

export interface WindowSourceInfo {
  id: string
  name: string
}

// C# helper (ASCII-only source). For every visible top-level window with a non-zero
// display affinity it re-captures the window's content via its Chromium GPU child
// ("Intermediate D3D Window") using PrintWindow - the affinity flag lives only on the
// top-level window, so the child renders its surface without redaction. Emits TSV:
//   <affinity>\t<title>\t<image file or empty>
const CAPTURE_PROTECTED_WINDOWS_TEMPLATE = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
public static class ProtectedWindowCapture
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int left, top, right, bottom; }
    public delegate bool EnumWindowsCb(IntPtr hWnd, IntPtr lParam);
    public delegate bool EnumChildCb(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsCb cb, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumChildCb cb, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextW(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextLengthW(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassNameW(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] static extern bool GetWindowDisplayAffinity(IntPtr hWnd, out uint affinity);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hWnd, IntPtr hdc);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int w, int h);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr hdc);
    const uint PW_RENDERFULLCONTENT = 2;

    static int ContentScore(Bitmap b)
    {
        int w = b.Width, h = b.Height;
        var colors = new Dictionary<int, int>();
        BitmapData d = b.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        byte[] row = new byte[d.Stride];
        for (int y = 0; y < h; y += 17) {
            Marshal.Copy(IntPtr.Add(d.Scan0, y * d.Stride), row, 0, d.Stride);
            for (int x = 0; x < w; x += 17) {
                int q = ((row[x * 4 + 2] >> 4) << 8) | ((row[x * 4 + 1] >> 4) << 4) | (row[x * 4] >> 4);
                if (!colors.ContainsKey(q)) colors[q] = 1;
            }
        }
        b.UnlockBits(d);
        return colors.Count;
    }

    static Bitmap PrintChild(IntPtr hwnd, int w, int h)
    {
        IntPtr screen = GetDC(IntPtr.Zero);
        IntPtr hdc = CreateCompatibleDC(screen);
        IntPtr bmp = CreateCompatibleBitmap(screen, w, h);
        IntPtr old = SelectObject(hdc, bmp);
        PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT);
        Bitmap b = Bitmap.FromHbitmap(bmp);
        SelectObject(hdc, old); DeleteObject(bmp); DeleteDC(hdc);
        ReleaseDC(IntPtr.Zero, screen);
        return b;
    }

    public static void Collect(string outDir, string outPath, int excludePid)
    {
        SetProcessDPIAware();
        Directory.CreateDirectory(outDir);
        StringBuilder sb = new StringBuilder();
        int saved = 0;
        var tops = new List<IntPtr>();
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            if (!IsWindowVisible(hWnd)) return true;
            if (GetWindowTextLengthW(hWnd) <= 0) return true;
            if (excludePid != 0) {
                uint windowPid;
                GetWindowThreadProcessId(hWnd, out windowPid);
                if (windowPid == (uint)excludePid) return true;
            }
            uint affinity;
            GetWindowDisplayAffinity(hWnd, out affinity);
            if (affinity != 0) tops.Add(hWnd);
            return true;
        }, IntPtr.Zero);
        foreach (IntPtr top in tops) {
            if (saved >= 3) break;
            StringBuilder title = new StringBuilder(256);
            GetWindowTextW(top, title, 256);
            string safeTitle = title.ToString().Replace((char)9, (char)32).Replace((char)13, (char)32).Replace((char)10, (char)32);
            uint affinity;
            GetWindowDisplayAffinity(top, out affinity);
            string imageFile = "";
            var children = new List<IntPtr>();
            EnumChildWindows(top, delegate(IntPtr hWnd, IntPtr lParam) {
                children.Add(hWnd);
                return true;
            }, IntPtr.Zero);
            IntPtr best = IntPtr.Zero;
            int bestScore = -1;
            Bitmap bestBitmap = null;
            foreach (IntPtr child in children) {
                RECT rc;
                GetWindowRect(child, out rc);
                int w = rc.right - rc.left, h = rc.bottom - rc.top;
                if (w < 200 || h < 150) continue;
                StringBuilder cls = new StringBuilder(128);
                GetClassNameW(child, cls, 128);
                string clsName = cls.ToString();
                bool preferred = clsName.IndexOf("D3D", StringComparison.OrdinalIgnoreCase) >= 0;
                if (!preferred && best != IntPtr.Zero && bestScore >= 4) continue;
                Bitmap b = PrintChild(child, w, h);
                int score = ContentScore(b);
                if (preferred && score >= 4) {
                    best = child; bestScore = score;
                    if (bestBitmap != null) bestBitmap.Dispose();
                    bestBitmap = b;
                    break;
                }
                if (score > bestScore) {
                    best = child; bestScore = score;
                    if (bestBitmap != null) bestBitmap.Dispose();
                    bestBitmap = b;
                } else {
                    b.Dispose();
                }
            }
            if (bestBitmap != null && bestScore >= 4) {
                imageFile = Path.Combine(outDir, "protected_" + saved + ".png");
                bestBitmap.Save(imageFile, ImageFormat.Png);
                saved++;
            }
            if (bestBitmap != null) bestBitmap.Dispose();
            sb.Append(affinity).Append((char)9).Append(safeTitle).Append((char)9).Append(imageFile).Append((char)10);
        }
        File.WriteAllText(outPath, sb.ToString(), Encoding.UTF8);
    }
}
'@ -ReferencedAssemblies System.Drawing
[ProtectedWindowCapture]::Collect('__OUT_DIR__', '__OUT_PATH__', __EXCLUDE_PID__)
`

export function parseProtectedCaptureLines(raw: string): ProtectedCapture[] {
  const captures: ProtectedCapture[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    if (parts.length < 2) continue
    const title = parts[1].trim()
    const imageFile = (parts[2] ?? '').trim()
    if (title.length > 0 && !captures.some((item) => item.title === title)) {
      captures.push({ imageFile, title })
    }
  }
  return captures
}

export function pickWindowSource(sources: WindowSourceInfo[], pattern: string): WindowSourceInfo | undefined {
  const keyword = pattern.trim().toLowerCase()
  if (!keyword) return undefined
  return sources.find((source) => source.name.toLowerCase().includes(keyword))
}

function buildProtectedWindowsScript(outDir: string, outFile: string, excludePid: number): string {
  return CAPTURE_PROTECTED_WINDOWS_TEMPLATE
    .replace('__OUT_DIR__', outDir.replace(/'/g, "''"))
    .replace('__OUT_PATH__', outFile.replace(/'/g, "''"))
    .replace('__EXCLUDE_PID__', String(Math.max(0, Math.round(excludePid))))
}

export async function captureProtectedWindows(excludePid = 0): Promise<ProtectedCaptureResult> {
  const tempDir = mkdtempSync(join(tmpdir(), 'practice-copilot-'))
  const outFile = join(tempDir, 'protected-windows.tsv')
  const script = buildProtectedWindowsScript(tempDir, outFile, excludePid)
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
        { stdio: 'ignore', windowsHide: true }
      )
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error('capturing protected windows timed out'))
      }, 15000)
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('exit', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error(`capturing protected windows exited with ${String(code)}`))
      })
    })
    const entries = parseProtectedCaptureLines(readFileSync(outFile, 'utf8'))
    const titles = entries.map((entry) => entry.title)
    const rescued: { screen: CapturedScreen; title: string }[] = []
    for (const entry of entries) {
      if (!entry.imageFile) continue
      const image = nativeImage.createFromPath(entry.imageFile)
      if (image.isEmpty()) continue
      const jpeg = image.toJPEG(85)
      rescued.push({
        screen: {
          capturedAt: Date.now(),
          dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
          height: image.getSize().height,
          width: image.getSize().width
        },
        title: entry.title
      })
    }
    return {
      screens: rescued.map((item) => item.screen),
      titles,
      rescuedTitles: rescued.map((item) => item.title)
    }
  } catch {
    return { rescuedTitles: [], screens: [], titles: [] }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

export async function capturePrimaryDisplay(): Promise<CapturedScreen> {
  const display = screen.getPrimaryDisplay()
  const width = Math.round(display.size.width * display.scaleFactor)
  const height = Math.round(display.size.height * display.scaleFactor)
  const sources = await desktopCapturer.getSources({
    thumbnailSize: { height, width },
    types: ['screen']
  })
  const source = sources.find((candidate) => candidate.display_id === String(display.id)) ?? sources[0]
  if (!source || source.thumbnail.isEmpty()) throw new Error('无法捕获主屏幕')

  const jpeg = source.thumbnail.toJPEG(85)
  return {
    capturedAt: Date.now(),
    dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
    height: source.thumbnail.getSize().height,
    width: source.thumbnail.getSize().width
  }
}

export async function captureAuxiliaryWindow(
  titleContains: string,
  size: { height: number; width: number }
): Promise<CapturedScreen | null> {
  const sources = await desktopCapturer.getSources({
    thumbnailSize: size,
    types: ['window']
  })
  const match = pickWindowSource(
    sources.map((source) => ({ id: source.id, name: source.name })),
    titleContains
  )
  if (!match) return null
  const source = sources.find((candidate) => candidate.id === match.id)
  if (!source || source.thumbnail.isEmpty()) return null

  const jpeg = source.thumbnail.toJPEG(85)
  return {
    capturedAt: Date.now(),
    dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
    height: source.thumbnail.getSize().height,
    width: source.thumbnail.getSize().width
  }
}

export async function captureScreen(options: { auxiliaryWindow?: string }): Promise<CaptureBatch> {
  const display = screen.getPrimaryDisplay()
  const width = Math.round(display.size.width * display.scaleFactor)
  const height = Math.round(display.size.height * display.scaleFactor)
  const auxiliaryPattern = options.auxiliaryWindow?.trim() ?? ''
  const [primary, protectedCapture, auxiliary] = await Promise.all([
    capturePrimaryDisplay(),
    captureProtectedWindows(process.pid),
    auxiliaryPattern
      ? captureAuxiliaryWindow(auxiliaryPattern, { height, width }).catch(() => null)
      : Promise.resolve(null)
  ])
  return {
    protectedWindows: protectedCapture.titles,
    rescuedWindows: protectedCapture.rescuedTitles,
    screens: [primary, ...protectedCapture.screens, ...(auxiliary ? [auxiliary] : [])]
  }
}
