import { Environment, OneTimeLink } from '../types';

const ACTIVATION_R2_PREFIX = 'activation/tokens/';

function getActivationKey(token: string): string {
  return `${ACTIVATION_R2_PREFIX}${token}.json`;
}

export async function loadActivationLink(env: Environment, token: string): Promise<OneTimeLink | null> {
  const bucket = env.VDC_STORAGE;
  const r2Key = getActivationKey(token);

  if (bucket) {
    try {
      const r2Object = await bucket.get(r2Key);
      if (r2Object) {
        const parsed = JSON.parse(await r2Object.text()) as OneTimeLink;
        return parsed;
      }
    } catch (error) {
      console.error(`Failed to load activation link ${token} from R2`, error);
    }
  }

  const legacyKey = `link:${token}`;
  const legacyValue = await env.VERITAS_KV.get(legacyKey);
  if (!legacyValue) {
    return null;
  }

  try {
    const link = JSON.parse(legacyValue) as OneTimeLink;

    if (bucket) {
      try {
        await bucket.put(r2Key, JSON.stringify(link), {
          httpMetadata: {
            contentType: 'application/json'
          },
          customMetadata: {
            token: link.token,
            email: link.email,
            expiresAt: link.expiresAt.toString(),
            inviteType: link.inviteType
          }
        });
        await env.VERITAS_KV.delete(legacyKey);
      } catch (error) {
        console.error(`Failed to migrate activation link ${token} to R2`, error);
      }
    }

    return link;
  } catch (error) {
    console.error(`Failed to parse activation link ${token} from KV`, error);
    return null;
  }
}

export async function storeActivationLink(env: Environment, link: OneTimeLink): Promise<void> {
  const bucket = env.VDC_STORAGE;
  const payload = JSON.stringify(link);
  const r2Key = getActivationKey(link.token);

  if (bucket) {
    try {
      await bucket.put(r2Key, payload, {
        httpMetadata: {
          contentType: 'application/json'
        },
        customMetadata: {
          token: link.token,
          email: link.email,
          expiresAt: link.expiresAt.toString(),
          inviteType: link.inviteType
        }
      });
      await env.VERITAS_KV.delete(`link:${link.token}`);
      return;
    } catch (error) {
      console.error(`Failed to store activation link ${link.token} in R2`, error);
    }
  }

  console.warn('VDC_STORAGE binding not configured or unavailable; using KV for activation link storage');
  await env.VERITAS_KV.put(`link:${link.token}`, payload);
}
