import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { ICodeIntegrationAgent } from '../types/index.js';
import { ApplyCodeChangesSchema, ProposeCodeChange } from '../tools/CodeTools.js';

const SYSTEM_PROMPT = `
You are a code placement specialist - the second agent in a two-agent system.

Your task:
- Receive proposed changes with contextBefore and contextAfter
- Find the exact location in the original code by matching the context
- Use applyCode tool ONCE for each change with precise startLine and endLine

CRITICAL MATCHING PROCESS:
1. Look for the EXACT contextBefore text in the original code
2. Find the line that comes AFTER contextBefore
3. Verify that contextAfter appears AFTER that line
4. The target line is the one BETWEEN contextBefore and contextAfter

EXAMPLE:
If contextBefore is "console.log('Transfer HBAR');" (line 30)
And contextAfter is "console.log('Transaction ID');" (line 32)
Then the target line is 31 (the line between them)

Rules:
1. Use 1-based line numbering (first line = 1)
2. For "replace" mode: startLine = endLine = the line to replace
3. For "add" mode: startLine = endLine = insertion point
4. For "delete" mode: startLine and endLine define range to delete
5. ONLY call applyCode ONCE per change - no duplicates
6. Match context text EXACTLY, including whitespace and indentation

Process each change separately with applyCode tool. Be very careful with line counting.
`

export class CodeIntegrationAgent implements ICodeIntegrationAgent {

  private model: string;

  constructor(model: string) {
    this.model = model;
  }

  async generateCodeChanges(proposedChanges: ProposeCodeChange, code: string): Promise<any[]> {
    if (!code || !proposedChanges.changes || proposedChanges.changes.length === 0) {
      return [];
    }

    const numberedCode = code.split('\n').map((line, index) =>
      `${(index + 1).toString().padStart(3, ' ')}| ${line}`
    ).join('\n');

    const prompt = `
You are a code placement specialist.Your task is to find exact line numbers for proposed changes.

Original code with line numbers:
    \`\`\`
${numberedCode}
\`\`\`

Proposed changes:
${JSON.stringify(proposedChanges.changes, null, 2)}

INSTRUCTIONS:
1. Find the EXACT contextBefore text in the numbered code above
2. Find the EXACT contextAfter text in the numbered code above  
3. The target line is between these two contexts
4. Keep the indentation of the original code
5. Use precise startLine and endLine numbers (1-based line numbering)
6. Return an array of code changes with exact line numbers

Process each change one by one carefully and return all changes in the appliedChanges array.
`;

    try {
      const result: any = await generateObject({
        model: openai(this.model),
        prompt: prompt,
        system: SYSTEM_PROMPT,
        schema: ApplyCodeChangesSchema,
        schemaName: "CodeChanges",
        schemaDescription: "Array of code changes with exact line numbers"
      });

      return result?.object?.appliedChanges || [];
    } catch (error) {
      console.error('Error generating code changes:', error);
      return [];
    }
  }
}
