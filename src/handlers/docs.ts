import { Hono } from 'hono';

// Import markdown files as raw strings
// @ts-ignore - These will be bundled by esbuild text loader
import README from '../../README.md';
import BLOCKCHAIN_ARCHITECTURE from '../../BLOCKCHAIN_ARCHITECTURE.md';
import BLOCKCHAIN_USER_SYSTEM from '../../BLOCKCHAIN_USER_SYSTEM.md';
import ZERO_KNOWLEDGE_ARCHITECTURE from '../../ZERO_KNOWLEDGE_ARCHITECTURE.md';
import VDC_INTEGRATION_GUIDE from '../../VDC_INTEGRATION_GUIDE.md';
import DEVELOPMENT_PLAN from '../../DEVELOPMENT_PLAN.md';
import TECHNICAL_STATUS from '../../TECHNICAL_STATUS.md';
import SECURITY_GUARDRAILS from '../../SECURITY_GUARDRAILS.md';

const app = new Hono();

// Documentation content map
const DOC_CONTENT: Record<string, string> = {
  'README': README,
  'BLOCKCHAIN_ARCHITECTURE': BLOCKCHAIN_ARCHITECTURE,
  'BLOCKCHAIN_USER_SYSTEM': BLOCKCHAIN_USER_SYSTEM,
  'ZERO_KNOWLEDGE_ARCHITECTURE': ZERO_KNOWLEDGE_ARCHITECTURE,
  'VDC_INTEGRATION_GUIDE': VDC_INTEGRATION_GUIDE,
  'DEVELOPMENT_PLAN': DEVELOPMENT_PLAN,
  'TECHNICAL_STATUS': TECHNICAL_STATUS,
  'SECURITY_GUARDRAILS': SECURITY_GUARDRAILS,
};

// Simple markdown to HTML converter
function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Code blocks (must be before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers (must be before bold/italic)
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Unordered lists
  const ulPattern = /(?:^[\*\-] .*$\n?)+/gim;
  html = html.replace(ulPattern, (match) => {
    const items = match.split('\n').filter(line => line.trim());
    const listItems = items.map(item => item.replace(/^[\*\-] /, '<li>') + '</li>').join('');
    return '<ul>' + listItems + '</ul>';
  });

  // Ordered lists
  const olPattern = /(?:^\d+\. .*$\n?)+/gim;
  html = html.replace(olPattern, (match) => {
    const items = match.split('\n').filter(line => line.trim());
    const listItems = items.map(item => item.replace(/^\d+\. /, '<li>') + '</li>').join('');
    return '<ol>' + listItems + '</ol>';
  });

  // Blockquotes
  html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---$/gim, '<hr>');
  html = html.replace(/^\*\*\*$/gim, '<hr>');

  // Tables (basic support)
  const tablePattern = /(?:^\|.+\|$\n)+/gim;
  html = html.replace(tablePattern, (match) => {
    const rows = match.split('\n').filter(line => line.trim() && !line.match(/^\|[\s\-:]+\|$/));
    if (rows.length === 0) return match;
    
    const headerRow = rows[0].split('|').filter(cell => cell.trim()).map(cell => `<th>${cell.trim()}</th>`).join('');
    const bodyRows = rows.slice(1).map(row => {
      const cells = row.split('|').filter(cell => cell.trim()).map(cell => `<td>${cell.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    
    return `<table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  });

  // Paragraphs (apply to remaining text)
  const lines = html.split('\n');
  const processed: string[] = [];
  let inParagraph = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      if (inParagraph) {
        processed.push('</p>');
        inParagraph = false;
      }
      continue;
    }

    // Don't wrap block elements in paragraphs
    if (trimmed.match(/^<(h[1-6]|ul|ol|pre|blockquote|table|hr)/)) {
      if (inParagraph) {
        processed.push('</p>');
        inParagraph = false;
      }
      processed.push(line);
    } else if (trimmed.match(/^<\/(h[1-6]|ul|ol|pre|blockquote|table)>/)) {
      processed.push(line);
    } else {
      // Regular text - wrap in paragraph
      if (!inParagraph) {
        processed.push('<p>');
        inParagraph = true;
      }
      processed.push(line);
    }
  }

  if (inParagraph) {
    processed.push('</p>');
  }

  return processed.join('\n');
}

// Whitelist of allowed documentation files
const ALLOWED_DOCS = [
  'README',
  'BLOCKCHAIN_ARCHITECTURE',
  'BLOCKCHAIN_USER_SYSTEM',
  'ZERO_KNOWLEDGE_ARCHITECTURE',
  'VDC_INTEGRATION_GUIDE',
  'DEVELOPMENT_PLAN',
  'TECHNICAL_STATUS',
  'SECURITY_GUARDRAILS',
];

// Documentation content cache (loaded at build time)
const docCache: Record<string, string> = {};

// Note: In Cloudflare Workers, we can't use fs.readFileSync
// Files need to be bundled with esbuild text loader, stored in KV, or R2
// For now, we'll show a helpful message directing users to the repository

// Get documentation file
app.get('/:docName', async (c) => {
  try {
    const docName = c.req.param('docName');

    // Security check - only allow whitelisted docs
    if (!ALLOWED_DOCS.includes(docName)) {
      return c.json({
        success: false,
        error: 'Documentation not found',
      }, 404);
    }

    // Get markdown content from imported files
    let markdown = DOC_CONTENT[docName];

    if (!markdown || markdown === '' || typeof markdown !== 'string') {
      // Fallback message if file couldn't be loaded
      markdown = `# ${docName.replace(/_/g, ' ')}

## Documentation Loading

The markdown files are being bundled with the worker. If you see this message, the esbuild text loader may need configuration.

### Current Status

- **File**: \`${docName}.md\`
- **Import Type**: ${typeof markdown}
- **Content Available**: ${!!markdown}

### Available Documentation

${ALLOWED_DOCS.map(doc => `- **${doc.replace(/_/g, ' ')}**`).join('\n')}

### To View Documentation

Please refer to the [\`${docName}.md\`](https://github.com/Rob142857/VeritasDocs/blob/main/${docName}.md) file in the GitHub repository.
`;
    }

    const html = markdownToHtml(markdown);

    return c.json({
      success: true,
      data: {
        name: docName,
        html,
      },
    });
  } catch (error) {
    console.error('Error loading documentation:', error);
    return c.json({
      success: false,
      error: 'Failed to load documentation',
    }, 500);
  }
});

export default app;
