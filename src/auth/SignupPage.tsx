import { Link as WaspRouterLink, routes } from "wasp/client/router";
import { AuthPageLayout } from "./AuthPageLayout";
import { ChineseSignupForm } from "./ChineseAuthForms";
import { useRedirectIfLoggedIn } from "./hooks/useRedirectIfLoggedIn";

export function SignupPage() {
  useRedirectIfLoggedIn();

  return (
    <AuthPageLayout>
      <ChineseSignupForm />
      <br />
      <span className="text-sm font-medium text-gray-900">
        已经有账号？
        <WaspRouterLink to={routes.LoginRoute.to} className="underline">
          前往登录
        </WaspRouterLink>
      </span>
      <br />
    </AuthPageLayout>
  );
}
