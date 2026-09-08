// JSON-LD structured data for SEO. Helps search engines and LLMs understand
// your app so it can appear in rich results and AI answers. Customize the
// placeholders below to match your product. See https://schema.org for types.
const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": "https://your-saas-app.com/#software",
      name: "悬赏平台",
      description: "轻量、安全、账目清楚的在线悬赏平台。",
      url: "https://your-saas-app.com",
      applicationCategory: "BusinessApplication",
      operatingSystem: "跨平台",
      image: "https://your-saas-app.com/public-banner.webp",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@type": "WebSite",
      "@id": "https://your-saas-app.com/#website",
      url: "https://your-saas-app.com",
      name: "悬赏平台",
      description: "发布、托管、交付、验收与结算一站完成。",
    },
  ],
};

export function SchemaMarkup() {
  return <script type="application/ld+json">{JSON.stringify(schema)}</script>;
}
