import { EmailClient } from '@azure/communication-email';

import { getSecrets } from '../config';
import { logger } from '../lib/logger';

// Azure Communication Services Email, not SendGrid (project rule): pay-per-send
// with no monthly minimum, billed on the same Azure subscription as everything
// else here. `SpaceReserve-AcsSenderAddress` is the "From" address ACS issues
// for the resource's Azure Managed Domain (e.g. donotreply@<guid>.azurecomm.net)
// — set alongside the connection string, since it's resource-specific and not
// something the app can hardcode.
let cachedClient: EmailClient | undefined;

function getClient(): EmailClient | null {
  const { acsConnectionString } = getSecrets();
  if (!acsConnectionString) return null;
  if (!cachedClient) {
    cachedClient = new EmailClient(acsConnectionString);
  }
  return cachedClient;
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
  const client = getClient();
  const { acsSenderAddress } = getSecrets();
  if (!client || !acsSenderAddress) {
    logger.info({ to: params.to, subject: params.subject }, 'ACS email not configured — email skipped');
    return;
  }

  try {
    const poller = await client.beginSend({
      senderAddress: acsSenderAddress,
      content: { subject: params.subject, plainText: params.text },
      recipients: { to: [{ address: params.to }] },
    });
    await poller.pollUntilDone();
  } catch (err) {
    logger.warn({ err, to: params.to }, 'ACS email send failed — booking unaffected');
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
