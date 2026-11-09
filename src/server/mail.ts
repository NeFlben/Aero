import nodemailer from "nodemailer";

/** Sends through SMTP_URL. Without it (local development) the message goes to the server log. */
export async function sendMail(to: string, subject: string, text: string) {
  if (!process.env.SMTP_URL) {
    console.log(`\n[mail: SMTP_URL not set]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  await nodemailer.createTransport(process.env.SMTP_URL).sendMail({ from: process.env.MAIL_FROM ?? "Hangar <no-reply@localhost>", to, subject, text });
}
