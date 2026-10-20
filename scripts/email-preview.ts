// Writes every email to .email-preview/*.html so you can open them in a browser without sending anything.
//   npm run email-preview
import { mkdirSync, writeFileSync } from "node:fs";
import {
  adminConflictEmail,
  adminNewReceiptEmail,
  paymentConfirmedEmail,
  receiptReceivedEmail,
  reservationExpiredEmail,
  reservationStartedEmail,
  verificationCodeEmail,
} from "../lib/email-templates.ts";

process.env.NEXT_PUBLIC_SITE_URL ||= "https://pay.naomikatzart.com";

const name = "Abdullah Sajid";
const product = "Afterglow in Electric Blue II";
const reference = "BT-XVKWLB";
const id = "00000000-0000-0000-0000-000000000000";

const mails = {
  "1-verification-code": verificationCodeEmail({ name, code: "482915", ttlMin: 10 }),
  "2-reservation-started": reservationStartedEmail({ name, product, reference, minutes: 15, id }),
  "3-receipt-received": receiptReceivedEmail({ name, product, reference }),
  "4-payment-confirmed": paymentConfirmedEmail({ name, product, reference }),
  "5-reservation-expired": reservationExpiredEmail({ name, product, reference }),
  "6-admin-new-receipt": adminNewReceiptEmail({ customer: name, email: "customer@example.com", product, reference, id }),
  "7-admin-conflict": adminConflictEmail({
    message: `Big Cartel order #1234 includes "${product}", which is reserved by ${name} (${reference}). Check which payment to honour and refund the other.`,
    reference,
  }),
};

mkdirSync(".email-preview", { recursive: true });
for (const [file, mail] of Object.entries(mails)) writeFileSync(`.email-preview/${file}.html`, mail.html);
console.log(`Wrote ${Object.keys(mails).length} files to .email-preview/ (open them in a browser).`);

export {};
