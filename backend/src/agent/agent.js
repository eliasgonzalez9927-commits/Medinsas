import { config } from "../config.js";
import { openai } from "../lib/openai.js";
import { logger } from "../lib/logger.js";
import { executeToolCall, getToolsForRole } from "./tools.js";
import { buildSystemPrompt } from "./systemPrompt.js";

export async function runClinicAgent({ user, text }) {
  const tools = getToolsForRole(user.role);
  const input = [
    {
      role: "system",
      content: buildSystemPrompt(user)
    },
    {
      role: "user",
      content: text
    }
  ];

  const firstResponse = await openai.responses.create({
    model: config.OPENAI_MODEL,
    input,
    tools,
    tool_choice: "auto",
    store: false
  });

  const functionCalls = firstResponse.output.filter((item) => item.type === "function_call");

  if (functionCalls.length === 0) {
    return firstResponse.output_text || "Entendido. Como puedo ayudarte?";
  }

  const toolOutputs = [];

  for (const toolCall of functionCalls) {
    try {
      const result = await executeToolCall({
        toolName: toolCall.name,
        rawArguments: toolCall.arguments,
        user
      });

      toolOutputs.push({
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify({ ok: true, data: result })
      });
    } catch (error) {
      logger.warn(
        {
          err: error,
          userId: user.id,
          role: user.role,
          toolName: toolCall.name
        },
        "Tool execution failed"
      );

      toolOutputs.push({
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify({
          ok: false,
          code: error.code || "TOOL_ERROR",
          message:
            error.code === "TOOL_FORBIDDEN"
              ? "El usuario no tiene permisos para ejecutar esta accion."
              : error.message
        })
      });
    }
  }

  const finalResponse = await openai.responses.create({
    model: config.OPENAI_MODEL,
    input: [...input, ...firstResponse.output, ...toolOutputs],
    store: false
  });

  return finalResponse.output_text || "Listo. Operacion procesada.";
}
