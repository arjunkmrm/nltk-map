#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const corporaPath = path.join(__dirname, "corpora.txt");

export class SpellingBeeServer {
  private server: Server;

  constructor() {
    this.server = new Server({
      name: "nltk-mcp",
      version: "0.1.0"
    }, {
      capabilities: {
        tools: {}
      }
    });

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [{
          name: "get_longest_word",
          description: "Reads words from 'corpora.txt', filters them using the letters in `letters_array`, excludes those in `used_words`, and returns the longest valid word.",
          inputSchema: {
            type: "object",
            properties: {
              used_words: {
                type: "array",
                items: { type: "string" },
                description: "List of words already used (these won't be returned)"
              },
              letters_array: {
                type: "array",
                items: { type: "string" },
                description: "List of allowed letters (e.g. ['a', 'p', 'l', 'e'])"
              }
            },
            required: ["used_words", "letters_array"]
          }
        }]
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case "get_longest_word": {
          const { 
            used_words, 
            letters_array 
          } = request.params.arguments as {
            used_words: string[];
            letters_array: string[];
          };

          try {
            // Convert letters_array to a Set for efficient checks
            const validLetters = new Set(letters_array);
            
            // Read all words from 'corpora.txt' and apply filtering
            let validWords: string[] = [];
            
            const fileContent = fs.readFileSync(corporaPath, 'utf-8');
            const words = fileContent.split('\n');
            
            for (const line of words) {
              const word = line.trim().toLowerCase();
              if (word && this.isSubset(word, validLetters)) {
                validWords.push(word);
              }
            }
            
            // Remove words that have already been used
            validWords = validWords.filter(w => !used_words.includes(w));
            
            // Sort by length in descending order
            validWords.sort((a, b) => b.length - a.length);
            
            // Return the longest word if any remain, otherwise a fallback message
            const result = validWords.length > 0 ? validWords[0] : "No valid words found";
            
            return {
              content: [{
                type: "text",
                text: result
              }]
            };
          } catch (error: unknown) {
            console.error("Error processing request:", error);
            return {
              content: [{
                type: "text", 
                text: `Error: ${error instanceof Error ? error.message : String(error)}`
              }],
              isError: true
            };
          }
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  // Helper method to check if all characters in a word are in the valid letters set
  private isSubset(word: string, validLetters: Set<string>): boolean {
    for (const char of word) {
      if (!validLetters.has(char)) {
        return false;
      }
    }
    return true;
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`NLTK MCP server running on stdio`);
  }
}

// Start the server
const server = new SpellingBeeServer();
server.run().catch(console.error); 