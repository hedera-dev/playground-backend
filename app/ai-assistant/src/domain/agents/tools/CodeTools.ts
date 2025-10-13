import { z } from 'zod';
import { tool } from 'ai';
import { ICodeIntegrationAgent } from '../types/index.js';

export const ProposeCodeChangeSchema = z.object({
  changes: z.array(
    z.object({
      mode: z.enum(['add', 'replace', 'delete']),
      code: z.string().describe('The new/modified code with proper indentation'),
      contextBefore: z.string().describe('Code lines before the change for location identification'),
      contextAfter: z.string().describe('Code lines after the change for location identification')
    })
  )
});

export type ProposeCodeChange = z.infer<typeof ProposeCodeChangeSchema>;

export const ApplyCodeChangesSchema = z.object({
  appliedChanges: z.array(
    z.object({
      mode: z.enum(['add', 'replace', 'delete']),
      code: z.string().describe('The code to be applied'),
      startLine: z.number().int().min(1).describe('Start line number (1-based)'),
      endLine: z.number().int().min(1).describe('End line number (1-based)')
    })
  )
});

export type ApplyCodeChanges = z.infer<typeof ApplyCodeChangesSchema>;

export const proposeCodeTool = (applyCodeAgent: ICodeIntegrationAgent, code: string, userId: string, sessionId: string) =>
  tool({
    description: 'Propose code changes with context - automatically determines exact locations using second agent',
    inputSchema: ProposeCodeChangeSchema,
    execute: async (args: any) => {
      if (!args || !args.changes) {
        return {
          error: 'Invalid arguments provided',
          proposedChanges: []
        };
      }

      try {
        const appliedChanges = await applyCodeAgent.generateCodeChanges(args, code, userId, sessionId);

        return {
          proposedChanges: args.changes,
          appliedChanges: appliedChanges,
          status: 'code_generated'
        };
      } catch (error) {
        return {
          proposedChanges: args.changes,
          error: 'Failed to determine exact locations',
          status: 'code_generated'
        };
      }
    }
  });
