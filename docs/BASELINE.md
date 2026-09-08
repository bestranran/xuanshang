# Implementation baseline

Captured on 2026-09-07.

- Open SaaS: `wasp-lang/open-saas@cbd30162b05d798b3a3f955ab5781940b67bec89`
- Wasp declared by template: `^0.25.0`
- React: `19.2.1`
- Prisma: `5.19.1`
- XBoard EPay reference: `cedar2025/Xboard@4f48e61a2cbc6db5338872b6bdb45ef954ec1256`

XBoard's EPay plugin sorts parameters, excludes `sign` and `sign_type`, builds
an unescaped query string, appends the merchant key directly, and calculates
lowercase MD5. The implementation locks that behavior behind `core.ts` and a
fixed vector. Production enablement still requires checking these details,
the success status, charset, and query API against the selected EPay provider.
