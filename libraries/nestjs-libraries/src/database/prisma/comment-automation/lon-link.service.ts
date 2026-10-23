import { Injectable } from '@nestjs/common';

// Thin, server-side-only proxy to LON's own link-generation API
// (backend/postora-link-options.php / backend/postora-generate-link.php).
// Authoring-time convenience ONLY: called from the authenticated rule-CRUD
// controller when someone is filling in a rule, never from the live
// comment-reply pipeline - that pipeline must stay independent of LON's
// uptime. The resulting link is just inserted as plain text into a reply
// field and saved like any other rule content.
export type LonLinkOptions = {
  landingPages: { slug: string; label: string }[];
  products: { sku: string; name: string; brand: string }[];
  sponsors: { id: number; name: string }[];
};

export type GenerateLonLinkParams = {
  type: 'landing' | 'purchase';
  landingSlug?: string;
  productSku?: string;
  distributorId?: number;
  source?: string;
  medium?: string;
  content?: string;
  campaign?: string;
  label?: string;
};

@Injectable()
export class LonLinkService {
  private get baseUrl() {
    return (process.env.LON_API_BASE_URL || '').replace(/\/+$/, '');
  }

  async getOptions(): Promise<LonLinkOptions> {
    const response = await fetch(`${this.baseUrl}/backend/postora-link-options.php`, {
      headers: { 'X-Api-Key': process.env.LON_API_KEY || '' },
    });
    const data = await response.json();

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || 'lon_options_request_failed');
    }

    return {
      landingPages: data.landingPages || [],
      products: data.products || [],
      sponsors: data.sponsors || [],
    };
  }

  async generateLink(params: GenerateLonLinkParams): Promise<string> {
    const response = await fetch(`${this.baseUrl}/backend/postora-generate-link.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': process.env.LON_API_KEY || '',
      },
      body: JSON.stringify(params),
    });
    const data = await response.json();

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || 'lon_generate_link_request_failed');
    }

    return data.short_url;
  }
}
