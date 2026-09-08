import { AuthPageLayout } from "../AuthPageLayout";
import { ChineseForgotPasswordForm } from "../ChineseAuthForms";

export function RequestPasswordResetPage() {
  return (
    <AuthPageLayout>
      <ChineseForgotPasswordForm />
    </AuthPageLayout>
  );
}
