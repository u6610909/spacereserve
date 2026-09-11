import sgMail from '@sendgrid/mail';

import { getSecrets } from '../config';
import { logger } from '../lib/logger';

// No verified sender exists yet (docs/architecture.md: "SendGrid key +
// verified sender + dynamic template IDs"). Plain text/subject is built in
// code instead of a SendGrid dynamic template, so no template id is needed
// either. This address is inert until SENDGRID_API_KEY is actually set —
// dev/test never reach `sgMail.send`.
const FROM_ADDRESS = 'noreply@spacereserve.dev';

let apiKeySet = false;

function ready(): boolean {
  const { sendGridApiKey } = getSecrets();
  if (!sendGridApiKey) return false;
  if (!apiKeySet) {
    sgMail.setApiKey(sendGridApiKey);
    apiKeySet = true;
  }
  return true;
}

interface EmailParams {
  to: string;
  subject: string;
  text: string;
}

/**
 * Never throws (docs/architecture.md): a booking action must succeed whether or
 * not the email goes out. Callers fire this without awaiting the result on
 * the request path — see reservations.service.ts.
 */
async function send(params: EmailParams): Promise<void> {
  if (!ready()) {
    logger.info({ to: params.to, subject: params.subject }, 'sendgrid not configured — email skipped');
    return;
  }

  try {
    await sgMail.send({ to: params.to, from: FROM_ADDRESS, subject: params.subject, text: params.text });
  } catch (err) {
    logger.warn({ err, to: params.to }, 'sendgrid send failed — booking unaffected');
  }
}

export interface ReservationEmailDetails {
  to: string;
  roomName: string;
  startTime: Date;
  endTime: Date;
}

export async function sendReservationConfirmedEmail(details: ReservationEmailDetails): Promise<void> {
  await send({
    to: details.to,
    subject: `Booking confirmed: ${details.roomName}`,
    text: `Your room ${details.roomName} is booked from ${details.startTime.toISOString()} to ${details.endTime.toISOString()}.`,
  });
}

export interface ReservationInviteEmailDetails extends ReservationEmailDetails {
  organizerName: string;
}

/** Sent once, to the attendee only, the moment the organizer adds them — not
 * to the organizer or the other attendees (they already have their own
 * confirmation). */
export async function sendReservationInvitedEmail(details: ReservationInviteEmailDetails): Promise<void> {
  await send({
    to: details.to,
    subject: `You're invited: ${details.roomName}`,
    text: `${details.organizerName} added you to a booking for ${details.roomName}, ${details.startTime.toISOString()} to ${details.endTime.toISOString()}.`,
  });
}

export async function sendReservationCancelledEmail(details: ReservationEmailDetails): Promise<void> {
  await send({
    to: details.to,
    subject: `Booking cancelled: ${details.roomName}`,
    text: `Your booking for ${details.roomName} (${details.startTime.toISOString()} - ${details.endTime.toISOString()}) was cancelled.`,
  });
}

export async function sendReservationOverriddenEmail(details: ReservationEmailDetails): Promise<void> {
  await send({
    to: details.to,
    subject: `Booking overridden by staff: ${details.roomName}`,
    text: `Your booking for ${details.roomName} (${details.startTime.toISOString()} - ${details.endTime.toISOString()}) was overridden by facility staff.`,
  });
}
