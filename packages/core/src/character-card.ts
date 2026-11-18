import type { AgentDefinition } from "@pneuma/protocol";
import { uid } from "./util";

export interface ImportedCard {
  agent: AgentDefinition;
  firstMes?: string;
  alternateGreetings: string[];
  loreEntries: string[];
}

interface RawCard {
  spec?: string;
  data?: Record<string, unknown>;
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  alternate_greetings?: unknown;
  character_book?: { entries?: { content?: string; comment?: string }[] };
  extensions?: Record<string, unknown>;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function parseCharacterCard(json: unknown): ImportedCard {
  const raw = json as RawCard;
  const d: Record<string, unknown> =
    raw && typeof raw === "object" && raw.data && typeof raw.data === "object"
      ? raw.data
      : ((raw ?? {}) as Record<string, unknown>);

  const name = str(d.name) || "未命名角色";
  const persona = [str(d.description), str(d.personality), str(d.scenario)]
    .filter(Boolean)
    .join("\n");
  const book = d.character_book as RawCard["character_book"];
  const loreEntries = (book?.entries ?? [])
    .map((e) => str(e.content) || str(e.comment))
    .filter(Boolean);

  const agent: AgentDefinition = {
    id: "card-" + uid(),
    name,
    persona: persona || name,
    style: str(d.mes_example) || undefined,
    tools: [
      "set_status",
      "remember",
      "recall",
      "revise_memory",
      "send_messages",
      "send_sticker",
    ],
  };

  const greetings = Array.isArray(d.alternate_greetings)
    ? (d.alternate_greetings as unknown[]).map(str).filter(Boolean)
    : [];

  return {
    agent,
    firstMes: str(d.first_mes) || undefined,
    alternateGreetings: greetings,
    loreEntries,
  };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function extractCardFromPng(buffer: ArrayBuffer): unknown | null {
  const bytes = new Uint8Array(buffer);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 8 || !sig.every((b, i) => bytes[i] === b)) return null;
  const view = new DataView(buffer);
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    const dataStart = offset + 8;
    if (type === "tEXt" || type === "iTXt") {
      const data = bytes.subarray(dataStart, dataStart + length);
      const nul = data.indexOf(0);
      if (nul > 0) {
        const keyword = bytesToText(data.subarray(0, nul));
        if (keyword === "chara" || keyword === "ccv3") {
          let payload = data.subarray(nul + 1);
          if (type === "iTXt") {
            // iTXt: null + compression flag + method + language\0 translated\0 text
            let p = 0;
            p += 2; // compression flag + method
            while (p < payload.length && payload[p] !== 0) p++;
            p++;
            while (p < payload.length && payload[p] !== 0) p++;
            p++;
            payload = payload.subarray(p);
          }
          try {
            return JSON.parse(bytesToText(base64ToBytes(bytesToText(payload))));
          } catch {
            return null;
          }
        }
      }
    }
    if (type === "IEND") break;
    offset = dataStart + length + 4;
  }
  return null;
}

export async function importCharacterFile(file: File): Promise<ImportedCard> {
  if (file.name.toLowerCase().endsWith(".png")) {
    const json = extractCardFromPng(await file.arrayBuffer());
    if (!json) throw new Error("PNG 中未找到角色卡数据（chara/ccv3 块）");
    return parseCharacterCard(json);
  }
  return parseCharacterCard(JSON.parse(await file.text()));
}