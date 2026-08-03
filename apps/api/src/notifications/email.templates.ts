const BRAND = '#0B1220';

// Minimal shared shell. Table-based and inline-styled because email clients
// ignore most modern CSS — this is not a place for a design system.
function layout(title: string, body: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:${BRAND}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
    <tr><td>
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;color:#4E8F01;font-weight:bold">SUREWINA</p>
      <h1 style="margin:0 0 16px;font-size:20px;color:${BRAND}">${title}</h1>
      ${body}
    </td></tr>
  </table>
  <p style="max-width:560px;margin:16px auto 0;font-size:11px;color:#8a8f98;text-align:center">
    Surewina · Operated under licence from the National Lottery Regulatory Commission
  </p>
</body></html>`;
}

export function adminLoginAlert(args: {
  fullName: string;
  email: string;
  role: string;
  tier: string;
  at: Date;
  ipAddress: string | null;
  usedMfa: boolean;
}) {
  const when = args.at.toLocaleString('en-NG', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  });

  const text = [
    `A sign-in to the Surewina admin portal was just completed on your account.`,
    ``,
    `Account: ${args.email}`,
    `Access: ${args.role.replace(/_/g, ' ')} · ${args.tier} clearance`,
    `When: ${when} (WAT)`,
    args.ipAddress ? `IP address: ${args.ipAddress}` : null,
    `Verification: ${args.usedMfa ? 'password + authenticator code' : 'password only'}`,
    ``,
    `If this was not you, change your password immediately and tell another`,
    `super admin so your access can be revoked.`,
  ]
    .filter(Boolean)
    .join('\n');

  const html = layout(
    'New sign-in to your admin account',
    `
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6">
      A sign-in to the Surewina admin portal was just completed on your account.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.8">
      <tr><td style="color:#5e5f62">Account</td><td align="right"><strong>${args.email}</strong></td></tr>
      <tr><td style="color:#5e5f62">Access</td><td align="right"><strong>${args.role.replace(/_/g, ' ')} · ${args.tier}</strong></td></tr>
      <tr><td style="color:#5e5f62">When</td><td align="right"><strong>${when} WAT</strong></td></tr>
      ${args.ipAddress ? `<tr><td style="color:#5e5f62">IP address</td><td align="right"><strong>${args.ipAddress}</strong></td></tr>` : ''}
      <tr><td style="color:#5e5f62">Verification</td><td align="right"><strong>${args.usedMfa ? 'Password + authenticator' : 'Password only'}</strong></td></tr>
    </table>
    <div style="margin-top:20px;padding:14px;background:#fff8e6;border:1px solid #f2d98a;border-radius:8px;font-size:13px;line-height:1.6">
      <strong>Not you?</strong> Change your password immediately and tell another super admin
      so your access can be revoked.
    </div>`,
  );

  return { subject: 'New sign-in to your Surewina admin account', text, html };
}

export function ticketReceipt(args: {
  drawName: string;
  drawShortCode: string;
  drawDate: Date;
  cutoffAt: Date;
  ticketRefs: string[];
  amountNgn: number;
  receiptUrl: string;
}) {
  const multiple = args.ticketRefs.length > 1;
  const naira = (n: number) => `N${n.toLocaleString('en-NG')}`;
  const day = (d: Date) =>
    d.toLocaleDateString('en-NG', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'Africa/Lagos',
    });

  const text = [
    `SUREWINA — ${args.drawName} (${args.drawShortCode})`,
    ``,
    multiple ? `Your ${args.ticketRefs.length} tickets:` : `Your ticket:`,
    ...args.ticketRefs.map((r) => `  ${r}`),
    ``,
    `Draw date: ${day(args.drawDate)}`,
    `Amount paid: ${naira(args.amountNgn)}`,
    ``,
    `Print your ticket: ${args.receiptUrl}`,
    ``,
    `Keep ${multiple ? 'these references' : 'this reference'} safe — you'll need`,
    `${multiple ? 'them' : 'it'} to check results and claim a prize.`,
    ``,
    `Terms & Conditions apply. Customer care: 080 8000 9000`,
  ].join('\n');

  const html = layout(
    multiple ? `Your ${args.ticketRefs.length} tickets are confirmed` : 'Your ticket is confirmed',
    `
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6">
      You're entered into <strong>${args.drawName}</strong>.
      ${multiple ? 'Each ticket is a separate entry.' : ''}
    </p>

    <div style="margin:0 0 18px;padding:16px;background:#f8faf4;border-radius:8px;text-align:center">
      ${args.ticketRefs
        .map(
          (r) =>
            `<div style="font-family:monospace;font-size:18px;font-weight:bold;letter-spacing:2px;padding:4px 0">${r}</div>`,
        )
        .join('')}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.8">
      <tr><td style="color:#5e5f62">Draw</td><td align="right"><strong>${args.drawName} (${args.drawShortCode})</strong></td></tr>
      <tr><td style="color:#5e5f62">Draw date</td><td align="right"><strong>${day(args.drawDate)}</strong></td></tr>
      <tr><td style="color:#5e5f62">Amount paid</td><td align="right"><strong>${naira(args.amountNgn)}</strong></td></tr>
    </table>

    <div style="margin-top:22px;text-align:center">
      <a href="${args.receiptUrl}"
         style="display:inline-block;background:#0B1220;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:bold">
        View &amp; print your ticket
      </a>
    </div>

    <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#5e5f62">
      Keep ${multiple ? 'these references' : 'this reference'} safe — you'll need
      ${multiple ? 'them' : 'it'} to check results and claim a prize.
      Terms &amp; Conditions apply. Customer care: 080 8000 9000
    </p>`,
  );

  return {
    subject: `Your Surewina ticket${multiple ? 's' : ''} — ${args.drawName}`,
    text,
    html,
  };
}