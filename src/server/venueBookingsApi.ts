import type express from 'express';
import crypto from 'node:crypto';
import { VenueBookingError, VenueBookingRepository } from './venueBookingRepository';
import {
  sendBookingNotificationEmails,
  type BookingNotificationContext,
  type BookingNotificationEmailDetails,
} from './bookingNotificationEmails';

export interface VenueBookingsApiDependencies {
  repository?: VenueBookingRepository | null;
  verifySession: (request: express.Request) => any | null;
  env?: NodeJS.ProcessEnv;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actorOf = (req: express.Request, verify: VenueBookingsApiDependencies['verifySession']) => {
  const actor = verify(req);
  return actor?.supabaseUserId && UUID.test(String(actor.supabaseUserId)) ? actor : null;
};

function sendError(res: express.Response, error: unknown) {
  if (error instanceof VenueBookingError) return res.status(error.status).json({ ok: false, error: error.code });
  const message = String((error as any)?.message || '');
  const sqlCode = String((error as any)?.code || '');
  const named: Array<[string, number]> = [
    ['VENUE_BOOKING_DISABLED',409], ['VENUE_OUTSIDE_BOOKING_WINDOW',400], ['VENUE_CAPACITY_EXCEEDED',400],
    ['VENUE_SLOT_NOT_OFFERED',400], ['VENUE_SLOT_BLOCKED',409], ['VENUE_INVENTORY_NOT_CONFIGURED',409],
    ['VENUE_NOT_AVAILABLE',404], ['VENUE_LISTING_NOT_OWNED',403], ['LISTING_NOT_OWNED',403],
    ['VENUE_BOOKING_FORBIDDEN',403], ['ACTIVE_CUSTOMER_REQUIRED',403], ['INVALID_VENUE_BOOKING_ACTION',409],
    ['IDEMPOTENCY_CONFLICT',409], ['VENUE_BLOCK_OVERLAPS_BOOKING',409], ['VENUE_BOOKING_HOLD_EXPIRED',409],
    ['VENUE_BOOKING_NOT_FOUND',404], ['INVALID_VENUE_QUOTE',400], ['INVALID_VENUE_SLOT_DURATION',400],
    ['VENUE_BOOKING_NOT_DISPUTABLE',409], ['VENUE_DISPUTE_ALREADY_OPEN',409], ['VENUE_DISPUTE_NOT_FOUND',404],
    ['VENUE_DISPUTE_ALREADY_RESOLVED',409], ['VENUE_DISPUTE_FORBIDDEN',403], ['INVALID_DISPUTE_REASON',400],
    ['INVALID_DISPUTE_RESOLUTION',400], ['VENUE_PAYMENT_PROVIDER_MISMATCH',409], ['ADMIN_REQUIRED',403],
    ['INVALID_VENUE_CATEGORY',400], ['INVALID_VENUE_TIME_ZONE',400],
  ];
  const match = named.find(([name]) => message.includes(name));
  if (match) return res.status(match[1]).json({ ok: false, error: match[0] });
  if (sqlCode === '23P01') return res.status(409).json({ ok: false, error: 'VENUE_SLOT_UNAVAILABLE' });
  if (sqlCode === '23505') {
    if (String((error as any)?.constraint || '') === 'uniq_venue_booking_open_dispute') return res.status(409).json({ ok: false, error: 'VENUE_DISPUTE_ALREADY_OPEN' });
    return res.status(409).json({ ok: false, error: 'IDEMPOTENCY_CONFLICT' });
  }
  console.error('[venue-bookings] database operation failed', sqlCode || 'NO_CODE');
  return res.status(500).json({ ok: false, error: 'VENUE_BOOKING_OPERATION_FAILED' });
}

async function dispatchVenueNotifications(
  context: BookingNotificationContext,
  kinds: Array<'new_booking_confirmed' | 'new_booking_received' | 'booking_approved' | 'booking_status_changed' | 'booking_cancelled'>,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const details: BookingNotificationEmailDetails[] = [];
  for (const kind of kinds) {
    if (kind === 'new_booking_received' && context.providerEmail) {
      details.push({ kind, recipient: context.providerEmail, recipientName: context.providerName || undefined, bookingId: context.bookingId, listingTitle: context.listingTitle, status: context.status || undefined, scheduledDate: context.scheduledDate || undefined, timeSlot: context.timeSlot || undefined });
    }
    if (kind !== 'new_booking_received' && context.customerEmail) {
      details.push({ kind, recipient: context.customerEmail, recipientName: context.customerName || undefined, bookingId: context.bookingId, listingTitle: context.listingTitle, status: context.status || undefined, scheduledDate: context.scheduledDate || undefined, timeSlot: context.timeSlot || undefined, reason: context.reason });
    }
    if (kind === 'booking_cancelled' && context.providerEmail) {
      details.push({ kind, recipient: context.providerEmail, recipientName: context.providerName || undefined, bookingId: context.bookingId, listingTitle: context.listingTitle, status: context.status || undefined, scheduledDate: context.scheduledDate || undefined, timeSlot: context.timeSlot || undefined, reason: context.reason });
    }
  }
  if (!details.length) return;
  try {
    await sendBookingNotificationEmails(details, { env });
  } catch (error) {
    console.error('[venue-bookings] notification dispatch failed', error);
  }
}

export function registerVenueBookingsApi(app: express.Express, deps: VenueBookingsApiDependencies) {
  const repo = deps.repository;
  const env = deps.env || process.env;
  // The signed HMAC webhook is a local test fixture, not a live PSP adapter.
  // It is only selectable in a disposable test process, never in development
  // or production, and it never confirms a payment without a valid signature.
  const sandboxOnline = env.NODE_ENV === 'test'
    && env.BOS_VENUE_PAYMENT_SANDBOX === '1'
    && String(env.BOS_VENUE_PAYMENT_SANDBOX_SECRET || '').length >= 16;
  const unavailable = (_req: express.Request, res: express.Response) => res.status(503).json({ ok: false, error: 'VENUE_BOOKINGS_POSTGRES_UNAVAILABLE' });

  app.get('/api/venues/categories', async (req,res)=>{
    if(!repo)return unavailable(req,res);
    try{res.json({ok:true,categories:await repo.listCategories(false,actorOf(req,deps.verifySession)),source:'postgres'});}catch(error){sendError(res,error);}
  });
  app.get('/api/admin/venues/categories', async (req,res)=>{
    if(!repo)return unavailable(req,res);const actor=actorOf(req,deps.verifySession);
    if(!actor)return res.status(401).json({ok:false,error:'VERIFIED_GOOGLE_IDENTITY_REQUIRED'});
    if(actor.role!=='admin')return res.status(403).json({ok:false,error:'ADMIN_REQUIRED'});
    try{res.json({ok:true,categories:await repo.listCategories(true,actor),source:'postgres'});}catch(error){sendError(res,error);}
  });
  app.put('/api/admin/venues/categories/:id', async (req,res)=>{
    if(!repo)return unavailable(req,res);const actor=actorOf(req,deps.verifySession);
    if(!actor)return res.status(401).json({ok:false,error:'VERIFIED_GOOGLE_IDENTITY_REQUIRED'});
    if(actor.role!=='admin')return res.status(403).json({ok:false,error:'ADMIN_REQUIRED'});
    try{res.json({ok:true,category:await repo.saveCategory(actor,String(req.params.id),req.body||{}),source:'postgres'});}catch(error){sendError(res,error);}
  });

  app.get('/api/venues/:listingId/booking-settings', async (req, res) => {
    if (!repo) return unavailable(req,res);
    try { res.json({ ok:true, settings:await repo.settings(String(req.params.listingId),actorOf(req,deps.verifySession)), source:'postgres' }); }
    catch (error) { sendError(res,error); }
  });
  app.get('/api/venues/:listingId/calendar', async (req,res) => {
    if (!repo) return unavailable(req,res);
    const from=String(req.query.from||''); const to=String(req.query.to||'');
    if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(to)<=Date.parse(from) || Date.parse(to)-Date.parse(from)>120*24*60*60*1000) return res.status(400).json({ok:false,error:'INVALID_CALENDAR_RANGE'});
    try { res.json({ok:true,busy:await repo.calendar(String(req.params.listingId),from,to,actorOf(req,deps.verifySession)),source:'postgres'}); }
    catch(error) { sendError(res,error); }
  });
  app.post('/api/venues/:listingId/quote', async (req,res) => {
    if (!repo) return unavailable(req,res);
    const b=req.body||{};
    try { res.json({ok:true,quote:await repo.quote(String(req.params.listingId),String(b.startsAt||''),String(b.endsAt||''),String(b.slotType||''),Number(b.guests),Array.isArray(b.addons)?b.addons.map(String):[],actorOf(req,deps.verifySession)),source:'postgres'}); }
    catch(error) { sendError(res,error); }
  });
  app.put('/api/provider/venues/:listingId/booking-settings', async (req,res) => {
    if (!repo) return unavailable(req,res);
    const actor=actorOf(req,deps.verifySession); if(!actor) return res.status(401).json({ok:false,error:'VERIFIED_GOOGLE_IDENTITY_REQUIRED'});
    try { res.json({ok:true,settings:await repo.saveSettings(actor,String(req.params.listingId),req.body||{}),source:'postgres'}); }
    catch(error) { sendError(res,error); }
  });
  app.get('/api/provider/venues/:listingId/blocks', async(req,res)=>{
    if(!repo)return unavailable(req,res); const actor=actorOf(req,deps.verifySession); if(!actor)return res.status(401).json({ok:false,error:'VERIFIED_GOOGLE_IDENTITY_REQUIRED'});
    try{res.json({ok:true,blocks:await repo.listBlocks(actor,String(req.params.listingId)),source:'postgres'});}catch(error){sendError(res,error);}
  });
  app.post('/api/provider/venues/:listingId/blocks', async(req,res)=>{
    if(!repo)return unavailable(req,res); const actor=actorOf(req,deps.verifySession); if(!actor)return res.status(401).json({ok:false,error:'VERIFIED_GOOGLE_IDENTITY_REQUIRED'});
    try{res.status(201).json({ok:true,block:await repo.addBlock(actor,String(req.params.listingId),String(req.body?.startsAt||''),String(req.body?.endsAt||''),String(req.body?.reason||'')),source:'postgres'});}catch(error){sendError(res,error);}
  });
  app.delete('/api/provider/venues/:listingId/blocks/:blockId', async(req,res)=>{
    if(!repo)return unavailable(req,res); const actor=actorOf(req,deps.verifySession); if(!actor)return res.status(401).json({ok:false,error:'VERIFIED_GOOGLE_IDENTITY_REQUIRED'});
    try{const deleted=await repo.deleteBlock(actor,String(req.params.listingId),String(req.params.blockId));res.status(deleted?200:404).json({ok:deleted,source:'postgres'});}catch(error){sendError(res,error);}
  });
  app.put('/api/provider/venues/:listingId/seasonal-rate', async(req,res)=>{
    if(!repo)return unavailable(req,res); const actor=actorOf(req,deps.verifySession); if(!actor)return res.status(401).json({ok:false,error:'VERIFIED_GOOGLE_IDENTITY_REQUIRED'});
    try{res.json({ok:true,rate:await repo.addSeasonalRate(actor,String(req.params.listingId),req.body||{}),source:'postgres'});}catch(error){sendError(res,error);}
  });
  app.post('/api/venue-bookings', async(req,res)=>{
    if(!repo)return unavailable(req,res); const actor=actorOf(req,deps.verifySession);
    if(!actor)return res.status(401).json({ok:false,error:'VERIFIED_GOOGLE_IDENTITY_REQUIRED'});
    if(!['google','email_otp'].includes(String(actor.authProvider))||actor.role!=='customer')return res.status(403).json({ok:false,error:'CUSTOMER_VERIFIED_IDENTITY_REQUIRED'});
    const paymentMode=String(req.body?.paymentMode||'pay_at_venue');
    // The custom HMAC hook below is a test fixture, not a Razorpay or UPI
    // adapter. Keep it unreachable from development and production clients.
    const onlineAllowed=['razorpay','upi'].includes(paymentMode) && sandboxOnline;
    if(paymentMode!=='pay_at_venue'&&!onlineAllowed)return res.status(503).json({ok:false,error:'VERIFIED_ONLINE_PAYMENT_UNAVAILABLE'});
    try{
      const b=await repo.createBooking(actor,req.body||{});
      const bookingId = String(b.id || '');
      if (bookingId && b.idempotent !== true) {
        const kinds = String(b.status || '') === 'confirmed'
          ? ['new_booking_confirmed', 'new_booking_received'] as const
          : ['new_booking_received'] as const;
        void repo.notificationContext(actor, bookingId)
          .then((context) => dispatchVenueNotifications(context, [...kinds], env))
          .catch((error) => console.error('[venue-bookings] notification context failed', error));
      }
      res.status(b.idempotent?200:201).json({ok:true,booking:b,source:'postgres'});
    }catch(error){sendError(res,error);}
  });
  app.get('/api/venue-bookings', async(req,res)=>{
    if(!repo)return unavailable(req,res); const actor=actorOf(req,deps.verifySession); if(!actor)return res.status(401).json({ok:false,error:'VERIFIED_GOOGLE_IDENTITY_REQUIRED'});
    const scope=String(req.query.scope||'mine') as 'mine'|'owner'|'admin';
    if(!['mine','owner','admin'].includes(scope))return res.status(400).json({ok:false,error:'INVALID_BOOKING_SCOPE'});
    try{res.json({ok:true,bookings:await repo.listBookings(actor,scope),source:'postgres'});}catch(error){sendError(res,error);}
  });
  app.post('/api/venue-bookings/:id/actions', async(req,res)=>{
    if(!repo)return unavailable(req,res); const actor=actorOf(req,deps.verifySession); if(!actor)return res.status(401).json({ok:false,error:'VERIFIED_GOOGLE_IDENTITY_REQUIRED'});
    const action=String(req.body?.action||''); const reason=String(req.body?.reason||'');
    if(!['accept','reject','cancel','complete','admin_override'].includes(action))return res.status(400).json({ok:false,error:'INVALID_VENUE_BOOKING_ACTION'});
    if(action==='admin_override' && (actor.role!=='admin'||reason.trim().length<5))return res.status(403).json({ok:false,error:'AUDITED_ADMIN_REASON_REQUIRED'});
    try{
      const booking = await repo.action(actor,String(req.params.id),action,reason);
      const bookingId = String(booking.id || req.params.id || '');
      const kind = action === 'accept' || action === 'admin_override' && String(booking.status || '') === 'confirmed'
        ? 'booking_approved'
        : action === 'reject' || action === 'cancel' || action === 'admin_override'
          ? 'booking_cancelled'
          : 'booking_status_changed';
      void repo.notificationContext(actor, bookingId)
        .then((context) => dispatchVenueNotifications(context, [kind], env))
        .catch((error) => console.error('[venue-bookings] notification context failed', error));
      res.json({ok:true,booking,source:'postgres'});
    }catch(error){sendError(res,error);}
  });
  app.patch('/api/provider/venue-bookings/:id/reschedule', async(req,res)=>{
    if(!repo)return unavailable(req,res); const actor=actorOf(req,deps.verifySession); if(!actor)return res.status(401).json({ok:false,error:'VERIFIED_GOOGLE_IDENTITY_REQUIRED'});
    try{
      const booking = await repo.reschedule(actor,String(req.params.id),String(req.body?.startsAt||''),String(req.body?.endsAt||''),String(req.body?.slotType||''));
      void repo.notificationContext(actor, String(req.params.id))
        .then((context) => dispatchVenueNotifications(context, ['booking_status_changed'], env))
        .catch((error) => console.error('[venue-bookings] notification context failed', error));
      res.json({ok:true,booking,source:'postgres'});
    }catch(error){sendError(res,error);}
  });

