import { Link as WaspRouterLink, routes } from "wasp/client/router";
import { AuthPageLayout } from "../AuthPageLayout";
import { ChineseVerifyEmailForm } from "../ChineseAuthForms";

export function EmailVerificationPage() {
  return (
    <AuthPageLayout>
      <ChineseVerifyEmailForm />
      <br />
      <span className="text-sm font-medium text-gray-900">
        验证完成后，{" "}
        <WaspRouterLink to={routes.LoginRoute.to} className="underline">
          前往登录
        </WaspRouterLink>
      </span>
    </AuthPageLayout>
  );
}
