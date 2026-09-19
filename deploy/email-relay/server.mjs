import crypto from "node:crypto";
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const key = Buffer.from(process.env.APP_MASTER_KEY ?? "", "base64");
if (key.length !== 32) throw new Error("APP_MASTER_KEY must decode to 32 bytes");

function decrypt(value) {
  const [version, iv, tag, body] = value.split(".");
  if (version !== "v1") throw new Error("Unsupported encrypted setting version");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}

async function settings() {
  const result = await pool.query('SELECT "key", "encryptedValue" FROM "SystemSetting" WHERE "key" LIKE $1', ["email.%"]);
  return Object.fromEntries(result.rows.map((row) => [row.key, decrypt(row.encryptedValue)]));
}

const server = new SMTPServer({
  secure: false,
  disabledCommands: ["STARTTLS"],
  authOptional: false,
  onAuth(auth, _session, callback) {
    const ok = auth.username === process.env.RELAY_USERNAME && auth.password === process.env.RELAY_PASSWORD;
    callback(ok ? null : new Error("Invalid relay credentials"), ok ? { user: auth.username } : undefined);
  },
  async onData(stream, _session, callback) {
    try {
      const [mail, config] = await Promise.all([simpleParser(stream), settings()]);
      const host = config["email.smtpHost"], port = Number(config["email.smtpPort"]);
      if (!host || !port || !config["email.fromAddress"]) {
        console.warn("SMTP is not configured; message retained in administrator-only container logs", { to: mail.to?.text, subject: mail.subject, text: mail.text, html: mail.html });
        callback();
        return;
      }
      const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: config["email.smtpUser"] ? { user: config["email.smtpUser"], pass: config["email.smtpPassword"] ?? "" } : undefined });
      await transport.sendMail({ from: { name: config["email.fromName"] || "悬赏", address: config["email.fromAddress"] }, to: mail.to?.text, cc: mail.cc?.text, bcc: mail.bcc?.text, subject: mail.subject, text: mail.text, html: mail.html || undefined, attachments: mail.attachments });
      callback();
    } catch (error) { console.error("mail relay delivery failed", error); callback(error); }
  },
});
server.listen(2525, "0.0.0.0", () => console.log("mail relay listening on 2525"));
