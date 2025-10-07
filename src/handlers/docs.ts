import { Hono } from 'hono';

import type { Environment, APIResponse } from '../types';

type DocAudience = 'users' | 'developers';

type DocCatalogEntry = {
  file: string;
  title: string;
  category: string;
  audience: DocAudience;
  priority: number;
  description: string;
  keywords: string[];
};

const DOCS_CATALOG: Record<string, DocCatalogEntry> = {
  // User-Facing Documentation
  'veritas-documents-chain': {
    file: 'VERITAS_DOCUMENTS_CHAIN.md',
    title: '⛓️ Veritas Documents Chain',
    category: 'User Guide',
    audience: 'users',
    priority: 1,
    description:
      'Understand the Veritas Documents Chain (VDC) - our custom blockchain that securely stores your legal documents with post-quantum cryptography and multi-layer verification.',
    keywords: ['blockchain', 'vdc', 'security', 'storage', 'cryptography'],
  },
  'ethereum-root': {
    file: 'ETHEREUM_ROOT.md',
    title: '🌐 Ethereum Root Anchoring',
    category: 'User Guide',
    audience: 'users',
    priority: 2,
    description:
      'Learn how Veritas anchors document proofs to Ethereum for independent verification, ensuring your documents remain provably authentic forever.',
    keywords: ['ethereum', 'anchoring', 'verification', 'proof', 'transparency'],
  },
  'maatara-core': {
    file: 'MAATARA_CORE.md',
    title: '🔐 Ma\'atara Core Technology',
    category: 'User Guide',
    audience: 'users',
    priority: 3,
    description:
      'Discover Ma\'atara Core - the revolutionary post-quantum cryptography toolkit that powers Veritas and will transform online security worldwide.',
    keywords: ['maatara', 'cryptography', 'post-quantum', 'security', 'innovation'],
  },
  'user-how-to': {
    file: 'USER_HOW_TO.md',
    title: '� How to Use Veritas Documents',
    category: 'User Guide',
    audience: 'users',
    priority: 4,
    description:
      'Complete step-by-step guide: from account activation to creating, storing, and verifying your legal documents with quantum-resistant security.',
    keywords: ['guide', 'tutorial', 'activation', 'documents', 'verification'],
  },

  // Technical Documentation (Consolidated)
  'technical-information': {
    file: 'TECHNICAL_INFORMATION.md',
    title: '⚙️ Technical Information',
    category: 'Technical',
    audience: 'developers',
    priority: 5,
    description:
      'Comprehensive technical documentation including security architecture, blockchain design, API references, and implementation details.',
    keywords: ['technical', 'architecture', 'api', 'security', 'implementation'],
  },
} satisfies Record<string, DocCatalogEntry>;

const docsHandler = new Hono<{ Bindings: Environment }>();

function extractVersionMetadata(content: string): {
  version: string;
  lastUpdated: string;
  status: string;
} {
  const versionMatch = content.match(/\*\*Version\*\*:\s*([^\n]+)/i);
  const dateMatch = content.match(/\*\*Last Updated\*\*:\s*([^\n]+)/i);
  const statusMatch = content.match(/\*\*Status\*\*:\s*([^\n]+)/i);

  return {
    version: versionMatch ? versionMatch[1].trim() : '1.0.0',
    lastUpdated: dateMatch ? dateMatch[1].trim() : 'Unknown',
    status: statusMatch ? statusMatch[1].trim() : 'Draft',
  };
}

function renderDocCards(
  docs: Array<[string, DocCatalogEntry]>,
  badgeClass: string,
  badgeLabel: string,
): string {
  return docs
    .map(([slug, meta]) => `
      <a href="/docs/${slug}" class="doc-card">
        <div class="doc-card-title">
          ${meta.title}
          <span class="badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <div class="doc-card-desc">${meta.description}</div>
        <div class="doc-card-meta">
          <span>📄 ${meta.file}</span>
          <span>⭐ Priority ${meta.priority}</span>
        </div>
      </a>
    `)
    .join('');
}

