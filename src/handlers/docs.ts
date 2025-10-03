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
  'getting-started': {
    file: 'README.md',
    title: '🚀 Getting Started',
    category: 'User Guide',
    audience: 'users',
    priority: 1,
    description:
      'Welcome to Veritas Documents! Learn how to create your account, store legal documents securely, and understand our zero-knowledge architecture.',
    keywords: ['introduction', 'overview', 'quick start', 'welcome'],
  },
  'security-guardrails': {
    file: 'SECURITY_GUARDRAILS.md',
    title: '🔐 Security & Key Management',
    category: 'User Guide',
    audience: 'users',
    priority: 2,
    description:
      'Critical information about managing your private keys, account activation, and understanding why your keys are secure. Read this before activating your account!',
    keywords: ['keys', 'security', 'activation', 'backup', 'safety'],
  },
  'activation-flow': {
    file: 'ACTIVATION_TOKEN_FLOW.md',
    title: '✅ Account Activation Guide',
    category: 'User Guide',
    audience: 'users',
    priority: 3,
    description:
      'Step-by-step guide to activating your Veritas account, generating your cryptographic keys, and securely storing your credentials.',
    keywords: ['activation', 'signup', 'registration', 'onboarding'],
  },
  'security-architecture': {
    file: 'SECURITY_ARCHITECTURE.md',
    title: '🛡️ Security Architecture',
    category: 'Architecture',
    audience: 'developers',
    priority: 4,
    description:
      'Comprehensive security design including cryptographic flows, threat modeling, key management strategies, and zero-knowledge proofs.',
    keywords: ['security', 'architecture', 'cryptography', 'threats', 'design'],
  },
  'zero-knowledge': {
    file: 'ZERO_KNOWLEDGE_ARCHITECTURE.md',
    title: '🔒 Zero-Knowledge Architecture',
    category: 'Architecture',
    audience: 'developers',
    priority: 5,
    description:
      'Deep dive into our zero-knowledge security model, machine identities, split secret architecture, and why your private keys never touch our servers.',
    keywords: ['zero-knowledge', 'privacy', 'encryption', 'machine identity', 'system keys'],
  },
  'blockchain-architecture': {
    file: 'BLOCKCHAIN_ARCHITECTURE.md',
    title: '⛓️ VDC Blockchain Architecture',
    category: 'Architecture',
    audience: 'developers',
    priority: 6,
    description:
      'Design and architecture of the Veritas Documents Chain (VDC), our custom blockchain with dual signatures and post-quantum cryptography.',
    keywords: ['blockchain', 'vdc', 'consensus', 'transactions', 'merkle'],
  },
  'vdc-integration': {
    file: 'VDC_INTEGRATION_GUIDE.md',
    title: '🔧 VDC Integration Guide',
    category: 'Developer Guide',
    audience: 'developers',
    priority: 7,
    description:
      'Developer guide for integrating with the VDC blockchain, including API reference, code examples, and verification methods.',
    keywords: ['integration', 'api', 'blockchain', 'development', 'code examples'],
  },
  'quick-reference': {
    file: 'QUICK_REFERENCE.md',
    title: '📖 Developer Quick Reference',
    category: 'Developer Guide',
    audience: 'developers',
    priority: 8,
    description:
      'Command reference, API endpoints, data models, cryptography usage, and troubleshooting guide for developers.',
    keywords: ['reference', 'commands', 'api', 'troubleshooting', 'cheatsheet'],
  },
  'technical-status': {
    file: 'TECHNICAL_STATUS.md',
    title: '📊 Technical Status',
    category: 'Developer Guide',
    audience: 'developers',
    priority: 9,
    description:
      'Current implementation status, completed features, known issues, and production deployment information.',
    keywords: ['status', 'progress', 'implementation', 'production', 'deployment'],
  },
  'development-plan': {
    file: 'DEVELOPMENT_PLAN.md',
    title: '🗺️ Development Roadmap',
    category: 'Developer Guide',
    audience: 'developers',
    priority: 10,
    description:
      'Project roadmap, completed features, planned enhancements, and future development phases.',
    keywords: ['roadmap', 'planning', 'features', 'future', 'milestones'],
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
          font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: #111827;
          line-height: 1.6;
          padding: 2rem;
        }
        .container {
          max-width: 1120px;
          margin: 0 auto;
        }
        .header {
          text-align: center;
          color: #fff;
          margin-bottom: 3rem;
        }
        .header h1 {
          font-size: 3rem;
          font-weight: 700;
          margin-bottom: 0.75rem;
          text-shadow: 0 12px 24px rgba(17, 24, 39, 0.25);
        }
        .header p {
          font-size: 1.25rem;
          opacity: 0.9;
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
        }
        .doc-grid {
          display: grid;
          gap: 1.5rem;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        }
        .doc-card {
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 1.5rem;
          text-decoration: none;
          color: inherit;
          display: block;
          transition: transform 0.25s ease, box-shadow 0.25s ease;
          background: #fff;
        }
        .doc-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 32px rgba(99, 102, 241, 0.15);
          border-color: #6366f1;
        }
        .doc-card-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: #1f2937;
        }
        .doc-card-desc {
          color: #6b7280;
          font-size: 0.95rem;
          margin-bottom: 1rem;
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
        }
        .footer a {
          color: #f9fafb;
          text-decoration: underline;
        }
        @media (max-width: 640px) {
          body { padding: 1.5rem; }
          .header h1 { font-size: 2.25rem; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <header class="header">
          <h1>📚 Veritas Documentation</h1>
          <p>Zero-knowledge legal document storage secured by post-quantum cryptography.</p>
        </header>

        <section class="section">
          <h2 class="section-title">👥 User Documentation</h2>
          <p class="section-subtitle">
            Start here if you're new to Veritas Documents or need help with account setup and security best practices.
          </p>
          <div class="doc-grid">
            ${renderDocCards(userDocs, 'badge-user', 'User Guide')}
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">💻 Developer Documentation</h2>
          <p class="section-subtitle">
            Technical architecture, API references, and integration guides for engineers and system administrators.
          </p>
          <div class="doc-grid">
            ${renderDocCards(developerDocs, 'badge-dev', 'Developer')}
          </div>
        </section>

        <footer class="footer">
          <p><strong>Veritas Documents</strong> · Version 1.0.1 · Production</p>
          <p>
            <a href="/">Return to Application</a> ·
            <a href="/docs/api">API Reference</a>
          </p>
        </footer>
      </div>
    </body>
  </html>`;
}

docsHandler.get('/', async (c) => {
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
