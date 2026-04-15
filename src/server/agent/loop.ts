import OpenAI from 'openai';
import { env } from '../config.js';
import { SYSTEM_PROMPT } from './prompts.js';
import { queryTransactionsTool, runQueryTransactions, QueryTransactionsInput } from './tools/query_transactions.js';
import { searchGmailTool, runSearchGmail, SearchGmailInput } from './tools/search_gmail.js';

export type AgentEvent =
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; id: string; result: unknown }
  | { type: 'text'; delta: string }
  | { type: 'done'; stopReason: string }
  | { type: 'error'; message: string };

export type AgentEmitter = (event: AgentEvent) => void;

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

const TOOLS = [queryTransactionsTool, searchGmailTool];
const MAX_ITERATIONS = 6;

function getClient(): OpenAI {
  return new OpenAI({
    apiKey: env.AZURE_AI_KEY,
    baseURL: `${env.AZURE_AI_ENDPOINT}/models`,
    defaultHeaders: { 'Authorization': `Bearer ${env.AZURE_AI_KEY}` },
  });
}

async function executeTool(userId: string, name: string, args: string): Promise<unknown> {
  const parsed = JSON.parse(args || '{}');
  if (name === 'query_transactions') {
    return runQueryTransactions(userId, QueryTransactionsInput.parse(parsed));
  }
  if (name === 'search_gmail') {
    return await runSearchGmail(userId, SearchGmailInput.parse(parsed));
  }
  return { error: `Unknown tool: ${name}` };
}

function truncate(obj: unknown, maxLen = 3000): unknown {
  const s = JSON.stringify(obj);
  if (s.length <= maxLen) return obj;
  return { __truncated: true, preview: s.slice(0, maxLen) + '…' };
}

export async function runAgentLoop(
  userId: string,
  userMessage: string,
  history: Message[],
  emit: AgentEmitter
): Promise<Message[]> {
  const client = getClient();
  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: userMessage },
  ];

  let iteration = 0;
  let emittedDone = false;

  try {
    while (iteration < MAX_ITERATIONS) {
      iteration++;

      let fullContent = '';
      const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>();
      let stopReason = 'stop';

      const stream = await client.chat.completions.create({
        model: env.GROK_MODEL,
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        tools: TOOLS as OpenAI.ChatCompletionTool[],
        tool_choice: 'auto',
        stream: true,
        max_tokens: 2048,
        temperature: 0.3,
      });

      let reasoningContent = '';

      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & {
          reasoning_content?: string;
        };

        if (delta.reasoning_content) {
          reasoningContent += delta.reasoning_content;
          emit({ type: 'reasoning', delta: delta.reasoning_content });
        }

        if (delta.content) {
          fullContent += delta.content;
          emit({ type: 'text', delta: delta.content });
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!pendingToolCalls.has(idx)) {
              pendingToolCalls.set(idx, { id: '', name: '', args: '' });
            }
            const pending = pendingToolCalls.get(idx)!;
            if (tc.id) pending.id = tc.id;
            if (tc.function?.name) pending.name = tc.function.name;
            if (tc.function?.arguments) pending.args += tc.function.arguments;
          }
        }

        if (choice.finish_reason) stopReason = choice.finish_reason;
      }

      console.log(`[agent] iter=${iteration} stopReason=${stopReason} contentLen=${fullContent.length} reasoningLen=${reasoningContent.length} toolCalls=${pendingToolCalls.size}`);

      // No tool calls — final answer
      if (pendingToolCalls.size === 0) {
        // Grok reasoning models sometimes put the answer in reasoning_content
        // and leave content empty — use reasoning as fallback
        const answer = fullContent || reasoningContent;
        if (!fullContent && reasoningContent) {
          emit({ type: 'text', delta: reasoningContent });
        }
        messages.push({ role: 'assistant', content: answer });
        emit({ type: 'done', stopReason });
        emittedDone = true;
        break;
      }

      // Build assistant turn with tool calls
      const toolCallList: ToolCall[] = Array.from(pendingToolCalls.values()).map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.args },
      }));

      messages.push({ role: 'assistant', content: fullContent || null, tool_calls: toolCallList });

      // Execute tools
      for (const tc of toolCallList) {
        let input: unknown = {};
        try { input = JSON.parse(tc.function.arguments || '{}'); } catch { /* keep {} */ }
        emit({ type: 'tool_call', id: tc.id, name: tc.function.name, input });

        let result: unknown;
        try {
          result = await executeTool(userId, tc.function.name, tc.function.arguments);
        } catch (err) {
          result = { error: String(err) };
        }

        emit({ type: 'tool_result', id: tc.id, result: truncate(result) });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(truncate(result)),
        });
      }
    }
  } catch (err) {
    emit({ type: 'error', message: String(err) });
    emittedDone = true;
  }

  // Safety: always close the stream
  if (!emittedDone) {
    emit({ type: 'done', stopReason: 'max_iterations' });
  }

  return messages.slice(1);
}
