import type { CookieConsentConfig } from "vanilla-cookieconsent";

declare global {
  interface Window {
    dataLayer: unknown[];
  }
}

export const getConfig = () => {
  // See https://cookieconsent.orestbida.com/reference/configuration-reference.html for configuration options.
  const config: CookieConsentConfig = {
    // Default configuration for the modal.
    root: "body",
    autoShow: true,
    disablePageInteraction: false,
    hideFromBots: import.meta.env.PROD ? true : false, // Set this to false for dev/headless tests otherwise the modal will not be visible.
    mode: "opt-in",
    // Bump the revision field when you add new services
    revision: 0,

    // Default configuration for the cookie.
    cookie: {
      name: "cc_cookie",
      domain: location.hostname,
      path: "/",
      sameSite: "Lax",
      expiresAfterDays: 365,
    },

    guiOptions: {
      consentModal: {
        layout: "box",
        position: "bottom right",
        equalWeightButtons: true,
        flipButtons: false,
      },
    },

    categories: {
      necessary: {
        enabled: true, // this category is enabled by default
        readOnly: true, // this category cannot be disabled
      },
      analytics: {
        autoClear: {
          cookies: [
            {
              name: /^_ga/, // regex: match all cookies starting with '_ga'
            },
            {
              name: "_gid", // string: exact cookie name
            },
          ],
        },

        // https://cookieconsent.orestbida.com/reference/configuration-reference.html#category-services
        services: {
          ga: {
            label: "Google Analytics",
            onAccept: () => {
              try {
                const GA_ANALYTICS_ID = import.meta.env
                  .REACT_APP_GOOGLE_ANALYTICS_ID;
                if (!GA_ANALYTICS_ID?.length) return;
                window.dataLayer = window.dataLayer || [];
                // Google's gtag.js initialization snippet relies on pushing the
                // arguments object (not a real array) into dataLayer, so the
                // gtag.js loader can replay queued events correctly.
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                function gtag(..._args: unknown[]) {
                  // eslint-disable-next-line prefer-rest-params
                  window.dataLayer.push(arguments);
                }
                gtag("js", new Date());
                gtag("config", GA_ANALYTICS_ID);

                // Adding the script tag dynamically to the DOM.
                const script = document.createElement("script");
                script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ANALYTICS_ID}`;
                script.async = true;
                document.body.appendChild(script);
              } catch (error) {
                console.error(error);
              }
            },
            onReject: () => {},
          },
        },
      },
    },

    language: {
      default: "zh",
      translations: {
        zh: {
          consentModal: {
            title: "我们使用 Cookie",
            description:
              "我们主要使用 Cookie 进行访问分析并改善使用体验。您可以接受全部 Cookie，或只保留网站运行所必需的 Cookie。",
            acceptAllBtn: "全部接受",
            acceptNecessaryBtn: "仅保留必要项",
            // showPreferencesBtn: 'Manage Individual preferences', // (OPTIONAL) Activates the preferences modal
            // TODO: Add your own privacy policy and terms and conditions links below.
            footer: `
            <a href="#" target="_blank">隐私政策</a>
            <a href="#" target="_blank">服务条款</a>
                    `,
          },
          // The showPreferencesBtn activates this modal to manage individual preferences https://cookieconsent.orestbida.com/reference/configuration-reference.html#translation-preferencesmodal
          preferencesModal: {
            sections: [],
          },
        },
      },
    },
  };

  return config;
};
