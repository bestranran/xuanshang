import { type App } from "@wasp.sh/spec";

export const head: App["head"] = [
  "<link rel='icon' href='/favicon.ico' />",

  "<meta name='description' content='轻量、安全、账目清楚的在线悬赏平台。' />",
  "<meta name='author' content='悬赏平台' />",
  "<meta name='keywords' content='悬赏,任务,接单,资金托管,自由职业' />",

  "<meta property='og:type' content='website' />",
  "<meta property='og:title' content='悬赏平台' />",
  "<meta property='og:site_name' content='悬赏平台' />",
  "<meta property='og:url' content='https://your-saas-app.com' />",
  "<meta property='og:description' content='发布、托管、交付、验收与结算一站完成。' />",
  "<meta property='og:image' content='https://your-saas-app.com/public-banner.webp' />",
  "<meta name='twitter:image' content='https://your-saas-app.com/public-banner.webp' />",
  "<meta name='twitter:image:width' content='800' />",
  "<meta name='twitter:image:height' content='400' />",
  "<meta name='twitter:card' content='summary_large_image' />",
  // TODO: You can put your Plausible analytics scripts below (https://docs.opensaas.sh/guides/analytics/):
  // NOTE: Plausible does not use Cookies, so you can simply add the scripts here.
  // Google, on the other hand, does, so you must instead add the script dynamically
  // via the Cookie Consent component after the user clicks the "Accept" cookies button.
  "<script async data-domain='<your-site-id>' src='https://plausible.io/js/script.js'></script>", // for production
  "<script async data-domain='<your-site-id>' src='https://plausible.io/js/script.local.js'></script>", // for development
];
