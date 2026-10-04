import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env, isSimulated, requireConfigured } from "../env";

/**
 * Thin wrapper around the Anthropic Messages API. The model id comes ONLY from ANTHROPIC_MODEL (copy a current id from the
 * official models page; it is never guessed or hard-coded). In simulated mode, or when no key is configured locally,
 * callers use their own clearly labelled local responders - this wrapper never fabricates model output.
 */
export type AiMessage = { role: "user" | "assistant"; content: string };

export interface AiTool {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export interface AiResult {
  text: string;
  toolCalls: { id: string; name: string; input: Record<string, unknown> }[];
  stopReason: string | null;
  usage: { input: number; output: number };
}

export function aiAvailable(): boolean {
  const e = env();
  return Boolean(e.ANTHROPIC_API_KEY && e.ANTHROPIC_MODEL);
}

/** "live" only when a key and model are present AND the integration mode is live; otherwise callers must label output as simulated. */
export function aiMode(): "live" | "simulated" | "unconfigured" {
  if (isSimulated()) return "simulated";
  return aiAvailable() ? "live" : "unconfigured";
}

let client: Anthropic | null = null;

export async function complete(p: {
  system: string;
  messages: ({ role: "user" | "assistant"; content: string | unknown[] })[];
  maxTokens: number;
  tools?: AiTool[];
  timeoutMs?: number;
}): Promise<AiResult & { raw: unknown[] }> {
  const c = requireConfigured("The AI assistant", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL");
  client ??= new Anthropic({ apiKey: c.ANTHROPIC_API_KEY, maxRetries: 1, timeout: p.timeoutMs ?? 25_000 });
  const res = await client.messages.create({
    model: c.ANTHROPIC_MODEL,
    max_tokens: p.maxTokens,
    system: p.system,
    messages: p.messages as Anthropic.MessageParam[],
    ...(p.tools?.length ? { tools: p.tools as Anthropic.Tool[] } : {}),
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  const toolCalls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));
  return { text, toolCalls, stopReason: res.stop_reason, usage: { input: res.usage.input_tokens, output: res.usage.output_tokens }, raw: res.content as unknown[] };
}
