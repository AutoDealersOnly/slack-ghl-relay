import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getRelayReadiness } from "./relay/config";
import { getRelayStatusData } from "./relay/db";
import {
  generateQrPassPackage,
  listQrPassDealerships,
  qrPassAccessInput,
  qrPassPackageInput,
} from "./relay/qr-pass-builder";
import {
  createPinLookupContact,
  getPinLookupBootstrap,
  loadPinLookupContact,
  pinLookupBootstrapInput,
  pinLookupCreateInput,
  pinLookupLoadInput,
  pinLookupPinSearchInput,
  pinLookupSaveInput,
  pinLookupTextSearchInput,
  savePinLookupContact,
  searchPinCode,
  searchPinLookupByName,
  searchPinLookupByPhone,
} from "./relay/pin-code-lookup";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  relay: router({
    status: protectedProcedure.query(async () => {
      const [readiness, status] = await Promise.all([Promise.resolve(getRelayReadiness()), getRelayStatusData()]);
      return {
        readiness,
        ...status,
      };
    }),
  }),

  qrPass: router({
    dealerships: publicProcedure.input(qrPassAccessInput).query(({ input }) => listQrPassDealerships(input.access)),
    generate: publicProcedure.input(qrPassPackageInput).query(({ input }) =>
      generateQrPassPackage(input.access, input.dealershipId)
    ),
  }),

  pinLookup: router({
    bootstrap: publicProcedure.input(pinLookupBootstrapInput).query(({ input }) =>
      getPinLookupBootstrap(input.access, input.locationId)
    ),
    searchPin: publicProcedure.input(pinLookupPinSearchInput).mutation(({ input }) =>
      searchPinCode(input.access, input.locationId, input.pin)
    ),
    searchPhone: publicProcedure.input(pinLookupTextSearchInput).mutation(({ input }) =>
      searchPinLookupByPhone(input.access, input.locationId, input.query)
    ),
    searchName: publicProcedure.input(pinLookupTextSearchInput).mutation(({ input }) =>
      searchPinLookupByName(input.access, input.locationId, input.query)
    ),
    loadContact: publicProcedure.input(pinLookupLoadInput).mutation(({ input }) =>
      loadPinLookupContact(input.access, input.locationId, input.contactId)
    ),
    saveContact: publicProcedure.input(pinLookupSaveInput).mutation(({ input }) =>
      savePinLookupContact(input.access, input.locationId, input.contactId, input.form)
    ),
    createContact: publicProcedure.input(pinLookupCreateInput).mutation(({ input }) =>
      createPinLookupContact(input.access, input.locationId, input.pin, input.form)
    ),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
