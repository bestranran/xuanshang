import {
  type GetPasswordResetEmailContentFn,
  type GetVerificationEmailContentFn,
} from "wasp/server/auth";

export const getVerificationEmailContent: GetVerificationEmailContentFn = ({
  verificationLink,
}) => ({
  subject: "验证您的悬赏账号邮箱",
  text: `请点击下面的链接验证邮箱：${verificationLink}`,
  html: `
        <p>请点击下面的链接验证邮箱</p>
        <a href="${verificationLink}">验证邮箱</a>
    `,
});

export const getPasswordResetEmailContent: GetPasswordResetEmailContentFn = ({
  passwordResetLink,
}) => ({
  subject: "重置您的悬赏账号密码",
  text: `请点击下面的链接重置密码：${passwordResetLink}`,
  html: `
        <p>请点击下面的链接重置密码</p>
        <a href="${passwordResetLink}">重置密码</a>
    `,
});
