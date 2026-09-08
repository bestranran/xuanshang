import { Link as WaspRouterLink, routes } from "wasp/client/router";
import { AuthPageLayout } from "../AuthPageLayout";
import { ChineseResetPasswordForm } from "../ChineseAuthForms";

export function PasswordResetPage() {
  return (
    <AuthPageLayout>
      <ChineseResetPasswordForm />
      <br />
      <span className="text-sm font-medium text-gray-900">
        重置完成后，{" "}
        <WaspRouterLink to={routes.LoginRoute.to}>前往登录</WaspRouterLink>
      </span>
    </AuthPageLayout>
  );
}