function renderDocsIndex(
  userDocs: Array<[string, DocCatalogEntry]>,
  developerDocs: Array<[string, DocCatalogEntry]>,
): string {
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Veritas Documents · Documentation</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: #111827;
          line-height: 1.6;
          padding: 1rem;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
        }
        .header {
          text-align: center;
          color: #fff;
          margin-bottom: 3rem;
          padding: 2rem 1rem;
        }
        .header h1 {
          font-size: clamp(2rem, 5vw, 3.5rem);
          font-weight: 800;
          margin-bottom: 1rem;
          text-shadow: 0 12px 24px rgba(17, 24, 39, 0.25);
          letter-spacing: -0.025em;
        }
        .header p {
          font-size: clamp(1rem, 2.5vw, 1.25rem);
          opacity: 0.9;
          max-width: 600px;
          margin: 0 auto;
        }
        .section {
          background: #fff;
          border-radius: 20px;
          padding: 2rem;
          margin-bottom: 2rem;
          box-shadow: 0 20px 40px rgba(15, 23, 42, 0.12);
        }
        .section-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: #4338ca;
          margin-bottom: 1.25rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .section-subtitle {
          color: #4b5563;
          margin-bottom: 1.75rem;
          font-size: 1.1rem;
          line-height: 1.6;
        }
        .doc-grid {
          display: grid;
          gap: 1.5rem;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        }
        .doc-card {
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 1.5rem;
          text-decoration: none;
          color: inherit;
          display: block;
          transition: all 0.25s ease;
          background: #fff;
          position: relative;
          overflow: hidden;
        }
        .doc-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #667eea, #764ba2);
          opacity: 0;
          transition: opacity 0.25s ease;
        }
        .doc-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 32px rgba(99, 102, 241, 0.15);
          border-color: #6366f1;
        }
        .doc-card:hover::before {
          opacity: 1;
        }
        .doc-card-title {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 0.75rem;
          color: #1f2937;
        }
        .doc-card-desc {
          color: #6b7280;
          font-size: 0.95rem;
          margin-bottom: 1rem;
          line-height: 1.5;
        }
        .doc-card-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          font-size: 0.85rem;
          color: #9ca3af;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .badge-user { background: #dbeafe; color: #1e40af; }
        .badge-dev { background: #fde68a; color: #92400e; }
        .footer {
          text-align: center;
          color: #e0e7ff;
          margin-top: 3rem;
          padding: 2rem 1rem;
        }
        .footer a {
          color: #f9fafb;
          text-decoration: none;
          border-bottom: 1px solid #93c5fd;
          padding-bottom: 2px;
          transition: color 0.2s ease;
        }
        .footer a:hover {
          color: #dbeafe;
        }
        .hero-section {
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          border-radius: 20px;
          padding: 3rem 2rem;
          text-align: center;
          margin-bottom: 2rem;
          border: 1px solid #e5e7eb;
        }
        .hero-title {
          font-size: clamp(1.5rem, 4vw, 2.5rem);
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 1rem;
        }
        .hero-subtitle {
          font-size: 1.1rem;
          color: #475569;
          max-width: 700px;
          margin: 0 auto 2rem;
          line-height: 1.6;
        }
        .hero-stats {
          display: flex;
          justify-content: center;
          gap: 2rem;
          flex-wrap: wrap;
        }
        .stat {
          text-align: center;
        }
        .stat-number {
          font-size: 2rem;
          font-weight: 800;
          color: #4338ca;
          display: block;
        }
        .stat-label {
          font-size: 0.9rem;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        @media (max-width: 640px) {
          body { padding: 0.5rem; }
          .header { padding: 1rem 0.5rem; margin-bottom: 2rem; }
          .section { padding: 1.5rem; }
          .doc-grid { grid-template-columns: 1fr; }
          .hero-stats { gap: 1rem; }
          .stat-number { font-size: 1.5rem; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <header class="header">
          <h1>📚 Veritas Documentation</h1>
          <p>Secure legal document storage powered by post-quantum cryptography</p>
        </header>

        <section class="hero-section">
          <h2 class="hero-title">Zero-Knowledge Security for Legal Documents</h2>
          <p class="hero-subtitle">
            Veritas Documents combines cutting-edge post-quantum cryptography with blockchain technology
            to provide unparalleled security and transparency for your legal documents.
          </p>
          <div class="hero-stats">
            <div class="stat">
              <span class="stat-number">PQC</span>
              <span class="stat-label">Quantum Resistant</span>
            </div>
            <div class="stat">
              <span class="stat-number">IPFS</span>
              <span class="stat-label">Distributed Storage</span>
            </div>
            <div class="stat">
              <span class="stat-number">ETH</span>
              <span class="stat-label">Blockchain Anchored</span>
            </div>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">👥 User Guide</h2>
          <p class="section-subtitle">
            Everything you need to know about using Veritas Documents securely.
            Start here to understand our technology and how to protect your legal documents.
          </p>
          <div class="doc-grid">
            ${renderDocCards(userDocs, 'badge-user', 'User Guide')}
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">⚙️ Technical Documentation</h2>
          <p class="section-subtitle">
            Detailed technical information for developers, system administrators, and security researchers.
          </p>
          <div class="doc-grid">
            ${renderDocCards(developerDocs, 'badge-dev', 'Technical')}
          </div>
        </section>

        <footer class="footer">
          <p><strong>Veritas Documents</strong> · Version 1.0.1 · Production</p>
          <p>
            <a href="/">Return to Application</a> · 
            <a href="/docs/api">API Reference</a> · 
            <a href="https://github.com/Rob142857/VeritasDocs">GitHub</a>
          </p>
        </footer>
      </div>
    </body>
  </html>`;
}docsHandler.get('/', async (c) => {
  const env = c.env;
  const docs = Object.entries(DOCS_CATALOG);
  let userDocs = docs
    .filter(([, meta]) => meta.audience === 'users')
    .sort((a, b) => a[1].priority - b[1].priority);
  let developerDocs = docs
    .filter(([, meta]) => meta.audience === 'developers')
    .sort((a, b) => a[1].priority - b[1].priority);

  // If a KV index exists, enrich the catalog dynamically
  const indexRaw = await env.VERITAS_KV.get('docs:index');
  if (indexRaw) {
    try {
      const index = JSON.parse(indexRaw) as Array<any>;
      const dynamicEntries: Array<[string, DocCatalogEntry]> = index.map((d) => [
        d.slug,
        {
          file: d.file,
          title: d.title || d.slug,
          category: d.category || 'Documentation',
          audience: (d.audience as DocAudience) || 'developers',
          priority: d.priority ?? 99,
          description: d.summary || 'Documentation',
          keywords: d.keywords || [],
        },
      ]);
      const combined = new Map<string, DocCatalogEntry>([...docs, ...dynamicEntries]);
      const all = Array.from(combined.entries());
      userDocs = all.filter(([, m]) => m.audience === 'users').sort((a, b) => a[1].priority - b[1].priority);
      developerDocs = all
        .filter(([, m]) => m.audience === 'developers')
        .sort((a, b) => a[1].priority - b[1].priority);
    } catch {}
  }

  return c.html(renderDocsIndex(userDocs, developerDocs));
});

docsHandler.get('/api', (c) =>
  c.json({
    success: true,
    data: {
      message: 'API documentation coming soon',
      endpoints: {
        authentication: '/api/auth/*',
        vdc: '/api/vdc/*',
        documents: '/api/web3-assets/*',
        search: '/api/search',
      },
    },
  }),
);

docsHandler.get('/:slug/raw', async (c) => {
  const env = c.env;
  const slug = c.req.param('slug');
  const docMeta = DOCS_CATALOG[slug];

  // Try catalog first, then fallback to direct KV lookup by filename `${slug}.md`
  const fileName = docMeta?.file ?? `${slug}.md`;
  const mdKey = `docs:${fileName}`;
  const mdContent = await env.VERITAS_KV.get(mdKey);

  if (!mdContent) {
    return c.text(`Documentation file ${fileName} not found`, 404);
  }

  return c.text(mdContent, 200, {
    'Content-Type': 'text/markdown; charset=utf-8',
  });
});

// List documents from KV index if available, else from static catalog (JSON)
// Moved from '/' to '/index.json' to avoid clashing with the HTML index route above
docsHandler.get('/index.json', async (c) => {
  const env = c.env;
  // Attempt to read an auto-generated docs index uploaded at build time
  const indexRaw = await env.VERITAS_KV.get('docs:index');
  if (indexRaw) {
    try {
      const index = JSON.parse(indexRaw);
      return c.json<APIResponse>({ success: true, data: { docs: index } });
    } catch {}
  }
  // Fallback to static catalog keys
  return c.json<APIResponse>({ success: true, data: { docs: Object.keys(DOCS_CATALOG) } });
});

docsHandler.get('/:slug', async (c) => {
  const env = c.env;
  const slug = c.req.param('slug');
  let docMeta = DOCS_CATALOG[slug];

  // Fallback 1: Treat slug as a direct filename base, e.g. README -> README.md
  // Fallback 2: Try KV-stored docs index (docs:index) to resolve file mapping
  let fileName = docMeta?.file ?? `${slug}.md`;
  if (!docMeta) {
    const indexRaw = await env.VERITAS_KV.get('docs:index');
    if (indexRaw) {
      try {
        const index = JSON.parse(indexRaw) as Array<{ slug: string; file: string; title?: string; category?: string; audience?: string; priority?: number; keywords?: string[] }>;
        const found = index.find((d) => d.slug === slug || d.file === fileName);
        if (found) {
          fileName = found.file;
          docMeta = {
            file: found.file,
            title: found.title || slug.replace(/_/g, ' '),
            category: found.category || 'Documentation',
            audience: (found.audience as DocAudience) || 'developers',
            priority: found.priority ?? 99,
            description: found.title || 'Documentation',
            keywords: found.keywords || [],
          };
        }
      } catch {}
    }
  }

  const mdContent = await env.VERITAS_KV.get(`docs:${fileName}`);

  if (!mdContent) {
    return c.json<APIResponse>(
      {
        success: false,
        error: `Documentation file ${fileName} not found in storage. Run 'npm run upload-docs' to upload documentation.`,
      },
      404,
    );
  }

  const versionMeta = extractVersionMetadata(mdContent);

  return c.json<APIResponse>({
    success: true,
    data: {
      slug,
      title: (docMeta?.title) ?? slug.replace(/_/g, ' '),
      category: (docMeta?.category) ?? 'Documentation',
      audience: (docMeta?.audience) ?? 'developers',
      description: (docMeta?.description) ?? 'Documentation',
      keywords: (docMeta?.keywords) ?? [],
      file: fileName,
      version: versionMeta.version,
      lastUpdated: versionMeta.lastUpdated,
      status: versionMeta.status,
      content: mdContent,
    },
  });
});

export default docsHandler;