  app.post('/api/venue-bookings/:id/disputes', async(req,res)=>{
    if(!repo)return unavailable(req,res); const actor=actorOf(req,deps.verifySession); if(!actor)return res.status(401).json({ok:false,error:'VERIFIED_GOOGLE_IDENTITY_REQUIRED'});
    try{res.status(201).json({ok:true,dispute:await repo.openDispute(actor,String(req.params.id),String(req.body?.reason||'')),source:'postgres'});}catch(error){sendError(res,error);}
  });
  app.post('/api/admin/venue-disputes/:id/resolve', async(req,res)=>{
    if(!repo)return unavailable(req,res); const actor=actorOf(req,deps.verifySession); if(!actor)return res.status(401).json({ok:false,error:'VERIFIED_GOOGLE_IDENTITY_REQUIRED'});
    if(actor.role!=='admin')return res.status(403).json({ok:false,error:'ADMIN_REQUIRED'});
    try{res.json({ok:true,dispute:await repo.resolveDispute(actor,String(req.params.id),String(req.body?.resolution||'')),source:'postgres'});}catch(error){sendError(res,error);}
  });

  app.get('/api/venues/payment-capabilities', (_req,res)=>{
    // A test-only HMAC fixture does not create PSP orders or invoke provider
    // reconciliation, so it must not be advertised as a customer payment method.
    // Online checkout remains closed until a full trusted provider adapter exists.
    res.json({ok:true,payAtVenue:true,sandboxOnline,razorpaySandbox:sandboxOnline,upiSandbox:sandboxOnline,
      razorpayConfigured:false,upiConfigured:false,verifiedProviders:[],
      source:'server_configuration'});
  });
  app.post('/api/venue-bookings/:id/payment-intent', async(req,res)=>{
    if(!repo)return unavailable(req,res); const actor=actorOf(req,deps.verifySession); if(!actor)return res.status(401).json({ok:false,error:'VERIFIED_GOOGLE_IDENTITY_REQUIRED'});
    if(actor.role!=='customer'||!['google','email_otp'].includes(String(actor.authProvider)))return res.status(403).json({ok:false,error:'CUSTOMER_VERIFIED_IDENTITY_REQUIRED'});
    const provider=String(req.body?.provider||'');
    if(!sandboxOnline||!['sandbox','razorpay','upi_webhook'].includes(provider))return res.status(503).json({ok:false,error:'VERIFIED_ONLINE_PAYMENT_UNAVAILABLE'});
    try{const intent=await repo.insertPaymentIntent(actor,String(req.params.id),provider,null);res.status(201).json({ok:true,intent:{id:intent.id,amountPaise:Number(intent.amount_paise),provider,expiresAt:intent.expires_at},source:'postgres'});}catch(error){sendError(res,error);}
  });
  app.post('/api/venue-payments/sandbox/webhook', async(req,res)=>{
    if(!repo)return unavailable(req,res);
    const secret=String(env.BOS_VENUE_PAYMENT_SANDBOX_SECRET||''); const raw=(req as any).rawBody as Buffer|undefined;
    if(env.NODE_ENV!=='test'||env.BOS_VENUE_PAYMENT_SANDBOX!=='1'||secret.length<16||!raw)return res.status(404).json({ok:false,error:'NOT_FOUND'});
    const supplied=String(req.headers['x-bos-sandbox-signature']||''); const expected=crypto.createHmac('sha256',secret).update(raw).digest('hex');
    const a=Buffer.from(supplied);const b=Buffer.from(expected);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).json({ok:false,error:'INVALID_PAYMENT_SIGNATURE'});
    const e=req.body||{};
    try{const result=await repo.settlePayment({eventId:String(e.eventId||''),intentId:String(e.intentId||''),bookingId:String(e.bookingId||''),eventType:String(e.eventType||''),providerReference:String(e.providerReference||''),amountPaise:Number(e.amountPaise),payloadHash:crypto.createHash('sha256').update(raw).digest('hex')});res.json({ok:true,...result,source:'verified_sandbox_webhook'});}catch(error){sendError(res,error);}
  });
}
