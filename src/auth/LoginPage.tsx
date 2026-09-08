import { Link as WaspRouterLink, routes } from "wasp/client/router";
import { AuthPageLayout } from "./AuthPageLayout";
import { ChineseLoginForm } from "./ChineseAuthForms";
import { useRedirectIfLoggedIn } from "./hooks/useRedirectIfLoggedIn";

export function LoginPage() {
  useRedirectIfLoggedIn();

  return (
    <AuthPageLayout>
      <ChineseLoginForm />
      <br />
      <span className="text-sm font-medium text-gray-900 dark:text-gray-900">
        还没有账号？{" "}
        <WaspRouterLink to={routes.SignupRoute.to} className="underline">
          立即注册
        </WaspRouterLink>
      </span>
      <br />
      <span className="text-sm font-medium text-gray-900">
        忘记密码？{" "}
        <WaspRouterLink
          to={routes.RequestPasswordResetRoute.to}
          className="underline"
        >
          找回密码
        </WaspRouterLink>
      </span>
    </AuthPageLayout>
  );
}
