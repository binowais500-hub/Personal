// PMTiles source that uses HTTP Range requests, and falls back to fetching the whole archive once
// when a host ignores Range (answers 200 with the full file). Keeps the app working on any static host.
import { PMTiles, type Source, type RangeResponse } from "pmtiles";

export class RangeOrWholeSource implements Source {
  private whole: Promise<ArrayBuffer> | null = null;
  constructor(private url: string) {}
  getKey() { return this.url; }
  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    if (!this.whole && this.url.endsWith(".b64.txt")) {
      // hosts that only serve text: the archive is shipped base64-encoded (VITE_PMTILES_B64=1 builds)
      this.whole = fetch(this.url).then((r) => r.text()).then((t) => Uint8Array.from(atob(t.trim()), (c) => c.charCodeAt(0)).buffer);
    }
    if (this.whole) return { data: (await this.whole).slice(offset, offset + length) };
    const r = await fetch(this.url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` }, signal });
    if (r.status === 206) return { data: await r.arrayBuffer(), etag: r.headers.get("etag") || undefined };
    if (!r.ok) throw new Error(`${this.url}: HTTP ${r.status}`);
    this.whole = r.arrayBuffer();
    return { data: (await this.whole).slice(offset, offset + length) };
  }
}

export const archive = (url: string) => new PMTiles(new RangeOrWholeSource(url));
