// Loaded before anything else (see index.ts). h3-js builds its decoders at import time with
// `new TextDecoder("utf8")` and `new TextDecoder("utf-16le")`; Hermes' TextDecoder only accepts "utf-8"
// and throws on any other label, which crashes the app on launch. Normalise the label and decode
// UTF-16LE by hand; everything else goes to the native decoder untouched.
type DecodeInput = ArrayBuffer | ArrayBufferView;

const Native = globalThis.TextDecoder as typeof TextDecoder | undefined;

function supports(label: string): boolean {
  try { new Native!(label); return true; } catch { return false; }
}

if (Native && (!supports("utf8") || !supports("utf-16le"))) {
  class CompatTextDecoder {
    readonly encoding: string;
    private inner: TextDecoder | null;

    constructor(label = "utf-8", options?: TextDecoderOptions) {
      const l = label.trim().toLowerCase();
      if (l === "utf-16le" || l === "utf-16") {
        this.encoding = "utf-16le";
        this.inner = null;
      } else {
        this.inner = new Native!(l === "utf8" ? "utf-8" : l, options);
        this.encoding = this.inner.encoding;
      }
    }

    decode(input?: DecodeInput): string {
      if (this.inner) return this.inner.decode(input);
      if (!input) return "";
      const bytes = ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : new Uint8Array(input);
      let out = "";
      for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
      return out;
    }
  }
  (globalThis as { TextDecoder: unknown }).TextDecoder = CompatTextDecoder;
}

export {};
