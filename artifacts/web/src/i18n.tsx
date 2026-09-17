/**
 * FactoryDepo i18n â€” the single source of truth for interface languages.
 *
 * Design notes
 * ------------
 * â€¢ `en` is the source of truth. Its object is frozen into the `DictKey` union,
 *   so every `t('â€¦')` call is checked at compile time: a typo in a key is a
 *   build error, not a blank label at runtime.
 * â€¢ Every other language is a `Partial<Record<DictKey, string>>` whose keys are
 *   the English keys, so a typo in a translation key is also a build error.
 * â€¢ `t()` never throws and never returns `undefined`: current language â†’ English
 *   â†’ the key itself. A missing translation therefore shows readable text rather
 *   than blanking the UI.
 * â€¢ Interpolation is `{name}` style. Numbers interpolated as `{n}` come from the
 *   API untouched â€” translation never rewrites a figure (see `format`).
 * â€¢ The chosen language is persisted in `localStorage['fd:lang']`, applied to
 *   `<html lang dir>` on every change, and the provider is a plain React context
 *   so both signed-out and signed-in tree positions can read it.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/* ============================== languages =============================== */

export type LangCode = 'en' | 'tr' | 'ar' | 'ru' | 'zh' | 'es';
export type LangDir = 'ltr' | 'rtl';

export interface LanguageDef {
  /** BCP-47 primary subtag, also used as the account `lang` value. */
  code: LangCode;
  /** English name of the language. */
  label: string;
  /** The language's own name â€” what the switcher shows. */
  native: string;
  dir: LangDir;
  /**
   * Locale tag for `toLocaleDateString` / `toLocaleString`. Only date and
   * integer grouping are localised; currency symbols and numeric values are
   * never altered by translation.
   */
  locale: string;
}

export const LANGUAGES: readonly LanguageDef[] = [
  { code: 'en', label: 'English', native: 'English', dir: 'ltr', locale: 'en-GB' },
  { code: 'tr', label: 'Turkish', native: 'TÃ¼rkÃ§e', dir: 'ltr', locale: 'tr-TR' },
  { code: 'ar', label: 'Arabic', native: 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©', dir: 'rtl', locale: 'ar' },
  { code: 'ru', label: 'Russian', native: 'Ğ ÑƒÑÑĞºĞ¸Ğ¹', dir: 'ltr', locale: 'ru-RU' },
  { code: 'zh', label: 'Chinese', native: 'ä¸­æ–‡', dir: 'ltr', locale: 'zh-CN' },
  { code: 'es', label: 'Spanish', native: 'EspaÃ±ol', dir: 'ltr', locale: 'es-ES' },
];

export const LANG_CODES: readonly LangCode[] = LANGUAGES.map((l) => l.code);

const LANG_BY_CODE: Record<LangCode, LanguageDef> = LANGUAGES.reduce(
  (acc, l) => { acc[l.code] = l; return acc; },
  {} as Record<LangCode, LanguageDef>,
);

export function isLangCode(value: unknown): value is LangCode {
  return typeof value === 'string' && (LANG_CODES as readonly string[]).includes(value);
}

export function dirFor(lang: LangCode): LangDir {
  return LANG_BY_CODE[lang].dir;
}

export function localeFor(lang: LangCode): string {
  return LANG_BY_CODE[lang].locale;
}

/** Languages that flip the document direction. Kept for callers that need it. */
export const RTL_LANGS: readonly LangCode[] = LANGUAGES.filter((l) => l.dir === 'rtl').map((l) => l.code);

/* ============================== persistence ============================= */

export const LANG_STORAGE_KEY = 'fd:lang';

function readStoredLang(): LangCode | null {
  try {
    const raw = window.localStorage.getItem(LANG_STORAGE_KEY);
    return isLangCode(raw) ? raw : null;
  } catch {
    // Private-mode / disabled storage must not break the app.
    return null;
  }
}

/** `tr-TR` â†’ `tr`; anything unsupported is ignored. */
function fromNavigator(): LangCode | null {
  try {
    for (const tag of navigator.languages ?? [navigator.language]) {
      const primary = String(tag).toLowerCase().split('-')[0];
      if (isLangCode(primary)) return primary;
    }
  } catch {
    /* no navigator (SSR/tests) */
  }
  return null;
}

/** Stored choice â†’ browser preference â†’ English. */
export function detectInitialLang(): LangCode {
  return readStoredLang() ?? fromNavigator() ?? 'en';
}

/* ============================== dictionaries ============================ */

export interface Dict {
  /* ---- shared: statuses, actions, generic phrases ---- */
  'status.open': string;
  'status.quoted': string;
  'status.closed': string;
  'status.submitted': string;
  'status.accepted': string;
  'status.rejected': string;
  'status.active': string;
  'status.sold_out': string;
  'status.scheduled': string;
  'status.in_progress': string;
  'status.passed': string;
  'status.failed': string;
  'status.pending': string;
  'status.paid': string;
  'status.shipped': string;
  'status.delivered': string;
  'status.cancelled': string;
  'status.missing': string;
  'status.approved': string;
  'status.countered': string;
  'status.withdrawn': string;
  'status.inspecting': string;

  'action.close': string;
  'action.cancel': string;
  'action.dismiss': string;
  'action.refresh': string;
  'action.refreshing': string;
  'action.tryAgain': string;
  'action.clear': string;
  'action.clearFilters': string;
  'action.search': string;
  'action.save': string;
  'action.discard': string;
  'action.signIn': string;
  'action.signOut': string;
  'action.signingIn': string;
  'action.joinFree': string;
  'action.createAccount': string;
  'action.creatingAccount': string;
  'action.backToExplore': string;
  'action.open': string;
  'action.edit': string;
  'action.delete': string;

  'common.loading': string;
  'common.loadingEllipsis': string;
  'common.notSet': string;
  'common.optional': string;
  'common.required': string;
  'common.newestFirst': string;
  'common.anyCountry': string;
  'common.allCountries': string;
  'common.verified': string;
  'common.tradeAbbrev': string;

  /* ---- chrome ---- */
  'nav.feed': string;
  'nav.explore': string;
  'nav.exploreStock': string;
  'nav.offersBuyer': string;
  'nav.rfqs': string;
  'nav.orders': string;
  'nav.shipments': string;
  'nav.messages': string;
  'nav.saved': string;
  'nav.savedLots': string;
  'nav.notifications': string;
  'nav.help': string;
  'nav.helpCentre': string;
  'nav.howItWorks': string;
  'nav.profile': string;
  'nav.listings': string;
  'nav.post': string;
  'nav.postStock': string;
  'nav.offersSup': string;
  'nav.rfqOpps': string;
  'nav.verification': string;
  'nav.suppliers': string;
  'nav.overview': string;
  'nav.adminSuppliers': string;
  'nav.adminVerify': string;
  'nav.adminListings': string;
  'nav.adminRfqs': string;
  'nav.adminPayments': string;
  'nav.sources': string;
  'nav.growth': string;
  'nav.features': string;

  'topbar.searchPlaceholder': string;
  'topbar.searchAria': string;
  'topbar.notifications': string;
  'topbar.createAccountTitle': string;
  'topbar.account': string;
  'topbar.languageAria': string;
  'rail.allIndustries': string;
  'rail.howItWorks': string;
  'sidebar.moreIndustries': string;
  'sidebar.moreIndustriesSub': string;

  'gate.title': string;
  'gate.body': string;
  'gate.createAccount': string;
  'gate.haveAccount': string;

  'cards.noPhoto': string;
  'cards.moq': string;
  'cards.saveLot': string;
  'cards.demo': string;
  'cards.demoTitle': string;
  'cards.inspections': string;

  /* ---- auth ---- */
  'auth.signIn.sub': string;
  'auth.email': string;
  'auth.password': string;
  'auth.signInCta': string;
  'auth.newHere': string;
  'auth.demoNotice': string;
  'auth.seededLogin': string;
  'auth.fillIn': string;
  'auth.demoHintLead': string;
  'auth.demoHintLead2': string;
  'auth.demoHintTail': string;
  'auth.demoHintProduct': string;
  'auth.signInFailed': string;
  'auth.signUp.title': string;
  'auth.signUp.sub': string;
  'auth.fullName': string;
  'auth.workEmail': string;
  'auth.minChars': string;
  'auth.atLeast8': string;
  'auth.iAmA': string;
  'auth.company': string;
  'auth.country': string;
  'auth.countryHint': string;
  'auth.createCta': string;
  'auth.alreadyRegistered': string;
  'auth.signUpHint': string;
  'auth.registerFailed': string;
  'auth.role.buyer': string;
  'auth.role.buyerHint': string;
  'auth.role.supplier': string;
  'auth.role.supplierHint': string;
  'auth.role.inspector': string;
  'auth.role.inspectorHint': string;
  'auth.role.lab': string;
  'auth.role.labHint': string;
  'auth.role.logistics': string;
  'auth.role.logisticsHint': string;

  /* ---- profile ---- */
  'profile.title': string;
  'profile.sub': string;
  'profile.signInSub': string;
  'profile.notSignedIn': string;
  'profile.notSignedInBody': string;
  'profile.createAccount': string;
  'profile.accountDetails': string;
  'profile.unsaved': string;
  'profile.fullName': string;
  'profile.company': string;
  'profile.notSet': string;
  'profile.country': string;
  'profile.language': string;
  'profile.languageHint': string;
  'profile.save': string;
  'profile.saving': string;
  'profile.saved': string;
  'profile.savedBody': string;
  'profile.identity': string;
  'profile.identityNote': string;
  'profile.email': string;
  'profile.role': string;
  'profile.readOnly': string;
  'profile.readOnlyEmail': string;
  'profile.readOnlyRole': string;
  'profile.emailStatus': string;
  'profile.emailVerified': string;
  'profile.emailNotVerified': string;
  'profile.memberSince': string;
  'profile.accountLine': string;
  'profile.errName': string;
  'profile.errSave': string;

  /* ---- explore / feed ---- */
  'explore.title': string;
  'explore.subLoading': string;
  'explore.subCount': string;
  'explore.searchPlaceholder': string;
  'explore.searchAria': string;
  'explore.categoryAria': string;
  'explore.allCategories': string;
  'explore.originAria': string;
  'explore.allCountries': string;
  'explore.min': string;
  'explore.max': string;
  'explore.emptyTitle': string;
  'explore.emptyBody': string;
  'explore.page': string;
  'explore.prev': string;
  'explore.next': string;

  'feed.welcomeBack': string;
  'feed.title': string;
  'feed.sub': string;
  'feed.sellStock': string;
  'feed.postRequest': string;
  'feed.lotsCount': string;
  'feed.lotsMatch': string;
  'feed.verifiedSuppliers': string;
  'feed.openRequests': string;
  'feed.allOrigins': string;
  'feed.searchAria': string;
  'feed.minAria': string;
  'feed.maxAria': string;
  'feed.allIndustries': string;
  'feed.noLots': string;
  'feed.shownRange': string;
  'feed.emptyTitle': string;
  'feed.emptyBody': string;
  'feed.lookingFor': string;
  'feed.postRequestLink': string;
  'feed.lookingForTail': string;
  'feed.sellingInstead': string;
  'feed.listYourStock': string;
  'feed.signedInAs': string;
  'feed.createFree': string;

  /* ---- help ---- */
  'help.title': string;
  'help.sub': string;
  'help.buying': string;
  'help.buying1.title': string;
  'help.buying1': string;
  'help.buying2.title': string;
  'help.buying2': string;
  'help.buying3.title': string;
  'help.buying3': string;
  'help.buying4.title': string;
  'help.buying4': string;
  'help.selling': string;
  'help.selling1.title': string;
  'help.selling1': string;
  'help.selling2.title': string;
  'help.selling2': string;
  'help.selling3.title': string;
  'help.selling3': string;
  'help.selling4.title': string;
  'help.selling4': string;
  'help.notLive': string;
  'help.notLiveLead': string;
  'help.notLive1': string;
  'help.notLive2': string;
  'help.notLive3': string;
  'help.notLive4': string;
  'help.exploreCta': string;
  'help.rfqCta': string;

  /* ---- coming soon ---- */
  'soon.sub': string;
  'soon.title': string;
  'soon.body': string;
  'soon.note.offers': string;
  'soon.note.shipments': string;
  'soon.note.messages': string;
  'soon.note.saved': string;
  'soon.note.notifications': string;
  'soon.note.profile': string;
  'soon.note.listings': string;
  'soon.note.post': string;
  'soon.note.generic': string;
  'soon.note.verification': string;
  'soon.note.admin': string;
  'soon.note.sources': string;
  'soon.note.features': string;

  /* ---- orders ---- */
  'orders.title': string;
  'orders.signInSub': string;
  'orders.notSignedIn': string;
  'orders.notSignedInBody': string;
  'orders.createAccount': string;
  'orders.subSupplier': string;
  'orders.subBuyer': string;
  'orders.statListings': string;
  'orders.statOffersReceived': string;
  'orders.statOffersOnRfqs': string;
  'orders.statOrders': string;
  'orders.statSoldItems': string;
  'orders.statSoldTitle': string;
  'orders.statViews': string;
  'orders.statViewsTitle': string;
  'orders.metricsError': string;
  'orders.loadErrorTitle': string;
  'orders.loadErrorBody': string;
  'orders.emptyTitle': string;
  'orders.emptySupplier': string;
  'orders.emptyBuyer': string;
  'orders.browseStock': string;
  'orders.postRfq': string;
  'orders.count': string;
  'orders.col.order': string;
  'orders.col.product': string;
  'orders.col.counterparty': string;
  'orders.col.qty': string;
  'orders.col.total': string;
  'orders.col.status': string;
  'orders.col.date': string;
  'orders.buyerLabel': string;
  'orders.supplierLabel': string;
  'orders.buyerId': string;

  /* ---- product detail ---- */
  'product.loadingTitle': string;
  'product.loadingThis': string;
  'product.fetching': string;
  'product.notFound': string;
  'product.backToExplore': string;
  'product.noPhoto': string;
  'product.pricePer': string;
  'product.minOrder': string;
  'product.availableNow': string;
  'product.origin': string;
  'product.unavailable': string;
  'product.buyNowHeading': string;
  'product.soldOutBody': string;
  'product.noUnitsBody': string;
  'product.purchaseTerms': string;
  'product.stockOnHand': string;
  'product.buyNowPrice': string;
  'product.outOfStock': string;
  'product.requestQuote': string;
  'product.shipsFrom': string;
  'product.signInToOrder': string;
  'product.supplier': string;
  'product.viewProfile': string;
  'product.loadingSupplier': string;
  'product.supplierUnavailable': string;
  'product.rating': string;
  'product.inspections': string;
  'product.fulfilment': string;
  'product.verifiedLevel': string;
  'product.levelN': string;
  'product.tradingSince': string;
  'product.supplierFiguresHint': string;
  'product.description': string;
  'product.noDescription': string;
  'product.specification': string;
  'product.noSpec': string;
  'product.col.attribute': string;
  'product.col.value': string;
  'product.spec.category': string;
  'product.spec.unit': string;
  'product.spec.purity': string;

  'checkout.title': string;
  'checkout.placedTitle': string;
  'checkout.confirmed': string;
  'checkout.notified': string;
  'checkout.viewOrders': string;
  'checkout.keepBrowsing': string;
  'checkout.pricePer': string;
  'checkout.minimumOrder': string;
  'checkout.availableNow': string;
  'checkout.quantity': string;
  'checkout.qtyHint': string;
  'checkout.fullName': string;
  'checkout.country': string;
  'checkout.address': string;
  'checkout.city': string;
  'checkout.phone': string;
  'checkout.notes': string;
  'checkout.total': string;
  'checkout.placeOrder': string;
  'checkout.placing': string;
  'checkout.errPlace': string;

  'rfqModal.title': string;
  'rfqModal.postedTitle': string;
  'rfqModal.live': string;
  'rfqModal.canQuote': string;
  'rfqModal.viewMine': string;
  'rfqModal.listedBy': string;
  'rfqModal.quantity': string;
  'rfqModal.unit': string;
  'rfqModal.specs': string;
  'rfqModal.moqHint': string;
  'rfqModal.post': string;
  'rfqModal.posting': string;
  'rfqModal.errPost': string;
  'rfqModal.titleSuffix': string;

  /* ---- suppliers ---- */
  'suppliers.loadingSub': string;
  'suppliers.loadingBody': string;
  'suppliers.title': string;
  'suppliers.sub': string;
  'suppliers.demoNote': string;
  'suppliers.loadErrorTitle': string;
  'suppliers.loadErrorBody': string;
  'suppliers.emptyTitle': string;
  'suppliers.emptyBody': string;
  'suppliers.totalListed': string;
  'suppliers.totalVerified': string;
  'suppliers.avgRating': string;
  'suppliers.avgRatingRated': string;
  'suppliers.avgFulfilment': string;
  'suppliers.avgFulfilmentMeasured': string;
  'suppliers.searchPlaceholder': string;
  'suppliers.searchAria': string;
  'suppliers.verifiedOnly': string;
  'suppliers.showing': string;
  'suppliers.noMatchTitle': string;
  'suppliers.noMatchBody': string;
  'suppliers.rating': string;
  'suppliers.inspections': string;
  'suppliers.fulfilment': string;

  /* ---- supplier detail ---- */
  'supplierDetail.loadingThis': string;
  'supplierDetail.notFound': string;
  'supplierDetail.backToDirectory': string;
  'supplierDetail.backShort': string;
  'supplierDetail.tradingSince': string;
  'supplierDetail.verifiedL3': string;
  'supplierDetail.registered': string;
  'supplierDetail.buyerRating': string;
  'supplierDetail.notRated': string;
  'supplierDetail.inspections': string;
  'supplierDetail.fulfilment': string;
  'supplierDetail.activeListings': string;
  'supplierDetail.tier': string;
  'supplierDetail.trustScore': string;
  'supplierDetail.about': string;
  'supplierDetail.noDescription': string;
  'supplierDetail.capabilities': string;
  'supplierDetail.record': string;
  'supplierDetail.ratingLabel': string;
  'supplierDetail.inspectionsDone': string;
  'supplierDetail.contact': string;
  'supplierDetail.contactBody': string;
  'supplierDetail.contactSupplier': string;
  'supplierDetail.contactHintSignedIn': string;
  'supplierDetail.contactHintGuest': string;
  'supplierDetail.services': string;
  'supplierDetail.service1': string;
  'supplierDetail.service2': string;
  'supplierDetail.service3': string;
  'supplierDetail.service4': string;
  'supplierDetail.stockFrom': string;
  'supplierDetail.shown': string;
  'supplierDetail.loadingLots': string;
  'supplierDetail.noneShown': string;
  'supplierDetail.noneShownBody': string;

  /* ---- RFQ exchange ---- */
  'rfq.titleSupplier': string;
  'rfq.titleBuyer': string;
  'rfq.subSupplier': string;
  'rfq.subBuyer': string;
  'rfq.postRequest': string;
  'rfq.buyerOnlyNotice': string;
  'rfq.total': string;
  'rfq.open': string;
  'rfq.quoted': string;
  'rfq.closed': string;
  'rfq.quoteable': string;
  'rfq.allRequests': string;
  'rfq.shown': string;
  'rfq.statusAll': string;
  'rfq.statusOpenCount': string;
  'rfq.statusQuotedCount': string;
  'rfq.quotingCloses': string;
  'rfq.emptyNone': string;
  'rfq.emptyNoMatch': string;
  'rfq.emptyNoneSupplier': string;
  'rfq.emptyNoneBuyer': string;
  'rfq.emptyNoMatchHint': string;
  'rfq.col.requirement': string;
  'rfq.col.quantity': string;
  'rfq.col.deliverTo': string;
  'rfq.col.quotes': string;
  'rfq.col.posted': string;
  'rfq.col.status': string;
  'rfq.openAria': string;
  'rfq.requestRef': string;
  'rfq.quotesCount': string;
  'rfq.postingBuyerOnly': string;
  'rfq.quoteOpen': string;
  'rfq.newTitle': string;
  'rfq.whatNeed': string;
  'rfq.titlePlaceholder': string;
  'rfq.category': string;
  'rfq.deliverTo': string;
  'rfq.quantity': string;
  'rfq.unit': string;
  'rfq.specification': string;
  'rfq.specPlaceholder': string;
  'rfq.specHint': string;
  'rfq.errTitle': string;
  'rfq.errQuantity': string;
  'rfq.errPost': string;

  /* ---- RFQ detail ---- */
  'rfqDetail.loadingTitle': string;
  'rfqDetail.loadingSub': string;
  'rfqDetail.title': string;
  'rfqDetail.notFound': string;
  'rfqDetail.notFoundBody': string;
  'rfqDetail.backToRequests': string;
  'rfqDetail.allRequests': string;
  'rfqDetail.postedOn': string;
  'rfqDetail.requestRef': string;
  'rfqDetail.accepting': string;
  'rfqDetail.notAccepting': string;
  'rfqDetail.noSpec': string;
  'rfqDetail.quantity': string;
  'rfqDetail.deliverTo': string;
  'rfqDetail.quotations': string;
  'rfqDetail.deadline': string;
  'rfqDetail.requestedBy': string;
  'rfqDetail.received': string;
  'rfqDetail.noneTitle': string;
  'rfqDetail.noneBody': string;
  'rfqDetail.col.supplier': string;
  'rfqDetail.col.price': string;
  'rfqDetail.col.leadTime': string;
  'rfqDetail.col.notes': string;
  'rfqDetail.col.sent': string;
  'rfqDetail.col.status': string;
  'rfqDetail.trustScore': string;
  'rfqDetail.days': string;
  'rfqDetail.submitTitle': string;
  'rfqDetail.supplierAccount': string;
  'rfqDetail.fromSupplier': string;
  'rfqDetail.signInSupplierBody': string;
  'rfqDetail.supplierOnly': string;
  'rfqDetail.signInAsSupplier': string;
  'rfqDetail.closedBody': string;
  'rfqDetail.seeOpen': string;
  'rfqDetail.respondBody': string;
  'rfqDetail.unitPrice': string;
  'rfqDetail.leadTime': string;
  'rfqDetail.termsNotes': string;
  'rfqDetail.termsPlaceholder': string;
  'rfqDetail.compareHint': string;
  'rfqDetail.submitQuote': string;
  'rfqDetail.submitting': string;
  'rfqDetail.errPrice': string;
  'rfqDetail.errLead': string;
  'rfqDetail.errSubmit': string;

  /* ---- supplier listings ---- */
  'listings.title': string;
  'listings.sub': string;
  'listings.signInSub': string;
  'listings.notSignedIn': string;
  'listings.notSignedInBody': string;
  'listings.createSupplierAccount': string;
  'listings.supplierOnly': string;
  'listings.supplierOnlyBody': string;
  'listings.browseStock': string;
  'listings.subLoading': string;
  'listings.subCount': string;
  'listings.postStock': string;
  'listings.lotsPublished': string;
  'listings.bankTransferNote': string;
  'listings.loadErrorTitle': string;
  'listings.loadErrorBody': string;
  'listings.emptyTitle': string;
  'listings.emptyBody': string;
  'listings.postFirst': string;
  'listings.getVerified': string;
  'listings.count': string;
  'listings.col.lot': string;
  'listings.col.category': string;
  'listings.col.unitPrice': string;
  'listings.col.moq': string;
  'listings.col.available': string;
  'listings.col.status': string;
  'listings.col.posted': string;
  'listings.lotRef': string;
  'listings.noPhotoInline': string;
  'listings.demoNoteLead': string;
  'listings.demoNoteTail': string;
  'listings.updated': string;
  'listings.deleted': string;
  'listings.deleteTitle': string;
  'listings.deleteLead': string;
  'listings.deleteBody': string;
  'listings.deleteKeepBody': string;
  'listings.keepListing': string;
  'listings.deleteForever': string;
  'listings.deleting': string;
  'listings.deleteErr': string;
  'listings.editTitle': string;

  /* ---- supplier post ---- */
  'post.title': string;
  'post.titleEdit': string;
  'post.sub': string;
  'post.subEdit': string;
  'post.signInSub': string;
  'post.notSignedIn': string;
  'post.notSignedInBody': string;
  'post.createSupplierAccount': string;
  'post.supplierOnly': string;
  'post.supplierOnlyBody': string;
  'post.myListings': string;
  'post.loadErrorTitle': string;
  'post.loadErrorBody': string;
  'post.details': string;
  'post.newListing': string;
  'post.requiredMark': string;
  'post.lotName': string;
  'post.lotNamePlaceholder': string;
  'post.category': string;
  'post.originCountry': string;
  'post.notStated': string;
  'post.description': string;
  'post.descriptionPlaceholder': string;
  'post.descriptionHint': string;
  'post.unitPrice': string;
  'post.currency': string;
  'post.unit': string;
  'post.moq': string;
  'post.moqHint': string;
  'post.available': string;
  'post.availableHint': string;
  'post.purity': string;
  'post.purityPlaceholder': string;
  'post.optional': string;
  'post.photoUrl': string;
  'post.photoPlaceholder': string;
  'post.photoHintLead': string;
  'post.photoHintTail': string;
  'post.preview': string;
  'post.save': string;
  'post.saving': string;
  'post.errName': string;
  'post.errCategory': string;
  'post.errUnit': string;
  'post.errPrice': string;
  'post.errMoq': string;
  'post.errQty': string;
  'post.errSave': string;
  'post.errCreate': string;
  'post.behaviour': string;
  'post.behaviourBody': string;
  'post.offersLink': string;
  'post.provenance': string;
  'post.platformListing': string;
  'post.photo': string;
  'post.urlOnly': string;
  'post.buyerPaysBy': string;
  'post.bankTransfer': string;
  'post.noMetrics': string;

  /* ---- supplier offers ---- */
  'offers.title': string;
  'offers.sub': string;
  'offers.signInSub': string;
  'offers.notSignedIn': string;
  'offers.notSignedInBody': string;
  'offers.createSupplierAccount': string;
  'offers.supplierOnly': string;
  'offers.supplierOnlyBody': string;
  'offers.browseStock': string;
  'offers.subLoading': string;
  'offers.subCount': string;
  'offers.awaiting': string;
  'offers.decided': string;
  'offers.acceptCreates': string;
  'offers.filterAwaiting': string;
  'offers.filterDecided': string;
  'offers.counterNote': string;
  'offers.loadErrorTitle': string;
  'offers.loadErrorBody': string;
  'offers.emptyTitle': string;
  'offers.emptyBody': string;
  'offers.seeListings': string;
  'offers.postMore': string;
  'offers.noneAwaiting': string;
  'offers.noneDecided': string;
  'offers.noneAwaitingBody': string;
  'offers.noneDecidedBody': string;
  'offers.count': string;
  'offers.col.listing': string;
  'offers.col.buyer': string;
  'offers.col.quantity': string;
  'offers.col.theirPrice': string;
  'offers.col.status': string;
  'offers.col.received': string;
  'offers.decidedLabel': string;
  'offers.counter': string;
  'offers.accept': string;
  'offers.reject': string;
  'offers.offerRef': string;
  'offers.answersOffer': string;
  'offers.demoNoteLead': string;
  'offers.demoNoteTail': string;
  'offers.counterTitle': string;
  'offers.counterBody': string;
  'offers.counterPrice': string;
  'offers.perUnit': string;
  'offers.counterQty': string;
  'offers.counterQtyHint': string;
  'offers.counterNotes': string;
  'offers.counterNotesPlaceholder': string;
  'offers.sendCounter': string;
  'offers.sending': string;
  'offers.counterErrPrice': string;
  'offers.counterErrQty': string;
  'offers.counterErr': string;
  'offers.counterDone': string;
  'offers.acceptTitle': string;
  'offers.listing': string;
  'offers.buyer': string;
  'offers.quantity': string;
  'offers.unitPrice': string;
  'offers.offerValue': string;
  'offers.acceptBodyLead': string;
  'offers.acceptBodyBank': string;
  'offers.acceptBodyTail': string;
  'offers.acceptCta': string;
  'offers.accepting': string;
  'offers.acceptErr': string;
  'offers.acceptDone': string;
  'offers.rejectTitle': string;
  'offers.rejectBody': string;
  'offers.rejectCta': string;
  'offers.rejecting': string;
  'offers.rejectErr': string;
  'offers.rejectDone': string;

  /* ---- buyer offers page (Offers.tsx) ---- */
  'myoffers.titleSupplier': string;
  'myoffers.titleAdmin': string;
  'myoffers.titleBuyer': string;
  'myoffers.subSupplier': string;
  'myoffers.subAdmin': string;
  'myoffers.subBuyer': string;
  'myoffers.signInSub': string;
  'myoffers.notSignedIn': string;
  'myoffers.notSignedInBody': string;
  'myoffers.loadErrorTitle': string;
  'myoffers.loadErrorBody': string;
  'myoffers.trying': string;
  'myoffers.emptyTitle': string;
  'myoffers.emptySupplier': string;
  'myoffers.emptyAdmin': string;
  'myoffers.emptyBuyer': string;
  'myoffers.browseStock': string;
  'myoffers.count': string;
  'myoffers.stillOpen': string;
  'myoffers.col.offer': string;
  'myoffers.col.counterparty': string;
  'myoffers.col.quantity': string;
  'myoffers.col.unitPrice': string;
  'myoffers.col.status': string;
  'myoffers.col.date': string;
  'myoffers.col.action': string;
  'myoffers.counterTo': string;
  'myoffers.offerRef': string;
  'myoffers.answersOffer': string;
  'myoffers.seatSupplier': string;
  'myoffers.seatBuyer': string;
  'myoffers.noAction': string;
  'myoffers.confirmReject': string;
  'myoffers.counter': string;
  'myoffers.accept': string;
  'myoffers.reject': string;
  'myoffers.counterTitle': string;
  'myoffers.counterDoneTitle': string;
  'myoffers.counterDoneBody': string;
  'myoffers.backToOffers': string;
  'myoffers.counterLead': string;
  'myoffers.perUnit': string;
  'myoffers.inCurrency': string;
  'myoffers.originally': string;
  'myoffers.messageLabel': string;
  'myoffers.messagePlaceholder': string;
  'myoffers.sendCounter': string;
  'myoffers.sending': string;
  'myoffers.errInvalid': string;
  'myoffers.errCounter': string;
  'myoffers.acceptTitle': string;
  'myoffers.acceptLead': string;
  'myoffers.acceptStripeLead': string;
  'myoffers.acceptStripeStrong': string;
  'myoffers.acceptStripeTail': string;
  'myoffers.acceptHint': string;
  'myoffers.acceptCta': string;
  'myoffers.accepting': string;
  'myoffers.errAccept': string;
  'myoffers.accepted': string;
  'myoffers.viewOrders': string;
  'myoffers.errReject': string;

  /* ---- shipments ---- */
  'ship.title': string;
  'ship.subSupplier': string;
  'ship.subAdmin': string;
  'ship.subBuyer': string;
  'ship.signInSub': string;
  'ship.notSignedIn': string;
  'ship.notSignedInBody': string;
  'ship.loadErrorTitle': string;
  'ship.loadErrorBody': string;
  'ship.trying': string;
  'ship.emptyTitle': string;
  'ship.emptySupplier': string;
  'ship.emptyBuyer': string;
  'ship.myListings': string;
  'ship.viewOrders': string;
  'ship.count': string;
  'ship.delivered': string;
  'ship.advanceRecorded': string;
  'ship.advanceBySupplier': string;
  'ship.trackingTitle': string;
  'ship.col.shipment': string;
  'ship.col.product': string;
  'ship.col.carrier': string;
  'ship.col.trackingNo': string;
  'ship.col.documents': string;
  'ship.col.updated': string;
  'ship.col.milestone': string;
  'ship.noDocumentTitle': string;
  'ship.advance': string;
  'ship.advancing': string;
  'ship.deliveredLabel': string;
  'ship.advancedBySupplier': string;
  'ship.completeTitle': string;
  'ship.advanceTitle': string;
  'ship.noMilestones': string;
  'ship.reached': string;
  'ship.reachedDelivered': string;
  'ship.reachedNext': string;
  'ship.footLead': string;
  'ship.footLink': string;
  'ship.footTail': string;
  'ship.errAdvance': string;

  /* ---- saved ---- */
  'saved.title': string;
  'saved.signInSub': string;
  'saved.notSignedIn': string;
  'saved.notSignedInBody': string;
  'saved.sub': string;
  'saved.loadErrorTitle': string;
  'saved.loadErrorBody': string;
  'saved.trying': string;
  'saved.emptyTitle': string;
  'saved.emptyBody': string;
  'saved.browse': string;
  'saved.goToFeed': string;
  'saved.count': string;
  'saved.mostRecent': string;
  'saved.savedOn': string;
  'saved.remove': string;
  'saved.removing': string;
  'saved.removeTitle': string;
  'saved.errRemove': string;

  /* ---- notifications ---- */
  'notes.title': string;
  'notes.signInSub': string;
  'notes.notSignedIn': string;
  'notes.notSignedInBody': string;
  'notes.sub': string;
  'notes.markAll': string;
  'notes.marking': string;
  'notes.markAllTitle': string;
  'notes.nothingUnread': string;
  'notes.loadErrorTitle': string;
  'notes.loadErrorBody': string;
  'notes.trying': string;
  'notes.emptyTitle': string;
  'notes.emptyBody': string;
  'notes.browse': string;
  'notes.myOrders': string;
  'notes.count': string;
  'notes.unreadCount': string;
  'notes.allRead': string;
  'notes.unreadLabel': string;
  'notes.footnote': string;
  'notes.errMark': string;
  'notes.justNow': string;
  'notes.minutesAgo': string;
  'notes.hoursAgo': string;
  'notes.daysAgo': string;
  'notes.open': string;

  /* ---- messages ---- */
  'msg.title': string;
  'msg.subSupplier': string;
  'msg.subBuyer': string;
  'msg.signInSub': string;
  'msg.notSignedIn': string;
  'msg.notSignedInBody': string;
  'msg.loadErrorTitle': string;
  'msg.loadErrorBody': string;
  'msg.trying': string;
  'msg.emptyTitle': string;
  'msg.emptySupplier': string;
  'msg.emptyBuyer': string;
  'msg.browse': string;
  'msg.myListings': string;
  'msg.noMessagesYet': string;
  'msg.count': string;
  'msg.pickTitle': string;
  'msg.pickBody': string;
  'msg.threadLoadError': string;
  'msg.threadLoadErrorBody': string;
  'msg.noLot': string;
  'msg.viewLot': string;
  'msg.emptyThreadTitle': string;
  'msg.emptyThreadBody': string;
  'msg.messagePlaceholder': string;
  'msg.messageAria': string;
  'msg.send': string;
  'msg.sending': string;
  'msg.read': string;
  'msg.otherParty': string;
  'msg.errSend': string;
  'msg.justNow': string;
  'msg.minutesAgo': string;
  'msg.hoursAgo': string;
  'msg.daysAgo': string;

  /* ---- supplier verification ---- */
  'verify.title': string;
  'verify.sub': string;
  'verify.signInSub': string;
  'verify.notSignedIn': string;
  'verify.notSignedInBody': string;
  'verify.createSupplierAccount': string;
  'verify.supplierOnly': string;
  'verify.supplierOnlyBody': string;
  'verify.seeSuppliers': string;
  'verify.approved': string;
  'verify.waiting': string;
  'verify.actionNeeded': string;
  'verify.coreApproved': string;
  'verify.confirmed': string;
  'verify.pending': string;
  'verify.yourDocs': string;
  'verify.onFile': string;
  'verify.loadErrorTitle': string;
  'verify.loadErrorBody': string;
  'verify.emptyTitle': string;
  'verify.emptyBody': string;
  'verify.col.document': string;
  'verify.col.status': string;
  'verify.col.note': string;
  'verify.col.reviewed': string;
  'verify.filed': string;
  'verify.reference': string;
  'verify.noReference': string;
  'verify.resubmit': string;
  'verify.tierFootnote': string;
  'verify.fileTitle': string;
  'verify.docType': string;
  'verify.existingHintPre': string;
  'verify.existingHintPost': string;
  'verify.refLabel': string;
  'verify.refPlaceholder': string;
  'verify.refHintLead': string;
  'verify.refHintTail': string;
  'verify.noteLabel': string;
  'verify.notePlaceholder': string;
  'verify.filing': string;
  'verify.resubmitDoc': string;
  'verify.submitDoc': string;
  'verify.queueNoteLead': string;
  'verify.queueNoteStrong': string;
  'verify.queueNoteTail': string;
  'verify.filedNotice': string;
  'verify.errFile': string;
  'verify.statusMeans': string;
  'verify.tierTitle': string;
  'verify.tierAll': string;
  'verify.tierSome': string;
  'verify.tierNone': string;
  'verify.tierAllBody': string;
  'verify.tierSomeBody': string;
  'verify.tierNoneBody': string;
  'verify.tierHint': string;
  'verify.suggested': string;
  'verify.select': string;
  'verify.othersNote': string;
  'verify.help.missing.title': string;
  'verify.help.missing.state': string;
  'verify.help.submitted.title': string;
  'verify.help.submitted.state': string;
  'verify.help.approved.title': string;
  'verify.help.approved.state': string;
  'verify.help.rejected.title': string;
  'verify.help.rejected.state': string;
  'verify.doc.businessLicence': string;
  'verify.doc.taxCertificate': string;
  'verify.doc.factoryAudit': string;
  'verify.doc.productCert': string;
  'verify.doc.exportLicence': string;
}

/**
 * English is the source of truth: every key the app may ask for lives here.
 * Non-English dictionaries are `Partial<Record<DictKey, string>>`, so a typo in
 * a translation key fails the build rather than silently falling back.
 */
const en: Dict = {
  'status.open': 'Open',
  'status.quoted': 'Quoted',
  'status.closed': 'Closed',
  'status.submitted': 'Submitted',
  'status.accepted': 'Accepted',
  'status.rejected': 'Rejected',
  'status.active': 'Active',
  'status.sold_out': 'Sold out',
  'status.scheduled': 'Scheduled',
  'status.in_progress': 'In progress',
  'status.passed': 'Passed',
  'status.failed': 'Failed',
  'status.pending': 'Pending',
  'status.paid': 'Paid',
  'status.shipped': 'Shipped',
  'status.delivered': 'Delivered',
  'status.cancelled': 'Cancelled',
  'status.missing': 'Not filed',
  'status.approved': 'Approved',
  'status.countered': 'Countered',
  'status.withdrawn': 'Withdrawn',
  'status.inspecting': 'Inspection in progress',

  'action.close': 'Close',
  'action.cancel': 'Cancel',
  'action.dismiss': 'Dismiss',
  'action.refresh': 'Refresh',
  'action.refreshing': 'Refreshingâ€¦',
  'action.tryAgain': 'Try again',
  'action.clear': 'Clear',
  'action.clearFilters': 'Clear filters',
  'action.search': 'Search',
  'action.save': 'Save changes',
  'action.discard': 'Discard',
  'action.signIn': 'Sign in',
  'action.signOut': 'Sign out',
  'action.signingIn': 'Signing inâ€¦',
  'action.joinFree': 'Join free',
  'action.createAccount': 'Create an account',
  'action.creatingAccount': 'Creating accountâ€¦',
  'action.backToExplore': 'Back to explore',
  'action.open': 'Open',
  'action.edit': 'Edit',
  'action.delete': 'Delete',

  'common.loading': 'Loadingâ€¦',
  'common.loadingEllipsis': 'Loadingâ€¦',
  'common.notSet': 'Not set',
  'common.optional': 'Optional',
  'common.required': 'required',
  'common.newestFirst': 'Newest first',
  'common.anyCountry': 'Any country',
  'common.allCountries': 'All countries',
  'common.verified': 'Verified',
  'common.tradeAbbrev': 'RFQ = request for quotation Â· MOQ = minimum order quantity Â· FOB = free on board Â· TT = bank telegraphic transfer',

  'nav.feed': 'Feed',
  'nav.explore': 'Explore',
  'nav.exploreStock': 'Explore stock',
  'nav.offersBuyer': 'My offers',
  'nav.rfqs': 'My RFQs',
  'nav.orders': 'Orders',
  'nav.shipments': 'Shipments',
  'nav.messages': 'Messages',
  'nav.saved': 'Saved',
  'nav.savedLots': 'Saved lots',
  'nav.notifications': 'Notifications',
  'nav.help': 'Help centre',
  'nav.helpCentre': 'Help centre',
  'nav.howItWorks': 'How it works',
  'nav.profile': 'Profile',
  'nav.listings': 'My listings',
  'nav.post': 'Post stock',
  'nav.postStock': 'Post stock',
  'nav.offersSup': 'Offers',
  'nav.rfqOpps': 'RFQ opportunities',
  'nav.verification': 'Verification',
  'nav.suppliers': 'Suppliers',
  'nav.overview': 'Overview',
  'nav.adminSuppliers': 'Suppliers',
  'nav.adminVerify': 'Verification desk',
  'nav.adminListings': 'Listings',
  'nav.adminRfqs': 'RFQs',
  'nav.adminPayments': 'Payments',
  'nav.sources': 'Supply sources',
  'nav.growth': 'Banners and promos',
  'nav.features': 'Features',

  'topbar.searchPlaceholder': 'Search products, suppliers, categoriesâ€¦',
  'topbar.searchAria': 'Search the marketplace',
  'topbar.notifications': 'Notifications',
  'topbar.createAccountTitle': 'Create account',
  'topbar.account': 'Account',
  'topbar.languageAria': 'Interface language',
  'rail.allIndustries': 'All industries',
  'rail.howItWorks': 'How it works',
  'sidebar.moreIndustries': 'More industries. More countries.',
  'sidebar.moreIndustriesSub': 'One marketplace for ready stock.',

  'gate.title': 'Member access',
  'gate.body':
    'Contacting suppliers, posting requests and quoting are member actions. Browsing the marketplace stays free and open.',
  'gate.createAccount': 'Create free account',
  'gate.haveAccount': 'I already have an account',

  'cards.noPhoto': 'no photo',
  'cards.moq': 'MOQ',
  'cards.saveLot': 'Save this lot',
  'cards.demo': 'Demo',
  'cards.demoTitle': 'Seed data â€” not a real offer',
  'cards.inspections': 'inspections',

  'auth.signIn.sub': 'Access your orders, offers and RFQs.',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.signInCta': 'Sign in',
  'auth.newHere': 'New here?',
  'auth.demoNotice': 'Demo notice',
  'auth.seededLogin': 'Seeded review login',
  'auth.fillIn': 'Fill in',
  'auth.demoHintLead': 'is a seeded',
  'auth.demoHintLead2': 'demo',
  'auth.demoHintTail':
    'account for reviewing the admin console. It is not a real seller â€” do not enter real credentials.',
  'auth.demoHintProduct': 'admin',
  'auth.signInFailed': 'Login failed',
  'auth.signUp.title': 'Create an account',
  'auth.signUp.sub': 'One account to buy, sell, or provide inspection and logistics services.',
  'auth.fullName': 'Full name',
  'auth.workEmail': 'Work email',
  'auth.minChars': 'Minimum 8 characters',
  'auth.atLeast8': 'At least 8 characters.',
  'auth.iAmA': 'I am aâ€¦',
  'auth.company': 'Company',
  'auth.country': 'Country',
  'auth.countryHint': 'TÃ¼rkiye, Chinaâ€¦',
  'auth.createCta': 'Create account',
  'auth.alreadyRegistered': 'Already registered?',
  'auth.signUpHint': 'Listing is free. Trust badges are earned through verification, inspections and delivery history.',
  'auth.registerFailed': 'Registration failed',
  'auth.role.buyer': 'Buyer',
  'auth.role.buyerHint': 'I source products',
  'auth.role.supplier': 'Supplier',
  'auth.role.supplierHint': 'I sell / manufacture',
  'auth.role.inspector': 'Inspector',
  'auth.role.inspectorHint': 'I verify factories',
  'auth.role.lab': 'Laboratory',
  'auth.role.labHint': 'I test materials',
  'auth.role.logistics': 'Logistics',
  'auth.role.logisticsHint': 'I move cargo',

  'profile.title': 'Profile',
  'profile.sub': 'The details other parties see on your offers, orders and messages.',
  'profile.signInSub': 'Sign in to manage your account',
  'profile.notSignedIn': 'You are not signed in',
  'profile.notSignedInBody': 'Your profile is private to your account: sign in to view and edit it.',
  'profile.createAccount': 'Create an account',
  'profile.accountDetails': 'Account details',
  'profile.unsaved': 'Unsaved changes',
  'profile.fullName': 'Full name',
  'profile.company': 'Company',
  'profile.notSet': 'Not set',
  'profile.country': 'Country',
  'profile.language': 'Interface language',
  'profile.languageHint':
    'Changes the language of the interface immediately and is saved on your account when you press Save changes.',
  'profile.save': 'Save changes',
  'profile.saving': 'Savingâ€¦',
  'profile.saved': 'Saved',
  'profile.savedBody': 'Your profile was updated.',
  'profile.identity': 'Identity',
  'profile.identityNote':
    'Email and role cannot be edited here. They are fixed to the account when it is created and are not accepted by the profile API.',
  'profile.email': 'Email',
  'profile.role': 'Role',
  'profile.readOnly': 'Read-only',
  'profile.readOnlyEmail': 'Read-only â€” the profile API does not accept email',
  'profile.readOnlyRole': 'Read-only â€” the profile API does not accept role',
  'profile.emailStatus': 'Email status',
  'profile.emailVerified': 'Email verified',
  'profile.emailNotVerified': 'Email not verified',
  'profile.memberSince': 'Member since',
  'profile.accountLine': 'Account #{id} Â· signed in as {role}',
  'profile.errName': 'Enter your name â€” the API rejects an empty name.',
  'profile.errSave': 'Profile could not be saved â€” try again.',

  'explore.title': 'Explore stock',
  'explore.subLoading': 'Loading live lotsâ€¦',
  'explore.subCount': '{n} listings matching your filters',
  'explore.searchPlaceholder': 'Copper cathode, pumpsâ€¦',
  'explore.searchAria': 'Search listings',
  'explore.categoryAria': 'Category',
  'explore.allCategories': 'All categories',
  'explore.originAria': 'Origin country',
  'explore.allCountries': 'All countries',
  'explore.min': 'Min $',
  'explore.max': 'Max $',
  'explore.emptyTitle': 'No listings match those filters',
  'explore.emptyBody': 'Try a broader category, a different origin country, or clear the filters.',
  'explore.page': 'Page {page} of {pages}',
  'explore.prev': 'â† Prev',
  'explore.next': 'Next â†’',

  'feed.welcomeBack': 'Welcome back, {name}',
  'feed.title': 'Marketplace feed',
  'feed.sub': 'Ready stock, surplus and overstock lots from verified factories â€” newest first.',
  'feed.sellStock': 'Sell stock',
  'feed.postRequest': 'Post a request',
  'feed.lotsCount': '{n} lots',
  'feed.lotsMatch': 'lots match your filters',
  'feed.verifiedSuppliers': 'verified suppliers',
  'feed.openRequests': 'open requests',
  'feed.allOrigins': 'All origins',
  'feed.searchAria': 'Search lots',
  'feed.minAria': 'Minimum price',
  'feed.maxAria': 'Maximum price',
  'feed.allIndustries': 'All industries',
  'feed.noLots': 'No lots',
  'feed.shownRange': '{first}â€“{last} of {total}',
  'feed.emptyTitle': 'No lots match those filters',
  'feed.emptyBody': 'Try a different industry, another origin country, or clear the filters.',
  'feed.lookingFor': 'Looking for something specific?',
  'feed.postRequestLink': 'Post a request',
  'feed.lookingForTail': 'and let verified factories quote you.',
  'feed.sellingInstead': 'Selling instead?',
  'feed.listYourStock': 'List your stock',
  'feed.signedInAs': 'signed in as {role}',
  'feed.createFree': 'create a free account',

  'help.title': 'How FactoryDepo works',
  'help.sub': 'Ready stock, requests for quotation, and inspection-backed supply.',
  'help.buying': 'Buying',
  'help.buying1.title': '1. Browse ready stock.',
  'help.buying1':
    'Every live lot shows its price, minimum order quantity, origin country and how much is actually available. Listings marked Demo are seed data â€” not real offers â€” and are labelled so you are never misled.',
  'help.buying2.title': '2. Ask for a quotation.',
  'help.buying2':
    'Post a request describing what you need. Suppliers quote against it with a price, a lead time and their terms.',
  'help.buying3.title': '3. Compare and commit.',
  'help.buying3': 'Quotes are visible side by side on the request. Accepting one creates an order.',
  'help.buying4.title': '4. Pay by bank transfer.',
  'help.buying4':
    'Industrial trade does not run on cards. You receive a proforma invoice, settle by TT/wire, and the order is marked paid once funds are confirmed.',
  'help.selling': 'Selling',
  'help.selling1.title': '1. Create a supplier account.',
  'help.selling1': 'Signing up as a supplier creates your company profile immediately.',
  'help.selling2.title': '2. Post your stock.',
  'help.selling2':
    'Listing tools are being built now â€” until they ship, supplier listings are added by our team during onboarding.',
  'help.selling3.title': '3. Quote incoming requests.',
  'help.selling3':
    'Open buyer requests appear in your dashboard with a live count of how many you have not answered.',
  'help.selling4.title': '4. Get verified.',
  'help.selling4':
    'Verification tiers unlock visibility. Badges are granted only when documents are approved, so a badge on this site means something.',
  'help.notLive': 'What is not live yet',
  'help.notLiveLead': 'We would rather say this plainly than have you discover it:',
  'help.notLive1': 'Supplier self-service listing tools are in development.',
  'help.notLive2': 'Buyer â†” supplier messaging is not available yet â€” use the contact details on a supplier profile.',
  'help.notLive3': 'Offers and counter-offers are handled manually at the moment.',
  'help.notLive4': 'Shipment tracking and document handling are not built.',
  'help.exploreCta': 'Explore stock',
  'help.rfqCta': 'Requests for quotation',

  'soon.sub': 'Not built yet',
  'soon.title': 'This view is part of the next build phase',
  'soon.body': 'The screen exists in the navigation, but its data tables and API endpoints have not been built yet.',
  'soon.note.offers': 'The offers and counter-offers table lands in the next build phase.',
  'soon.note.shipments': 'Shipment milestones and documents land in the next build phase.',
  'soon.note.messages': 'Buyer â†” supplier messaging lands in the next build phase.',
  'soon.note.saved': 'Saved lots land in the next build phase.',
  'soon.note.notifications': 'The notification centre lands in the next build phase.',
  'soon.note.profile': 'Profile editing lands in the next build phase.',
  'soon.note.listings': 'Supplier product CRUD with ownership checks lands in the next build phase.',
  'soon.note.post': 'Listing create/edit with image upload lands in the next build phase.',
  'soon.note.generic': 'Lands in the next build phase.',
  'soon.note.verification': 'Verification tiers and document submission land in the next build phase.',
  'soon.note.admin': 'The admin console lands in the next build phase.',
  'soon.note.sources': 'Manual supplier intake lands in the next build phase.',
  'soon.note.features': 'Feature flags land in the next build phase.',

  'orders.title': 'Orders',
  'orders.signInSub': 'Sign in to see the orders you are party to',
  'orders.notSignedIn': 'You are not signed in',
  'orders.notSignedInBody': 'Orders are private: sign in to see what you have committed to buy or sell.',
  'orders.createAccount': 'Create an account',
  'orders.subSupplier': 'Orders buyers placed on your stock',
  'orders.subBuyer': 'Everything you have committed to buy',
  'orders.statListings': 'My listings',
  'orders.statOffersReceived': 'Offers received',
  'orders.statOffersOnRfqs': 'Offers on my RFQs',
  'orders.statOrders': 'Orders',
  'orders.statSoldItems': 'Sold items',
  'orders.statSoldTitle': 'Shipped or delivered orders',
  'orders.statViews': 'Views',
  'orders.statViewsTitle': 'Recorded views on the listings in your scope',
  'orders.metricsError': 'Metrics could not be loaded right now.',
  'orders.loadErrorTitle': 'Orders could not be loaded',
  'orders.loadErrorBody': 'The API did not return your orders. Refresh the page or sign in again.',
  'orders.emptyTitle': 'No orders yet',
  'orders.emptySupplier': 'When a buyer orders from your stock it appears here.',
  'orders.emptyBuyer': 'Buy-now orders you place on ready stock appear here.',
  'orders.browseStock': 'Browse ready stock',
  'orders.postRfq': 'Post an RFQ',
  'orders.count': '{n} orders',
  'orders.col.order': 'Order',
  'orders.col.product': 'Product',
  'orders.col.counterparty': 'Counterparty',
  'orders.col.qty': 'Qty',
  'orders.col.total': 'Total',
  'orders.col.status': 'Status',
  'orders.col.date': 'Date',
  'orders.buyerLabel': 'buyer',
  'orders.supplierLabel': 'supplier',
  'orders.buyerId': 'Buyer #{id}',

  'product.loadingTitle': 'Loadingâ€¦',
  'product.loadingThis': 'this listing',
  'product.fetching': 'Fetching {what}â€¦',
  'product.notFound': 'Product not found',
  'product.backToExplore': 'Back to explore',
  'product.noPhoto': 'No photo supplied for this lot',
  'product.pricePer': 'Price / {unit}',
  'product.minOrder': 'Minimum order',
  'product.availableNow': 'Available now',
  'product.origin': 'Country of origin',
  'product.unavailable': 'Currently unavailable',
  'product.buyNowHeading': 'Buy now â€” ready stock',
  'product.soldOutBody': 'This lot is marked sold out. Ask the supplier for the next available batch.',
  'product.noUnitsBody': 'No units are available at the moment. Ask the supplier for the next available batch.',
  'product.purchaseTerms':
    'Purchase at the listed price of {price} per {unit}, minimum {moq} {unit}.',
  'product.stockOnHand': 'Stock on hand',
  'product.buyNowPrice': 'Buy now Â· {price}/{unit}',
  'product.outOfStock': 'Buy now â€” out of stock',
  'product.requestQuote': 'Request a quotation',
  'product.shipsFrom': 'Ships from {country}',
  'product.signInToOrder': 'Sign in to order or request a quotation.',
  'product.supplier': 'Supplier',
  'product.viewProfile': 'View profile',
  'product.loadingSupplier': 'Loading supplierâ€¦',
  'product.supplierUnavailable': 'Supplier details are not available.',
  'product.rating': 'Rating',
  'product.inspections': 'Inspections',
  'product.fulfilment': 'On-time fulfilment',
  'product.verifiedLevel': 'Verified level',
  'product.levelN': 'Level {n}',
  'product.tradingSince': 'Trading since',
  'product.supplierFiguresHint': 'Figures are marketplace-wide for this supplier, not just for this lot.',
  'product.description': 'Description',
  'product.noDescription':
    'The supplier has not added a description. Request a quotation for specifications, lead time and delivery terms.',
  'product.specification': 'Specification',
  'product.noSpec': 'No specification recorded for this lot.',
  'product.col.attribute': 'Attribute',
  'product.col.value': 'Value',
  'product.spec.category': 'Category',
  'product.spec.unit': 'Unit',
  'product.spec.purity': 'Purity / grade',

  'checkout.title': 'Buy now â€” checkout',
  'checkout.placedTitle': 'Order placed',
  'checkout.confirmed': 'Order #{id} confirmed',
  'checkout.notified': 'The supplier has been notified. Track the order from your orders page.',
  'checkout.viewOrders': 'View orders',
  'checkout.keepBrowsing': 'Keep browsing',
  'checkout.pricePer': 'Price / {unit}',
  'checkout.minimumOrder': 'Minimum order',
  'checkout.availableNow': 'Available now',
  'checkout.quantity': 'Quantity ({unit})',
  'checkout.qtyHint': 'Between {moq} and {stock} {unit} in stock.',
  'checkout.fullName': 'Full name',
  'checkout.country': 'Country',
  'checkout.address': 'Street address',
  'checkout.city': 'City',
  'checkout.phone': 'Phone',
  'checkout.notes': 'Notes for the supplier',
  'checkout.total': 'Total {total}',
  'checkout.placeOrder': 'Place order Â· {total}',
  'checkout.placing': 'Placing orderâ€¦',
  'checkout.errPlace': 'The order could not be placed.',

  'rfqModal.title': 'Request a quotation',
  'rfqModal.postedTitle': 'Request posted',
  'rfqModal.live': 'Your requirement is live in the RFQ exchange',
  'rfqModal.canQuote': 'Verified suppliers can now quote price and lead time.',
  'rfqModal.viewMine': 'View my RFQs',
  'rfqModal.listedBy': '{product} Â· listed by {supplier}',
  'rfqModal.quantity': 'Quantity',
  'rfqModal.unit': 'Unit',
  'rfqModal.specs': 'Specs, certifications, delivery terms',
  'rfqModal.moqHint': 'The listing MOQ is {moq} {unit}.',
  'rfqModal.post': 'Post request',
  'rfqModal.posting': 'Postingâ€¦',
  'rfqModal.errPost': 'The request could not be posted.',
  'rfqModal.titleSuffix': 'quotation request',

  'suppliers.loadingSub': 'Fetching the supplier directory',
  'suppliers.loadingBody': 'Fetching the supplier directoryâ€¦',
  'suppliers.title': 'Supplier directory',
  'suppliers.sub':
    'Factories and trading houses on FactoryDepo. Verification tiers come from on-site audits and document checks.',
  'suppliers.demoNote': 'rows marked demo are seed data',
  'suppliers.loadErrorTitle': 'The directory could not be loaded',
  'suppliers.loadErrorBody': 'The supplier service did not respond. Try again in a moment.',
  'suppliers.emptyTitle': 'No suppliers listed yet',
  'suppliers.emptyBody': 'Supplier profiles appear here once they are onboarded and verified.',
  'suppliers.totalListed': 'Suppliers listed',
  'suppliers.totalVerified': 'Verified level 2+',
  'suppliers.avgRating': 'Average rating',
  'suppliers.avgRatingRated': 'Average rating ({n} rated)',
  'suppliers.avgFulfilment': 'On-time fulfilment',
  'suppliers.avgFulfilmentMeasured': 'On-time fulfilment ({n} measured)',
  'suppliers.searchPlaceholder': 'Company, country, city, capabilityâ€¦',
  'suppliers.searchAria': 'Search suppliers',
  'suppliers.verifiedOnly': 'Verified only',
  'suppliers.showing': 'Showing {shown} of {total}',
  'suppliers.noMatchTitle': 'No suppliers match that search',
  'suppliers.noMatchBody': 'Try a shorter company name or clear the verified filter.',
  'suppliers.rating': 'Rating',
  'suppliers.inspections': 'Inspections',
  'suppliers.fulfilment': 'Fulfilment',

  'supplierDetail.loadingThis': 'this supplier profile',
  'supplierDetail.notFound': 'Supplier not found',
  'supplierDetail.backToDirectory': 'Back to directory',
  'supplierDetail.backShort': 'â† Back to directory',
  'supplierDetail.tradingSince': 'Trading since {year}',
  'supplierDetail.verifiedL3': 'Verified Â· level 3',
  'supplierDetail.registered': 'Registered',
  'supplierDetail.buyerRating': 'Buyer rating',
  'supplierDetail.notRated': 'not rated yet',
  'supplierDetail.inspections': 'On-site inspections',
  'supplierDetail.fulfilment': 'On-time fulfilment',
  'supplierDetail.activeListings': 'Active listings',
  'supplierDetail.tier': 'Verification tier',
  'supplierDetail.trustScore': 'Trust score (0â€“100)',
  'supplierDetail.about': 'About {company}',
  'supplierDetail.noDescription': 'This supplier has not published a company description yet.',
  'supplierDetail.capabilities': 'Declared capabilities',
  'supplierDetail.record': 'Verification & record',
  'supplierDetail.ratingLabel': 'Buyer rating',
  'supplierDetail.inspectionsDone': 'Inspections completed',
  'supplierDetail.contact': 'Contact',
  'supplierDetail.contactBody':
    'Inspection reports and verification documents are shared with members after first contact.',
  'supplierDetail.contactSupplier': 'Contact supplier',
  'supplierDetail.contactHintSignedIn': 'Opens the RFQ exchange â€” the quote thread lives there.',
  'supplierDetail.contactHintGuest': 'Members only Â· free to join',
  'supplierDetail.services': 'Trade services',
  'supplierDetail.service1': 'Factory inspection before payment',
  'supplierDetail.service2': 'Laboratory testing and material analysis',
  'supplierDetail.service3': 'Container loading supervision',
  'supplierDetail.service4': 'Export documentation support',
  'supplierDetail.stockFrom': 'Stock from {company}',
  'supplierDetail.shown': '{n} shown',
  'supplierDetail.loadingLots': 'Loading live lotsâ€¦',
  'supplierDetail.noneShown': 'No active listings shown',
  'supplierDetail.noneShownBody':
    'The API reports {n} listings for this supplier, but none came back in the current listing view. Post a request through the RFQ exchange to ask about their catalogue.',

  'rfq.titleSupplier': 'RFQ opportunities',
  'rfq.titleBuyer': 'Requests',
  'rfq.subSupplier': 'Open requirements posted by buyers. Respond with your price and lead time.',
  'rfq.subBuyer':
    'Requirements currently on the exchange, newest first. Open one to see the quotations it has received.',
  'rfq.postRequest': '+ Post a request',
  'rfq.buyerOnlyNotice': 'Only buyer accounts can post a request. Sign in with a buyer profile to post one.',
  'rfq.total': 'requests total',
  'rfq.open': 'open',
  'rfq.quoted': 'quoted',
  'rfq.closed': 'closed',
  'rfq.quoteable': 'Requests you can quote',
  'rfq.allRequests': 'All requests',
  'rfq.shown': '{n} shown',
  'rfq.statusAll': 'All',
  'rfq.statusOpenCount': 'Open ({n})',
  'rfq.statusQuotedCount': 'Quoted ({n})',
  'rfq.quotingCloses': 'Quoting closes when the buyer accepts an offer.',
  'rfq.emptyNone': 'No requests yet',
  'rfq.emptyNoMatch': 'Nothing matches that filter',
  'rfq.emptyNoneSupplier': 'No open requirements on the exchange right now.',
  'rfq.emptyNoneBuyer': 'Post your first requirement and verified factories will respond.',
  'rfq.emptyNoMatchHint': 'Try a different status filter.',
  'rfq.col.requirement': 'Requirement',
  'rfq.col.quantity': 'Quantity',
  'rfq.col.deliverTo': 'Deliver to',
  'rfq.col.quotes': 'Quotes',
  'rfq.col.posted': 'Posted',
  'rfq.col.status': 'Status',
  'rfq.openAria': 'Open RFQ #{id}',
  'rfq.requestRef': '{category} Â· request #{id}',
  'rfq.quotesCount': '{n} quotes',
  'rfq.postingBuyerOnly': 'Posting is a buyer action. Suppliers can',
  'rfq.quoteOpen': 'quote open requirements',
  'rfq.newTitle': 'New request for quotation',
  'rfq.whatNeed': 'What do you need?',
  'rfq.titlePlaceholder': 'e.g. 100 MT copper cathode, grade A',
  'rfq.category': 'Category',
  'rfq.deliverTo': 'Deliver to',
  'rfq.quantity': 'Quantity',
  'rfq.unit': 'Unit',
  'rfq.specification': 'Specification',
  'rfq.specPlaceholder': 'Grade, purity, certifications, Incoterms, packingâ€¦',
  'rfq.specHint': 'The clearer the specification, the faster verified factories can quote.',
  'rfq.errTitle': 'Give the request a clear title â€” at least 5 characters.',
  'rfq.errQuantity': 'Quantity must be a number greater than zero.',
  'rfq.errPost': 'Could not post this request.',

  'rfqDetail.loadingTitle': 'Request',
  'rfqDetail.loadingSub': 'Loadingâ€¦',
  'rfqDetail.title': 'Request',
  'rfqDetail.notFound': 'Request not found',
  'rfqDetail.notFoundBody': 'This requirement may have been withdrawn, or the link is wrong.',
  'rfqDetail.backToRequests': 'â† Back to requests',
  'rfqDetail.allRequests': 'â† All requests',
  'rfqDetail.postedOn': 'posted {date}',
  'rfqDetail.requestRef': 'Request #{id}',
  'rfqDetail.accepting': 'Accepting quotations',
  'rfqDetail.notAccepting': 'Not accepting new quotations',
  'rfqDetail.noSpec': 'No further specification supplied.',
  'rfqDetail.quantity': 'Quantity',
  'rfqDetail.deliverTo': 'Deliver to',
  'rfqDetail.quotations': 'Quotations',
  'rfqDetail.deadline': 'Deadline',
  'rfqDetail.requestedBy': 'Requested by',
  'rfqDetail.received': '{n} received',
  'rfqDetail.noneTitle': 'No quotations yet',
  'rfqDetail.noneBody': 'Verified suppliers are reviewing this requirement.',
  'rfqDetail.col.supplier': 'Supplier',
  'rfqDetail.col.price': 'Price',
  'rfqDetail.col.leadTime': 'Lead time',
  'rfqDetail.col.notes': 'Notes',
  'rfqDetail.col.sent': 'Sent',
  'rfqDetail.col.status': 'Status',
  'rfqDetail.trustScore': 'Trust score {n}',
  'rfqDetail.days': '{n} days',
  'rfqDetail.submitTitle': 'Submit a quotation',
  'rfqDetail.supplierAccount': 'Supplier account',
  'rfqDetail.fromSupplier': 'Quotations come from supplier accounts. Switch to your supplier account to respond to this request.',
  'rfqDetail.signInSupplierBody': 'Only signed-in supplier accounts can quote a request. Browsing stays open to everyone.',
  'rfqDetail.supplierOnly': 'Supplier accounts only',
  'rfqDetail.signInAsSupplier': 'Sign in as a supplier',
  'rfqDetail.closedBody': 'This request is {status} and is no longer accepting quotations.',
  'rfqDetail.seeOpen': 'See open requests',
  'rfqDetail.respondBody': 'Respond with your unit price and lead time. Your verified profile travels with the quotation.',
  'rfqDetail.unitPrice': 'Unit price (USD)',
  'rfqDetail.leadTime': 'Lead time (days)',
  'rfqDetail.termsNotes': 'Terms and notes',
  'rfqDetail.termsPlaceholder': 'Incoterms, grade, packing, sample policy, validityâ€¦',
  'rfqDetail.compareHint': 'Buyers compare price, lead time and verification side by side.',
  'rfqDetail.submitQuote': 'Submit quotation',
  'rfqDetail.submitting': 'Submittingâ€¦',
  'rfqDetail.errPrice': 'Enter a unit price greater than zero.',
  'rfqDetail.errLead': 'Lead time must be a whole number of days between 1 and 365.',
  'rfqDetail.errSubmit': 'Could not submit this quotation.',

  'listings.title': 'My listings',
  'listings.sub': 'The stock you have published on the marketplace',
  'listings.signInSub': 'The stock you have published on the marketplace',
  'listings.notSignedIn': 'You are not signed in',
  'listings.notSignedInBody': 'Your listings are private to your supplier account. Sign in to see and manage them.',
  'listings.createSupplierAccount': 'Create a supplier account',
  'listings.supplierOnly': 'Supplier accounts only',
  'listings.supplierOnlyBody':
    'Your account is a {role} account. Listings are managed by the supplier that owns them, so there is nothing to show or edit here.',
  'listings.browseStock': 'Browse ready stock',
  'listings.subLoading': 'Loading your stockâ€¦',
  'listings.subCount': '{n} listings published under your supplier profile',
  'listings.postStock': '+ Post stock',
  'listings.lotsPublished': 'lots published',
  'listings.bankTransferNote': 'Buyers pay by bank transfer once an offer is accepted.',
  'listings.loadErrorTitle': 'Your listings could not be loaded',
  'listings.loadErrorBody': 'Could not load your listings â€” try again. If it keeps failing, sign in again.',
  'listings.emptyTitle': 'No listings yet',
  'listings.emptyBody':
    'Post your first lot â€” a photo, a unit price and how much you can ship today. It goes live in Explore for every buyer on the marketplace.',
  'listings.postFirst': '+ Post your first lot',
  'listings.getVerified': 'Get verified',
  'listings.count': '{n} listings',
  'listings.col.lot': 'Lot',
  'listings.col.category': 'Category',
  'listings.col.unitPrice': 'Unit price',
  'listings.col.moq': 'MOQ',
  'listings.col.available': 'Available',
  'listings.col.status': 'Status',
  'listings.col.posted': 'Posted',
  'listings.lotRef': 'lot #{id}',
  'listings.noPhotoInline': 'no photo',
  'listings.demoNoteLead': 'A lot marked',
  'listings.demoNoteTail':
    'is seed data supplied by the marketplace, not stock posted by you. Deleting it removes it for everyone.',
  'listings.updated': 'Listing updated.',
  'listings.deleted': 'Listing deleted. It is no longer on the marketplace.',
  'listings.deleteTitle': 'Delete this listing?',
  'listings.deleteLead': '{name} â€” lot #{id}',
  'listings.deleteBody':
    'This listing is removed permanently. It disappears from Explore and from your listing table immediately, and buyers can no longer order or negotiate on it. This cannot be undone.',
  'listings.deleteKeepBody':
    'A lot that already has orders or offers against it cannot be deleted â€” the API keeps it for the record. Mark it sold out instead by setting available stock to 0.',
  'listings.keepListing': 'Keep listing',
  'listings.deleteForever': 'Delete permanently',
  'listings.deleting': 'Deletingâ€¦',
  'listings.deleteErr': 'Could not delete this listing.',
  'listings.editTitle': 'Edit listing â€” lot #{id}',

  'post.title': 'Post stock',
  'post.titleEdit': 'Edit listing',
  'post.sub': 'One lot per listing: what it is, what it costs and how much you can ship today',
  'post.subEdit': 'Changing lot #{id} â€” saving overwrites the live listing',
  'post.signInSub': 'List ready stock so buyers can order or negotiate on it',
  'post.notSignedIn': 'You are not signed in',
  'post.notSignedInBody': 'Posting stock is a supplier action. Sign in with a supplier account to publish a lot.',
  'post.createSupplierAccount': 'Create a supplier account',
  'post.supplierOnly': 'Supplier accounts only',
  'post.supplierOnlyBody':
    'Your account is a {role} account, so the API will not accept a listing from it. A supplier profile is required before stock can be posted.',
  'post.myListings': 'My listings',
  'post.loadErrorTitle': 'Listing could not be loaded',
  'post.loadErrorBody': 'This lot could not be loaded â€” try again, or return to your listings.',
  'post.details': 'Listing details',
  'post.newListing': 'New listing',
  'post.requiredMark': '* required',
  'post.lotName': 'Lot name',
  'post.lotNamePlaceholder': 'e.g. Copper cathode grade A, 99.99%',
  'post.category': 'Category',
  'post.originCountry': 'Origin country',
  'post.notStated': 'Not stated',
  'post.description': 'Description',
  'post.descriptionPlaceholder': 'Grade, packing, Incoterms, lead time, certificatesâ€¦',
  'post.descriptionHint': 'Buyers decide from this text. Say what is in the lot and how it ships.',
  'post.unitPrice': 'Unit price',
  'post.currency': 'Currency',
  'post.unit': 'Unit',
  'post.moq': 'Minimum order (MOQ)',
  'post.moqHint': 'Defaults to 1.',
  'post.available': 'Available now',
  'post.availableHint': 'Defaults to 0 â€” the stock you can ship today.',
  'post.purity': 'Purity / grade',
  'post.purityPlaceholder': '99.99% / Grade A',
  'post.optional': 'Optional.',
  'post.photoUrl': 'Photo URL',
  'post.photoPlaceholder': 'https://â€¦/copper-cathode.jpg',
  'post.photoHintLead': 'File upload is not built yet.',
  'post.photoHintTail':
    'Paste a public link to the photo and it is stored as this lotâ€™s image. Lots without a photo show a plain placeholder.',
  'post.preview': 'Preview â€” if nothing loads, the link is not a direct image.',
  'post.save': 'Save changes',
  'post.saving': 'Savingâ€¦',
  'post.errName': 'Give the lot a name â€” at least 2 characters.',
  'post.errCategory': 'Pick a category.',
  'post.errUnit': 'State the unit you sell in (MT, KG, pcsâ€¦).',
  'post.errPrice': 'Unit price must be a number greater than zero.',
  'post.errMoq': 'MOQ must be a number greater than zero.',
  'post.errQty': 'Available quantity cannot be negative.',
  'post.errSave': 'Could not save this listing.',
  'post.errCreate': 'Could not post this listing.',
  'post.behaviour': 'How this listing behaves',
  'post.behaviourBody':
    'A posted lot appears in Explore straight away and can be ordered by any signed-in buyer. Buyers may also open an offer below your asking price; you answer those from',
  'post.offersLink': 'Offers',
  'post.provenance': 'Provenance',
  'post.platformListing': 'Platform listing',
  'post.photo': 'Photo',
  'post.urlOnly': 'URL only â€” upload not built',
  'post.buyerPaysBy': 'Buyer pays by',
  'post.bankTransfer': 'Bank transfer',
  'post.noMetrics':
    'Nothing on this page reports views, ratings or order counts â€” those figures are not measured yet, so they are not shown.',

  'offers.title': 'Offers on your stock',
  'offers.sub': 'Buyers negotiating on your lots',
  'offers.signInSub': 'Buyers negotiating on your lots',
  'offers.notSignedIn': 'You are not signed in',
  'offers.notSignedInBody': 'Offers are private to the buyer and the supplier on them. Sign in to answer them.',
  'offers.createSupplierAccount': 'Create a supplier account',
  'offers.supplierOnly': 'Supplier accounts only',
  'offers.supplierOnlyBody':
    'Your account is a {role} account, so no stock is listed under it and no offers can arrive. Offers you have made as a buyer live on the buyer side of the marketplace.',
  'offers.browseStock': 'Browse ready stock',
  'offers.subLoading': 'Loading offersâ€¦',
  'offers.subCount': '{n} offers on your listings',
  'offers.awaiting': 'awaiting your answer',
  'offers.decided': 'decided',
  'offers.acceptCreates': 'Accepting an offer creates an order; the buyer pays by bank transfer.',
  'offers.filterAwaiting': 'Awaiting answer ({n})',
  'offers.filterDecided': 'Decided ({n})',
  'offers.counterNote': 'Counters open a new linked offer; your original terms stay on record.',
  'offers.loadErrorTitle': 'Offers could not be loaded',
  'offers.loadErrorBody': 'Could not load the offers on your stock â€” try again.',
  'offers.emptyTitle': 'No offers yet',
  'offers.emptyBody':
    'When a buyer negotiates on one of your lots it appears here, with the price they proposed and the quantity they want. You can accept it, reject it, or answer with your own price.',
  'offers.seeListings': 'See my listings',
  'offers.postMore': '+ Post more stock',
  'offers.noneAwaiting': 'Nothing awaiting your answer',
  'offers.noneDecided': 'No decided offers yet',
  'offers.noneAwaitingBody': 'Every offer on your stock has been answered. Switch to Decided to review them.',
  'offers.noneDecidedBody': 'Offers you accept or reject are kept here as a record.',
  'offers.count': '{n} offers',
  'offers.col.listing': 'Listing',
  'offers.col.buyer': 'Buyer',
  'offers.col.quantity': 'Quantity',
  'offers.col.theirPrice': 'Their price',
  'offers.col.status': 'Status',
  'offers.col.received': 'Received',
  'offers.decidedLabel': 'Decided',
  'offers.counter': 'Counter',
  'offers.accept': 'Accept',
  'offers.reject': 'Reject',
  'offers.offerRef': 'offer #{id}',
  'offers.answersOffer': 'answers offer #{id}',
  'offers.demoNoteLead': 'A row tagged',
  'offers.demoNoteTail':
    'sits on a seeded lot, not stock you posted. Accepting it still creates a real order â€” check the lot before you commit.',
  'offers.counterTitle': 'Counter offer #{id}',
  'offers.counterBody':
    '{buyer} offered {price} / {qty} on {product}. Your answer becomes a new linked offer; the buyerâ€™s terms stay on the record.',
  'offers.counterPrice': 'Your unit price',
  'offers.perUnit': '{currency} per unit',
  'offers.counterQty': 'Quantity',
  'offers.counterQtyHint': 'Leave as-is to keep the buyerâ€™s quantity.',
  'offers.counterNotes': 'Note to the buyer',
  'offers.counterNotesPlaceholder': 'Lead time, packing, Incoterms, validity of this priceâ€¦',
  'offers.sendCounter': 'Send counter',
  'offers.sending': 'Sendingâ€¦',
  'offers.counterErrPrice': 'Your counter price must be a number greater than zero.',
  'offers.counterErrQty': 'Quantity must be a number greater than zero.',
  'offers.counterErr': 'Could not send this counter-offer.',
  'offers.counterDone': 'Counter sent. The original offer is marked countered and the buyer is notified.',
  'offers.acceptTitle': 'Accept offer #{id}?',
  'offers.listing': 'Listing',
  'offers.buyer': 'Buyer',
  'offers.quantity': 'Quantity',
  'offers.unitPrice': 'Unit price',
  'offers.offerValue': 'Offer value',
  'offers.acceptBodyLead': 'Accepting creates an order.',
  'offers.acceptBodyBank': 'The buyer is committed to it and pays by',
  'offers.acceptBodyTail':
    'â€” the platform does not take a card payment. You issue the proforma and confirm the transfer when it lands; the order then moves to shipment. This decision is final: an accepted offer cannot be re-decided.',
  'offers.acceptCta': 'Accept and create order',
  'offers.accepting': 'Acceptingâ€¦',
  'offers.acceptErr': 'Could not accept this offer.',
  'offers.acceptDone': 'Offer #{id} accepted. An order was created for {buyer}.',
  'offers.rejectTitle': 'Reject offer #{id}?',
  'offers.rejectBody':
    '{buyer}â€™s offer of {price} on {product} is closed. Rejecting is final â€” the buyer cannot revive this offer, though they may open a new one.',
  'offers.rejectCta': 'Reject offer',
  'offers.rejecting': 'Rejectingâ€¦',
  'offers.rejectErr': 'Could not reject this offer.',
  'offers.rejectDone': 'Offer #{id} rejected.',

  'myoffers.titleSupplier': 'Offers on my stock',
  'myoffers.titleAdmin': 'All offers',
  'myoffers.titleBuyer': 'My offers',
  'myoffers.subSupplier': 'Offers buyers have made on your stock. Counter, accept or reject each one.',
  'myoffers.subAdmin': 'Every offer on the platform, newest first.',
  'myoffers.subBuyer': 'Offers you have made on ready stock. Counter, accept or reject each one.',
  'myoffers.signInSub': 'Sign in to see the offers you are negotiating',
  'myoffers.notSignedIn': 'You are not signed in',
  'myoffers.notSignedInBody': 'Offers are private to the two parties: sign in to open, counter or accept one.',
  'myoffers.loadErrorTitle': 'Offers could not be loaded',
  'myoffers.loadErrorBody': 'The API did not return your offers â€” try again.',
  'myoffers.trying': 'Tryingâ€¦',
  'myoffers.emptyTitle': 'No offers yet',
  'myoffers.emptySupplier': 'Offers buyers make on your listings appear here, ready to counter or accept.',
  'myoffers.emptyAdmin': 'No offer has been opened on the platform yet.',
  'myoffers.emptyBuyer': 'Open a lot you want and make an offer â€” the supplier can counter, accept or reject it.',
  'myoffers.browseStock': 'Browse ready stock',
  'myoffers.count': '{n} offers',
  'myoffers.stillOpen': '{n} still open',
  'myoffers.col.offer': 'Offer',
  'myoffers.col.counterparty': 'Counterparty',
  'myoffers.col.quantity': 'Quantity',
  'myoffers.col.unitPrice': 'Unit price',
  'myoffers.col.status': 'Status',
  'myoffers.col.date': 'Date',
  'myoffers.col.action': 'Action',
  'myoffers.counterTo': 'counter to #{id}',
  'myoffers.offerRef': 'offer #{id}',
  'myoffers.answersOffer': 'answers offer #{id}',
  'myoffers.seatSupplier': 'supplier',
  'myoffers.seatBuyer': 'buyer',
  'myoffers.noAction': 'No further action',
  'myoffers.confirmReject': 'Confirm reject',
  'myoffers.counter': 'Counter',
  'myoffers.accept': 'Accept',
  'myoffers.reject': 'Reject',
  'myoffers.counterTitle': 'Counter offer #{id}',
  'myoffers.counterDoneTitle': 'Counter-offer sent',
  'myoffers.counterDoneBody': 'Your counter-offer is with the other party',
  'myoffers.backToOffers': 'Back to my offers',
  'myoffers.counterLead': '{product} Â· offer #{id} Â· {qty} offered at {price} per unit',
  'myoffers.perUnit': 'In {currency}, per unit.',
  'myoffers.inCurrency': 'In {currency}, per unit.',
  'myoffers.originally': 'Originally {qty}.',
  'myoffers.messageLabel': 'Message to the other party',
  'myoffers.messagePlaceholder': 'Lead time, packing, payment termsâ€¦',
  'myoffers.sendCounter': 'Send counter-offer',
  'myoffers.sending': 'Sendingâ€¦',
  'myoffers.errInvalid': 'Enter a unit price and quantity greater than zero.',
  'myoffers.errCounter': 'The counter-offer could not be sent â€” try again.',
  'myoffers.acceptTitle': 'Accept offer #{id}',
  'myoffers.acceptLead': '{product} Â· {qty} at {price} per unit',
  'myoffers.acceptStripeLead': 'Accepting agrees to this price and quantity and',
  'myoffers.acceptStripeStrong': 'creates an order',
  'myoffers.acceptStripeTail': 'for it. The order then appears under Orders, where shipment milestones are tracked.',
  'myoffers.acceptHint': 'This cannot be undone â€” the negotiation closes at the accepted terms.',
  'myoffers.acceptCta': 'Accept and create order',
  'myoffers.accepting': 'Acceptingâ€¦',
  'myoffers.errAccept': 'The offer could not be accepted â€” try again.',
  'myoffers.accepted': 'Offer #{id} accepted. Check Orders for the resulting order.',
  'myoffers.viewOrders': 'View orders',
  'myoffers.errReject': 'Offer #{id} could not be rejected â€” try again.',

  'ship.title': 'Shipments',
  'ship.subSupplier': 'Milestones on orders placed against your stock. You move each shipment forward.',
  'ship.subAdmin': 'Milestones on every order. Admins can advance a shipment on the supplierâ€™s behalf.',
  'ship.subBuyer': 'Milestone tracking for the orders you placed. Your supplier advances each step.',
  'ship.signInSub': 'Sign in to track your shipments',
  'ship.notSignedIn': 'You are not signed in',
  'ship.notSignedInBody': 'Shipment tracking is private to the buyer and supplier on an order.',
  'ship.loadErrorTitle': 'Shipments could not be loaded',
  'ship.loadErrorBody': 'The API did not return your shipments â€” try again.',
  'ship.trying': 'Tryingâ€¦',
  'ship.emptyTitle': 'No shipments yet',
  'ship.emptySupplier': 'A shipment is created automatically when a buyer orders from your stock.',
  'ship.emptyBuyer': 'A shipment is created automatically for each order you place, and its milestones appear here.',
  'ship.myListings': 'My listings',
  'ship.viewOrders': 'View my orders',
  'ship.count': 'shipments visible to your account',
  'ship.delivered': 'delivered',
  'ship.advanceRecorded': 'Advancing a milestone is recorded with a timestamp and shared with the buyer.',
  'ship.advanceBySupplier': 'Milestones are advanced by the supplier on each order.',
  'ship.trackingTitle': 'Shipment tracking',
  'ship.col.shipment': 'Shipment',
  'ship.col.product': 'Product',
  'ship.col.carrier': 'Carrier',
  'ship.col.trackingNo': 'Tracking no.',
  'ship.col.documents': 'Documents',
  'ship.col.updated': 'Last update',
  'ship.col.milestone': 'Milestone',
  'ship.noDocumentTitle': 'No document is attached to a shipment yet',
  'ship.advance': 'Advance milestone',
  'ship.advancing': 'Advancingâ€¦',
  'ship.deliveredLabel': 'Delivered',
  'ship.advancedBySupplier': 'Advanced by the supplier',
  'ship.completeTitle': 'Every milestone is reached',
  'ship.advanceTitle': 'Move this shipment one step forward',
  'ship.noMilestones': 'No milestones are recorded on this shipment yet.',
  'ship.reached': '{step} of {total} milestones reached',
  'ship.reachedDelivered': 'delivered',
  'ship.reachedNext': 'next: {next}',
  'ship.footLead': 'Milestone history is shared by both parties on the order. Orders and their totals live under',
  'ship.footLink': 'Orders',
  'ship.footTail': '.',
  'ship.errAdvance': 'Shipment #{id} could not be advanced â€” try again.',

  'saved.title': 'Saved lots',
  'saved.signInSub': 'Sign in to keep a shortlist of lots',
  'saved.notSignedIn': 'You are not signed in',
  'saved.notSignedInBody': 'Your shortlist is private to your account: sign in to save and remove lots.',
  'saved.sub': 'Lots you shortlisted. Prices and stock are the supplierâ€™s current figures, not a reservation.',
  'saved.loadErrorTitle': 'Saved lots could not be loaded',
  'saved.loadErrorBody': 'The API did not return your shortlist â€” try again.',
  'saved.trying': 'Tryingâ€¦',
  'saved.emptyTitle': 'Nothing saved yet',
  'saved.emptyBody': 'Save a lot from the marketplace and it appears here for a quick comparison later.',
  'saved.browse': 'Browse ready stock',
  'saved.goToFeed': 'Go to my feed',
  'saved.count': '{n} saved lots',
  'saved.mostRecent': 'Most recently saved first',
  'saved.savedOn': 'Saved {date}',
  'saved.remove': 'Remove',
  'saved.removing': 'Removingâ€¦',
  'saved.removeTitle': 'Remove this lot from your shortlist',
  'saved.errRemove': 'That lot could not be removed from your shortlist â€” try again.',

  'notes.title': 'Notifications',
  'notes.signInSub': 'Sign in to see your account activity',
  'notes.notSignedIn': 'You are not signed in',
  'notes.notSignedInBody': 'Notifications are private to your account: sign in to read them.',
  'notes.sub': 'Offers, messages and shipment updates on your account, newest first.',
  'notes.markAll': 'Mark all read',
  'notes.marking': 'Markingâ€¦',
  'notes.markAllTitle': 'Mark {n} unread notifications read',
  'notes.nothingUnread': 'Nothing is unread',
  'notes.loadErrorTitle': 'Notifications could not be loaded',
  'notes.loadErrorBody': 'The API did not return your notifications â€” try again.',
  'notes.trying': 'Tryingâ€¦',
  'notes.emptyTitle': 'No notifications yet',
  'notes.emptyBody': 'When an offer is countered, a message arrives or a shipment moves, it is recorded here.',
  'notes.browse': 'Browse ready stock',
  'notes.myOrders': 'My orders',
  'notes.count': '{n} notifications',
  'notes.unreadCount': '{n} unread',
  'notes.allRead': 'All read',
  'notes.unreadLabel': 'Unread',
  'notes.footnote':
    'Unread counts come straight from the API. Opening a conversation or an offer from here does not clear a notification on its own â€” use â€œMark all readâ€.',
  'notes.errMark': 'Notifications could not be marked read â€” try again.',
  'notes.justNow': 'just now',
  'notes.minutesAgo': '{n}m ago',
  'notes.hoursAgo': '{n}h ago',
  'notes.daysAgo': '{n}d ago',
  'notes.open': 'Open',

  'msg.title': 'Messages',
  'msg.subSupplier': 'Buyer enquiries on your stock. Opening a conversation marks it read.',
  'msg.subBuyer': 'Your conversations with suppliers. Opening a conversation marks it read.',
  'msg.signInSub': 'Sign in to see your conversations',
  'msg.notSignedIn': 'You are not signed in',
  'msg.notSignedInBody': 'Conversations are private to the two parties: sign in to read and reply.',
  'msg.loadErrorTitle': 'Conversations could not be loaded',
  'msg.loadErrorBody': 'The API did not return your threads â€” try again.',
  'msg.trying': 'Tryingâ€¦',
  'msg.emptyTitle': 'No conversations yet',
  'msg.emptySupplier': 'When a buyer asks about one of your lots, the conversation appears here.',
  'msg.emptyBuyer': 'Open a lot you are interested in and message the supplier â€” the conversation appears here.',
  'msg.browse': 'Browse ready stock',
  'msg.myListings': 'My listings',
  'msg.noMessagesYet': 'No messages yet',
  'msg.count': '{n} messages',
  'msg.pickTitle': 'Pick a conversation',
  'msg.pickBody': 'Its messages appear here.',
  'msg.threadLoadError': 'This conversation could not be loaded',
  'msg.threadLoadErrorBody': 'It may have been removed, or it is not open to your account â€” try again.',
  'msg.noLot': 'No lot attached',
  'msg.viewLot': 'View lot',
  'msg.emptyThreadTitle': 'No messages in this conversation yet',
  'msg.emptyThreadBody': 'Write the first one below.',
  'msg.messagePlaceholder': 'Message {name}â€¦',
  'msg.messageAria': 'Write a message',
  'msg.send': 'Send',
  'msg.sending': 'Sendingâ€¦',
  'msg.read': 'read',
  'msg.otherParty': 'the other party',
  'msg.errSend': 'The message could not be sent â€” try again.',
  'msg.justNow': 'just now',
  'msg.minutesAgo': '{n}m ago',
  'msg.hoursAgo': '{n}h ago',
  'msg.daysAgo': '{n}d ago',

  'verify.title': 'Verification',
  'verify.sub': 'File your documents, track the review decision, and see what buyers are told about it',
  'verify.signInSub': 'Documents buyers rely on before they commit money',
  'verify.notSignedIn': 'You are not signed in',
  'verify.notSignedInBody':
    'Verification documents belong to a supplier account and are never public in raw form. Sign in to file or refresh yours.',
  'verify.createSupplierAccount': 'Create a supplier account',
  'verify.supplierOnly': 'Supplier accounts only',
  'verify.supplierOnlyBody':
    'Your account is a {role} account, so there is no supplier checklist to complete.',
  'verify.seeSuppliers': 'See verified suppliers',
  'verify.approved': 'Documents approved',
  'verify.waiting': 'Waiting for a reviewer',
  'verify.actionNeeded': 'Missing or sent back',
  'verify.coreApproved': 'Core documents approved',
  'verify.confirmed': 'Confirmed',
  'verify.pending': 'Pending',
  'verify.yourDocs': 'Your documents',
  'verify.onFile': '{n} on file',
  'verify.loadErrorTitle': 'Documents could not be loaded',
  'verify.loadErrorBody':
    'Could not load your verification documents â€” try again. If this keeps failing, your account may not have a supplier profile yet.',
  'verify.emptyTitle': 'No documents on file',
  'verify.emptyBody':
    'Nothing has been filed yet, so no verification badge can be shown to buyers. Use the form to file your first document â€” start with {first}.',
  'verify.col.document': 'Document',
  'verify.col.status': 'Status',
  'verify.col.note': 'Reviewer note',
  'verify.col.reviewed': 'Reviewed',
  'verify.filed': 'filed {date}',
  'verify.reference': 'reference: {ref}',
  'verify.noReference': 'no reference given',
  'verify.resubmit': 'Resubmit',
  'verify.tierFootnote':
    'Only the documents the API returns for your supplier profile are listed here. Missing types simply have no row yet â€” filing one creates it.',
  'verify.fileTitle': 'File or refresh a document',
  'verify.docType': 'Document type',
  'verify.existingHintPre': 'You already have a row for {doc} â€” status',
  'verify.existingHintPost':
    '. Filing again overwrites it and clears the earlier decision, so an approved document would need re-approval.',
  'verify.refLabel': 'Reference / link to the document',
  'verify.refPlaceholder': 'https://â€¦/business-licence.pdf or your file reference',
  'verify.refHintLead': 'File upload is not built.',
  'verify.refHintTail':
    'Paste a link to the document, or a reference the review team can follow up on. It is stored as-is and is not shown publicly.',
  'verify.noteLabel': 'Note for the reviewer',
  'verify.notePlaceholder': 'What changed, why it is being refreshed, anything the reviewer should knowâ€¦',
  'verify.filing': 'Filingâ€¦',
  'verify.resubmitDoc': 'Resubmit {doc}',
  'verify.submitDoc': 'Submit {doc}',
  'verify.queueNoteLead': 'Submitting only puts the document in the queue.',
  'verify.queueNoteStrong': 'A badge appears for buyers when a reviewer approves it',
  'verify.queueNoteTail': 'â€” never on submission, and never automatically.',
  'verify.filedNotice':
    '{doc} filed. Status is now "submitted" and it is waiting in the review queue â€” a badge only appears for buyers once a reviewer approves it.',
  'verify.errFile': 'Could not file this document.',
  'verify.statusMeans': 'What each status means',
  'verify.tierTitle': 'Verification tier',
  'verify.tierAll': 'Verified Â· every core document approved',
  'verify.tierSome': 'Verified Â· documents approved',
  'verify.tierNone': 'Not verified yet',
  'verify.tierAllBody': 'Every core document type on this page has been approved by a reviewer.',
  'verify.tierSomeBody':
    'At least one document is approved{n}; the remaining core types would strengthen the profile.',
  'verify.tierNoneBody': 'No document has been approved yet, so buyers are shown no verification badge for your company.',
  'verify.tierHint':
    'The tier your account carries is set by the review team from the approved documents â€” this screen reports the document statuses the API returns and does not compute a tier number of its own. Buyers see a badge only for approved documents.',
  'verify.suggested': 'Suggested next:',
  'verify.select': 'Select',
  'verify.othersNote':
    'Buyers also see other suppliersâ€™ ratings and inspection counts on their profiles. Those figures are seeded marketplace data, not something this checklist produces â€” this page deliberately shows none of them.',
  'verify.help.missing.title': 'Not filed',
  'verify.help.missing.state': 'Nothing filed yet, or the document was never submitted.',
  'verify.help.submitted.title': 'Awaiting review',
  'verify.help.submitted.state': 'Filed and waiting in the review queue. No badge is shown to buyers yet.',
  'verify.help.approved.title': 'Approved',
  'verify.help.approved.state': 'A reviewer checked it against the document itself. This is what buyers see.',
  'verify.help.rejected.title': 'Sent back',
  'verify.help.rejected.state': 'Rejected with a note. Fix the document and submit it again.',
  'verify.doc.businessLicence': 'Business Licence',
  'verify.doc.taxCertificate': 'Tax Certificate',
  'verify.doc.factoryAudit': 'Factory Audit Report',
  'verify.doc.productCert': 'Product Certification',
  'verify.doc.exportLicence': 'Export Licence',
};

/** Every valid translation key. */
export type DictKey = keyof Dict;

/* ============================ translations ============================== */

const tr: Partial<Record<DictKey, string>> = {
  'status.open': 'AÃ§Ä±k',
  'status.quoted': 'Teklif verildi',
  'status.closed': 'KapalÄ±',
  'status.submitted': 'GÃ¶nderildi',
  'status.accepted': 'Kabul edildi',
  'status.rejected': 'Reddedildi',
  'status.active': 'Aktif',
  'status.sold_out': 'TÃ¼kendi',
  'status.scheduled': 'PlanlandÄ±',
  'status.in_progress': 'SÃ¼rÃ¼yor',
  'status.passed': 'GeÃ§ti',
  'status.failed': 'BaÅŸarÄ±sÄ±z',
  'status.pending': 'Beklemede',
  'status.paid': 'Ã–dendi',
  'status.shipped': 'Sevk edildi',
  'status.delivered': 'Teslim edildi',
  'status.cancelled': 'Ä°ptal edildi',
  'status.missing': 'DosyalanmadÄ±',
  'status.approved': 'OnaylandÄ±',
  'status.countered': 'KarÅŸÄ± teklif verildi',
  'status.withdrawn': 'Geri Ã§ekildi',
  'status.inspecting': 'Denetim sÃ¼rÃ¼yor',

  'action.close': 'Kapat',
  'action.cancel': 'VazgeÃ§',
  'action.dismiss': 'Kapat',
  'action.refresh': 'Yenile',
  'action.refreshing': 'Yenileniyorâ€¦',
  'action.tryAgain': 'Yeniden dene',
  'action.clear': 'Temizle',
  'action.clearFilters': 'Filtreleri temizle',
  'action.search': 'Ara',
  'action.save': 'DeÄŸiÅŸiklikleri kaydet',
  'action.discard': 'VazgeÃ§',
  'action.signIn': 'GiriÅŸ yap',
  'action.signOut': 'Ã‡Ä±kÄ±ÅŸ yap',
  'action.signingIn': 'GiriÅŸ yapÄ±lÄ±yorâ€¦',
  'action.joinFree': 'Ãœcretsiz katÄ±l',
  'action.createAccount': 'Hesap oluÅŸtur',
  'action.creatingAccount': 'Hesap oluÅŸturuluyorâ€¦',
  'action.backToExplore': 'KeÅŸfete dÃ¶n',
  'action.open': 'AÃ§',
  'action.edit': 'DÃ¼zenle',
  'action.delete': 'Sil',

  'common.loading': 'YÃ¼kleniyorâ€¦',
  'common.loadingEllipsis': 'YÃ¼kleniyorâ€¦',
  'common.notSet': 'Belirtilmedi',
  'common.optional': 'Ä°steÄŸe baÄŸlÄ±',
  'common.required': 'zorunlu',
  'common.newestFirst': 'Ã–nce en yeni',
  'common.anyCountry': 'TÃ¼m Ã¼lkeler',
  'common.allCountries': 'TÃ¼m Ã¼lkeler',
  'common.verified': 'DoÄŸrulanmÄ±ÅŸ',
  'common.tradeAbbrev':
    'RFQ = teklif talebi Â· MOQ = minimum sipariÅŸ miktarÄ± Â· FOB = gemide teslim Â· TT = banka havalesi',

  'nav.feed': 'AkÄ±ÅŸ',
  'nav.explore': 'KeÅŸfet',
  'nav.exploreStock': 'StoklarÄ± keÅŸfet',
  'nav.offersBuyer': 'Tekliflerim',
  'nav.rfqs': 'Teklif taleplerim',
  'nav.orders': 'SipariÅŸler',
  'nav.shipments': 'Sevkiyatlar',
  'nav.messages': 'Mesajlar',
  'nav.saved': 'Kaydedilenler',
  'nav.savedLots': 'Kaydedilen lotlar',
  'nav.notifications': 'Bildirimler',
  'nav.help': 'YardÄ±m merkezi',
  'nav.helpCentre': 'YardÄ±m merkezi',
  'nav.howItWorks': 'NasÄ±l Ã§alÄ±ÅŸÄ±r',
  'nav.profile': 'Profil',
  'nav.listings': 'Ä°lanlarÄ±m',
  'nav.post': 'Stok yayÄ±nla',
  'nav.postStock': 'Stok yayÄ±nla',
  'nav.offersSup': 'Teklifler',
  'nav.rfqOpps': 'Teklif talebi fÄ±rsatlarÄ±',
  'nav.verification': 'DoÄŸrulama',
  'nav.suppliers': 'TedarikÃ§iler',
  'nav.overview': 'Genel bakÄ±ÅŸ',
  'nav.adminSuppliers': 'TedarikÃ§iler',
  'nav.adminVerify': 'DoÄŸrulama masasÄ±',
  'nav.adminListings': 'Ä°lanlar',
  'nav.adminRfqs': 'Teklif talepleri',
  'nav.adminPayments': 'Ã–demeler',
  'nav.sources': 'Tedarik kaynaklarÄ±',
  'nav.growth': 'Banner ve promosyonlar',
  'nav.features': 'Ã–zellikler',

  'topbar.searchPlaceholder': 'ÃœrÃ¼n, tedarikÃ§i, kategori araâ€¦',
  'topbar.searchAria': 'Pazar yerinde ara',
  'topbar.notifications': 'Bildirimler',
  'topbar.createAccountTitle': 'Hesap oluÅŸtur',
  'topbar.account': 'Hesap',
  'topbar.languageAria': 'ArayÃ¼z dili',
  'rail.allIndustries': 'TÃ¼m sektÃ¶rler',
  'rail.howItWorks': 'NasÄ±l Ã§alÄ±ÅŸÄ±r',
  'sidebar.moreIndustries': 'Daha fazla sektÃ¶r. Daha fazla Ã¼lke.',
  'sidebar.moreIndustriesSub': 'HazÄ±r stok iÃ§in tek pazar yeri.',

  'gate.title': 'Ãœye eriÅŸimi',
  'gate.body':
    'TedarikÃ§ilerle iletiÅŸim, talep yayÄ±nlama ve teklif verme Ã¼yelere Ã¶zeldir. Pazar yerini gezmek herkese aÃ§Ä±k ve Ã¼cretsizdir.',
  'gate.createAccount': 'Ãœcretsiz hesap oluÅŸtur',
  'gate.haveAccount': 'HesabÄ±m var',

  'cards.noPhoto': 'fotoÄŸraf yok',
  'cards.moq': 'MOQ',
  'cards.saveLot': 'Bu lotu kaydet',
  'cards.demo': 'Demo',
  'cards.demoTitle': 'Ã–rnek veri â€” gerÃ§ek bir teklif deÄŸil',
  'cards.inspections': 'denetim',

  'auth.signIn.sub': 'SipariÅŸlerinize, tekliflerinize ve teklif taleplerinize eriÅŸin.',
  'auth.email': 'E-posta',
  'auth.password': 'Åifre',
  'auth.signInCta': 'GiriÅŸ yap',
  'auth.newHere': 'Yeni misiniz?',
  'auth.demoNotice': 'Demo uyarÄ±sÄ±',
  'auth.seededLogin': 'Ã–rnek inceleme hesabÄ±',
  'auth.fillIn': 'Doldur',
  'auth.demoHintLead': 'hazÄ±r bir',
  'auth.demoHintLead2': 'demo',
  'auth.demoHintTail':
    'hesabÄ±dÄ±r ve yÃ¶netim konsolunu incelemek iÃ§indir. GerÃ§ek bir satÄ±cÄ± deÄŸildir â€” gerÃ§ek bilgilerinizi girmeyin.',
  'auth.demoHintProduct': 'yÃ¶netici',
  'auth.signInFailed': 'GiriÅŸ baÅŸarÄ±sÄ±z',
  'auth.signUp.title': 'Hesap oluÅŸtur',
  'auth.signUp.sub': 'SatÄ±n almak, satmak veya denetim ve lojistik hizmeti vermek iÃ§in tek hesap.',
  'auth.fullName': 'Ad soyad',
  'auth.workEmail': 'Ä°ÅŸ e-postasÄ±',
  'auth.minChars': 'En az 8 karakter',
  'auth.atLeast8': 'En az 8 karakter.',
  'auth.iAmA': 'RolÃ¼mâ€¦',
  'auth.company': 'Åirket',
  'auth.country': 'Ãœlke',
  'auth.countryHint': 'TÃ¼rkiye, Ã‡inâ€¦',
  'auth.createCta': 'Hesap oluÅŸtur',
  'auth.alreadyRegistered': 'Zaten Ã¼ye misiniz?',
  'auth.signUpHint': 'Ä°lan vermek Ã¼cretsizdir. GÃ¼ven rozetleri doÄŸrulama, denetim ve teslimat geÃ§miÅŸiyle kazanÄ±lÄ±r.',
  'auth.registerFailed': 'KayÄ±t baÅŸarÄ±sÄ±z',
  'auth.role.buyer': 'AlÄ±cÄ±',
  'auth.role.buyerHint': 'ÃœrÃ¼n tedarik ediyorum',
  'auth.role.supplier': 'TedarikÃ§i',
  'auth.role.supplierHint': 'SatÄ±yor / Ã¼retiyorum',
  'auth.role.inspector': 'DenetÃ§i',
  'auth.role.inspectorHint': 'FabrikalarÄ± denetliyorum',
  'auth.role.lab': 'Laboratuvar',
  'auth.role.labHint': 'Malzeme testi yapÄ±yorum',
  'auth.role.logistics': 'Lojistik',
  'auth.role.logisticsHint': 'YÃ¼k taÅŸÄ±yorum',

  'profile.title': 'Profil',
  'profile.sub': 'Tekliflerinizde, sipariÅŸlerinizde ve mesajlarÄ±nÄ±zda karÅŸÄ± tarafÄ±n gÃ¶rdÃ¼ÄŸÃ¼ bilgiler.',
  'profile.signInSub': 'HesabÄ±nÄ±zÄ± yÃ¶netmek iÃ§in giriÅŸ yapÄ±n',
  'profile.notSignedIn': 'GiriÅŸ yapmadÄ±nÄ±z',
  'profile.notSignedInBody': 'Profiliniz hesabÄ±nÄ±za Ã¶zeldir: gÃ¶rÃ¼ntÃ¼lemek ve dÃ¼zenlemek iÃ§in giriÅŸ yapÄ±n.',
  'profile.createAccount': 'Hesap oluÅŸtur',
  'profile.accountDetails': 'Hesap bilgileri',
  'profile.unsaved': 'KaydedilmemiÅŸ deÄŸiÅŸiklikler',
  'profile.fullName': 'Ad soyad',
  'profile.company': 'Åirket',
  'profile.notSet': 'Belirtilmedi',
  'profile.country': 'Ãœlke',
  'profile.language': 'ArayÃ¼z dili',
  'profile.languageHint':
    'ArayÃ¼zÃ¼n dilini hemen deÄŸiÅŸtirir ve DeÄŸiÅŸiklikleri kaydet dediÄŸinizde hesabÄ±nÄ±za kaydedilir.',
  'profile.save': 'DeÄŸiÅŸiklikleri kaydet',
  'profile.saving': 'Kaydediliyorâ€¦',
  'profile.saved': 'Kaydedildi',
  'profile.savedBody': 'Profiliniz gÃ¼ncellendi.',
  'profile.identity': 'Kimlik',
  'profile.identityNote':
    'E-posta ve rol burada dÃ¼zenlenemez. Hesap oluÅŸturulurken sabitlenir ve profil APIâ€™si bu alanlarÄ± kabul etmez.',
  'profile.email': 'E-posta',
  'profile.role': 'Rol',
  'profile.readOnly': 'Salt okunur',
  'profile.readOnlyEmail': 'Salt okunur â€” profil APIâ€™si e-posta kabul etmez',
  'profile.readOnlyRole': 'Salt okunur â€” profil APIâ€™si rol kabul etmez',
  'profile.emailStatus': 'E-posta durumu',
  'profile.emailVerified': 'E-posta doÄŸrulandÄ±',
  'profile.emailNotVerified': 'E-posta doÄŸrulanmadÄ±',
  'profile.memberSince': 'Ãœyelik baÅŸlangÄ±cÄ±',
  'profile.accountLine': 'Hesap #{id} Â· {role} olarak giriÅŸ yapÄ±ldÄ±',
  'profile.errName': 'AdÄ±nÄ±zÄ± girin â€” API boÅŸ adÄ± reddeder.',
  'profile.errSave': 'Profil kaydedilemedi â€” yeniden deneyin.',

  'explore.title': 'StoklarÄ± keÅŸfet',
  'explore.subLoading': 'CanlÄ± lotlar yÃ¼kleniyorâ€¦',
  'explore.subCount': 'Filtrelerinize uyan {n} ilan',
  'explore.searchPlaceholder': 'BakÄ±r katot, pompalarâ€¦',
  'explore.searchAria': 'Ä°lanlarda ara',
  'explore.categoryAria': 'Kategori',
  'explore.allCategories': 'TÃ¼m kategoriler',
  'explore.originAria': 'MenÅŸe Ã¼lke',
  'explore.allCountries': 'TÃ¼m Ã¼lkeler',
  'explore.min': 'Min $',
  'explore.max': 'Maks $',
  'explore.emptyTitle': 'Bu filtrelerle eÅŸleÅŸen ilan yok',
  'explore.emptyBody': 'Daha geniÅŸ bir kategori, farklÄ± bir menÅŸe Ã¼lke deneyin veya filtreleri temizleyin.',
  'explore.page': 'Sayfa {page} / {pages}',
  'explore.prev': 'â† Ã–nceki',
  'explore.next': 'Sonraki â†’',

  'feed.welcomeBack': 'Tekrar hoÅŸ geldiniz, {name}',
  'feed.title': 'Pazar yeri akÄ±ÅŸÄ±',
  'feed.sub': 'DoÄŸrulanmÄ±ÅŸ fabrikalardan hazÄ±r stok, artÄ±k ve fazla lotlar â€” en yeniler Ã¶nce.',
  'feed.sellStock': 'Stok sat',
  'feed.postRequest': 'Talep yayÄ±nla',
  'feed.lotsCount': '{n} lot',
  'feed.lotsMatch': 'lot filtrelerinizle eÅŸleÅŸiyor',
  'feed.verifiedSuppliers': 'doÄŸrulanmÄ±ÅŸ tedarikÃ§i',
  'feed.openRequests': 'aÃ§Ä±k talep',
  'feed.allOrigins': 'TÃ¼m menÅŸeler',
  'feed.searchAria': 'Lotlarda ara',
  'feed.minAria': 'Minimum fiyat',
  'feed.maxAria': 'Maksimum fiyat',
  'feed.allIndustries': 'TÃ¼m sektÃ¶rler',
  'feed.noLots': 'Lot yok',
  'feed.shownRange': '{total} kayÄ±ttan {first}â€“{last}',
  'feed.emptyTitle': 'Bu filtrelerle eÅŸleÅŸen lot yok',
  'feed.emptyBody': 'FarklÄ± bir sektÃ¶r, baÅŸka bir menÅŸe Ã¼lke deneyin veya filtreleri temizleyin.',
  'feed.lookingFor': 'Belirli bir ÅŸey mi arÄ±yorsunuz?',
  'feed.postRequestLink': 'Talep yayÄ±nlayÄ±n',
  'feed.lookingForTail': 've doÄŸrulanmÄ±ÅŸ fabrikalar size teklif versin.',
  'feed.sellingInstead': 'Satmak mÄ± istiyorsunuz?',
  'feed.listYourStock': 'StoÄŸunuzu listeleyin',
  'feed.signedInAs': '{role} olarak giriÅŸ yapÄ±ldÄ±',
  'feed.createFree': 'Ã¼cretsiz hesap oluÅŸturun',

  'help.title': 'FactoryDepo nasÄ±l Ã§alÄ±ÅŸÄ±r',
  'help.sub': 'HazÄ±r stok, teklif talepleri ve denetim destekli tedarik.',
  'help.buying': 'SatÄ±n alma',
  'help.buying1.title': '1. HazÄ±r stoÄŸa gÃ¶z atÄ±n.',
  'help.buying1':
    'Her canlÄ± lot fiyatÄ±nÄ±, minimum sipariÅŸ miktarÄ±nÄ±, menÅŸe Ã¼lkeyi ve gerÃ§ekten ne kadar mevcut olduÄŸunu gÃ¶sterir. Demo etiketli ilanlar Ã¶rnek veridir â€” gerÃ§ek teklif deÄŸildir â€” ve yanÄ±lmamanÄ±z iÃ§in iÅŸaretlenmiÅŸtir.',
  'help.buying2.title': '2. Teklif isteyin.',
  'help.buying2':
    'Ä°htiyacÄ±nÄ±zÄ± anlatan bir talep yayÄ±nlayÄ±n. TedarikÃ§iler fiyat, termin ve kendi koÅŸullarÄ±yla teklif verir.',
  'help.buying3.title': '3. KarÅŸÄ±laÅŸtÄ±rÄ±n ve baÄŸlanÄ±n.',
  'help.buying3': 'Teklifler talep Ã¼zerinde yan yana gÃ¶rÃ¼nÃ¼r. Birini kabul etmek sipariÅŸ oluÅŸturur.',
  'help.buying4.title': '4. Banka havalesiyle Ã¶deyin.',
  'help.buying4':
    'EndÃ¼striyel ticaret kartla yÃ¼rÃ¼mez. Proforma fatura alÄ±rsÄ±nÄ±z, TT/havale ile Ã¶dersiniz ve Ã¶deme onaylandÄ±ÄŸÄ±nda sipariÅŸ Ã¶dendi olarak iÅŸaretlenir.',
  'help.selling': 'SatÄ±ÅŸ',
  'help.selling1.title': '1. TedarikÃ§i hesabÄ± oluÅŸturun.',
  'help.selling1': 'TedarikÃ§i olarak kaydolmak ÅŸirket profilinizi hemen oluÅŸturur.',
  'help.selling2.title': '2. StoÄŸunuzu yayÄ±nlayÄ±n.',
  'help.selling2':
    'Ä°lan araÃ§larÄ± ÅŸu anda geliÅŸtiriliyor â€” yayÄ±na alÄ±nana kadar tedarikÃ§i ilanlarÄ± ekibimiz tarafÄ±ndan eklenir.',
  'help.selling3.title': '3. Gelen taleplere teklif verin.',
  'help.selling3':
    'AÃ§Ä±k alÄ±cÄ± talepleri panelinizde, yanÄ±tlamadÄ±klarÄ±nÄ±zÄ±n canlÄ± sayÄ±sÄ±yla gÃ¶rÃ¼nÃ¼r.',
  'help.selling4.title': '4. DoÄŸrulanÄ±n.',
  'help.selling4':
    'DoÄŸrulama seviyeleri gÃ¶rÃ¼nÃ¼rlÃ¼k aÃ§ar. Rozetler yalnÄ±zca belgeler onaylandÄ±ÄŸÄ±nda verilir, yani buradaki bir rozet bir anlam taÅŸÄ±r.',
  'help.notLive': 'HenÃ¼z yayÄ±nda olmayanlar',
  'help.notLiveLead': 'BunlarÄ± siz keÅŸfetmeden Ã¶nce aÃ§Ä±kÃ§a sÃ¶ylemeyi tercih ederiz:',
  'help.notLive1': 'TedarikÃ§i self-servis ilan araÃ§larÄ± geliÅŸtiriliyor.',
  'help.notLive2': 'AlÄ±cÄ± â†” tedarikÃ§i mesajlaÅŸmasÄ± henÃ¼z yok â€” tedarikÃ§i profilindeki iletiÅŸim bilgilerini kullanÄ±n.',
  'help.notLive3': 'Teklifler ve karÅŸÄ± teklifler ÅŸu an elle yÃ¼rÃ¼tÃ¼lÃ¼yor.',
  'help.notLive4': 'Sevkiyat takibi ve belge yÃ¶netimi henÃ¼z yok.',
  'help.exploreCta': 'StoklarÄ± keÅŸfet',
  'help.rfqCta': 'Teklif talepleri',

  'soon.sub': 'HenÃ¼z yapÄ±lmadÄ±',
  'soon.title': 'Bu ekran sonraki geliÅŸtirme aÅŸamasÄ±nda',
  'soon.body': 'Ekran navigasyonda var, ancak veri tablolarÄ± ve API uÃ§ noktalarÄ± henÃ¼z yapÄ±lmadÄ±.',
  'soon.note.offers': 'Teklifler ve karÅŸÄ± teklifler tablosu sonraki geliÅŸtirme aÅŸamasÄ±nda geliyor.',
  'soon.note.shipments': 'Sevkiyat aÅŸamalarÄ± ve belgeleri sonraki geliÅŸtirme aÅŸamasÄ±nda geliyor.',
  'soon.note.messages': 'AlÄ±cÄ± â†” tedarikÃ§i mesajlaÅŸmasÄ± sonraki geliÅŸtirme aÅŸamasÄ±nda geliyor.',
  'soon.note.saved': 'Kaydedilen lotlar sonraki geliÅŸtirme aÅŸamasÄ±nda geliyor.',
  'soon.note.notifications': 'Bildirim merkezi sonraki geliÅŸtirme aÅŸamasÄ±nda geliyor.',
  'soon.note.profile': 'Profil dÃ¼zenleme sonraki geliÅŸtirme aÅŸamasÄ±nda geliyor.',
  'soon.note.listings': 'Sahiplik kontrollÃ¼ tedarikÃ§i ilan yÃ¶netimi sonraki geliÅŸtirme aÅŸamasÄ±nda geliyor.',
  'soon.note.post': 'GÃ¶rsel yÃ¼klemeli ilan oluÅŸturma/dÃ¼zenleme sonraki geliÅŸtirme aÅŸamasÄ±nda geliyor.',
  'soon.note.generic': 'Sonraki geliÅŸtirme aÅŸamasÄ±nda geliyor.',
  'soon.note.verification': 'DoÄŸrulama seviyeleri ve belge gÃ¶nderimi sonraki geliÅŸtirme aÅŸamasÄ±nda geliyor.',
  'soon.note.admin': 'YÃ¶netim konsolu sonraki geliÅŸtirme aÅŸamasÄ±nda geliyor.',
  'soon.note.sources': 'Elle tedarikÃ§i kaydÄ± sonraki geliÅŸtirme aÅŸamasÄ±nda geliyor.',
  'soon.note.features': 'Ã–zellik anahtarlarÄ± sonraki geliÅŸtirme aÅŸamasÄ±nda geliyor.',

  'orders.title': 'SipariÅŸler',
  'orders.signInSub': 'Taraf olduÄŸunuz sipariÅŸleri gÃ¶rmek iÃ§in giriÅŸ yapÄ±n',
  'orders.notSignedIn': 'GiriÅŸ yapmadÄ±nÄ±z',
  'orders.notSignedInBody': 'SipariÅŸler gizlidir: almayÄ± veya satmayÄ± taahhÃ¼t ettiklerinizi gÃ¶rmek iÃ§in giriÅŸ yapÄ±n.',
  'orders.createAccount': 'Hesap oluÅŸtur',
  'orders.subSupplier': 'AlÄ±cÄ±larÄ±n stoÄŸunuzdan verdiÄŸi sipariÅŸler',
  'orders.subBuyer': 'SatÄ±n almayÄ± taahhÃ¼t ettiÄŸiniz her ÅŸey',
  'orders.statListings': 'Ä°lanlarÄ±m',
  'orders.statOffersReceived': 'AlÄ±nan teklifler',
  'orders.statOffersOnRfqs': 'Taleplerimdeki teklifler',
  'orders.statOrders': 'SipariÅŸler',
  'orders.statSoldItems': 'SatÄ±lan kalemler',
  'orders.statSoldTitle': 'Sevk edilmiÅŸ veya teslim edilmiÅŸ sipariÅŸler',
  'orders.statViews': 'GÃ¶rÃ¼ntÃ¼leme',
  'orders.statViewsTitle': 'KapsamÄ±nÄ±zdaki ilanlarda kaydedilen gÃ¶rÃ¼ntÃ¼lemeler',
  'orders.metricsError': 'Ã–lÃ§Ã¼mler ÅŸu anda yÃ¼klenemedi.',
  'orders.loadErrorTitle': 'SipariÅŸler yÃ¼klenemedi',
  'orders.loadErrorBody': 'API sipariÅŸlerinizi dÃ¶ndÃ¼rmedi. SayfayÄ± yenileyin veya tekrar giriÅŸ yapÄ±n.',
  'orders.emptyTitle': 'HenÃ¼z sipariÅŸ yok',
  'orders.emptySupplier': 'Bir alÄ±cÄ± stoÄŸunuzdan sipariÅŸ verdiÄŸinde burada gÃ¶rÃ¼nÃ¼r.',
  'orders.emptyBuyer': 'HazÄ±r stokta verdiÄŸiniz hemen al sipariÅŸleri burada gÃ¶rÃ¼nÃ¼r.',
  'orders.browseStock': 'HazÄ±r stoÄŸa gÃ¶z at',
  'orders.postRfq': 'Teklif talebi yayÄ±nla',
  'orders.count': '{n} sipariÅŸ',
  'orders.col.order': 'SipariÅŸ',
  'orders.col.product': 'ÃœrÃ¼n',
  'orders.col.counterparty': 'KarÅŸÄ± taraf',
  'orders.col.qty': 'Miktar',
  'orders.col.total': 'Toplam',
  'orders.col.status': 'Durum',
  'orders.col.date': 'Tarih',
  'orders.buyerLabel': 'alÄ±cÄ±',
  'orders.supplierLabel': 'tedarikÃ§i',
  'orders.buyerId': 'AlÄ±cÄ± #{id}',

  'product.loadingTitle': 'YÃ¼kleniyorâ€¦',
  'product.loadingThis': 'bu ilan',
  'product.fetching': '{what} getiriliyorâ€¦',
  'product.notFound': 'ÃœrÃ¼n bulunamadÄ±',
  'product.backToExplore': 'KeÅŸfete dÃ¶n',
  'product.noPhoto': 'Bu lot iÃ§in fotoÄŸraf verilmedi',
  'product.pricePer': 'Fiyat / {unit}',
  'product.minOrder': 'Minimum sipariÅŸ',
  'product.availableNow': 'Åu anda mevcut',
  'product.origin': 'MenÅŸe Ã¼lke',
  'product.unavailable': 'Åu anda mevcut deÄŸil',
  'product.buyNowHeading': 'Hemen al â€” hazÄ±r stok',
  'product.soldOutBody': 'Bu lot tÃ¼kendi olarak iÅŸaretli. TedarikÃ§iden sÄ±radaki partiyi isteyin.',
  'product.noUnitsBody': 'Åu anda hiÃ§ birim yok. TedarikÃ§iden sÄ±radaki partiyi isteyin.',
  'product.purchaseTerms': 'Liste fiyatÄ± {price} / {unit}, minimum {moq} {unit} Ã¼zerinden satÄ±n alÄ±n.',
  'product.stockOnHand': 'Eldeki stok',
  'product.buyNowPrice': 'Hemen al Â· {price}/{unit}',
  'product.outOfStock': 'Hemen al â€” stok yok',
  'product.requestQuote': 'Teklif isteyin',
  'product.shipsFrom': '{country} Ã§Ä±kÄ±ÅŸlÄ±',
  'product.signInToOrder': 'SipariÅŸ vermek veya teklif istemek iÃ§in giriÅŸ yapÄ±n.',
  'product.supplier': 'TedarikÃ§i',
  'product.viewProfile': 'Profili gÃ¶r',
  'product.loadingSupplier': 'TedarikÃ§i yÃ¼kleniyorâ€¦',
  'product.supplierUnavailable': 'TedarikÃ§i bilgileri mevcut deÄŸil.',
  'product.rating': 'Puan',
  'product.inspections': 'Denetimler',
  'product.fulfilment': 'ZamanÄ±nda teslim',
  'product.verifiedLevel': 'DoÄŸrulama seviyesi',
  'product.levelN': 'Seviye {n}',
  'product.tradingSince': 'Faaliyet yÄ±lÄ±',
  'product.supplierFiguresHint': 'Bu rakamlar yalnÄ±zca bu lot iÃ§in deÄŸil, tedarikÃ§inin tÃ¼m pazar yeri performansÄ±dÄ±r.',
  'product.description': 'AÃ§Ä±klama',
  'product.noDescription':
    'TedarikÃ§i aÃ§Ä±klama eklememiÅŸ. Ã–zellikler, termin ve teslim koÅŸullarÄ± iÃ§in teklif isteyin.',
  'product.specification': 'Teknik Ã¶zellikler',
  'product.noSpec': 'Bu lot iÃ§in teknik Ã¶zellik kaydÄ± yok.',
  'product.col.attribute': 'Ã–zellik',
  'product.col.value': 'DeÄŸer',
  'product.spec.category': 'Kategori',
  'product.spec.unit': 'Birim',
  'product.spec.purity': 'SaflÄ±k / kalite',

  'checkout.title': 'Hemen al â€” Ã¶deme',
  'checkout.placedTitle': 'SipariÅŸ verildi',
  'checkout.confirmed': 'SipariÅŸ #{id} onaylandÄ±',
  'checkout.notified': 'TedarikÃ§i bilgilendirildi. SipariÅŸi sipariÅŸler sayfanÄ±zdan takip edin.',
  'checkout.viewOrders': 'SipariÅŸleri gÃ¶r',
  'checkout.keepBrowsing': 'Gezmeye devam et',
  'checkout.pricePer': 'Fiyat / {unit}',
  'checkout.minimumOrder': 'Minimum sipariÅŸ',
  'checkout.availableNow': 'Åu anda mevcut',
  'checkout.quantity': 'Miktar ({unit})',
  'checkout.qtyHint': 'Stokta {moq} ile {stock} {unit} arasÄ±nda.',
  'checkout.fullName': 'Ad soyad',
  'checkout.country': 'Ãœlke',
  'checkout.address': 'AÃ§Ä±k adres',
  'checkout.city': 'Åehir',
  'checkout.phone': 'Telefon',
  'checkout.notes': 'TedarikÃ§iye notlar',
  'checkout.total': 'Toplam {total}',
  'checkout.placeOrder': 'SipariÅŸ ver Â· {total}',
  'checkout.placing': 'SipariÅŸ veriliyorâ€¦',
  'checkout.errPlace': 'SipariÅŸ verilemedi.',

  'rfqModal.title': 'Teklif isteyin',
  'rfqModal.postedTitle': 'Talep yayÄ±nlandÄ±',
  'rfqModal.live': 'Ä°htiyacÄ±nÄ±z teklif talebi borsasÄ±nda yayÄ±nda',
  'rfqModal.canQuote': 'DoÄŸrulanmÄ±ÅŸ tedarikÃ§iler artÄ±k fiyat ve termin teklifi verebilir.',
  'rfqModal.viewMine': 'Teklif taleplerimi gÃ¶r',
  'rfqModal.listedBy': '{product} Â· ilan sahibi {supplier}',
  'rfqModal.quantity': 'Miktar',
  'rfqModal.unit': 'Birim',
  'rfqModal.specs': 'Ã–zellikler, sertifikalar, teslim koÅŸullarÄ±',
  'rfqModal.moqHint': 'Ä°lanÄ±n MOQ deÄŸeri {moq} {unit}.',
  'rfqModal.post': 'Talep yayÄ±nla',
  'rfqModal.posting': 'YayÄ±nlanÄ±yorâ€¦',
  'rfqModal.errPost': 'Talep yayÄ±nlanamadÄ±.',
  'rfqModal.titleSuffix': 'teklif talebi',

  'suppliers.loadingSub': 'TedarikÃ§i dizini getiriliyor',
  'suppliers.loadingBody': 'TedarikÃ§i dizini getiriliyorâ€¦',
  'suppliers.title': 'TedarikÃ§i dizini',
  'suppliers.sub':
    'FactoryDepoâ€™daki fabrikalar ve ticaret evleri. DoÄŸrulama seviyeleri yerinde denetim ve belge kontrolÃ¼nden gelir.',
  'suppliers.demoNote': 'demo iÅŸaretli satÄ±rlar Ã¶rnek veridir',
  'suppliers.loadErrorTitle': 'Dizin yÃ¼klenemedi',
  'suppliers.loadErrorBody': 'TedarikÃ§i servisi yanÄ±t vermedi. Birazdan tekrar deneyin.',
  'suppliers.emptyTitle': 'HenÃ¼z tedarikÃ§i yok',
  'suppliers.emptyBody': 'TedarikÃ§i profilleri kaydedilip doÄŸrulandÄ±ktan sonra burada gÃ¶rÃ¼nÃ¼r.',
  'suppliers.totalListed': 'Listelenen tedarikÃ§i',
  'suppliers.totalVerified': 'Seviye 2+ doÄŸrulanmÄ±ÅŸ',
  'suppliers.avgRating': 'Ortalama puan',
  'suppliers.avgRatingRated': 'Ortalama puan ({n} puanlanmÄ±ÅŸ)',
  'suppliers.avgFulfilment': 'ZamanÄ±nda teslim',
  'suppliers.avgFulfilmentMeasured': 'ZamanÄ±nda teslim ({n} Ã¶lÃ§Ã¼lmÃ¼ÅŸ)',
  'suppliers.searchPlaceholder': 'Åirket, Ã¼lke, ÅŸehir, yetkinlikâ€¦',
  'suppliers.searchAria': 'TedarikÃ§i ara',
  'suppliers.verifiedOnly': 'YalnÄ±zca doÄŸrulanmÄ±ÅŸ',
  'suppliers.showing': '{total} kayÄ±ttan {shown} gÃ¶steriliyor',
  'suppliers.noMatchTitle': 'Bu aramayla eÅŸleÅŸen tedarikÃ§i yok',
  'suppliers.noMatchBody': 'Daha kÄ±sa bir ÅŸirket adÄ± deneyin veya doÄŸrulama filtresini kaldÄ±rÄ±n.',
  'suppliers.rating': 'Puan',
  'suppliers.inspections': 'Denetim',
  'suppliers.fulfilment': 'Teslim performansÄ±',

  'supplierDetail.loadingThis': 'bu tedarikÃ§i profili',
  'supplierDetail.notFound': 'TedarikÃ§i bulunamadÄ±',
  'supplierDetail.backToDirectory': 'Dizine dÃ¶n',
  'supplierDetail.backShort': 'â† Dizine dÃ¶n',
  'supplierDetail.tradingSince': '{year} yÄ±lÄ±ndan beri faaliyette',
  'supplierDetail.verifiedL3': 'DoÄŸrulanmÄ±ÅŸ Â· seviye 3',
  'supplierDetail.registered': 'KayÄ±tlÄ±',
  'supplierDetail.buyerRating': 'AlÄ±cÄ± puanÄ±',
  'supplierDetail.notRated': 'henÃ¼z puanlanmadÄ±',
  'supplierDetail.inspections': 'Yerinde denetim',
  'supplierDetail.fulfilment': 'ZamanÄ±nda teslim',
  'supplierDetail.activeListings': 'Aktif ilanlar',
  'supplierDetail.tier': 'DoÄŸrulama seviyesi',
  'supplierDetail.trustScore': 'GÃ¼ven puanÄ± (0â€“100)',
  'supplierDetail.about': '{company} hakkÄ±nda',
  'supplierDetail.noDescription': 'Bu tedarikÃ§i henÃ¼z bir ÅŸirket aÃ§Ä±klamasÄ± yayÄ±nlamadÄ±.',
  'supplierDetail.capabilities': 'Beyan edilen yetkinlikler',
  'supplierDetail.record': 'DoÄŸrulama ve geÃ§miÅŸ',
  'supplierDetail.ratingLabel': 'AlÄ±cÄ± puanÄ±',
  'supplierDetail.inspectionsDone': 'Tamamlanan denetimler',
  'supplierDetail.contact': 'Ä°letiÅŸim',
  'supplierDetail.contactBody': 'Denetim raporlarÄ± ve doÄŸrulama belgeleri ilk temastan sonra Ã¼yelerle paylaÅŸÄ±lÄ±r.',
  'supplierDetail.contactSupplier': 'TedarikÃ§iyle iletiÅŸime geÃ§',
  'supplierDetail.contactHintSignedIn': 'Teklif talebi borsasÄ±nÄ± aÃ§ar â€” teklif yazÄ±ÅŸmasÄ± orada yÃ¼rÃ¼r.',
  'supplierDetail.contactHintGuest': 'YalnÄ±zca Ã¼yeler Â· Ã¼yelik Ã¼cretsiz',
  'supplierDetail.services': 'Ticaret hizmetleri',
  'supplierDetail.service1': 'Ã–deme Ã¶ncesi fabrika denetimi',
  'supplierDetail.service2': 'Laboratuvar testi ve malzeme analizi',
  'supplierDetail.service3': 'Konteyner yÃ¼kleme gÃ¶zetimi',
  'supplierDetail.service4': 'Ä°hracat evrak desteÄŸi',
  'supplierDetail.stockFrom': '{company} stoÄŸu',
  'supplierDetail.shown': '{n} gÃ¶steriliyor',
  'supplierDetail.loadingLots': 'CanlÄ± lotlar yÃ¼kleniyorâ€¦',
  'supplierDetail.noneShown': 'Aktif ilan gÃ¶sterilmiyor',
  'supplierDetail.noneShownBody':
    'API bu tedarikÃ§i iÃ§in {n} ilan bildiriyor, ancak mevcut liste gÃ¶rÃ¼nÃ¼mÃ¼nde hiÃ§biri gelmedi. KataloglarÄ±nÄ± sormak iÃ§in teklif talebi borsasÄ±ndan bir talep yayÄ±nlayÄ±n.',

  'rfq.titleSupplier': 'Teklif talebi fÄ±rsatlarÄ±',
  'rfq.titleBuyer': 'Talepler',
  'rfq.subSupplier': 'AlÄ±cÄ±larÄ±n yayÄ±nladÄ±ÄŸÄ± aÃ§Ä±k ihtiyaÃ§lar. FiyatÄ±nÄ±z ve termininizle yanÄ±tlayÄ±n.',
  'rfq.subBuyer':
    'Borsadaki gÃ¼ncel ihtiyaÃ§lar, en yeniler Ã¶nce. Birini aÃ§Ä±p aldÄ±ÄŸÄ± teklifleri gÃ¶rÃ¼n.',
  'rfq.postRequest': '+ Talep yayÄ±nla',
  'rfq.buyerOnlyNotice': 'YalnÄ±zca alÄ±cÄ± hesaplarÄ± talep yayÄ±nlayabilir. YayÄ±nlamak iÃ§in alÄ±cÄ± profiliyle giriÅŸ yapÄ±n.',
  'rfq.total': 'toplam talep',
  'rfq.open': 'aÃ§Ä±k',
  'rfq.quoted': 'teklif verilmiÅŸ',
  'rfq.closed': 'kapalÄ±',
  'rfq.quoteable': 'Teklif verebileceÄŸiniz talepler',
  'rfq.allRequests': 'TÃ¼m talepler',
  'rfq.shown': '{n} gÃ¶steriliyor',
  'rfq.statusAll': 'TÃ¼mÃ¼',
  'rfq.statusOpenCount': 'AÃ§Ä±k ({n})',
  'rfq.statusQuotedCount': 'Teklif verilmiÅŸ ({n})',
  'rfq.quotingCloses': 'AlÄ±cÄ± bir teklifi kabul ettiÄŸinde teklif verme kapanÄ±r.',
  'rfq.emptyNone': 'HenÃ¼z talep yok',
  'rfq.emptyNoMatch': 'Bu filtreyle eÅŸleÅŸen yok',
  'rfq.emptyNoneSupplier': 'Borsada ÅŸu anda aÃ§Ä±k ihtiyaÃ§ yok.',
  'rfq.emptyNoneBuyer': 'Ä°lk ihtiyacÄ±nÄ±zÄ± yayÄ±nlayÄ±n, doÄŸrulanmÄ±ÅŸ fabrikalar yanÄ±tlasÄ±n.',
  'rfq.emptyNoMatchHint': 'FarklÄ± bir durum filtresi deneyin.',
  'rfq.col.requirement': 'Ä°htiyaÃ§',
  'rfq.col.quantity': 'Miktar',
  'rfq.col.deliverTo': 'Teslim yeri',
  'rfq.col.quotes': 'Teklifler',
  'rfq.col.posted': 'YayÄ±nlandÄ±',
  'rfq.col.status': 'Durum',
  'rfq.openAria': 'Teklif talebi #{id} aÃ§',
  'rfq.requestRef': '{category} Â· talep #{id}',
  'rfq.quotesCount': '{n} teklif',
  'rfq.postingBuyerOnly': 'YayÄ±nlamak bir alÄ±cÄ± iÅŸlemidir. TedarikÃ§iler',
  'rfq.quoteOpen': 'aÃ§Ä±k ihtiyaÃ§lara teklif verebilir',
  'rfq.newTitle': 'Yeni teklif talebi',
  'rfq.whatNeed': 'Neye ihtiyacÄ±nÄ±z var?',
  'rfq.titlePlaceholder': 'Ã¶rn. 100 MT bakÄ±r katot, A kalite',
  'rfq.category': 'Kategori',
  'rfq.deliverTo': 'Teslim yeri',
  'rfq.quantity': 'Miktar',
  'rfq.unit': 'Birim',
  'rfq.specification': 'Teknik Ã¶zellikler',
  'rfq.specPlaceholder': 'Kalite, saflÄ±k, sertifikalar, Incoterms, paketlemeâ€¦',
  'rfq.specHint': 'Teknik Ã¶zellik ne kadar netse doÄŸrulanmÄ±ÅŸ fabrikalar o kadar hÄ±zlÄ± teklif verir.',
  'rfq.errTitle': 'Talebe net bir baÅŸlÄ±k verin â€” en az 5 karakter.',
  'rfq.errQuantity': 'Miktar sÄ±fÄ±rdan bÃ¼yÃ¼k bir sayÄ± olmalÄ±.',
  'rfq.errPost': 'Bu talep yayÄ±nlanamadÄ±.',

  'rfqDetail.loadingTitle': 'Talep',
  'rfqDetail.loadingSub': 'YÃ¼kleniyorâ€¦',
  'rfqDetail.title': 'Talep',
  'rfqDetail.notFound': 'Talep bulunamadÄ±',
  'rfqDetail.notFoundBody': 'Bu ihtiyaÃ§ geri Ã§ekilmiÅŸ olabilir veya baÄŸlantÄ± yanlÄ±ÅŸ.',
  'rfqDetail.backToRequests': 'â† Taleplere dÃ¶n',
  'rfqDetail.allRequests': 'â† TÃ¼m talepler',
  'rfqDetail.postedOn': '{date} tarihinde yayÄ±nlandÄ±',
  'rfqDetail.requestRef': 'Talep #{id}',
  'rfqDetail.accepting': 'Teklif kabul ediliyor',
  'rfqDetail.notAccepting': 'Yeni teklif kabul edilmiyor',
  'rfqDetail.noSpec': 'Ek teknik Ã¶zellik verilmedi.',
  'rfqDetail.quantity': 'Miktar',
  'rfqDetail.deliverTo': 'Teslim yeri',
  'rfqDetail.quotations': 'Teklifler',
  'rfqDetail.deadline': 'Son tarih',
  'rfqDetail.requestedBy': 'Talep eden',
  'rfqDetail.received': '{n} alÄ±ndÄ±',
  'rfqDetail.noneTitle': 'HenÃ¼z teklif yok',
  'rfqDetail.noneBody': 'DoÄŸrulanmÄ±ÅŸ tedarikÃ§iler bu ihtiyacÄ± inceliyor.',
  'rfqDetail.col.supplier': 'TedarikÃ§i',
  'rfqDetail.col.price': 'Fiyat',
  'rfqDetail.col.leadTime': 'Termin',
  'rfqDetail.col.notes': 'Notlar',
  'rfqDetail.col.sent': 'GÃ¶nderildi',
  'rfqDetail.col.status': 'Durum',
  'rfqDetail.trustScore': 'GÃ¼ven puanÄ± {n}',
  'rfqDetail.days': '{n} gÃ¼n',
  'rfqDetail.submitTitle': 'Teklif ver',
  'rfqDetail.supplierAccount': 'TedarikÃ§i hesabÄ±',
  'rfqDetail.fromSupplier': 'Teklifler tedarikÃ§i hesaplarÄ±ndan gelir. Bu talebe yanÄ±t vermek iÃ§in tedarikÃ§i hesabÄ±nÄ±za geÃ§in.',
  'rfqDetail.signInSupplierBody': 'Bir talebe yalnÄ±zca giriÅŸ yapmÄ±ÅŸ tedarikÃ§i hesaplarÄ± teklif verebilir. Gezinmek herkese aÃ§Ä±ktÄ±r.',
  'rfqDetail.supplierOnly': 'YalnÄ±zca tedarikÃ§i hesaplarÄ±',
  'rfqDetail.signInAsSupplier': 'TedarikÃ§i olarak giriÅŸ yap',
  'rfqDetail.closedBody': 'Bu talep {status} ve artÄ±k teklif kabul etmiyor.',
  'rfqDetail.seeOpen': 'AÃ§Ä±k talepleri gÃ¶r',
  'rfqDetail.respondBody': 'Birim fiyatÄ±nÄ±z ve termininizle yanÄ±tlayÄ±n. DoÄŸrulanmÄ±ÅŸ profiliniz teklifle birlikte gider.',
  'rfqDetail.unitPrice': 'Birim fiyat (USD)',
  'rfqDetail.leadTime': 'Termin (gÃ¼n)',
  'rfqDetail.termsNotes': 'KoÅŸullar ve notlar',
  'rfqDetail.termsPlaceholder': 'Incoterms, kalite, paketleme, numune politikasÄ±, geÃ§erlilikâ€¦',
  'rfqDetail.compareHint': 'AlÄ±cÄ±lar fiyatÄ±, termini ve doÄŸrulamayÄ± yan yana karÅŸÄ±laÅŸtÄ±rÄ±r.',
  'rfqDetail.submitQuote': 'Teklifi gÃ¶nder',
  'rfqDetail.submitting': 'GÃ¶nderiliyorâ€¦',
  'rfqDetail.errPrice': 'SÄ±fÄ±rdan bÃ¼yÃ¼k bir birim fiyat girin.',
  'rfqDetail.errLead': 'Termin 1 ile 365 arasÄ±nda tam gÃ¼n sayÄ±sÄ± olmalÄ±.',
  'rfqDetail.errSubmit': 'Bu teklif gÃ¶nderilemedi.',

  'listings.title': 'Ä°lanlarÄ±m',
  'listings.sub': 'Pazar yerinde yayÄ±nladÄ±ÄŸÄ±nÄ±z stok',
  'listings.signInSub': 'Pazar yerinde yayÄ±nladÄ±ÄŸÄ±nÄ±z stok',
  'listings.notSignedIn': 'GiriÅŸ yapmadÄ±nÄ±z',
  'listings.notSignedInBody': 'Ä°lanlarÄ±nÄ±z tedarikÃ§i hesabÄ±nÄ±za Ã¶zeldir. GÃ¶rÃ¼ntÃ¼lemek ve yÃ¶netmek iÃ§in giriÅŸ yapÄ±n.',
  'listings.createSupplierAccount': 'TedarikÃ§i hesabÄ± oluÅŸtur',
  'listings.supplierOnly': 'YalnÄ±zca tedarikÃ§i hesaplarÄ±',
  'listings.supplierOnlyBody':
    'HesabÄ±nÄ±z bir {role} hesabÄ±. Ä°lanlar sahibi tedarikÃ§i tarafÄ±ndan yÃ¶netilir, bu yÃ¼zden burada gÃ¶sterilecek veya dÃ¼zenlenecek bir ÅŸey yok.',
  'listings.browseStock': 'HazÄ±r stoÄŸa gÃ¶z at',
  'listings.subLoading': 'StoÄŸunuz yÃ¼kleniyorâ€¦',
  'listings.subCount': 'TedarikÃ§i profiliniz altÄ±nda yayÄ±nlanan {n} ilan',
  'listings.postStock': '+ Stok yayÄ±nla',
  'listings.lotsPublished': 'lot yayÄ±nlandÄ±',
  'listings.bankTransferNote': 'Bir teklif kabul edildiÄŸinde alÄ±cÄ±lar banka havalesiyle Ã¶der.',
  'listings.loadErrorTitle': 'Ä°lanlarÄ±nÄ±z yÃ¼klenemedi',
  'listings.loadErrorBody': 'Ä°lanlarÄ±nÄ±z yÃ¼klenemedi â€” yeniden deneyin. SÃ¼rekli baÅŸarÄ±sÄ±z olursa tekrar giriÅŸ yapÄ±n.',
  'listings.emptyTitle': 'HenÃ¼z ilan yok',
  'listings.emptyBody':
    'Ä°lk lotunuzu yayÄ±nlayÄ±n â€” bir fotoÄŸraf, birim fiyat ve bugÃ¼n ne kadar sevk edebileceÄŸiniz. Pazar yerindeki her alÄ±cÄ± iÃ§in KeÅŸfetâ€™te yayÄ±na girer.',
  'listings.postFirst': '+ Ä°lk lotunuzu yayÄ±nlayÄ±n',
  'listings.getVerified': 'DoÄŸrulanÄ±n',
  'listings.count': '{n} ilan',
  'listings.col.lot': 'Lot',
  'listings.col.category': 'Kategori',
  'listings.col.unitPrice': 'Birim fiyat',
  'listings.col.moq': 'MOQ',
  'listings.col.available': 'Mevcut',
  'listings.col.status': 'Durum',
  'listings.col.posted': 'YayÄ±nlandÄ±',
  'listings.lotRef': 'lot #{id}',
  'listings.noPhotoInline': 'fotoÄŸraf yok',
  'listings.demoNoteLead': 'Demo iÅŸaretli bir lot,',
  'listings.demoNoteTail':
    'sizin yayÄ±nladÄ±ÄŸÄ±nÄ±z stok deÄŸil pazar yerinin saÄŸladÄ±ÄŸÄ± Ã¶rnek veridir. Silmek onu herkes iÃ§in kaldÄ±rÄ±r.',
  'listings.updated': 'Ä°lan gÃ¼ncellendi.',
  'listings.deleted': 'Ä°lan silindi. ArtÄ±k pazar yerinde deÄŸil.',
  'listings.deleteTitle': 'Bu ilan silinsin mi?',
  'listings.deleteLead': '{name} â€” lot #{id}',
  'listings.deleteBody':
    'Bu ilan kalÄ±cÄ± olarak kaldÄ±rÄ±lÄ±r. KeÅŸfetâ€™ten ve ilan tablonuzdan hemen kaybolur, alÄ±cÄ±lar artÄ±k sipariÅŸ veremez veya pazarlÄ±k edemez. Bu geri alÄ±namaz.',
  'listings.deleteKeepBody':
    'Ãœzerinde sipariÅŸ veya teklif bulunan bir lot silinemez â€” API onu kayÄ±t iÃ§in saklar. Bunun yerine mevcut stoÄŸu 0 yaparak tÃ¼kendi olarak iÅŸaretleyin.',
  'listings.keepListing': 'Ä°lanÄ± koru',
  'listings.deleteForever': 'KalÄ±cÄ± olarak sil',
  'listings.deleting': 'Siliniyorâ€¦',
  'listings.deleteErr': 'Bu ilan silinemedi.',
  'listings.editTitle': 'Ä°lanÄ± dÃ¼zenle â€” lot #{id}',

  'post.title': 'Stok yayÄ±nla',
  'post.titleEdit': 'Ä°lanÄ± dÃ¼zenle',
  'post.sub': 'Ä°lan baÅŸÄ±na bir lot: ne olduÄŸu, fiyatÄ± ve bugÃ¼n ne kadar sevk edebileceÄŸiniz',
  'post.subEdit': 'Lot #{id} deÄŸiÅŸtiriliyor â€” kaydetmek yayÄ±ndaki ilanÄ±n Ã¼zerine yazar',
  'post.signInSub': 'AlÄ±cÄ±larÄ±n sipariÅŸ verebilmesi veya pazarlÄ±k edebilmesi iÃ§in hazÄ±r stok listeleyin',
  'post.notSignedIn': 'GiriÅŸ yapmadÄ±nÄ±z',
  'post.notSignedInBody': 'Stok yayÄ±nlamak bir tedarikÃ§i iÅŸlemidir. Lot yayÄ±nlamak iÃ§in tedarikÃ§i hesabÄ±yla giriÅŸ yapÄ±n.',
  'post.createSupplierAccount': 'TedarikÃ§i hesabÄ± oluÅŸtur',
  'post.supplierOnly': 'YalnÄ±zca tedarikÃ§i hesaplarÄ±',
  'post.supplierOnlyBody':
    'HesabÄ±nÄ±z bir {role} hesabÄ±, bu yÃ¼zden API ondan ilan kabul etmez. Stok yayÄ±nlanmadan Ã¶nce tedarikÃ§i profili gerekir.',
  'post.myListings': 'Ä°lanlarÄ±m',
  'post.loadErrorTitle': 'Ä°lan yÃ¼klenemedi',
  'post.loadErrorBody': 'Bu lot yÃ¼klenemedi â€” yeniden deneyin veya ilanlarÄ±nÄ±za dÃ¶nÃ¼n.',
  'post.details': 'Ä°lan bilgileri',
  'post.newListing': 'Yeni ilan',
  'post.requiredMark': '* zorunlu',
  'post.lotName': 'Lot adÄ±',
  'post.lotNamePlaceholder': 'Ã¶rn. BakÄ±r katot A kalite, %99,99',
  'post.category': 'Kategori',
  'post.originCountry': 'MenÅŸe Ã¼lke',
  'post.notStated': 'Belirtilmedi',
  'post.description': 'AÃ§Ä±klama',
  'post.descriptionPlaceholder': 'Kalite, paketleme, Incoterms, termin, sertifikalarâ€¦',
  'post.descriptionHint': 'AlÄ±cÄ±lar bu metne gÃ¶re karar verir. Lotta ne olduÄŸunu ve nasÄ±l sevk edildiÄŸini yazÄ±n.',
  'post.unitPrice': 'Birim fiyat',
  'post.currency': 'Para birimi',
  'post.unit': 'Birim',
  'post.moq': 'Minimum sipariÅŸ (MOQ)',
  'post.moqHint': 'VarsayÄ±lan 1.',
  'post.available': 'Åu anda mevcut',
  'post.availableHint': 'VarsayÄ±lan 0 â€” bugÃ¼n sevk edebileceÄŸiniz stok.',
  'post.purity': 'SaflÄ±k / kalite',
  'post.purityPlaceholder': '%99,99 / A kalite',
  'post.optional': 'Ä°steÄŸe baÄŸlÄ±.',
  'post.photoUrl': 'FotoÄŸraf URLâ€™si',
  'post.photoPlaceholder': 'https://â€¦/bakir-katot.jpg',
  'post.photoHintLead': 'Dosya yÃ¼kleme henÃ¼z yapÄ±lmadÄ±.',
  'post.photoHintTail':
    'FotoÄŸrafÄ±n herkese aÃ§Ä±k baÄŸlantÄ±sÄ±nÄ± yapÄ±ÅŸtÄ±rÄ±n, bu lotun gÃ¶rseli olarak saklanÄ±r. FotoÄŸrafsÄ±z lotlar sade bir yer tutucu gÃ¶sterir.',
  'post.preview': 'Ã–nizleme â€” hiÃ§bir ÅŸey yÃ¼klenmiyorsa baÄŸlantÄ± doÄŸrudan bir gÃ¶rsel deÄŸildir.',
  'post.save': 'DeÄŸiÅŸiklikleri kaydet',
  'post.saving': 'Kaydediliyorâ€¦',
  'post.errName': 'Lota bir ad verin â€” en az 2 karakter.',
  'post.errCategory': 'Bir kategori seÃ§in.',
  'post.errUnit': 'SattÄ±ÄŸÄ±nÄ±z birimi belirtin (MT, KG, adetâ€¦).',
  'post.errPrice': 'Birim fiyat sÄ±fÄ±rdan bÃ¼yÃ¼k bir sayÄ± olmalÄ±.',
  'post.errMoq': 'MOQ sÄ±fÄ±rdan bÃ¼yÃ¼k bir sayÄ± olmalÄ±.',
  'post.errQty': 'Mevcut miktar negatif olamaz.',
  'post.errSave': 'Bu ilan kaydedilemedi.',
  'post.errCreate': 'Bu ilan yayÄ±nlanamadÄ±.',
  'post.behaviour': 'Bu ilan nasÄ±l Ã§alÄ±ÅŸÄ±r',
  'post.behaviourBody':
    'YayÄ±nlanan lot hemen KeÅŸfetâ€™te gÃ¶rÃ¼nÃ¼r ve giriÅŸ yapmÄ±ÅŸ her alÄ±cÄ± sipariÅŸ verebilir. AlÄ±cÄ±lar ayrÄ±ca istediÄŸiniz fiyatÄ±n altÄ±nda teklif aÃ§abilir; bunlarÄ± ÅŸuradan yanÄ±tlarsÄ±nÄ±z:',
  'post.offersLink': 'Teklifler',
  'post.provenance': 'Kaynak',
  'post.platformListing': 'Platform ilanÄ±',
  'post.photo': 'FotoÄŸraf',
  'post.urlOnly': 'YalnÄ±zca URL â€” yÃ¼kleme yok',
  'post.buyerPaysBy': 'AlÄ±cÄ± Ã¶deme yÃ¶ntemi',
  'post.bankTransfer': 'Banka havalesi',
  'post.noMetrics':
    'Bu sayfa gÃ¶rÃ¼ntÃ¼leme, puan veya sipariÅŸ sayÄ±sÄ± gÃ¶stermez â€” bu Ã¶lÃ§Ã¼mler henÃ¼z yapÄ±lmadÄ±ÄŸÄ± iÃ§in gÃ¶sterilmez.',

  'offers.title': 'StoÄŸunuzdaki teklifler',
  'offers.sub': 'LotlarÄ±nÄ±z iÃ§in pazarlÄ±k eden alÄ±cÄ±lar',
  'offers.signInSub': 'LotlarÄ±nÄ±z iÃ§in pazarlÄ±k eden alÄ±cÄ±lar',
  'offers.notSignedIn': 'GiriÅŸ yapmadÄ±nÄ±z',
  'offers.notSignedInBody': 'Teklifler alÄ±cÄ± ve tedarikÃ§iye Ã¶zeldir. YanÄ±tlamak iÃ§in giriÅŸ yapÄ±n.',
  'offers.createSupplierAccount': 'TedarikÃ§i hesabÄ± oluÅŸtur',
  'offers.supplierOnly': 'YalnÄ±zca tedarikÃ§i hesaplarÄ±',
  'offers.supplierOnlyBody':
    'HesabÄ±nÄ±z bir {role} hesabÄ±, altÄ±nda stok listelenmediÄŸi iÃ§in teklif gelemez. AlÄ±cÄ± olarak verdiÄŸiniz teklifler pazar yerinin alÄ±cÄ± tarafÄ±ndadÄ±r.',
  'offers.browseStock': 'HazÄ±r stoÄŸa gÃ¶z at',
  'offers.subLoading': 'Teklifler yÃ¼kleniyorâ€¦',
  'offers.subCount': 'Ä°lanlarÄ±nÄ±zda {n} teklif',
  'offers.awaiting': 'yanÄ±tÄ±nÄ±zÄ± bekliyor',
  'offers.decided': 'sonuÃ§landÄ±',
  'offers.acceptCreates': 'Bir teklifi kabul etmek sipariÅŸ oluÅŸturur; alÄ±cÄ± banka havalesiyle Ã¶der.',
  'offers.filterAwaiting': 'YanÄ±t bekleyen ({n})',
  'offers.filterDecided': 'SonuÃ§lanan ({n})',
  'offers.counterNote': 'KarÅŸÄ± teklifler yeni ve baÄŸlantÄ±lÄ± bir teklif aÃ§ar; ilk koÅŸullarÄ±nÄ±z kayÄ±tta kalÄ±r.',
  'offers.loadErrorTitle': 'Teklifler yÃ¼klenemedi',
  'offers.loadErrorBody': 'StoÄŸunuzdaki teklifler yÃ¼klenemedi â€” yeniden deneyin.',
  'offers.emptyTitle': 'HenÃ¼z teklif yok',
  'offers.emptyBody':
    'Bir alÄ±cÄ± lotlarÄ±nÄ±zdan biri iÃ§in pazarlÄ±k ettiÄŸinde, Ã¶nerdiÄŸi fiyat ve istediÄŸi miktarla burada gÃ¶rÃ¼nÃ¼r. Kabul edebilir, reddedebilir veya kendi fiyatÄ±nÄ±zla yanÄ±tlayabilirsiniz.',
  'offers.seeListings': 'Ä°lanlarÄ±mÄ± gÃ¶r',
  'offers.postMore': '+ Daha fazla stok yayÄ±nla',
  'offers.noneAwaiting': 'YanÄ±tÄ±nÄ±zÄ± bekleyen yok',
  'offers.noneDecided': 'HenÃ¼z sonuÃ§lanan teklif yok',
  'offers.noneAwaitingBody': 'StoÄŸunuzdaki tÃ¼m teklifler yanÄ±tlandÄ±. Ä°ncelemek iÃ§in SonuÃ§lanan sekmesine geÃ§in.',
  'offers.noneDecidedBody': 'Kabul veya reddettiÄŸiniz teklifler kayÄ±t olarak burada tutulur.',
  'offers.count': '{n} teklif',
  'offers.col.listing': 'Ä°lan',
  'offers.col.buyer': 'AlÄ±cÄ±',
  'offers.col.quantity': 'Miktar',
  'offers.col.theirPrice': 'AlÄ±cÄ±nÄ±n fiyatÄ±',
  'offers.col.status': 'Durum',
  'offers.col.received': 'AlÄ±ndÄ±',
  'offers.decidedLabel': 'SonuÃ§landÄ±',
  'offers.counter': 'KarÅŸÄ± teklif',
  'offers.accept': 'Kabul et',
  'offers.reject': 'Reddet',
  'offers.offerRef': 'teklif #{id}',
  'offers.answersOffer': '#{id} numaralÄ± teklifi yanÄ±tlÄ±yor',
  'offers.demoNoteLead': 'Demo etiketli satÄ±r,',
  'offers.demoNoteTail':
    'sizin yayÄ±nladÄ±ÄŸÄ±nÄ±z stok deÄŸil Ã¶rnek bir lot Ã¼zerindedir. Kabul etmek yine gerÃ§ek bir sipariÅŸ oluÅŸturur â€” baÄŸlanmadan Ã¶nce lotu kontrol edin.',
  'offers.counterTitle': 'KarÅŸÄ± teklif #{id}',
  'offers.counterBody':
    '{buyer}, {product} iÃ§in {qty} adede {price} teklif etti. YanÄ±tÄ±nÄ±z yeni ve baÄŸlantÄ±lÄ± bir teklif olur; alÄ±cÄ±nÄ±n koÅŸullarÄ± kayÄ±tta kalÄ±r.',
  'offers.counterPrice': 'Birim fiyatÄ±nÄ±z',
  'offers.perUnit': 'birim baÅŸÄ±na {currency}',
  'offers.counterQty': 'Miktar',
  'offers.counterQtyHint': 'AlÄ±cÄ±nÄ±n miktarÄ±nÄ± korumak iÃ§in olduÄŸu gibi bÄ±rakÄ±n.',
  'offers.counterNotes': 'AlÄ±cÄ±ya not',
  'offers.counterNotesPlaceholder': 'Termin, paketleme, Incoterms, bu fiyatÄ±n geÃ§erliliÄŸiâ€¦',
  'offers.sendCounter': 'KarÅŸÄ± teklifi gÃ¶nder',
  'offers.sending': 'GÃ¶nderiliyorâ€¦',
  'offers.counterErrPrice': 'KarÅŸÄ± teklif fiyatÄ±nÄ±z sÄ±fÄ±rdan bÃ¼yÃ¼k bir sayÄ± olmalÄ±.',
  'offers.counterErrQty': 'Miktar sÄ±fÄ±rdan bÃ¼yÃ¼k bir sayÄ± olmalÄ±.',
  'offers.counterErr': 'Bu karÅŸÄ± teklif gÃ¶nderilemedi.',
  'offers.counterDone': 'KarÅŸÄ± teklif gÃ¶nderildi. Ä°lk teklif karÅŸÄ± teklif verildi olarak iÅŸaretlendi ve alÄ±cÄ± bilgilendirildi.',
  'offers.acceptTitle': '#{id} numaralÄ± teklif kabul edilsin mi?',
  'offers.listing': 'Ä°lan',
  'offers.buyer': 'AlÄ±cÄ±',
  'offers.quantity': 'Miktar',
  'offers.unitPrice': 'Birim fiyat',
  'offers.offerValue': 'Teklif tutarÄ±',
  'offers.acceptBodyLead': 'Kabul etmek bir sipariÅŸ oluÅŸturur.',
  'offers.acceptBodyBank': 'AlÄ±cÄ± buna baÄŸlanÄ±r ve ÅŸu yÃ¶ntemle Ã¶der:',
  'offers.acceptBodyTail':
    'â€” platform kartla Ã¶deme almaz. ProformayÄ± siz dÃ¼zenler ve havale geldiÄŸinde onaylarsÄ±nÄ±z; sipariÅŸ ardÄ±ndan sevkiyata geÃ§er. Bu karar kesindir: kabul edilen bir teklif yeniden karara baÄŸlanamaz.',
  'offers.acceptCta': 'Kabul et ve sipariÅŸ oluÅŸtur',
  'offers.accepting': 'Kabul ediliyorâ€¦',
  'offers.acceptErr': 'Bu teklif kabul edilemedi.',
  'offers.acceptDone': 'Teklif #{id} kabul edildi. {buyer} iÃ§in sipariÅŸ oluÅŸturuldu.',
  'offers.rejectTitle': '#{id} numaralÄ± teklif reddedilsin mi?',
  'offers.rejectBody':
    '{buyer} adlÄ± alÄ±cÄ±nÄ±n {product} iÃ§in verdiÄŸi {price} tutarÄ±ndaki teklif kapanÄ±r. Reddetmek kesindir â€” alÄ±cÄ± bu teklifi canlandÄ±ramaz, ancak yeni bir teklif aÃ§abilir.',
  'offers.rejectCta': 'Teklifi reddet',
  'offers.rejecting': 'Reddediliyorâ€¦',
  'offers.rejectErr': 'Bu teklif reddedilemedi.',
  'offers.rejectDone': 'Teklif #{id} reddedildi.',

  'myoffers.titleSupplier': 'StoÄŸumdaki teklifler',
  'myoffers.titleAdmin': 'TÃ¼m teklifler',
  'myoffers.titleBuyer': 'Tekliflerim',
  'myoffers.subSupplier': 'AlÄ±cÄ±larÄ±n stoÄŸunuza verdiÄŸi teklifler. Her birini karÅŸÄ±layÄ±n, kabul edin veya reddedin.',
  'myoffers.subAdmin': 'Platformdaki tÃ¼m teklifler, en yeniler Ã¶nce.',
  'myoffers.subBuyer': 'HazÄ±r stokta verdiÄŸiniz teklifler. Her birini karÅŸÄ±layÄ±n, kabul edin veya reddedin.',
  'myoffers.signInSub': 'PazarlÄ±k ettiÄŸiniz teklifleri gÃ¶rmek iÃ§in giriÅŸ yapÄ±n',
  'myoffers.notSignedIn': 'GiriÅŸ yapmadÄ±nÄ±z',
  'myoffers.notSignedInBody': 'Teklifler iki tarafa Ã¶zeldir: aÃ§mak, karÅŸÄ±lamak veya kabul etmek iÃ§in giriÅŸ yapÄ±n.',
  'myoffers.loadErrorTitle': 'Teklifler yÃ¼klenemedi',
  'myoffers.loadErrorBody': 'API tekliflerinizi dÃ¶ndÃ¼rmedi â€” yeniden deneyin.',
  'myoffers.trying': 'Deneniyorâ€¦',
  'myoffers.emptyTitle': 'HenÃ¼z teklif yok',
  'myoffers.emptySupplier': 'AlÄ±cÄ±larÄ±n ilanlarÄ±nÄ±za verdiÄŸi teklifler burada gÃ¶rÃ¼nÃ¼r ve karÅŸÄ±lamaya veya kabul etmeye hazÄ±rdÄ±r.',
  'myoffers.emptyAdmin': 'Platformda henÃ¼z hiÃ§ teklif aÃ§Ä±lmadÄ±.',
  'myoffers.emptyBuyer': 'Ä°stediÄŸiniz bir lotu aÃ§Ä±p teklif verin â€” tedarikÃ§i karÅŸÄ±layabilir, kabul edebilir veya reddedebilir.',
  'myoffers.browseStock': 'HazÄ±r stoÄŸa gÃ¶z at',
  'myoffers.count': '{n} teklif',
  'myoffers.stillOpen': '{n} hÃ¢lÃ¢ aÃ§Ä±k',
  'myoffers.col.offer': 'Teklif',
  'myoffers.col.counterparty': 'KarÅŸÄ± taraf',
  'myoffers.col.quantity': 'Miktar',
  'myoffers.col.unitPrice': 'Birim fiyat',
  'myoffers.col.status': 'Durum',
  'myoffers.col.date': 'Tarih',
  'myoffers.col.action': 'Ä°ÅŸlem',
  'myoffers.counterTo': '#{id} numaralÄ± teklife karÅŸÄ±',
  'myoffers.seatSupplier': 'tedarikÃ§i',
  'myoffers.seatBuyer': 'alÄ±cÄ±',
  'myoffers.noAction': 'BaÅŸka iÅŸlem yok',
  'myoffers.confirmReject': 'Reddi onayla',
  'myoffers.counter': 'KarÅŸÄ± teklif',
  'myoffers.accept': 'Kabul et',
  'myoffers.reject': 'Reddet',
  'myoffers.counterTitle': 'KarÅŸÄ± teklif #{id}',
  'myoffers.counterDoneTitle': 'KarÅŸÄ± teklif gÃ¶nderildi',
  'myoffers.counterDoneBody': 'KarÅŸÄ± teklifiniz karÅŸÄ± tarafta',
  'myoffers.backToOffers': 'Tekliflerime dÃ¶n',
  'myoffers.counterLead': '{product} Â· teklif #{id} Â· {qty} adede birim {price} teklif edildi',
  'myoffers.perUnit': '{currency} cinsinden, birim baÅŸÄ±na.',
  'myoffers.inCurrency': '{currency} cinsinden, birim baÅŸÄ±na.',
  'myoffers.originally': 'BaÅŸlangÄ±Ã§ta {qty}.',
  'myoffers.messageLabel': 'KarÅŸÄ± tarafa mesaj',
  'myoffers.messagePlaceholder': 'Termin, paketleme, Ã¶deme koÅŸullarÄ±â€¦',
  'myoffers.sendCounter': 'KarÅŸÄ± teklifi gÃ¶nder',
  'myoffers.sending': 'GÃ¶nderiliyorâ€¦',
  'myoffers.errInvalid': 'SÄ±fÄ±rdan bÃ¼yÃ¼k bir birim fiyat ve miktar girin.',
  'myoffers.errCounter': 'KarÅŸÄ± teklif gÃ¶nderilemedi â€” yeniden deneyin.',
  'myoffers.acceptTitle': '#{id} numaralÄ± teklifi kabul et',
  'myoffers.acceptLead': '{product} Â· {qty} adet, birim {price}',
  'myoffers.acceptStripeLead': 'Kabul etmek bu fiyat ve miktarÄ± onaylar ve',
  'myoffers.acceptStripeStrong': 'bir sipariÅŸ oluÅŸturur',
  'myoffers.acceptStripeTail': '. SipariÅŸ daha sonra sevkiyat aÅŸamalarÄ±nÄ±n izlendiÄŸi SipariÅŸler altÄ±nda gÃ¶rÃ¼nÃ¼r.',
  'myoffers.acceptHint': 'Bu geri alÄ±namaz â€” pazarlÄ±k kabul edilen koÅŸullarla kapanÄ±r.',
  'myoffers.acceptCta': 'Kabul et ve sipariÅŸ oluÅŸtur',
  'myoffers.accepting': 'Kabul ediliyorâ€¦',
  'myoffers.errAccept': 'Teklif kabul edilemedi â€” yeniden deneyin.',
  'myoffers.accepted': 'Teklif #{id} kabul edildi. OluÅŸan sipariÅŸi SipariÅŸlerâ€™de gÃ¶rÃ¼n.',
  'myoffers.viewOrders': 'SipariÅŸleri gÃ¶r',
  'myoffers.errReject': 'Teklif #{id} reddedilemedi â€” yeniden deneyin.',

  'ship.title': 'Sevkiyatlar',
  'ship.subSupplier': 'StoÄŸunuza verilen sipariÅŸlerin aÅŸamalarÄ±. Her sevkiyatÄ± siz ilerletirsiniz.',
  'ship.subAdmin': 'TÃ¼m sipariÅŸlerin aÅŸamalarÄ±. YÃ¶neticiler bir sevkiyatÄ± tedarikÃ§i adÄ±na ilerletebilir.',
  'ship.subBuyer': 'VerdiÄŸiniz sipariÅŸler iÃ§in aÅŸama takibi. Her adÄ±mÄ± tedarikÃ§iniz ilerletir.',
  'ship.signInSub': 'SevkiyatlarÄ±nÄ±zÄ± izlemek iÃ§in giriÅŸ yapÄ±n',
  'ship.notSignedIn': 'GiriÅŸ yapmadÄ±nÄ±z',
  'ship.notSignedInBody': 'Sevkiyat takibi bir sipariÅŸteki alÄ±cÄ± ve tedarikÃ§iye Ã¶zeldir.',
  'ship.loadErrorTitle': 'Sevkiyatlar yÃ¼klenemedi',
  'ship.loadErrorBody': 'API sevkiyatlarÄ±nÄ±zÄ± dÃ¶ndÃ¼rmedi â€” yeniden deneyin.',
  'ship.trying': 'Deneniyorâ€¦',
  'ship.emptyTitle': 'HenÃ¼z sevkiyat yok',
  'ship.emptySupplier': 'Bir alÄ±cÄ± stoÄŸunuzdan sipariÅŸ verdiÄŸinde sevkiyat otomatik oluÅŸturulur.',
  'ship.emptyBuyer': 'VerdiÄŸiniz her sipariÅŸ iÃ§in sevkiyat otomatik oluÅŸturulur ve aÅŸamalarÄ± burada gÃ¶rÃ¼nÃ¼r.',
  'ship.myListings': 'Ä°lanlarÄ±m',
  'ship.viewOrders': 'SipariÅŸlerimi gÃ¶r',
  'ship.count': 'sevkiyat hesabÄ±nÄ±za gÃ¶rÃ¼nÃ¼r',
  'ship.delivered': 'teslim edildi',
  'ship.advanceRecorded': 'Bir aÅŸamayÄ± ilerletmek zaman damgasÄ±yla kaydedilir ve alÄ±cÄ±yla paylaÅŸÄ±lÄ±r.',
  'ship.advanceBySupplier': 'AÅŸamalarÄ± her sipariÅŸte tedarikÃ§i ilerletir.',
  'ship.trackingTitle': 'Sevkiyat takibi',
  'ship.col.shipment': 'Sevkiyat',
  'ship.col.product': 'ÃœrÃ¼n',
  'ship.col.carrier': 'TaÅŸÄ±yÄ±cÄ±',
  'ship.col.trackingNo': 'Takip no.',
  'ship.col.documents': 'Belgeler',
  'ship.col.updated': 'Son gÃ¼ncelleme',
  'ship.col.milestone': 'AÅŸama',
  'ship.noDocumentTitle': 'Bir sevkiyata henÃ¼z belge eklenmedi',
  'ship.advance': 'AÅŸamayÄ± ilerlet',
  'ship.advancing': 'Ä°lerletiliyorâ€¦',
  'ship.deliveredLabel': 'Teslim edildi',
  'ship.advancedBySupplier': 'TedarikÃ§i tarafÄ±ndan ilerletilir',
  'ship.completeTitle': 'TÃ¼m aÅŸamalara ulaÅŸÄ±ldÄ±',
  'ship.advanceTitle': 'Bu sevkiyatÄ± bir adÄ±m ilerlet',
  'ship.noMilestones': 'Bu sevkiyatta henÃ¼z aÅŸama kaydedilmedi.',
  'ship.reached': '{total} aÅŸamadan {step} tanesine ulaÅŸÄ±ldÄ±',
  'ship.reachedDelivered': 'teslim edildi',
  'ship.reachedNext': 'sÄ±radaki: {next}',
  'ship.footLead': 'AÅŸama geÃ§miÅŸi sipariÅŸteki iki tarafÃ§a paylaÅŸÄ±lÄ±r. SipariÅŸler ve tutarlarÄ±',
  'ship.footLink': 'SipariÅŸler',
  'ship.footTail': 'altÄ±ndadÄ±r.',
  'ship.errAdvance': 'Sevkiyat #{id} ilerletilemedi â€” yeniden deneyin.',

  'saved.title': 'Kaydedilen lotlar',
  'saved.signInSub': 'Lotlardan bir kÄ±sa liste tutmak iÃ§in giriÅŸ yapÄ±n',
  'saved.notSignedIn': 'GiriÅŸ yapmadÄ±nÄ±z',
  'saved.notSignedInBody': 'KÄ±sa listeniz hesabÄ±nÄ±za Ã¶zeldir: lot kaydetmek ve kaldÄ±rmak iÃ§in giriÅŸ yapÄ±n.',
  'saved.sub': 'KÄ±sa listenize aldÄ±ÄŸÄ±nÄ±z lotlar. Fiyatlar ve stok tedarikÃ§inin gÃ¼ncel deÄŸerleridir, rezervasyon deÄŸildir.',
  'saved.loadErrorTitle': 'Kaydedilen lotlar yÃ¼klenemedi',
  'saved.loadErrorBody': 'API kÄ±sa listenizi dÃ¶ndÃ¼rmedi â€” yeniden deneyin.',
  'saved.trying': 'Deneniyorâ€¦',
  'saved.emptyTitle': 'HenÃ¼z bir ÅŸey kaydedilmedi',
  'saved.emptyBody': 'Pazar yerinden bir lot kaydedin, sonra hÄ±zlÄ± karÅŸÄ±laÅŸtÄ±rma iÃ§in burada gÃ¶rÃ¼nÃ¼r.',
  'saved.browse': 'HazÄ±r stoÄŸa gÃ¶z at',
  'saved.goToFeed': 'AkÄ±ÅŸÄ±ma git',
  'saved.count': '{n} kayÄ±tlÄ± lot',
  'saved.mostRecent': 'En son kaydedilen Ã¶nce',
  'saved.savedOn': '{date} tarihinde kaydedildi',
  'saved.remove': 'KaldÄ±r',
  'saved.removing': 'KaldÄ±rÄ±lÄ±yorâ€¦',
  'saved.removeTitle': 'Bu lotu kÄ±sa listenizden kaldÄ±r',
  'saved.errRemove': 'Bu lot kÄ±sa listenizden kaldÄ±rÄ±lamadÄ± â€” yeniden deneyin.',

  'notes.title': 'Bildirimler',
  'notes.signInSub': 'Hesap hareketlerinizi gÃ¶rmek iÃ§in giriÅŸ yapÄ±n',
  'notes.notSignedIn': 'GiriÅŸ yapmadÄ±nÄ±z',
  'notes.notSignedInBody': 'Bildirimler hesabÄ±nÄ±za Ã¶zeldir: okumak iÃ§in giriÅŸ yapÄ±n.',
  'notes.sub': 'HesabÄ±nÄ±zdaki teklifler, mesajlar ve sevkiyat gÃ¼ncellemeleri, en yeniler Ã¶nce.',
  'notes.markAll': 'TÃ¼mÃ¼nÃ¼ okundu iÅŸaretle',
  'notes.marking': 'Ä°ÅŸaretleniyorâ€¦',
  'notes.markAllTitle': '{n} okunmamÄ±ÅŸ bildirimi okundu iÅŸaretle',
  'notes.nothingUnread': 'OkunmamÄ±ÅŸ yok',
  'notes.loadErrorTitle': 'Bildirimler yÃ¼klenemedi',
  'notes.loadErrorBody': 'API bildirimlerinizi dÃ¶ndÃ¼rmedi â€” yeniden deneyin.',
  'notes.trying': 'Deneniyorâ€¦',
  'notes.emptyTitle': 'HenÃ¼z bildirim yok',
  'notes.emptyBody': 'Bir teklife karÅŸÄ± teklif verildiÄŸinde, mesaj geldiÄŸinde veya sevkiyat ilerlediÄŸinde buraya kaydedilir.',
  'notes.browse': 'HazÄ±r stoÄŸa gÃ¶z at',
  'notes.myOrders': 'SipariÅŸlerim',
  'notes.count': '{n} bildirim',
  'notes.unreadCount': '{n} okunmamÄ±ÅŸ',
  'notes.allRead': 'TÃ¼mÃ¼ okundu',
  'notes.unreadLabel': 'OkunmamÄ±ÅŸ',
  'notes.footnote':
    'OkunmamÄ±ÅŸ sayÄ±larÄ± doÄŸrudan APIâ€™den gelir. Buradan bir sohbeti veya teklifi aÃ§mak bildirimi kendiliÄŸinden temizlemez â€” â€œTÃ¼mÃ¼nÃ¼ okundu iÅŸaretleâ€yi kullanÄ±n.',
  'notes.errMark': 'Bildirimler okundu olarak iÅŸaretlenemedi â€” yeniden deneyin.',
  'notes.justNow': 'az Ã¶nce',
  'notes.minutesAgo': '{n} dk Ã¶nce',
  'notes.hoursAgo': '{n} sa Ã¶nce',
  'notes.daysAgo': '{n} gÃ¼n Ã¶nce',
  'notes.open': 'AÃ§',

  'msg.title': 'Mesajlar',
  'msg.subSupplier': 'StoÄŸunuzla ilgili alÄ±cÄ± sorularÄ±. Bir sohbeti aÃ§mak onu okundu yapar.',
  'msg.subBuyer': 'TedarikÃ§ilerle sohbetleriniz. Bir sohbeti aÃ§mak onu okundu yapar.',
  'msg.signInSub': 'Sohbetlerinizi gÃ¶rmek iÃ§in giriÅŸ yapÄ±n',
  'msg.notSignedIn': 'GiriÅŸ yapmadÄ±nÄ±z',
  'msg.notSignedInBody': 'Sohbetler iki tarafa Ã¶zeldir: okumak ve yanÄ±tlamak iÃ§in giriÅŸ yapÄ±n.',
  'msg.loadErrorTitle': 'Sohbetler yÃ¼klenemedi',
  'msg.loadErrorBody': 'API konu listelerinizi dÃ¶ndÃ¼rmedi â€” yeniden deneyin.',
  'msg.trying': 'Deneniyorâ€¦',
  'msg.emptyTitle': 'HenÃ¼z sohbet yok',
  'msg.emptySupplier': 'Bir alÄ±cÄ± lotlarÄ±nÄ±zdan biri hakkÄ±nda sorduÄŸunda sohbet burada gÃ¶rÃ¼nÃ¼r.',
  'msg.emptyBuyer': 'Ä°lgilendiÄŸiniz bir lotu aÃ§Ä±p tedarikÃ§iye mesaj gÃ¶nderin â€” sohbet burada gÃ¶rÃ¼nÃ¼r.',
  'msg.browse': 'HazÄ±r stoÄŸa gÃ¶z at',
  'msg.myListings': 'Ä°lanlarÄ±m',
  'msg.noMessagesYet': 'HenÃ¼z mesaj yok',
  'msg.count': '{n} mesaj',
  'msg.pickTitle': 'Bir sohbet seÃ§in',
  'msg.pickBody': 'MesajlarÄ± burada gÃ¶rÃ¼nÃ¼r.',
  'msg.threadLoadError': 'Bu sohbet yÃ¼klenemedi',
  'msg.threadLoadErrorBody': 'KaldÄ±rÄ±lmÄ±ÅŸ olabilir veya hesabÄ±nÄ±za aÃ§Ä±k deÄŸil â€” yeniden deneyin.',
  'msg.noLot': 'Lot eklenmemiÅŸ',
  'msg.viewLot': 'Lotu gÃ¶r',
  'msg.emptyThreadTitle': 'Bu sohbette henÃ¼z mesaj yok',
  'msg.emptyThreadBody': 'Ä°lkini aÅŸaÄŸÄ±ya yazÄ±n.',
  'msg.messagePlaceholder': '{name} kiÅŸisine mesaj yazâ€¦',
  'msg.messageAria': 'Mesaj yaz',
  'msg.send': 'GÃ¶nder',
  'msg.sending': 'GÃ¶nderiliyorâ€¦',
  'msg.read': 'okundu',
  'msg.otherParty': 'karÅŸÄ± taraf',
  'msg.errSend': 'Mesaj gÃ¶nderilemedi â€” yeniden deneyin.',
  'msg.justNow': 'az Ã¶nce',
  'msg.minutesAgo': '{n} dk Ã¶nce',
  'msg.hoursAgo': '{n} sa Ã¶nce',
  'msg.daysAgo': '{n} gÃ¼n Ã¶nce',

  'verify.title': 'DoÄŸrulama',
  'verify.sub': 'Belgelerinizi dosyalayÄ±n, inceleme kararÄ±nÄ± izleyin ve alÄ±cÄ±lara ne sÃ¶ylendiÄŸini gÃ¶rÃ¼n',
  'verify.signInSub': 'AlÄ±cÄ±larÄ±n parayÄ± baÄŸlamadan Ã¶nce gÃ¼vendiÄŸi belgeler',
  'verify.notSignedIn': 'GiriÅŸ yapmadÄ±nÄ±z',
  'verify.notSignedInBody':
    'DoÄŸrulama belgeleri bir tedarikÃ§i hesabÄ±na aittir ve ham hÃ¢liyle asla herkese aÃ§Ä±k olmaz. Dosyalamak veya yenilemek iÃ§in giriÅŸ yapÄ±n.',
  'verify.createSupplierAccount': 'TedarikÃ§i hesabÄ± oluÅŸtur',
  'verify.supplierOnly': 'YalnÄ±zca tedarikÃ§i hesaplarÄ±',
  'verify.supplierOnlyBody': 'HesabÄ±nÄ±z bir {role} hesabÄ±, tamamlanacak bir tedarikÃ§i kontrol listesi yok.',
  'verify.seeSuppliers': 'DoÄŸrulanmÄ±ÅŸ tedarikÃ§ileri gÃ¶r',
  'verify.approved': 'Onaylanan belgeler',
  'verify.waiting': 'Ä°nceleyici bekleniyor',
  'verify.actionNeeded': 'Eksik veya geri gÃ¶nderilen',
  'verify.coreApproved': 'Temel belgeler onaylandÄ±',
  'verify.confirmed': 'OnaylandÄ±',
  'verify.pending': 'Beklemede',
  'verify.yourDocs': 'Belgeleriniz',
  'verify.onFile': 'kayÄ±tlÄ± {n} belge',
  'verify.loadErrorTitle': 'Belgeler yÃ¼klenemedi',
  'verify.loadErrorBody':
    'DoÄŸrulama belgeleriniz yÃ¼klenemedi â€” yeniden deneyin. SÃ¼rekli baÅŸarÄ±sÄ±z olursa hesabÄ±nÄ±zda henÃ¼z tedarikÃ§i profili olmayabilir.',
  'verify.emptyTitle': 'KayÄ±tlÄ± belge yok',
  'verify.emptyBody':
    'HenÃ¼z bir belge dosyalanmadÄ±, bu yÃ¼zden alÄ±cÄ±lara doÄŸrulama rozeti gÃ¶sterilemez. Ä°lk belgenizi dosyalamak iÃ§in formu kullanÄ±n â€” {first} ile baÅŸlayÄ±n.',
  'verify.col.document': 'Belge',
  'verify.col.status': 'Durum',
  'verify.col.note': 'Ä°nceleyici notu',
  'verify.col.reviewed': 'Ä°ncelendi',
  'verify.filed': '{date} tarihinde dosyalandÄ±',
  'verify.reference': 'referans: {ref}',
  'verify.noReference': 'referans verilmedi',
  'verify.resubmit': 'Yeniden gÃ¶nder',
  'verify.tierFootnote':
    'Burada yalnÄ±zca APIâ€™nin tedarikÃ§i profiliniz iÃ§in dÃ¶ndÃ¼rdÃ¼ÄŸÃ¼ belgeler listelenir. Eksik tÃ¼rlerin henÃ¼z satÄ±rÄ± yoktur â€” dosyalamak satÄ±rÄ± oluÅŸturur.',
  'verify.fileTitle': 'Belge dosyala veya yenile',
  'verify.docType': 'Belge tÃ¼rÃ¼',
  'verify.existingHintPre': '{doc} iÃ§in zaten bir satÄ±rÄ±nÄ±z var â€” durum',
  'verify.existingHintPost':
    '. Yeniden dosyalamak onun Ã¼zerine yazar ve Ã¶nceki kararÄ± siler, yani onaylanmÄ±ÅŸ bir belge yeniden onay gerektirir.',
  'verify.refLabel': 'Belgeye referans / baÄŸlantÄ±',
  'verify.refPlaceholder': 'https://â€¦/ticaret-sicili.pdf veya dosya referansÄ±nÄ±z',
  'verify.refHintLead': 'Dosya yÃ¼kleme henÃ¼z yapÄ±lmadÄ±.',
  'verify.refHintTail':
    'Belgenin baÄŸlantÄ±sÄ±nÄ± veya inceleme ekibinin takip edebileceÄŸi bir referansÄ± yapÄ±ÅŸtÄ±rÄ±n. OlduÄŸu gibi saklanÄ±r ve herkese aÃ§Ä±k gÃ¶sterilmez.',
  'verify.noteLabel': 'Ä°nceleyiciye not',
  'verify.notePlaceholder': 'Ne deÄŸiÅŸti, neden yenileniyor, inceleyicinin bilmesi gerekenlerâ€¦',
  'verify.filing': 'DosyalanÄ±yorâ€¦',
  'verify.resubmitDoc': '{doc} belgesini yeniden gÃ¶nder',
  'verify.submitDoc': '{doc} belgesini gÃ¶nder',
  'verify.queueNoteLead': 'GÃ¶ndermek belgeyi yalnÄ±zca kuyruÄŸa alÄ±r.',
  'verify.queueNoteStrong': 'AlÄ±cÄ±lara rozet, bir inceleyici onayladÄ±ÄŸÄ±nda gÃ¶rÃ¼nÃ¼r',
  'verify.queueNoteTail': 'â€” gÃ¶nderimde asla ve hiÃ§bir zaman otomatik olarak deÄŸil.',
  'verify.filedNotice':
    '{doc} dosyalandÄ±. Durum artÄ±k "gÃ¶nderildi" ve inceleme kuyruÄŸunda bekliyor â€” alÄ±cÄ±lara rozet yalnÄ±zca bir inceleyici onayladÄ±ÄŸÄ±nda gÃ¶rÃ¼nÃ¼r.',
  'verify.errFile': 'Bu belge dosyalanamadÄ±.',
  'verify.statusMeans': 'Her durumun anlamÄ±',
  'verify.tierTitle': 'DoÄŸrulama seviyesi',
  'verify.tierAll': 'DoÄŸrulanmÄ±ÅŸ Â· tÃ¼m temel belgeler onaylandÄ±',
  'verify.tierSome': 'DoÄŸrulanmÄ±ÅŸ Â· belgeler onaylandÄ±',
  'verify.tierNone': 'HenÃ¼z doÄŸrulanmadÄ±',
  'verify.tierAllBody': 'Bu sayfadaki her temel belge tÃ¼rÃ¼ bir inceleyici tarafÄ±ndan onaylandÄ±.',
  'verify.tierSomeBody':
    'En az bir belge onaylandÄ±{n}; kalan temel tÃ¼rler profili gÃ¼Ã§lendirir.',
  'verify.tierNoneBody': 'HenÃ¼z hiÃ§bir belge onaylanmadÄ±, bu yÃ¼zden alÄ±cÄ±lara ÅŸirketiniz iÃ§in doÄŸrulama rozeti gÃ¶sterilmiyor.',
  'verify.tierHint':
    'HesabÄ±nÄ±zÄ±n taÅŸÄ±dÄ±ÄŸÄ± seviyeyi inceleme ekibi onaylanan belgelerden belirler â€” bu ekran APIâ€™nin dÃ¶ndÃ¼rdÃ¼ÄŸÃ¼ belge durumlarÄ±nÄ± bildirir ve kendi baÅŸÄ±na bir seviye numarasÄ± hesaplamaz. AlÄ±cÄ±lar rozeti yalnÄ±zca onaylanmÄ±ÅŸ belgeler iÃ§in gÃ¶rÃ¼r.',
  'verify.suggested': 'Ã–nerilen sonraki:',
  'verify.select': 'SeÃ§',
  'verify.othersNote':
    'AlÄ±cÄ±lar diÄŸer tedarikÃ§ilerin puanlarÄ±nÄ± ve denetim sayÄ±larÄ±nÄ± da profillerinde gÃ¶rÃ¼r. Bu rakamlar bu kontrol listesinin Ã¼rettiÄŸi deÄŸil, pazar yerinin Ã¶rnek verisidir â€” bu sayfa bilinÃ§li olarak hiÃ§birini gÃ¶stermez.',
  'verify.help.missing.title': 'DosyalanmadÄ±',
  'verify.help.missing.state': 'HenÃ¼z bir ÅŸey dosyalanmadÄ± veya belge hiÃ§ gÃ¶nderilmedi.',
  'verify.help.submitted.title': 'Ä°nceleme bekliyor',
  'verify.help.submitted.state': 'DosyalandÄ± ve inceleme kuyruÄŸunda bekliyor. AlÄ±cÄ±lara henÃ¼z rozet gÃ¶sterilmiyor.',
  'verify.help.approved.title': 'OnaylandÄ±',
  'verify.help.approved.state': 'Bir inceleyici belgenin kendisiyle karÅŸÄ±laÅŸtÄ±rarak kontrol etti. AlÄ±cÄ±larÄ±n gÃ¶rdÃ¼ÄŸÃ¼ budur.',
  'verify.help.rejected.title': 'Geri gÃ¶nderildi',
  'verify.help.rejected.state': 'Notla reddedildi. Belgeyi dÃ¼zeltip yeniden gÃ¶nderin.',
  'verify.doc.businessLicence': 'Ticaret sicil belgesi',
  'verify.doc.taxCertificate': 'Vergi levhasÄ±',
  'verify.doc.factoryAudit': 'Fabrika denetim raporu',
  'verify.doc.productCert': 'ÃœrÃ¼n sertifikasÄ±',
  'verify.doc.exportLicence': 'Ä°hracat lisansÄ±',
};

const ar: Partial<Record<DictKey, string>> = {
  'status.open': 'Ù…ÙØªÙˆØ­',
  'status.quoted': 'ØªÙ… ØªÙ‚Ø¯ÙŠÙ… Ø¹Ø±Ø¶',
  'status.closed': 'Ù…ØºÙ„Ù‚',
  'status.submitted': 'Ù…ÙØ±Ø³Ù„',
  'status.accepted': 'Ù…Ù‚Ø¨ÙˆÙ„',
  'status.rejected': 'Ù…Ø±ÙÙˆØ¶',
  'status.active': 'Ù†Ø´Ø·',
  'status.sold_out': 'Ù†ÙØ¯Øª Ø§Ù„ÙƒÙ…ÙŠØ©',
  'status.scheduled': 'Ù…Ø¬Ø¯ÙˆÙ„',
  'status.in_progress': 'Ù‚ÙŠØ¯ Ø§Ù„ØªÙ†ÙÙŠØ°',
  'status.passed': 'Ù†Ø§Ø¬Ø­',
  'status.failed': 'ÙØ§Ø´Ù„',
  'status.pending': 'Ù‚ÙŠØ¯ Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø±',
  'status.paid': 'Ù…Ø¯ÙÙˆØ¹',
  'status.shipped': 'ØªÙ… Ø§Ù„Ø´Ø­Ù†',
  'status.delivered': 'ØªÙ… Ø§Ù„ØªØ³Ù„ÙŠÙ…',
  'status.cancelled': 'Ù…Ù„ØºÙ‰',
  'status.missing': 'Ù„Ù… ÙŠÙÙˆØ¯Ø¹',
  'status.approved': 'Ù…Ø¹ØªÙ…Ø¯',
  'status.countered': 'ØªÙ… Ø§Ù„Ø±Ø¯ Ø¨Ø¹Ø±Ø¶ Ù…Ø¶Ø§Ø¯',
  'status.withdrawn': 'Ù…Ø³Ø­ÙˆØ¨',
  'status.inspecting': 'Ø§Ù„ØªÙØªÙŠØ´ Ø¬Ø§Ø±Ù',

  'action.close': 'Ø¥ØºÙ„Ø§Ù‚',
  'action.cancel': 'Ø¥Ù„ØºØ§Ø¡',
  'action.dismiss': 'ØªØ¬Ø§Ù‡Ù„',
  'action.refresh': 'ØªØ­Ø¯ÙŠØ«',
  'action.refreshing': 'Ø¬Ø§Ø±Ù Ø§Ù„ØªØ­Ø¯ÙŠØ«â€¦',
  'action.tryAgain': 'Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©',
  'action.clear': 'Ù…Ø³Ø­',
  'action.clearFilters': 'Ù…Ø³Ø­ Ø§Ù„Ù…Ø±Ø´Ø­Ø§Øª',
  'action.search': 'Ø¨Ø­Ø«',
  'action.save': 'Ø­ÙØ¸ Ø§Ù„ØªØºÙŠÙŠØ±Ø§Øª',
  'action.discard': 'ØªØ±Ø§Ø¬Ø¹',
  'action.signIn': 'ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„',
  'action.signOut': 'ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬',
  'action.signingIn': 'Ø¬Ø§Ø±Ù ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„â€¦',
  'action.joinFree': 'Ø§Ù†Ø¶Ù… Ù…Ø¬Ø§Ù†Ù‹Ø§',
  'action.createAccount': 'Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨',
  'action.creatingAccount': 'Ø¬Ø§Ø±Ù Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨â€¦',
  'action.backToExplore': 'Ø§Ù„Ø¹ÙˆØ¯Ø© Ø¥Ù„Ù‰ Ø§Ù„Ø§Ø³ØªÙƒØ´Ø§Ù',
  'action.open': 'ÙØªØ­',
  'action.edit': 'ØªØ¹Ø¯ÙŠÙ„',
  'action.delete': 'Ø­Ø°Ù',

  'common.loading': 'Ø¬Ø§Ø±Ù Ø§Ù„ØªØ­Ù…ÙŠÙ„â€¦',
  'common.loadingEllipsis': 'Ø¬Ø§Ø±Ù Ø§Ù„ØªØ­Ù…ÙŠÙ„â€¦',
  'common.notSet': 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯',
  'common.optional': 'Ø§Ø®ØªÙŠØ§Ø±ÙŠ',
  'common.required': 'Ù…Ø·Ù„ÙˆØ¨',
  'common.newestFirst': 'Ø§Ù„Ø£Ø­Ø¯Ø« Ø£ÙˆÙ„Ù‹Ø§',
  'common.anyCountry': 'Ø£ÙŠ Ø¨Ù„Ø¯',
  'common.allCountries': 'ÙƒÙ„ Ø§Ù„Ø¨Ù„Ø¯Ø§Ù†',
  'common.verified': 'Ù…ÙˆØ«Ù‘Ù‚',
  'common.tradeAbbrev':
    'RFQ = Ø·Ù„Ø¨ Ø¹Ø±Ø¶ Ø³Ø¹Ø± Â· MOQ = Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ø·Ù„Ø¨ Â· FOB = Ø§Ù„ØªØ³Ù„ÙŠÙ… Ø¹Ù„Ù‰ Ø¸Ù‡Ø± Ø§Ù„Ø³ÙÙŠÙ†Ø© Â· TT = Ø­ÙˆØ§Ù„Ø© Ù…ØµØ±ÙÙŠØ©',

  'nav.feed': 'Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ©',
  'nav.explore': 'Ø§Ø³ØªÙƒØ´Ø§Ù',
  'nav.exploreStock': 'Ø§Ø³ØªÙƒØ´Ø§Ù Ø§Ù„Ù…Ø®Ø²ÙˆÙ†',
  'nav.offersBuyer': 'Ø¹Ø±ÙˆØ¶ÙŠ',
  'nav.rfqs': 'Ø·Ù„Ø¨Ø§Øª Ø¹Ø±ÙˆØ¶ Ø§Ù„Ø£Ø³Ø¹Ø§Ø±',
  'nav.orders': 'Ø§Ù„Ø·Ù„Ø¨Ø§Øª',
  'nav.shipments': 'Ø§Ù„Ø´Ø­Ù†Ø§Øª',
  'nav.messages': 'Ø§Ù„Ø±Ø³Ø§Ø¦Ù„',
  'nav.saved': 'Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø§Øª',
  'nav.savedLots': 'Ø§Ù„Ø¯ÙØ¹Ø§Øª Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø©',
  'nav.notifications': 'Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª',
  'nav.help': 'Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯Ø©',
  'nav.helpCentre': 'Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯Ø©',
  'nav.howItWorks': 'ÙƒÙŠÙ ÙŠØ¹Ù…Ù„ Ø§Ù„Ù…ÙˆÙ‚Ø¹',
  'nav.profile': 'Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø´Ø®ØµÙŠ',
  'nav.listings': 'Ø¥Ø¹Ù„Ø§Ù†Ø§ØªÙŠ',
  'nav.post': 'Ù†Ø´Ø± Ù…Ø®Ø²ÙˆÙ†',
  'nav.postStock': 'Ù†Ø´Ø± Ù…Ø®Ø²ÙˆÙ†',
  'nav.offersSup': 'Ø§Ù„Ø¹Ø±ÙˆØ¶',
  'nav.rfqOpps': 'ÙØ±Øµ Ø·Ù„Ø¨Ø§Øª Ø¹Ø±ÙˆØ¶ Ø§Ù„Ø£Ø³Ø¹Ø§Ø±',
  'nav.verification': 'Ø§Ù„ØªÙˆØ«ÙŠÙ‚',
  'nav.suppliers': 'Ø§Ù„Ù…ÙˆØ±Ø¯ÙˆÙ†',
  'nav.overview': 'Ù†Ø¸Ø±Ø© Ø¹Ø§Ù…Ø©',
  'nav.adminSuppliers': 'Ø§Ù„Ù…ÙˆØ±Ø¯ÙˆÙ†',
  'nav.adminVerify': 'Ù…ÙƒØªØ¨ Ø§Ù„ØªÙˆØ«ÙŠÙ‚',
  'nav.adminListings': 'Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†Ø§Øª',
  'nav.adminRfqs': 'Ø·Ù„Ø¨Ø§Øª Ø¹Ø±ÙˆØ¶ Ø§Ù„Ø£Ø³Ø¹Ø§Ø±',
  'nav.adminPayments': 'Ø§Ù„Ù…Ø¯ÙÙˆØ¹Ø§Øª',
  'nav.sources': 'Ù…ØµØ§Ø¯Ø± Ø§Ù„ØªÙˆØ±ÙŠØ¯',
  'nav.growth': 'Ø§Ù„Ù„Ø§ÙØªØ§Øª ÙˆØ§Ù„Ø¹Ø±ÙˆØ¶ Ø§Ù„ØªØ±ÙˆÙŠØ¬ÙŠØ©',
  'nav.features': 'Ø§Ù„Ù…ÙŠØ²Ø§Øª',

  'topbar.searchPlaceholder': 'Ø§Ø¨Ø­Ø« Ø¹Ù† Ù…Ù†ØªØ¬Ø§Øª Ø£Ùˆ Ù…ÙˆØ±Ø¯ÙŠÙ† Ø£Ùˆ ÙØ¦Ø§Øªâ€¦',
  'topbar.searchAria': 'Ø§Ù„Ø¨Ø­Ø« ÙÙŠ Ø§Ù„Ø³ÙˆÙ‚',
  'topbar.notifications': 'Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª',
  'topbar.createAccountTitle': 'Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨',
  'topbar.account': 'Ø§Ù„Ø­Ø³Ø§Ø¨',
  'topbar.languageAria': 'Ù„ØºØ© Ø§Ù„ÙˆØ§Ø¬Ù‡Ø©',
  'rail.allIndustries': 'ÙƒÙ„ Ø§Ù„Ù‚Ø·Ø§Ø¹Ø§Øª',
  'rail.howItWorks': 'ÙƒÙŠÙ ÙŠØ¹Ù…Ù„ Ø§Ù„Ù…ÙˆÙ‚Ø¹',
  'sidebar.moreIndustries': 'Ù‚Ø·Ø§Ø¹Ø§Øª Ø£ÙƒØ«Ø±. Ø¨Ù„Ø¯Ø§Ù† Ø£ÙƒØ«Ø±.',
  'sidebar.moreIndustriesSub': 'Ø³ÙˆÙ‚ ÙˆØ§Ø­Ø¯ Ù„Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø¬Ø§Ù‡Ø².',

  'gate.title': 'ÙˆØµÙˆÙ„ Ø§Ù„Ø£Ø¹Ø¶Ø§Ø¡',
  'gate.body':
    'Ø§Ù„ØªÙˆØ§ØµÙ„ Ù…Ø¹ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† ÙˆÙ†Ø´Ø± Ø§Ù„Ø·Ù„Ø¨Ø§Øª ÙˆØªÙ‚Ø¯ÙŠÙ… Ø¹Ø±ÙˆØ¶ Ø§Ù„Ø£Ø³Ø¹Ø§Ø± ÙƒÙ„Ù‡Ø§ Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª Ù„Ù„Ø£Ø¹Ø¶Ø§Ø¡. ØªØµÙØ­ Ø§Ù„Ø³ÙˆÙ‚ ÙŠØ¨Ù‚Ù‰ Ù…Ø¬Ø§Ù†ÙŠÙ‹Ø§ ÙˆÙ…ØªØ§Ø­Ù‹Ø§ Ù„Ù„Ø¬Ù…ÙŠØ¹.',
  'gate.createAccount': 'Ø£Ù†Ø´Ø¦ Ø­Ø³Ø§Ø¨Ù‹Ø§ Ù…Ø¬Ø§Ù†ÙŠÙ‹Ø§',
  'gate.haveAccount': 'Ù„Ø¯ÙŠÙ‘ Ø­Ø³Ø§Ø¨ Ø¨Ø§Ù„ÙØ¹Ù„',

  'cards.noPhoto': 'Ù„Ø§ ØªÙˆØ¬Ø¯ ØµÙˆØ±Ø©',
  'cards.moq': 'MOQ',
  'cards.saveLot': 'Ø­ÙØ¸ Ù‡Ø°Ù‡ Ø§Ù„Ø¯ÙØ¹Ø©',
  'cards.demo': 'ØªØ¬Ø±ÙŠØ¨ÙŠ',
  'cards.demoTitle': 'Ø¨ÙŠØ§Ù†Ø§Øª ØªØ¬Ø±ÙŠØ¨ÙŠØ© â€” Ù„ÙŠØ³Øª Ø¹Ø±Ø¶Ù‹Ø§ Ø­Ù‚ÙŠÙ‚ÙŠÙ‹Ø§',
  'cards.inspections': 'Ø¹Ù…Ù„ÙŠØ§Øª ØªÙØªÙŠØ´',

  'auth.signIn.sub': 'Ø§Ù„ÙˆØµÙˆÙ„ Ø¥Ù„Ù‰ Ø·Ù„Ø¨Ø§ØªÙƒ ÙˆØ¹Ø±ÙˆØ¶Ùƒ ÙˆØ·Ù„Ø¨Ø§Øª Ø¹Ø±ÙˆØ¶ Ø§Ù„Ø£Ø³Ø¹Ø§Ø±.',
  'auth.email': 'Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ',
  'auth.password': 'ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±',
  'auth.signInCta': 'ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„',
  'auth.newHere': 'Ø¬Ø¯ÙŠØ¯ Ù‡Ù†Ø§ØŸ',
  'auth.demoNotice': 'ØªÙ†Ø¨ÙŠÙ‡ ØªØ¬Ø±ÙŠØ¨ÙŠ',
  'auth.seededLogin': 'Ø­Ø³Ø§Ø¨ Ù…Ø±Ø§Ø¬Ø¹Ø© ØªØ¬Ø±ÙŠØ¨ÙŠ',
  'auth.fillIn': 'ØªØ¹Ø¨Ø¦Ø©',
  'auth.demoHintLead': 'Ù‡Ùˆ',
  'auth.demoHintLead2': 'ØªØ¬Ø±ÙŠØ¨ÙŠ',
  'auth.demoHintTail':
    'Ø­Ø³Ø§Ø¨ ØªØ¬Ø±ÙŠØ¨ÙŠ Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ù„ÙˆØ­Ø© Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©. Ù„ÙŠØ³ Ø¨Ø§Ø¦Ø¹Ù‹Ø§ Ø­Ù‚ÙŠÙ‚ÙŠÙ‹Ø§ â€” Ù„Ø§ ØªÙØ¯Ø®Ù„ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ø¹ØªÙ…Ø§Ø¯ Ø­Ù‚ÙŠÙ‚ÙŠØ©.',
  'auth.demoHintProduct': 'Ù…Ø¯ÙŠØ±',
  'auth.signInFailed': 'ÙØ´Ù„ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„',
  'auth.signUp.title': 'Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨',
  'auth.signUp.sub': 'Ø­Ø³Ø§Ø¨ ÙˆØ§Ø­Ø¯ Ù„Ù„Ø´Ø±Ø§Ø¡ Ø£Ùˆ Ø§Ù„Ø¨ÙŠØ¹ Ø£Ùˆ ØªÙ‚Ø¯ÙŠÙ… Ø®Ø¯Ù…Ø§Øª Ø§Ù„ØªÙØªÙŠØ´ ÙˆØ§Ù„Ø®Ø¯Ù…Ø§Øª Ø§Ù„Ù„ÙˆØ¬Ø³ØªÙŠØ©.',
  'auth.fullName': 'Ø§Ù„Ø§Ø³Ù… Ø§Ù„ÙƒØ§Ù…Ù„',
  'auth.workEmail': 'Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¹Ù…Ù„ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ',
  'auth.minChars': '8 Ø£Ø­Ø±Ù Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„',
  'auth.atLeast8': '8 Ø£Ø­Ø±Ù Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„.',
  'auth.iAmA': 'Ø£Ù†Ø§â€¦',
  'auth.company': 'Ø§Ù„Ø´Ø±ÙƒØ©',
  'auth.country': 'Ø§Ù„Ø¨Ù„Ø¯',
  'auth.countryHint': 'ØªØ±ÙƒÙŠØ§ØŒ Ø§Ù„ØµÙŠÙ†â€¦',
  'auth.createCta': 'Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨',
  'auth.alreadyRegistered': 'Ù…Ø³Ø¬Ù„ Ø¨Ø§Ù„ÙØ¹Ù„ØŸ',
  'auth.signUpHint': 'Ø§Ù„Ù†Ø´Ø± Ù…Ø¬Ø§Ù†ÙŠ. Ø´Ø§Ø±Ø§Øª Ø§Ù„Ø«Ù‚Ø© ØªÙÙƒØªØ³Ø¨ Ø¨Ø§Ù„ØªÙˆØ«ÙŠÙ‚ ÙˆØ§Ù„ØªÙØªÙŠØ´ ÙˆØ³Ø¬Ù„ Ø§Ù„ØªØ³Ù„ÙŠÙ….',
  'auth.registerFailed': 'ÙØ´Ù„ Ø§Ù„ØªØ³Ø¬ÙŠÙ„',
  'auth.role.buyer': 'Ù…Ø´ØªØ±Ù',
  'auth.role.buyerHint': 'Ø£Ø¨Ø­Ø« Ø¹Ù† Ù…Ù†ØªØ¬Ø§Øª',
  'auth.role.supplier': 'Ù…ÙˆØ±Ù‘Ø¯',
  'auth.role.supplierHint': 'Ø£Ø¨ÙŠØ¹ / Ø£ÙØµÙ†Ù‘Ø¹',
  'auth.role.inspector': 'Ù…ÙØªØ´',
  'auth.role.inspectorHint': 'Ø£ÙØ­Øµ Ø§Ù„Ù…ØµØ§Ù†Ø¹',
  'auth.role.lab': 'Ù…Ø®ØªØ¨Ø±',
  'auth.role.labHint': 'Ø£Ø®ØªØ¨Ø± Ø§Ù„Ù…ÙˆØ§Ø¯',
  'auth.role.logistics': 'Ù„ÙˆØ¬Ø³ØªÙŠØ§Øª',
  'auth.role.logisticsHint': 'Ø£Ù†Ù‚Ù„ Ø§Ù„Ø¨Ø¶Ø§Ø¦Ø¹',

  'profile.title': 'Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø´Ø®ØµÙŠ',
  'profile.sub': 'Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØªÙŠ ÙŠØ±Ø§Ù‡Ø§ Ø§Ù„Ø·Ø±Ù Ø§Ù„Ø¢Ø®Ø± ÙÙŠ Ø¹Ø±ÙˆØ¶Ùƒ ÙˆØ·Ù„Ø¨Ø§ØªÙƒ ÙˆØ±Ø³Ø§Ø¦Ù„Ùƒ.',
  'profile.signInSub': 'Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ø¥Ø¯Ø§Ø±Ø© Ø­Ø³Ø§Ø¨Ùƒ',
  'profile.notSignedIn': 'Ù„Ù… ØªØ³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„',
  'profile.notSignedInBody': 'Ù…Ù„ÙÙƒ Ø§Ù„Ø´Ø®ØµÙŠ Ø®Ø§Øµ Ø¨Ø­Ø³Ø§Ø¨Ùƒ: Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ø¹Ø±Ø¶Ù‡ ÙˆØªØ¹Ø¯ÙŠÙ„Ù‡.',
  'profile.createAccount': 'Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨',
  'profile.accountDetails': 'Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø­Ø³Ø§Ø¨',
  'profile.unsaved': 'ØªØºÙŠÙŠØ±Ø§Øª ØºÙŠØ± Ù…Ø­ÙÙˆØ¸Ø©',
  'profile.fullName': 'Ø§Ù„Ø§Ø³Ù… Ø§Ù„ÙƒØ§Ù…Ù„',
  'profile.company': 'Ø§Ù„Ø´Ø±ÙƒØ©',
  'profile.notSet': 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯',
  'profile.country': 'Ø§Ù„Ø¨Ù„Ø¯',
  'profile.language': 'Ù„ØºØ© Ø§Ù„ÙˆØ§Ø¬Ù‡Ø©',
  'profile.languageHint': 'ØªØºÙŠÙ‘Ø± Ù„ØºØ© Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© ÙÙˆØ±Ù‹Ø§ ÙˆØªÙØ­ÙØ¸ ÙÙŠ Ø­Ø³Ø§Ø¨Ùƒ Ø¹Ù†Ø¯ Ø§Ù„Ø¶ØºØ· Ø¹Ù„Ù‰ Ø­ÙØ¸ Ø§Ù„ØªØºÙŠÙŠØ±Ø§Øª.',
  'profile.save': 'Ø­ÙØ¸ Ø§Ù„ØªØºÙŠÙŠØ±Ø§Øª',
  'profile.saving': 'Ø¬Ø§Ø±Ù Ø§Ù„Ø­ÙØ¸â€¦',
  'profile.saved': 'ØªÙ… Ø§Ù„Ø­ÙØ¸',
  'profile.savedBody': 'ØªÙ… ØªØ­Ø¯ÙŠØ« Ù…Ù„ÙÙƒ Ø§Ù„Ø´Ø®ØµÙŠ.',
  'profile.identity': 'Ø§Ù„Ù‡ÙˆÙŠØ©',
  'profile.identityNote':
    'Ù„Ø§ ÙŠÙ…ÙƒÙ† ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ ÙˆØ§Ù„Ø¯ÙˆØ± Ù‡Ù†Ø§. ÙŠÙØ«Ø¨ÙÙ‘ØªØ§Ù† Ø¹Ù†Ø¯ Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨ ÙˆÙ„Ø§ ÙŠÙ‚Ø¨Ù„Ù‡Ù…Ø§ ÙˆØ§Ø¬Ù‡Ø© Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø´Ø®ØµÙŠ.',
  'profile.email': 'Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ',
  'profile.role': 'Ø§Ù„Ø¯ÙˆØ±',
  'profile.readOnly': 'Ù„Ù„Ù‚Ø±Ø§Ø¡Ø© ÙÙ‚Ø·',
  'profile.readOnlyEmail': 'Ù„Ù„Ù‚Ø±Ø§Ø¡Ø© ÙÙ‚Ø· â€” ÙˆØ§Ø¬Ù‡Ø© Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø´Ø®ØµÙŠ Ù„Ø§ ØªÙ‚Ø¨Ù„ Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ',
  'profile.readOnlyRole': 'Ù„Ù„Ù‚Ø±Ø§Ø¡Ø© ÙÙ‚Ø· â€” ÙˆØ§Ø¬Ù‡Ø© Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø´Ø®ØµÙŠ Ù„Ø§ ØªÙ‚Ø¨Ù„ Ø§Ù„Ø¯ÙˆØ±',
  'profile.emailStatus': 'Ø­Ø§Ù„Ø© Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ',
  'profile.emailVerified': 'Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ Ù…ÙˆØ«Ù‘Ù‚',
  'profile.emailNotVerified': 'Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ ØºÙŠØ± Ù…ÙˆØ«Ù‘Ù‚',
  'profile.memberSince': 'Ø¹Ø¶Ùˆ Ù…Ù†Ø°',
  'profile.accountLine': 'Ø§Ù„Ø­Ø³Ø§Ø¨ #{id} Â· Ù…Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø¨ØµÙØ© {role}',
  'profile.errName': 'Ø£Ø¯Ø®Ù„ Ø§Ø³Ù…Ùƒ â€” Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© ØªØ±ÙØ¶ Ø§Ù„Ø§Ø³Ù… Ø§Ù„ÙØ§Ø±Øº.',
  'profile.errSave': 'ØªØ¹Ø°Ù‘Ø± Ø­ÙØ¸ Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø´Ø®ØµÙŠ â€” Ø£Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©.',

  'explore.title': 'Ø§Ø³ØªÙƒØ´Ø§Ù Ø§Ù„Ù…Ø®Ø²ÙˆÙ†',
  'explore.subLoading': 'Ø¬Ø§Ø±Ù ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¯ÙØ¹Ø§Øª Ø§Ù„Ù…ØªØ§Ø­Ø©â€¦',
  'explore.subCount': '{n} Ø¥Ø¹Ù„Ø§Ù†Ù‹Ø§ Ù…Ø·Ø§Ø¨Ù‚Ù‹Ø§ Ù„Ù…Ø±Ø´Ø­Ø§ØªÙƒ',
  'explore.searchPlaceholder': 'ÙƒØ§Ø«ÙˆØ¯ Ø§Ù„Ù†Ø­Ø§Ø³ØŒ Ù…Ø¶Ø®Ø§Øªâ€¦',
  'explore.searchAria': 'Ø§Ù„Ø¨Ø­Ø« ÙÙŠ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†Ø§Øª',
  'explore.categoryAria': 'Ø§Ù„ÙØ¦Ø©',
  'explore.allCategories': 'ÙƒÙ„ Ø§Ù„ÙØ¦Ø§Øª',
  'explore.originAria': 'Ø¨Ù„Ø¯ Ø§Ù„Ù…Ù†Ø´Ø£',
  'explore.allCountries': 'ÙƒÙ„ Ø§Ù„Ø¨Ù„Ø¯Ø§Ù†',
  'explore.min': 'Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ $',
  'explore.max': 'Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¹Ù„Ù‰ $',
  'explore.emptyTitle': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¥Ø¹Ù„Ø§Ù†Ø§Øª Ù…Ø·Ø§Ø¨Ù‚Ø© Ù„Ù‡Ø°Ù‡ Ø§Ù„Ù…Ø±Ø´Ø­Ø§Øª',
  'explore.emptyBody': 'Ø¬Ø±Ù‘Ø¨ ÙØ¦Ø© Ø£ÙˆØ³Ø¹ Ø£Ùˆ Ø¨Ù„Ø¯ Ù…Ù†Ø´Ø£ Ù…Ø®ØªÙ„ÙÙ‹Ø§ØŒ Ø£Ùˆ Ø§Ù…Ø³Ø­ Ø§Ù„Ù…Ø±Ø´Ø­Ø§Øª.',
  'explore.page': 'Ø§Ù„ØµÙØ­Ø© {page} Ù…Ù† {pages}',
  'explore.prev': 'â†’ Ø§Ù„Ø³Ø§Ø¨Ù‚',
  'explore.next': 'Ø§Ù„ØªØ§Ù„ÙŠ â†',

  'feed.welcomeBack': 'Ù…Ø±Ø­Ø¨Ù‹Ø§ Ø¨Ø¹ÙˆØ¯ØªÙƒØŒ {name}',
  'feed.title': 'ØªØ¯ÙÙ‚ Ø§Ù„Ø³ÙˆÙ‚',
  'feed.sub': 'Ù…Ø®Ø²ÙˆÙ† Ø¬Ø§Ù‡Ø² ÙˆØ¯ÙØ¹Ø§Øª ÙØ§Ø¦Ø¶Ø© Ù…Ù† Ù…ØµØ§Ù†Ø¹ Ù…ÙˆØ«Ù‘Ù‚Ø© â€” Ø§Ù„Ø£Ø­Ø¯Ø« Ø£ÙˆÙ„Ù‹Ø§.',
  'feed.sellStock': 'Ø¨ÙØ¹ Ù…Ø®Ø²ÙˆÙ†Ù‹Ø§',
  'feed.postRequest': 'Ø§Ù†Ø´Ø± Ø·Ù„Ø¨Ù‹Ø§',
  'feed.lotsCount': '{n} Ø¯ÙØ¹Ø©',
  'feed.lotsMatch': 'Ø¯ÙØ¹Ø© ØªØ·Ø§Ø¨Ù‚ Ù…Ø±Ø´Ø­Ø§ØªÙƒ',
  'feed.verifiedSuppliers': 'Ù…ÙˆØ±Ø¯ Ù…ÙˆØ«Ù‘Ù‚',
  'feed.openRequests': 'Ø·Ù„Ø¨ Ù…ÙØªÙˆØ­',
  'feed.allOrigins': 'ÙƒÙ„ Ø¨Ù„Ø¯Ø§Ù† Ø§Ù„Ù…Ù†Ø´Ø£',
  'feed.searchAria': 'Ø§Ù„Ø¨Ø­Ø« ÙÙŠ Ø§Ù„Ø¯ÙØ¹Ø§Øª',
  'feed.minAria': 'Ø£Ø¯Ù†Ù‰ Ø³Ø¹Ø±',
  'feed.maxAria': 'Ø£Ø¹Ù„Ù‰ Ø³Ø¹Ø±',
  'feed.allIndustries': 'ÙƒÙ„ Ø§Ù„Ù‚Ø·Ø§Ø¹Ø§Øª',
  'feed.noLots': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¯ÙØ¹Ø§Øª',
  'feed.shownRange': '{first}â€“{last} Ù…Ù† {total}',
  'feed.emptyTitle': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¯ÙØ¹Ø§Øª Ù…Ø·Ø§Ø¨Ù‚Ø© Ù„Ù‡Ø°Ù‡ Ø§Ù„Ù…Ø±Ø´Ø­Ø§Øª',
  'feed.emptyBody': 'Ø¬Ø±Ù‘Ø¨ Ù‚Ø·Ø§Ø¹Ù‹Ø§ Ø¢Ø®Ø± Ø£Ùˆ Ø¨Ù„Ø¯ Ù…Ù†Ø´Ø£ Ù…Ø®ØªÙ„ÙÙ‹Ø§ØŒ Ø£Ùˆ Ø§Ù…Ø³Ø­ Ø§Ù„Ù…Ø±Ø´Ø­Ø§Øª.',
  'feed.lookingFor': 'ØªØ¨Ø­Ø« Ø¹Ù† Ø´ÙŠØ¡ Ù…Ø­Ø¯Ø¯ØŸ',
  'feed.postRequestLink': 'Ø§Ù†Ø´Ø± Ø·Ù„Ø¨Ù‹Ø§',
  'feed.lookingForTail': 'ÙˆØ¯Ø¹ Ø§Ù„Ù…ØµØ§Ù†Ø¹ Ø§Ù„Ù…ÙˆØ«Ù‘Ù‚Ø© ØªÙ‚Ø¯Ù‘Ù… Ù„Ùƒ Ø¹Ø±ÙˆØ¶Ù‡Ø§.',
  'feed.sellingInstead': 'ØªØ±ÙŠØ¯ Ø§Ù„Ø¨ÙŠØ¹ Ø¨Ø¯Ù„Ù‹Ø§ Ù…Ù† Ø°Ù„ÙƒØŸ',
  'feed.listYourStock': 'Ø§Ø¹Ø±Ø¶ Ù…Ø®Ø²ÙˆÙ†Ùƒ',
  'feed.signedInAs': 'Ù…Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø¨ØµÙØ© {role}',
  'feed.createFree': 'Ø£Ù†Ø´Ø¦ Ø­Ø³Ø§Ø¨Ù‹Ø§ Ù…Ø¬Ø§Ù†ÙŠÙ‹Ø§',

  'help.title': 'ÙƒÙŠÙ ÙŠØ¹Ù…Ù„ FactoryDepo',
  'help.sub': 'Ù…Ø®Ø²ÙˆÙ† Ø¬Ø§Ù‡Ø²ØŒ ÙˆØ·Ù„Ø¨Ø§Øª Ø¹Ø±ÙˆØ¶ Ø£Ø³Ø¹Ø§Ø±ØŒ ÙˆØªÙˆØ±ÙŠØ¯ Ù…Ø¯Ø¹ÙˆÙ… Ø¨Ø§Ù„ØªÙØªÙŠØ´.',
  'help.buying': 'Ø§Ù„Ø´Ø±Ø§Ø¡',
  'help.buying1.title': '1. ØªØµÙÙ‘Ø­ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø¬Ø§Ù‡Ø².',
  'help.buying1':
    'ÙƒÙ„ Ø¯ÙØ¹Ø© Ù…ØªØ§Ø­Ø© ØªØ¹Ø±Ø¶ Ø³Ø¹Ø±Ù‡Ø§ ÙˆØ§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ø·Ù„Ø¨ ÙˆØ¨Ù„Ø¯ Ø§Ù„Ù…Ù†Ø´Ø£ ÙˆØ§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…ØªØ§Ø­Ø© ÙØ¹Ù„ÙŠÙ‹Ø§. Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†Ø§Øª Ø§Ù„Ù…Ø¹Ù„Ù‘Ù…Ø© Ø¨Ù€ Â«ØªØ¬Ø±ÙŠØ¨ÙŠÂ» Ø¨ÙŠØ§Ù†Ø§Øª ØªØ¬Ø±ÙŠØ¨ÙŠØ© â€” ÙˆÙ„ÙŠØ³Øª Ø¹Ø±ÙˆØ¶Ù‹Ø§ Ø­Ù‚ÙŠÙ‚ÙŠØ© â€” ÙˆÙ…ÙˆØ³ÙˆÙ…Ø© Ø­ØªÙ‰ Ù„Ø§ ØªÙØ¶Ù„ÙÙ‘Ù„.',
  'help.buying2.title': '2. Ø§Ø·Ù„Ø¨ Ø¹Ø±Ø¶ Ø³Ø¹Ø±.',
  'help.buying2':
    'Ø§Ù†Ø´Ø± Ø·Ù„Ø¨Ù‹Ø§ ÙŠÙˆØ¶Ø­ Ù…Ø§ ØªØ­ØªØ§Ø¬Ù‡. ÙŠÙ‚Ø¯Ù‘Ù… Ø§Ù„Ù…ÙˆØ±Ø¯ÙˆÙ† Ø¹Ø±Ø¶Ù‹Ø§ Ø¨Ø§Ù„Ø³Ø¹Ø± ÙˆÙ…Ø¯Ø© Ø§Ù„ØªÙ†ÙÙŠØ° ÙˆØ´Ø±ÙˆØ·Ù‡Ù….',
  'help.buying3.title': '3. Ù‚Ø§Ø±Ù† Ø«Ù… Ø§Ù„ØªØ²Ù….',
  'help.buying3': 'ØªØ¸Ù‡Ø± Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø¬Ù†Ø¨Ù‹Ø§ Ø¥Ù„Ù‰ Ø¬Ù†Ø¨ Ø¹Ù„Ù‰ Ø§Ù„Ø·Ù„Ø¨. Ù‚Ø¨ÙˆÙ„ Ø£Ø­Ø¯Ù‡Ø§ ÙŠÙÙ†Ø´Ø¦ Ø·Ù„Ø¨ Ø´Ø±Ø§Ø¡.',
  'help.buying4.title': '4. Ø§Ø¯ÙØ¹ Ø¨Ø­ÙˆØ§Ù„Ø© Ù…ØµØ±ÙÙŠØ©.',
  'help.buying4':
    'Ø§Ù„ØªØ¬Ø§Ø±Ø© Ø§Ù„ØµÙ†Ø§Ø¹ÙŠØ© Ù„Ø§ ØªØ¹Ù…Ù„ Ø¨Ø§Ù„Ø¨Ø·Ø§Ù‚Ø§Øª. ØªØ³ØªÙ„Ù… ÙØ§ØªÙˆØ±Ø© Ø£ÙˆÙ„ÙŠØ©ØŒ ÙˆØªØ³Ø¯Ø¯ Ø¨Ø­ÙˆØ§Ù„Ø© TTØŒ ÙˆÙŠÙØ¹Ù„ÙÙ‘Ù… Ø§Ù„Ø·Ù„Ø¨ Ù…Ø¯ÙÙˆØ¹Ù‹Ø§ Ø¨Ø¹Ø¯ ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø£Ù…ÙˆØ§Ù„.',
  'help.selling': 'Ø§Ù„Ø¨ÙŠØ¹',
  'help.selling1.title': '1. Ø£Ù†Ø´Ø¦ Ø­Ø³Ø§Ø¨ Ù…ÙˆØ±Ù‘Ø¯.',
  'help.selling1': 'Ø§Ù„ØªØ³Ø¬ÙŠÙ„ ÙƒÙ…ÙˆØ±Ù‘Ø¯ ÙŠÙ†Ø´Ø¦ Ù…Ù„Ù Ø´Ø±ÙƒØªÙƒ ÙÙˆØ±Ù‹Ø§.',
  'help.selling2.title': '2. Ø§Ù†Ø´Ø± Ù…Ø®Ø²ÙˆÙ†Ùƒ.',
  'help.selling2':
    'Ø£Ø¯ÙˆØ§Øª Ø§Ù„Ù†Ø´Ø± Ù‚ÙŠØ¯ Ø§Ù„ØªØ·ÙˆÙŠØ± Ø§Ù„Ø¢Ù† â€” ÙˆØ¥Ù„Ù‰ Ø£Ù† ØªØµØ¯Ø±ØŒ ÙŠØ¶ÙŠÙ ÙØ±ÙŠÙ‚Ù†Ø§ Ø¥Ø¹Ù„Ø§Ù†Ø§Øª Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„ØªØ³Ø¬ÙŠÙ„.',
  'help.selling3.title': '3. Ù‚Ø¯Ù‘Ù… Ø¹Ø±ÙˆØ¶Ù‹Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„ÙˆØ§Ø±Ø¯Ø©.',
  'help.selling3':
    'ØªØ¸Ù‡Ø± Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ù…Ø´ØªØ±ÙŠÙ† Ø§Ù„Ù…ÙØªÙˆØ­Ø© ÙÙŠ Ù„ÙˆØ­ØªÙƒ Ù…Ø¹ Ø¹Ø¯Ø¯ Ù…Ø¨Ø§Ø´Ø± Ù„Ù…Ø§ Ù„Ù… ØªØ¬Ø¨ Ø¹Ù„ÙŠÙ‡.',
  'help.selling4.title': '4. ÙˆØ«Ù‘Ù‚ Ø­Ø³Ø§Ø¨Ùƒ.',
  'help.selling4':
    'Ù…Ø³ØªÙˆÙŠØ§Øª Ø§Ù„ØªÙˆØ«ÙŠÙ‚ ØªÙØªØ­ Ø§Ù„Ø¸Ù‡ÙˆØ±. Ù„Ø§ ØªÙÙ…Ù†Ø­ Ø§Ù„Ø´Ø§Ø±Ø§Øª Ø¥Ù„Ø§ Ø¨Ø¹Ø¯ Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§ØªØŒ Ù„Ø°Ø§ Ù„Ù„Ø´Ø§Ø±Ø© Ù‡Ù†Ø§ Ù…Ø¹Ù†Ù‰.',
  'help.notLive': 'Ù…Ø§ Ù„Ù… ÙŠÙØ·Ù„Ù‚ Ø¨Ø¹Ø¯',
  'help.notLiveLead': 'Ù†ÙØ¶Ù‘Ù„ Ù‚ÙˆÙ„ Ø°Ù„Ùƒ Ø¨ØµØ±Ø§Ø­Ø© Ø¨Ø¯Ù„Ù‹Ø§ Ù…Ù† Ø£Ù† ØªÙƒØªØ´ÙÙ‡ Ø¨Ù†ÙØ³Ùƒ:',
  'help.notLive1': 'Ø£Ø¯ÙˆØ§Øª Ù†Ø´Ø± Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† Ø§Ù„Ø°Ø§ØªÙŠØ© Ù‚ÙŠØ¯ Ø§Ù„ØªØ·ÙˆÙŠØ±.',
  'help.notLive2': 'Ø§Ù„Ù…Ø±Ø§Ø³Ù„Ø© Ø¨ÙŠÙ† Ø§Ù„Ù…Ø´ØªØ±ÙŠ ÙˆØ§Ù„Ù…ÙˆØ±Ø¯ ØºÙŠØ± Ù…ØªØ§Ø­Ø© Ø¨Ø¹Ø¯ â€” Ø§Ø³ØªØ®Ø¯Ù… Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø§ØªØµØ§Ù„ ÙÙŠ Ù…Ù„Ù Ø§Ù„Ù…ÙˆØ±Ø¯.',
  'help.notLive3': 'Ø§Ù„Ø¹Ø±ÙˆØ¶ ÙˆØ§Ù„Ø¹Ø±ÙˆØ¶ Ø§Ù„Ù…Ø¶Ø§Ø¯Ø© ØªÙØ¯Ø§Ø± ÙŠØ¯ÙˆÙŠÙ‹Ø§ ÙÙŠ Ø§Ù„ÙˆÙ‚Øª Ø§Ù„Ø­Ø§Ù„ÙŠ.',
  'help.notLive4': 'ØªØªØ¨Ø¹ Ø§Ù„Ø´Ø­Ù†Ø§Øª ÙˆÙ…Ø¹Ø§Ù„Ø¬Ø© Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª ØºÙŠØ± Ù…Ø¨Ù†ÙŠÙŠÙ† Ø¨Ø¹Ø¯.',
  'help.exploreCta': 'Ø§Ø³ØªÙƒØ´Ø§Ù Ø§Ù„Ù…Ø®Ø²ÙˆÙ†',
  'help.rfqCta': 'Ø·Ù„Ø¨Ø§Øª Ø¹Ø±ÙˆØ¶ Ø§Ù„Ø£Ø³Ø¹Ø§Ø±',

  'soon.sub': 'Ù„Ù… ÙŠÙØ¨Ù†Ù Ø¨Ø¹Ø¯',
  'soon.title': 'Ù‡Ø°Ø§ Ø§Ù„Ø¹Ø±Ø¶ Ø¶Ù…Ù† Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ·ÙˆÙŠØ± Ø§Ù„ØªØ§Ù„ÙŠØ©',
  'soon.body': 'Ø§Ù„Ø´Ø§Ø´Ø© Ù…ÙˆØ¬ÙˆØ¯Ø© ÙÙŠ Ø§Ù„ØªÙ†Ù‚Ù„ØŒ Ù„ÙƒÙ† Ø¬Ø¯Ø§ÙˆÙ„ Ø¨ÙŠØ§Ù†Ø§ØªÙ‡Ø§ ÙˆÙ†Ù‚Ø§Ø· ÙˆØ§Ø¬Ù‡Ø© Ø§Ù„Ø¨Ø±Ù…Ø¬Ø© Ù„Ù… ØªÙØ¨Ù†Ù Ø¨Ø¹Ø¯.',
  'soon.note.offers': 'ÙŠØµÙ„ Ø¬Ø¯ÙˆÙ„ Ø§Ù„Ø¹Ø±ÙˆØ¶ ÙˆØ§Ù„Ø¹Ø±ÙˆØ¶ Ø§Ù„Ù…Ø¶Ø§Ø¯Ø© ÙÙŠ Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ·ÙˆÙŠØ± Ø§Ù„ØªØ§Ù„ÙŠØ©.',
  'soon.note.shipments': 'ØªØµÙ„ Ù…Ø±Ø§Ø­Ù„ Ø§Ù„Ø´Ø­Ù† ÙˆÙ…Ø³ØªÙ†Ø¯Ø§ØªÙ‡ ÙÙŠ Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ·ÙˆÙŠØ± Ø§Ù„ØªØ§Ù„ÙŠØ©.',
  'soon.note.messages': 'ØªØµÙ„ Ù…Ø±Ø§Ø³Ù„Ø© Ø§Ù„Ù…Ø´ØªØ±ÙŠ â†” Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ ÙÙŠ Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ·ÙˆÙŠØ± Ø§Ù„ØªØ§Ù„ÙŠØ©.',
  'soon.note.saved': 'ØªØµÙ„ Ø§Ù„Ø¯ÙØ¹Ø§Øª Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø© ÙÙŠ Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ·ÙˆÙŠØ± Ø§Ù„ØªØ§Ù„ÙŠØ©.',
  'soon.note.notifications': 'ÙŠØµÙ„ Ù…Ø±ÙƒØ² Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª ÙÙŠ Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ·ÙˆÙŠØ± Ø§Ù„ØªØ§Ù„ÙŠØ©.',
  'soon.note.profile': 'ÙŠØµÙ„ ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø´Ø®ØµÙŠ ÙÙŠ Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ·ÙˆÙŠØ± Ø§Ù„ØªØ§Ù„ÙŠØ©.',
  'soon.note.listings': 'ØªØµÙ„ Ø¥Ø¯Ø§Ø±Ø© Ø¥Ø¹Ù„Ø§Ù†Ø§Øª Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ Ù…Ø¹ Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„Ù…Ù„ÙƒÙŠØ© ÙÙŠ Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ·ÙˆÙŠØ± Ø§Ù„ØªØ§Ù„ÙŠØ©.',
  'soon.note.post': 'ÙŠØµÙ„ Ø¥Ù†Ø´Ø§Ø¡/ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† Ù…Ø¹ Ø±ÙØ¹ Ø§Ù„ØµÙˆØ± ÙÙŠ Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ·ÙˆÙŠØ± Ø§Ù„ØªØ§Ù„ÙŠØ©.',
  'soon.note.generic': 'ÙŠØµÙ„ ÙÙŠ Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ·ÙˆÙŠØ± Ø§Ù„ØªØ§Ù„ÙŠØ©.',
  'soon.note.verification': 'ØªØµÙ„ Ù…Ø³ØªÙˆÙŠØ§Øª Ø§Ù„ØªÙˆØ«ÙŠÙ‚ ÙˆØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª ÙÙŠ Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ·ÙˆÙŠØ± Ø§Ù„ØªØ§Ù„ÙŠØ©.',
  'soon.note.admin': 'ØªØµÙ„ Ù„ÙˆØ­Ø© Ø§Ù„Ø¥Ø¯Ø§Ø±Ø© ÙÙŠ Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ·ÙˆÙŠØ± Ø§Ù„ØªØ§Ù„ÙŠØ©.',
  'soon.note.sources': 'ÙŠØµÙ„ Ø§Ù„Ø¥Ø¯Ø®Ø§Ù„ Ø§Ù„ÙŠØ¯ÙˆÙŠ Ù„Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† ÙÙŠ Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ·ÙˆÙŠØ± Ø§Ù„ØªØ§Ù„ÙŠØ©.',
  'soon.note.features': 'ØªØµÙ„ Ù…ÙØ§ØªÙŠØ­ Ø§Ù„Ù…ÙŠØ²Ø§Øª ÙÙŠ Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ·ÙˆÙŠØ± Ø§Ù„ØªØ§Ù„ÙŠØ©.',

  'orders.title': 'Ø§Ù„Ø·Ù„Ø¨Ø§Øª',
  'orders.signInSub': 'Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ø¹Ø±Ø¶ Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„ØªÙŠ Ø£Ù†Øª Ø·Ø±Ù ÙÙŠÙ‡Ø§',
  'orders.notSignedIn': 'Ù„Ù… ØªØ³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„',
  'orders.notSignedInBody': 'Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø®Ø§ØµØ©: Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„ØªØ±Ù‰ Ù…Ø§ Ø§Ù„ØªØ²Ù…Øª Ø¨Ø´Ø±Ø§Ø¦Ù‡ Ø£Ùˆ Ø¨ÙŠØ¹Ù‡.',
  'orders.createAccount': 'Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨',
  'orders.subSupplier': 'Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„ØªÙŠ Ù‚Ø¯Ù‘Ù…Ù‡Ø§ Ø§Ù„Ù…Ø´ØªØ±ÙˆÙ† Ø¹Ù„Ù‰ Ù…Ø®Ø²ÙˆÙ†Ùƒ',
  'orders.subBuyer': 'ÙƒÙ„ Ù…Ø§ Ø§Ù„ØªØ²Ù…Øª Ø¨Ø´Ø±Ø§Ø¦Ù‡',
  'orders.statListings': 'Ø¥Ø¹Ù„Ø§Ù†Ø§ØªÙŠ',
  'orders.statOffersReceived': 'Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø§Ù„Ù…Ø³ØªÙ„Ù…Ø©',
  'orders.statOffersOnRfqs': 'Ø¹Ø±ÙˆØ¶ Ø¹Ù„Ù‰ Ø·Ù„Ø¨Ø§ØªÙŠ',
  'orders.statOrders': 'Ø§Ù„Ø·Ù„Ø¨Ø§Øª',
  'orders.statSoldItems': 'Ø§Ù„Ø£ØµÙ†Ø§Ù Ø§Ù„Ù…Ø¨ÙŠØ¹Ø©',
  'orders.statSoldTitle': 'Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ù…Ø´Ø­ÙˆÙ†Ø© Ø£Ùˆ Ø§Ù„Ù…Ø³Ù„Ù‘Ù…Ø©',
  'orders.statViews': 'Ø§Ù„Ù…Ø´Ø§Ù‡Ø¯Ø§Øª',
  'orders.statViewsTitle': 'Ø§Ù„Ù…Ø´Ø§Ù‡Ø¯Ø§Øª Ø§Ù„Ù…Ø³Ø¬ÙÙ‘Ù„Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†Ø§Øª Ø¶Ù…Ù† Ù†Ø·Ø§Ù‚Ùƒ',
  'orders.metricsError': 'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…Ø¤Ø´Ø±Ø§Øª Ø§Ù„Ø¢Ù†.',
  'orders.loadErrorTitle': 'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø·Ù„Ø¨Ø§Øª',
  'orders.loadErrorBody': 'Ù„Ù… ØªÙØ±Ø¬Ø¹ Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© Ø·Ù„Ø¨Ø§ØªÙƒ. Ø­Ø¯Ù‘Ø« Ø§Ù„ØµÙØ­Ø© Ø£Ùˆ Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.',
  'orders.emptyTitle': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª Ø¨Ø¹Ø¯',
  'orders.emptySupplier': 'Ø¹Ù†Ø¯Ù…Ø§ ÙŠØ·Ù„Ø¨ Ù…Ø´ØªØ±Ù Ù…Ù† Ù…Ø®Ø²ÙˆÙ†Ùƒ ÙŠØ¸Ù‡Ø± Ø§Ù„Ø·Ù„Ø¨ Ù‡Ù†Ø§.',
  'orders.emptyBuyer': 'Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø´Ø±Ø§Ø¡ Ø§Ù„ÙÙˆØ±ÙŠ Ø§Ù„ØªÙŠ ØªÙ‚Ø¯Ù‘Ù…Ù‡Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø¬Ø§Ù‡Ø² ØªØ¸Ù‡Ø± Ù‡Ù†Ø§.',
  'orders.browseStock': 'ØªØµÙÙ‘Ø­ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø¬Ø§Ù‡Ø²',
  'orders.postRfq': 'Ø§Ù†Ø´Ø± Ø·Ù„Ø¨ Ø¹Ø±Ø¶ Ø³Ø¹Ø±',
  'orders.count': '{n} Ø·Ù„Ø¨Ù‹Ø§',
  'orders.col.order': 'Ø§Ù„Ø·Ù„Ø¨',
  'orders.col.product': 'Ø§Ù„Ù…Ù†ØªØ¬',
  'orders.col.counterparty': 'Ø§Ù„Ø·Ø±Ù Ø§Ù„Ø¢Ø®Ø±',
  'orders.col.qty': 'Ø§Ù„ÙƒÙ…ÙŠØ©',
  'orders.col.total': 'Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ',
  'orders.col.status': 'Ø§Ù„Ø­Ø§Ù„Ø©',
  'orders.col.date': 'Ø§Ù„ØªØ§Ø±ÙŠØ®',
  'orders.buyerLabel': 'Ù…Ø´ØªØ±Ù',
  'orders.supplierLabel': 'Ù…ÙˆØ±Ù‘Ø¯',
  'orders.buyerId': 'Ø§Ù„Ù…Ø´ØªØ±ÙŠ #{id}',

  'product.loadingTitle': 'Ø¬Ø§Ø±Ù Ø§Ù„ØªØ­Ù…ÙŠÙ„â€¦',
  'product.loadingThis': 'Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†',
  'product.fetching': 'Ø¬Ø§Ø±Ù Ø¥Ø­Ø¶Ø§Ø± {what}â€¦',
  'product.notFound': 'Ø§Ù„Ù…Ù†ØªØ¬ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯',
  'product.backToExplore': 'Ø§Ù„Ø¹ÙˆØ¯Ø© Ø¥Ù„Ù‰ Ø§Ù„Ø§Ø³ØªÙƒØ´Ø§Ù',
  'product.noPhoto': 'Ù„Ø§ ØªÙˆØ¬Ø¯ ØµÙˆØ±Ø© Ù„Ù‡Ø°Ù‡ Ø§Ù„Ø¯ÙØ¹Ø©',
  'product.pricePer': 'Ø§Ù„Ø³Ø¹Ø± / {unit}',
  'product.minOrder': 'Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ Ù„Ù„Ø·Ù„Ø¨',
  'product.availableNow': 'Ø§Ù„Ù…ØªØ§Ø­ Ø§Ù„Ø¢Ù†',
  'product.origin': 'Ø¨Ù„Ø¯ Ø§Ù„Ù…Ù†Ø´Ø£',
  'product.unavailable': 'ØºÙŠØ± Ù…ØªØ§Ø­ Ø­Ø§Ù„ÙŠÙ‹Ø§',
  'product.buyNowHeading': 'Ø§Ø´ØªØ±Ù Ø§Ù„Ø¢Ù† â€” Ù…Ø®Ø²ÙˆÙ† Ø¬Ø§Ù‡Ø²',
  'product.soldOutBody': 'Ù‡Ø°Ù‡ Ø§Ù„Ø¯ÙØ¹Ø© Ù…Ø¹Ù„Ù‘Ù…Ø© ÙƒÙ†ÙØ¯Øª Ø§Ù„ÙƒÙ…ÙŠØ©. Ø§Ø·Ù„Ø¨ Ù…Ù† Ø§Ù„Ù…ÙˆØ±Ø¯ Ø§Ù„Ø¯ÙØ¹Ø© Ø§Ù„ØªØ§Ù„ÙŠØ©.',
  'product.noUnitsBody': 'Ù„Ø§ ØªÙˆØ¬Ø¯ ÙˆØ­Ø¯Ø§Øª Ù…ØªØ§Ø­Ø© Ø§Ù„Ø¢Ù†. Ø§Ø·Ù„Ø¨ Ù…Ù† Ø§Ù„Ù…ÙˆØ±Ø¯ Ø§Ù„Ø¯ÙØ¹Ø© Ø§Ù„ØªØ§Ù„ÙŠØ©.',
  'product.purchaseTerms': 'Ø§Ø´ØªØ±Ù Ø¨Ø³Ø¹Ø± Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† {price} Ù„ÙƒÙ„ {unit}ØŒ Ø¨Ø­Ø¯ Ø£Ø¯Ù†Ù‰ {moq} {unit}.',
  'product.stockOnHand': 'Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ù…ØªÙˆÙØ±',
  'product.buyNowPrice': 'Ø§Ø´ØªØ±Ù Ø§Ù„Ø¢Ù† Â· {price}/{unit}',
  'product.outOfStock': 'Ø§Ø´ØªØ±Ù Ø§Ù„Ø¢Ù† â€” Ù†ÙØ¯Øª Ø§Ù„ÙƒÙ…ÙŠØ©',
  'product.requestQuote': 'Ø§Ø·Ù„Ø¨ Ø¹Ø±Ø¶ Ø³Ø¹Ø±',
  'product.shipsFrom': 'ÙŠÙØ´Ø­Ù† Ù…Ù† {country}',
  'product.signInToOrder': 'Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ù„Ø´Ø±Ø§Ø¡ Ø£Ùˆ Ù„Ø·Ù„Ø¨ Ø¹Ø±Ø¶ Ø³Ø¹Ø±.',
  'product.supplier': 'Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯',
  'product.viewProfile': 'Ø¹Ø±Ø¶ Ø§Ù„Ù…Ù„Ù',
  'product.loadingSupplier': 'Ø¬Ø§Ø±Ù ØªØ­Ù…ÙŠÙ„ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯â€¦',
  'product.supplierUnavailable': 'Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ ØºÙŠØ± Ù…ØªØ§Ø­Ø©.',
  'product.rating': 'Ø§Ù„ØªÙ‚ÙŠÙŠÙ…',
  'product.inspections': 'Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„ØªÙØªÙŠØ´',
  'product.fulfilment': 'Ø§Ù„ØªØ³Ù„ÙŠÙ… ÙÙŠ Ø§Ù„Ù…ÙˆØ¹Ø¯',
  'product.verifiedLevel': 'Ù…Ø³ØªÙˆÙ‰ Ø§Ù„ØªÙˆØ«ÙŠÙ‚',
  'product.levelN': 'Ø§Ù„Ù…Ø³ØªÙˆÙ‰ {n}',
  'product.tradingSince': 'ÙŠØ¹Ù…Ù„ Ù…Ù†Ø°',
  'product.supplierFiguresHint': 'Ø§Ù„Ø£Ø±Ù‚Ø§Ù… Ø¹Ù„Ù‰ Ù…Ø³ØªÙˆÙ‰ Ø§Ù„Ø³ÙˆÙ‚ Ù„Ù‡Ø°Ø§ Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ØŒ ÙˆÙ„ÙŠØ³Øª Ù„Ù‡Ø°Ù‡ Ø§Ù„Ø¯ÙØ¹Ø© ÙÙ‚Ø·.',
  'product.description': 'Ø§Ù„ÙˆØµÙ',
  'product.noDescription': 'Ù„Ù… ÙŠØ¶Ù Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ ÙˆØµÙÙ‹Ø§. Ø§Ø·Ù„Ø¨ Ø¹Ø±Ø¶ Ø³Ø¹Ø± Ù„Ù„Ù…ÙˆØ§ØµÙØ§Øª ÙˆÙ…Ø¯Ø© Ø§Ù„ØªÙ†ÙÙŠØ° ÙˆØ´Ø±ÙˆØ· Ø§Ù„ØªØ³Ù„ÙŠÙ….',
  'product.specification': 'Ø§Ù„Ù…ÙˆØ§ØµÙØ§Øª',
  'product.noSpec': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…ÙˆØ§ØµÙØ§Øª Ù…Ø³Ø¬Ù„Ø© Ù„Ù‡Ø°Ù‡ Ø§Ù„Ø¯ÙØ¹Ø©.',
  'product.col.attribute': 'Ø§Ù„Ø®Ø§ØµÙŠØ©',
  'product.col.value': 'Ø§Ù„Ù‚ÙŠÙ…Ø©',
  'product.spec.category': 'Ø§Ù„ÙØ¦Ø©',
  'product.spec.unit': 'Ø§Ù„ÙˆØ­Ø¯Ø©',
  'product.spec.purity': 'Ø§Ù„Ù†Ù‚Ø§Ø¡ / Ø§Ù„Ø¯Ø±Ø¬Ø©',

  'checkout.title': 'Ø§Ø´ØªØ±Ù Ø§Ù„Ø¢Ù† â€” Ø¥ØªÙ…Ø§Ù… Ø§Ù„Ø·Ù„Ø¨',
  'checkout.placedTitle': 'ØªÙ… ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ø·Ù„Ø¨',
  'checkout.confirmed': 'ØªÙ… ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø·Ù„Ø¨ #{id}',
  'checkout.notified': 'ØªÙ… Ø¥Ø¨Ù„Ø§Øº Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯. ØªØ§Ø¨Ø¹ Ø§Ù„Ø·Ù„Ø¨ Ù…Ù† ØµÙØ­Ø© Ø§Ù„Ø·Ù„Ø¨Ø§Øª.',
  'checkout.viewOrders': 'Ø¹Ø±Ø¶ Ø§Ù„Ø·Ù„Ø¨Ø§Øª',
  'checkout.keepBrowsing': 'Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„ØªØµÙØ­',
  'checkout.pricePer': 'Ø§Ù„Ø³Ø¹Ø± / {unit}',
  'checkout.minimumOrder': 'Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ Ù„Ù„Ø·Ù„Ø¨',
  'checkout.availableNow': 'Ø§Ù„Ù…ØªØ§Ø­ Ø§Ù„Ø¢Ù†',
  'checkout.quantity': 'Ø§Ù„ÙƒÙ…ÙŠØ© ({unit})',
  'checkout.qtyHint': 'Ø¨ÙŠÙ† {moq} Ùˆ{stock} {unit} ÙÙŠ Ø§Ù„Ù…Ø®Ø²ÙˆÙ†.',
  'checkout.fullName': 'Ø§Ù„Ø§Ø³Ù… Ø§Ù„ÙƒØ§Ù…Ù„',
  'checkout.country': 'Ø§Ù„Ø¨Ù„Ø¯',
  'checkout.address': 'Ø§Ù„Ø¹Ù†ÙˆØ§Ù†',
  'checkout.city': 'Ø§Ù„Ù…Ø¯ÙŠÙ†Ø©',
  'checkout.phone': 'Ø§Ù„Ù‡Ø§ØªÙ',
  'checkout.notes': 'Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ù„Ù„Ù…ÙˆØ±Ù‘Ø¯',
  'checkout.total': 'Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ {total}',
  'checkout.placeOrder': 'ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø·Ù„Ø¨ Â· {total}',
  'checkout.placing': 'Ø¬Ø§Ø±Ù ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ø·Ù„Ø¨â€¦',
  'checkout.errPlace': 'ØªØ¹Ø°Ù‘Ø± ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ø·Ù„Ø¨.',

  'rfqModal.title': 'Ø§Ø·Ù„Ø¨ Ø¹Ø±Ø¶ Ø³Ø¹Ø±',
  'rfqModal.postedTitle': 'ØªÙ… Ù†Ø´Ø± Ø§Ù„Ø·Ù„Ø¨',
  'rfqModal.live': 'Ù…ØªØ·Ù„Ø¨Ùƒ Ù…Ù†Ø´ÙˆØ± Ø§Ù„Ø¢Ù† ÙÙŠ Ù…Ù†ØµØ© Ø·Ù„Ø¨Ø§Øª Ø¹Ø±ÙˆØ¶ Ø§Ù„Ø£Ø³Ø¹Ø§Ø±',
  'rfqModal.canQuote': 'ÙŠÙ…ÙƒÙ† Ù„Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† Ø§Ù„Ù…ÙˆØ«Ù‘Ù‚ÙŠÙ† Ø§Ù„Ø¢Ù† ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ø³Ø¹Ø± ÙˆÙ…Ø¯Ø© Ø§Ù„ØªÙ†ÙÙŠØ°.',
  'rfqModal.viewMine': 'Ø¹Ø±Ø¶ Ø·Ù„Ø¨Ø§ØªÙŠ',
  'rfqModal.listedBy': '{product} Â· Ù…Ø¹Ø±ÙˆØ¶ Ù…Ù† {supplier}',
  'rfqModal.quantity': 'Ø§Ù„ÙƒÙ…ÙŠØ©',
  'rfqModal.unit': 'Ø§Ù„ÙˆØ­Ø¯Ø©',
  'rfqModal.specs': 'Ø§Ù„Ù…ÙˆØ§ØµÙØ§Øª ÙˆØ§Ù„Ø´Ù‡Ø§Ø¯Ø§Øª ÙˆØ´Ø±ÙˆØ· Ø§Ù„ØªØ³Ù„ÙŠÙ…',
  'rfqModal.moqHint': 'Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ø·Ù„Ø¨ ÙÙŠ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† Ù‡Ùˆ {moq} {unit}.',
  'rfqModal.post': 'Ù†Ø´Ø± Ø§Ù„Ø·Ù„Ø¨',
  'rfqModal.posting': 'Ø¬Ø§Ø±Ù Ø§Ù„Ù†Ø´Ø±â€¦',
  'rfqModal.errPost': 'ØªØ¹Ø°Ù‘Ø± Ù†Ø´Ø± Ø§Ù„Ø·Ù„Ø¨.',
  'rfqModal.titleSuffix': 'Ø·Ù„Ø¨ Ø¹Ø±Ø¶ Ø³Ø¹Ø±',

  'suppliers.loadingSub': 'Ø¬Ø§Ø±Ù Ø¥Ø­Ø¶Ø§Ø± Ø¯Ù„ÙŠÙ„ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†',
  'suppliers.loadingBody': 'Ø¬Ø§Ø±Ù Ø¥Ø­Ø¶Ø§Ø± Ø¯Ù„ÙŠÙ„ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†â€¦',
  'suppliers.title': 'Ø¯Ù„ÙŠÙ„ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†',
  'suppliers.sub':
    'Ø§Ù„Ù…ØµØ§Ù†Ø¹ ÙˆØ§Ù„Ø´Ø±ÙƒØ§Øª Ø§Ù„ØªØ¬Ø§Ø±ÙŠØ© Ø¹Ù„Ù‰ FactoryDepo. Ù…Ø³ØªÙˆÙŠØ§Øª Ø§Ù„ØªÙˆØ«ÙŠÙ‚ ØªØ£ØªÙŠ Ù…Ù† Ø§Ù„ØªÙØªÙŠØ´ Ø§Ù„Ù…ÙŠØ¯Ø§Ù†ÙŠ ÙˆÙØ­Øµ Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª.',
  'suppliers.demoNote': 'Ø§Ù„ØµÙÙˆÙ Ø§Ù„Ù…Ø¹Ù„Ù‘Ù…Ø© Ø¨Ù€ Â«ØªØ¬Ø±ÙŠØ¨ÙŠÂ» Ø¨ÙŠØ§Ù†Ø§Øª ØªØ¬Ø±ÙŠØ¨ÙŠØ©',
  'suppliers.loadErrorTitle': 'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¯Ù„ÙŠÙ„',
  'suppliers.loadErrorBody': 'Ù„Ù… ØªØ³ØªØ¬Ø¨ Ø®Ø¯Ù…Ø© Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†. Ø£Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ø¨Ø¹Ø¯ Ù‚Ù„ÙŠÙ„.',
  'suppliers.emptyTitle': 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù…ÙˆØ±Ø¯ÙˆÙ† Ø¨Ø¹Ø¯',
  'suppliers.emptyBody': 'ØªØ¸Ù‡Ø± Ù…Ù„ÙØ§Øª Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† Ù‡Ù†Ø§ Ø¨Ø¹Ø¯ ØªØ³Ø¬ÙŠÙ„Ù‡Ù… ÙˆØªÙˆØ«ÙŠÙ‚Ù‡Ù….',
  'suppliers.totalListed': 'Ø§Ù„Ù…ÙˆØ±Ø¯ÙˆÙ† Ø§Ù„Ù…Ø¯Ø±Ø¬ÙˆÙ†',
  'suppliers.totalVerified': 'Ù…ÙˆØ«Ù‘Ù‚ÙˆÙ† Ø¨Ù…Ø³ØªÙˆÙ‰ 2+',
  'suppliers.avgRating': 'Ù…ØªÙˆØ³Ø· Ø§Ù„ØªÙ‚ÙŠÙŠÙ…',
  'suppliers.avgRatingRated': 'Ù…ØªÙˆØ³Ø· Ø§Ù„ØªÙ‚ÙŠÙŠÙ… ({n} Ù…ÙÙ‚ÙŠÙÙ‘Ù…)',
  'suppliers.avgFulfilment': 'Ø§Ù„ØªØ³Ù„ÙŠÙ… ÙÙŠ Ø§Ù„Ù…ÙˆØ¹Ø¯',
  'suppliers.avgFulfilmentMeasured': 'Ø§Ù„ØªØ³Ù„ÙŠÙ… ÙÙŠ Ø§Ù„Ù…ÙˆØ¹Ø¯ ({n} Ù…Ù‚ÙŠØ³)',
  'suppliers.searchPlaceholder': 'Ø´Ø±ÙƒØ©ØŒ Ø¨Ù„Ø¯ØŒ Ù…Ø¯ÙŠÙ†Ø©ØŒ Ù‚Ø¯Ø±Ø©â€¦',
  'suppliers.searchAria': 'Ø§Ù„Ø¨Ø­Ø« Ø¹Ù† Ù…ÙˆØ±Ø¯ÙŠÙ†',
  'suppliers.verifiedOnly': 'Ø§Ù„Ù…ÙˆØ«Ù‘Ù‚ÙˆÙ† ÙÙ‚Ø·',
  'suppliers.showing': 'Ø¹Ø±Ø¶ {shown} Ù…Ù† {total}',
  'suppliers.noMatchTitle': 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù…ÙˆØ±Ø¯ÙˆÙ† Ù…Ø·Ø§Ø¨Ù‚ÙˆÙ† Ù„Ù‡Ø°Ø§ Ø§Ù„Ø¨Ø­Ø«',
  'suppliers.noMatchBody': 'Ø¬Ø±Ù‘Ø¨ Ø§Ø³Ù… Ø´Ø±ÙƒØ© Ø£Ù‚ØµØ± Ø£Ùˆ Ø§Ù…Ø³Ø­ Ù…Ø±Ø´Ø­ Ø§Ù„ØªÙˆØ«ÙŠÙ‚.',
  'suppliers.rating': 'Ø§Ù„ØªÙ‚ÙŠÙŠÙ…',
  'suppliers.inspections': 'Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„ØªÙØªÙŠØ´',
  'suppliers.fulfilment': 'Ø§Ù„ÙˆÙØ§Ø¡ Ø¨Ø§Ù„ØªØ³Ù„ÙŠÙ…',

  'supplierDetail.loadingThis': 'Ù…Ù„Ù Ù‡Ø°Ø§ Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯',
  'supplierDetail.notFound': 'Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯',
  'supplierDetail.backToDirectory': 'Ø§Ù„Ø¹ÙˆØ¯Ø© Ø¥Ù„Ù‰ Ø§Ù„Ø¯Ù„ÙŠÙ„',
  'supplierDetail.backShort': 'â† Ø§Ù„Ø¹ÙˆØ¯Ø© Ø¥Ù„Ù‰ Ø§Ù„Ø¯Ù„ÙŠÙ„',
  'supplierDetail.tradingSince': 'ÙŠØ¹Ù…Ù„ Ù…Ù†Ø° {year}',
  'supplierDetail.verifiedL3': 'Ù…ÙˆØ«Ù‘Ù‚ Â· Ø§Ù„Ù…Ø³ØªÙˆÙ‰ 3',
  'supplierDetail.registered': 'Ù…Ø³Ø¬Ù‘Ù„',
  'supplierDetail.buyerRating': 'ØªÙ‚ÙŠÙŠÙ… Ø§Ù„Ù…Ø´ØªØ±ÙŠÙ†',
  'supplierDetail.notRated': 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ ØªÙ‚ÙŠÙŠÙ… Ø¨Ø¹Ø¯',
  'supplierDetail.inspections': 'Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„ØªÙØªÙŠØ´ Ø§Ù„Ù…ÙŠØ¯Ø§Ù†ÙŠ',
  'supplierDetail.fulfilment': 'Ø§Ù„ØªØ³Ù„ÙŠÙ… ÙÙŠ Ø§Ù„Ù…ÙˆØ¹Ø¯',
  'supplierDetail.activeListings': 'Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†Ø§Øª Ø§Ù„Ù†Ø´Ø·Ø©',
  'supplierDetail.tier': 'Ù…Ø³ØªÙˆÙ‰ Ø§Ù„ØªÙˆØ«ÙŠÙ‚',
  'supplierDetail.trustScore': 'Ø¯Ø±Ø¬Ø© Ø§Ù„Ø«Ù‚Ø© (0â€“100)',
  'supplierDetail.about': 'Ø¹Ù† {company}',
  'supplierDetail.noDescription': 'Ù„Ù… ÙŠÙ†Ø´Ø± Ù‡Ø°Ø§ Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ ÙˆØµÙÙ‹Ø§ Ù„Ù„Ø´Ø±ÙƒØ© Ø¨Ø¹Ø¯.',
  'supplierDetail.capabilities': 'Ø§Ù„Ù‚Ø¯Ø±Ø§Øª Ø§Ù„Ù…Ø¹Ù„Ù†Ø©',
  'supplierDetail.record': 'Ø§Ù„ØªÙˆØ«ÙŠÙ‚ ÙˆØ§Ù„Ø³Ø¬Ù„',
  'supplierDetail.ratingLabel': 'ØªÙ‚ÙŠÙŠÙ… Ø§Ù„Ù…Ø´ØªØ±ÙŠÙ†',
  'supplierDetail.inspectionsDone': 'Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„ØªÙØªÙŠØ´ Ø§Ù„Ù…ÙƒØªÙ…Ù„Ø©',
  'supplierDetail.contact': 'Ø§Ù„ØªÙˆØ§ØµÙ„',
  'supplierDetail.contactBody': 'ØªÙØ´Ø§Ø±Ùƒ ØªÙ‚Ø§Ø±ÙŠØ± Ø§Ù„ØªÙØªÙŠØ´ ÙˆÙ…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„ØªÙˆØ«ÙŠÙ‚ Ù…Ø¹ Ø§Ù„Ø£Ø¹Ø¶Ø§Ø¡ Ø¨Ø¹Ø¯ Ø£ÙˆÙ„ ØªÙˆØ§ØµÙ„.',
  'supplierDetail.contactSupplier': 'ØªÙˆØ§ØµÙ„ Ù…Ø¹ Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯',
  'supplierDetail.contactHintSignedIn': 'ÙŠÙØªØ­ Ù…Ù†ØµØ© Ø·Ù„Ø¨Ø§Øª Ø¹Ø±ÙˆØ¶ Ø§Ù„Ø£Ø³Ø¹Ø§Ø± â€” Ù…Ø­Ø§Ø¯Ø«Ø© Ø§Ù„Ø¹Ø±Ø¶ ØªØ¬Ø±ÙŠ Ù‡Ù†Ø§Ùƒ.',
  'supplierDetail.contactHintGuest': 'Ù„Ù„Ø£Ø¹Ø¶Ø§Ø¡ ÙÙ‚Ø· Â· Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù… Ù…Ø¬Ø§Ù†ÙŠ',
  'supplierDetail.services': 'Ø§Ù„Ø®Ø¯Ù…Ø§Øª Ø§Ù„ØªØ¬Ø§Ø±ÙŠØ©',
  'supplierDetail.service1': 'ØªÙØªÙŠØ´ Ø§Ù„Ù…ØµÙ†Ø¹ Ù‚Ø¨Ù„ Ø§Ù„Ø¯ÙØ¹',
  'supplierDetail.service2': 'Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± Ø§Ù„Ù…Ø®ØªØ¨Ø±ÙŠ ÙˆØªØ­Ù„ÙŠÙ„ Ø§Ù„Ù…ÙˆØ§Ø¯',
  'supplierDetail.service3': 'Ø§Ù„Ø¥Ø´Ø±Ø§Ù Ø¹Ù„Ù‰ ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø­Ø§ÙˆÙŠØ§Øª',
  'supplierDetail.service4': 'Ø¯Ø¹Ù… Ù…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„ØªØµØ¯ÙŠØ±',
  'supplierDetail.stockFrom': 'Ù…Ø®Ø²ÙˆÙ† {company}',
  'supplierDetail.shown': '{n} Ù…Ø¹Ø±ÙˆØ¶',
  'supplierDetail.loadingLots': 'Ø¬Ø§Ø±Ù ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¯ÙØ¹Ø§Øª Ø§Ù„Ù…ØªØ§Ø­Ø©â€¦',
  'supplierDetail.noneShown': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¥Ø¹Ù„Ø§Ù†Ø§Øª Ù†Ø´Ø·Ø© Ù…Ø¹Ø±ÙˆØ¶Ø©',
  'supplierDetail.noneShownBody':
    'ØªÙØ¨Ù„Øº Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© Ø¹Ù† {n} Ø¥Ø¹Ù„Ø§Ù†Ù‹Ø§ Ù„Ù‡Ø°Ø§ Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ØŒ Ù„ÙƒÙ† Ù„Ù… ÙŠØµÙ„ Ø£ÙŠ Ù…Ù†Ù‡Ø§ ÙÙŠ Ø¹Ø±Ø¶ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†Ø§Øª Ø§Ù„Ø­Ø§Ù„ÙŠ. Ø§Ù†Ø´Ø± Ø·Ù„Ø¨Ù‹Ø§ Ø¹Ø¨Ø± Ù…Ù†ØµØ© Ø·Ù„Ø¨Ø§Øª Ø¹Ø±ÙˆØ¶ Ø§Ù„Ø£Ø³Ø¹Ø§Ø± Ù„Ù„Ø³Ø¤Ø§Ù„ Ø¹Ù† ÙƒØªØ§Ù„ÙˆØ¬Ù‡Ù….',

  'rfq.titleSupplier': 'ÙØ±Øµ Ø·Ù„Ø¨Ø§Øª Ø¹Ø±ÙˆØ¶ Ø§Ù„Ø£Ø³Ø¹Ø§Ø±',
  'rfq.titleBuyer': 'Ø§Ù„Ø·Ù„Ø¨Ø§Øª',
  'rfq.subSupplier': 'Ù…ØªØ·Ù„Ø¨Ø§Øª Ù…ÙØªÙˆØ­Ø© Ù†Ø´Ø±Ù‡Ø§ Ø§Ù„Ù…Ø´ØªØ±ÙˆÙ†. Ø±Ø¯Ù‘ Ø¨Ø³Ø¹Ø±Ùƒ ÙˆÙ…Ø¯Ø© Ø§Ù„ØªÙ†ÙÙŠØ°.',
  'rfq.subBuyer': 'Ø§Ù„Ù…ØªØ·Ù„Ø¨Ø§Øª Ø§Ù„Ø­Ø§Ù„ÙŠØ© ÙÙŠ Ø§Ù„Ù…Ù†ØµØ©ØŒ Ø§Ù„Ø£Ø­Ø¯Ø« Ø£ÙˆÙ„Ù‹Ø§. Ø§ÙØªØ­ Ø£Ø­Ø¯Ù‡Ø§ Ù„Ø±Ø¤ÙŠØ© Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø§Ù„Ù…Ø³ØªÙ„Ù…Ø©.',
  'rfq.postRequest': '+ Ø§Ù†Ø´Ø± Ø·Ù„Ø¨Ù‹Ø§',
  'rfq.buyerOnlyNotice': 'Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…Ø´ØªØ±ÙŠÙ† ÙÙ‚Ø· ÙŠÙ…ÙƒÙ†Ù‡Ø§ Ù†Ø´Ø± Ø·Ù„Ø¨. Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø¨Ù…Ù„Ù Ù…Ø´ØªØ±Ù Ù„Ù„Ù†Ø´Ø±.',
  'rfq.total': 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø·Ù„Ø¨Ø§Øª',
  'rfq.open': 'Ù…ÙØªÙˆØ­',
  'rfq.quoted': 'Ø¨Ø¹Ø±Ø¶ Ø³Ø¹Ø±',
  'rfq.closed': 'Ù…ØºÙ„Ù‚',
  'rfq.quoteable': 'Ø·Ù„Ø¨Ø§Øª ÙŠÙ…ÙƒÙ†Ùƒ ØªÙ‚Ø¯ÙŠÙ… Ø¹Ø±Ø¶ Ø¹Ù„ÙŠÙ‡Ø§',
  'rfq.allRequests': 'ÙƒÙ„ Ø§Ù„Ø·Ù„Ø¨Ø§Øª',
  'rfq.shown': '{n} Ù…Ø¹Ø±ÙˆØ¶',
  'rfq.statusAll': 'Ø§Ù„ÙƒÙ„',
  'rfq.statusOpenCount': 'Ù…ÙØªÙˆØ­ ({n})',
  'rfq.statusQuotedCount': 'Ø¨Ø¹Ø±Ø¶ Ø³Ø¹Ø± ({n})',
  'rfq.quotingCloses': 'ÙŠÙØºÙ„Ù‚ ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø¹Ù†Ø¯Ù…Ø§ ÙŠÙ‚Ø¨Ù„ Ø§Ù„Ù…Ø´ØªØ±ÙŠ Ø¹Ø±Ø¶Ù‹Ø§.',
  'rfq.emptyNone': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª Ø¨Ø¹Ø¯',
  'rfq.emptyNoMatch': 'Ù„Ø§ Ø´ÙŠØ¡ ÙŠØ·Ø§Ø¨Ù‚ Ù‡Ø°Ø§ Ø§Ù„Ù…Ø±Ø´Ø­',
  'rfq.emptyNoneSupplier': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…ØªØ·Ù„Ø¨Ø§Øª Ù…ÙØªÙˆØ­Ø© ÙÙŠ Ø§Ù„Ù…Ù†ØµØ© Ø§Ù„Ø¢Ù†.',
  'rfq.emptyNoneBuyer': 'Ø§Ù†Ø´Ø± Ù…ØªØ·Ù„Ø¨Ùƒ Ø§Ù„Ø£ÙˆÙ„ ÙˆØ³ÙŠØ±Ø¯Ù‘ Ø¹Ù„ÙŠÙƒ Ù…ØµØ§Ù†Ø¹ Ù…ÙˆØ«Ù‘Ù‚Ø©.',
  'rfq.emptyNoMatchHint': 'Ø¬Ø±Ù‘Ø¨ Ù…Ø±Ø´Ø­ Ø­Ø§Ù„Ø© Ù…Ø®ØªÙ„ÙÙ‹Ø§.',
  'rfq.col.requirement': 'Ø§Ù„Ù…ØªØ·Ù„Ø¨',
  'rfq.col.quantity': 'Ø§Ù„ÙƒÙ…ÙŠØ©',
  'rfq.col.deliverTo': 'Ø§Ù„ØªØ³Ù„ÙŠÙ… Ø¥Ù„Ù‰',
  'rfq.col.quotes': 'Ø§Ù„Ø¹Ø±ÙˆØ¶',
  'rfq.col.posted': 'ØªØ§Ø±ÙŠØ® Ø§Ù„Ù†Ø´Ø±',
  'rfq.col.status': 'Ø§Ù„Ø­Ø§Ù„Ø©',
  'rfq.openAria': 'Ø§ÙØªØ­ Ø·Ù„Ø¨ Ø¹Ø±Ø¶ Ø§Ù„Ø³Ø¹Ø± #{id}',
  'rfq.requestRef': '{category} Â· Ø·Ù„Ø¨ #{id}',
  'rfq.quotesCount': '{n} Ø¹Ø±Ø¶Ù‹Ø§',
  'rfq.postingBuyerOnly': 'Ø§Ù„Ù†Ø´Ø± Ø¥Ø¬Ø±Ø§Ø¡ Ø®Ø§Øµ Ø¨Ø§Ù„Ù…Ø´ØªØ±ÙŠ. ÙŠÙ…ÙƒÙ† Ù„Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†',
  'rfq.quoteOpen': 'ØªÙ‚Ø¯ÙŠÙ… Ø¹Ø±ÙˆØ¶ Ø¹Ù„Ù‰ Ø§Ù„Ù…ØªØ·Ù„Ø¨Ø§Øª Ø§Ù„Ù…ÙØªÙˆØ­Ø©',
  'rfq.newTitle': 'Ø·Ù„Ø¨ Ø¹Ø±Ø¶ Ø³Ø¹Ø± Ø¬Ø¯ÙŠØ¯',
  'rfq.whatNeed': 'Ù…Ø§ Ø§Ù„Ø°ÙŠ ØªØ­ØªØ§Ø¬Ù‡ØŸ',
  'rfq.titlePlaceholder': 'Ù…Ø«Ø§Ù„: 100 Ø·Ù† Ù…ØªØ±ÙŠ ÙƒØ§Ø«ÙˆØ¯ Ù†Ø­Ø§Ø³ØŒ Ø¯Ø±Ø¬Ø© A',
  'rfq.category': 'Ø§Ù„ÙØ¦Ø©',
  'rfq.deliverTo': 'Ø§Ù„ØªØ³Ù„ÙŠÙ… Ø¥Ù„Ù‰',
  'rfq.quantity': 'Ø§Ù„ÙƒÙ…ÙŠØ©',
  'rfq.unit': 'Ø§Ù„ÙˆØ­Ø¯Ø©',
  'rfq.specification': 'Ø§Ù„Ù…ÙˆØ§ØµÙØ§Øª',
  'rfq.specPlaceholder': 'Ø§Ù„Ø¯Ø±Ø¬Ø©ØŒ Ø§Ù„Ù†Ù‚Ø§Ø¡ØŒ Ø§Ù„Ø´Ù‡Ø§Ø¯Ø§ØªØŒ Ø´Ø±ÙˆØ· Ø§Ù„ØªØ¬Ø§Ø±Ø© Ø§Ù„Ø¯ÙˆÙ„ÙŠØ©ØŒ Ø§Ù„ØªØºÙ„ÙŠÙâ€¦',
  'rfq.specHint': 'ÙƒÙ„Ù…Ø§ ÙƒØ§Ù†Øª Ø§Ù„Ù…ÙˆØ§ØµÙØ§Øª Ø£ÙˆØ¶Ø­ØŒ Ø£Ø³Ø±Ø¹ Ø§Ù„Ù…ØµØ§Ù†Ø¹ Ø§Ù„Ù…ÙˆØ«Ù‘Ù‚Ø© ÙÙŠ ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ø¹Ø±ÙˆØ¶.',
  'rfq.errTitle': 'Ø£Ø¹Ø·Ù Ø§Ù„Ø·Ù„Ø¨ Ø¹Ù†ÙˆØ§Ù†Ù‹Ø§ ÙˆØ§Ø¶Ø­Ù‹Ø§ â€” 5 Ø£Ø­Ø±Ù Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„.',
  'rfq.errQuantity': 'ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† Ø§Ù„ÙƒÙ…ÙŠØ© Ø±Ù‚Ù…Ù‹Ø§ Ø£ÙƒØ¨Ø± Ù…Ù† ØµÙØ±.',
  'rfq.errPost': 'ØªØ¹Ø°Ù‘Ø± Ù†Ø´Ø± Ù‡Ø°Ø§ Ø§Ù„Ø·Ù„Ø¨.',

  'rfqDetail.loadingTitle': 'Ø§Ù„Ø·Ù„Ø¨',
  'rfqDetail.loadingSub': 'Ø¬Ø§Ø±Ù Ø§Ù„ØªØ­Ù…ÙŠÙ„â€¦',
  'rfqDetail.title': 'Ø§Ù„Ø·Ù„Ø¨',
  'rfqDetail.notFound': 'Ø§Ù„Ø·Ù„Ø¨ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯',
  'rfqDetail.notFoundBody': 'Ù‚Ø¯ ÙŠÙƒÙˆÙ† Ù‡Ø°Ø§ Ø§Ù„Ù…ØªØ·Ù„Ø¨ Ù…Ø³Ø­ÙˆØ¨Ù‹Ø§ØŒ Ø£Ùˆ Ø§Ù„Ø±Ø§Ø¨Ø· ØºÙŠØ± ØµØ­ÙŠØ­.',
  'rfqDetail.backToRequests': 'â†’ Ø§Ù„Ø¹ÙˆØ¯Ø© Ø¥Ù„Ù‰ Ø§Ù„Ø·Ù„Ø¨Ø§Øª',
  'rfqDetail.allRequests': 'â†’ ÙƒÙ„ Ø§Ù„Ø·Ù„Ø¨Ø§Øª',
  'rfqDetail.postedOn': 'Ù†ÙØ´Ø± ÙÙŠ {date}',
  'rfqDetail.requestRef': 'Ø§Ù„Ø·Ù„Ø¨ #{id}',
  'rfqDetail.accepting': 'ÙŠØ³ØªÙ‚Ø¨Ù„ Ø¹Ø±ÙˆØ¶ Ø§Ù„Ø£Ø³Ø¹Ø§Ø±',
  'rfqDetail.notAccepting': 'Ù„Ø§ ÙŠØ³ØªÙ‚Ø¨Ù„ Ø¹Ø±ÙˆØ¶ Ø£Ø³Ø¹Ø§Ø± Ø¬Ø¯ÙŠØ¯Ø©',
  'rfqDetail.noSpec': 'Ù„Ù… ØªÙÙ‚Ø¯ÙÙ‘Ù… Ù…ÙˆØ§ØµÙØ§Øª Ø¥Ø¶Ø§ÙÙŠØ©.',
  'rfqDetail.quantity': 'Ø§Ù„ÙƒÙ…ÙŠØ©',
  'rfqDetail.deliverTo': 'Ø§Ù„ØªØ³Ù„ÙŠÙ… Ø¥Ù„Ù‰',
  'rfqDetail.quotations': 'Ø¹Ø±ÙˆØ¶ Ø§Ù„Ø£Ø³Ø¹Ø§Ø±',
  'rfqDetail.deadline': 'Ø§Ù„Ù…ÙˆØ¹Ø¯ Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ',
  'rfqDetail.requestedBy': 'Ø·ÙÙ„Ø¨ Ø¨ÙˆØ§Ø³Ø·Ø©',
  'rfqDetail.received': '{n} Ù…Ø³ØªÙ„Ù…',
  'rfqDetail.noneTitle': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¹Ø±ÙˆØ¶ Ø£Ø³Ø¹Ø§Ø± Ø¨Ø¹Ø¯',
  'rfqDetail.noneBody': 'ÙŠØ±Ø§Ø¬Ø¹ Ù…ÙˆØ±Ø¯ÙˆÙ† Ù…ÙˆØ«Ù‘Ù‚ÙˆÙ† Ù‡Ø°Ø§ Ø§Ù„Ù…ØªØ·Ù„Ø¨.',
  'rfqDetail.col.supplier': 'Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯',
  'rfqDetail.col.price': 'Ø§Ù„Ø³Ø¹Ø±',
  'rfqDetail.col.leadTime': 'Ù…Ø¯Ø© Ø§Ù„ØªÙ†ÙÙŠØ°',
  'rfqDetail.col.notes': 'Ù…Ù„Ø§Ø­Ø¸Ø§Øª',
  'rfqDetail.col.sent': 'Ø£ÙØ±Ø³Ù„',
  'rfqDetail.col.status': 'Ø§Ù„Ø­Ø§Ù„Ø©',
  'rfqDetail.trustScore': 'Ø¯Ø±Ø¬Ø© Ø§Ù„Ø«Ù‚Ø© {n}',
  'rfqDetail.days': '{n} ÙŠÙˆÙ…Ù‹Ø§',
  'rfqDetail.submitTitle': 'Ù‚Ø¯Ù‘Ù… Ø¹Ø±Ø¶ Ø³Ø¹Ø±',
  'rfqDetail.supplierAccount': 'Ø­Ø³Ø§Ø¨ Ù…ÙˆØ±Ù‘Ø¯',
  'rfqDetail.fromSupplier': 'ØªØ£ØªÙŠ Ø¹Ø±ÙˆØ¶ Ø§Ù„Ø£Ø³Ø¹Ø§Ø± Ù…Ù† Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†. Ø§Ù†ØªÙ‚Ù„ Ø¥Ù„Ù‰ Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ Ù„Ù„Ø±Ø¯ Ø¹Ù„Ù‰ Ù‡Ø°Ø§ Ø§Ù„Ø·Ù„Ø¨.',
  'rfqDetail.signInSupplierBody': 'Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† Ø§Ù„Ù…Ø³Ø¬Ù‘Ù„Ø© ÙÙ‚Ø· ÙŠÙ…ÙƒÙ†Ù‡Ø§ ØªÙ‚Ø¯ÙŠÙ… Ø¹Ø±Ø¶. Ø§Ù„ØªØµÙØ­ Ù…ØªØ§Ø­ Ù„Ù„Ø¬Ù…ÙŠØ¹.',
  'rfqDetail.supplierOnly': 'Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† ÙÙ‚Ø·',
  'rfqDetail.signInAsSupplier': 'Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ ÙƒÙ…ÙˆØ±Ù‘Ø¯',
  'rfqDetail.closedBody': 'Ù‡Ø°Ø§ Ø§Ù„Ø·Ù„Ø¨ {status} ÙˆÙ„Ù… ÙŠØ¹Ø¯ ÙŠØ³ØªÙ‚Ø¨Ù„ Ø¹Ø±ÙˆØ¶ Ø£Ø³Ø¹Ø§Ø±.',
  'rfqDetail.seeOpen': 'Ø§Ø·Ù‘Ù„Ø¹ Ø¹Ù„Ù‰ Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ù…ÙØªÙˆØ­Ø©',
  'rfqDetail.respondBody': 'Ø±Ø¯Ù‘ Ø¨Ø³Ø¹Ø± Ø§Ù„ÙˆØ­Ø¯Ø© ÙˆÙ…Ø¯Ø© Ø§Ù„ØªÙ†ÙÙŠØ°. Ù…Ù„ÙÙƒ Ø§Ù„Ù…ÙˆØ«Ù‘Ù‚ ÙŠÙØ±ÙÙ‚ Ù…Ø¹ Ø¹Ø±Ø¶ Ø§Ù„Ø³Ø¹Ø±.',
  'rfqDetail.unitPrice': 'Ø³Ø¹Ø± Ø§Ù„ÙˆØ­Ø¯Ø© (USD)',
  'rfqDetail.leadTime': 'Ù…Ø¯Ø© Ø§Ù„ØªÙ†ÙÙŠØ° (Ø£ÙŠØ§Ù…)',
  'rfqDetail.termsNotes': 'Ø§Ù„Ø´Ø±ÙˆØ· ÙˆØ§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª',
  'rfqDetail.termsPlaceholder': 'Ø´Ø±ÙˆØ· Ø§Ù„ØªØ¬Ø§Ø±Ø© Ø§Ù„Ø¯ÙˆÙ„ÙŠØ©ØŒ Ø§Ù„Ø¯Ø±Ø¬Ø©ØŒ Ø§Ù„ØªØºÙ„ÙŠÙØŒ Ø³ÙŠØ§Ø³Ø© Ø§Ù„Ø¹ÙŠÙ†Ø§ØªØŒ Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ©â€¦',
  'rfqDetail.compareHint': 'ÙŠÙ‚Ø§Ø±Ù† Ø§Ù„Ù…Ø´ØªØ±ÙˆÙ† Ø§Ù„Ø³Ø¹Ø± ÙˆÙ…Ø¯Ø© Ø§Ù„ØªÙ†ÙÙŠØ° ÙˆØ§Ù„ØªÙˆØ«ÙŠÙ‚ Ø¬Ù†Ø¨Ù‹Ø§ Ø¥Ù„Ù‰ Ø¬Ù†Ø¨.',
  'rfqDetail.submitQuote': 'Ø¥Ø±Ø³Ø§Ù„ Ø¹Ø±Ø¶ Ø§Ù„Ø³Ø¹Ø±',
  'rfqDetail.submitting': 'Ø¬Ø§Ø±Ù Ø§Ù„Ø¥Ø±Ø³Ø§Ù„â€¦',
  'rfqDetail.errPrice': 'Ø£Ø¯Ø®Ù„ Ø³Ø¹Ø± ÙˆØ­Ø¯Ø© Ø£ÙƒØ¨Ø± Ù…Ù† ØµÙØ±.',
  'rfqDetail.errLead': 'ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† Ù…Ø¯Ø© Ø§Ù„ØªÙ†ÙÙŠØ° Ø¹Ø¯Ø¯Ù‹Ø§ ØµØ­ÙŠØ­Ù‹Ø§ Ù…Ù† Ø§Ù„Ø£ÙŠØ§Ù… Ø¨ÙŠÙ† 1 Ùˆ365.',
  'rfqDetail.errSubmit': 'ØªØ¹Ø°Ù‘Ø± Ø¥Ø±Ø³Ø§Ù„ Ø¹Ø±Ø¶ Ø§Ù„Ø³Ø¹Ø±.',

  'listings.title': 'Ø¥Ø¹Ù„Ø§Ù†Ø§ØªÙŠ',
  'listings.sub': 'Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø°ÙŠ Ù†Ø´Ø±ØªÙ‡ ÙÙŠ Ø§Ù„Ø³ÙˆÙ‚',
  'listings.signInSub': 'Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø°ÙŠ Ù†Ø´Ø±ØªÙ‡ ÙÙŠ Ø§Ù„Ø³ÙˆÙ‚',
  'listings.notSignedIn': 'Ù„Ù… ØªØ³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„',
  'listings.notSignedInBody': 'Ø¥Ø¹Ù„Ø§Ù†Ø§ØªÙƒ Ø®Ø§ØµØ© Ø¨Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯. Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ø¹Ø±Ø¶Ù‡Ø§ ÙˆØ¥Ø¯Ø§Ø±ØªÙ‡Ø§.',
  'listings.createSupplierAccount': 'Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨ Ù…ÙˆØ±Ù‘Ø¯',
  'listings.supplierOnly': 'Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† ÙÙ‚Ø·',
  'listings.supplierOnlyBody':
    'Ø­Ø³Ø§Ø¨Ùƒ Ø­Ø³Ø§Ø¨ {role}. Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†Ø§Øª ÙŠØ¯ÙŠØ±Ù‡Ø§ Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ Ø§Ù„Ù…Ø§Ù„Ùƒ Ù„Ù‡Ø§ØŒ Ù„Ø°Ø§ Ù„Ø§ Ø´ÙŠØ¡ Ù„Ø¹Ø±Ø¶Ù‡ Ø£Ùˆ ØªØ¹Ø¯ÙŠÙ„Ù‡ Ù‡Ù†Ø§.',
  'listings.browseStock': 'ØªØµÙÙ‘Ø­ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø¬Ø§Ù‡Ø²',
  'listings.subLoading': 'Ø¬Ø§Ø±Ù ØªØ­Ù…ÙŠÙ„ Ù…Ø®Ø²ÙˆÙ†Ùƒâ€¦',
  'listings.subCount': '{n} Ø¥Ø¹Ù„Ø§Ù†Ù‹Ø§ Ù…Ù†Ø´ÙˆØ±Ù‹Ø§ ØªØ­Øª Ù…Ù„Ù Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ Ø§Ù„Ø®Ø§Øµ Ø¨Ùƒ',
  'listings.postStock': '+ Ø§Ù†Ø´Ø± Ù…Ø®Ø²ÙˆÙ†Ù‹Ø§',
  'listings.lotsPublished': 'Ø¯ÙØ¹Ø© Ù…Ù†Ø´ÙˆØ±Ø©',
  'listings.bankTransferNote': 'ÙŠØ¯ÙØ¹ Ø§Ù„Ù…Ø´ØªØ±ÙˆÙ† Ø¨Ø­ÙˆØ§Ù„Ø© Ù…ØµØ±ÙÙŠØ© Ø¨Ø¹Ø¯ Ù‚Ø¨ÙˆÙ„ Ø§Ù„Ø¹Ø±Ø¶.',
  'listings.loadErrorTitle': 'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ø¥Ø¹Ù„Ø§Ù†Ø§ØªÙƒ',
  'listings.loadErrorBody': 'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ø¥Ø¹Ù„Ø§Ù†Ø§ØªÙƒ â€” Ø£Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©. Ø¥Ø°Ø§ Ø§Ø³ØªÙ…Ø± Ø§Ù„ÙØ´Ù„ØŒ Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù…Ø¬Ø¯Ø¯Ù‹Ø§.',
  'listings.emptyTitle': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¥Ø¹Ù„Ø§Ù†Ø§Øª Ø¨Ø¹Ø¯',
  'listings.emptyBody':
    'Ø§Ù†Ø´Ø± Ø¯ÙØ¹ØªÙƒ Ø§Ù„Ø£ÙˆÙ„Ù‰ â€” ØµÙˆØ±Ø©ØŒ ÙˆØ³Ø¹Ø± ÙˆØ­Ø¯Ø©ØŒ ÙˆØ§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„ØªÙŠ ÙŠÙ…ÙƒÙ†Ùƒ Ø´Ø­Ù†Ù‡Ø§ Ø§Ù„ÙŠÙˆÙ…. ØªÙ†Ø´Ø± ÙÙˆØ±Ù‹Ø§ ÙÙŠ Â«Ø§Ø³ØªÙƒØ´Ø§ÙÂ» Ø£Ù…Ø§Ù… ÙƒÙ„ Ù…Ø´ØªØ±Ù ÙÙŠ Ø§Ù„Ø³ÙˆÙ‚.',
  'listings.postFirst': '+ Ø§Ù†Ø´Ø± Ø¯ÙØ¹ØªÙƒ Ø§Ù„Ø£ÙˆÙ„Ù‰',
  'listings.getVerified': 'ÙˆØ«Ù‘Ù‚ Ø­Ø³Ø§Ø¨Ùƒ',
  'listings.count': '{n} Ø¥Ø¹Ù„Ø§Ù†Ù‹Ø§',
  'listings.col.lot': 'Ø§Ù„Ø¯ÙØ¹Ø©',
  'listings.col.category': 'Ø§Ù„ÙØ¦Ø©',
  'listings.col.unitPrice': 'Ø³Ø¹Ø± Ø§Ù„ÙˆØ­Ø¯Ø©',
  'listings.col.moq': 'MOQ',
  'listings.col.available': 'Ø§Ù„Ù…ØªØ§Ø­',
  'listings.col.status': 'Ø§Ù„Ø­Ø§Ù„Ø©',
  'listings.col.posted': 'ØªØ§Ø±ÙŠØ® Ø§Ù„Ù†Ø´Ø±',
  'listings.lotRef': 'Ø¯ÙØ¹Ø© #{id}',
  'listings.noPhotoInline': 'Ù„Ø§ ØªÙˆØ¬Ø¯ ØµÙˆØ±Ø©',
  'listings.demoNoteLead': 'Ø§Ù„Ø¯ÙØ¹Ø© Ø§Ù„Ù…Ø¹Ù„Ù‘Ù…Ø© Ø¨Ù€',
  'listings.demoNoteTail':
    'Ø¨ÙŠØ§Ù†Ø§Øª ØªØ¬Ø±ÙŠØ¨ÙŠØ© Ù…Ù† Ø§Ù„Ø³ÙˆÙ‚ØŒ ÙˆÙ„ÙŠØ³Øª Ù…Ø®Ø²ÙˆÙ†Ù‹Ø§ Ù†Ø´Ø±ØªÙ‡ Ø£Ù†Øª. Ø­Ø°ÙÙ‡Ø§ ÙŠØ²ÙŠÙ„Ù‡Ø§ Ù„Ù„Ø¬Ù…ÙŠØ¹.',
  'listings.updated': 'ØªÙ… ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†.',
  'listings.deleted': 'ØªÙ… Ø­Ø°Ù Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†. Ù„Ù… ÙŠØ¹Ø¯ Ù…ÙˆØ¬ÙˆØ¯Ù‹Ø§ ÙÙŠ Ø§Ù„Ø³ÙˆÙ‚.',
  'listings.deleteTitle': 'Ø­Ø°Ù Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†ØŸ',
  'listings.deleteLead': '{name} â€” Ø¯ÙØ¹Ø© #{id}',
  'listings.deleteBody':
    'ÙŠÙØ­Ø°Ù Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† Ù†Ù‡Ø§Ø¦ÙŠÙ‹Ø§. ÙŠØ®ØªÙÙŠ Ù…Ù† Â«Ø§Ø³ØªÙƒØ´Ø§ÙÂ» ÙˆÙ…Ù† Ø¬Ø¯ÙˆÙ„ Ø¥Ø¹Ù„Ø§Ù†Ø§ØªÙƒ ÙÙˆØ±Ù‹Ø§ØŒ ÙˆÙ„Ø§ ÙŠÙ…ÙƒÙ† Ù„Ù„Ù…Ø´ØªØ±ÙŠÙ† Ø§Ù„Ø´Ø±Ø§Ø¡ Ø£Ùˆ Ø§Ù„ØªÙØ§ÙˆØ¶ Ø¹Ù„ÙŠÙ‡. Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø¹Ù† Ø°Ù„Ùƒ.',
  'listings.deleteKeepBody':
    'Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø­Ø°Ù Ø¯ÙØ¹Ø© Ø¹Ù„ÙŠÙ‡Ø§ Ø·Ù„Ø¨Ø§Øª Ø£Ùˆ Ø¹Ø±ÙˆØ¶ â€” ØªØ­ØªÙØ¸ Ø¨Ù‡Ø§ Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© Ù„Ù„Ø³Ø¬Ù„. Ø¹Ù„Ù‘Ù…Ù‡Ø§ ÙƒÙ†ÙØ¯Øª Ø§Ù„ÙƒÙ…ÙŠØ© Ø¨Ø¶Ø¨Ø· Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ù…ØªØ§Ø­ Ø¹Ù„Ù‰ 0.',
  'listings.keepListing': 'Ø§Ù„Ø¥Ø¨Ù‚Ø§Ø¡ Ø¹Ù„Ù‰ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†',
  'listings.deleteForever': 'Ø­Ø°Ù Ù†Ù‡Ø§Ø¦ÙŠ',
  'listings.deleting': 'Ø¬Ø§Ø±Ù Ø§Ù„Ø­Ø°Ùâ€¦',
  'listings.deleteErr': 'ØªØ¹Ø°Ù‘Ø± Ø­Ø°Ù Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†.',
  'listings.editTitle': 'ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† â€” Ø¯ÙØ¹Ø© #{id}',

  'post.title': 'Ù†Ø´Ø± Ù…Ø®Ø²ÙˆÙ†',
  'post.titleEdit': 'ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†',
  'post.sub': 'Ø¯ÙØ¹Ø© ÙˆØ§Ø­Ø¯Ø© Ù„ÙƒÙ„ Ø¥Ø¹Ù„Ø§Ù†: Ù…Ø§ Ù‡ÙŠØŒ ÙˆÙƒÙ… Ø³Ø¹Ø±Ù‡Ø§ØŒ ÙˆÙƒÙ… ÙŠÙ…ÙƒÙ†Ùƒ Ø´Ø­Ù†Ù‡ Ø§Ù„ÙŠÙˆÙ…',
  'post.subEdit': 'ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø¯ÙØ¹Ø© #{id} â€” Ø§Ù„Ø­ÙØ¸ ÙŠØ³ØªØ¨Ø¯Ù„ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† Ø§Ù„Ù…Ù†Ø´ÙˆØ±',
  'post.signInSub': 'Ø§Ø¹Ø±Ø¶ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø¬Ø§Ù‡Ø² Ù„ÙŠØªÙ…ÙƒÙ† Ø§Ù„Ù…Ø´ØªØ±ÙˆÙ† Ù…Ù† Ø§Ù„Ø´Ø±Ø§Ø¡ Ø£Ùˆ Ø§Ù„ØªÙØ§ÙˆØ¶',
  'post.notSignedIn': 'Ù„Ù… ØªØ³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„',
  'post.notSignedInBody': 'Ù†Ø´Ø± Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø¥Ø¬Ø±Ø§Ø¡ Ø®Ø§Øµ Ø¨Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯. Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø¨Ø­Ø³Ø§Ø¨ Ù…ÙˆØ±Ù‘Ø¯ Ù„Ù†Ø´Ø± Ø¯ÙØ¹Ø©.',
  'post.createSupplierAccount': 'Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨ Ù…ÙˆØ±Ù‘Ø¯',
  'post.supplierOnly': 'Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† ÙÙ‚Ø·',
  'post.supplierOnlyBody':
    'Ø­Ø³Ø§Ø¨Ùƒ Ø­Ø³Ø§Ø¨ {role}ØŒ Ù„Ø°Ø§ Ù„Ù† ØªÙ‚Ø¨Ù„ Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© Ø¥Ø¹Ù„Ø§Ù†Ù‹Ø§ Ù…Ù†Ù‡. ÙŠÙ„Ø²Ù… Ù…Ù„Ù Ù…ÙˆØ±Ù‘Ø¯ Ù‚Ø¨Ù„ Ù†Ø´Ø± Ø§Ù„Ù…Ø®Ø²ÙˆÙ†.',
  'post.myListings': 'Ø¥Ø¹Ù„Ø§Ù†Ø§ØªÙŠ',
  'post.loadErrorTitle': 'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†',
  'post.loadErrorBody': 'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ù‡Ø°Ù‡ Ø§Ù„Ø¯ÙØ¹Ø© â€” Ø£Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©ØŒ Ø£Ùˆ Ø§Ø±Ø¬Ø¹ Ø¥Ù„Ù‰ Ø¥Ø¹Ù„Ø§Ù†Ø§ØªÙƒ.',
  'post.details': 'ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†',
  'post.newListing': 'Ø¥Ø¹Ù„Ø§Ù† Ø¬Ø¯ÙŠØ¯',
  'post.requiredMark': '* Ù…Ø·Ù„ÙˆØ¨',
  'post.lotName': 'Ø§Ø³Ù… Ø§Ù„Ø¯ÙØ¹Ø©',
  'post.lotNamePlaceholder': 'Ù…Ø«Ø§Ù„: ÙƒØ§Ø«ÙˆØ¯ Ù†Ø­Ø§Ø³ Ø¯Ø±Ø¬Ø© AØŒ 99.99%',
  'post.category': 'Ø§Ù„ÙØ¦Ø©',
  'post.originCountry': 'Ø¨Ù„Ø¯ Ø§Ù„Ù…Ù†Ø´Ø£',
  'post.notStated': 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯',
  'post.description': 'Ø§Ù„ÙˆØµÙ',
  'post.descriptionPlaceholder': 'Ø§Ù„Ø¯Ø±Ø¬Ø©ØŒ Ø§Ù„ØªØºÙ„ÙŠÙØŒ Ø´Ø±ÙˆØ· Ø§Ù„ØªØ¬Ø§Ø±Ø© Ø§Ù„Ø¯ÙˆÙ„ÙŠØ©ØŒ Ù…Ø¯Ø© Ø§Ù„ØªÙ†ÙÙŠØ°ØŒ Ø§Ù„Ø´Ù‡Ø§Ø¯Ø§Øªâ€¦',
  'post.descriptionHint': 'Ø§Ù„Ù…Ø´ØªØ±ÙˆÙ† ÙŠÙ‚Ø±Ù‘Ø±ÙˆÙ† Ù…Ù† Ù‡Ø°Ø§ Ø§Ù„Ù†Øµ. Ø§Ø°ÙƒØ± Ù…Ø§ ØªØ­ØªÙˆÙŠÙ‡ Ø§Ù„Ø¯ÙØ¹Ø© ÙˆÙƒÙŠÙ ØªÙØ´Ø­Ù†.',
  'post.unitPrice': 'Ø³Ø¹Ø± Ø§Ù„ÙˆØ­Ø¯Ø©',
  'post.currency': 'Ø§Ù„Ø¹Ù…Ù„Ø©',
  'post.unit': 'Ø§Ù„ÙˆØ­Ø¯Ø©',
  'post.moq': 'Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ Ù„Ù„Ø·Ù„Ø¨ (MOQ)',
  'post.moqHint': 'Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ© 1.',
  'post.available': 'Ø§Ù„Ù…ØªØ§Ø­ Ø§Ù„Ø¢Ù†',
  'post.availableHint': 'Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ© 0 â€” Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø°ÙŠ ÙŠÙ…ÙƒÙ†Ùƒ Ø´Ø­Ù†Ù‡ Ø§Ù„ÙŠÙˆÙ….',
  'post.purity': 'Ø§Ù„Ù†Ù‚Ø§Ø¡ / Ø§Ù„Ø¯Ø±Ø¬Ø©',
  'post.purityPlaceholder': '99.99% / Ø¯Ø±Ø¬Ø© A',
  'post.optional': 'Ø§Ø®ØªÙŠØ§Ø±ÙŠ.',
  'post.photoUrl': 'Ø±Ø§Ø¨Ø· Ø§Ù„ØµÙˆØ±Ø©',
  'post.photoPlaceholder': 'https://â€¦/copper-cathode.jpg',
  'post.photoHintLead': 'Ø±ÙØ¹ Ø§Ù„Ù…Ù„ÙØ§Øª ØºÙŠØ± Ù…Ø¨Ù†ÙŠ Ø¨Ø¹Ø¯.',
  'post.photoHintTail':
    'Ø§Ù„ØµÙ‚ Ø±Ø§Ø¨Ø·Ù‹Ø§ Ø¹Ø§Ù…Ù‹Ø§ Ù„Ù„ØµÙˆØ±Ø© ÙˆØ³ÙŠÙØ®Ø²ÙÙ‘Ù† ÙƒØµÙˆØ±Ø© Ù‡Ø°Ù‡ Ø§Ù„Ø¯ÙØ¹Ø©. Ø§Ù„Ø¯ÙØ¹Ø§Øª Ø¨Ù„Ø§ ØµÙˆØ±Ø© ØªÙØ¸Ù‡Ø± Ø¹Ù†ØµØ±Ù‹Ø§ Ù†Ø§Ø¦Ø¨Ù‹Ø§ Ø¨Ø³ÙŠØ·Ù‹Ø§.',
  'post.preview': 'Ù…Ø¹Ø§ÙŠÙ†Ø© â€” Ø¥Ø°Ø§ Ù„Ù… ÙŠØ¸Ù‡Ø± Ø´ÙŠØ¡ØŒ ÙØ§Ù„Ø±Ø§Ø¨Ø· Ù„ÙŠØ³ ØµÙˆØ±Ø© Ù…Ø¨Ø§Ø´Ø±Ø©.',
  'post.save': 'Ø­ÙØ¸ Ø§Ù„ØªØºÙŠÙŠØ±Ø§Øª',
  'post.saving': 'Ø¬Ø§Ø±Ù Ø§Ù„Ø­ÙØ¸â€¦',
  'post.errName': 'Ø£Ø¹Ø·Ù Ø§Ù„Ø¯ÙØ¹Ø© Ø§Ø³Ù…Ù‹Ø§ â€” Ø­Ø±ÙØ§Ù† Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„.',
  'post.errCategory': 'Ø§Ø®ØªØ± ÙØ¦Ø©.',
  'post.errUnit': 'Ø­Ø¯Ù‘Ø¯ Ø§Ù„ÙˆØ­Ø¯Ø© Ø§Ù„ØªÙŠ ØªØ¨ÙŠØ¹ Ø¨Ù‡Ø§ (Ø·Ù† Ù…ØªØ±ÙŠØŒ ÙƒØ¬Ù…ØŒ Ù‚Ø·Ø¹Ø©â€¦).',
  'post.errPrice': 'ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ø³Ø¹Ø± Ø§Ù„ÙˆØ­Ø¯Ø© Ø±Ù‚Ù…Ù‹Ø§ Ø£ÙƒØ¨Ø± Ù…Ù† ØµÙØ±.',
  'post.errMoq': 'ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ Ù„Ù„Ø·Ù„Ø¨ Ø±Ù‚Ù…Ù‹Ø§ Ø£ÙƒØ¨Ø± Ù…Ù† ØµÙØ±.',
  'post.errQty': 'Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø£Ù† ØªÙƒÙˆÙ† Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…ØªØ§Ø­Ø© Ø³Ø§Ù„Ø¨Ø©.',
  'post.errSave': 'ØªØ¹Ø°Ù‘Ø± Ø­ÙØ¸ Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†.',
  'post.errCreate': 'ØªØ¹Ø°Ù‘Ø± Ù†Ø´Ø± Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†.',
  'post.behaviour': 'ÙƒÙŠÙ ÙŠØ¹Ù…Ù„ Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†',
  'post.behaviourBody':
    'ØªØ¸Ù‡Ø± Ø§Ù„Ø¯ÙØ¹Ø© Ø§Ù„Ù…Ù†Ø´ÙˆØ±Ø© ÙÙŠ Â«Ø§Ø³ØªÙƒØ´Ø§ÙÂ» ÙÙˆØ±Ù‹Ø§ ÙˆÙŠÙ…ÙƒÙ† Ù„Ø£ÙŠ Ù…Ø´ØªØ±Ù Ù…Ø³Ø¬Ù‘Ù„ Ø´Ø±Ø§Ø¤Ù‡Ø§. ÙˆÙ‚Ø¯ ÙŠÙØªØ­ Ø§Ù„Ù…Ø´ØªØ±ÙˆÙ† Ø¹Ø±Ø¶Ù‹Ø§ Ø¨Ø£Ù‚Ù„ Ù…Ù† Ø³Ø¹Ø±Ùƒ Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø› ØªØ±Ø¯Ù‘ Ø¹Ù„ÙŠÙ‡Ø§ Ù…Ù†',
  'post.offersLink': 'Ø§Ù„Ø¹Ø±ÙˆØ¶',
  'post.provenance': 'Ø§Ù„Ù…ØµØ¯Ø±',
  'post.platformListing': 'Ø¥Ø¹Ù„Ø§Ù† Ø¹Ù„Ù‰ Ø§Ù„Ù…Ù†ØµØ©',
  'post.photo': 'Ø§Ù„ØµÙˆØ±Ø©',
  'post.urlOnly': 'Ø±Ø§Ø¨Ø· ÙÙ‚Ø· â€” Ø§Ù„Ø±ÙØ¹ ØºÙŠØ± Ù…Ø¨Ù†ÙŠ',
  'post.buyerPaysBy': 'Ø·Ø±ÙŠÙ‚Ø© Ø¯ÙØ¹ Ø§Ù„Ù…Ø´ØªØ±ÙŠ',
  'post.bankTransfer': 'Ø­ÙˆØ§Ù„Ø© Ù…ØµØ±ÙÙŠØ©',
  'post.noMetrics':
    'Ù„Ø§ ÙŠØ¹Ø±Ø¶ Ø£ÙŠ Ø¬Ø²Ø¡ Ù…Ù† Ù‡Ø°Ù‡ Ø§Ù„ØµÙØ­Ø© Ù…Ø´Ø§Ù‡Ø¯Ø§Øª Ø£Ùˆ ØªÙ‚ÙŠÙŠÙ…Ø§Øª Ø£Ùˆ Ø£Ø¹Ø¯Ø§Ø¯ Ø·Ù„Ø¨Ø§Øª â€” ÙÙ‡Ø°Ù‡ Ø§Ù„Ø£Ø±Ù‚Ø§Ù… ØºÙŠØ± Ù…Ù‚ÙŠØ³Ø© Ø¨Ø¹Ø¯ØŒ Ù„Ø°Ø§ Ù„Ø§ ØªÙØ¹Ø±Ø¶.',

  'offers.title': 'Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø¹Ù„Ù‰ Ù…Ø®Ø²ÙˆÙ†Ùƒ',
  'offers.sub': 'Ù…Ø´ØªØ±ÙˆÙ† ÙŠØªÙØ§ÙˆØ¶ÙˆÙ† Ø¹Ù„Ù‰ Ø¯ÙØ¹Ø§ØªÙƒ',
  'offers.signInSub': 'Ù…Ø´ØªØ±ÙˆÙ† ÙŠØªÙØ§ÙˆØ¶ÙˆÙ† Ø¹Ù„Ù‰ Ø¯ÙØ¹Ø§ØªÙƒ',
  'offers.notSignedIn': 'Ù„Ù… ØªØ³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„',
  'offers.notSignedInBody': 'Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø®Ø§ØµØ© Ø¨Ø§Ù„Ù…Ø´ØªØ±ÙŠ ÙˆØ§Ù„Ù…ÙˆØ±Ù‘Ø¯ Ø§Ù„Ù…Ø¹Ù†ÙŠÙŠÙ†. Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ù„Ø±Ø¯ Ø¹Ù„ÙŠÙ‡Ø§.',
  'offers.createSupplierAccount': 'Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨ Ù…ÙˆØ±Ù‘Ø¯',
  'offers.supplierOnly': 'Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† ÙÙ‚Ø·',
  'offers.supplierOnlyBody':
    'Ø­Ø³Ø§Ø¨Ùƒ Ø­Ø³Ø§Ø¨ {role}ØŒ ÙˆÙ„Ø§ Ù…Ø®Ø²ÙˆÙ† Ù…Ø¯Ø±Ø¬ ØªØ­ØªÙ‡ Ù„Ø°Ø§ Ù„Ø§ ØªØµÙ„ Ø¹Ø±ÙˆØ¶. Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø§Ù„ØªÙŠ Ù‚Ø¯Ù‘Ù…ØªÙ‡Ø§ ÙƒÙ…Ø´ØªØ±Ù Ù…ÙˆØ¬ÙˆØ¯Ø© ÙÙŠ Ø¬Ø§Ù†Ø¨ Ø§Ù„Ù…Ø´ØªØ±ÙŠÙ† Ù…Ù† Ø§Ù„Ø³ÙˆÙ‚.',
  'offers.browseStock': 'ØªØµÙÙ‘Ø­ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø¬Ø§Ù‡Ø²',
  'offers.subLoading': 'Ø¬Ø§Ø±Ù ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¹Ø±ÙˆØ¶â€¦',
  'offers.subCount': '{n} Ø¹Ø±Ø¶Ù‹Ø§ Ø¹Ù„Ù‰ Ø¥Ø¹Ù„Ø§Ù†Ø§ØªÙƒ',
  'offers.awaiting': 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø±Ø¯Ù‘Ùƒ',
  'offers.decided': 'Ù…Ø­Ø³ÙˆÙ…',
  'offers.acceptCreates': 'Ù‚Ø¨ÙˆÙ„ Ø¹Ø±Ø¶ ÙŠÙÙ†Ø´Ø¦ Ø·Ù„Ø¨Ù‹Ø§Ø› ÙˆÙŠØ¯ÙØ¹ Ø§Ù„Ù…Ø´ØªØ±ÙŠ Ø¨Ø­ÙˆØ§Ù„Ø© Ù…ØµØ±ÙÙŠØ©.',
  'offers.filterAwaiting': 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ø±Ø¯ ({n})',
  'offers.filterDecided': 'Ù…Ø­Ø³ÙˆÙ…Ø© ({n})',
  'offers.counterNote': 'Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø§Ù„Ù…Ø¶Ø§Ø¯Ø© ØªÙØªØ­ Ø¹Ø±Ø¶Ù‹Ø§ Ø¬Ø¯ÙŠØ¯Ù‹Ø§ Ù…Ø±ØªØ¨Ø·Ù‹Ø§Ø› ÙˆØªØ¨Ù‚Ù‰ Ø´Ø±ÙˆØ·Ùƒ Ø§Ù„Ø£ØµÙ„ÙŠØ© ÙÙŠ Ø§Ù„Ø³Ø¬Ù„.',
  'offers.loadErrorTitle': 'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¹Ø±ÙˆØ¶',
  'offers.loadErrorBody': 'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø¹Ù„Ù‰ Ù…Ø®Ø²ÙˆÙ†Ùƒ â€” Ø£Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©.',
  'offers.emptyTitle': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¹Ø±ÙˆØ¶ Ø¨Ø¹Ø¯',
  'offers.emptyBody':
    'Ø¹Ù†Ø¯Ù…Ø§ ÙŠØªÙØ§ÙˆØ¶ Ù…Ø´ØªØ±Ù Ø¹Ù„Ù‰ Ø¥Ø­Ø¯Ù‰ Ø¯ÙØ¹Ø§ØªÙƒ ÙŠØ¸Ù‡Ø± Ù‡Ù†Ø§ Ø¨Ø§Ù„Ø³Ø¹Ø± Ø§Ù„Ø°ÙŠ Ø§Ù‚ØªØ±Ø­Ù‡ ÙˆØ§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„ØªÙŠ ÙŠØ±ÙŠØ¯Ù‡Ø§. ÙŠÙ…ÙƒÙ†Ùƒ Ù‚Ø¨ÙˆÙ„Ù‡ Ø£Ùˆ Ø±ÙØ¶Ù‡ Ø£Ùˆ Ø§Ù„Ø±Ø¯ Ø¨Ø³Ø¹Ø±Ùƒ.',
  'offers.seeListings': 'Ø§Ø·Ù‘Ù„Ø¹ Ø¹Ù„Ù‰ Ø¥Ø¹Ù„Ø§Ù†Ø§ØªÙŠ',
  'offers.postMore': '+ Ø§Ù†Ø´Ø± Ù…Ø®Ø²ÙˆÙ†Ù‹Ø§ Ø¥Ø¶Ø§ÙÙŠÙ‹Ø§',
  'offers.noneAwaiting': 'Ù„Ø§ Ø´ÙŠØ¡ Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø±Ø¯Ù‘Ùƒ',
  'offers.noneDecided': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¹Ø±ÙˆØ¶ Ù…Ø­Ø³ÙˆÙ…Ø© Ø¨Ø¹Ø¯',
  'offers.noneAwaitingBody': 'ØªÙ… Ø§Ù„Ø±Ø¯ Ø¹Ù„Ù‰ ÙƒÙ„ Ø¹Ø±Ø¶ Ø¹Ù„Ù‰ Ù…Ø®Ø²ÙˆÙ†Ùƒ. Ø§Ù†ØªÙ‚Ù„ Ø¥Ù„Ù‰ Â«Ù…Ø­Ø³ÙˆÙ…Ø©Â» Ù„Ù…Ø±Ø§Ø¬Ø¹ØªÙ‡Ø§.',
  'offers.noneDecidedBody': 'ØªÙØ­ÙØ¸ Ù‡Ù†Ø§ Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø§Ù„ØªÙŠ ØªÙ‚Ø¨Ù„Ù‡Ø§ Ø£Ùˆ ØªØ±ÙØ¶Ù‡Ø§ ÙƒØ³Ø¬Ù„.',
  'offers.count': '{n} Ø¹Ø±Ø¶Ù‹Ø§',
  'offers.col.listing': 'Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†',
  'offers.col.buyer': 'Ø§Ù„Ù…Ø´ØªØ±ÙŠ',
  'offers.col.quantity': 'Ø§Ù„ÙƒÙ…ÙŠØ©',
  'offers.col.theirPrice': 'Ø³Ø¹Ø±Ù‡Ù…',
  'offers.col.status': 'Ø§Ù„Ø­Ø§Ù„Ø©',
  'offers.col.received': 'ØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ø³ØªÙ„Ø§Ù…',
  'offers.decidedLabel': 'Ù…Ø­Ø³ÙˆÙ…',
  'offers.counter': 'Ø¹Ø±Ø¶ Ù…Ø¶Ø§Ø¯',
  'offers.accept': 'Ù‚Ø¨ÙˆÙ„',
  'offers.reject': 'Ø±ÙØ¶',
  'offers.offerRef': 'Ø¹Ø±Ø¶ #{id}',
  'offers.answersOffer': 'ÙŠØ±Ø¯ Ø¹Ù„Ù‰ Ø§Ù„Ø¹Ø±Ø¶ #{id}',
  'offers.demoNoteLead': 'Ø§Ù„ØµÙ Ø§Ù„Ù…Ø¹Ù„Ù‘Ù… Ø¨Ù€',
  'offers.demoNoteTail':
    'ÙŠØ®Øµ Ø¯ÙØ¹Ø© ØªØ¬Ø±ÙŠØ¨ÙŠØ© Ù„Ø§ Ù…Ø®Ø²ÙˆÙ†Ù‹Ø§ Ù†Ø´Ø±ØªÙ‡ Ø£Ù†Øª. Ù‚Ø¨ÙˆÙ„Ù‡ ÙŠÙÙ†Ø´Ø¦ Ø·Ù„Ø¨Ù‹Ø§ Ø­Ù‚ÙŠÙ‚ÙŠÙ‹Ø§ Ù…Ø¹ Ø°Ù„Ùƒ â€” ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„Ø¯ÙØ¹Ø© Ù‚Ø¨Ù„ Ø§Ù„Ø§Ù„ØªØ²Ø§Ù….',
  'offers.counterTitle': 'Ø¹Ø±Ø¶ Ù…Ø¶Ø§Ø¯ #{id}',
  'offers.counterBody':
    'Ù‚Ø¯Ù‘Ù… {buyer} Ø¹Ø±Ø¶Ù‹Ø§ Ø¨Ù‚ÙŠÙ…Ø© {price} Ù…Ù‚Ø§Ø¨Ù„ {qty} Ø¹Ù„Ù‰ {product}. ÙŠØµØ¨Ø­ Ø±Ø¯Ù‘Ùƒ Ø¹Ø±Ø¶Ù‹Ø§ Ø¬Ø¯ÙŠØ¯Ù‹Ø§ Ù…Ø±ØªØ¨Ø·Ù‹Ø§Ø› ÙˆØªØ¨Ù‚Ù‰ Ø´Ø±ÙˆØ· Ø§Ù„Ù…Ø´ØªØ±ÙŠ ÙÙŠ Ø§Ù„Ø³Ø¬Ù„.',
  'offers.counterPrice': 'Ø³Ø¹Ø± ÙˆØ­Ø¯ØªÙƒ',
  'offers.perUnit': '{currency} Ù„ÙƒÙ„ ÙˆØ­Ø¯Ø©',
  'offers.counterQty': 'Ø§Ù„ÙƒÙ…ÙŠØ©',
  'offers.counterQtyHint': 'Ø§ØªØ±ÙƒÙ‡Ø§ ÙƒÙ…Ø§ Ù‡ÙŠ Ù„Ù„Ø¥Ø¨Ù‚Ø§Ø¡ Ø¹Ù„Ù‰ ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ø´ØªØ±ÙŠ.',
  'offers.counterNotes': 'Ù…Ù„Ø§Ø­Ø¸Ø© Ø¥Ù„Ù‰ Ø§Ù„Ù…Ø´ØªØ±ÙŠ',
  'offers.counterNotesPlaceholder': 'Ù…Ø¯Ø© Ø§Ù„ØªÙ†ÙÙŠØ°ØŒ Ø§Ù„ØªØºÙ„ÙŠÙØŒ Ø´Ø±ÙˆØ· Ø§Ù„ØªØ¬Ø§Ø±Ø© Ø§Ù„Ø¯ÙˆÙ„ÙŠØ©ØŒ ØµÙ„Ø§Ø­ÙŠØ© Ù‡Ø°Ø§ Ø§Ù„Ø³Ø¹Ø±â€¦',
  'offers.sendCounter': 'Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø¹Ø±Ø¶ Ø§Ù„Ù…Ø¶Ø§Ø¯',
  'offers.sending': 'Ø¬Ø§Ø±Ù Ø§Ù„Ø¥Ø±Ø³Ø§Ù„â€¦',
  'offers.counterErrPrice': 'ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ø³Ø¹Ø±Ùƒ Ø§Ù„Ù…Ø¶Ø§Ø¯ Ø±Ù‚Ù…Ù‹Ø§ Ø£ÙƒØ¨Ø± Ù…Ù† ØµÙØ±.',
  'offers.counterErrQty': 'ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† Ø§Ù„ÙƒÙ…ÙŠØ© Ø±Ù‚Ù…Ù‹Ø§ Ø£ÙƒØ¨Ø± Ù…Ù† ØµÙØ±.',
  'offers.counterErr': 'ØªØ¹Ø°Ù‘Ø± Ø¥Ø±Ø³Ø§Ù„ Ù‡Ø°Ø§ Ø§Ù„Ø¹Ø±Ø¶ Ø§Ù„Ù…Ø¶Ø§Ø¯.',
  'offers.counterDone': 'ØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø¹Ø±Ø¶ Ø§Ù„Ù…Ø¶Ø§Ø¯. Ø£ØµØ¨Ø­ Ø§Ù„Ø¹Ø±Ø¶ Ø§Ù„Ø£ØµÙ„ÙŠ Â«ØªÙ… Ø§Ù„Ø±Ø¯ Ø¨Ø¹Ø±Ø¶ Ù…Ø¶Ø§Ø¯Â» ÙˆØªÙ… Ø¥Ø¨Ù„Ø§Øº Ø§Ù„Ù…Ø´ØªØ±ÙŠ.',
  'offers.acceptTitle': 'Ù‚Ø¨ÙˆÙ„ Ø§Ù„Ø¹Ø±Ø¶ #{id}ØŸ',
  'offers.listing': 'Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†',
  'offers.buyer': 'Ø§Ù„Ù…Ø´ØªØ±ÙŠ',
  'offers.quantity': 'Ø§Ù„ÙƒÙ…ÙŠØ©',
  'offers.unitPrice': 'Ø³Ø¹Ø± Ø§Ù„ÙˆØ­Ø¯Ø©',
  'offers.offerValue': 'Ù‚ÙŠÙ…Ø© Ø§Ù„Ø¹Ø±Ø¶',
  'offers.acceptBodyLead': 'Ø§Ù„Ù‚Ø¨ÙˆÙ„ ÙŠÙÙ†Ø´Ø¦ Ø·Ù„Ø¨Ù‹Ø§.',
  'offers.acceptBodyBank': 'ÙŠÙ„ØªØ²Ù… Ø¨Ù‡ Ø§Ù„Ù…Ø´ØªØ±ÙŠ ÙˆÙŠØ¯ÙØ¹ Ø¹Ù† Ø·Ø±ÙŠÙ‚',
  'offers.acceptBodyTail':
    'â€” Ø§Ù„Ù…Ù†ØµØ© Ù„Ø§ ØªØ³ØªÙ‚Ø¨Ù„ Ù…Ø¯ÙÙˆØ¹Ø§Øª Ø¨Ø§Ù„Ø¨Ø·Ø§Ù‚Ø©. Ø£Ù†Øª ØªÙØµØ¯Ø± Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ø§Ù„Ø£ÙˆÙ„ÙŠØ© ÙˆØªØ¤ÙƒØ¯ Ø§Ù„Ø­ÙˆØ§Ù„Ø© Ø¹Ù†Ø¯ ÙˆØµÙˆÙ„Ù‡Ø§Ø› Ø«Ù… ÙŠÙ†ØªÙ‚Ù„ Ø§Ù„Ø·Ù„Ø¨ Ø¥Ù„Ù‰ Ø§Ù„Ø´Ø­Ù†. Ù‡Ø°Ø§ Ø§Ù„Ù‚Ø±Ø§Ø± Ù†Ù‡Ø§Ø¦ÙŠ: Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¨ØªÙ‘ ÙÙŠ Ø¹Ø±Ø¶ Ù…Ù‚Ø¨ÙˆÙ„.',
  'offers.acceptCta': 'Ø§Ù‚Ø¨Ù„ ÙˆØ£Ù†Ø´Ø¦ Ø§Ù„Ø·Ù„Ø¨',
  'offers.accepting': 'Ø¬Ø§Ø±Ù Ø§Ù„Ù‚Ø¨ÙˆÙ„â€¦',
  'offers.acceptErr': 'ØªØ¹Ø°Ù‘Ø± Ù‚Ø¨ÙˆÙ„ Ù‡Ø°Ø§ Ø§Ù„Ø¹Ø±Ø¶.',
  'offers.acceptDone': 'ØªÙ… Ù‚Ø¨ÙˆÙ„ Ø§Ù„Ø¹Ø±Ø¶ #{id}. Ø£ÙÙ†Ø´Ø¦ Ø·Ù„Ø¨ Ù„Ù€ {buyer}.',
  'offers.rejectTitle': 'Ø±ÙØ¶ Ø§Ù„Ø¹Ø±Ø¶ #{id}ØŸ',
  'offers.rejectBody':
    'Ø¹Ø±Ø¶ {buyer} Ø¨Ù‚ÙŠÙ…Ø© {price} Ø¹Ù„Ù‰ {product} ÙŠÙØºÙ„Ù‚. Ø§Ù„Ø±ÙØ¶ Ù†Ù‡Ø§Ø¦ÙŠ â€” Ù„Ø§ ÙŠÙ…ÙƒÙ† Ù„Ù„Ù…Ø´ØªØ±ÙŠ Ø¥Ø­ÙŠØ§Ø¡ Ù‡Ø°Ø§ Ø§Ù„Ø¹Ø±Ø¶ØŒ Ù„ÙƒÙ†Ù‡ Ù‚Ø¯ ÙŠÙØªØ­ Ø¹Ø±Ø¶Ù‹Ø§ Ø¬Ø¯ÙŠØ¯Ù‹Ø§.',
  'offers.rejectCta': 'Ø§Ø±ÙØ¶ Ø§Ù„Ø¹Ø±Ø¶',
  'offers.rejecting': 'Ø¬Ø§Ø±Ù Ø§Ù„Ø±ÙØ¶â€¦',
  'offers.rejectErr': 'ØªØ¹Ø°Ù‘Ø± Ø±ÙØ¶ Ù‡Ø°Ø§ Ø§Ù„Ø¹Ø±Ø¶.',
  'offers.rejectDone': 'ØªÙ… Ø±ÙØ¶ Ø§Ù„Ø¹Ø±Ø¶ #{id}.',

  'myoffers.titleSupplier': 'Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø§Ù„Ù…Ù‚Ø¯ÙÙ‘Ù…Ø© Ø¹Ù„Ù‰ Ù…Ø®Ø²ÙˆÙ†ÙŠ',
  'myoffers.titleAdmin': 'ÙƒÙ„ Ø§Ù„Ø¹Ø±ÙˆØ¶',
  'myoffers.titleBuyer': 'Ø¹Ø±ÙˆØ¶ÙŠ',
  'myoffers.subSupplier': 'Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø§Ù„ØªÙŠ Ù‚Ø¯Ù‘Ù…Ù‡Ø§ Ø§Ù„Ù…Ø´ØªØ±ÙˆÙ† Ø¹Ù„Ù‰ Ù…Ø®Ø²ÙˆÙ†Ùƒ. Ù‚Ø¯Ù‘Ù… Ø¹Ø±Ø¶Ù‹Ø§ Ù…Ù‚Ø§Ø¨Ù„Ù‹Ø§ Ø£Ùˆ Ø§Ù‚Ø¨Ù„ Ø£Ùˆ Ø§Ø±ÙØ¶ ÙƒÙ„ Ø¹Ø±Ø¶.',
  'myoffers.subAdmin': 'ÙƒÙ„ Ø¹Ø±Ø¶ Ø¹Ù„Ù‰ Ø§Ù„Ù…Ù†ØµØ©ØŒ Ø§Ù„Ø£Ø­Ø¯Ø« Ø£ÙˆÙ„Ù‹Ø§.',
  'myoffers.subBuyer': 'Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø§Ù„ØªÙŠ Ù‚Ø¯Ù‘Ù…ØªÙ‡Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø¬Ø§Ù‡Ø². Ù‚Ø¯Ù‘Ù… Ø¹Ø±Ø¶Ù‹Ø§ Ù…Ù‚Ø§Ø¨Ù„Ù‹Ø§ Ø£Ùˆ Ø§Ù‚Ø¨Ù„ Ø£Ùˆ Ø§Ø±ÙØ¶ ÙƒÙ„ Ø¹Ø±Ø¶.',
  'myoffers.signInSub': 'Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ø±Ø¤ÙŠØ© Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø§Ù„ØªÙŠ ØªØªÙØ§ÙˆØ¶ Ø¹Ù„ÙŠÙ‡Ø§',
  'myoffers.notSignedIn': 'Ù„Ù… ØªØ³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„',
  'myoffers.notSignedInBody': 'Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø®Ø§ØµØ© Ø¨Ø§Ù„Ø·Ø±ÙÙŠÙ†: Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„ÙØªØ­ Ø¹Ø±Ø¶ Ø£Ùˆ ØªÙ‚Ø¯ÙŠÙ… Ø¹Ø±Ø¶ Ù…Ù‚Ø§Ø¨Ù„ Ø£Ùˆ Ù‚Ø¨ÙˆÙ„Ù‡.',
  'myoffers.loadErrorTitle': 'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¹Ø±ÙˆØ¶',
  'myoffers.loadErrorBody': 'Ù„Ù… ØªÙØ±Ø¬Ø¹ Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© Ø¹Ø±ÙˆØ¶Ùƒ â€” Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.',
  'myoffers.trying': 'Ø¬Ø§Ø±Ù Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©â€¦',
  'myoffers.emptyTitle': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¹Ø±ÙˆØ¶ Ø¨Ø¹Ø¯',
  'myoffers.emptySupplier': 'ØªØ¸Ù‡Ø± Ù‡Ù†Ø§ Ø§Ù„Ø¹Ø±ÙˆØ¶ Ø§Ù„ØªÙŠ ÙŠÙ‚Ø¯Ù‘Ù…Ù‡Ø§ Ø§Ù„Ù…Ø´ØªØ±ÙˆÙ† Ø¹Ù„Ù‰ Ø¥Ø¹Ù„Ø§Ù†Ø§ØªÙƒØŒ Ø¬Ø§Ù‡Ø²Ø© Ù„ØªÙ‚Ø¯ÙŠÙ… Ø¹Ø±Ø¶ Ù…Ù‚Ø§Ø¨Ù„ Ø£Ùˆ Ù„Ù„Ù‚Ø¨ÙˆÙ„.',
  'myoffers.emptyAdmin': 'Ù„Ù… ÙŠÙÙØªØ­ Ø£ÙŠ Ø¹Ø±Ø¶ Ø¹Ù„Ù‰ Ø§Ù„Ù…Ù†ØµØ© Ø¨Ø¹Ø¯.',
  'myoffers.emptyBuyer': 'Ø§ÙØªØ­ Ø§Ù„Ø¯ÙØ¹Ø© Ø§Ù„ØªÙŠ ØªØ±ÙŠØ¯Ù‡Ø§ ÙˆÙ‚Ø¯Ù‘Ù… Ø¹Ø±Ø¶Ù‹Ø§ â€” ÙŠÙ…ÙƒÙ† Ù„Ù„Ù…ÙˆØ±Ù‘Ø¯ ØªÙ‚Ø¯ÙŠÙ… Ø¹Ø±Ø¶ Ù…Ù‚Ø§Ø¨Ù„ Ø£Ùˆ Ø§Ù„Ù‚Ø¨ÙˆÙ„ Ø£Ùˆ Ø§Ù„Ø±ÙØ¶.',
  'myoffers.browseStock': 'ØªØµÙÙ‘Ø­ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø¬Ø§Ù‡Ø²',
  'myoffers.count': '{n} Ø¹Ø±Ø¶Ù‹Ø§',
  'myoffers.stillOpen': '{n} Ù…Ø§ Ø²Ø§Ù„Øª Ù…ÙØªÙˆØ­Ø©',
  'myoffers.col.offer': 'Ø§Ù„Ø¹Ø±Ø¶',
  'myoffers.col.counterparty': 'Ø§Ù„Ø·Ø±Ù Ø§Ù„Ø¢Ø®Ø±',
  'myoffers.col.quantity': 'Ø§Ù„ÙƒÙ…ÙŠØ©',
  'myoffers.col.unitPrice': 'Ø³Ø¹Ø± Ø§Ù„ÙˆØ­Ø¯Ø©',
  'myoffers.col.status': 'Ø§Ù„Ø­Ø§Ù„Ø©',
  'myoffers.col.date': 'Ø§Ù„ØªØ§Ø±ÙŠØ®',
  'myoffers.col.action': 'Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡',
  'myoffers.counterTo': 'Ø¹Ø±Ø¶ Ù…Ù‚Ø§Ø¨Ù„ Ø¹Ù„Ù‰ #{id}',
  'myoffers.seatSupplier': 'Ù…ÙˆØ±Ù‘Ø¯',
  'myoffers.seatBuyer': 'Ù…Ø´ØªØ±Ù',
  'myoffers.noAction': 'Ù„Ø§ Ø¥Ø¬Ø±Ø§Ø¡ Ø¥Ø¶Ø§ÙÙŠ',
  'myoffers.confirmReject': 'ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø±ÙØ¶',
  'myoffers.counter': 'Ø¹Ø±Ø¶ Ù…Ù‚Ø§Ø¨Ù„',
  'myoffers.accept': 'Ù‚Ø¨ÙˆÙ„',
  'myoffers.reject': 'Ø±ÙØ¶',
  'myoffers.counterTitle': 'Ø¹Ø±Ø¶ Ù…Ù‚Ø§Ø¨Ù„ Ø¹Ù„Ù‰ Ø§Ù„Ø¹Ø±Ø¶ #{id}',
  'myoffers.counterDoneTitle': 'Ø£ÙØ±Ø³Ù„ Ø§Ù„Ø¹Ø±Ø¶ Ø§Ù„Ù…Ù‚Ø§Ø¨Ù„',
  'myoffers.counterDoneBody': 'Ø¹Ø±Ø¶Ùƒ Ø§Ù„Ù…Ù‚Ø§Ø¨Ù„ Ù„Ø¯Ù‰ Ø§Ù„Ø·Ø±Ù Ø§Ù„Ø¢Ø®Ø±',
  'myoffers.backToOffers': 'Ø§Ù„Ø¹ÙˆØ¯Ø© Ø¥Ù„Ù‰ Ø¹Ø±ÙˆØ¶ÙŠ',
  'myoffers.counterLead': '{product} Â· Ø§Ù„Ø¹Ø±Ø¶ #{id} Â· Ø¹ÙØ±Ø¶Øª {qty} Ø¨Ø³Ø¹Ø± {price} Ù„Ù„ÙˆØ­Ø¯Ø©',
  'myoffers.perUnit': 'Ø¨Ø§Ù„Ù€{currency}ØŒ Ù„Ù„ÙˆØ­Ø¯Ø©.',
  'myoffers.inCurrency': 'Ø¨Ø§Ù„Ù€{currency}ØŒ Ù„Ù„ÙˆØ­Ø¯Ø©.',
  'myoffers.originally': 'ÙÙŠ Ø§Ù„Ø£ØµÙ„ {qty}.',
  'myoffers.messageLabel': 'Ø±Ø³Ø§Ù„Ø© Ø¥Ù„Ù‰ Ø§Ù„Ø·Ø±Ù Ø§Ù„Ø¢Ø®Ø±',
  'myoffers.messagePlaceholder': 'Ù…Ø¯Ø© Ø§Ù„ØªØ³Ù„ÙŠÙ…ØŒ Ø§Ù„ØªØºÙ„ÙŠÙØŒ Ø´Ø±ÙˆØ· Ø§Ù„Ø¯ÙØ¹â€¦',
  'myoffers.sendCounter': 'Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø¹Ø±Ø¶ Ø§Ù„Ù…Ù‚Ø§Ø¨Ù„',
  'myoffers.sending': 'Ø¬Ø§Ø±Ù Ø§Ù„Ø¥Ø±Ø³Ø§Ù„â€¦',
  'myoffers.errInvalid': 'Ø£Ø¯Ø®Ù„ Ø³Ø¹Ø± ÙˆØ­Ø¯Ø© ÙˆÙƒÙ…ÙŠØ© Ø£ÙƒØ¨Ø± Ù…Ù† ØµÙØ±.',
  'myoffers.errCounter': 'ØªØ¹Ø°Ù‘Ø± Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø¹Ø±Ø¶ Ø§Ù„Ù…Ù‚Ø§Ø¨Ù„ â€” Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.',
  'myoffers.acceptTitle': 'Ù‚Ø¨ÙˆÙ„ Ø§Ù„Ø¹Ø±Ø¶ #{id}',
  'myoffers.acceptLead': '{product} Â· {qty} Ø¨Ø³Ø¹Ø± {price} Ù„Ù„ÙˆØ­Ø¯Ø©',
  'myoffers.acceptStripeLead': 'Ø§Ù„Ù‚Ø¨ÙˆÙ„ ÙŠØ¹Ù†ÙŠ Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø© Ø¹Ù„Ù‰ Ù‡Ø°Ø§ Ø§Ù„Ø³Ø¹Ø± ÙˆØ§Ù„ÙƒÙ…ÙŠØ© Ùˆ',
  'myoffers.acceptStripeStrong': 'Ø¥Ù†Ø´Ø§Ø¡ Ø·Ù„Ø¨',
  'myoffers.acceptStripeTail': 'Ù„Ù‡. Ø«Ù… ÙŠØ¸Ù‡Ø± Ø§Ù„Ø·Ù„Ø¨ Ø¶Ù…Ù† Ø§Ù„Ø·Ù„Ø¨Ø§ØªØŒ Ø­ÙŠØ« ØªÙØªØ§Ø¨ÙØ¹ Ù…Ø±Ø§Ø­Ù„ Ø§Ù„Ø´Ø­Ù†.',
  'myoffers.acceptHint': 'Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø¹Ù† Ù‡Ø°Ø§ â€” ØªÙØºÙ„Ù‚ Ø§Ù„Ù…ÙØ§ÙˆØ¶Ø© Ø¨Ø§Ù„Ø´Ø±ÙˆØ· Ø§Ù„Ù…Ù‚Ø¨ÙˆÙ„Ø©.',
  'myoffers.acceptCta': 'Ù‚Ø¨ÙˆÙ„ ÙˆØ¥Ù†Ø´Ø§Ø¡ Ø·Ù„Ø¨',
  'myoffers.accepting': 'Ø¬Ø§Ø±Ù Ø§Ù„Ù‚Ø¨ÙˆÙ„â€¦',
  'myoffers.errAccept': 'ØªØ¹Ø°Ù‘Ø± Ù‚Ø¨ÙˆÙ„ Ø§Ù„Ø¹Ø±Ø¶ â€” Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.',
  'myoffers.accepted': 'ØªÙ… Ù‚Ø¨ÙˆÙ„ Ø§Ù„Ø¹Ø±Ø¶ #{id}. Ø±Ø§Ø¬Ø¹ Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ù„Ù„Ø§Ø·Ù„Ø§Ø¹ Ø¹Ù„Ù‰ Ø§Ù„Ø·Ù„Ø¨ Ø§Ù„Ù†Ø§ØªØ¬.',
  'myoffers.viewOrders': 'Ø¹Ø±Ø¶ Ø§Ù„Ø·Ù„Ø¨Ø§Øª',
  'myoffers.errReject': 'ØªØ¹Ø°Ù‘Ø± Ø±ÙØ¶ Ø§Ù„Ø¹Ø±Ø¶ #{id} â€” Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.',

  'ship.title': 'Ø§Ù„Ø´Ø­Ù†Ø§Øª',
  'ship.subSupplier': 'Ù…Ø±Ø§Ø­Ù„ Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ù…Ù‚Ø¯ÙÙ‘Ù…Ø© Ø¹Ù„Ù‰ Ù…Ø®Ø²ÙˆÙ†Ùƒ. Ø£Ù†Øª Ù…Ù† ÙŠÙ‚Ø¯Ù‘Ù… ÙƒÙ„ Ø´Ø­Ù†Ø© Ø¥Ù„Ù‰ Ø§Ù„Ø£Ù…Ø§Ù….',
  'ship.subAdmin': 'Ù…Ø±Ø§Ø­Ù„ ÙƒÙ„ Ø·Ù„Ø¨. ÙŠÙ…ÙƒÙ† Ù„Ù„Ù…Ø´Ø±ÙÙŠÙ† ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ø´Ø­Ù†Ø© Ù†ÙŠØ§Ø¨Ø© Ø¹Ù† Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯.',
  'ship.subBuyer': 'Ù…ØªØ§Ø¨Ø¹Ø© Ù…Ø±Ø§Ø­Ù„ Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„ØªÙŠ Ù‚Ø¯Ù‘Ù…ØªÙ‡Ø§. ÙŠØªÙˆÙ„Ù‰ Ù…ÙˆØ±Ù‘Ø¯Ùƒ ØªÙ‚Ø¯ÙŠÙ… ÙƒÙ„ Ø®Ø·ÙˆØ©.',
  'ship.signInSub': 'Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ù…ØªØ§Ø¨Ø¹Ø© Ø´Ø­Ù†Ø§ØªÙƒ',
  'ship.notSignedIn': 'Ù„Ù… ØªØ³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„',
  'ship.notSignedInBody': 'Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„Ø´Ø­Ù† Ø®Ø§ØµØ© Ø¨Ø§Ù„Ù…Ø´ØªØ±ÙŠ ÙˆØ§Ù„Ù…ÙˆØ±Ù‘Ø¯ ÙÙŠ Ø§Ù„Ø·Ù„Ø¨.',
  'ship.loadErrorTitle': 'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø´Ø­Ù†Ø§Øª',
  'ship.loadErrorBody': 'Ù„Ù… ØªÙØ±Ø¬Ø¹ Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© Ø´Ø­Ù†Ø§ØªÙƒ â€” Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.',
  'ship.trying': 'Ø¬Ø§Ø±Ù Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©â€¦',
  'ship.emptyTitle': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø´Ø­Ù†Ø§Øª Ø¨Ø¹Ø¯',
  'ship.emptySupplier': 'ØªÙÙ†Ø´Ø£ Ø§Ù„Ø´Ø­Ù†Ø© ØªÙ„Ù‚Ø§Ø¦ÙŠÙ‹Ø§ Ø¹Ù†Ø¯Ù…Ø§ ÙŠØ·Ù„Ø¨ Ù…Ø´ØªØ±Ù Ù…Ù† Ù…Ø®Ø²ÙˆÙ†Ùƒ.',
  'ship.emptyBuyer': 'ØªÙÙ†Ø´Ø£ Ø´Ø­Ù†Ø© ØªÙ„Ù‚Ø§Ø¦ÙŠÙ‹Ø§ Ù„ÙƒÙ„ Ø·Ù„Ø¨ ØªÙ‚Ø¯Ù‘Ù…Ù‡ØŒ ÙˆØªØ¸Ù‡Ø± Ù…Ø±Ø§Ø­Ù„Ù‡Ø§ Ù‡Ù†Ø§.',
  'ship.myListings': 'Ø¥Ø¹Ù„Ø§Ù†Ø§ØªÙŠ',
  'ship.viewOrders': 'Ø¹Ø±Ø¶ Ø·Ù„Ø¨Ø§ØªÙŠ',
  'ship.count': 'Ø´Ø­Ù†Ø© Ø¸Ø§Ù‡Ø±Ø© Ù„Ø­Ø³Ø§Ø¨Ùƒ',
  'ship.delivered': 'Ù…ÙØ³Ù„ÙÙ‘Ù…Ø©',
  'ship.advanceRecorded': 'ÙŠÙØ³Ø¬ÙÙ‘Ù„ ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ù…Ø±Ø­Ù„Ø© Ø¨Ø·Ø§Ø¨Ø¹ Ø²Ù…Ù†ÙŠ ÙˆÙŠÙØ´Ø§Ø±ÙÙƒ Ù…Ø¹ Ø§Ù„Ù…Ø´ØªØ±ÙŠ.',
  'ship.advanceBySupplier': 'ÙŠØªÙˆÙ„Ù‰ Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ù…Ø±Ø§Ø­Ù„ ÙÙŠ ÙƒÙ„ Ø·Ù„Ø¨.',
  'ship.trackingTitle': 'Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„Ø´Ø­Ù†Ø©',
  'ship.col.shipment': 'Ø§Ù„Ø´Ø­Ù†Ø©',
  'ship.col.product': 'Ø§Ù„Ù…Ù†ØªØ¬',
  'ship.col.carrier': 'Ø§Ù„Ù†Ø§Ù‚Ù„',
  'ship.col.trackingNo': 'Ø±Ù‚Ù… Ø§Ù„ØªØªØ¨Ù‘Ø¹',
  'ship.col.documents': 'Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª',
  'ship.col.updated': 'Ø¢Ø®Ø± ØªØ­Ø¯ÙŠØ«',
  'ship.col.milestone': 'Ø§Ù„Ù…Ø±Ø­Ù„Ø©',
  'ship.noDocumentTitle': 'Ù„Ù… ÙŠÙØ±ÙÙ‚ Ø£ÙŠ Ù…Ø³ØªÙ†Ø¯ Ø¨Ø§Ù„Ø´Ø­Ù†Ø© Ø¨Ø¹Ø¯',
  'ship.advance': 'ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ù…Ø±Ø­Ù„Ø©',
  'ship.advancing': 'Ø¬Ø§Ø±Ù Ø§Ù„ØªÙ‚Ø¯ÙŠÙ…â€¦',
  'ship.deliveredLabel': 'ØªÙ… Ø§Ù„ØªØ³Ù„ÙŠÙ…',
  'ship.advancedBySupplier': 'Ù‚Ø¯Ù‘Ù…Ù‡ Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯',
  'ship.completeTitle': 'ØªÙ… Ø¨Ù„ÙˆØº Ø¬Ù…ÙŠØ¹ Ø§Ù„Ù…Ø±Ø§Ø­Ù„',
  'ship.advanceTitle': 'ØªÙ‚Ø¯ÙŠÙ… Ù‡Ø°Ù‡ Ø§Ù„Ø´Ø­Ù†Ø© Ø®Ø·ÙˆØ© ÙˆØ§Ø­Ø¯Ø©',
  'ship.noMilestones': 'Ù„Ù… ØªÙØ³Ø¬ÙÙ‘Ù„ Ø£ÙŠ Ù…Ø±Ø§Ø­Ù„ Ø¹Ù„Ù‰ Ù‡Ø°Ù‡ Ø§Ù„Ø´Ø­Ù†Ø© Ø¨Ø¹Ø¯.',
  'ship.reached': 'ØªÙ… Ø¨Ù„ÙˆØº {step} Ù…Ù† {total} Ù…Ø±Ø­Ù„Ø©',
  'ship.reachedDelivered': 'Ù…ÙØ³Ù„ÙÙ‘Ù…Ø©',
  'ship.reachedNext': 'Ø§Ù„ØªØ§Ù„ÙŠ: {next}',
  'ship.footLead': 'Ø³Ø¬Ù„ Ø§Ù„Ù…Ø±Ø§Ø­Ù„ Ù…Ø´ØªØ±Ùƒ Ø¨ÙŠÙ† Ø·Ø±ÙÙŠ Ø§Ù„Ø·Ù„Ø¨. ØªÙˆØ¬Ø¯ Ø§Ù„Ø·Ù„Ø¨Ø§Øª ÙˆØ¥Ø¬Ù…Ø§Ù„ÙŠØ§ØªÙ‡Ø§ Ø¶Ù…Ù†',
  'ship.footLink': 'Ø§Ù„Ø·Ù„Ø¨Ø§Øª',
  'ship.footTail': '.',
  'ship.errAdvance': 'ØªØ¹Ø°Ù‘Ø± ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ø´Ø­Ù†Ø© #{id} â€” Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.',

  'saved.title': 'Ø§Ù„Ø¯ÙØ¹Ø§Øª Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø©',
  'saved.signInSub': 'Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ù„Ø§Ø­ØªÙØ§Ø¸ Ø¨Ù‚Ø§Ø¦Ù…Ø© Ù…Ø®ØªØµØ±Ø© Ù…Ù† Ø§Ù„Ø¯ÙØ¹Ø§Øª',
  'saved.notSignedIn': 'Ù„Ù… ØªØ³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„',
  'saved.notSignedInBody': 'Ù‚Ø§Ø¦Ù…ØªÙƒ Ø§Ù„Ù…Ø®ØªØµØ±Ø© Ø®Ø§ØµØ© Ø¨Ø­Ø³Ø§Ø¨Ùƒ: Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ø­ÙØ¸ Ø§Ù„Ø¯ÙØ¹Ø§Øª ÙˆØ¥Ø²Ø§Ù„ØªÙ‡Ø§.',
  'saved.sub': 'Ø§Ù„Ø¯ÙØ¹Ø§Øª Ø§Ù„ØªÙŠ Ø£Ø¶ÙØªÙ‡Ø§ Ø¥Ù„Ù‰ Ù‚Ø§Ø¦Ù…ØªÙƒ Ø§Ù„Ù…Ø®ØªØµØ±Ø©. Ø§Ù„Ø£Ø³Ø¹Ø§Ø± ÙˆØ§Ù„Ù…Ø®Ø²ÙˆÙ† Ø£Ø±Ù‚Ø§Ù… Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ Ø§Ù„Ø­Ø§Ù„ÙŠØ© ÙˆÙ„ÙŠØ³Øª Ø­Ø¬Ø²Ù‹Ø§.',
  'saved.loadErrorTitle': 'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¯ÙØ¹Ø§Øª Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø©',
  'saved.loadErrorBody': 'Ù„Ù… ØªÙØ±Ø¬Ø¹ Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© Ù‚Ø§Ø¦Ù…ØªÙƒ Ø§Ù„Ù…Ø®ØªØµØ±Ø© â€” Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.',
  'saved.trying': 'Ø¬Ø§Ø±Ù Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©â€¦',
  'saved.emptyTitle': 'Ù„Ù… ÙŠÙØ­ÙØ¸ Ø´ÙŠØ¡ Ø¨Ø¹Ø¯',
  'saved.emptyBody': 'Ø§Ø­ÙØ¸ Ø¯ÙØ¹Ø© Ù…Ù† Ø§Ù„Ø³ÙˆÙ‚ Ù„ØªØ¸Ù‡Ø± Ù‡Ù†Ø§ Ù„Ù…Ù‚Ø§Ø±Ù†Ø© Ø³Ø±ÙŠØ¹Ø© Ù„Ø§Ø­Ù‚Ù‹Ø§.',
  'saved.browse': 'ØªØµÙÙ‘Ø­ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø¬Ø§Ù‡Ø²',
  'saved.goToFeed': 'Ø§Ù„Ø§Ù†ØªÙ‚Ø§Ù„ Ø¥Ù„Ù‰ ØªØ¯ÙÙ‚ Ø§Ù„Ø³ÙˆÙ‚',
  'saved.count': '{n} Ø¯ÙØ¹Ø© Ù…Ø­ÙÙˆØ¸Ø©',
  'saved.mostRecent': 'Ø§Ù„Ø£Ø­Ø¯Ø« Ø­ÙØ¸Ù‹Ø§ Ø£ÙˆÙ„Ù‹Ø§',
  'saved.savedOn': 'Ø­ÙÙØ¸Øª ÙÙŠ {date}',
  'saved.remove': 'Ø¥Ø²Ø§Ù„Ø©',
  'saved.removing': 'Ø¬Ø§Ø±Ù Ø§Ù„Ø¥Ø²Ø§Ù„Ø©â€¦',
  'saved.removeTitle': 'Ø¥Ø²Ø§Ù„Ø© Ù‡Ø°Ù‡ Ø§Ù„Ø¯ÙØ¹Ø© Ù…Ù† Ù‚Ø§Ø¦Ù…ØªÙƒ Ø§Ù„Ù…Ø®ØªØµØ±Ø©',
  'saved.errRemove': 'ØªØ¹Ø°Ù‘Ø±Øª Ø¥Ø²Ø§Ù„Ø© ØªÙ„Ùƒ Ø§Ù„Ø¯ÙØ¹Ø© Ù…Ù† Ù‚Ø§Ø¦Ù…ØªÙƒ Ø§Ù„Ù…Ø®ØªØµØ±Ø© â€” Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.',

  'notes.title': 'Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª',
  'notes.signInSub': 'Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ø±Ø¤ÙŠØ© Ù†Ø´Ø§Ø· Ø­Ø³Ø§Ø¨Ùƒ',
  'notes.notSignedIn': 'Ù„Ù… ØªØ³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„',
  'notes.notSignedInBody': 'Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª Ø®Ø§ØµØ© Ø¨Ø­Ø³Ø§Ø¨Ùƒ: Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ù‚Ø±Ø§Ø¡ØªÙ‡Ø§.',
  'notes.sub': 'Ø§Ù„Ø¹Ø±ÙˆØ¶ ÙˆØ§Ù„Ø±Ø³Ø§Ø¦Ù„ ÙˆØªØ­Ø¯ÙŠØ«Ø§Øª Ø§Ù„Ø´Ø­Ù† Ø¹Ù„Ù‰ Ø­Ø³Ø§Ø¨ÙƒØŒ Ø§Ù„Ø£Ø­Ø¯Ø« Ø£ÙˆÙ„Ù‹Ø§.',
  'notes.markAll': 'ØªØ¹Ù„ÙŠÙ… Ø§Ù„ÙƒÙ„ ÙƒÙ…Ù‚Ø±ÙˆØ¡',
  'notes.marking': 'Ø¬Ø§Ø±Ù Ø§Ù„ØªØ¹Ù„ÙŠÙ…â€¦',
  'notes.markAllTitle': 'ØªØ¹Ù„ÙŠÙ… {n} Ø¥Ø´Ø¹Ø§Ø±Ù‹Ø§ ØºÙŠØ± Ù…Ù‚Ø±ÙˆØ¡ ÙƒÙ…Ù‚Ø±ÙˆØ¡',
  'notes.nothingUnread': 'Ù„Ø§ Ø´ÙŠØ¡ ØºÙŠØ± Ù…Ù‚Ø±ÙˆØ¡',
  'notes.loadErrorTitle': 'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª',
  'notes.loadErrorBody': 'Ù„Ù… ØªÙØ±Ø¬Ø¹ Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© Ø¥Ø´Ø¹Ø§Ø±Ø§ØªÙƒ â€” Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.',
  'notes.trying': 'Ø¬Ø§Ø±Ù Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©â€¦',
  'notes.emptyTitle': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¥Ø´Ø¹Ø§Ø±Ø§Øª Ø¨Ø¹Ø¯',
  'notes.emptyBody': 'Ø¹Ù†Ø¯ ØªÙ‚Ø¯ÙŠÙ… Ø¹Ø±Ø¶ Ù…Ù‚Ø§Ø¨Ù„ Ø£Ùˆ ÙˆØµÙˆÙ„ Ø±Ø³Ø§Ù„Ø© Ø£Ùˆ ØªØ­Ø±Ù‘Ùƒ Ø´Ø­Ù†Ø©ØŒ ÙŠÙØ³Ø¬ÙÙ‘Ù„ Ø°Ù„Ùƒ Ù‡Ù†Ø§.',
  'notes.browse': 'ØªØµÙÙ‘Ø­ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø¬Ø§Ù‡Ø²',
  'notes.myOrders': 'Ø·Ù„Ø¨Ø§ØªÙŠ',
  'notes.count': '{n} Ø¥Ø´Ø¹Ø§Ø±Ù‹Ø§',
  'notes.unreadCount': '{n} ØºÙŠØ± Ù…Ù‚Ø±ÙˆØ¡',
  'notes.allRead': 'ÙƒÙ„Ù‡Ø§ Ù…Ù‚Ø±ÙˆØ¡Ø©',
  'notes.unreadLabel': 'ØºÙŠØ± Ù…Ù‚Ø±ÙˆØ¡',
  'notes.footnote': 'ØªØ£ØªÙŠ Ø£Ø¹Ø¯Ø§Ø¯ ØºÙŠØ± Ø§Ù„Ù…Ù‚Ø±ÙˆØ¡ Ù…Ø¨Ø§Ø´Ø±Ø© Ù…Ù† Ø§Ù„ÙˆØ§Ø¬Ù‡Ø©. ÙØªØ­ Ù…Ø­Ø§Ø¯Ø«Ø© Ø£Ùˆ Ø¹Ø±Ø¶ Ù…Ù† Ù‡Ù†Ø§ Ù„Ø§ ÙŠÙ…Ø³Ø­ Ø§Ù„Ø¥Ø´Ø¹Ø§Ø± ØªÙ„Ù‚Ø§Ø¦ÙŠÙ‹Ø§ â€” Ø§Ø³ØªØ®Ø¯Ù… Â«ØªØ¹Ù„ÙŠÙ… Ø§Ù„ÙƒÙ„ ÙƒÙ…Ù‚Ø±ÙˆØ¡Â».',
  'notes.errMark': 'ØªØ¹Ø°Ù‘Ø± ØªØ¹Ù„ÙŠÙ… Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª ÙƒÙ…Ù‚Ø±ÙˆØ¡Ø© â€” Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.',
  'notes.justNow': 'Ø§Ù„Ø¢Ù†',
  'notes.minutesAgo': 'Ù‚Ø¨Ù„ {n} Ø¯',
  'notes.hoursAgo': 'Ù‚Ø¨Ù„ {n} Ø³',
  'notes.daysAgo': 'Ù‚Ø¨Ù„ {n} ÙŠ',
  'notes.open': 'ÙØªØ­',

  'msg.title': 'Ø§Ù„Ø±Ø³Ø§Ø¦Ù„',
  'msg.subSupplier': 'Ø§Ø³ØªÙØ³Ø§Ø±Ø§Øª Ø§Ù„Ù…Ø´ØªØ±ÙŠÙ† Ø¹Ù† Ù…Ø®Ø²ÙˆÙ†Ùƒ. ÙØªØ­ Ø§Ù„Ù…Ø­Ø§Ø¯Ø«Ø© ÙŠØ¹Ù„Ù‘Ù…Ù‡Ø§ ÙƒÙ…Ù‚Ø±ÙˆØ¡Ø©.',
  'msg.subBuyer': 'Ù…Ø­Ø§Ø¯Ø«Ø§ØªÙƒ Ù…Ø¹ Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ÙŠÙ†. ÙØªØ­ Ø§Ù„Ù…Ø­Ø§Ø¯Ø«Ø© ÙŠØ¹Ù„Ù‘Ù…Ù‡Ø§ ÙƒÙ…Ù‚Ø±ÙˆØ¡Ø©.',
  'msg.signInSub': 'Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ø±Ø¤ÙŠØ© Ù…Ø­Ø§Ø¯Ø«Ø§ØªÙƒ',
  'msg.notSignedIn': 'Ù„Ù… ØªØ³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„',
  'msg.notSignedInBody': 'Ø§Ù„Ù…Ø­Ø§Ø¯Ø«Ø§Øª Ø®Ø§ØµØ© Ø¨Ø§Ù„Ø·Ø±ÙÙŠÙ†: Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ù„Ù‚Ø±Ø§Ø¡Ø© ÙˆØ§Ù„Ø±Ø¯.',
  'msg.loadErrorTitle': 'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…Ø­Ø§Ø¯Ø«Ø§Øª',
  'msg.loadErrorBody': 'Ù„Ù… ØªÙØ±Ø¬Ø¹ Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© Ù…Ø­Ø§Ø¯Ø«Ø§ØªÙƒ â€” Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.',
  'msg.trying': 'Ø¬Ø§Ø±Ù Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©â€¦',
  'msg.emptyTitle': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ø­Ø§Ø¯Ø«Ø§Øª Ø¨Ø¹Ø¯',
  'msg.emptySupplier': 'Ø¹Ù†Ø¯Ù…Ø§ ÙŠØ³Ø£Ù„ Ù…Ø´ØªØ±Ù Ø¹Ù† Ø¥Ø­Ø¯Ù‰ Ø¯ÙØ¹Ø§ØªÙƒØŒ ØªØ¸Ù‡Ø± Ø§Ù„Ù…Ø­Ø§Ø¯Ø«Ø© Ù‡Ù†Ø§.',
  'msg.emptyBuyer': 'Ø§ÙØªØ­ Ø¯ÙØ¹Ø© ØªÙ‡Ù…Ù‘Ùƒ ÙˆØ±Ø§Ø³Ù„ Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ â€” ØªØ¸Ù‡Ø± Ø§Ù„Ù…Ø­Ø§Ø¯Ø«Ø© Ù‡Ù†Ø§.',
  'msg.browse': 'ØªØµÙÙ‘Ø­ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø¬Ø§Ù‡Ø²',
  'msg.myListings': 'Ø¥Ø¹Ù„Ø§Ù†Ø§ØªÙŠ',
  'msg.noMessagesYet': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø±Ø³Ø§Ø¦Ù„ Ø¨Ø¹Ø¯',
  'msg.count': '{n} Ø±Ø³Ø§Ù„Ø©',
  'msg.pickTitle': 'Ø§Ø®ØªØ± Ù…Ø­Ø§Ø¯Ø«Ø©',
  'msg.pickBody': 'ØªØ¸Ù‡Ø± Ø±Ø³Ø§Ø¦Ù„Ù‡Ø§ Ù‡Ù†Ø§.',
  'msg.threadLoadError': 'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ù‡Ø°Ù‡ Ø§Ù„Ù…Ø­Ø§Ø¯Ø«Ø©',
  'msg.threadLoadErrorBody': 'Ø±Ø¨Ù…Ø§ Ø£ÙØ²ÙŠÙ„Øª Ø£Ùˆ Ù„Ù… ØªØ¹Ø¯ Ù…ØªØ§Ø­Ø© Ù„Ø­Ø³Ø§Ø¨Ùƒ â€” Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.',
  'msg.noLot': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¯ÙØ¹Ø© Ù…Ø±ØªØ¨Ø·Ø©',
  'msg.viewLot': 'Ø¹Ø±Ø¶ Ø§Ù„Ø¯ÙØ¹Ø©',
  'msg.emptyThreadTitle': 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø±Ø³Ø§Ø¦Ù„ ÙÙŠ Ù‡Ø°Ù‡ Ø§Ù„Ù…Ø­Ø§Ø¯Ø«Ø© Ø¨Ø¹Ø¯',
  'msg.emptyThreadBody': 'Ø§ÙƒØªØ¨ Ø§Ù„Ø±Ø³Ø§Ù„Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰ Ø£Ø¯Ù†Ø§Ù‡.',
  'msg.messagePlaceholder': 'Ø±Ø§Ø³Ù„ {name}â€¦',
  'msg.messageAria': 'Ø§ÙƒØªØ¨ Ø±Ø³Ø§Ù„Ø©',
  'msg.send': 'Ø¥Ø±Ø³Ø§Ù„',
  'msg.sending': 'Ø¬Ø§Ø±Ù Ø§Ù„Ø¥Ø±Ø³Ø§Ù„â€¦',
  'msg.read': 'Ù…Ù‚Ø±ÙˆØ¡Ø©',
  'msg.otherParty': 'Ø§Ù„Ø·Ø±Ù Ø§Ù„Ø¢Ø®Ø±',
  'msg.errSend': 'ØªØ¹Ø°Ù‘Ø± Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø±Ø³Ø§Ù„Ø© â€” Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.',
  'msg.justNow': 'Ø§Ù„Ø¢Ù†',
  'msg.minutesAgo': 'Ù‚Ø¨Ù„ {n} Ø¯',
  'msg.hoursAgo': 'Ù‚Ø¨Ù„ {n} Ø³',
  'msg.daysAgo': 'Ù‚Ø¨Ù„ {n} ÙŠ',

  'verify.title': 'Ø§Ù„ØªÙˆØ«ÙŠÙ‚',
  'verify.sub': 'Ø£ÙˆØ¯Ø¹ Ù…Ø³ØªÙ†Ø¯Ø§ØªÙƒØŒ ÙˆØªØ§Ø¨Ø¹ Ù‚Ø±Ø§Ø± Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©ØŒ ÙˆØ§Ø¹Ø±Ù Ù…Ø§ ÙŠÙÙ‚Ø§Ù„ Ù„Ù„Ù…Ø´ØªØ±ÙŠÙ† Ø¹Ù†Ù‡Ø§',
  'verify.signInSub': 'Ù…Ø³ØªÙ†Ø¯Ø§Øª ÙŠØ¹ØªÙ…Ø¯ Ø¹Ù„ÙŠÙ‡Ø§ Ø§Ù„Ù…Ø´ØªØ±ÙˆÙ† Ù‚Ø¨Ù„ Ø¯ÙØ¹ Ø§Ù„Ù…Ø§Ù„',
  'verify.notSignedIn': 'Ù„Ù… ØªØ³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„',
  'verify.notSignedInBody':
    'Ù…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„ØªÙˆØ«ÙŠÙ‚ ØªØ®Øµ Ø­Ø³Ø§Ø¨ Ù…ÙˆØ±Ù‘Ø¯ ÙˆÙ„Ø§ ØªÙƒÙˆÙ† Ø¹Ù„Ù†ÙŠØ© Ø¨Ø´ÙƒÙ„Ù‡Ø§ Ø§Ù„Ø®Ø§Ù… Ø£Ø¨Ø¯Ù‹Ø§. Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ø¥ÙŠØ¯Ø§Ø¹Ù‡Ø§ Ø£Ùˆ ØªØ­Ø¯ÙŠØ«Ù‡Ø§.',
  'verify.createSupplierAccount': 'Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨ Ù…ÙˆØ±Ù‘Ø¯',
  'verify.supplierOnly': 'Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† ÙÙ‚Ø·',
  'verify.supplierOnlyBody': 'Ø­Ø³Ø§Ø¨Ùƒ Ø­Ø³Ø§Ø¨ {role}ØŒ Ù„Ø°Ø§ Ù„Ø§ ØªÙˆØ¬Ø¯ Ù‚Ø§Ø¦Ù…Ø© ØªØ­Ù‚Ù‚ Ù„Ù„Ù…ÙˆØ±Ù‘Ø¯ Ù„Ø¥ÙƒÙ…Ø§Ù„Ù‡Ø§.',
  'verify.seeSuppliers': 'Ø§Ø·Ù‘Ù„Ø¹ Ø¹Ù„Ù‰ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† Ø§Ù„Ù…ÙˆØ«Ù‘Ù‚ÙŠÙ†',
  'verify.approved': 'Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„Ù…Ø¹ØªÙ…Ø¯Ø©',
  'verify.waiting': 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹',
  'verify.actionNeeded': 'Ù†Ø§Ù‚Øµ Ø£Ùˆ Ù…ÙØ¹Ø§Ø¯',
  'verify.coreApproved': 'Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ© Ù…Ø¹ØªÙ…Ø¯Ø©',
  'verify.confirmed': 'Ù…Ø¤ÙƒØ¯',
  'verify.pending': 'Ù‚ÙŠØ¯ Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø±',
  'verify.yourDocs': 'Ù…Ø³ØªÙ†Ø¯Ø§ØªÙƒ',
  'verify.onFile': '{n} ÙÙŠ Ø§Ù„Ø³Ø¬Ù„',
  'verify.loadErrorTitle': 'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª',
  'verify.loadErrorBody':
    'ØªØ¹Ø°Ù‘Ø± ØªØ­Ù…ÙŠÙ„ Ù…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„ØªÙˆØ«ÙŠÙ‚ â€” Ø£Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©. Ø¥Ø°Ø§ Ø§Ø³ØªÙ…Ø± Ø§Ù„ÙØ´Ù„ØŒ ÙÙ‚Ø¯ Ù„Ø§ ÙŠÙƒÙˆÙ† Ù„Ø­Ø³Ø§Ø¨Ùƒ Ù…Ù„Ù Ù…ÙˆØ±Ù‘Ø¯ Ø¨Ø¹Ø¯.',
  'verify.emptyTitle': 'Ù„Ø§ Ù…Ø³ØªÙ†Ø¯Ø§Øª ÙÙŠ Ø§Ù„Ø³Ø¬Ù„',
  'verify.emptyBody':
    'Ù„Ù… ÙŠÙÙˆØ¯ÙØ¹ Ø£ÙŠ Ù…Ø³ØªÙ†Ø¯ Ø¨Ø¹Ø¯ØŒ Ù„Ø°Ø§ Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø¥Ø¸Ù‡Ø§Ø± Ø´Ø§Ø±Ø© ØªÙˆØ«ÙŠÙ‚ Ù„Ù„Ù…Ø´ØªØ±ÙŠÙ†. Ø§Ø³ØªØ®Ø¯Ù… Ø§Ù„Ù†Ù…ÙˆØ°Ø¬ Ù„Ø¥ÙŠØ¯Ø§Ø¹ Ø£ÙˆÙ„ Ù…Ø³ØªÙ†Ø¯ â€” Ø§Ø¨Ø¯Ø£ Ø¨Ù€ {first}.',
  'verify.col.document': 'Ø§Ù„Ù…Ø³ØªÙ†Ø¯',
  'verify.col.status': 'Ø§Ù„Ø­Ø§Ù„Ø©',
  'verify.col.note': 'Ù…Ù„Ø§Ø­Ø¸Ø© Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹',
  'verify.col.reviewed': 'ØªØ§Ø±ÙŠØ® Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©',
  'verify.filed': 'Ø£ÙÙˆØ¯Ø¹ ÙÙŠ {date}',
  'verify.reference': 'Ø§Ù„Ù…Ø±Ø¬Ø¹: {ref}',
  'verify.noReference': 'Ù„Ù… ÙŠÙØ¹Ø·Ù Ù…Ø±Ø¬Ø¹',
  'verify.resubmit': 'Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¥Ø±Ø³Ø§Ù„',
  'verify.tierFootnote':
    'ØªÙØ¯Ø±Ø¬ Ù‡Ù†Ø§ ÙÙ‚Ø· Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„ØªÙŠ ØªØ±Ø¬Ø¹Ù‡Ø§ Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© Ù„Ù…Ù„Ù Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ Ø§Ù„Ø®Ø§Øµ Ø¨Ùƒ. Ø§Ù„Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ù†Ø§Ù‚ØµØ© Ù„ÙŠØ³ Ù„Ù‡Ø§ ØµÙ Ø¨Ø¹Ø¯ â€” ÙˆØ¥ÙŠØ¯Ø§Ø¹Ù‡Ø§ ÙŠÙÙ†Ø´Ø¦Ù‡.',
  'verify.fileTitle': 'Ø¥ÙŠØ¯Ø§Ø¹ Ù…Ø³ØªÙ†Ø¯ Ø£Ùˆ ØªØ­Ø¯ÙŠØ«Ù‡',
  'verify.docType': 'Ù†ÙˆØ¹ Ø§Ù„Ù…Ø³ØªÙ†Ø¯',
  'verify.existingHintPre': 'Ù„Ø¯ÙŠÙƒ Ø¨Ø§Ù„ÙØ¹Ù„ ØµÙ Ù„Ù€ {doc} â€” Ø§Ù„Ø­Ø§Ù„Ø©',
  'verify.existingHintPost':
    '. Ø§Ù„Ø¥ÙŠØ¯Ø§Ø¹ Ù…Ø¬Ø¯Ø¯Ù‹Ø§ ÙŠØ³ØªØ¨Ø¯Ù„Ù‡ ÙˆÙŠÙ…Ø³Ø­ Ø§Ù„Ù‚Ø±Ø§Ø± Ø§Ù„Ø³Ø§Ø¨Ù‚ØŒ Ù„Ø°Ø§ Ø³ÙŠØ­ØªØ§Ø¬ Ø§Ù„Ù…Ø³ØªÙ†Ø¯ Ø§Ù„Ù…Ø¹ØªÙ…Ø¯ Ø¥Ù„Ù‰ Ø§Ø¹ØªÙ…Ø§Ø¯ Ø¬Ø¯ÙŠØ¯.',
  'verify.refLabel': 'Ù…Ø±Ø¬Ø¹ / Ø±Ø§Ø¨Ø· Ø§Ù„Ù…Ø³ØªÙ†Ø¯',
  'verify.refPlaceholder': 'https://â€¦/business-licence.pdf Ø£Ùˆ Ù…Ø±Ø¬Ø¹ Ù…Ù„ÙÙƒ',
  'verify.refHintLead': 'Ø±ÙØ¹ Ø§Ù„Ù…Ù„ÙØ§Øª ØºÙŠØ± Ù…Ø¨Ù†ÙŠ.',
  'verify.refHintTail':
    'Ø§Ù„ØµÙ‚ Ø±Ø§Ø¨Ø· Ø§Ù„Ù…Ø³ØªÙ†Ø¯ØŒ Ø£Ùˆ Ù…Ø±Ø¬Ø¹Ù‹Ø§ ÙŠÙ…ÙƒÙ† Ù„ÙØ±ÙŠÙ‚ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ù…ØªØ§Ø¨Ø¹ØªÙ‡. ÙŠÙØ®Ø²ÙÙ‘Ù† ÙƒÙ…Ø§ Ù‡Ùˆ ÙˆÙ„Ø§ ÙŠÙØ¹Ø±Ø¶ Ø¹Ù„Ù†Ù‹Ø§.',
  'verify.noteLabel': 'Ù…Ù„Ø§Ø­Ø¸Ø© Ù„Ù„Ù…Ø±Ø§Ø¬Ø¹',
  'verify.notePlaceholder': 'Ù…Ø§ Ø§Ù„Ø°ÙŠ ØªØºÙŠÙ‘Ø±ØŒ ÙˆÙ„Ù…Ø§Ø°Ø§ ÙŠÙØ­Ø¯ÙÙ‘Ø«ØŒ ÙˆØ£ÙŠ Ø´ÙŠØ¡ ÙŠÙ†Ø¨ØºÙŠ Ø£Ù† ÙŠØ¹Ø±ÙÙ‡ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹â€¦',
  'verify.filing': 'Ø¬Ø§Ø±Ù Ø§Ù„Ø¥ÙŠØ¯Ø§Ø¹â€¦',
  'verify.resubmitDoc': 'Ø£Ø¹Ø¯ Ø¥Ø±Ø³Ø§Ù„ {doc}',
  'verify.submitDoc': 'Ø£Ø±Ø³Ù„ {doc}',
  'verify.queueNoteLead': 'Ø§Ù„Ø¥Ø±Ø³Ø§Ù„ ÙŠØ¶Ø¹ Ø§Ù„Ù…Ø³ØªÙ†Ø¯ ÙÙŠ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø± ÙÙ‚Ø·.',
  'verify.queueNoteStrong': 'ØªØ¸Ù‡Ø± Ø§Ù„Ø´Ø§Ø±Ø© Ù„Ù„Ù…Ø´ØªØ±ÙŠÙ† Ø¹Ù†Ø¯Ù…Ø§ ÙŠØ¹ØªÙ…Ø¯Ù‡ Ù…Ø±Ø§Ø¬Ø¹',
  'verify.queueNoteTail': 'â€” Ù„Ø§ Ø¹Ù†Ø¯ Ø§Ù„Ø¥Ø±Ø³Ø§Ù„ Ø£Ø¨Ø¯Ù‹Ø§ØŒ ÙˆÙ„Ø§ ØªÙ„Ù‚Ø§Ø¦ÙŠÙ‹Ø§.',
  'verify.filedNotice':
    'ØªÙ… Ø¥ÙŠØ¯Ø§Ø¹ {doc}. Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ø¢Ù† "Ù…ÙØ±Ø³Ù„" ÙˆÙ‡Ùˆ ÙÙŠ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© â€” ÙˆÙ„Ø§ ØªØ¸Ù‡Ø± Ø§Ù„Ø´Ø§Ø±Ø© Ù„Ù„Ù…Ø´ØªØ±ÙŠÙ† Ø¥Ù„Ø§ Ø¨Ø¹Ø¯ Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹.',
  'verify.errFile': 'ØªØ¹Ø°Ù‘Ø± Ø¥ÙŠØ¯Ø§Ø¹ Ù‡Ø°Ø§ Ø§Ù„Ù…Ø³ØªÙ†Ø¯.',
  'verify.statusMeans': 'Ù…Ø¹Ù†Ù‰ ÙƒÙ„ Ø­Ø§Ù„Ø©',
  'verify.tierTitle': 'Ù…Ø³ØªÙˆÙ‰ Ø§Ù„ØªÙˆØ«ÙŠÙ‚',
  'verify.tierAll': 'Ù…ÙˆØ«Ù‘Ù‚ Â· ÙƒÙ„ Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ© Ù…Ø¹ØªÙ…Ø¯Ø©',
  'verify.tierSome': 'Ù…ÙˆØ«Ù‘Ù‚ Â· Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª Ù…Ø¹ØªÙ…Ø¯Ø©',
  'verify.tierNone': 'ØºÙŠØ± Ù…ÙˆØ«Ù‘Ù‚ Ø¨Ø¹Ø¯',
  'verify.tierAllBody': 'Ø§Ø¹ØªÙ…Ø¯ Ù…Ø±Ø§Ø¬Ø¹ ÙƒÙ„ Ù†ÙˆØ¹ Ù…Ù† Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ© ÙÙŠ Ù‡Ø°Ù‡ Ø§Ù„ØµÙØ­Ø©.',
  'verify.tierSomeBody': 'Ù…Ø³ØªÙ†Ø¯ ÙˆØ§Ø­Ø¯ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„ Ù…Ø¹ØªÙ…Ø¯{n}Ø› ÙˆØ§Ù„Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ© Ø§Ù„Ù…ØªØ¨Ù‚ÙŠØ© ØªÙ‚ÙˆÙ‘ÙŠ Ø§Ù„Ù…Ù„Ù.',
  'verify.tierNoneBody': 'Ù„Ù… ÙŠÙØ¹ØªÙ…Ø¯ Ø£ÙŠ Ù…Ø³ØªÙ†Ø¯ Ø¨Ø¹Ø¯ØŒ Ù„Ø°Ø§ Ù„Ø§ ØªÙØ¹Ø±Ø¶ Ù„Ù„Ù…Ø´ØªØ±ÙŠÙ† Ø£ÙŠ Ø´Ø§Ø±Ø© ØªÙˆØ«ÙŠÙ‚ Ù„Ø´Ø±ÙƒØªÙƒ.',
  'verify.tierHint':
    'ÙŠØ­Ø¯Ù‘Ø¯ ÙØ±ÙŠÙ‚ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù…Ø³ØªÙˆÙ‰ Ø§Ù„Ø°ÙŠ ÙŠØ­Ù…Ù„Ù‡ Ø­Ø³Ø§Ø¨Ùƒ Ù…Ù† Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„Ù…Ø¹ØªÙ…Ø¯Ø© â€” Ù‡Ø°Ù‡ Ø§Ù„Ø´Ø§Ø´Ø© ØªØ¹Ø±Ø¶ Ø­Ø§Ù„Ø§Øª Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„ØªÙŠ ØªØ±Ø¬Ø¹Ù‡Ø§ Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© ÙˆÙ„Ø§ ØªØ­Ø³Ø¨ Ø±Ù‚Ù… Ù…Ø³ØªÙˆÙ‰ Ø¨Ù†ÙØ³Ù‡Ø§. ÙŠØ±Ù‰ Ø§Ù„Ù…Ø´ØªØ±ÙˆÙ† Ø§Ù„Ø´Ø§Ø±Ø© Ù„Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„Ù…Ø¹ØªÙ…Ø¯Ø© ÙÙ‚Ø·.',
  'verify.suggested': 'Ø§Ù„Ù…Ù‚ØªØ±Ø­ Ø§Ù„ØªØ§Ù„ÙŠ:',
  'verify.select': 'Ø§Ø®ØªÙŠØ§Ø±',
  'verify.othersNote':
    'ÙŠØ±Ù‰ Ø§Ù„Ù…Ø´ØªØ±ÙˆÙ† Ø£ÙŠØ¶Ù‹Ø§ ØªÙ‚ÙŠÙŠÙ…Ø§Øª Ù…ÙˆØ±Ø¯ÙŠÙ† Ø¢Ø®Ø±ÙŠÙ† ÙˆØ£Ø¹Ø¯Ø§Ø¯ Ø§Ù„ØªÙØªÙŠØ´ ÙÙŠ Ù…Ù„ÙØ§ØªÙ‡Ù…. ØªÙ„Ùƒ Ø§Ù„Ø£Ø±Ù‚Ø§Ù… Ø¨ÙŠØ§Ù†Ø§Øª Ø³ÙˆÙ‚ ØªØ¬Ø±ÙŠØ¨ÙŠØ© ÙˆÙ„ÙŠØ³Øª Ù†ØªØ§Ø¬ Ù‡Ø°Ù‡ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© â€” ÙˆÙ‡Ø°Ù‡ Ø§Ù„ØµÙØ­Ø© Ù„Ø§ ØªØ¹Ø±Ø¶ Ø£ÙŠÙ‹Ø§ Ù…Ù†Ù‡Ø§ Ø¹Ù† Ù‚ØµØ¯.',
  'verify.help.missing.title': 'Ù„Ù… ÙŠÙÙˆØ¯Ø¹',
  'verify.help.missing.state': 'Ù„Ù… ÙŠÙÙˆØ¯Ø¹ Ø´ÙŠØ¡ Ø¨Ø¹Ø¯ØŒ Ø£Ùˆ Ù„Ù… ÙŠÙØ±Ø³ÙÙ„ Ø§Ù„Ù…Ø³ØªÙ†Ø¯ Ù‚Ø·.',
  'verify.help.submitted.title': 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©',
  'verify.help.submitted.state': 'Ø£ÙÙˆØ¯Ø¹ ÙˆÙŠÙ†ØªØ¸Ø± ÙÙŠ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©. Ù„Ø§ ØªÙØ¹Ø±Ø¶ Ø£ÙŠ Ø´Ø§Ø±Ø© Ù„Ù„Ù…Ø´ØªØ±ÙŠÙ† Ø¨Ø¹Ø¯.',
  'verify.help.approved.title': 'Ù…Ø¹ØªÙ…Ø¯',
  'verify.help.approved.state': 'Ø±Ø§Ø¬Ø¹Ù‡ Ù…Ø±Ø§Ø¬Ø¹ Ù…Ù‚Ø§Ø¨Ù„ Ø§Ù„Ù…Ø³ØªÙ†Ø¯ Ù†ÙØ³Ù‡. Ù‡Ø°Ø§ Ù…Ø§ ÙŠØ±Ø§Ù‡ Ø§Ù„Ù…Ø´ØªØ±ÙˆÙ†.',
  'verify.help.rejected.title': 'Ø£ÙØ¹ÙŠØ¯',
  'verify.help.rejected.state': 'Ø±ÙÙØ¶ Ù…Ø¹ Ù…Ù„Ø§Ø­Ø¸Ø©. ØµØ­Ù‘Ø­ Ø§Ù„Ù…Ø³ØªÙ†Ø¯ ÙˆØ£Ø±Ø³Ù„Ù‡ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.',
  'verify.doc.businessLicence': 'Ø§Ù„Ø³Ø¬Ù„ Ø§Ù„ØªØ¬Ø§Ø±ÙŠ',
  'verify.doc.taxCertificate': 'Ø´Ù‡Ø§Ø¯Ø© Ø¶Ø±ÙŠØ¨ÙŠØ©',
  'verify.doc.factoryAudit': 'ØªÙ‚Ø±ÙŠØ± ØªÙØªÙŠØ´ Ø§Ù„Ù…ØµÙ†Ø¹',
  'verify.doc.productCert': 'Ø´Ù‡Ø§Ø¯Ø© Ø§Ù„Ù…Ù†ØªØ¬',
  'verify.doc.exportLicence': 'Ø±Ø®ØµØ© Ø§Ù„ØªØµØ¯ÙŠØ±',
};

const ru: Partial<Record<DictKey, string>> = {
  'status.open': 'ĞÑ‚ĞºÑ€Ñ‹Ñ‚',
  'status.quoted': 'Ğ•ÑÑ‚ÑŒ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ',
  'status.closed': 'Ğ—Ğ°ĞºÑ€Ñ‹Ñ‚',
  'status.submitted': 'ĞÑ‚Ğ¿Ñ€Ğ°Ğ²Ğ»ĞµĞ½',
  'status.accepted': 'ĞŸÑ€Ğ¸Ğ½ÑÑ‚',
  'status.rejected': 'ĞÑ‚ĞºĞ»Ğ¾Ğ½Ñ‘Ğ½',
  'status.active': 'ĞĞºÑ‚Ğ¸Ğ²ĞµĞ½',
  'status.sold_out': 'Ğ Ğ°ÑĞ¿Ñ€Ğ¾Ğ´Ğ°Ğ½',
  'status.scheduled': 'Ğ—Ğ°Ğ¿Ğ»Ğ°Ğ½Ğ¸Ñ€Ğ¾Ğ²Ğ°Ğ½',
  'status.in_progress': 'Ğ’ Ñ€Ğ°Ğ±Ğ¾Ñ‚Ğµ',
  'status.passed': 'ĞŸÑ€Ğ¾Ğ¹Ğ´ĞµĞ½',
  'status.failed': 'ĞĞµ Ğ¿Ñ€Ğ¾Ğ¹Ğ´ĞµĞ½',
  'status.pending': 'Ğ’ Ğ¾Ğ¶Ğ¸Ğ´Ğ°Ğ½Ğ¸Ğ¸',
  'status.paid': 'ĞĞ¿Ğ»Ğ°Ñ‡ĞµĞ½',
  'status.shipped': 'ĞÑ‚Ğ³Ñ€ÑƒĞ¶ĞµĞ½',
  'status.delivered': 'Ğ”Ğ¾ÑÑ‚Ğ°Ğ²Ğ»ĞµĞ½',
  'status.cancelled': 'ĞÑ‚Ğ¼ĞµĞ½Ñ‘Ğ½',
  'status.missing': 'ĞĞµ Ğ¿Ğ¾Ğ´Ğ°Ğ½',
  'status.approved': 'ĞĞ´Ğ¾Ğ±Ñ€ĞµĞ½',
  'status.countered': 'Ğ’ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ',
  'status.withdrawn': 'ĞÑ‚Ğ¾Ğ·Ğ²Ğ°Ğ½',
  'status.inspecting': 'Ğ˜Ğ´Ñ‘Ñ‚ Ğ¸Ğ½ÑĞ¿ĞµĞºÑ†Ğ¸Ñ',

  'action.close': 'Ğ—Ğ°ĞºÑ€Ñ‹Ñ‚ÑŒ',
  'action.cancel': 'ĞÑ‚Ğ¼ĞµĞ½Ğ°',
  'action.dismiss': 'Ğ¡ĞºÑ€Ñ‹Ñ‚ÑŒ',
  'action.refresh': 'ĞĞ±Ğ½Ğ¾Ğ²Ğ¸Ñ‚ÑŒ',
  'action.refreshing': 'ĞĞ±Ğ½Ğ¾Ğ²Ğ»ĞµĞ½Ğ¸Ğµâ€¦',
  'action.tryAgain': 'ĞŸĞ¾Ğ²Ñ‚Ğ¾Ñ€Ğ¸Ñ‚ÑŒ',
  'action.clear': 'Ğ¡Ğ±Ñ€Ğ¾ÑĞ¸Ñ‚ÑŒ',
  'action.clearFilters': 'Ğ¡Ğ±Ñ€Ğ¾ÑĞ¸Ñ‚ÑŒ Ñ„Ğ¸Ğ»ÑŒÑ‚Ñ€Ñ‹',
  'action.search': 'ĞĞ°Ğ¹Ñ‚Ğ¸',
  'action.save': 'Ğ¡Ğ¾Ñ…Ñ€Ğ°Ğ½Ğ¸Ñ‚ÑŒ Ğ¸Ğ·Ğ¼ĞµĞ½ĞµĞ½Ğ¸Ñ',
  'action.discard': 'ĞÑ‚Ğ¼ĞµĞ½Ğ¸Ñ‚ÑŒ',
  'action.signIn': 'Ğ’Ğ¾Ğ¹Ñ‚Ğ¸',
  'action.signOut': 'Ğ’Ñ‹Ğ¹Ñ‚Ğ¸',
  'action.signingIn': 'Ğ’Ñ…Ğ¾Ğ´â€¦',
  'action.joinFree': 'Ğ ĞµĞ³Ğ¸ÑÑ‚Ñ€Ğ°Ñ†Ğ¸Ñ Ğ±ĞµÑĞ¿Ğ»Ğ°Ñ‚Ğ½Ğ¾',
  'action.createAccount': 'Ğ¡Ğ¾Ğ·Ğ´Ğ°Ñ‚ÑŒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚',
  'action.creatingAccount': 'Ğ¡Ğ¾Ğ·Ğ´Ğ°Ğ½Ğ¸Ğµ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ğ°â€¦',
  'action.backToExplore': 'ĞĞ°Ğ·Ğ°Ğ´ Ğº ĞºĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³Ñƒ',
  'action.open': 'ĞÑ‚ĞºÑ€Ñ‹Ñ‚ÑŒ',
  'action.edit': 'Ğ˜Ğ·Ğ¼ĞµĞ½Ğ¸Ñ‚ÑŒ',
  'action.delete': 'Ğ£Ğ´Ğ°Ğ»Ğ¸Ñ‚ÑŒ',

  'common.loading': 'Ğ—Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ°â€¦',
  'common.loadingEllipsis': 'Ğ—Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ°â€¦',
  'common.notSet': 'ĞĞµ ÑƒĞºĞ°Ğ·Ğ°Ğ½Ğ¾',
  'common.optional': 'ĞĞµĞ¾Ğ±ÑĞ·Ğ°Ñ‚ĞµĞ»ÑŒĞ½Ğ¾',
  'common.required': 'Ğ¾Ğ±ÑĞ·Ğ°Ñ‚ĞµĞ»ÑŒĞ½Ğ¾',
  'common.newestFirst': 'Ğ¡Ğ½Ğ°Ñ‡Ğ°Ğ»Ğ° Ğ½Ğ¾Ğ²Ñ‹Ğµ',
  'common.anyCountry': 'Ğ›ÑĞ±Ğ°Ñ ÑÑ‚Ñ€Ğ°Ğ½Ğ°',
  'common.allCountries': 'Ğ’ÑĞµ ÑÑ‚Ñ€Ğ°Ğ½Ñ‹',
  'common.verified': 'ĞŸÑ€Ğ¾Ğ²ĞµÑ€ĞµĞ½',
  'common.tradeAbbrev':
    'RFQ â€” Ğ·Ğ°Ğ¿Ñ€Ğ¾Ñ Ñ†ĞµĞ½Ñ‹ Â· MOQ â€” Ğ¼Ğ¸Ğ½Ğ¸Ğ¼Ğ°Ğ»ÑŒĞ½Ñ‹Ğ¹ Ğ¾Ğ±ÑŠÑ‘Ğ¼ Ğ·Ğ°ĞºĞ°Ğ·Ğ° Â· FOB â€” Ñ„Ñ€Ğ°Ğ½ĞºĞ¾-Ğ±Ğ¾Ñ€Ñ‚ Â· TT â€” Ğ±Ğ°Ğ½ĞºĞ¾Ğ²ÑĞºĞ¸Ğ¹ Ğ¿ĞµÑ€ĞµĞ²Ğ¾Ğ´',

  'nav.feed': 'Ğ›ĞµĞ½Ñ‚Ğ°',
  'nav.explore': 'ĞšĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³',
  'nav.exploreStock': 'ĞšĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³ ÑĞºĞ»Ğ°Ğ´Ğ°',
  'nav.offersBuyer': 'ĞœĞ¾Ğ¸ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ',
  'nav.rfqs': 'ĞœĞ¾Ğ¸ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑÑ‹',
  'nav.orders': 'Ğ—Ğ°ĞºĞ°Ğ·Ñ‹',
  'nav.shipments': 'ĞÑ‚Ğ³Ñ€ÑƒĞ·ĞºĞ¸',
  'nav.messages': 'Ğ¡Ğ¾Ğ¾Ğ±Ñ‰ĞµĞ½Ğ¸Ñ',
  'nav.saved': 'Ğ¡Ğ¾Ñ…Ñ€Ğ°Ğ½Ñ‘Ğ½Ğ½Ğ¾Ğµ',
  'nav.savedLots': 'Ğ¡Ğ¾Ñ…Ñ€Ğ°Ğ½Ñ‘Ğ½Ğ½Ñ‹Ğµ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¸',
  'nav.notifications': 'Ğ£Ğ²ĞµĞ´Ğ¾Ğ¼Ğ»ĞµĞ½Ğ¸Ñ',
  'nav.help': 'Ğ¡Ğ¿Ñ€Ğ°Ğ²Ğ¾Ñ‡Ğ½Ñ‹Ğ¹ Ñ†ĞµĞ½Ñ‚Ñ€',
  'nav.helpCentre': 'Ğ¡Ğ¿Ñ€Ğ°Ğ²Ğ¾Ñ‡Ğ½Ñ‹Ğ¹ Ñ†ĞµĞ½Ñ‚Ñ€',
  'nav.howItWorks': 'ĞšĞ°Ğº ÑÑ‚Ğ¾ Ñ€Ğ°Ğ±Ğ¾Ñ‚Ğ°ĞµÑ‚',
  'nav.profile': 'ĞŸÑ€Ğ¾Ñ„Ğ¸Ğ»ÑŒ',
  'nav.listings': 'ĞœĞ¾Ğ¸ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸',
  'nav.post': 'Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚ÑŒ Ñ‚Ğ¾Ğ²Ğ°Ñ€',
  'nav.postStock': 'Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚ÑŒ Ñ‚Ğ¾Ğ²Ğ°Ñ€',
  'nav.offersSup': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ',
  'nav.rfqOpps': 'Ğ—Ğ°Ğ¿Ñ€Ğ¾ÑÑ‹ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ĞµĞ¹',
  'nav.verification': 'ĞŸÑ€Ğ¾Ğ²ĞµÑ€ĞºĞ°',
  'nav.suppliers': 'ĞŸĞ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¸',
  'nav.overview': 'ĞĞ±Ğ·Ğ¾Ñ€',
  'nav.adminSuppliers': 'ĞŸĞ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¸',
  'nav.adminVerify': 'ĞÑ‚Ğ´ĞµĞ» Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸',
  'nav.adminListings': 'ĞŸĞ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸',
  'nav.adminRfqs': 'Ğ—Ğ°Ğ¿Ñ€Ğ¾ÑÑ‹ Ñ†ĞµĞ½Ñ‹',
  'nav.adminPayments': 'ĞŸĞ»Ğ°Ñ‚ĞµĞ¶Ğ¸',
  'nav.sources': 'Ğ˜ÑÑ‚Ğ¾Ñ‡Ğ½Ğ¸ĞºĞ¸ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ğ¾Ğº',
  'nav.growth': 'Ğ‘Ğ°Ğ½Ğ½ĞµÑ€Ñ‹ Ğ¸ Ğ°ĞºÑ†Ğ¸Ğ¸',
  'nav.features': 'Ğ¤ÑƒĞ½ĞºÑ†Ğ¸Ğ¸',

  'topbar.searchPlaceholder': 'ĞŸĞ¾Ğ¸ÑĞº Ñ‚Ğ¾Ğ²Ğ°Ñ€Ğ¾Ğ², Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ², ĞºĞ°Ñ‚ĞµĞ³Ğ¾Ñ€Ğ¸Ğ¹â€¦',
  'topbar.searchAria': 'ĞŸĞ¾Ğ¸ÑĞº Ğ¿Ğ¾ Ğ¿Ğ»Ğ¾Ñ‰Ğ°Ğ´ĞºĞµ',
  'topbar.notifications': 'Ğ£Ğ²ĞµĞ´Ğ¾Ğ¼Ğ»ĞµĞ½Ğ¸Ñ',
  'topbar.createAccountTitle': 'Ğ¡Ğ¾Ğ·Ğ´Ğ°Ñ‚ÑŒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚',
  'topbar.account': 'ĞĞºĞºĞ°ÑƒĞ½Ñ‚',
  'topbar.languageAria': 'Ğ¯Ğ·Ñ‹Ğº Ğ¸Ğ½Ñ‚ĞµÑ€Ñ„ĞµĞ¹ÑĞ°',
  'rail.allIndustries': 'Ğ’ÑĞµ Ğ¾Ñ‚Ñ€Ğ°ÑĞ»Ğ¸',
  'rail.howItWorks': 'ĞšĞ°Ğº ÑÑ‚Ğ¾ Ñ€Ğ°Ğ±Ğ¾Ñ‚Ğ°ĞµÑ‚',
  'sidebar.moreIndustries': 'Ğ‘Ğ¾Ğ»ÑŒÑˆĞµ Ğ¾Ñ‚Ñ€Ğ°ÑĞ»ĞµĞ¹. Ğ‘Ğ¾Ğ»ÑŒÑˆĞµ ÑÑ‚Ñ€Ğ°Ğ½.',
  'sidebar.moreIndustriesSub': 'ĞĞ´Ğ½Ğ° Ğ¿Ğ»Ğ¾Ñ‰Ğ°Ğ´ĞºĞ° Ğ´Ğ»Ñ Ğ³Ğ¾Ñ‚Ğ¾Ğ²Ğ¾Ğ³Ğ¾ ÑĞºĞ»Ğ°Ğ´Ğ°.',

  'gate.title': 'Ğ”Ğ¾ÑÑ‚ÑƒĞ¿ Ğ´Ğ»Ñ ÑƒÑ‡Ğ°ÑÑ‚Ğ½Ğ¸ĞºĞ¾Ğ²',
  'gate.body':
    'Ğ¡Ğ²ÑĞ·ÑŒ Ñ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°Ğ¼Ğ¸, Ğ¿ÑƒĞ±Ğ»Ğ¸ĞºĞ°Ñ†Ğ¸Ñ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑĞ¾Ğ² Ğ¸ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ Ñ†ĞµĞ½Ñ‹ Ğ´Ğ¾ÑÑ‚ÑƒĞ¿Ğ½Ñ‹ ÑƒÑ‡Ğ°ÑÑ‚Ğ½Ğ¸ĞºĞ°Ğ¼. ĞŸÑ€Ğ¾ÑĞ¼Ğ¾Ñ‚Ñ€ Ğ¿Ğ»Ğ¾Ñ‰Ğ°Ğ´ĞºĞ¸ Ğ¾ÑÑ‚Ğ°Ñ‘Ñ‚ÑÑ Ğ±ĞµÑĞ¿Ğ»Ğ°Ñ‚Ğ½Ñ‹Ğ¼ Ğ¸ Ğ¾Ñ‚ĞºÑ€Ñ‹Ñ‚Ñ‹Ğ¼.',
  'gate.createAccount': 'Ğ¡Ğ¾Ğ·Ğ´Ğ°Ñ‚ÑŒ Ğ±ĞµÑĞ¿Ğ»Ğ°Ñ‚Ğ½Ñ‹Ğ¹ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚',
  'gate.haveAccount': 'Ğ£ Ğ¼ĞµĞ½Ñ ÑƒĞ¶Ğµ ĞµÑÑ‚ÑŒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚',

  'cards.noPhoto': 'Ğ½ĞµÑ‚ Ñ„Ğ¾Ñ‚Ğ¾',
  'cards.moq': 'MOQ',
  'cards.saveLot': 'Ğ¡Ğ¾Ñ…Ñ€Ğ°Ğ½Ğ¸Ñ‚ÑŒ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ',
  'cards.demo': 'Ğ”ĞµĞ¼Ğ¾',
  'cards.demoTitle': 'Ğ”ĞµĞ¼Ğ¾Ğ½ÑÑ‚Ñ€Ğ°Ñ†Ğ¸Ğ¾Ğ½Ğ½Ñ‹Ğµ Ğ´Ğ°Ğ½Ğ½Ñ‹Ğµ â€” Ğ½Ğµ Ğ½Ğ°ÑÑ‚Ğ¾ÑÑ‰ĞµĞµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ',
  'cards.inspections': 'Ğ¸Ğ½ÑĞ¿ĞµĞºÑ†Ğ¸Ğ¹',

  'auth.signIn.sub': 'Ğ”Ğ¾ÑÑ‚ÑƒĞ¿ Ğº Ğ·Ğ°ĞºĞ°Ğ·Ğ°Ğ¼, Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸ÑĞ¼ Ğ¸ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑĞ°Ğ¼ Ñ†ĞµĞ½Ñ‹.',
  'auth.email': 'Ğ­Ğ». Ğ¿Ğ¾Ñ‡Ñ‚Ğ°',
  'auth.password': 'ĞŸĞ°Ñ€Ğ¾Ğ»ÑŒ',
  'auth.signInCta': 'Ğ’Ğ¾Ğ¹Ñ‚Ğ¸',
  'auth.newHere': 'Ğ’Ğ¿ĞµÑ€Ğ²Ñ‹Ğµ Ğ·Ğ´ĞµÑÑŒ?',
  'auth.demoNotice': 'Ğ”ĞµĞ¼Ğ¾-ÑƒĞ²ĞµĞ´Ğ¾Ğ¼Ğ»ĞµĞ½Ğ¸Ğµ',
  'auth.seededLogin': 'Ğ¢ĞµÑÑ‚Ğ¾Ğ²Ñ‹Ğ¹ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚ Ğ´Ğ»Ñ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸',
  'auth.fillIn': 'Ğ—Ğ°Ğ¿Ğ¾Ğ»Ğ½Ğ¸Ñ‚ÑŒ',
  'auth.demoHintLead': 'â€” ÑÑ‚Ğ¾ Ñ‚ĞµÑÑ‚Ğ¾Ğ²Ñ‹Ğ¹',
  'auth.demoHintLead2': 'Ğ´ĞµĞ¼Ğ¾',
  'auth.demoHintTail':
    'Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚ Ğ´Ğ»Ñ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸ Ğ°Ğ´Ğ¼Ğ¸Ğ½-ĞºĞ¾Ğ½ÑĞ¾Ğ»Ğ¸. Ğ­Ñ‚Ğ¾ Ğ½Ğµ Ğ½Ğ°ÑÑ‚Ğ¾ÑÑ‰Ğ¸Ğ¹ Ğ¿Ñ€Ğ¾Ğ´Ğ°Ğ²ĞµÑ† â€” Ğ½Ğµ Ğ²Ğ²Ğ¾Ğ´Ğ¸Ñ‚Ğµ Ñ€ĞµĞ°Ğ»ÑŒĞ½Ñ‹Ğµ Ğ´Ğ°Ğ½Ğ½Ñ‹Ğµ.',
  'auth.demoHintProduct': 'Ğ°Ğ´Ğ¼Ğ¸Ğ½Ğ¸ÑÑ‚Ñ€Ğ°Ñ‚Ğ¾Ñ€Ğ°',
  'auth.signInFailed': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ²Ğ¾Ğ¹Ñ‚Ğ¸',
  'auth.signUp.title': 'Ğ¡Ğ¾Ğ·Ğ´Ğ°Ñ‚ÑŒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚',
  'auth.signUp.sub': 'ĞĞ´Ğ¸Ğ½ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚ Ğ´Ğ»Ñ Ğ·Ğ°ĞºÑƒĞ¿Ğ¾Ğº, Ğ¿Ñ€Ğ¾Ğ´Ğ°Ğ¶, Ğ¸Ğ½ÑĞ¿ĞµĞºÑ†Ğ¸Ğ¸ Ğ¸ Ğ»Ğ¾Ğ³Ğ¸ÑÑ‚Ğ¸ĞºĞ¸.',
  'auth.fullName': 'Ğ˜Ğ¼Ñ Ğ¸ Ñ„Ğ°Ğ¼Ğ¸Ğ»Ğ¸Ñ',
  'auth.workEmail': 'Ğ Ğ°Ğ±Ğ¾Ñ‡Ğ°Ñ Ğ¿Ğ¾Ñ‡Ñ‚Ğ°',
  'auth.minChars': 'ĞĞµ Ğ¼ĞµĞ½ĞµĞµ 8 ÑĞ¸Ğ¼Ğ²Ğ¾Ğ»Ğ¾Ğ²',
  'auth.atLeast8': 'ĞĞµ Ğ¼ĞµĞ½ĞµĞµ 8 ÑĞ¸Ğ¼Ğ²Ğ¾Ğ»Ğ¾Ğ².',
  'auth.iAmA': 'Ğ¯â€¦',
  'auth.company': 'ĞšĞ¾Ğ¼Ğ¿Ğ°Ğ½Ğ¸Ñ',
  'auth.country': 'Ğ¡Ñ‚Ñ€Ğ°Ğ½Ğ°',
  'auth.countryHint': 'Ğ¢ÑƒÑ€Ñ†Ğ¸Ñ, ĞšĞ¸Ñ‚Ğ°Ğ¹â€¦',
  'auth.createCta': 'Ğ¡Ğ¾Ğ·Ğ´Ğ°Ñ‚ÑŒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚',
  'auth.alreadyRegistered': 'Ğ£Ğ¶Ğµ Ğ·Ğ°Ñ€ĞµĞ³Ğ¸ÑÑ‚Ñ€Ğ¸Ñ€Ğ¾Ğ²Ğ°Ğ½Ñ‹?',
  'auth.signUpHint': 'Ğ Ğ°Ğ·Ğ¼ĞµÑ‰ĞµĞ½Ğ¸Ğµ Ğ±ĞµÑĞ¿Ğ»Ğ°Ñ‚Ğ½Ğ¾. Ğ—Ğ½Ğ°ĞºĞ¸ Ğ´Ğ¾Ğ²ĞµÑ€Ğ¸Ñ Ğ·Ğ°Ñ€Ğ°Ğ±Ğ°Ñ‚Ñ‹Ğ²Ğ°ÑÑ‚ÑÑ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¾Ğ¹, Ğ¸Ğ½ÑĞ¿ĞµĞºÑ†Ğ¸ÑĞ¼Ğ¸ Ğ¸ Ğ¸ÑÑ‚Ğ¾Ñ€Ğ¸ĞµĞ¹ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ğ¾Ğº.',
  'auth.registerFailed': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ñ€ĞµĞ³Ğ¸ÑÑ‚Ñ€Ğ¸Ñ€Ğ¾Ğ²Ğ°Ñ‚ÑŒÑÑ',
  'auth.role.buyer': 'ĞŸĞ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑŒ',
  'auth.role.buyerHint': 'Ğ¯ Ğ·Ğ°ĞºÑƒĞ¿Ğ°Ñ Ğ¿Ñ€Ğ¾Ğ´ÑƒĞºÑ†Ğ¸Ñ',
  'auth.role.supplier': 'ĞŸĞ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸Ğº',
  'auth.role.supplierHint': 'Ğ¯ Ğ¿Ñ€Ğ¾Ğ´Ğ°Ñ / Ğ¿Ñ€Ğ¾Ğ¸Ğ·Ğ²Ğ¾Ğ¶Ñƒ',
  'auth.role.inspector': 'Ğ˜Ğ½ÑĞ¿ĞµĞºÑ‚Ğ¾Ñ€',
  'auth.role.inspectorHint': 'Ğ¯ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ÑÑ Ğ·Ğ°Ğ²Ğ¾Ğ´Ñ‹',
  'auth.role.lab': 'Ğ›Ğ°Ğ±Ğ¾Ñ€Ğ°Ñ‚Ğ¾Ñ€Ğ¸Ñ',
  'auth.role.labHint': 'Ğ¯ Ğ¸ÑĞ¿Ñ‹Ñ‚Ñ‹Ğ²Ğ°Ñ Ğ¼Ğ°Ñ‚ĞµÑ€Ğ¸Ğ°Ğ»Ñ‹',
  'auth.role.logistics': 'Ğ›Ğ¾Ğ³Ğ¸ÑÑ‚Ğ¸ĞºĞ°',
  'auth.role.logisticsHint': 'Ğ¯ Ğ¿ĞµÑ€ĞµĞ²Ğ¾Ğ¶Ñƒ Ğ³Ñ€ÑƒĞ·Ñ‹',

  'profile.title': 'ĞŸÑ€Ğ¾Ñ„Ğ¸Ğ»ÑŒ',
  'profile.sub': 'Ğ”Ğ°Ğ½Ğ½Ñ‹Ğµ, ĞºĞ¾Ñ‚Ğ¾Ñ€Ñ‹Ğµ Ğ²Ğ¸Ğ´ÑÑ‚ Ğ´Ñ€ÑƒĞ³Ğ¸Ğµ ÑÑ‚Ğ¾Ñ€Ğ¾Ğ½Ñ‹ Ğ² Ğ²Ğ°ÑˆĞ¸Ñ… Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸ÑÑ…, Ğ·Ğ°ĞºĞ°Ğ·Ğ°Ñ… Ğ¸ ÑĞ¾Ğ¾Ğ±Ñ‰ĞµĞ½Ğ¸ÑÑ….',
  'profile.signInSub': 'Ğ’Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ ÑƒĞ¿Ñ€Ğ°Ğ²Ğ»ÑÑ‚ÑŒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ğ¾Ğ¼',
  'profile.notSignedIn': 'Ğ’Ñ‹ Ğ½Ğµ Ğ²Ğ¾ÑˆĞ»Ğ¸',
  'profile.notSignedInBody': 'ĞŸÑ€Ğ¾Ñ„Ğ¸Ğ»ÑŒ Ğ²Ğ¸Ğ´ĞµĞ½ Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ğ²Ğ°ÑˆĞµĞ¼Ñƒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ñƒ: Ğ²Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ Ğ¿Ğ¾ÑĞ¼Ğ¾Ñ‚Ñ€ĞµÑ‚ÑŒ Ğ¸ Ğ¸Ğ·Ğ¼ĞµĞ½Ğ¸Ñ‚ÑŒ ĞµĞ³Ğ¾.',
  'profile.createAccount': 'Ğ¡Ğ¾Ğ·Ğ´Ğ°Ñ‚ÑŒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚',
  'profile.accountDetails': 'Ğ”Ğ°Ğ½Ğ½Ñ‹Ğµ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ğ°',
  'profile.unsaved': 'ĞĞµÑĞ¾Ñ…Ñ€Ğ°Ğ½Ñ‘Ğ½Ğ½Ñ‹Ğµ Ğ¸Ğ·Ğ¼ĞµĞ½ĞµĞ½Ğ¸Ñ',
  'profile.fullName': 'Ğ˜Ğ¼Ñ Ğ¸ Ñ„Ğ°Ğ¼Ğ¸Ğ»Ğ¸Ñ',
  'profile.company': 'ĞšĞ¾Ğ¼Ğ¿Ğ°Ğ½Ğ¸Ñ',
  'profile.notSet': 'ĞĞµ ÑƒĞºĞ°Ğ·Ğ°Ğ½Ğ¾',
  'profile.country': 'Ğ¡Ñ‚Ñ€Ğ°Ğ½Ğ°',
  'profile.language': 'Ğ¯Ğ·Ñ‹Ğº Ğ¸Ğ½Ñ‚ĞµÑ€Ñ„ĞµĞ¹ÑĞ°',
  'profile.languageHint':
    'Ğ¡Ñ€Ğ°Ğ·Ñƒ Ğ¼ĞµĞ½ÑĞµÑ‚ ÑĞ·Ñ‹Ğº Ğ¸Ğ½Ñ‚ĞµÑ€Ñ„ĞµĞ¹ÑĞ° Ğ¸ ÑĞ¾Ñ…Ñ€Ğ°Ğ½ÑĞµÑ‚ÑÑ Ğ² Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ğµ Ğ¿Ñ€Ğ¸ Ğ½Ğ°Ğ¶Ğ°Ñ‚Ğ¸Ğ¸ Â«Ğ¡Ğ¾Ñ…Ñ€Ğ°Ğ½Ğ¸Ñ‚ÑŒ Ğ¸Ğ·Ğ¼ĞµĞ½ĞµĞ½Ğ¸ÑÂ».',
  'profile.save': 'Ğ¡Ğ¾Ñ…Ñ€Ğ°Ğ½Ğ¸Ñ‚ÑŒ Ğ¸Ğ·Ğ¼ĞµĞ½ĞµĞ½Ğ¸Ñ',
  'profile.saving': 'Ğ¡Ğ¾Ñ…Ñ€Ğ°Ğ½ĞµĞ½Ğ¸Ğµâ€¦',
  'profile.saved': 'Ğ¡Ğ¾Ñ…Ñ€Ğ°Ğ½ĞµĞ½Ğ¾',
  'profile.savedBody': 'ĞŸÑ€Ğ¾Ñ„Ğ¸Ğ»ÑŒ Ğ¾Ğ±Ğ½Ğ¾Ğ²Ğ»Ñ‘Ğ½.',
  'profile.identity': 'Ğ˜Ğ´ĞµĞ½Ñ‚Ğ¸Ñ„Ğ¸ĞºĞ°Ñ†Ğ¸Ñ',
  'profile.identityNote':
    'ĞŸĞ¾Ñ‡Ñ‚Ñƒ Ğ¸ Ñ€Ğ¾Ğ»ÑŒ Ğ·Ğ´ĞµÑÑŒ Ğ¸Ğ·Ğ¼ĞµĞ½Ğ¸Ñ‚ÑŒ Ğ½ĞµĞ»ÑŒĞ·Ñ. ĞĞ½Ğ¸ Ñ„Ğ¸ĞºÑĞ¸Ñ€ÑƒÑÑ‚ÑÑ Ğ¿Ñ€Ğ¸ ÑĞ¾Ğ·Ğ´Ğ°Ğ½Ğ¸Ğ¸ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ğ°, Ğ¸ API Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»Ñ Ğ¸Ñ… Ğ½Ğµ Ğ¿Ñ€Ğ¸Ğ½Ğ¸Ğ¼Ğ°ĞµÑ‚.',
  'profile.email': 'Ğ­Ğ». Ğ¿Ğ¾Ñ‡Ñ‚Ğ°',
  'profile.role': 'Ğ Ğ¾Ğ»ÑŒ',
  'profile.readOnly': 'Ğ¢Ğ¾Ğ»ÑŒĞºĞ¾ Ñ‡Ñ‚ĞµĞ½Ğ¸Ğµ',
  'profile.readOnlyEmail': 'Ğ¢Ğ¾Ğ»ÑŒĞºĞ¾ Ñ‡Ñ‚ĞµĞ½Ğ¸Ğµ â€” API Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»Ñ Ğ½Ğµ Ğ¿Ñ€Ğ¸Ğ½Ğ¸Ğ¼Ğ°ĞµÑ‚ Ğ¿Ğ¾Ñ‡Ñ‚Ñƒ',
  'profile.readOnlyRole': 'Ğ¢Ğ¾Ğ»ÑŒĞºĞ¾ Ñ‡Ñ‚ĞµĞ½Ğ¸Ğµ â€” API Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»Ñ Ğ½Ğµ Ğ¿Ñ€Ğ¸Ğ½Ğ¸Ğ¼Ğ°ĞµÑ‚ Ñ€Ğ¾Ğ»ÑŒ',
  'profile.emailStatus': 'Ğ¡Ñ‚Ğ°Ñ‚ÑƒÑ Ğ¿Ğ¾Ñ‡Ñ‚Ñ‹',
  'profile.emailVerified': 'ĞŸĞ¾Ñ‡Ñ‚Ğ° Ğ¿Ğ¾Ğ´Ñ‚Ğ²ĞµÑ€Ğ¶Ğ´ĞµĞ½Ğ°',
  'profile.emailNotVerified': 'ĞŸĞ¾Ñ‡Ñ‚Ğ° Ğ½Ğµ Ğ¿Ğ¾Ğ´Ñ‚Ğ²ĞµÑ€Ğ¶Ğ´ĞµĞ½Ğ°',
  'profile.memberSince': 'Ğ£Ñ‡Ğ°ÑÑ‚Ğ½Ğ¸Ğº Ñ',
  'profile.accountLine': 'ĞĞºĞºĞ°ÑƒĞ½Ñ‚ #{id} Â· Ğ²Ñ…Ğ¾Ğ´ ĞºĞ°Ğº {role}',
  'profile.errName': 'Ğ£ĞºĞ°Ğ¶Ğ¸Ñ‚Ğµ Ğ¸Ğ¼Ñ â€” API Ğ¾Ñ‚ĞºĞ»Ğ¾Ğ½ÑĞµÑ‚ Ğ¿ÑƒÑÑ‚Ğ¾Ğµ Ğ¸Ğ¼Ñ.',
  'profile.errSave': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ ÑĞ¾Ñ…Ñ€Ğ°Ğ½Ğ¸Ñ‚ÑŒ Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»ÑŒ â€” Ğ¿Ğ¾Ğ²Ñ‚Ğ¾Ñ€Ğ¸Ñ‚Ğµ Ğ¿Ğ¾Ğ¿Ñ‹Ñ‚ĞºÑƒ.',

  'explore.title': 'ĞšĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³ ÑĞºĞ»Ğ°Ğ´Ğ°',
  'explore.subLoading': 'Ğ—Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ° Ğ´Ğ¾ÑÑ‚ÑƒĞ¿Ğ½Ñ‹Ñ… Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¹â€¦',
  'explore.subCount': '{n} Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¹ Ğ¿Ğ¾ Ğ²Ğ°ÑˆĞ¸Ğ¼ Ñ„Ğ¸Ğ»ÑŒÑ‚Ñ€Ğ°Ğ¼',
  'explore.searchPlaceholder': 'ĞœĞµĞ´Ğ½Ñ‹Ğ¹ ĞºĞ°Ñ‚Ğ¾Ğ´, Ğ½Ğ°ÑĞ¾ÑÑ‹â€¦',
  'explore.searchAria': 'ĞŸĞ¾Ğ¸ÑĞº Ğ¿Ğ¾ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸ÑĞ¼',
  'explore.categoryAria': 'ĞšĞ°Ñ‚ĞµĞ³Ğ¾Ñ€Ğ¸Ñ',
  'explore.allCategories': 'Ğ’ÑĞµ ĞºĞ°Ñ‚ĞµĞ³Ğ¾Ñ€Ğ¸Ğ¸',
  'explore.originAria': 'Ğ¡Ñ‚Ñ€Ğ°Ğ½Ğ° Ğ¿Ñ€Ğ¾Ğ¸ÑÑ…Ğ¾Ğ¶Ğ´ĞµĞ½Ğ¸Ñ',
  'explore.allCountries': 'Ğ’ÑĞµ ÑÑ‚Ñ€Ğ°Ğ½Ñ‹',
  'explore.min': 'ĞœĞ¸Ğ½. $',
  'explore.max': 'ĞœĞ°ĞºÑ. $',
  'explore.emptyTitle': 'ĞŸĞ¾ ÑÑ‚Ğ¸Ğ¼ Ñ„Ğ¸Ğ»ÑŒÑ‚Ñ€Ğ°Ğ¼ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¹ Ğ½ĞµÑ‚',
  'explore.emptyBody': 'ĞŸĞ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ Ğ±Ğ¾Ğ»ĞµĞµ ÑˆĞ¸Ñ€Ğ¾ĞºÑƒÑ ĞºĞ°Ñ‚ĞµĞ³Ğ¾Ñ€Ğ¸Ñ, Ğ´Ñ€ÑƒĞ³ÑƒÑ ÑÑ‚Ñ€Ğ°Ğ½Ñƒ Ğ¿Ñ€Ğ¾Ğ¸ÑÑ…Ğ¾Ğ¶Ğ´ĞµĞ½Ğ¸Ñ Ğ¸Ğ»Ğ¸ ÑĞ±Ñ€Ğ¾ÑÑŒÑ‚Ğµ Ñ„Ğ¸Ğ»ÑŒÑ‚Ñ€Ñ‹.',
  'explore.page': 'Ğ¡Ñ‚Ñ€Ğ°Ğ½Ğ¸Ñ†Ğ° {page} Ğ¸Ğ· {pages}',
  'explore.prev': 'â† ĞĞ°Ğ·Ğ°Ğ´',
  'explore.next': 'Ğ’Ğ¿ĞµÑ€Ñ‘Ğ´ â†’',

  'feed.welcomeBack': 'Ğ¡ Ğ²Ğ¾Ğ·Ğ²Ñ€Ğ°Ñ‰ĞµĞ½Ğ¸ĞµĞ¼, {name}',
  'feed.title': 'Ğ›ĞµĞ½Ñ‚Ğ° Ğ¿Ğ»Ğ¾Ñ‰Ğ°Ğ´ĞºĞ¸',
  'feed.sub': 'Ğ“Ğ¾Ñ‚Ğ¾Ğ²Ñ‹Ğ¹ ÑĞºĞ»Ğ°Ğ´, Ğ¸Ğ·Ğ»Ğ¸ÑˆĞºĞ¸ Ğ¸ ÑĞ²ĞµÑ€Ñ…Ğ½Ğ¾Ñ€Ğ¼Ğ°Ñ‚Ğ¸Ğ²Ğ½Ñ‹Ğµ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¸ Ğ¾Ñ‚ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞµĞ½Ğ½Ñ‹Ñ… Ğ·Ğ°Ğ²Ğ¾Ğ´Ğ¾Ğ² â€” ÑĞ½Ğ°Ñ‡Ğ°Ğ»Ğ° Ğ½Ğ¾Ğ²Ñ‹Ğµ.',
  'feed.sellStock': 'ĞŸÑ€Ğ¾Ğ´Ğ°Ñ‚ÑŒ Ñ‚Ğ¾Ğ²Ğ°Ñ€',
  'feed.postRequest': 'Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚ÑŒ Ğ·Ğ°Ğ¿Ñ€Ğ¾Ñ',
  'feed.lotsCount': '{n} Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¹',
  'feed.lotsMatch': 'Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¹ Ğ¿Ğ¾ Ğ²Ğ°ÑˆĞ¸Ğ¼ Ñ„Ğ¸Ğ»ÑŒÑ‚Ñ€Ğ°Ğ¼',
  'feed.verifiedSuppliers': 'Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞµĞ½Ğ½Ñ‹Ñ… Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ²',
  'feed.openRequests': 'Ğ¾Ñ‚ĞºÑ€Ñ‹Ñ‚Ñ‹Ñ… Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑĞ¾Ğ²',
  'feed.allOrigins': 'Ğ’ÑĞµ ÑÑ‚Ñ€Ğ°Ğ½Ñ‹ Ğ¿Ñ€Ğ¾Ğ¸ÑÑ…Ğ¾Ğ¶Ğ´ĞµĞ½Ğ¸Ñ',
  'feed.searchAria': 'ĞŸĞ¾Ğ¸ÑĞº Ğ¿Ğ¾ Ğ¿Ğ°Ñ€Ñ‚Ğ¸ÑĞ¼',
  'feed.minAria': 'ĞœĞ¸Ğ½Ğ¸Ğ¼Ğ°Ğ»ÑŒĞ½Ğ°Ñ Ñ†ĞµĞ½Ğ°',
  'feed.maxAria': 'ĞœĞ°ĞºÑĞ¸Ğ¼Ğ°Ğ»ÑŒĞ½Ğ°Ñ Ñ†ĞµĞ½Ğ°',
  'feed.allIndustries': 'Ğ’ÑĞµ Ğ¾Ñ‚Ñ€Ğ°ÑĞ»Ğ¸',
  'feed.noLots': 'ĞŸĞ°Ñ€Ñ‚Ğ¸Ğ¹ Ğ½ĞµÑ‚',
  'feed.shownRange': '{first}â€“{last} Ğ¸Ğ· {total}',
  'feed.emptyTitle': 'ĞŸĞ¾ ÑÑ‚Ğ¸Ğ¼ Ñ„Ğ¸Ğ»ÑŒÑ‚Ñ€Ğ°Ğ¼ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¹ Ğ½ĞµÑ‚',
  'feed.emptyBody': 'ĞŸĞ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ Ğ´Ñ€ÑƒĞ³ÑƒÑ Ğ¾Ñ‚Ñ€Ğ°ÑĞ»ÑŒ, Ğ´Ñ€ÑƒĞ³ÑƒÑ ÑÑ‚Ñ€Ğ°Ğ½Ñƒ Ğ¿Ñ€Ğ¾Ğ¸ÑÑ…Ğ¾Ğ¶Ğ´ĞµĞ½Ğ¸Ñ Ğ¸Ğ»Ğ¸ ÑĞ±Ñ€Ğ¾ÑÑŒÑ‚Ğµ Ñ„Ğ¸Ğ»ÑŒÑ‚Ñ€Ñ‹.',
  'feed.lookingFor': 'Ğ˜Ñ‰ĞµÑ‚Ğµ Ñ‡Ñ‚Ğ¾-Ñ‚Ğ¾ ĞºĞ¾Ğ½ĞºÑ€ĞµÑ‚Ğ½Ğ¾Ğµ?',
  'feed.postRequestLink': 'Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚Ğµ Ğ·Ğ°Ğ¿Ñ€Ğ¾Ñ',
  'feed.lookingForTail': 'Ğ¸ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞµĞ½Ğ½Ñ‹Ğµ Ğ·Ğ°Ğ²Ğ¾Ğ´Ñ‹ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶Ğ°Ñ‚ Ğ²Ğ°Ğ¼ Ñ†ĞµĞ½Ñƒ.',
  'feed.sellingInstead': 'Ğ¥Ğ¾Ñ‚Ğ¸Ñ‚Ğµ Ğ¿Ñ€Ğ¾Ğ´Ğ°Ğ²Ğ°Ñ‚ÑŒ?',
  'feed.listYourStock': 'Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚Ğµ ÑĞ²Ğ¾Ğ¹ Ñ‚Ğ¾Ğ²Ğ°Ñ€',
  'feed.signedInAs': 'Ğ²Ñ…Ğ¾Ğ´ ĞºĞ°Ğº {role}',
  'feed.createFree': 'ÑĞ¾Ğ·Ğ´Ğ°Ğ¹Ñ‚Ğµ Ğ±ĞµÑĞ¿Ğ»Ğ°Ñ‚Ğ½Ñ‹Ğ¹ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚',

  'help.title': 'ĞšĞ°Ğº Ñ€Ğ°Ğ±Ğ¾Ñ‚Ğ°ĞµÑ‚ FactoryDepo',
  'help.sub': 'Ğ“Ğ¾Ñ‚Ğ¾Ğ²Ñ‹Ğ¹ ÑĞºĞ»Ğ°Ğ´, Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑÑ‹ Ñ†ĞµĞ½Ñ‹ Ğ¸ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²ĞºĞ¸ Ñ Ğ¸Ğ½ÑĞ¿ĞµĞºÑ†Ğ¸ĞµĞ¹.',
  'help.buying': 'ĞŸĞ¾ĞºÑƒĞ¿ĞºĞ°',
  'help.buying1.title': '1. Ğ¡Ğ¼Ğ¾Ñ‚Ñ€Ğ¸Ñ‚Ğµ Ğ³Ğ¾Ñ‚Ğ¾Ğ²Ñ‹Ğ¹ ÑĞºĞ»Ğ°Ğ´.',
  'help.buying1':
    'ĞšĞ°Ğ¶Ğ´Ğ°Ñ Ğ´Ğ¾ÑÑ‚ÑƒĞ¿Ğ½Ğ°Ñ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ Ğ¿Ğ¾ĞºĞ°Ğ·Ñ‹Ğ²Ğ°ĞµÑ‚ Ñ†ĞµĞ½Ñƒ, Ğ¼Ğ¸Ğ½Ğ¸Ğ¼Ğ°Ğ»ÑŒĞ½Ñ‹Ğ¹ Ğ¾Ğ±ÑŠÑ‘Ğ¼ Ğ·Ğ°ĞºĞ°Ğ·Ğ°, ÑÑ‚Ñ€Ğ°Ğ½Ñƒ Ğ¿Ñ€Ğ¾Ğ¸ÑÑ…Ğ¾Ğ¶Ğ´ĞµĞ½Ğ¸Ñ Ğ¸ Ñ€ĞµĞ°Ğ»ÑŒĞ½Ğ¾Ğµ Ğ½Ğ°Ğ»Ğ¸Ñ‡Ğ¸Ğµ. ĞŸĞ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸ Ñ Ğ¼ĞµÑ‚ĞºĞ¾Ğ¹ Â«Ğ”ĞµĞ¼Ğ¾Â» â€” Ğ´ĞµĞ¼Ğ¾Ğ½ÑÑ‚Ñ€Ğ°Ñ†Ğ¸Ğ¾Ğ½Ğ½Ñ‹Ğµ Ğ´Ğ°Ğ½Ğ½Ñ‹Ğµ, Ğ° Ğ½Ğµ Ğ½Ğ°ÑÑ‚Ğ¾ÑÑ‰Ğ¸Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ, Ğ¸ Ğ¿Ğ¾Ğ¼ĞµÑ‡ĞµĞ½Ñ‹, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ Ğ²Ñ‹ Ğ½Ğµ Ğ±Ñ‹Ğ»Ğ¸ Ğ²Ğ²ĞµĞ´ĞµĞ½Ñ‹ Ğ² Ğ·Ğ°Ğ±Ğ»ÑƒĞ¶Ğ´ĞµĞ½Ğ¸Ğµ.',
  'help.buying2.title': '2. Ğ—Ğ°Ğ¿Ñ€Ğ¾ÑĞ¸Ñ‚Ğµ Ñ†ĞµĞ½Ñƒ.',
  'help.buying2':
    'Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚Ğµ Ğ·Ğ°Ğ¿Ñ€Ğ¾Ñ Ñ Ğ¾Ğ¿Ğ¸ÑĞ°Ğ½Ğ¸ĞµĞ¼ Ğ¿Ğ¾Ñ‚Ñ€ĞµĞ±Ğ½Ğ¾ÑÑ‚Ğ¸. ĞŸĞ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¸ Ğ¾Ñ‚Ğ²ĞµÑ‡Ğ°ÑÑ‚ Ñ†ĞµĞ½Ğ¾Ğ¹, ÑÑ€Ğ¾ĞºĞ¾Ğ¼ Ğ¸ ÑĞ²Ğ¾Ğ¸Ğ¼Ğ¸ ÑƒÑĞ»Ğ¾Ğ²Ğ¸ÑĞ¼Ğ¸.',
  'help.buying3.title': '3. Ğ¡Ñ€Ğ°Ğ²Ğ½Ğ¸Ñ‚Ğµ Ğ¸ Ñ€ĞµÑˆĞ¸Ñ‚Ğµ.',
  'help.buying3': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ²Ğ¸Ğ´Ğ½Ñ‹ Ñ€ÑĞ´Ğ¾Ğ¼ Ğ² Ğ¾Ğ´Ğ½Ğ¾Ğ¼ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑĞµ. ĞŸÑ€Ğ¸Ğ½ÑÑ‚Ğ¸Ğµ Ğ¾Ğ´Ğ½Ğ¾Ğ³Ğ¾ ÑĞ¾Ğ·Ğ´Ğ°Ñ‘Ñ‚ Ğ·Ğ°ĞºĞ°Ğ·.',
  'help.buying4.title': '4. ĞĞ¿Ğ»Ğ°Ñ‚Ğ° Ğ±Ğ°Ğ½ĞºĞ¾Ğ²ÑĞºĞ¸Ğ¼ Ğ¿ĞµÑ€ĞµĞ²Ğ¾Ğ´Ğ¾Ğ¼.',
  'help.buying4':
    'ĞŸÑ€Ğ¾Ğ¼Ñ‹ÑˆĞ»ĞµĞ½Ğ½Ğ°Ñ Ñ‚Ğ¾Ñ€Ğ³Ğ¾Ğ²Ğ»Ñ Ğ½Ğµ Ñ€Ğ°Ğ±Ğ¾Ñ‚Ğ°ĞµÑ‚ Ğ¿Ğ¾ ĞºĞ°Ñ€Ñ‚Ğ°Ğ¼. Ğ’Ñ‹ Ğ¿Ğ¾Ğ»ÑƒÑ‡Ğ°ĞµÑ‚Ğµ ÑÑ‡Ñ‘Ñ‚-Ğ¿Ñ€Ğ¾Ñ„Ğ¾Ñ€Ğ¼Ñƒ, Ğ¾Ğ¿Ğ»Ğ°Ñ‡Ğ¸Ğ²Ğ°ĞµÑ‚Ğµ Ğ¿ĞµÑ€ĞµĞ²Ğ¾Ğ´Ğ¾Ğ¼ TT Ğ¸ Ğ·Ğ°ĞºĞ°Ğ· Ğ¿Ğ¾Ğ¼ĞµÑ‡Ğ°ĞµÑ‚ÑÑ Ğ¾Ğ¿Ğ»Ğ°Ñ‡ĞµĞ½Ğ½Ñ‹Ğ¼ Ğ¿Ğ¾ÑĞ»Ğµ Ğ¿Ğ¾Ğ´Ñ‚Ğ²ĞµÑ€Ğ¶Ğ´ĞµĞ½Ğ¸Ñ ÑÑ€ĞµĞ´ÑÑ‚Ğ².',
  'help.selling': 'ĞŸÑ€Ğ¾Ğ´Ğ°Ğ¶Ğ°',
  'help.selling1.title': '1. Ğ¡Ğ¾Ğ·Ğ´Ğ°Ğ¹Ñ‚Ğµ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°.',
  'help.selling1': 'Ğ ĞµĞ³Ğ¸ÑÑ‚Ñ€Ğ°Ñ†Ğ¸Ñ ĞºĞ°Ğº Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸Ğº ÑÑ€Ğ°Ğ·Ñƒ ÑĞ¾Ğ·Ğ´Ğ°Ñ‘Ñ‚ Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»ÑŒ ĞºĞ¾Ğ¼Ğ¿Ğ°Ğ½Ğ¸Ğ¸.',
  'help.selling2.title': '2. Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚Ğµ Ñ‚Ğ¾Ğ²Ğ°Ñ€.',
  'help.selling2':
    'Ğ˜Ğ½ÑÑ‚Ñ€ÑƒĞ¼ĞµĞ½Ñ‚Ñ‹ Ñ€Ğ°Ğ·Ğ¼ĞµÑ‰ĞµĞ½Ğ¸Ñ ÑĞµĞ¹Ñ‡Ğ°Ñ Ñ€Ğ°Ğ·Ñ€Ğ°Ğ±Ğ°Ñ‚Ñ‹Ğ²Ğ°ÑÑ‚ÑÑ â€” Ğ´Ğ¾ Ğ¸Ñ… Ğ·Ğ°Ğ¿ÑƒÑĞºĞ° Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ² Ğ´Ğ¾Ğ±Ğ°Ğ²Ğ»ÑĞµÑ‚ Ğ½Ğ°ÑˆĞ° ĞºĞ¾Ğ¼Ğ°Ğ½Ğ´Ğ° Ğ¿Ñ€Ğ¸ Ğ¿Ğ¾Ğ´ĞºĞ»ÑÑ‡ĞµĞ½Ğ¸Ğ¸.',
  'help.selling3.title': '3. ĞÑ‚Ğ²ĞµÑ‡Ğ°Ğ¹Ñ‚Ğµ Ğ½Ğ° Ğ²Ñ…Ğ¾Ğ´ÑÑ‰Ğ¸Ğµ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑÑ‹.',
  'help.selling3':
    'ĞÑ‚ĞºÑ€Ñ‹Ñ‚Ñ‹Ğµ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑÑ‹ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ĞµĞ¹ Ğ²Ğ¸Ğ´Ğ½Ñ‹ Ğ² Ğ²Ğ°ÑˆĞµĞ¹ Ğ¿Ğ°Ğ½ĞµĞ»Ğ¸ Ñ Ğ°ĞºÑ‚ÑƒĞ°Ğ»ÑŒĞ½Ñ‹Ğ¼ Ñ‡Ğ¸ÑĞ»Ğ¾Ğ¼ Ğ½ĞµĞ¾Ñ‚Ğ²ĞµÑ‡ĞµĞ½Ğ½Ñ‹Ñ….',
  'help.selling4.title': '4. ĞŸÑ€Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºÑƒ.',
  'help.selling4':
    'Ğ£Ñ€Ğ¾Ğ²Ğ½Ğ¸ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸ Ğ¾Ñ‚ĞºÑ€Ñ‹Ğ²Ğ°ÑÑ‚ Ğ²Ğ¸Ğ´Ğ¸Ğ¼Ğ¾ÑÑ‚ÑŒ. Ğ—Ğ½Ğ°ĞºĞ¸ Ğ²Ñ‹Ğ´Ğ°ÑÑ‚ÑÑ Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ğ¿Ğ¾ÑĞ»Ğµ Ğ¾Ğ´Ğ¾Ğ±Ñ€ĞµĞ½Ğ¸Ñ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ğ¾Ğ², Ğ¿Ğ¾ÑÑ‚Ğ¾Ğ¼Ñƒ Ğ·Ğ½Ğ°Ğº Ğ½Ğ° ÑĞ°Ğ¹Ñ‚Ğµ Ñ‡Ñ‚Ğ¾-Ñ‚Ğ¾ Ğ·Ğ½Ğ°Ñ‡Ğ¸Ñ‚.',
  'help.notLive': 'Ğ§Ñ‚Ğ¾ ĞµÑ‰Ñ‘ Ğ½Ğµ Ñ€Ğ°Ğ±Ğ¾Ñ‚Ğ°ĞµÑ‚',
  'help.notLiveLead': 'ĞœÑ‹ Ğ¿Ñ€ĞµĞ´Ğ¿Ğ¾Ñ‡Ğ¸Ñ‚Ğ°ĞµĞ¼ ÑĞºĞ°Ğ·Ğ°Ñ‚ÑŒ ÑÑ‚Ğ¾ Ğ¿Ñ€ÑĞ¼Ğ¾, Ğ° Ğ½Ğµ Ğ¿Ğ¾Ğ·Ğ²Ğ¾Ğ»ÑÑ‚ÑŒ Ğ²Ğ°Ğ¼ ÑƒĞ·Ğ½Ğ°Ñ‚ÑŒ ÑĞ°Ğ¼Ğ¾Ğ¼Ñƒ:',
  'help.notLive1': 'Ğ¡Ğ°Ğ¼Ğ¾ÑÑ‚Ğ¾ÑÑ‚ĞµĞ»ÑŒĞ½Ğ¾Ğµ Ñ€Ğ°Ğ·Ğ¼ĞµÑ‰ĞµĞ½Ğ¸Ğµ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¹ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ¼ Ğ² Ñ€Ğ°Ğ·Ñ€Ğ°Ğ±Ğ¾Ñ‚ĞºĞµ.',
  'help.notLive2': 'ĞŸĞµÑ€ĞµĞ¿Ğ¸ÑĞºĞ° Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ñ Ñ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ¼ Ğ¿Ğ¾ĞºĞ° Ğ½ĞµĞ´Ğ¾ÑÑ‚ÑƒĞ¿Ğ½Ğ° â€” Ğ¸ÑĞ¿Ğ¾Ğ»ÑŒĞ·ÑƒĞ¹Ñ‚Ğµ ĞºĞ¾Ğ½Ñ‚Ğ°ĞºÑ‚Ñ‹ Ğ² Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»Ğµ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°.',
  'help.notLive3': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ¸ Ğ²ÑÑ‚Ñ€ĞµÑ‡Ğ½Ñ‹Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ ÑĞµĞ¹Ñ‡Ğ°Ñ Ğ¾Ğ±Ñ€Ğ°Ğ±Ğ°Ñ‚Ñ‹Ğ²Ğ°ÑÑ‚ÑÑ Ğ²Ñ€ÑƒÑ‡Ğ½ÑƒÑ.',
  'help.notLive4': 'ĞÑ‚ÑĞ»ĞµĞ¶Ğ¸Ğ²Ğ°Ğ½Ğ¸Ğµ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·Ğ¾Ğº Ğ¸ Ñ€Ğ°Ğ±Ğ¾Ñ‚Ğ° Ñ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ğ°Ğ¼Ğ¸ Ğ½Ğµ Ñ€ĞµĞ°Ğ»Ğ¸Ğ·Ğ¾Ğ²Ğ°Ğ½Ñ‹.',
  'help.exploreCta': 'ĞšĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³ ÑĞºĞ»Ğ°Ğ´Ğ°',
  'help.rfqCta': 'Ğ—Ğ°Ğ¿Ñ€Ğ¾ÑÑ‹ Ñ†ĞµĞ½Ñ‹',

  'soon.sub': 'Ğ•Ñ‰Ñ‘ Ğ½Ğµ Ñ€ĞµĞ°Ğ»Ğ¸Ğ·Ğ¾Ğ²Ğ°Ğ½Ğ¾',
  'soon.title': 'Ğ­Ñ‚Ğ¾Ñ‚ Ñ€Ğ°Ğ·Ğ´ĞµĞ» Ğ¿Ğ¾ÑĞ²Ğ¸Ñ‚ÑÑ Ğ½Ğ° ÑĞ»ĞµĞ´ÑƒÑÑ‰ĞµĞ¼ ÑÑ‚Ğ°Ğ¿Ğµ',
  'soon.body': 'Ğ Ğ°Ğ·Ğ´ĞµĞ» ĞµÑÑ‚ÑŒ Ğ² Ğ½Ğ°Ğ²Ğ¸Ğ³Ğ°Ñ†Ğ¸Ğ¸, Ğ½Ğ¾ ĞµĞ³Ğ¾ Ñ‚Ğ°Ğ±Ğ»Ğ¸Ñ†Ñ‹ Ğ´Ğ°Ğ½Ğ½Ñ‹Ñ… Ğ¸ ĞºĞ¾Ğ½ĞµÑ‡Ğ½Ñ‹Ğµ Ñ‚Ğ¾Ñ‡ĞºĞ¸ API ĞµÑ‰Ñ‘ Ğ½Ğµ Ñ€ĞµĞ°Ğ»Ğ¸Ğ·Ğ¾Ğ²Ğ°Ğ½Ñ‹.',
  'soon.note.offers': 'Ğ¢Ğ°Ğ±Ğ»Ğ¸Ñ†Ğ° Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğ¹ Ğ¸ Ğ²ÑÑ‚Ñ€ĞµÑ‡Ğ½Ñ‹Ñ… Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğ¹ Ğ¿Ğ¾ÑĞ²Ğ¸Ñ‚ÑÑ Ğ½Ğ° ÑĞ»ĞµĞ´ÑƒÑÑ‰ĞµĞ¼ ÑÑ‚Ğ°Ğ¿Ğµ.',
  'soon.note.shipments': 'Ğ­Ñ‚Ğ°Ğ¿Ñ‹ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·ĞºĞ¸ Ğ¸ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ñ‹ Ğ¿Ğ¾ÑĞ²ÑÑ‚ÑÑ Ğ½Ğ° ÑĞ»ĞµĞ´ÑƒÑÑ‰ĞµĞ¼ ÑÑ‚Ğ°Ğ¿Ğµ.',
  'soon.note.messages': 'ĞŸĞµÑ€ĞµĞ¿Ğ¸ÑĞºĞ° Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ñ â†” Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ° Ğ¿Ğ¾ÑĞ²Ğ¸Ñ‚ÑÑ Ğ½Ğ° ÑĞ»ĞµĞ´ÑƒÑÑ‰ĞµĞ¼ ÑÑ‚Ğ°Ğ¿Ğµ.',
  'soon.note.saved': 'Ğ¡Ğ¾Ñ…Ñ€Ğ°Ğ½Ñ‘Ğ½Ğ½Ñ‹Ğµ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¸ Ğ¿Ğ¾ÑĞ²ÑÑ‚ÑÑ Ğ½Ğ° ÑĞ»ĞµĞ´ÑƒÑÑ‰ĞµĞ¼ ÑÑ‚Ğ°Ğ¿Ğµ.',
  'soon.note.notifications': 'Ğ¦ĞµĞ½Ñ‚Ñ€ ÑƒĞ²ĞµĞ´Ğ¾Ğ¼Ğ»ĞµĞ½Ğ¸Ğ¹ Ğ¿Ğ¾ÑĞ²Ğ¸Ñ‚ÑÑ Ğ½Ğ° ÑĞ»ĞµĞ´ÑƒÑÑ‰ĞµĞ¼ ÑÑ‚Ğ°Ğ¿Ğµ.',
  'soon.note.profile': 'Ğ ĞµĞ´Ğ°ĞºÑ‚Ğ¸Ñ€Ğ¾Ğ²Ğ°Ğ½Ğ¸Ğµ Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»Ñ Ğ¿Ğ¾ÑĞ²Ğ¸Ñ‚ÑÑ Ğ½Ğ° ÑĞ»ĞµĞ´ÑƒÑÑ‰ĞµĞ¼ ÑÑ‚Ğ°Ğ¿Ğµ.',
  'soon.note.listings': 'Ğ£Ğ¿Ñ€Ğ°Ğ²Ğ»ĞµĞ½Ğ¸Ğµ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸ÑĞ¼Ğ¸ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ° Ñ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¾Ğ¹ Ğ²Ğ»Ğ°Ğ´ĞµĞ»ÑŒÑ†Ğ° Ğ¿Ğ¾ÑĞ²Ğ¸Ñ‚ÑÑ Ğ½Ğ° ÑĞ»ĞµĞ´ÑƒÑÑ‰ĞµĞ¼ ÑÑ‚Ğ°Ğ¿Ğµ.',
  'soon.note.post': 'Ğ¡Ğ¾Ğ·Ğ´Ğ°Ğ½Ğ¸Ğµ Ğ¸ Ñ€ĞµĞ´Ğ°ĞºÑ‚Ğ¸Ñ€Ğ¾Ğ²Ğ°Ğ½Ğ¸Ğµ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸ Ñ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ¾Ğ¹ Ğ¸Ğ·Ğ¾Ğ±Ñ€Ğ°Ğ¶ĞµĞ½Ğ¸Ğ¹ Ğ¿Ğ¾ÑĞ²Ğ¸Ñ‚ÑÑ Ğ½Ğ° ÑĞ»ĞµĞ´ÑƒÑÑ‰ĞµĞ¼ ÑÑ‚Ğ°Ğ¿Ğµ.',
  'soon.note.generic': 'ĞŸĞ¾ÑĞ²Ğ¸Ñ‚ÑÑ Ğ½Ğ° ÑĞ»ĞµĞ´ÑƒÑÑ‰ĞµĞ¼ ÑÑ‚Ğ°Ğ¿Ğµ.',
  'soon.note.verification': 'Ğ£Ñ€Ğ¾Ğ²Ğ½Ğ¸ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸ Ğ¸ Ğ¿Ğ¾Ğ´Ğ°Ñ‡Ğ° Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ğ¾Ğ² Ğ¿Ğ¾ÑĞ²ÑÑ‚ÑÑ Ğ½Ğ° ÑĞ»ĞµĞ´ÑƒÑÑ‰ĞµĞ¼ ÑÑ‚Ğ°Ğ¿Ğµ.',
  'soon.note.admin': 'ĞĞ´Ğ¼Ğ¸Ğ½-ĞºĞ¾Ğ½ÑĞ¾Ğ»ÑŒ Ğ¿Ğ¾ÑĞ²Ğ¸Ñ‚ÑÑ Ğ½Ğ° ÑĞ»ĞµĞ´ÑƒÑÑ‰ĞµĞ¼ ÑÑ‚Ğ°Ğ¿Ğµ.',
  'soon.note.sources': 'Ğ ÑƒÑ‡Ğ½Ğ¾Ğµ Ğ¿Ğ¾Ğ´ĞºĞ»ÑÑ‡ĞµĞ½Ğ¸Ğµ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ² Ğ¿Ğ¾ÑĞ²Ğ¸Ñ‚ÑÑ Ğ½Ğ° ÑĞ»ĞµĞ´ÑƒÑÑ‰ĞµĞ¼ ÑÑ‚Ğ°Ğ¿Ğµ.',
  'soon.note.features': 'Ğ¤Ğ»Ğ°Ğ³Ğ¸ Ñ„ÑƒĞ½ĞºÑ†Ğ¸Ğ¹ Ğ¿Ğ¾ÑĞ²ÑÑ‚ÑÑ Ğ½Ğ° ÑĞ»ĞµĞ´ÑƒÑÑ‰ĞµĞ¼ ÑÑ‚Ğ°Ğ¿Ğµ.',

  'orders.title': 'Ğ—Ğ°ĞºĞ°Ğ·Ñ‹',
  'orders.signInSub': 'Ğ’Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ ÑƒĞ²Ğ¸Ğ´ĞµÑ‚ÑŒ Ğ·Ğ°ĞºĞ°Ğ·Ñ‹, Ğ² ĞºĞ¾Ñ‚Ğ¾Ñ€Ñ‹Ñ… Ğ²Ñ‹ ÑƒÑ‡Ğ°ÑÑ‚Ğ²ÑƒĞµÑ‚Ğµ',
  'orders.notSignedIn': 'Ğ’Ñ‹ Ğ½Ğµ Ğ²Ğ¾ÑˆĞ»Ğ¸',
  'orders.notSignedInBody': 'Ğ—Ğ°ĞºĞ°Ğ·Ñ‹ Ğ¿Ñ€Ğ¸Ğ²Ğ°Ñ‚Ğ½Ñ‹: Ğ²Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ ÑƒĞ²Ğ¸Ğ´ĞµÑ‚ÑŒ, Ñ‡Ñ‚Ğ¾ Ğ²Ñ‹ Ğ¾Ğ±ÑĞ·Ğ°Ğ»Ğ¸ÑÑŒ ĞºÑƒĞ¿Ğ¸Ñ‚ÑŒ Ğ¸Ğ»Ğ¸ Ğ¿Ñ€Ğ¾Ğ´Ğ°Ñ‚ÑŒ.',
  'orders.createAccount': 'Ğ¡Ğ¾Ğ·Ğ´Ğ°Ñ‚ÑŒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚',
  'orders.subSupplier': 'Ğ—Ğ°ĞºĞ°Ğ·Ñ‹ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ĞµĞ¹ Ğ½Ğ° Ğ²Ğ°Ñˆ Ñ‚Ğ¾Ğ²Ğ°Ñ€',
  'orders.subBuyer': 'Ğ’ÑÑ‘, Ñ‡Ñ‚Ğ¾ Ğ²Ñ‹ Ğ¾Ğ±ÑĞ·Ğ°Ğ»Ğ¸ÑÑŒ ĞºÑƒĞ¿Ğ¸Ñ‚ÑŒ',
  'orders.statListings': 'ĞœĞ¾Ğ¸ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸',
  'orders.statOffersReceived': 'ĞŸĞ¾Ğ»ÑƒÑ‡ĞµĞ½Ğ½Ñ‹Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ',
  'orders.statOffersOnRfqs': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ¿Ğ¾ Ğ¼Ğ¾Ğ¸Ğ¼ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑĞ°Ğ¼',
  'orders.statOrders': 'Ğ—Ğ°ĞºĞ°Ğ·Ñ‹',
  'orders.statSoldItems': 'ĞŸÑ€Ğ¾Ğ´Ğ°Ğ½Ğ½Ñ‹Ğµ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸',
  'orders.statSoldTitle': 'ĞÑ‚Ğ³Ñ€ÑƒĞ¶ĞµĞ½Ğ½Ñ‹Ğµ Ğ¸Ğ»Ğ¸ Ğ´Ğ¾ÑÑ‚Ğ°Ğ²Ğ»ĞµĞ½Ğ½Ñ‹Ğµ Ğ·Ğ°ĞºĞ°Ğ·Ñ‹',
  'orders.statViews': 'ĞŸÑ€Ğ¾ÑĞ¼Ğ¾Ñ‚Ñ€Ñ‹',
  'orders.statViewsTitle': 'Ğ—Ğ°Ñ„Ğ¸ĞºÑĞ¸Ñ€Ğ¾Ğ²Ğ°Ğ½Ğ½Ñ‹Ğµ Ğ¿Ñ€Ğ¾ÑĞ¼Ğ¾Ñ‚Ñ€Ñ‹ Ğ¾Ğ±ÑŠÑĞ²Ğ»ĞµĞ½Ğ¸Ğ¹ Ğ² Ğ²Ğ°ÑˆĞµĞ¹ Ğ¾Ğ±Ğ»Ğ°ÑÑ‚Ğ¸',
  'orders.metricsError': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ Ğ¿Ğ¾ĞºĞ°Ğ·Ğ°Ñ‚ĞµĞ»Ğ¸.',
  'orders.loadErrorTitle': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ Ğ·Ğ°ĞºĞ°Ğ·Ñ‹',
  'orders.loadErrorBody': 'API Ğ½Ğµ Ğ²ĞµÑ€Ğ½ÑƒĞ» Ğ²Ğ°ÑˆĞ¸ Ğ·Ğ°ĞºĞ°Ğ·Ñ‹. ĞĞ±Ğ½Ğ¾Ğ²Ğ¸Ñ‚Ğµ ÑÑ‚Ñ€Ğ°Ğ½Ğ¸Ñ†Ñƒ Ğ¸Ğ»Ğ¸ Ğ²Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ ÑĞ½Ğ¾Ğ²Ğ°.',
  'orders.emptyTitle': 'Ğ—Ğ°ĞºĞ°Ğ·Ğ¾Ğ² Ğ¿Ğ¾ĞºĞ° Ğ½ĞµÑ‚',
  'orders.emptySupplier': 'ĞšĞ¾Ğ³Ğ´Ğ° Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑŒ Ğ·Ğ°ĞºĞ°Ğ·Ñ‹Ğ²Ğ°ĞµÑ‚ Ğ²Ğ°Ñˆ Ñ‚Ğ¾Ğ²Ğ°Ñ€, Ğ·Ğ°ĞºĞ°Ğ· Ğ¿Ğ¾ÑĞ²Ğ»ÑĞµÑ‚ÑÑ Ğ·Ğ´ĞµÑÑŒ.',
  'orders.emptyBuyer': 'Ğ—Ğ°ĞºĞ°Ğ·Ñ‹ Â«ĞºÑƒĞ¿Ğ¸Ñ‚ÑŒ ÑĞµĞ¹Ñ‡Ğ°ÑÂ» Ğ¿Ğ¾ Ğ³Ğ¾Ñ‚Ğ¾Ğ²Ğ¾Ğ¼Ñƒ ÑĞºĞ»Ğ°Ğ´Ñƒ Ğ¿Ğ¾ÑĞ²ÑÑ‚ÑÑ Ğ·Ğ´ĞµÑÑŒ.',
  'orders.browseStock': 'Ğ¡Ğ¼Ğ¾Ñ‚Ñ€ĞµÑ‚ÑŒ Ğ³Ğ¾Ñ‚Ğ¾Ğ²Ñ‹Ğ¹ ÑĞºĞ»Ğ°Ğ´',
  'orders.postRfq': 'Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚ÑŒ Ğ·Ğ°Ğ¿Ñ€Ğ¾Ñ Ñ†ĞµĞ½Ñ‹',
  'orders.count': '{n} Ğ·Ğ°ĞºĞ°Ğ·Ğ¾Ğ²',
  'orders.col.order': 'Ğ—Ğ°ĞºĞ°Ğ·',
  'orders.col.product': 'Ğ¢Ğ¾Ğ²Ğ°Ñ€',
  'orders.col.counterparty': 'ĞšĞ¾Ğ½Ñ‚Ñ€Ğ°Ğ³ĞµĞ½Ñ‚',
  'orders.col.qty': 'ĞšĞ¾Ğ»-Ğ²Ğ¾',
  'orders.col.total': 'Ğ˜Ñ‚Ğ¾Ğ³Ğ¾',
  'orders.col.status': 'Ğ¡Ñ‚Ğ°Ñ‚ÑƒÑ',
  'orders.col.date': 'Ğ”Ğ°Ñ‚Ğ°',
  'orders.buyerLabel': 'Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑŒ',
  'orders.supplierLabel': 'Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸Ğº',
  'orders.buyerId': 'ĞŸĞ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑŒ #{id}',

  'product.loadingTitle': 'Ğ—Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ°â€¦',
  'product.loadingThis': 'ÑÑ‚Ñƒ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ñ',
  'product.fetching': 'Ğ—Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ°: {what}â€¦',
  'product.notFound': 'Ğ¢Ğ¾Ğ²Ğ°Ñ€ Ğ½Ğµ Ğ½Ğ°Ğ¹Ğ´ĞµĞ½',
  'product.backToExplore': 'ĞĞ°Ğ·Ğ°Ğ´ Ğº ĞºĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³Ñƒ',
  'product.noPhoto': 'Ğ¤Ğ¾Ñ‚Ğ¾ Ğ´Ğ»Ñ ÑÑ‚Ğ¾Ğ¹ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¸ Ğ½Ğµ Ğ¿Ñ€ĞµĞ´Ğ¾ÑÑ‚Ğ°Ğ²Ğ»ĞµĞ½Ğ¾',
  'product.pricePer': 'Ğ¦ĞµĞ½Ğ° / {unit}',
  'product.minOrder': 'ĞœĞ¸Ğ½Ğ¸Ğ¼Ğ°Ğ»ÑŒĞ½Ñ‹Ğ¹ Ğ·Ğ°ĞºĞ°Ğ·',
  'product.availableNow': 'Ğ”Ğ¾ÑÑ‚ÑƒĞ¿Ğ½Ğ¾ ÑĞµĞ¹Ñ‡Ğ°Ñ',
  'product.origin': 'Ğ¡Ñ‚Ñ€Ğ°Ğ½Ğ° Ğ¿Ñ€Ğ¾Ğ¸ÑÑ…Ğ¾Ğ¶Ğ´ĞµĞ½Ğ¸Ñ',
  'product.unavailable': 'Ğ¡ĞµĞ¹Ñ‡Ğ°Ñ Ğ½ĞµĞ´Ğ¾ÑÑ‚ÑƒĞ¿Ğ½Ğ¾',
  'product.buyNowHeading': 'ĞšÑƒĞ¿Ğ¸Ñ‚ÑŒ ÑĞµĞ¹Ñ‡Ğ°Ñ â€” Ğ³Ğ¾Ñ‚Ğ¾Ğ²Ñ‹Ğ¹ ÑĞºĞ»Ğ°Ğ´',
  'product.soldOutBody': 'Ğ­Ñ‚Ğ° Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ Ğ¿Ğ¾Ğ¼ĞµÑ‡ĞµĞ½Ğ° ĞºĞ°Ğº Ñ€Ğ°ÑĞ¿Ñ€Ğ¾Ğ´Ğ°Ğ½Ğ½Ğ°Ñ. Ğ—Ğ°Ğ¿Ñ€Ğ¾ÑĞ¸Ñ‚Ğµ Ñƒ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ° ÑĞ»ĞµĞ´ÑƒÑÑ‰ÑƒÑ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ.',
  'product.noUnitsBody': 'Ğ¡ĞµĞ¹Ñ‡Ğ°Ñ ĞµĞ´Ğ¸Ğ½Ğ¸Ñ† Ğ½ĞµÑ‚ Ğ² Ğ½Ğ°Ğ»Ğ¸Ñ‡Ğ¸Ğ¸. Ğ—Ğ°Ğ¿Ñ€Ğ¾ÑĞ¸Ñ‚Ğµ Ñƒ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ° ÑĞ»ĞµĞ´ÑƒÑÑ‰ÑƒÑ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ.',
  'product.purchaseTerms': 'ĞŸĞ¾ĞºÑƒĞ¿ĞºĞ° Ğ¿Ğ¾ ÑƒĞºĞ°Ğ·Ğ°Ğ½Ğ½Ğ¾Ğ¹ Ñ†ĞµĞ½Ğµ {price} Ğ·Ğ° {unit}, Ğ¼Ğ¸Ğ½Ğ¸Ğ¼ÑƒĞ¼ {moq} {unit}.',
  'product.stockOnHand': 'ĞĞ°Ğ»Ğ¸Ñ‡Ğ¸Ğµ Ğ½Ğ° ÑĞºĞ»Ğ°Ğ´Ğµ',
  'product.buyNowPrice': 'ĞšÑƒĞ¿Ğ¸Ñ‚ÑŒ ÑĞµĞ¹Ñ‡Ğ°Ñ Â· {price}/{unit}',
  'product.outOfStock': 'ĞšÑƒĞ¿Ğ¸Ñ‚ÑŒ ÑĞµĞ¹Ñ‡Ğ°Ñ â€” Ğ½ĞµÑ‚ Ğ² Ğ½Ğ°Ğ»Ğ¸Ñ‡Ğ¸Ğ¸',
  'product.requestQuote': 'Ğ—Ğ°Ğ¿Ñ€Ğ¾ÑĞ¸Ñ‚ÑŒ Ñ†ĞµĞ½Ñƒ',
  'product.shipsFrom': 'ĞÑ‚Ğ³Ñ€ÑƒĞ·ĞºĞ° Ğ¸Ğ· {country}',
  'product.signInToOrder': 'Ğ’Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ Ğ·Ğ°ĞºĞ°Ğ·Ğ°Ñ‚ÑŒ Ğ¸Ğ»Ğ¸ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑĞ¸Ñ‚ÑŒ Ñ†ĞµĞ½Ñƒ.',
  'product.supplier': 'ĞŸĞ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸Ğº',
  'product.viewProfile': 'ĞÑ‚ĞºÑ€Ñ‹Ñ‚ÑŒ Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»ÑŒ',
  'product.loadingSupplier': 'Ğ—Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ° Ğ´Ğ°Ğ½Ğ½Ñ‹Ñ… Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°â€¦',
  'product.supplierUnavailable': 'Ğ”Ğ°Ğ½Ğ½Ñ‹Ğµ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ° Ğ½ĞµĞ´Ğ¾ÑÑ‚ÑƒĞ¿Ğ½Ñ‹.',
  'product.rating': 'Ğ ĞµĞ¹Ñ‚Ğ¸Ğ½Ğ³',
  'product.inspections': 'Ğ˜Ğ½ÑĞ¿ĞµĞºÑ†Ğ¸Ğ¸',
  'product.fulfilment': 'ĞŸĞ¾ÑÑ‚Ğ°Ğ²ĞºĞ¸ Ğ² ÑÑ€Ğ¾Ğº',
  'product.verifiedLevel': 'Ğ£Ñ€Ğ¾Ğ²ĞµĞ½ÑŒ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸',
  'product.levelN': 'Ğ£Ñ€Ğ¾Ğ²ĞµĞ½ÑŒ {n}',
  'product.tradingSince': 'Ğ Ğ°Ğ±Ğ¾Ñ‚Ğ°ĞµÑ‚ Ñ',
  'product.supplierFiguresHint': 'ĞŸĞ¾ĞºĞ°Ğ·Ğ°Ñ‚ĞµĞ»Ğ¸ Ğ¾Ñ‚Ğ½Ğ¾ÑÑÑ‚ÑÑ ĞºĞ¾ Ğ²ÑĞµĞ¼Ñƒ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºÑƒ Ğ½Ğ° Ğ¿Ğ»Ğ¾Ñ‰Ğ°Ğ´ĞºĞµ, Ğ° Ğ½Ğµ Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ğº ÑÑ‚Ğ¾Ğ¹ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¸.',
  'product.description': 'ĞĞ¿Ğ¸ÑĞ°Ğ½Ğ¸Ğµ',
  'product.noDescription':
    'ĞŸĞ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸Ğº Ğ½Ğµ Ğ´Ğ¾Ğ±Ğ°Ğ²Ğ¸Ğ» Ğ¾Ğ¿Ğ¸ÑĞ°Ğ½Ğ¸Ğµ. Ğ—Ğ°Ğ¿Ñ€Ğ¾ÑĞ¸Ñ‚Ğµ Ñ†ĞµĞ½Ñƒ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ ÑƒĞ·Ğ½Ğ°Ñ‚ÑŒ Ñ…Ğ°Ñ€Ğ°ĞºÑ‚ĞµÑ€Ğ¸ÑÑ‚Ğ¸ĞºĞ¸, ÑÑ€Ğ¾Ğº Ğ¸ ÑƒÑĞ»Ğ¾Ğ²Ğ¸Ñ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²ĞºĞ¸.',
  'product.specification': 'Ğ¥Ğ°Ñ€Ğ°ĞºÑ‚ĞµÑ€Ğ¸ÑÑ‚Ğ¸ĞºĞ¸',
  'product.noSpec': 'Ğ”Ğ»Ñ ÑÑ‚Ğ¾Ğ¹ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¸ Ñ…Ğ°Ñ€Ğ°ĞºÑ‚ĞµÑ€Ğ¸ÑÑ‚Ğ¸ĞºĞ¸ Ğ½Ğµ ÑƒĞºĞ°Ğ·Ğ°Ğ½Ñ‹.',
  'product.col.attribute': 'ĞŸĞ°Ñ€Ğ°Ğ¼ĞµÑ‚Ñ€',
  'product.col.value': 'Ğ—Ğ½Ğ°Ñ‡ĞµĞ½Ğ¸Ğµ',
  'product.spec.category': 'ĞšĞ°Ñ‚ĞµĞ³Ğ¾Ñ€Ğ¸Ñ',
  'product.spec.unit': 'Ğ•Ğ´Ğ¸Ğ½Ğ¸Ñ†Ğ°',
  'product.spec.purity': 'Ğ§Ğ¸ÑÑ‚Ğ¾Ñ‚Ğ° / ÑĞ¾Ñ€Ñ‚',

  'checkout.title': 'ĞšÑƒĞ¿Ğ¸Ñ‚ÑŒ ÑĞµĞ¹Ñ‡Ğ°Ñ â€” Ğ¾Ñ„Ğ¾Ñ€Ğ¼Ğ»ĞµĞ½Ğ¸Ğµ',
  'checkout.placedTitle': 'Ğ—Ğ°ĞºĞ°Ğ· Ğ¾Ñ„Ğ¾Ñ€Ğ¼Ğ»ĞµĞ½',
  'checkout.confirmed': 'Ğ—Ğ°ĞºĞ°Ğ· #{id} Ğ¿Ğ¾Ğ´Ñ‚Ğ²ĞµÑ€Ğ¶Ğ´Ñ‘Ğ½',
  'checkout.notified': 'ĞŸĞ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸Ğº ÑƒĞ²ĞµĞ´Ğ¾Ğ¼Ğ»Ñ‘Ğ½. ĞÑ‚ÑĞ»ĞµĞ¶Ğ¸Ğ²Ğ°Ğ¹Ñ‚Ğµ Ğ·Ğ°ĞºĞ°Ğ· Ğ½Ğ° ÑÑ‚Ñ€Ğ°Ğ½Ğ¸Ñ†Ğµ Ğ·Ğ°ĞºĞ°Ğ·Ğ¾Ğ².',
  'checkout.viewOrders': 'ĞœĞ¾Ğ¸ Ğ·Ğ°ĞºĞ°Ğ·Ñ‹',
  'checkout.keepBrowsing': 'ĞŸÑ€Ğ¾Ğ´Ğ¾Ğ»Ğ¶Ğ¸Ñ‚ÑŒ Ğ¿Ñ€Ğ¾ÑĞ¼Ğ¾Ñ‚Ñ€',
  'checkout.pricePer': 'Ğ¦ĞµĞ½Ğ° / {unit}',
  'checkout.minimumOrder': 'ĞœĞ¸Ğ½Ğ¸Ğ¼Ğ°Ğ»ÑŒĞ½Ñ‹Ğ¹ Ğ·Ğ°ĞºĞ°Ğ·',
  'checkout.availableNow': 'Ğ”Ğ¾ÑÑ‚ÑƒĞ¿Ğ½Ğ¾ ÑĞµĞ¹Ñ‡Ğ°Ñ',
  'checkout.quantity': 'ĞšĞ¾Ğ»Ğ¸Ñ‡ĞµÑÑ‚Ğ²Ğ¾ ({unit})',
  'checkout.qtyHint': 'ĞĞ° ÑĞºĞ»Ğ°Ğ´Ğµ Ğ¾Ñ‚ {moq} Ğ´Ğ¾ {stock} {unit}.',
  'checkout.fullName': 'Ğ˜Ğ¼Ñ Ğ¸ Ñ„Ğ°Ğ¼Ğ¸Ğ»Ğ¸Ñ',
  'checkout.country': 'Ğ¡Ñ‚Ñ€Ğ°Ğ½Ğ°',
  'checkout.address': 'ĞĞ´Ñ€ĞµÑ',
  'checkout.city': 'Ğ“Ğ¾Ñ€Ğ¾Ğ´',
  'checkout.phone': 'Ğ¢ĞµĞ»ĞµÑ„Ğ¾Ğ½',
  'checkout.notes': 'ĞŸÑ€Ğ¸Ğ¼ĞµÑ‡Ğ°Ğ½Ğ¸Ñ Ğ´Ğ»Ñ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°',
  'checkout.total': 'Ğ˜Ñ‚Ğ¾Ğ³Ğ¾ {total}',
  'checkout.placeOrder': 'ĞÑ„Ğ¾Ñ€Ğ¼Ğ¸Ñ‚ÑŒ Ğ·Ğ°ĞºĞ°Ğ· Â· {total}',
  'checkout.placing': 'ĞÑ„Ğ¾Ñ€Ğ¼Ğ»ĞµĞ½Ğ¸Ğµ Ğ·Ğ°ĞºĞ°Ğ·Ğ°â€¦',
  'checkout.errPlace': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ¾Ñ„Ğ¾Ñ€Ğ¼Ğ¸Ñ‚ÑŒ Ğ·Ğ°ĞºĞ°Ğ·.',

  'rfqModal.title': 'Ğ—Ğ°Ğ¿Ñ€Ğ¾ÑĞ¸Ñ‚ÑŒ Ñ†ĞµĞ½Ñƒ',
  'rfqModal.postedTitle': 'Ğ—Ğ°Ğ¿Ñ€Ğ¾Ñ Ñ€Ğ°Ğ·Ğ¼ĞµÑ‰Ñ‘Ğ½',
  'rfqModal.live': 'Ğ’Ğ°ÑˆĞ° Ğ¿Ğ¾Ñ‚Ñ€ĞµĞ±Ğ½Ğ¾ÑÑ‚ÑŒ Ğ¾Ğ¿ÑƒĞ±Ğ»Ğ¸ĞºĞ¾Ğ²Ğ°Ğ½Ğ° Ğ² Ğ±Ğ¸Ñ€Ğ¶Ğµ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑĞ¾Ğ² Ñ†ĞµĞ½Ñ‹',
  'rfqModal.canQuote': 'ĞŸÑ€Ğ¾Ğ²ĞµÑ€ĞµĞ½Ğ½Ñ‹Ğµ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¸ Ğ¼Ğ¾Ğ³ÑƒÑ‚ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶Ğ¸Ñ‚ÑŒ Ñ†ĞµĞ½Ñƒ Ğ¸ ÑÑ€Ğ¾Ğº.',
  'rfqModal.viewMine': 'ĞœĞ¾Ğ¸ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑÑ‹ Ñ†ĞµĞ½Ñ‹',
  'rfqModal.listedBy': '{product} Â· Ñ€Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ğ» {supplier}',
  'rfqModal.quantity': 'ĞšĞ¾Ğ»Ğ¸Ñ‡ĞµÑÑ‚Ğ²Ğ¾',
  'rfqModal.unit': 'Ğ•Ğ´Ğ¸Ğ½Ğ¸Ñ†Ğ°',
  'rfqModal.specs': 'Ğ¥Ğ°Ñ€Ğ°ĞºÑ‚ĞµÑ€Ğ¸ÑÑ‚Ğ¸ĞºĞ¸, ÑĞµÑ€Ñ‚Ğ¸Ñ„Ğ¸ĞºĞ°Ñ‚Ñ‹, ÑƒÑĞ»Ğ¾Ğ²Ğ¸Ñ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²ĞºĞ¸',
  'rfqModal.moqHint': 'MOQ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸ â€” {moq} {unit}.',
  'rfqModal.post': 'Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚ÑŒ Ğ·Ğ°Ğ¿Ñ€Ğ¾Ñ',
  'rfqModal.posting': 'Ğ Ğ°Ğ·Ğ¼ĞµÑ‰ĞµĞ½Ğ¸Ğµâ€¦',
  'rfqModal.errPost': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ñ€Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚ÑŒ Ğ·Ğ°Ğ¿Ñ€Ğ¾Ñ.',
  'rfqModal.titleSuffix': 'Ğ·Ğ°Ğ¿Ñ€Ğ¾Ñ Ñ†ĞµĞ½Ñ‹',

  'suppliers.loadingSub': 'Ğ—Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ° ĞºĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³Ğ° Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ²',
  'suppliers.loadingBody': 'Ğ—Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ° ĞºĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³Ğ° Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ²â€¦',
  'suppliers.title': 'ĞšĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ²',
  'suppliers.sub':
    'Ğ—Ğ°Ğ²Ğ¾Ğ´Ñ‹ Ğ¸ Ñ‚Ğ¾Ñ€Ğ³Ğ¾Ğ²Ñ‹Ğµ ĞºĞ¾Ğ¼Ğ¿Ğ°Ğ½Ğ¸Ğ¸ Ğ½Ğ° FactoryDepo. Ğ£Ñ€Ğ¾Ğ²Ğ½Ğ¸ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸ Ğ¾ÑĞ½Ğ¾Ğ²Ğ°Ğ½Ñ‹ Ğ½Ğ° Ğ²Ñ‹ĞµĞ·Ğ´Ğ½Ñ‹Ñ… Ğ°ÑƒĞ´Ğ¸Ñ‚Ğ°Ñ… Ğ¸ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞµ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ğ¾Ğ².',
  'suppliers.demoNote': 'ÑÑ‚Ñ€Ğ¾ĞºĞ¸ Ñ Ğ¼ĞµÑ‚ĞºĞ¾Ğ¹ Â«Ğ”ĞµĞ¼Ğ¾Â» â€” Ğ´ĞµĞ¼Ğ¾Ğ½ÑÑ‚Ñ€Ğ°Ñ†Ğ¸Ğ¾Ğ½Ğ½Ñ‹Ğµ Ğ´Ğ°Ğ½Ğ½Ñ‹Ğµ',
  'suppliers.loadErrorTitle': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ ĞºĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³',
  'suppliers.loadErrorBody': 'Ğ¡ĞµÑ€Ğ²Ğ¸Ñ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ² Ğ½Ğµ Ğ¾Ñ‚Ğ²ĞµÑ‚Ğ¸Ğ». ĞŸĞ¾Ğ²Ñ‚Ğ¾Ñ€Ğ¸Ñ‚Ğµ Ğ¿Ğ¾Ğ¿Ñ‹Ñ‚ĞºÑƒ Ğ¿Ğ¾Ğ·Ğ¶Ğµ.',
  'suppliers.emptyTitle': 'ĞŸĞ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ² Ğ¿Ğ¾ĞºĞ° Ğ½ĞµÑ‚',
  'suppliers.emptyBody': 'ĞŸÑ€Ğ¾Ñ„Ğ¸Ğ»Ğ¸ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ² Ğ¿Ğ¾ÑĞ²ÑÑ‚ÑÑ Ğ·Ğ´ĞµÑÑŒ Ğ¿Ğ¾ÑĞ»Ğµ Ğ¿Ğ¾Ğ´ĞºĞ»ÑÑ‡ĞµĞ½Ğ¸Ñ Ğ¸ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸.',
  'suppliers.totalListed': 'ĞŸĞ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ² Ğ² ĞºĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³Ğµ',
  'suppliers.totalVerified': 'ĞŸÑ€Ğ¾Ğ²ĞµÑ€ĞµĞ½Ñ‹, ÑƒÑ€Ğ¾Ğ²ĞµĞ½ÑŒ 2+',
  'suppliers.avgRating': 'Ğ¡Ñ€ĞµĞ´Ğ½Ğ¸Ğ¹ Ñ€ĞµĞ¹Ñ‚Ğ¸Ğ½Ğ³',
  'suppliers.avgRatingRated': 'Ğ¡Ñ€ĞµĞ´Ğ½Ğ¸Ğ¹ Ñ€ĞµĞ¹Ñ‚Ğ¸Ğ½Ğ³ (Ğ¾Ñ†ĞµĞ½ĞµĞ½Ğ¾: {n})',
  'suppliers.avgFulfilment': 'ĞŸĞ¾ÑÑ‚Ğ°Ğ²ĞºĞ¸ Ğ² ÑÑ€Ğ¾Ğº',
  'suppliers.avgFulfilmentMeasured': 'ĞŸĞ¾ÑÑ‚Ğ°Ğ²ĞºĞ¸ Ğ² ÑÑ€Ğ¾Ğº (Ğ¸Ğ·Ğ¼ĞµÑ€ĞµĞ½Ğ¾: {n})',
  'suppliers.searchPlaceholder': 'ĞšĞ¾Ğ¼Ğ¿Ğ°Ğ½Ğ¸Ñ, ÑÑ‚Ñ€Ğ°Ğ½Ğ°, Ğ³Ğ¾Ñ€Ğ¾Ğ´, ĞºĞ¾Ğ¼Ğ¿ĞµÑ‚ĞµĞ½Ñ†Ğ¸Ñâ€¦',
  'suppliers.searchAria': 'ĞŸĞ¾Ğ¸ÑĞº Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ²',
  'suppliers.verifiedOnly': 'Ğ¢Ğ¾Ğ»ÑŒĞºĞ¾ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞµĞ½Ğ½Ñ‹Ğµ',
  'suppliers.showing': 'ĞŸĞ¾ĞºĞ°Ğ·Ğ°Ğ½Ğ¾ {shown} Ğ¸Ğ· {total}',
  'suppliers.noMatchTitle': 'ĞŸĞ¾ ÑÑ‚Ğ¾Ğ¼Ñƒ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑÑƒ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ² Ğ½ĞµÑ‚',
  'suppliers.noMatchBody': 'ĞŸĞ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ Ğ±Ğ¾Ğ»ĞµĞµ ĞºĞ¾Ñ€Ğ¾Ñ‚ĞºĞ¾Ğµ Ğ½Ğ°Ğ·Ğ²Ğ°Ğ½Ğ¸Ğµ ĞºĞ¾Ğ¼Ğ¿Ğ°Ğ½Ğ¸Ğ¸ Ğ¸Ğ»Ğ¸ ÑĞ½Ğ¸Ğ¼Ğ¸Ñ‚Ğµ Ñ„Ğ¸Ğ»ÑŒÑ‚Ñ€ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸.',
  'suppliers.rating': 'Ğ ĞµĞ¹Ñ‚Ğ¸Ğ½Ğ³',
  'suppliers.inspections': 'Ğ˜Ğ½ÑĞ¿ĞµĞºÑ†Ğ¸Ğ¸',
  'suppliers.fulfilment': 'Ğ˜ÑĞ¿Ğ¾Ğ»Ğ½ĞµĞ½Ğ¸Ğµ',

  'supplierDetail.loadingThis': 'ÑÑ‚Ğ¾Ñ‚ Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»ÑŒ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°',
  'supplierDetail.notFound': 'ĞŸĞ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸Ğº Ğ½Ğµ Ğ½Ğ°Ğ¹Ğ´ĞµĞ½',
  'supplierDetail.backToDirectory': 'ĞĞ°Ğ·Ğ°Ğ´ Ğ² ĞºĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³',
  'supplierDetail.backShort': 'â† ĞĞ°Ğ·Ğ°Ğ´ Ğ² ĞºĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³',
  'supplierDetail.tradingSince': 'Ğ Ğ°Ğ±Ğ¾Ñ‚Ğ°ĞµÑ‚ Ñ {year}',
  'supplierDetail.verifiedL3': 'ĞŸÑ€Ğ¾Ğ²ĞµÑ€ĞµĞ½ Â· ÑƒÑ€Ğ¾Ğ²ĞµĞ½ÑŒ 3',
  'supplierDetail.registered': 'Ğ—Ğ°Ñ€ĞµĞ³Ğ¸ÑÑ‚Ñ€Ğ¸Ñ€Ğ¾Ğ²Ğ°Ğ½',
  'supplierDetail.buyerRating': 'Ğ ĞµĞ¹Ñ‚Ğ¸Ğ½Ğ³ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ĞµĞ¹',
  'supplierDetail.notRated': 'Ğ¿Ğ¾ĞºĞ° Ğ±ĞµĞ· Ğ¾Ñ†ĞµĞ½Ğ¾Ğº',
  'supplierDetail.inspections': 'Ğ’Ñ‹ĞµĞ·Ğ´Ğ½Ñ‹Ğµ Ğ¸Ğ½ÑĞ¿ĞµĞºÑ†Ğ¸Ğ¸',
  'supplierDetail.fulfilment': 'ĞŸĞ¾ÑÑ‚Ğ°Ğ²ĞºĞ¸ Ğ² ÑÑ€Ğ¾Ğº',
  'supplierDetail.activeListings': 'ĞĞºÑ‚Ğ¸Ğ²Ğ½Ñ‹Ğµ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸',
  'supplierDetail.tier': 'Ğ£Ñ€Ğ¾Ğ²ĞµĞ½ÑŒ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸',
  'supplierDetail.trustScore': 'Ğ˜Ğ½Ğ´ĞµĞºÑ Ğ´Ğ¾Ğ²ĞµÑ€Ğ¸Ñ (0â€“100)',
  'supplierDetail.about': 'Ğ ĞºĞ¾Ğ¼Ğ¿Ğ°Ğ½Ğ¸Ğ¸ {company}',
  'supplierDetail.noDescription': 'Ğ­Ñ‚Ğ¾Ñ‚ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸Ğº ĞµÑ‰Ñ‘ Ğ½Ğµ Ğ¾Ğ¿ÑƒĞ±Ğ»Ğ¸ĞºĞ¾Ğ²Ğ°Ğ» Ğ¾Ğ¿Ğ¸ÑĞ°Ğ½Ğ¸Ğµ ĞºĞ¾Ğ¼Ğ¿Ğ°Ğ½Ğ¸Ğ¸.',
  'supplierDetail.capabilities': 'Ğ—Ğ°ÑĞ²Ğ»ĞµĞ½Ğ½Ñ‹Ğµ ĞºĞ¾Ğ¼Ğ¿ĞµÑ‚ĞµĞ½Ñ†Ğ¸Ğ¸',
  'supplierDetail.record': 'ĞŸÑ€Ğ¾Ğ²ĞµÑ€ĞºĞ° Ğ¸ Ğ¸ÑÑ‚Ğ¾Ñ€Ğ¸Ñ',
  'supplierDetail.ratingLabel': 'Ğ ĞµĞ¹Ñ‚Ğ¸Ğ½Ğ³ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ĞµĞ¹',
  'supplierDetail.inspectionsDone': 'ĞŸÑ€Ğ¾Ğ²ĞµĞ´ĞµĞ½Ğ¾ Ğ¸Ğ½ÑĞ¿ĞµĞºÑ†Ğ¸Ğ¹',
  'supplierDetail.contact': 'ĞšĞ¾Ğ½Ñ‚Ğ°ĞºÑ‚Ñ‹',
  'supplierDetail.contactBody': 'ĞÑ‚Ñ‡Ñ‘Ñ‚Ñ‹ Ğ¾Ğ± Ğ¸Ğ½ÑĞ¿ĞµĞºÑ†Ğ¸Ğ¸ Ğ¸ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ñ‹ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸ Ğ¿ĞµÑ€ĞµĞ´Ğ°ÑÑ‚ÑÑ ÑƒÑ‡Ğ°ÑÑ‚Ğ½Ğ¸ĞºĞ°Ğ¼ Ğ¿Ğ¾ÑĞ»Ğµ Ğ¿ĞµÑ€Ğ²Ğ¾Ğ³Ğ¾ ĞºĞ¾Ğ½Ñ‚Ğ°ĞºÑ‚Ğ°.',
  'supplierDetail.contactSupplier': 'Ğ¡Ğ²ÑĞ·Ğ°Ñ‚ÑŒÑÑ Ñ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ¼',
  'supplierDetail.contactHintSignedIn': 'ĞÑ‚ĞºÑ€Ñ‹Ğ²Ğ°ĞµÑ‚ Ğ±Ğ¸Ñ€Ğ¶Ñƒ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑĞ¾Ğ² Ñ†ĞµĞ½Ñ‹ â€” Ğ¿ĞµÑ€ĞµĞ¿Ğ¸ÑĞºĞ° Ğ¿Ğ¾ Ñ†ĞµĞ½Ğµ Ğ¸Ğ´Ñ‘Ñ‚ Ñ‚Ğ°Ğ¼.',
  'supplierDetail.contactHintGuest': 'Ğ¢Ğ¾Ğ»ÑŒĞºĞ¾ Ğ´Ğ»Ñ ÑƒÑ‡Ğ°ÑÑ‚Ğ½Ğ¸ĞºĞ¾Ğ² Â· Ğ±ĞµÑĞ¿Ğ»Ğ°Ñ‚Ğ½Ğ¾Ğµ Ğ¿Ğ¾Ğ´ĞºĞ»ÑÑ‡ĞµĞ½Ğ¸Ğµ',
  'supplierDetail.services': 'Ğ¢Ğ¾Ñ€Ğ³Ğ¾Ğ²Ñ‹Ğµ ÑƒÑĞ»ÑƒĞ³Ğ¸',
  'supplierDetail.service1': 'Ğ˜Ğ½ÑĞ¿ĞµĞºÑ†Ğ¸Ñ Ğ·Ğ°Ğ²Ğ¾Ğ´Ğ° Ğ´Ğ¾ Ğ¾Ğ¿Ğ»Ğ°Ñ‚Ñ‹',
  'supplierDetail.service2': 'Ğ›Ğ°Ğ±Ğ¾Ñ€Ğ°Ñ‚Ğ¾Ñ€Ğ½Ñ‹Ğµ Ğ¸ÑĞ¿Ñ‹Ñ‚Ğ°Ğ½Ğ¸Ñ Ğ¸ Ğ°Ğ½Ğ°Ğ»Ğ¸Ğ· Ğ¼Ğ°Ñ‚ĞµÑ€Ğ¸Ğ°Ğ»Ğ¾Ğ²',
  'supplierDetail.service3': 'ĞšĞ¾Ğ½Ñ‚Ñ€Ğ¾Ğ»ÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ¸ ĞºĞ¾Ğ½Ñ‚ĞµĞ¹Ğ½ĞµÑ€Ğ°',
  'supplierDetail.service4': 'ĞŸĞ¾Ğ´Ğ´ĞµÑ€Ğ¶ĞºĞ° ÑĞºÑĞ¿Ğ¾Ñ€Ñ‚Ğ½Ñ‹Ñ… Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ğ¾Ğ²',
  'supplierDetail.stockFrom': 'Ğ¢Ğ¾Ğ²Ğ°Ñ€ Ğ¾Ñ‚ {company}',
  'supplierDetail.shown': 'Ğ¿Ğ¾ĞºĞ°Ğ·Ğ°Ğ½Ğ¾ {n}',
  'supplierDetail.loadingLots': 'Ğ—Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ° Ğ´Ğ¾ÑÑ‚ÑƒĞ¿Ğ½Ñ‹Ñ… Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¹â€¦',
  'supplierDetail.noneShown': 'ĞĞºÑ‚Ğ¸Ğ²Ğ½Ñ‹Ñ… Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¹ Ğ½Ğµ Ğ¿Ğ¾ĞºĞ°Ğ·Ğ°Ğ½Ğ¾',
  'supplierDetail.noneShownBody':
    'API ÑĞ¾Ğ¾Ğ±Ñ‰Ğ°ĞµÑ‚ Ğ¾ {n} Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸ÑÑ… ÑÑ‚Ğ¾Ğ³Ğ¾ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°, Ğ½Ğ¾ Ğ½Ğ¸ Ğ¾Ğ´Ğ½Ğ° Ğ½Ğµ Ğ²ĞµÑ€Ğ½ÑƒĞ»Ğ°ÑÑŒ Ğ² Ñ‚ĞµĞºÑƒÑ‰ĞµĞ¼ ÑĞ¿Ğ¸ÑĞºĞµ. Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚Ğµ Ğ·Ğ°Ğ¿Ñ€Ğ¾Ñ Ñ‡ĞµÑ€ĞµĞ· Ğ±Ğ¸Ñ€Ğ¶Ñƒ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑĞ¾Ğ² Ñ†ĞµĞ½Ñ‹, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ ÑƒĞ·Ğ½Ğ°Ñ‚ÑŒ Ğ¾ ĞºĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³Ğµ.',

  'rfq.titleSupplier': 'Ğ—Ğ°Ğ¿Ñ€Ğ¾ÑÑ‹ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ĞµĞ¹',
  'rfq.titleBuyer': 'Ğ—Ğ°Ğ¿Ñ€Ğ¾ÑÑ‹',
  'rfq.subSupplier': 'ĞÑ‚ĞºÑ€Ñ‹Ñ‚Ñ‹Ğµ Ğ¿Ğ¾Ñ‚Ñ€ĞµĞ±Ğ½Ğ¾ÑÑ‚Ğ¸ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ĞµĞ¹. ĞÑ‚Ğ²ĞµÑ‚ÑŒÑ‚Ğµ Ñ†ĞµĞ½Ğ¾Ğ¹ Ğ¸ ÑÑ€Ğ¾ĞºĞ¾Ğ¼.',
  'rfq.subBuyer': 'ĞĞºÑ‚ÑƒĞ°Ğ»ÑŒĞ½Ñ‹Ğµ Ğ¿Ğ¾Ñ‚Ñ€ĞµĞ±Ğ½Ğ¾ÑÑ‚Ğ¸ Ğ½Ğ° Ğ±Ğ¸Ñ€Ğ¶Ğµ, ÑĞ½Ğ°Ñ‡Ğ°Ğ»Ğ° Ğ½Ğ¾Ğ²Ñ‹Ğµ. ĞÑ‚ĞºÑ€Ğ¾Ğ¹Ñ‚Ğµ Ğ¾Ğ´Ğ½Ñƒ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ ÑƒĞ²Ğ¸Ğ´ĞµÑ‚ÑŒ Ğ¿Ğ¾Ğ»ÑƒÑ‡ĞµĞ½Ğ½Ñ‹Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ.',
  'rfq.postRequest': '+ Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚ÑŒ Ğ·Ğ°Ğ¿Ñ€Ğ¾Ñ',
  'rfq.buyerOnlyNotice': 'Ğ Ğ°Ğ·Ğ¼ĞµÑ‰Ğ°Ñ‚ÑŒ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑÑ‹ Ğ¼Ğ¾Ğ³ÑƒÑ‚ Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ñ‹ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ĞµĞ¹. Ğ’Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ Ñ Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»ĞµĞ¼ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ñ.',
  'rfq.total': 'Ğ²ÑĞµĞ³Ğ¾ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑĞ¾Ğ²',
  'rfq.open': 'Ğ¾Ñ‚ĞºÑ€Ñ‹Ñ‚Ğ¾',
  'rfq.quoted': 'Ñ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸ÑĞ¼Ğ¸',
  'rfq.closed': 'Ğ·Ğ°ĞºÑ€Ñ‹Ñ‚Ğ¾',
  'rfq.quoteable': 'Ğ—Ğ°Ğ¿Ñ€Ğ¾ÑÑ‹, Ğ¿Ğ¾ ĞºĞ¾Ñ‚Ğ¾Ñ€Ñ‹Ğ¼ Ğ¼Ğ¾Ğ¶Ğ½Ğ¾ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶Ğ¸Ñ‚ÑŒ Ñ†ĞµĞ½Ñƒ',
  'rfq.allRequests': 'Ğ’ÑĞµ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑÑ‹',
  'rfq.shown': 'Ğ¿Ğ¾ĞºĞ°Ğ·Ğ°Ğ½Ğ¾ {n}',
  'rfq.statusAll': 'Ğ’ÑĞµ',
  'rfq.statusOpenCount': 'ĞÑ‚ĞºÑ€Ñ‹Ñ‚Ñ‹Ğµ ({n})',
  'rfq.statusQuotedCount': 'Ğ¡ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸ÑĞ¼Ğ¸ ({n})',
  'rfq.quotingCloses': 'ĞŸÑ€Ğ¸Ñ‘Ğ¼ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğ¹ Ğ·Ğ°ĞºÑ€Ñ‹Ğ²Ğ°ĞµÑ‚ÑÑ, ĞºĞ¾Ğ³Ğ´Ğ° Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑŒ Ğ¿Ñ€Ğ¸Ğ½Ğ¸Ğ¼Ğ°ĞµÑ‚ Ğ¾Ğ´Ğ½Ğ¾ Ğ¸Ğ· Ğ½Ğ¸Ñ….',
  'rfq.emptyNone': 'Ğ—Ğ°Ğ¿Ñ€Ğ¾ÑĞ¾Ğ² Ğ¿Ğ¾ĞºĞ° Ğ½ĞµÑ‚',
  'rfq.emptyNoMatch': 'ĞŸĞ¾ ÑÑ‚Ğ¾Ğ¼Ñƒ Ñ„Ğ¸Ğ»ÑŒÑ‚Ñ€Ñƒ Ğ½Ğ¸Ñ‡ĞµĞ³Ğ¾ Ğ½ĞµÑ‚',
  'rfq.emptyNoneSupplier': 'Ğ¡ĞµĞ¹Ñ‡Ğ°Ñ Ğ½Ğ° Ğ±Ğ¸Ñ€Ğ¶Ğµ Ğ½ĞµÑ‚ Ğ¾Ñ‚ĞºÑ€Ñ‹Ñ‚Ñ‹Ñ… Ğ¿Ğ¾Ñ‚Ñ€ĞµĞ±Ğ½Ğ¾ÑÑ‚ĞµĞ¹.',
  'rfq.emptyNoneBuyer': 'Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚Ğµ Ğ¿ĞµÑ€Ğ²ÑƒÑ Ğ¿Ğ¾Ñ‚Ñ€ĞµĞ±Ğ½Ğ¾ÑÑ‚ÑŒ, Ğ¸ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞµĞ½Ğ½Ñ‹Ğµ Ğ·Ğ°Ğ²Ğ¾Ğ´Ñ‹ Ğ¾Ñ‚Ğ²ĞµÑ‚ÑÑ‚.',
  'rfq.emptyNoMatchHint': 'ĞŸĞ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ Ğ´Ñ€ÑƒĞ³Ğ¾Ğ¹ Ñ„Ğ¸Ğ»ÑŒÑ‚Ñ€ ÑÑ‚Ğ°Ñ‚ÑƒÑĞ°.',
  'rfq.col.requirement': 'ĞŸĞ¾Ñ‚Ñ€ĞµĞ±Ğ½Ğ¾ÑÑ‚ÑŒ',
  'rfq.col.quantity': 'ĞšĞ¾Ğ»Ğ¸Ñ‡ĞµÑÑ‚Ğ²Ğ¾',
  'rfq.col.deliverTo': 'ĞšÑƒĞ´Ğ° Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ğ¸Ñ‚ÑŒ',
  'rfq.col.quotes': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ',
  'rfq.col.posted': 'Ğ Ğ°Ğ·Ğ¼ĞµÑ‰Ñ‘Ğ½',
  'rfq.col.status': 'Ğ¡Ñ‚Ğ°Ñ‚ÑƒÑ',
  'rfq.openAria': 'ĞÑ‚ĞºÑ€Ñ‹Ñ‚ÑŒ Ğ·Ğ°Ğ¿Ñ€Ğ¾Ñ #{id}',
  'rfq.requestRef': '{category} Â· Ğ·Ğ°Ğ¿Ñ€Ğ¾Ñ #{id}',
  'rfq.quotesCount': '{n} Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğ¹',
  'rfq.postingBuyerOnly': 'Ğ Ğ°Ğ·Ğ¼ĞµÑ‰ĞµĞ½Ğ¸Ğµ â€” Ğ´ĞµĞ¹ÑÑ‚Ğ²Ğ¸Ğµ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ñ. ĞŸĞ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¸ Ğ¼Ğ¾Ğ³ÑƒÑ‚',
  'rfq.quoteOpen': 'Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶Ğ¸Ñ‚ÑŒ Ñ†ĞµĞ½Ñƒ Ğ¿Ğ¾ Ğ¾Ñ‚ĞºÑ€Ñ‹Ñ‚Ñ‹Ğ¼ Ğ¿Ğ¾Ñ‚Ñ€ĞµĞ±Ğ½Ğ¾ÑÑ‚ÑĞ¼',
  'rfq.newTitle': 'ĞĞ¾Ğ²Ñ‹Ğ¹ Ğ·Ğ°Ğ¿Ñ€Ğ¾Ñ Ñ†ĞµĞ½Ñ‹',
  'rfq.whatNeed': 'Ğ§Ñ‚Ğ¾ Ğ²Ğ°Ğ¼ Ğ½ÑƒĞ¶Ğ½Ğ¾?',
  'rfq.titlePlaceholder': 'Ğ½Ğ°Ğ¿Ñ€Ğ¸Ğ¼ĞµÑ€, 100 Ñ‚ Ğ¼ĞµĞ´Ğ½Ğ¾Ğ³Ğ¾ ĞºĞ°Ñ‚Ğ¾Ğ´Ğ°, ÑĞ¾Ñ€Ñ‚ A',
  'rfq.category': 'ĞšĞ°Ñ‚ĞµĞ³Ğ¾Ñ€Ğ¸Ñ',
  'rfq.deliverTo': 'ĞšÑƒĞ´Ğ° Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ğ¸Ñ‚ÑŒ',
  'rfq.quantity': 'ĞšĞ¾Ğ»Ğ¸Ñ‡ĞµÑÑ‚Ğ²Ğ¾',
  'rfq.unit': 'Ğ•Ğ´Ğ¸Ğ½Ğ¸Ñ†Ğ°',
  'rfq.specification': 'Ğ¥Ğ°Ñ€Ğ°ĞºÑ‚ĞµÑ€Ğ¸ÑÑ‚Ğ¸ĞºĞ¸',
  'rfq.specPlaceholder': 'Ğ¡Ğ¾Ñ€Ñ‚, Ñ‡Ğ¸ÑÑ‚Ğ¾Ñ‚Ğ°, ÑĞµÑ€Ñ‚Ğ¸Ñ„Ğ¸ĞºĞ°Ñ‚Ñ‹, Ğ˜Ğ½ĞºĞ¾Ñ‚ĞµÑ€Ğ¼Ñ, ÑƒĞ¿Ğ°ĞºĞ¾Ğ²ĞºĞ°â€¦',
  'rfq.specHint': 'Ğ§ĞµĞ¼ Ñ‚Ğ¾Ñ‡Ğ½ĞµĞµ Ñ…Ğ°Ñ€Ğ°ĞºÑ‚ĞµÑ€Ğ¸ÑÑ‚Ğ¸ĞºĞ¸, Ñ‚ĞµĞ¼ Ğ±Ñ‹ÑÑ‚Ñ€ĞµĞµ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞµĞ½Ğ½Ñ‹Ğµ Ğ·Ğ°Ğ²Ğ¾Ğ´Ñ‹ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶Ğ°Ñ‚ Ñ†ĞµĞ½Ñƒ.',
  'rfq.errTitle': 'Ğ”Ğ°Ğ¹Ñ‚Ğµ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑÑƒ Ğ¿Ğ¾Ğ½ÑÑ‚Ğ½Ğ¾Ğµ Ğ½Ğ°Ğ·Ğ²Ğ°Ğ½Ğ¸Ğµ â€” Ğ¼Ğ¸Ğ½Ğ¸Ğ¼ÑƒĞ¼ 5 ÑĞ¸Ğ¼Ğ²Ğ¾Ğ»Ğ¾Ğ².',
  'rfq.errQuantity': 'ĞšĞ¾Ğ»Ğ¸Ñ‡ĞµÑÑ‚Ğ²Ğ¾ Ğ´Ğ¾Ğ»Ğ¶Ğ½Ğ¾ Ğ±Ñ‹Ñ‚ÑŒ Ñ‡Ğ¸ÑĞ»Ğ¾Ğ¼ Ğ±Ğ¾Ğ»ÑŒÑˆĞµ Ğ½ÑƒĞ»Ñ.',
  'rfq.errPost': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ñ€Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚ÑŒ ÑÑ‚Ğ¾Ñ‚ Ğ·Ğ°Ğ¿Ñ€Ğ¾Ñ.',

  'rfqDetail.loadingTitle': 'Ğ—Ğ°Ğ¿Ñ€Ğ¾Ñ',
  'rfqDetail.loadingSub': 'Ğ—Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ°â€¦',
  'rfqDetail.title': 'Ğ—Ğ°Ğ¿Ñ€Ğ¾Ñ',
  'rfqDetail.notFound': 'Ğ—Ğ°Ğ¿Ñ€Ğ¾Ñ Ğ½Ğµ Ğ½Ğ°Ğ¹Ğ´ĞµĞ½',
  'rfqDetail.notFoundBody': 'Ğ’Ğ¾Ğ·Ğ¼Ğ¾Ğ¶Ğ½Ğ¾, Ğ¿Ğ¾Ñ‚Ñ€ĞµĞ±Ğ½Ğ¾ÑÑ‚ÑŒ Ğ¾Ñ‚Ğ¾Ğ·Ğ²Ğ°Ğ½Ğ° Ğ¸Ğ»Ğ¸ ÑÑÑ‹Ğ»ĞºĞ° Ğ½ĞµĞ²ĞµÑ€Ğ½Ğ°.',
  'rfqDetail.backToRequests': 'â† ĞĞ°Ğ·Ğ°Ğ´ Ğº Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑĞ°Ğ¼',
  'rfqDetail.allRequests': 'â† Ğ’ÑĞµ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑÑ‹',
  'rfqDetail.postedOn': 'Ñ€Ğ°Ğ·Ğ¼ĞµÑ‰Ñ‘Ğ½ {date}',
  'rfqDetail.requestRef': 'Ğ—Ğ°Ğ¿Ñ€Ğ¾Ñ #{id}',
  'rfqDetail.accepting': 'ĞŸÑ€Ğ¸Ñ‘Ğ¼ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğ¹ Ğ¾Ñ‚ĞºÑ€Ñ‹Ñ‚',
  'rfqDetail.notAccepting': 'ĞĞ¾Ğ²Ñ‹Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ½Ğµ Ğ¿Ñ€Ğ¸Ğ½Ğ¸Ğ¼Ğ°ÑÑ‚ÑÑ',
  'rfqDetail.noSpec': 'Ğ”Ğ¾Ğ¿Ğ¾Ğ»Ğ½Ğ¸Ñ‚ĞµĞ»ÑŒĞ½Ñ‹Ğµ Ñ…Ğ°Ñ€Ğ°ĞºÑ‚ĞµÑ€Ğ¸ÑÑ‚Ğ¸ĞºĞ¸ Ğ½Ğµ ÑƒĞºĞ°Ğ·Ğ°Ğ½Ñ‹.',
  'rfqDetail.quantity': 'ĞšĞ¾Ğ»Ğ¸Ñ‡ĞµÑÑ‚Ğ²Ğ¾',
  'rfqDetail.deliverTo': 'ĞšÑƒĞ´Ğ° Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ğ¸Ñ‚ÑŒ',
  'rfqDetail.quotations': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ',
  'rfqDetail.deadline': 'Ğ¡Ñ€Ğ¾Ğº',
  'rfqDetail.requestedBy': 'Ğ—Ğ°Ğ¿Ñ€Ğ¾ÑĞ¸Ğ»',
  'rfqDetail.received': 'Ğ¿Ğ¾Ğ»ÑƒÑ‡ĞµĞ½Ğ¾: {n}',
  'rfqDetail.noneTitle': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğ¹ Ğ¿Ğ¾ĞºĞ° Ğ½ĞµÑ‚',
  'rfqDetail.noneBody': 'ĞŸÑ€Ğ¾Ğ²ĞµÑ€ĞµĞ½Ğ½Ñ‹Ğµ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¸ Ğ¸Ğ·ÑƒÑ‡Ğ°ÑÑ‚ ÑÑ‚Ñƒ Ğ¿Ğ¾Ñ‚Ñ€ĞµĞ±Ğ½Ğ¾ÑÑ‚ÑŒ.',
  'rfqDetail.col.supplier': 'ĞŸĞ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸Ğº',
  'rfqDetail.col.price': 'Ğ¦ĞµĞ½Ğ°',
  'rfqDetail.col.leadTime': 'Ğ¡Ñ€Ğ¾Ğº',
  'rfqDetail.col.notes': 'ĞŸÑ€Ğ¸Ğ¼ĞµÑ‡Ğ°Ğ½Ğ¸Ñ',
  'rfqDetail.col.sent': 'ĞÑ‚Ğ¿Ñ€Ğ°Ğ²Ğ»ĞµĞ½Ğ¾',
  'rfqDetail.col.status': 'Ğ¡Ñ‚Ğ°Ñ‚ÑƒÑ',
  'rfqDetail.trustScore': 'Ğ˜Ğ½Ğ´ĞµĞºÑ Ğ´Ğ¾Ğ²ĞµÑ€Ğ¸Ñ {n}',
  'rfqDetail.days': '{n} Ğ´Ğ½ĞµĞ¹',
  'rfqDetail.submitTitle': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶Ğ¸Ñ‚ÑŒ Ñ†ĞµĞ½Ñƒ',
  'rfqDetail.supplierAccount': 'ĞĞºĞºĞ°ÑƒĞ½Ñ‚ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°',
  'rfqDetail.fromSupplier': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ¿Ñ€Ğ¸Ñ…Ğ¾Ğ´ÑÑ‚ Ğ¾Ñ‚ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ğ¾Ğ² Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ². ĞŸĞµÑ€ĞµĞºĞ»ÑÑ‡Ğ¸Ñ‚ĞµÑÑŒ Ğ½Ğ° Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ Ğ¾Ñ‚Ğ²ĞµÑ‚Ğ¸Ñ‚ÑŒ.',
  'rfqDetail.signInSupplierBody': 'ĞŸÑ€ĞµĞ´Ğ»Ğ°Ğ³Ğ°Ñ‚ÑŒ Ñ†ĞµĞ½Ñƒ Ğ¼Ğ¾Ğ³ÑƒÑ‚ Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ğ²Ğ¾ÑˆĞµĞ´ÑˆĞ¸Ğµ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ñ‹ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ². ĞŸÑ€Ğ¾ÑĞ¼Ğ¾Ñ‚Ñ€ Ğ¾Ñ‚ĞºÑ€Ñ‹Ñ‚ Ğ´Ğ»Ñ Ğ²ÑĞµÑ….',
  'rfqDetail.supplierOnly': 'Ğ¢Ğ¾Ğ»ÑŒĞºĞ¾ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ñ‹ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ²',
  'rfqDetail.signInAsSupplier': 'Ğ’Ğ¾Ğ¹Ñ‚Ğ¸ ĞºĞ°Ğº Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸Ğº',
  'rfqDetail.closedBody': 'Ğ­Ñ‚Ğ¾Ñ‚ Ğ·Ğ°Ğ¿Ñ€Ğ¾Ñ {status} Ğ¸ Ğ±Ğ¾Ğ»ÑŒÑˆĞµ Ğ½Ğµ Ğ¿Ñ€Ğ¸Ğ½Ğ¸Ğ¼Ğ°ĞµÑ‚ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ.',
  'rfqDetail.seeOpen': 'Ğ¡Ğ¼Ğ¾Ñ‚Ñ€ĞµÑ‚ÑŒ Ğ¾Ñ‚ĞºÑ€Ñ‹Ñ‚Ñ‹Ğµ Ğ·Ğ°Ğ¿Ñ€Ğ¾ÑÑ‹',
  'rfqDetail.respondBody': 'ĞÑ‚Ğ²ĞµÑ‚ÑŒÑ‚Ğµ Ñ†ĞµĞ½Ğ¾Ğ¹ Ğ·Ğ° ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ Ğ¸ ÑÑ€Ğ¾ĞºĞ¾Ğ¼. Ğ’Ğ°Ñˆ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞµĞ½Ğ½Ñ‹Ğ¹ Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»ÑŒ Ğ¸Ğ´Ñ‘Ñ‚ Ğ²Ğ¼ĞµÑÑ‚Ğµ Ñ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸ĞµĞ¼.',
  'rfqDetail.unitPrice': 'Ğ¦ĞµĞ½Ğ° Ğ·Ğ° ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ (USD)',
  'rfqDetail.leadTime': 'Ğ¡Ñ€Ğ¾Ğº (Ğ´Ğ½ĞµĞ¹)',
  'rfqDetail.termsNotes': 'Ğ£ÑĞ»Ğ¾Ğ²Ğ¸Ñ Ğ¸ Ğ¿Ñ€Ğ¸Ğ¼ĞµÑ‡Ğ°Ğ½Ğ¸Ñ',
  'rfqDetail.termsPlaceholder': 'Ğ˜Ğ½ĞºĞ¾Ñ‚ĞµÑ€Ğ¼Ñ, ÑĞ¾Ñ€Ñ‚, ÑƒĞ¿Ğ°ĞºĞ¾Ğ²ĞºĞ°, ÑƒÑĞ»Ğ¾Ğ²Ğ¸Ñ Ğ¾Ğ±Ñ€Ğ°Ğ·Ñ†Ğ¾Ğ², ÑÑ€Ğ¾Ğº Ğ´ĞµĞ¹ÑÑ‚Ğ²Ğ¸Ñâ€¦',
  'rfqDetail.compareHint': 'ĞŸĞ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ğ¸ ÑÑ€Ğ°Ğ²Ğ½Ğ¸Ğ²Ğ°ÑÑ‚ Ñ†ĞµĞ½Ñƒ, ÑÑ€Ğ¾Ğº Ğ¸ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºÑƒ Ñ€ÑĞ´Ğ¾Ğ¼.',
  'rfqDetail.submitQuote': 'ĞÑ‚Ğ¿Ñ€Ğ°Ğ²Ğ¸Ñ‚ÑŒ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ',
  'rfqDetail.submitting': 'ĞÑ‚Ğ¿Ñ€Ğ°Ğ²ĞºĞ°â€¦',
  'rfqDetail.errPrice': 'Ğ£ĞºĞ°Ğ¶Ğ¸Ñ‚Ğµ Ñ†ĞµĞ½Ñƒ Ğ·Ğ° ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ Ğ±Ğ¾Ğ»ÑŒÑˆĞµ Ğ½ÑƒĞ»Ñ.',
  'rfqDetail.errLead': 'Ğ¡Ñ€Ğ¾Ğº Ğ´Ğ¾Ğ»Ğ¶ĞµĞ½ Ğ±Ñ‹Ñ‚ÑŒ Ñ†ĞµĞ»Ñ‹Ğ¼ Ñ‡Ğ¸ÑĞ»Ğ¾Ğ¼ Ğ´Ğ½ĞµĞ¹ Ğ¾Ñ‚ 1 Ğ´Ğ¾ 365.',
  'rfqDetail.errSubmit': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ¾Ñ‚Ğ¿Ñ€Ğ°Ğ²Ğ¸Ñ‚ÑŒ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ.',

  'listings.title': 'ĞœĞ¾Ğ¸ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸',
  'listings.sub': 'Ğ¢Ğ¾Ğ²Ğ°Ñ€, ĞºĞ¾Ñ‚Ğ¾Ñ€Ñ‹Ğ¹ Ğ²Ñ‹ Ğ¾Ğ¿ÑƒĞ±Ğ»Ğ¸ĞºĞ¾Ğ²Ğ°Ğ»Ğ¸ Ğ½Ğ° Ğ¿Ğ»Ğ¾Ñ‰Ğ°Ğ´ĞºĞµ',
  'listings.signInSub': 'Ğ¢Ğ¾Ğ²Ğ°Ñ€, ĞºĞ¾Ñ‚Ğ¾Ñ€Ñ‹Ğ¹ Ğ²Ñ‹ Ğ¾Ğ¿ÑƒĞ±Ğ»Ğ¸ĞºĞ¾Ğ²Ğ°Ğ»Ğ¸ Ğ½Ğ° Ğ¿Ğ»Ğ¾Ñ‰Ğ°Ğ´ĞºĞµ',
  'listings.notSignedIn': 'Ğ’Ñ‹ Ğ½Ğµ Ğ²Ğ¾ÑˆĞ»Ğ¸',
  'listings.notSignedInBody': 'Ğ’Ğ°ÑˆĞ¸ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸ Ğ²Ğ¸Ğ´Ğ½Ñ‹ Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ğ²Ğ°ÑˆĞµĞ¼Ñƒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ñƒ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°. Ğ’Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ Ğ¿Ğ¾ÑĞ¼Ğ¾Ñ‚Ñ€ĞµÑ‚ÑŒ Ğ¸ ÑƒĞ¿Ñ€Ğ°Ğ²Ğ»ÑÑ‚ÑŒ Ğ¸Ğ¼Ğ¸.',
  'listings.createSupplierAccount': 'Ğ¡Ğ¾Ğ·Ğ´Ğ°Ñ‚ÑŒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°',
  'listings.supplierOnly': 'Ğ¢Ğ¾Ğ»ÑŒĞºĞ¾ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ñ‹ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ²',
  'listings.supplierOnlyBody':
    'Ğ’Ğ°Ñˆ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚ â€” {role}. ĞŸĞ¾Ğ·Ğ¸Ñ†Ğ¸ÑĞ¼Ğ¸ ÑƒĞ¿Ñ€Ğ°Ğ²Ğ»ÑĞµÑ‚ Ğ²Ğ»Ğ°Ğ´ĞµÑÑ‰Ğ¸Ğ¹ Ğ¸Ğ¼Ğ¸ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸Ğº, Ğ¿Ğ¾ÑÑ‚Ğ¾Ğ¼Ñƒ Ğ·Ğ´ĞµÑÑŒ Ğ½ĞµÑ‡ĞµĞ³Ğ¾ Ğ¿Ğ¾ĞºĞ°Ğ·Ñ‹Ğ²Ğ°Ñ‚ÑŒ Ğ¸Ğ»Ğ¸ Ğ¼ĞµĞ½ÑÑ‚ÑŒ.',
  'listings.browseStock': 'Ğ¡Ğ¼Ğ¾Ñ‚Ñ€ĞµÑ‚ÑŒ Ğ³Ğ¾Ñ‚Ğ¾Ğ²Ñ‹Ğ¹ ÑĞºĞ»Ğ°Ğ´',
  'listings.subLoading': 'Ğ—Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ° Ğ²Ğ°ÑˆĞµĞ³Ğ¾ Ñ‚Ğ¾Ğ²Ğ°Ñ€Ğ°â€¦',
  'listings.subCount': '{n} Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¹ Ğ¾Ğ¿ÑƒĞ±Ğ»Ğ¸ĞºĞ¾Ğ²Ğ°Ğ½Ğ¾ Ğ¿Ğ¾Ğ´ Ğ²Ğ°ÑˆĞ¸Ğ¼ Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»ĞµĞ¼ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°',
  'listings.postStock': '+ Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚ÑŒ Ñ‚Ğ¾Ğ²Ğ°Ñ€',
  'listings.lotsPublished': 'Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¹ Ğ¾Ğ¿ÑƒĞ±Ğ»Ğ¸ĞºĞ¾Ğ²Ğ°Ğ½Ğ¾',
  'listings.bankTransferNote': 'ĞŸĞ¾ÑĞ»Ğµ Ğ¿Ñ€Ğ¸Ğ½ÑÑ‚Ğ¸Ñ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ğ¸ Ğ¿Ğ»Ğ°Ñ‚ÑÑ‚ Ğ±Ğ°Ğ½ĞºĞ¾Ğ²ÑĞºĞ¸Ğ¼ Ğ¿ĞµÑ€ĞµĞ²Ğ¾Ğ´Ğ¾Ğ¼.',
  'listings.loadErrorTitle': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ Ğ²Ğ°ÑˆĞ¸ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸',
  'listings.loadErrorBody': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸ â€” Ğ¿Ğ¾Ğ²Ñ‚Ğ¾Ñ€Ğ¸Ñ‚Ğµ Ğ¿Ğ¾Ğ¿Ñ‹Ñ‚ĞºÑƒ. Ğ•ÑĞ»Ğ¸ Ğ½Ğµ Ğ¿Ğ¾Ğ¼Ğ¾Ğ³Ğ°ĞµÑ‚, Ğ²Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ ÑĞ½Ğ¾Ğ²Ğ°.',
  'listings.emptyTitle': 'ĞŸĞ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¹ Ğ¿Ğ¾ĞºĞ° Ğ½ĞµÑ‚',
  'listings.emptyBody':
    'Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚Ğµ Ğ¿ĞµÑ€Ğ²ÑƒÑ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ â€” Ñ„Ğ¾Ñ‚Ğ¾, Ñ†ĞµĞ½Ñƒ Ğ·Ğ° ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ Ğ¸ Ğ¾Ğ±ÑŠÑ‘Ğ¼, ĞºĞ¾Ñ‚Ğ¾Ñ€Ñ‹Ğ¹ Ğ¼Ğ¾Ğ¶ĞµÑ‚Ğµ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ ÑĞµĞ³Ğ¾Ğ´Ğ½Ñ. ĞĞ½Ğ° ÑÑ€Ğ°Ğ·Ñƒ Ğ¿Ğ¾ÑĞ²Ğ¸Ñ‚ÑÑ Ğ² ĞºĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³Ğµ Ğ´Ğ»Ñ Ğ²ÑĞµÑ… Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ĞµĞ¹.',
  'listings.postFirst': '+ Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚ÑŒ Ğ¿ĞµÑ€Ğ²ÑƒÑ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ',
  'listings.getVerified': 'ĞŸÑ€Ğ¾Ğ¹Ñ‚Ğ¸ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºÑƒ',
  'listings.count': '{n} Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¹',
  'listings.col.lot': 'ĞŸĞ°Ñ€Ñ‚Ğ¸Ñ',
  'listings.col.category': 'ĞšĞ°Ñ‚ĞµĞ³Ğ¾Ñ€Ğ¸Ñ',
  'listings.col.unitPrice': 'Ğ¦ĞµĞ½Ğ° Ğ·Ğ° ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ',
  'listings.col.moq': 'MOQ',
  'listings.col.available': 'Ğ’ Ğ½Ğ°Ğ»Ğ¸Ñ‡Ğ¸Ğ¸',
  'listings.col.status': 'Ğ¡Ñ‚Ğ°Ñ‚ÑƒÑ',
  'listings.col.posted': 'Ğ Ğ°Ğ·Ğ¼ĞµÑ‰ĞµĞ½Ğ¾',
  'listings.lotRef': 'Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ #{id}',
  'listings.noPhotoInline': 'Ğ½ĞµÑ‚ Ñ„Ğ¾Ñ‚Ğ¾',
  'listings.demoNoteLead': 'ĞŸĞ°Ñ€Ñ‚Ğ¸Ñ Ñ Ğ¼ĞµÑ‚ĞºĞ¾Ğ¹',
  'listings.demoNoteTail':
    'â€” Ğ´ĞµĞ¼Ğ¾Ğ½ÑÑ‚Ñ€Ğ°Ñ†Ğ¸Ğ¾Ğ½Ğ½Ñ‹Ğµ Ğ´Ğ°Ğ½Ğ½Ñ‹Ğµ Ğ¿Ğ»Ğ¾Ñ‰Ğ°Ğ´ĞºĞ¸, Ğ° Ğ½Ğµ Ñ€Ğ°Ğ·Ğ¼ĞµÑ‰Ñ‘Ğ½Ğ½Ñ‹Ğ¹ Ğ²Ğ°Ğ¼Ğ¸ Ñ‚Ğ¾Ğ²Ğ°Ñ€. Ğ£Ğ´Ğ°Ğ»ĞµĞ½Ğ¸Ğµ ÑƒĞ±ĞµÑ€Ñ‘Ñ‚ ĞµÑ‘ Ğ´Ğ»Ñ Ğ²ÑĞµÑ….',
  'listings.updated': 'ĞŸĞ¾Ğ·Ğ¸Ñ†Ğ¸Ñ Ğ¾Ğ±Ğ½Ğ¾Ğ²Ğ»ĞµĞ½Ğ°.',
  'listings.deleted': 'ĞŸĞ¾Ğ·Ğ¸Ñ†Ğ¸Ñ ÑƒĞ´Ğ°Ğ»ĞµĞ½Ğ°. Ğ•Ñ‘ Ğ±Ğ¾Ğ»ÑŒÑˆĞµ Ğ½ĞµÑ‚ Ğ½Ğ° Ğ¿Ğ»Ğ¾Ñ‰Ğ°Ğ´ĞºĞµ.',
  'listings.deleteTitle': 'Ğ£Ğ´Ğ°Ğ»Ğ¸Ñ‚ÑŒ ÑÑ‚Ñƒ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ñ?',
  'listings.deleteLead': '{name} â€” Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ #{id}',
  'listings.deleteBody':
    'ĞŸĞ¾Ğ·Ğ¸Ñ†Ğ¸Ñ ÑƒĞ´Ğ°Ğ»ÑĞµÑ‚ÑÑ Ğ±ĞµĞ·Ğ²Ğ¾Ğ·Ğ²Ñ€Ğ°Ñ‚Ğ½Ğ¾. ĞĞ½Ğ° ÑÑ€Ğ°Ğ·Ñƒ Ğ¸ÑÑ‡ĞµĞ·Ğ°ĞµÑ‚ Ğ¸Ğ· ĞºĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³Ğ° Ğ¸ Ğ¸Ğ· Ğ²Ğ°ÑˆĞµĞ¹ Ñ‚Ğ°Ğ±Ğ»Ğ¸Ñ†Ñ‹, Ğ¸ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ğ¸ Ğ±Ğ¾Ğ»ÑŒÑˆĞµ Ğ½Ğµ Ğ¼Ğ¾Ğ³ÑƒÑ‚ Ğ·Ğ°ĞºĞ°Ğ·Ğ°Ñ‚ÑŒ ĞµÑ‘ Ğ¸Ğ»Ğ¸ Ñ‚Ğ¾Ñ€Ğ³Ğ¾Ğ²Ğ°Ñ‚ÑŒÑÑ. ĞÑ‚Ğ¼ĞµĞ½Ğ¸Ñ‚ÑŒ ÑÑ‚Ğ¾ Ğ½ĞµĞ»ÑŒĞ·Ñ.',
  'listings.deleteKeepBody':
    'ĞŸĞ°Ñ€Ñ‚Ğ¸Ñ, Ğ¿Ğ¾ ĞºĞ¾Ñ‚Ğ¾Ñ€Ğ¾Ğ¹ ÑƒĞ¶Ğµ ĞµÑÑ‚ÑŒ Ğ·Ğ°ĞºĞ°Ğ·Ñ‹ Ğ¸Ğ»Ğ¸ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ, ÑƒĞ´Ğ°Ğ»Ğ¸Ñ‚ÑŒ Ğ½ĞµĞ»ÑŒĞ·Ñ â€” API Ñ…Ñ€Ğ°Ğ½Ğ¸Ñ‚ ĞµÑ‘ Ğ´Ğ»Ñ Ğ¸ÑÑ‚Ğ¾Ñ€Ğ¸Ğ¸. Ğ’Ğ¼ĞµÑÑ‚Ğ¾ ÑÑ‚Ğ¾Ğ³Ğ¾ Ğ¾Ñ‚Ğ¼ĞµÑ‚ÑŒÑ‚Ğµ ĞµÑ‘ ĞºĞ°Ğº Ñ€Ğ°ÑĞ¿Ñ€Ğ¾Ğ´Ğ°Ğ½Ğ½ÑƒÑ, ÑƒĞºĞ°Ğ·Ğ°Ğ² Ğ½Ğ°Ğ»Ğ¸Ñ‡Ğ¸Ğµ 0.',
  'listings.keepListing': 'ĞÑÑ‚Ğ°Ğ²Ğ¸Ñ‚ÑŒ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ñ',
  'listings.deleteForever': 'Ğ£Ğ´Ğ°Ğ»Ğ¸Ñ‚ÑŒ Ğ½Ğ°Ğ²ÑĞµĞ³Ğ´Ğ°',
  'listings.deleting': 'Ğ£Ğ´Ğ°Ğ»ĞµĞ½Ğ¸Ğµâ€¦',
  'listings.deleteErr': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ ÑƒĞ´Ğ°Ğ»Ğ¸Ñ‚ÑŒ ÑÑ‚Ñƒ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ñ.',
  'listings.editTitle': 'Ğ˜Ğ·Ğ¼ĞµĞ½Ğ¸Ñ‚ÑŒ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ñ â€” Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ #{id}',

  'post.title': 'Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚ÑŒ Ñ‚Ğ¾Ğ²Ğ°Ñ€',
  'post.titleEdit': 'Ğ˜Ğ·Ğ¼ĞµĞ½Ğ¸Ñ‚ÑŒ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ñ',
  'post.sub': 'ĞĞ´Ğ½Ğ° Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ Ğ½Ğ° Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ñ: Ñ‡Ñ‚Ğ¾ ÑÑ‚Ğ¾, ÑĞºĞ¾Ğ»ÑŒĞºĞ¾ ÑÑ‚Ğ¾Ğ¸Ñ‚ Ğ¸ ÑĞºĞ¾Ğ»ÑŒĞºĞ¾ Ğ¼Ğ¾Ğ¶ĞµÑ‚Ğµ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ ÑĞµĞ³Ğ¾Ğ´Ğ½Ñ',
  'post.subEdit': 'Ğ˜Ğ·Ğ¼ĞµĞ½ĞµĞ½Ğ¸Ğµ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¸ #{id} â€” ÑĞ¾Ñ…Ñ€Ğ°Ğ½ĞµĞ½Ğ¸Ğµ Ğ¿ĞµÑ€ĞµĞ·Ğ°Ğ¿Ğ¸ÑÑ‹Ğ²Ğ°ĞµÑ‚ Ğ¾Ğ¿ÑƒĞ±Ğ»Ğ¸ĞºĞ¾Ğ²Ğ°Ğ½Ğ½ÑƒÑ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ñ',
  'post.signInSub': 'Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚Ğµ Ğ³Ğ¾Ñ‚Ğ¾Ğ²Ñ‹Ğ¹ Ñ‚Ğ¾Ğ²Ğ°Ñ€, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ğ¸ Ğ¼Ğ¾Ğ³Ğ»Ğ¸ Ğ·Ğ°ĞºĞ°Ğ·Ğ°Ñ‚ÑŒ ĞµĞ³Ğ¾ Ğ¸Ğ»Ğ¸ Ñ‚Ğ¾Ñ€Ğ³Ğ¾Ğ²Ğ°Ñ‚ÑŒÑÑ',
  'post.notSignedIn': 'Ğ’Ñ‹ Ğ½Ğµ Ğ²Ğ¾ÑˆĞ»Ğ¸',
  'post.notSignedInBody': 'Ğ Ğ°Ğ·Ğ¼ĞµÑ‰ĞµĞ½Ğ¸Ğµ Ñ‚Ğ¾Ğ²Ğ°Ñ€Ğ° â€” Ğ´ĞµĞ¹ÑÑ‚Ğ²Ğ¸Ğµ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°. Ğ’Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ Ñ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ğ¾Ğ¼ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ Ğ¾Ğ¿ÑƒĞ±Ğ»Ğ¸ĞºĞ¾Ğ²Ğ°Ñ‚ÑŒ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ.',
  'post.createSupplierAccount': 'Ğ¡Ğ¾Ğ·Ğ´Ğ°Ñ‚ÑŒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°',
  'post.supplierOnly': 'Ğ¢Ğ¾Ğ»ÑŒĞºĞ¾ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ñ‹ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ²',
  'post.supplierOnlyBody':
    'Ğ’Ğ°Ñˆ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚ â€” {role}, Ğ¿Ğ¾ÑÑ‚Ğ¾Ğ¼Ñƒ API Ğ½Ğµ Ğ¿Ñ€Ğ¸Ğ¼ĞµÑ‚ Ğ¾Ñ‚ Ğ½ĞµĞ³Ğ¾ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ñ. Ğ”Ğ»Ñ Ñ€Ğ°Ğ·Ğ¼ĞµÑ‰ĞµĞ½Ğ¸Ñ Ñ‚Ğ¾Ğ²Ğ°Ñ€Ğ° Ğ½ÑƒĞ¶ĞµĞ½ Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»ÑŒ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°.',
  'post.myListings': 'ĞœĞ¾Ğ¸ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸',
  'post.loadErrorTitle': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ñ',
  'post.loadErrorBody': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ ÑÑ‚Ñƒ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ â€” Ğ¿Ğ¾Ğ²Ñ‚Ğ¾Ñ€Ğ¸Ñ‚Ğµ Ğ¿Ğ¾Ğ¿Ñ‹Ñ‚ĞºÑƒ Ğ¸Ğ»Ğ¸ Ğ²ĞµÑ€Ğ½Ğ¸Ñ‚ĞµÑÑŒ Ğº Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸ÑĞ¼.',
  'post.details': 'Ğ”Ğ°Ğ½Ğ½Ñ‹Ğµ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸',
  'post.newListing': 'ĞĞ¾Ğ²Ğ°Ñ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ñ',
  'post.requiredMark': '* Ğ¾Ğ±ÑĞ·Ğ°Ñ‚ĞµĞ»ÑŒĞ½Ğ¾',
  'post.lotName': 'ĞĞ°Ğ·Ğ²Ğ°Ğ½Ğ¸Ğµ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¸',
  'post.lotNamePlaceholder': 'Ğ½Ğ°Ğ¿Ñ€Ğ¸Ğ¼ĞµÑ€, Ğ¼ĞµĞ´Ğ½Ñ‹Ğ¹ ĞºĞ°Ñ‚Ğ¾Ğ´ ÑĞ¾Ñ€Ñ‚ A, 99,99%',
  'post.category': 'ĞšĞ°Ñ‚ĞµĞ³Ğ¾Ñ€Ğ¸Ñ',
  'post.originCountry': 'Ğ¡Ñ‚Ñ€Ğ°Ğ½Ğ° Ğ¿Ñ€Ğ¾Ğ¸ÑÑ…Ğ¾Ğ¶Ğ´ĞµĞ½Ğ¸Ñ',
  'post.notStated': 'ĞĞµ ÑƒĞºĞ°Ğ·Ğ°Ğ½Ğ¾',
  'post.description': 'ĞĞ¿Ğ¸ÑĞ°Ğ½Ğ¸Ğµ',
  'post.descriptionPlaceholder': 'Ğ¡Ğ¾Ñ€Ñ‚, ÑƒĞ¿Ğ°ĞºĞ¾Ğ²ĞºĞ°, Ğ˜Ğ½ĞºĞ¾Ñ‚ĞµÑ€Ğ¼Ñ, ÑÑ€Ğ¾Ğº, ÑĞµÑ€Ñ‚Ğ¸Ñ„Ğ¸ĞºĞ°Ñ‚Ñ‹â€¦',
  'post.descriptionHint': 'ĞŸĞ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ğ¸ Ñ€ĞµÑˆĞ°ÑÑ‚ Ğ¿Ğ¾ ÑÑ‚Ğ¾Ğ¼Ñƒ Ñ‚ĞµĞºÑÑ‚Ñƒ. Ğ£ĞºĞ°Ğ¶Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾ Ğ² Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¸ Ğ¸ ĞºĞ°Ğº Ğ¾Ğ½Ğ° Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ¶Ğ°ĞµÑ‚ÑÑ.',
  'post.unitPrice': 'Ğ¦ĞµĞ½Ğ° Ğ·Ğ° ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ',
  'post.currency': 'Ğ’Ğ°Ğ»ÑÑ‚Ğ°',
  'post.unit': 'Ğ•Ğ´Ğ¸Ğ½Ğ¸Ñ†Ğ°',
  'post.moq': 'ĞœĞ¸Ğ½Ğ¸Ğ¼Ğ°Ğ»ÑŒĞ½Ñ‹Ğ¹ Ğ·Ğ°ĞºĞ°Ğ· (MOQ)',
  'post.moqHint': 'ĞŸĞ¾ ÑƒĞ¼Ğ¾Ğ»Ñ‡Ğ°Ğ½Ğ¸Ñ 1.',
  'post.available': 'Ğ”Ğ¾ÑÑ‚ÑƒĞ¿Ğ½Ğ¾ ÑĞµĞ¹Ñ‡Ğ°Ñ',
  'post.availableHint': 'ĞŸĞ¾ ÑƒĞ¼Ğ¾Ğ»Ñ‡Ğ°Ğ½Ğ¸Ñ 0 â€” Ñ‚Ğ¾Ğ²Ğ°Ñ€, ĞºĞ¾Ñ‚Ğ¾Ñ€Ñ‹Ğ¹ Ğ¼Ğ¾Ğ¶ĞµÑ‚Ğµ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ ÑĞµĞ³Ğ¾Ğ´Ğ½Ñ.',
  'post.purity': 'Ğ§Ğ¸ÑÑ‚Ğ¾Ñ‚Ğ° / ÑĞ¾Ñ€Ñ‚',
  'post.purityPlaceholder': '99,99% / ÑĞ¾Ñ€Ñ‚ A',
  'post.optional': 'ĞĞµĞ¾Ğ±ÑĞ·Ğ°Ñ‚ĞµĞ»ÑŒĞ½Ğ¾.',
  'post.photoUrl': 'Ğ¡ÑÑ‹Ğ»ĞºĞ° Ğ½Ğ° Ñ„Ğ¾Ñ‚Ğ¾',
  'post.photoPlaceholder': 'https://â€¦/copper-cathode.jpg',
  'post.photoHintLead': 'Ğ—Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ° Ñ„Ğ°Ğ¹Ğ»Ğ¾Ğ² ĞµÑ‰Ñ‘ Ğ½Ğµ Ñ€ĞµĞ°Ğ»Ğ¸Ğ·Ğ¾Ğ²Ğ°Ğ½Ğ°.',
  'post.photoHintTail':
    'Ğ’ÑÑ‚Ğ°Ğ²ÑŒÑ‚Ğµ Ğ¿ÑƒĞ±Ğ»Ğ¸Ñ‡Ğ½ÑƒÑ ÑÑÑ‹Ğ»ĞºÑƒ Ğ½Ğ° Ñ„Ğ¾Ñ‚Ğ¾, Ğ¸ Ğ¾Ğ½Ğ° ÑĞ¾Ñ…Ñ€Ğ°Ğ½Ğ¸Ñ‚ÑÑ ĞºĞ°Ğº Ğ¸Ğ·Ğ¾Ğ±Ñ€Ğ°Ğ¶ĞµĞ½Ğ¸Ğµ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¸. ĞŸĞ°Ñ€Ñ‚Ğ¸Ğ¸ Ğ±ĞµĞ· Ñ„Ğ¾Ñ‚Ğ¾ Ğ¿Ğ¾ĞºĞ°Ğ·Ñ‹Ğ²Ğ°ÑÑ‚ Ğ¿Ñ€Ğ¾ÑÑ‚ÑƒÑ Ğ·Ğ°Ğ³Ğ»ÑƒÑˆĞºÑƒ.',
  'post.preview': 'ĞŸÑ€ĞµĞ´Ğ¿Ñ€Ğ¾ÑĞ¼Ğ¾Ñ‚Ñ€ â€” ĞµÑĞ»Ğ¸ Ğ½Ğ¸Ñ‡ĞµĞ³Ğ¾ Ğ½Ğµ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ğ»Ğ¾ÑÑŒ, ÑÑÑ‹Ğ»ĞºĞ° Ğ½Ğµ Ğ²ĞµĞ´Ñ‘Ñ‚ Ğ¿Ñ€ÑĞ¼Ğ¾ Ğ½Ğ° Ğ¸Ğ·Ğ¾Ğ±Ñ€Ğ°Ğ¶ĞµĞ½Ğ¸Ğµ.',
  'post.save': 'Ğ¡Ğ¾Ñ…Ñ€Ğ°Ğ½Ğ¸Ñ‚ÑŒ Ğ¸Ğ·Ğ¼ĞµĞ½ĞµĞ½Ğ¸Ñ',
  'post.saving': 'Ğ¡Ğ¾Ñ…Ñ€Ğ°Ğ½ĞµĞ½Ğ¸Ğµâ€¦',
  'post.errName': 'Ğ”Ğ°Ğ¹Ñ‚Ğµ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¸ Ğ½Ğ°Ğ·Ğ²Ğ°Ğ½Ğ¸Ğµ â€” Ğ¼Ğ¸Ğ½Ğ¸Ğ¼ÑƒĞ¼ 2 ÑĞ¸Ğ¼Ğ²Ğ¾Ğ»Ğ°.',
  'post.errCategory': 'Ğ’Ñ‹Ğ±ĞµÑ€Ğ¸Ñ‚Ğµ ĞºĞ°Ñ‚ĞµĞ³Ğ¾Ñ€Ğ¸Ñ.',
  'post.errUnit': 'Ğ£ĞºĞ°Ğ¶Ğ¸Ñ‚Ğµ ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ Ğ¿Ñ€Ğ¾Ğ´Ğ°Ğ¶Ğ¸ (Ñ‚, ĞºĞ³, ÑˆÑ‚â€¦).',
  'post.errPrice': 'Ğ¦ĞµĞ½Ğ° Ğ·Ğ° ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ Ğ´Ğ¾Ğ»Ğ¶Ğ½Ğ° Ğ±Ñ‹Ñ‚ÑŒ Ñ‡Ğ¸ÑĞ»Ğ¾Ğ¼ Ğ±Ğ¾Ğ»ÑŒÑˆĞµ Ğ½ÑƒĞ»Ñ.',
  'post.errMoq': 'MOQ Ğ´Ğ¾Ğ»Ğ¶ĞµĞ½ Ğ±Ñ‹Ñ‚ÑŒ Ñ‡Ğ¸ÑĞ»Ğ¾Ğ¼ Ğ±Ğ¾Ğ»ÑŒÑˆĞµ Ğ½ÑƒĞ»Ñ.',
  'post.errQty': 'Ğ”Ğ¾ÑÑ‚ÑƒĞ¿Ğ½Ğ¾Ğµ ĞºĞ¾Ğ»Ğ¸Ñ‡ĞµÑÑ‚Ğ²Ğ¾ Ğ½Ğµ Ğ¼Ğ¾Ğ¶ĞµÑ‚ Ğ±Ñ‹Ñ‚ÑŒ Ğ¾Ñ‚Ñ€Ğ¸Ñ†Ğ°Ñ‚ĞµĞ»ÑŒĞ½Ñ‹Ğ¼.',
  'post.errSave': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ ÑĞ¾Ñ…Ñ€Ğ°Ğ½Ğ¸Ñ‚ÑŒ ÑÑ‚Ñƒ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ñ.',
  'post.errCreate': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ñ€Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚ÑŒ ÑÑ‚Ñƒ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ñ.',
  'post.behaviour': 'ĞšĞ°Ğº Ñ€Ğ°Ğ±Ğ¾Ñ‚Ğ°ĞµÑ‚ ÑÑ‚Ğ° Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ñ',
  'post.behaviourBody':
    'Ğ Ğ°Ğ·Ğ¼ĞµÑ‰Ñ‘Ğ½Ğ½Ğ°Ñ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ ÑÑ€Ğ°Ğ·Ñƒ Ğ¿Ğ¾ÑĞ²Ğ»ÑĞµÑ‚ÑÑ Ğ² ĞºĞ°Ñ‚Ğ°Ğ»Ğ¾Ğ³Ğµ, Ğ¸ Ğ»ÑĞ±Ğ¾Ğ¹ Ğ²Ğ¾ÑˆĞµĞ´ÑˆĞ¸Ğ¹ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑŒ Ğ¼Ğ¾Ğ¶ĞµÑ‚ ĞµÑ‘ Ğ·Ğ°ĞºĞ°Ğ·Ğ°Ñ‚ÑŒ. ĞŸĞ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ğ¸ Ñ‚Ğ°ĞºĞ¶Ğµ Ğ¼Ğ¾Ğ³ÑƒÑ‚ Ğ¾Ñ‚ĞºÑ€Ñ‹Ñ‚ÑŒ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ Ğ½Ğ¸Ğ¶Ğµ Ğ²Ğ°ÑˆĞµĞ¹ Ñ†ĞµĞ½Ñ‹; Ğ²Ñ‹ Ğ¾Ñ‚Ğ²ĞµÑ‡Ğ°ĞµÑ‚Ğµ Ğ½Ğ° Ğ½Ğ¸Ñ… Ğ² Ñ€Ğ°Ğ·Ğ´ĞµĞ»Ğµ',
  'post.offersLink': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ',
  'post.provenance': 'ĞŸÑ€Ğ¾Ğ¸ÑÑ…Ğ¾Ğ¶Ğ´ĞµĞ½Ğ¸Ğµ',
  'post.platformListing': 'ĞŸĞ¾Ğ·Ğ¸Ñ†Ğ¸Ñ Ğ¿Ğ»Ğ¾Ñ‰Ğ°Ğ´ĞºĞ¸',
  'post.photo': 'Ğ¤Ğ¾Ñ‚Ğ¾',
  'post.urlOnly': 'Ğ¢Ğ¾Ğ»ÑŒĞºĞ¾ ÑÑÑ‹Ğ»ĞºĞ° â€” Ğ·Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ° Ğ½Ğµ Ñ€ĞµĞ°Ğ»Ğ¸Ğ·Ğ¾Ğ²Ğ°Ğ½Ğ°',
  'post.buyerPaysBy': 'Ğ¡Ğ¿Ğ¾ÑĞ¾Ğ± Ğ¾Ğ¿Ğ»Ğ°Ñ‚Ñ‹ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ñ',
  'post.bankTransfer': 'Ğ‘Ğ°Ğ½ĞºĞ¾Ğ²ÑĞºĞ¸Ğ¹ Ğ¿ĞµÑ€ĞµĞ²Ğ¾Ğ´',
  'post.noMetrics':
    'ĞĞ¸Ñ‡Ñ‚Ğ¾ Ğ½Ğ° ÑÑ‚Ğ¾Ğ¹ ÑÑ‚Ñ€Ğ°Ğ½Ğ¸Ñ†Ğµ Ğ½Ğµ Ğ¿Ğ¾ĞºĞ°Ğ·Ñ‹Ğ²Ğ°ĞµÑ‚ Ğ¿Ñ€Ğ¾ÑĞ¼Ğ¾Ñ‚Ñ€Ñ‹, Ñ€ĞµĞ¹Ñ‚Ğ¸Ğ½Ğ³Ğ¸ Ğ¸Ğ»Ğ¸ Ñ‡Ğ¸ÑĞ»Ğ¾ Ğ·Ğ°ĞºĞ°Ğ·Ğ¾Ğ² â€” ÑÑ‚Ğ¸ Ğ¿Ğ¾ĞºĞ°Ğ·Ğ°Ñ‚ĞµĞ»Ğ¸ Ğ¿Ğ¾ĞºĞ° Ğ½Ğµ Ğ¸Ğ·Ğ¼ĞµÑ€ÑÑÑ‚ÑÑ, Ğ¿Ğ¾ÑÑ‚Ğ¾Ğ¼Ñƒ Ğ½Ğµ Ğ¾Ñ‚Ğ¾Ğ±Ñ€Ğ°Ğ¶Ğ°ÑÑ‚ÑÑ.',

  'offers.title': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ¿Ğ¾ Ğ²Ğ°ÑˆĞµĞ¼Ñƒ Ñ‚Ğ¾Ğ²Ğ°Ñ€Ñƒ',
  'offers.sub': 'ĞŸĞ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ğ¸, Ñ‚Ğ¾Ñ€Ğ³ÑƒÑÑ‰Ğ¸ĞµÑÑ Ğ¿Ğ¾ Ğ²Ğ°ÑˆĞ¸Ğ¼ Ğ¿Ğ°Ñ€Ñ‚Ğ¸ÑĞ¼',
  'offers.signInSub': 'ĞŸĞ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ğ¸, Ñ‚Ğ¾Ñ€Ğ³ÑƒÑÑ‰Ğ¸ĞµÑÑ Ğ¿Ğ¾ Ğ²Ğ°ÑˆĞ¸Ğ¼ Ğ¿Ğ°Ñ€Ñ‚Ğ¸ÑĞ¼',
  'offers.notSignedIn': 'Ğ’Ñ‹ Ğ½Ğµ Ğ²Ğ¾ÑˆĞ»Ğ¸',
  'offers.notSignedInBody': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ²Ğ¸Ğ´Ğ½Ñ‹ Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ñ Ğ¸ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºÑƒ Ğ¿Ğ¾ Ğ½Ğ¸Ğ¼. Ğ’Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ Ğ¾Ñ‚Ğ²ĞµÑ‚Ğ¸Ñ‚ÑŒ.',
  'offers.createSupplierAccount': 'Ğ¡Ğ¾Ğ·Ğ´Ğ°Ñ‚ÑŒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°',
  'offers.supplierOnly': 'Ğ¢Ğ¾Ğ»ÑŒĞºĞ¾ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ñ‹ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ²',
  'offers.supplierOnlyBody':
    'Ğ’Ğ°Ñˆ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚ â€” {role}, Ğ¿Ğ¾Ğ´ Ğ½Ğ¸Ğ¼ Ğ½ĞµÑ‚ Ñ‚Ğ¾Ğ²Ğ°Ñ€Ğ°, Ğ¿Ğ¾ÑÑ‚Ğ¾Ğ¼Ñƒ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ½Ğµ Ğ¿Ğ¾ÑÑ‚ÑƒĞ¿Ğ°ÑÑ‚. Ğ’Ğ°ÑˆĞ¸ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ ĞºĞ°Ğº Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ñ Ğ½Ğ°Ñ…Ğ¾Ğ´ÑÑ‚ÑÑ Ğ½Ğ° ÑÑ‚Ğ¾Ñ€Ğ¾Ğ½Ğµ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ñ.',
  'offers.browseStock': 'Ğ¡Ğ¼Ğ¾Ñ‚Ñ€ĞµÑ‚ÑŒ Ğ³Ğ¾Ñ‚Ğ¾Ğ²Ñ‹Ğ¹ ÑĞºĞ»Ğ°Ğ´',
  'offers.subLoading': 'Ğ—Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ° Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğ¹â€¦',
  'offers.subCount': 'Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğ¹: {n} Ğ¿Ğ¾ Ğ²Ğ°ÑˆĞ¸Ğ¼ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸ÑĞ¼',
  'offers.awaiting': 'Ğ¶Ğ´ÑƒÑ‚ Ğ²Ğ°ÑˆĞµĞ³Ğ¾ Ğ¾Ñ‚Ğ²ĞµÑ‚Ğ°',
  'offers.decided': 'Ñ€ĞµÑˆĞµĞ½Ğ¾',
  'offers.acceptCreates': 'ĞŸÑ€Ğ¸Ğ½ÑÑ‚Ğ¸Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ ÑĞ¾Ğ·Ğ´Ğ°Ñ‘Ñ‚ Ğ·Ğ°ĞºĞ°Ğ·; Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑŒ Ğ¿Ğ»Ğ°Ñ‚Ğ¸Ñ‚ Ğ±Ğ°Ğ½ĞºĞ¾Ğ²ÑĞºĞ¸Ğ¼ Ğ¿ĞµÑ€ĞµĞ²Ğ¾Ğ´Ğ¾Ğ¼.',
  'offers.filterAwaiting': 'Ğ–Ğ´ÑƒÑ‚ Ğ¾Ñ‚Ğ²ĞµÑ‚Ğ° ({n})',
  'offers.filterDecided': 'Ğ ĞµÑˆÑ‘Ğ½Ğ½Ñ‹Ğµ ({n})',
  'offers.counterNote': 'Ğ’ÑÑ‚Ñ€ĞµÑ‡Ğ½Ñ‹Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ¾Ñ‚ĞºÑ€Ñ‹Ğ²Ğ°ÑÑ‚ Ğ½Ğ¾Ğ²Ğ¾Ğµ ÑĞ²ÑĞ·Ğ°Ğ½Ğ½Ğ¾Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ; Ğ¸ÑÑ…Ğ¾Ğ´Ğ½Ñ‹Ğµ ÑƒÑĞ»Ğ¾Ğ²Ğ¸Ñ Ğ¾ÑÑ‚Ğ°ÑÑ‚ÑÑ Ğ² Ğ¸ÑÑ‚Ğ¾Ñ€Ğ¸Ğ¸.',
  'offers.loadErrorTitle': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ',
  'offers.loadErrorBody': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ¿Ğ¾ Ğ²Ğ°ÑˆĞµĞ¼Ñƒ Ñ‚Ğ¾Ğ²Ğ°Ñ€Ñƒ â€” Ğ¿Ğ¾Ğ²Ñ‚Ğ¾Ñ€Ğ¸Ñ‚Ğµ Ğ¿Ğ¾Ğ¿Ñ‹Ñ‚ĞºÑƒ.',
  'offers.emptyTitle': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğ¹ Ğ¿Ğ¾ĞºĞ° Ğ½ĞµÑ‚',
  'offers.emptyBody':
    'ĞšĞ¾Ğ³Ğ´Ğ° Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑŒ Ñ‚Ğ¾Ñ€Ğ³ÑƒĞµÑ‚ÑÑ Ğ¿Ğ¾ Ğ¾Ğ´Ğ½Ğ¾Ğ¹ Ğ¸Ğ· Ğ²Ğ°ÑˆĞ¸Ñ… Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¹, ÑÑ‚Ğ¾ Ğ¿Ğ¾ÑĞ²Ğ»ÑĞµÑ‚ÑÑ Ğ·Ğ´ĞµÑÑŒ Ñ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ½Ğ¾Ğ¹ Ñ†ĞµĞ½Ğ¾Ğ¹ Ğ¸ Ğ½ÑƒĞ¶Ğ½Ñ‹Ğ¼ ĞºĞ¾Ğ»Ğ¸Ñ‡ĞµÑÑ‚Ğ²Ğ¾Ğ¼. ĞœĞ¾Ğ¶Ğ½Ğ¾ Ğ¿Ñ€Ğ¸Ğ½ÑÑ‚ÑŒ, Ğ¾Ñ‚ĞºĞ»Ğ¾Ğ½Ğ¸Ñ‚ÑŒ Ğ¸Ğ»Ğ¸ Ğ¾Ñ‚Ğ²ĞµÑ‚Ğ¸Ñ‚ÑŒ ÑĞ²Ğ¾ĞµĞ¹ Ñ†ĞµĞ½Ğ¾Ğ¹.',
  'offers.seeListings': 'ĞœĞ¾Ğ¸ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸',
  'offers.postMore': '+ Ğ Ğ°Ğ·Ğ¼ĞµÑÑ‚Ğ¸Ñ‚ÑŒ ĞµÑ‰Ñ‘ Ñ‚Ğ¾Ğ²Ğ°Ñ€',
  'offers.noneAwaiting': 'ĞĞ¸Ñ‡ĞµĞ³Ğ¾ Ğ½Ğµ Ğ¶Ğ´Ñ‘Ñ‚ Ğ²Ğ°ÑˆĞµĞ³Ğ¾ Ğ¾Ñ‚Ğ²ĞµÑ‚Ğ°',
  'offers.noneDecided': 'Ğ ĞµÑˆÑ‘Ğ½Ğ½Ñ‹Ñ… Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğ¹ Ğ¿Ğ¾ĞºĞ° Ğ½ĞµÑ‚',
  'offers.noneAwaitingBody': 'ĞĞ° Ğ²ÑĞµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ¿Ğ¾ Ğ²Ğ°ÑˆĞµĞ¼Ñƒ Ñ‚Ğ¾Ğ²Ğ°Ñ€Ñƒ Ğ¾Ñ‚Ğ²ĞµÑ‡ĞµĞ½Ğ¾. ĞŸĞµÑ€ĞµĞ¹Ğ´Ğ¸Ñ‚Ğµ Ğ² Â«Ğ ĞµÑˆÑ‘Ğ½Ğ½Ñ‹ĞµÂ», Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ Ğ¿Ğ¾ÑĞ¼Ğ¾Ñ‚Ñ€ĞµÑ‚ÑŒ Ğ¸Ñ….',
  'offers.noneDecidedBody': 'ĞŸÑ€Ğ¸Ğ½ÑÑ‚Ñ‹Ğµ Ğ¸ Ğ¾Ñ‚ĞºĞ»Ğ¾Ğ½Ñ‘Ğ½Ğ½Ñ‹Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ñ…Ñ€Ğ°Ğ½ÑÑ‚ÑÑ Ğ·Ğ´ĞµÑÑŒ ĞºĞ°Ğº Ğ¸ÑÑ‚Ğ¾Ñ€Ğ¸Ñ.',
  'offers.count': 'Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğ¹: {n}',
  'offers.col.listing': 'ĞŸĞ¾Ğ·Ğ¸Ñ†Ğ¸Ñ',
  'offers.col.buyer': 'ĞŸĞ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑŒ',
  'offers.col.quantity': 'ĞšĞ¾Ğ»Ğ¸Ñ‡ĞµÑÑ‚Ğ²Ğ¾',
  'offers.col.theirPrice': 'Ğ˜Ñ… Ñ†ĞµĞ½Ğ°',
  'offers.col.status': 'Ğ¡Ñ‚Ğ°Ñ‚ÑƒÑ',
  'offers.col.received': 'ĞŸĞ¾Ğ»ÑƒÑ‡ĞµĞ½Ğ¾',
  'offers.decidedLabel': 'Ğ ĞµÑˆĞµĞ½Ğ¾',
  'offers.counter': 'Ğ’ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ',
  'offers.accept': 'ĞŸÑ€Ğ¸Ğ½ÑÑ‚ÑŒ',
  'offers.reject': 'ĞÑ‚ĞºĞ»Ğ¾Ğ½Ğ¸Ñ‚ÑŒ',
  'offers.offerRef': 'Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ #{id}',
  'offers.answersOffer': 'Ğ¾Ñ‚Ğ²ĞµÑ‚ Ğ½Ğ° Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ #{id}',
  'offers.demoNoteLead': 'Ğ¡Ñ‚Ñ€Ğ¾ĞºĞ° Ñ Ğ¼ĞµÑ‚ĞºĞ¾Ğ¹',
  'offers.demoNoteTail':
    'Ğ¾Ñ‚Ğ½Ğ¾ÑĞ¸Ñ‚ÑÑ Ğº Ğ´ĞµĞ¼Ğ¾Ğ½ÑÑ‚Ñ€Ğ°Ñ†Ğ¸Ğ¾Ğ½Ğ½Ğ¾Ğ¹ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¸, Ğ° Ğ½Ğµ Ğº Ğ²Ğ°ÑˆĞµĞ¼Ñƒ Ñ‚Ğ¾Ğ²Ğ°Ñ€Ñƒ. ĞŸÑ€Ğ¸Ğ½ÑÑ‚Ğ¸Ğµ Ğ²ÑÑ‘ Ñ€Ğ°Ğ²Ğ½Ğ¾ ÑĞ¾Ğ·Ğ´Ğ°Ñ‘Ñ‚ Ñ€ĞµĞ°Ğ»ÑŒĞ½Ñ‹Ğ¹ Ğ·Ğ°ĞºĞ°Ğ· â€” Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ÑŒÑ‚Ğµ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ Ğ¿ĞµÑ€ĞµĞ´ Ñ€ĞµÑˆĞµĞ½Ğ¸ĞµĞ¼.',
  'offers.counterTitle': 'Ğ’ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ #{id}',
  'offers.counterBody':
    '{buyer} Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶Ğ¸Ğ» {price} Ğ·Ğ° {qty} Ğ¿Ğ¾ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸ {product}. Ğ’Ğ°Ñˆ Ğ¾Ñ‚Ğ²ĞµÑ‚ ÑÑ‚Ğ°Ğ½ĞµÑ‚ Ğ½Ğ¾Ğ²Ñ‹Ğ¼ ÑĞ²ÑĞ·Ğ°Ğ½Ğ½Ñ‹Ğ¼ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸ĞµĞ¼; ÑƒÑĞ»Ğ¾Ğ²Ğ¸Ñ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ñ Ğ¾ÑÑ‚Ğ°ÑÑ‚ÑÑ Ğ² Ğ¸ÑÑ‚Ğ¾Ñ€Ğ¸Ğ¸.',
  'offers.counterPrice': 'Ğ’Ğ°ÑˆĞ° Ñ†ĞµĞ½Ğ° Ğ·Ğ° ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ',
  'offers.perUnit': '{currency} Ğ·Ğ° ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ',
  'offers.counterQty': 'ĞšĞ¾Ğ»Ğ¸Ñ‡ĞµÑÑ‚Ğ²Ğ¾',
  'offers.counterQtyHint': 'ĞÑÑ‚Ğ°Ğ²ÑŒÑ‚Ğµ Ğ±ĞµĞ· Ğ¸Ğ·Ğ¼ĞµĞ½ĞµĞ½Ğ¸Ğ¹, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ ÑĞ¾Ñ…Ñ€Ğ°Ğ½Ğ¸Ñ‚ÑŒ ĞºĞ¾Ğ»Ğ¸Ñ‡ĞµÑÑ‚Ğ²Ğ¾ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ñ.',
  'offers.counterNotes': 'ĞŸÑ€Ğ¸Ğ¼ĞµÑ‡Ğ°Ğ½Ğ¸Ğµ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ñ',
  'offers.counterNotesPlaceholder': 'Ğ¡Ñ€Ğ¾Ğº, ÑƒĞ¿Ğ°ĞºĞ¾Ğ²ĞºĞ°, Ğ˜Ğ½ĞºĞ¾Ñ‚ĞµÑ€Ğ¼Ñ, ÑÑ€Ğ¾Ğº Ğ´ĞµĞ¹ÑÑ‚Ğ²Ğ¸Ñ Ñ†ĞµĞ½Ñ‹â€¦',
  'offers.sendCounter': 'ĞÑ‚Ğ¿Ñ€Ğ°Ğ²Ğ¸Ñ‚ÑŒ Ğ²ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ',
  'offers.sending': 'ĞÑ‚Ğ¿Ñ€Ğ°Ğ²ĞºĞ°â€¦',
  'offers.counterErrPrice': 'Ğ’Ğ°ÑˆĞ° Ğ²ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ°Ñ Ñ†ĞµĞ½Ğ° Ğ´Ğ¾Ğ»Ğ¶Ğ½Ğ° Ğ±Ñ‹Ñ‚ÑŒ Ñ‡Ğ¸ÑĞ»Ğ¾Ğ¼ Ğ±Ğ¾Ğ»ÑŒÑˆĞµ Ğ½ÑƒĞ»Ñ.',
  'offers.counterErrQty': 'ĞšĞ¾Ğ»Ğ¸Ñ‡ĞµÑÑ‚Ğ²Ğ¾ Ğ´Ğ¾Ğ»Ğ¶Ğ½Ğ¾ Ğ±Ñ‹Ñ‚ÑŒ Ñ‡Ğ¸ÑĞ»Ğ¾Ğ¼ Ğ±Ğ¾Ğ»ÑŒÑˆĞµ Ğ½ÑƒĞ»Ñ.',
  'offers.counterErr': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ¾Ñ‚Ğ¿Ñ€Ğ°Ğ²Ğ¸Ñ‚ÑŒ Ğ²ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ.',
  'offers.counterDone': 'Ğ’ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ Ğ¾Ñ‚Ğ¿Ñ€Ğ°Ğ²Ğ»ĞµĞ½Ğ¾. Ğ˜ÑÑ…Ğ¾Ğ´Ğ½Ğ¾Ğµ Ğ¿Ğ¾Ğ¼ĞµÑ‡ĞµĞ½Ğ¾ ĞºĞ°Ğº Ğ¾Ñ‚Ğ²ĞµÑ‡ĞµĞ½Ğ½Ğ¾Ğµ, Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑŒ ÑƒĞ²ĞµĞ´Ğ¾Ğ¼Ğ»Ñ‘Ğ½.',
  'offers.acceptTitle': 'ĞŸÑ€Ğ¸Ğ½ÑÑ‚ÑŒ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ #{id}?',
  'offers.listing': 'ĞŸĞ¾Ğ·Ğ¸Ñ†Ğ¸Ñ',
  'offers.buyer': 'ĞŸĞ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑŒ',
  'offers.quantity': 'ĞšĞ¾Ğ»Ğ¸Ñ‡ĞµÑÑ‚Ğ²Ğ¾',
  'offers.unitPrice': 'Ğ¦ĞµĞ½Ğ° Ğ·Ğ° ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ',
  'offers.offerValue': 'Ğ¡ÑƒĞ¼Ğ¼Ğ° Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ',
  'offers.acceptBodyLead': 'ĞŸÑ€Ğ¸Ğ½ÑÑ‚Ğ¸Ğµ ÑĞ¾Ğ·Ğ´Ğ°Ñ‘Ñ‚ Ğ·Ğ°ĞºĞ°Ğ·.',
  'offers.acceptBodyBank': 'ĞŸĞ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑŒ Ğ±ĞµÑ€Ñ‘Ñ‚ Ğ¾Ğ±ÑĞ·Ğ°Ñ‚ĞµĞ»ÑŒÑÑ‚Ğ²Ğ¾ Ğ¸ Ğ¿Ğ»Ğ°Ñ‚Ğ¸Ñ‚ Ñ‡ĞµÑ€ĞµĞ·',
  'offers.acceptBodyTail':
    'â€” Ğ¿Ğ»Ğ¾Ñ‰Ğ°Ğ´ĞºĞ° Ğ½Ğµ Ğ¿Ñ€Ğ¸Ğ½Ğ¸Ğ¼Ğ°ĞµÑ‚ Ğ¾Ğ¿Ğ»Ğ°Ñ‚Ñƒ ĞºĞ°Ñ€Ñ‚Ğ¾Ğ¹. Ğ’Ñ‹ Ğ²Ñ‹ÑÑ‚Ğ°Ğ²Ğ»ÑĞµÑ‚Ğµ ÑÑ‡Ñ‘Ñ‚-Ğ¿Ñ€Ğ¾Ñ„Ğ¾Ñ€Ğ¼Ñƒ Ğ¸ Ğ¿Ğ¾Ğ´Ñ‚Ğ²ĞµÑ€Ğ¶Ğ´Ğ°ĞµÑ‚Ğµ Ğ¿ĞµÑ€ĞµĞ²Ğ¾Ğ´ Ğ¿Ñ€Ğ¸ Ğ¿Ğ¾ÑÑ‚ÑƒĞ¿Ğ»ĞµĞ½Ğ¸Ğ¸; Ğ·Ğ°Ñ‚ĞµĞ¼ Ğ·Ğ°ĞºĞ°Ğ· Ğ¿ĞµÑ€ĞµÑ…Ğ¾Ğ´Ğ¸Ñ‚ Ğº Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·ĞºĞµ. Ğ ĞµÑˆĞµĞ½Ğ¸Ğµ Ğ¾ĞºĞ¾Ğ½Ñ‡Ğ°Ñ‚ĞµĞ»ÑŒĞ½Ğ¾Ğµ: Ğ¿Ñ€Ğ¸Ğ½ÑÑ‚Ğ¾Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ Ğ½ĞµĞ»ÑŒĞ·Ñ Ğ¿ĞµÑ€ĞµÑĞ¼Ğ¾Ñ‚Ñ€ĞµÑ‚ÑŒ.',
  'offers.acceptCta': 'ĞŸÑ€Ğ¸Ğ½ÑÑ‚ÑŒ Ğ¸ ÑĞ¾Ğ·Ğ´Ğ°Ñ‚ÑŒ Ğ·Ğ°ĞºĞ°Ğ·',
  'offers.accepting': 'ĞŸÑ€Ğ¸Ğ½ÑÑ‚Ğ¸Ğµâ€¦',
  'offers.acceptErr': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ¿Ñ€Ğ¸Ğ½ÑÑ‚ÑŒ ÑÑ‚Ğ¾ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ.',
  'offers.acceptDone': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ #{id} Ğ¿Ñ€Ğ¸Ğ½ÑÑ‚Ğ¾. Ğ¡Ğ¾Ğ·Ğ´Ğ°Ğ½ Ğ·Ğ°ĞºĞ°Ğ· Ğ´Ğ»Ñ {buyer}.',
  'offers.rejectTitle': 'ĞÑ‚ĞºĞ»Ğ¾Ğ½Ğ¸Ñ‚ÑŒ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ #{id}?',
  'offers.rejectBody':
    'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ {buyer} Ğ½Ğ° {price} Ğ¿Ğ¾ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸ {product} Ğ·Ğ°ĞºÑ€Ñ‹Ğ²Ğ°ĞµÑ‚ÑÑ. ĞÑ‚ĞºĞ»Ğ¾Ğ½ĞµĞ½Ğ¸Ğµ Ğ¾ĞºĞ¾Ğ½Ñ‡Ğ°Ñ‚ĞµĞ»ÑŒĞ½Ğ¾Ğµ â€” Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑŒ Ğ½Ğµ Ğ¼Ğ¾Ğ¶ĞµÑ‚ Ğ²Ğ¾Ğ·Ğ¾Ğ±Ğ½Ğ¾Ğ²Ğ¸Ñ‚ÑŒ ÑÑ‚Ğ¾ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ, Ğ½Ğ¾ Ğ¼Ğ¾Ğ¶ĞµÑ‚ Ğ¾Ñ‚ĞºÑ€Ñ‹Ñ‚ÑŒ Ğ½Ğ¾Ğ²Ğ¾Ğµ.',
  'offers.rejectCta': 'ĞÑ‚ĞºĞ»Ğ¾Ğ½Ğ¸Ñ‚ÑŒ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ',
  'offers.rejecting': 'ĞÑ‚ĞºĞ»Ğ¾Ğ½ĞµĞ½Ğ¸Ğµâ€¦',
  'offers.rejectErr': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ¾Ñ‚ĞºĞ»Ğ¾Ğ½Ğ¸Ñ‚ÑŒ ÑÑ‚Ğ¾ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ.',
  'offers.rejectDone': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ #{id} Ğ¾Ñ‚ĞºĞ»Ğ¾Ğ½ĞµĞ½Ğ¾.',

  'myoffers.titleSupplier': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ¿Ğ¾ Ğ¼Ğ¾ĞµĞ¼Ñƒ Ñ‚Ğ¾Ğ²Ğ°Ñ€Ñƒ',
  'myoffers.titleAdmin': 'Ğ’ÑĞµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ',
  'myoffers.titleBuyer': 'ĞœĞ¾Ğ¸ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ',
  'myoffers.subSupplier': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ, ĞºĞ¾Ñ‚Ğ¾Ñ€Ñ‹Ğµ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ğ¸ ÑĞ´ĞµĞ»Ğ°Ğ»Ğ¸ Ğ¿Ğ¾ Ğ²Ğ°ÑˆĞµĞ¼Ñƒ Ñ‚Ğ¾Ğ²Ğ°Ñ€Ñƒ. ĞŸĞ¾ ĞºĞ°Ğ¶Ğ´Ğ¾Ğ¼Ñƒ Ğ¼Ğ¾Ğ¶Ğ½Ğ¾ Ğ´Ğ°Ñ‚ÑŒ Ğ²ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ, Ğ¿Ñ€Ğ¸Ğ½ÑÑ‚ÑŒ Ğ¸Ğ»Ğ¸ Ğ¾Ñ‚ĞºĞ»Ğ¾Ğ½Ğ¸Ñ‚ÑŒ.',
  'myoffers.subAdmin': 'Ğ’ÑĞµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ½Ğ° Ğ¿Ğ»Ğ¾Ñ‰Ğ°Ğ´ĞºĞµ, ÑĞ½Ğ°Ñ‡Ğ°Ğ»Ğ° Ğ½Ğ¾Ğ²Ñ‹Ğµ.',
  'myoffers.subBuyer': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ, ĞºĞ¾Ñ‚Ğ¾Ñ€Ñ‹Ğµ Ğ²Ñ‹ ÑĞ´ĞµĞ»Ğ°Ğ»Ğ¸ Ğ¿Ğ¾ Ğ³Ğ¾Ñ‚Ğ¾Ğ²Ğ¾Ğ¼Ñƒ ÑĞºĞ»Ğ°Ğ´Ñƒ. ĞŸĞ¾ ĞºĞ°Ğ¶Ğ´Ğ¾Ğ¼Ñƒ Ğ¼Ğ¾Ğ¶Ğ½Ğ¾ Ğ´Ğ°Ñ‚ÑŒ Ğ²ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ, Ğ¿Ñ€Ğ¸Ğ½ÑÑ‚ÑŒ Ğ¸Ğ»Ğ¸ Ğ¾Ñ‚ĞºĞ»Ğ¾Ğ½Ğ¸Ñ‚ÑŒ.',
  'myoffers.signInSub': 'Ğ’Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ ÑƒĞ²Ğ¸Ğ´ĞµÑ‚ÑŒ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ, Ğ¿Ğ¾ ĞºĞ¾Ñ‚Ğ¾Ñ€Ñ‹Ğ¼ Ğ²Ñ‹ Ğ²ĞµĞ´Ñ‘Ñ‚Ğµ Ğ¿ĞµÑ€ĞµĞ³Ğ¾Ğ²Ğ¾Ñ€Ñ‹',
  'myoffers.notSignedIn': 'Ğ’Ñ‹ Ğ½Ğµ Ğ²Ğ¾ÑˆĞ»Ğ¸',
  'myoffers.notSignedInBody': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ²Ğ¸Ğ´Ğ½Ñ‹ Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ğ´Ğ²ÑƒĞ¼ ÑÑ‚Ğ¾Ñ€Ğ¾Ğ½Ğ°Ğ¼: Ğ²Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ Ğ¾Ñ‚ĞºÑ€Ñ‹Ñ‚ÑŒ, Ğ´Ğ°Ñ‚ÑŒ Ğ²ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ Ğ¸Ğ»Ğ¸ Ğ¿Ñ€Ğ¸Ğ½ÑÑ‚ÑŒ.',
  'myoffers.loadErrorTitle': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ',
  'myoffers.loadErrorBody': 'API Ğ½Ğµ Ğ²ĞµÑ€Ğ½ÑƒĞ» Ğ²Ğ°ÑˆĞ¸ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ â€” Ğ¿Ğ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ ÑĞ½Ğ¾Ğ²Ğ°.',
  'myoffers.trying': 'ĞŸÑ€Ğ¾Ğ±ÑƒĞµĞ¼â€¦',
  'myoffers.emptyTitle': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğ¹ Ğ¿Ğ¾ĞºĞ° Ğ½ĞµÑ‚',
  'myoffers.emptySupplier': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ĞµĞ¹ Ğ¿Ğ¾ Ğ²Ğ°ÑˆĞ¸Ğ¼ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸ÑĞ¼ Ğ¿Ğ¾ÑĞ²ÑÑ‚ÑÑ Ğ·Ğ´ĞµÑÑŒ â€” Ğ¸Ñ… Ğ¼Ğ¾Ğ¶Ğ½Ğ¾ Ğ¿Ñ€Ğ¸Ğ½ÑÑ‚ÑŒ Ğ¸Ğ»Ğ¸ Ğ¿ĞµÑ€ĞµĞ±Ğ¸Ñ‚ÑŒ Ğ²ÑÑ‚Ñ€ĞµÑ‡Ğ½Ñ‹Ğ¼.',
  'myoffers.emptyAdmin': 'ĞĞ° Ğ¿Ğ»Ğ¾Ñ‰Ğ°Ğ´ĞºĞµ Ğ¿Ğ¾ĞºĞ° Ğ½Ğµ Ğ¾Ñ‚ĞºÑ€Ñ‹Ñ‚Ğ¾ Ğ½Ğ¸ Ğ¾Ğ´Ğ½Ğ¾Ğ³Ğ¾ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ.',
  'myoffers.emptyBuyer': 'ĞÑ‚ĞºÑ€Ğ¾Ğ¹Ñ‚Ğµ Ğ½ÑƒĞ¶Ğ½ÑƒÑ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ Ğ¸ ÑĞ´ĞµĞ»Ğ°Ğ¹Ñ‚Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ â€” Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸Ğº Ğ¼Ğ¾Ğ¶ĞµÑ‚ Ğ´Ğ°Ñ‚ÑŒ Ğ²ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ, Ğ¿Ñ€Ğ¸Ğ½ÑÑ‚ÑŒ Ğ¸Ğ»Ğ¸ Ğ¾Ñ‚ĞºĞ»Ğ¾Ğ½Ğ¸Ñ‚ÑŒ ĞµĞ³Ğ¾.',
  'myoffers.browseStock': 'Ğ¡Ğ¼Ğ¾Ñ‚Ñ€ĞµÑ‚ÑŒ Ğ³Ğ¾Ñ‚Ğ¾Ğ²Ñ‹Ğ¹ ÑĞºĞ»Ğ°Ğ´',
  'myoffers.count': 'Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğ¹: {n}',
  'myoffers.stillOpen': 'ĞµÑ‰Ñ‘ Ğ¾Ñ‚ĞºÑ€Ñ‹Ñ‚Ğ¾: {n}',
  'myoffers.col.offer': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ',
  'myoffers.col.counterparty': 'ĞšĞ¾Ğ½Ñ‚Ñ€Ğ°Ğ³ĞµĞ½Ñ‚',
  'myoffers.col.quantity': 'ĞšĞ¾Ğ»Ğ¸Ñ‡ĞµÑÑ‚Ğ²Ğ¾',
  'myoffers.col.unitPrice': 'Ğ¦ĞµĞ½Ğ° Ğ·Ğ° ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ',
  'myoffers.col.status': 'Ğ¡Ñ‚Ğ°Ñ‚ÑƒÑ',
  'myoffers.col.date': 'Ğ”Ğ°Ñ‚Ğ°',
  'myoffers.col.action': 'Ğ”ĞµĞ¹ÑÑ‚Ğ²Ğ¸Ğµ',
  'myoffers.counterTo': 'Ğ²ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ Ğº #{id}',
  'myoffers.offerRef': 'Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ #{id}',
  'myoffers.answersOffer': 'Ğ¾Ñ‚Ğ²ĞµÑ‡Ğ°ĞµÑ‚ Ğ½Ğ° Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ #{id}',
  'myoffers.seatSupplier': 'Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸Ğº',
  'myoffers.seatBuyer': 'Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑŒ',
  'myoffers.noAction': 'Ğ”ĞµĞ¹ÑÑ‚Ğ²Ğ¸Ğ¹ Ğ±Ğ¾Ğ»ÑŒÑˆĞµ Ğ½ĞµÑ‚',
  'myoffers.confirmReject': 'ĞŸĞ¾Ğ´Ñ‚Ğ²ĞµÑ€Ğ´Ğ¸Ñ‚ÑŒ Ğ¾Ñ‚ĞºĞ»Ğ¾Ğ½ĞµĞ½Ğ¸Ğµ',
  'myoffers.counter': 'Ğ’ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ',
  'myoffers.accept': 'ĞŸÑ€Ğ¸Ğ½ÑÑ‚ÑŒ',
  'myoffers.reject': 'ĞÑ‚ĞºĞ»Ğ¾Ğ½Ğ¸Ñ‚ÑŒ',
  'myoffers.counterTitle': 'Ğ’ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ #{id}',
  'myoffers.counterDoneTitle': 'Ğ’ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ Ğ¾Ñ‚Ğ¿Ñ€Ğ°Ğ²Ğ»ĞµĞ½Ğ¾',
  'myoffers.counterDoneBody': 'Ğ’Ğ°ÑˆĞµ Ğ²ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ Ñƒ Ğ´Ñ€ÑƒĞ³Ğ¾Ğ¹ ÑÑ‚Ğ¾Ñ€Ğ¾Ğ½Ñ‹',
  'myoffers.backToOffers': 'ĞĞ°Ğ·Ğ°Ğ´ Ğº Ğ¼Ğ¾Ğ¸Ğ¼ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸ÑĞ¼',
  'myoffers.counterLead': '{product} Â· Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ #{id} Â· {qty} Ğ¿Ğ¾ Ñ†ĞµĞ½Ğµ {price} Ğ·Ğ° ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ',
  'myoffers.perUnit': 'Ğ’ {currency}, Ğ·Ğ° ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ.',
  'myoffers.inCurrency': 'Ğ’ {currency}, Ğ·Ğ° ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ.',
  'myoffers.originally': 'Ğ˜Ğ·Ğ½Ğ°Ñ‡Ğ°Ğ»ÑŒĞ½Ğ¾ {qty}.',
  'myoffers.messageLabel': 'Ğ¡Ğ¾Ğ¾Ğ±Ñ‰ĞµĞ½Ğ¸Ğµ Ğ´Ñ€ÑƒĞ³Ğ¾Ğ¹ ÑÑ‚Ğ¾Ñ€Ğ¾Ğ½Ğµ',
  'myoffers.messagePlaceholder': 'Ğ¡Ñ€Ğ¾ĞºĞ¸, ÑƒĞ¿Ğ°ĞºĞ¾Ğ²ĞºĞ°, ÑƒÑĞ»Ğ¾Ğ²Ğ¸Ñ Ğ¾Ğ¿Ğ»Ğ°Ñ‚Ñ‹â€¦',
  'myoffers.sendCounter': 'ĞÑ‚Ğ¿Ñ€Ğ°Ğ²Ğ¸Ñ‚ÑŒ Ğ²ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ',
  'myoffers.sending': 'ĞÑ‚Ğ¿Ñ€Ğ°Ğ²ĞºĞ°â€¦',
  'myoffers.errInvalid': 'Ğ£ĞºĞ°Ğ¶Ğ¸Ñ‚Ğµ Ñ†ĞµĞ½Ñƒ Ğ·Ğ° ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ Ğ¸ ĞºĞ¾Ğ»Ğ¸Ñ‡ĞµÑÑ‚Ğ²Ğ¾ Ğ±Ğ¾Ğ»ÑŒÑˆĞµ Ğ½ÑƒĞ»Ñ.',
  'myoffers.errCounter': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ¾Ñ‚Ğ¿Ñ€Ğ°Ğ²Ğ¸Ñ‚ÑŒ Ğ²ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ â€” Ğ¿Ğ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ ÑĞ½Ğ¾Ğ²Ğ°.',
  'myoffers.acceptTitle': 'ĞŸÑ€Ğ¸Ğ½ÑÑ‚ÑŒ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ #{id}',
  'myoffers.acceptLead': '{product} Â· {qty} Ğ¿Ğ¾ {price} Ğ·Ğ° ĞµĞ´Ğ¸Ğ½Ğ¸Ñ†Ñƒ',
  'myoffers.acceptStripeLead': 'ĞŸÑ€Ğ¸Ğ½ÑÑ‚Ğ¸Ğµ Ğ¿Ğ¾Ğ´Ñ‚Ğ²ĞµÑ€Ğ¶Ğ´Ğ°ĞµÑ‚ ÑÑ‚Ğ¸ Ñ†ĞµĞ½Ñƒ Ğ¸ ĞºĞ¾Ğ»Ğ¸Ñ‡ĞµÑÑ‚Ğ²Ğ¾ Ğ¸',
  'myoffers.acceptStripeStrong': 'ÑĞ¾Ğ·Ğ´Ğ°Ñ‘Ñ‚ Ğ·Ğ°ĞºĞ°Ğ·',
  'myoffers.acceptStripeTail': 'Ğ½Ğ° Ğ½ĞµĞ³Ğ¾. Ğ—Ğ°Ñ‚ĞµĞ¼ Ğ·Ğ°ĞºĞ°Ğ· Ğ¿Ğ¾ÑĞ²Ğ»ÑĞµÑ‚ÑÑ Ğ² Ñ€Ğ°Ğ·Ğ´ĞµĞ»Ğµ Â«Ğ—Ğ°ĞºĞ°Ğ·Ñ‹Â», Ğ³Ğ´Ğµ Ğ¾Ñ‚ÑĞ»ĞµĞ¶Ğ¸Ğ²Ğ°ÑÑ‚ÑÑ ÑÑ‚Ğ°Ğ¿Ñ‹ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·ĞºĞ¸.',
  'myoffers.acceptHint': 'Ğ­Ñ‚Ğ¾ Ğ½ĞµĞ¾Ğ±Ñ€Ğ°Ñ‚Ğ¸Ğ¼Ğ¾ â€” Ğ¿ĞµÑ€ĞµĞ³Ğ¾Ğ²Ğ¾Ñ€Ñ‹ Ğ·Ğ°ĞºÑ€Ñ‹Ğ²Ğ°ÑÑ‚ÑÑ Ğ½Ğ° Ğ¿Ñ€Ğ¸Ğ½ÑÑ‚Ñ‹Ñ… ÑƒÑĞ»Ğ¾Ğ²Ğ¸ÑÑ….',
  'myoffers.acceptCta': 'ĞŸÑ€Ğ¸Ğ½ÑÑ‚ÑŒ Ğ¸ ÑĞ¾Ğ·Ğ´Ğ°Ñ‚ÑŒ Ğ·Ğ°ĞºĞ°Ğ·',
  'myoffers.accepting': 'ĞŸÑ€Ğ¸Ğ½ÑÑ‚Ğ¸Ğµâ€¦',
  'myoffers.errAccept': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ¿Ñ€Ğ¸Ğ½ÑÑ‚ÑŒ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ â€” Ğ¿Ğ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ ÑĞ½Ğ¾Ğ²Ğ°.',
  'myoffers.accepted': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ #{id} Ğ¿Ñ€Ğ¸Ğ½ÑÑ‚Ğ¾. Ğ¡Ğ¾Ğ·Ğ´Ğ°Ğ½Ğ½Ñ‹Ğ¹ Ğ·Ğ°ĞºĞ°Ğ· ÑĞ¼Ğ¾Ñ‚Ñ€Ğ¸Ñ‚Ğµ Ğ² Ñ€Ğ°Ğ·Ğ´ĞµĞ»Ğµ Â«Ğ—Ğ°ĞºĞ°Ğ·Ñ‹Â».',
  'myoffers.viewOrders': 'ĞŸĞ¾ÑĞ¼Ğ¾Ñ‚Ñ€ĞµÑ‚ÑŒ Ğ·Ğ°ĞºĞ°Ğ·Ñ‹',
  'myoffers.errReject': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ¾Ñ‚ĞºĞ»Ğ¾Ğ½Ğ¸Ñ‚ÑŒ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ğµ #{id} â€” Ğ¿Ğ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ ÑĞ½Ğ¾Ğ²Ğ°.',
  'ship.title': 'ĞÑ‚Ğ³Ñ€ÑƒĞ·ĞºĞ¸',
  'ship.subSupplier': 'Ğ­Ñ‚Ğ°Ğ¿Ñ‹ Ğ¿Ğ¾ Ğ·Ğ°ĞºĞ°Ğ·Ğ°Ğ¼, Ñ€Ğ°Ğ·Ğ¼ĞµÑ‰Ñ‘Ğ½Ğ½Ñ‹Ğ¼ Ğ½Ğ° Ğ²Ğ°Ñˆ Ñ‚Ğ¾Ğ²Ğ°Ñ€. Ğ’Ñ‹ Ğ¿Ñ€Ğ¾Ğ´Ğ²Ğ¸Ğ³Ğ°ĞµÑ‚Ğµ ĞºĞ°Ğ¶Ğ´ÑƒÑ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·ĞºÑƒ Ğ²Ğ¿ĞµÑ€Ñ‘Ğ´.',
  'ship.subAdmin': 'Ğ­Ñ‚Ğ°Ğ¿Ñ‹ Ğ¿Ğ¾ ĞºĞ°Ğ¶Ğ´Ğ¾Ğ¼Ñƒ Ğ·Ğ°ĞºĞ°Ğ·Ñƒ. ĞĞ´Ğ¼Ğ¸Ğ½Ğ¸ÑÑ‚Ñ€Ğ°Ñ‚Ğ¾Ñ€Ñ‹ Ğ¼Ğ¾Ğ³ÑƒÑ‚ Ğ¿Ñ€Ğ¾Ğ´Ğ²Ğ¸Ğ³Ğ°Ñ‚ÑŒ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·ĞºÑƒ Ğ¾Ñ‚ Ğ¸Ğ¼ĞµĞ½Ğ¸ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°.',
  'ship.subBuyer': 'ĞÑ‚ÑĞ»ĞµĞ¶Ğ¸Ğ²Ğ°Ğ½Ğ¸Ğµ ÑÑ‚Ğ°Ğ¿Ğ¾Ğ² Ğ¿Ğ¾ Ğ²Ğ°ÑˆĞ¸Ğ¼ Ğ·Ğ°ĞºĞ°Ğ·Ğ°Ğ¼. ĞšĞ°Ğ¶Ğ´Ñ‹Ğ¹ ÑˆĞ°Ğ³ Ğ¿Ñ€Ğ¾Ğ´Ğ²Ğ¸Ğ³Ğ°ĞµÑ‚ Ğ²Ğ°Ñˆ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸Ğº.',
  'ship.signInSub': 'Ğ’Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ Ğ¾Ñ‚ÑĞ»ĞµĞ¶Ğ¸Ğ²Ğ°Ñ‚ÑŒ ÑĞ²Ğ¾Ğ¸ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·ĞºĞ¸',
  'ship.notSignedIn': 'Ğ’Ñ‹ Ğ½Ğµ Ğ²Ğ¾ÑˆĞ»Ğ¸',
  'ship.notSignedInBody': 'ĞÑ‚ÑĞ»ĞµĞ¶Ğ¸Ğ²Ğ°Ğ½Ğ¸Ğµ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·ĞºĞ¸ Ğ²Ğ¸Ğ´Ğ½Ğ¾ Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ñ Ğ¸ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºÑƒ Ğ¿Ğ¾ Ğ·Ğ°ĞºĞ°Ğ·Ñƒ.',
  'ship.loadErrorTitle': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·ĞºĞ¸',
  'ship.loadErrorBody': 'API Ğ½Ğµ Ğ²ĞµÑ€Ğ½ÑƒĞ» Ğ²Ğ°ÑˆĞ¸ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·ĞºĞ¸ â€” Ğ¿Ğ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ ÑĞ½Ğ¾Ğ²Ğ°.',
  'ship.trying': 'ĞŸÑ€Ğ¾Ğ±ÑƒĞµĞ¼â€¦',
  'ship.emptyTitle': 'ĞÑ‚Ğ³Ñ€ÑƒĞ·Ğ¾Ğº Ğ¿Ğ¾ĞºĞ° Ğ½ĞµÑ‚',
  'ship.emptySupplier': 'ĞÑ‚Ğ³Ñ€ÑƒĞ·ĞºĞ° ÑĞ¾Ğ·Ğ´Ğ°Ñ‘Ñ‚ÑÑ Ğ°Ğ²Ñ‚Ğ¾Ğ¼Ğ°Ñ‚Ğ¸Ñ‡ĞµÑĞºĞ¸, ĞºĞ¾Ğ³Ğ´Ğ° Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑŒ Ğ·Ğ°ĞºĞ°Ğ·Ñ‹Ğ²Ğ°ĞµÑ‚ Ğ¸Ğ· Ğ²Ğ°ÑˆĞµĞ³Ğ¾ Ñ‚Ğ¾Ğ²Ğ°Ñ€Ğ°.',
  'ship.emptyBuyer': 'Ğ”Ğ»Ñ ĞºĞ°Ğ¶Ğ´Ğ¾Ğ³Ğ¾ Ğ²Ğ°ÑˆĞµĞ³Ğ¾ Ğ·Ğ°ĞºĞ°Ğ·Ğ° Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·ĞºĞ° ÑĞ¾Ğ·Ğ´Ğ°Ñ‘Ñ‚ÑÑ Ğ°Ğ²Ñ‚Ğ¾Ğ¼Ğ°Ñ‚Ğ¸Ñ‡ĞµÑĞºĞ¸, Ğ¸ ĞµÑ‘ ÑÑ‚Ğ°Ğ¿Ñ‹ Ğ¿Ğ¾ÑĞ²Ğ»ÑÑÑ‚ÑÑ Ğ·Ğ´ĞµÑÑŒ.',
  'ship.myListings': 'ĞœĞ¾Ğ¸ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸',
  'ship.viewOrders': 'ĞŸĞ¾ÑĞ¼Ğ¾Ñ‚Ñ€ĞµÑ‚ÑŒ Ğ¼Ğ¾Ğ¸ Ğ·Ğ°ĞºĞ°Ğ·Ñ‹',
  'ship.count': 'Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·Ğ¾Ğº Ğ²Ğ¸Ğ´Ğ½Ğ¾ Ğ²Ğ°ÑˆĞµĞ¼Ñƒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ñƒ',
  'ship.delivered': 'Ğ´Ğ¾ÑÑ‚Ğ°Ğ²Ğ»ĞµĞ½Ğ¾',
  'ship.advanceRecorded': 'ĞŸÑ€Ğ¾Ğ´Ğ²Ğ¸Ğ¶ĞµĞ½Ğ¸Ğµ ÑÑ‚Ğ°Ğ¿Ğ° Ñ„Ğ¸ĞºÑĞ¸Ñ€ÑƒĞµÑ‚ÑÑ Ñ Ğ¾Ñ‚Ğ¼ĞµÑ‚ĞºĞ¾Ğ¹ Ğ²Ñ€ĞµĞ¼ĞµĞ½Ğ¸ Ğ¸ Ğ¿Ğ¾ĞºĞ°Ğ·Ñ‹Ğ²Ğ°ĞµÑ‚ÑÑ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ñ.',
  'ship.advanceBySupplier': 'Ğ­Ñ‚Ğ°Ğ¿Ñ‹ Ğ¿Ğ¾ ĞºĞ°Ğ¶Ğ´Ğ¾Ğ¼Ñƒ Ğ·Ğ°ĞºĞ°Ğ·Ñƒ Ğ¿Ñ€Ğ¾Ğ´Ğ²Ğ¸Ğ³Ğ°ĞµÑ‚ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸Ğº.',
  'ship.trackingTitle': 'ĞÑ‚ÑĞ»ĞµĞ¶Ğ¸Ğ²Ğ°Ğ½Ğ¸Ğµ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·ĞºĞ¸',
  'ship.col.shipment': 'ĞÑ‚Ğ³Ñ€ÑƒĞ·ĞºĞ°',
  'ship.col.product': 'Ğ¢Ğ¾Ğ²Ğ°Ñ€',
  'ship.col.carrier': 'ĞŸĞµÑ€ĞµĞ²Ğ¾Ğ·Ñ‡Ğ¸Ğº',
  'ship.col.trackingNo': 'ĞĞ¾Ğ¼ĞµÑ€ Ğ¾Ñ‚ÑĞ»ĞµĞ¶Ğ¸Ğ²Ğ°Ğ½Ğ¸Ñ',
  'ship.col.documents': 'Ğ”Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ñ‹',
  'ship.col.updated': 'ĞŸĞ¾ÑĞ»ĞµĞ´Ğ½ĞµĞµ Ğ¾Ğ±Ğ½Ğ¾Ğ²Ğ»ĞµĞ½Ğ¸Ğµ',
  'ship.col.milestone': 'Ğ­Ñ‚Ğ°Ğ¿',
  'ship.noDocumentTitle': 'Ğš Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·ĞºĞµ Ğ¿Ğ¾ĞºĞ° Ğ½Ğµ Ğ¿Ñ€Ğ¸ĞºÑ€ĞµĞ¿Ğ»Ñ‘Ğ½ Ğ½Ğ¸ Ğ¾Ğ´Ğ¸Ğ½ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚',
  'ship.advance': 'ĞŸÑ€Ğ¾Ğ´Ğ²Ğ¸Ğ½ÑƒÑ‚ÑŒ ÑÑ‚Ğ°Ğ¿',
  'ship.advancing': 'ĞŸÑ€Ğ¾Ğ´Ğ²Ğ¸Ğ¶ĞµĞ½Ğ¸Ğµâ€¦',
  'ship.deliveredLabel': 'Ğ”Ğ¾ÑÑ‚Ğ°Ğ²Ğ»ĞµĞ½Ğ¾',
  'ship.advancedBySupplier': 'ĞŸÑ€Ğ¾Ğ´Ğ²Ğ¸Ğ³Ğ°ĞµÑ‚ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸Ğº',
  'ship.completeTitle': 'Ğ’ÑĞµ ÑÑ‚Ğ°Ğ¿Ñ‹ Ğ´Ğ¾ÑÑ‚Ğ¸Ğ³Ğ½ÑƒÑ‚Ñ‹',
  'ship.advanceTitle': 'ĞŸÑ€Ğ¾Ğ´Ğ²Ğ¸Ğ½ÑƒÑ‚ÑŒ ÑÑ‚Ñƒ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·ĞºÑƒ Ğ½Ğ° Ğ¾Ğ´Ğ¸Ğ½ ÑˆĞ°Ğ³ Ğ²Ğ¿ĞµÑ€Ñ‘Ğ´',
  'ship.noMilestones': 'ĞŸĞ¾ ÑÑ‚Ğ¾Ğ¹ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·ĞºĞµ Ğ¿Ğ¾ĞºĞ° Ğ½Ğµ Ğ·Ğ°Ñ„Ğ¸ĞºÑĞ¸Ñ€Ğ¾Ğ²Ğ°Ğ½Ğ¾ Ğ½Ğ¸ Ğ¾Ğ´Ğ½Ğ¾Ğ³Ğ¾ ÑÑ‚Ğ°Ğ¿Ğ°.',
  'ship.reached': 'Ğ´Ğ¾ÑÑ‚Ğ¸Ğ³Ğ½ÑƒÑ‚Ğ¾ {step} Ğ¸Ğ· {total} ÑÑ‚Ğ°Ğ¿Ğ¾Ğ²',
  'ship.reachedDelivered': 'Ğ´Ğ¾ÑÑ‚Ğ°Ğ²Ğ»ĞµĞ½Ğ¾',
  'ship.reachedNext': 'Ğ´Ğ°Ğ»ĞµĞµ: {next}',
  'ship.footLead': 'Ğ˜ÑÑ‚Ğ¾Ñ€Ğ¸Ñ ÑÑ‚Ğ°Ğ¿Ğ¾Ğ² Ğ²Ğ¸Ğ´Ğ½Ğ° Ğ¾Ğ±ĞµĞ¸Ğ¼ ÑÑ‚Ğ¾Ñ€Ğ¾Ğ½Ğ°Ğ¼ Ğ·Ğ°ĞºĞ°Ğ·Ğ°. Ğ—Ğ°ĞºĞ°Ğ·Ñ‹ Ğ¸ Ğ¸Ñ… ÑÑƒĞ¼Ğ¼Ñ‹ Ğ½Ğ°Ñ…Ğ¾Ğ´ÑÑ‚ÑÑ Ğ² Ñ€Ğ°Ğ·Ğ´ĞµĞ»Ğµ',
  'ship.footLink': 'Â«Ğ—Ğ°ĞºĞ°Ğ·Ñ‹Â»',
  'ship.footTail': '.',
  'ship.errAdvance': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ¿Ñ€Ğ¾Ğ´Ğ²Ğ¸Ğ½ÑƒÑ‚ÑŒ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·ĞºÑƒ #{id} â€” Ğ¿Ğ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ ÑĞ½Ğ¾Ğ²Ğ°.',
  'saved.title': 'Ğ¡Ğ¾Ñ…Ñ€Ğ°Ğ½Ñ‘Ğ½Ğ½Ñ‹Ğµ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¸',
  'saved.signInSub': 'Ğ’Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ Ğ²ĞµÑÑ‚Ğ¸ ÑĞ¿Ğ¸ÑĞ¾Ğº Ğ¸Ğ·Ğ±Ñ€Ğ°Ğ½Ğ½Ñ‹Ñ… Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¹',
  'saved.notSignedIn': 'Ğ’Ñ‹ Ğ½Ğµ Ğ²Ğ¾ÑˆĞ»Ğ¸',
  'saved.notSignedInBody': 'Ğ’Ğ°Ñˆ ÑĞ¿Ğ¸ÑĞ¾Ğº Ğ¸Ğ·Ğ±Ñ€Ğ°Ğ½Ğ½Ğ¾Ğ³Ğ¾ Ğ²Ğ¸Ğ´ĞµĞ½ Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ğ²Ğ°ÑˆĞµĞ¼Ñƒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ñƒ: Ğ²Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ ÑĞ¾Ñ…Ñ€Ğ°Ğ½ÑÑ‚ÑŒ Ğ¸ ÑƒĞ´Ğ°Ğ»ÑÑ‚ÑŒ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¸.',
  'saved.sub': 'ĞŸĞ°Ñ€Ñ‚Ğ¸Ğ¸, ĞºĞ¾Ñ‚Ğ¾Ñ€Ñ‹Ğµ Ğ²Ñ‹ Ğ´Ğ¾Ğ±Ğ°Ğ²Ğ¸Ğ»Ğ¸ Ğ² Ğ¸Ğ·Ğ±Ñ€Ğ°Ğ½Ğ½Ğ¾Ğµ. Ğ¦ĞµĞ½Ñ‹ Ğ¸ Ğ½Ğ°Ğ»Ğ¸Ñ‡Ğ¸Ğµ â€” Ñ‚ĞµĞºÑƒÑ‰Ğ¸Ğµ Ğ´Ğ°Ğ½Ğ½Ñ‹Ğµ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°, Ğ° Ğ½Ğµ Ğ±Ñ€Ğ¾Ğ½Ğ¸Ñ€Ğ¾Ğ²Ğ°Ğ½Ğ¸Ğµ.',
  'saved.loadErrorTitle': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ ÑĞ¾Ñ…Ñ€Ğ°Ğ½Ñ‘Ğ½Ğ½Ñ‹Ğµ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¸',
  'saved.loadErrorBody': 'API Ğ½Ğµ Ğ²ĞµÑ€Ğ½ÑƒĞ» Ğ²Ğ°Ñˆ ÑĞ¿Ğ¸ÑĞ¾Ğº Ğ¸Ğ·Ğ±Ñ€Ğ°Ğ½Ğ½Ğ¾Ğ³Ğ¾ â€” Ğ¿Ğ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ ÑĞ½Ğ¾Ğ²Ğ°.',
  'saved.trying': 'ĞŸÑ€Ğ¾Ğ±ÑƒĞµĞ¼â€¦',
  'saved.emptyTitle': 'ĞŸĞ¾ĞºĞ° Ğ½Ğ¸Ñ‡ĞµĞ³Ğ¾ Ğ½Ğµ ÑĞ¾Ñ…Ñ€Ğ°Ğ½ĞµĞ½Ğ¾',
  'saved.emptyBody': 'Ğ¡Ğ¾Ñ…Ñ€Ğ°Ğ½Ğ¸Ñ‚Ğµ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ Ğ½Ğ° Ğ¿Ğ»Ğ¾Ñ‰Ğ°Ğ´ĞºĞµ â€” Ğ¾Ğ½Ğ° Ğ¿Ğ¾ÑĞ²Ğ¸Ñ‚ÑÑ Ğ·Ğ´ĞµÑÑŒ Ğ´Ğ»Ñ Ğ±Ñ‹ÑÑ‚Ñ€Ğ¾Ğ³Ğ¾ ÑÑ€Ğ°Ğ²Ğ½ĞµĞ½Ğ¸Ñ Ğ¿Ğ¾Ğ·Ğ¶Ğµ.',
  'saved.browse': 'Ğ¡Ğ¼Ğ¾Ñ‚Ñ€ĞµÑ‚ÑŒ Ğ³Ğ¾Ñ‚Ğ¾Ğ²Ñ‹Ğ¹ ÑĞºĞ»Ğ°Ğ´',
  'saved.goToFeed': 'ĞŸĞµÑ€ĞµĞ¹Ñ‚Ğ¸ Ğ² Ğ¼Ğ¾Ñ Ğ»ĞµĞ½Ñ‚Ñƒ',
  'saved.count': 'ÑĞ¾Ñ…Ñ€Ğ°Ğ½Ñ‘Ğ½Ğ½Ñ‹Ñ… Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¹: {n}',
  'saved.mostRecent': 'Ğ¡Ğ½Ğ°Ñ‡Ğ°Ğ»Ğ° Ğ½ĞµĞ´Ğ°Ğ²Ğ½Ğ¾ ÑĞ¾Ñ…Ñ€Ğ°Ğ½Ñ‘Ğ½Ğ½Ñ‹Ğµ',
  'saved.savedOn': 'Ğ¡Ğ¾Ñ…Ñ€Ğ°Ğ½ĞµĞ½Ğ¾ {date}',
  'saved.remove': 'Ğ£Ğ±Ñ€Ğ°Ñ‚ÑŒ',
  'saved.removing': 'Ğ£Ğ±Ğ¸Ñ€Ğ°ĞµĞ¼â€¦',
  'saved.removeTitle': 'Ğ£Ğ±Ñ€Ğ°Ñ‚ÑŒ ÑÑ‚Ñƒ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ Ğ¸Ğ· Ğ¸Ğ·Ğ±Ñ€Ğ°Ğ½Ğ½Ğ¾Ğ³Ğ¾',
  'saved.errRemove': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ ÑƒĞ±Ñ€Ğ°Ñ‚ÑŒ ÑÑ‚Ñƒ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ Ğ¸Ğ· Ğ¸Ğ·Ğ±Ñ€Ğ°Ğ½Ğ½Ğ¾Ğ³Ğ¾ â€” Ğ¿Ğ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ ÑĞ½Ğ¾Ğ²Ğ°.',
  'notes.title': 'Ğ£Ğ²ĞµĞ´Ğ¾Ğ¼Ğ»ĞµĞ½Ğ¸Ñ',
  'notes.signInSub': 'Ğ’Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ ÑƒĞ²Ğ¸Ğ´ĞµÑ‚ÑŒ Ğ°ĞºÑ‚Ğ¸Ğ²Ğ½Ğ¾ÑÑ‚ÑŒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ğ°',
  'notes.notSignedIn': 'Ğ’Ñ‹ Ğ½Ğµ Ğ²Ğ¾ÑˆĞ»Ğ¸',
  'notes.notSignedInBody': 'Ğ£Ğ²ĞµĞ´Ğ¾Ğ¼Ğ»ĞµĞ½Ğ¸Ñ Ğ²Ğ¸Ğ´Ğ½Ñ‹ Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ğ²Ğ°ÑˆĞµĞ¼Ñƒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ñƒ: Ğ²Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ Ğ¿Ñ€Ğ¾Ñ‡Ğ¸Ñ‚Ğ°Ñ‚ÑŒ Ğ¸Ñ….',
  'notes.sub': 'ĞŸÑ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ, ÑĞ¾Ğ¾Ğ±Ñ‰ĞµĞ½Ğ¸Ñ Ğ¸ Ğ¾Ğ±Ğ½Ğ¾Ğ²Ğ»ĞµĞ½Ğ¸Ñ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·Ğ¾Ğº Ğ¿Ğ¾ Ğ²Ğ°ÑˆĞµĞ¼Ñƒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ñƒ, ÑĞ½Ğ°Ñ‡Ğ°Ğ»Ğ° Ğ½Ğ¾Ğ²Ñ‹Ğµ.',
  'notes.markAll': 'ĞÑ‚Ğ¼ĞµÑ‚Ğ¸Ñ‚ÑŒ Ğ²ÑÑ‘ Ğ¿Ñ€Ğ¾Ñ‡Ğ¸Ñ‚Ğ°Ğ½Ğ½Ñ‹Ğ¼',
  'notes.marking': 'ĞÑ‚Ğ¼ĞµÑ‡Ğ°ĞµĞ¼â€¦',
  'notes.markAllTitle': 'ĞÑ‚Ğ¼ĞµÑ‚Ğ¸Ñ‚ÑŒ {n} Ğ½ĞµĞ¿Ñ€Ğ¾Ñ‡Ğ¸Ñ‚Ğ°Ğ½Ğ½Ñ‹Ñ… ÑƒĞ²ĞµĞ´Ğ¾Ğ¼Ğ»ĞµĞ½Ğ¸Ğ¹ Ğ¿Ñ€Ğ¾Ñ‡Ğ¸Ñ‚Ğ°Ğ½Ğ½Ñ‹Ğ¼Ğ¸',
  'notes.nothingUnread': 'ĞĞµĞ¿Ñ€Ğ¾Ñ‡Ğ¸Ñ‚Ğ°Ğ½Ğ½Ğ¾Ğ³Ğ¾ Ğ½ĞµÑ‚',
  'notes.loadErrorTitle': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ ÑƒĞ²ĞµĞ´Ğ¾Ğ¼Ğ»ĞµĞ½Ğ¸Ñ',
  'notes.loadErrorBody': 'API Ğ½Ğµ Ğ²ĞµÑ€Ğ½ÑƒĞ» Ğ²Ğ°ÑˆĞ¸ ÑƒĞ²ĞµĞ´Ğ¾Ğ¼Ğ»ĞµĞ½Ğ¸Ñ â€” Ğ¿Ğ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ ÑĞ½Ğ¾Ğ²Ğ°.',
  'notes.trying': 'ĞŸÑ€Ğ¾Ğ±ÑƒĞµĞ¼â€¦',
  'notes.emptyTitle': 'Ğ£Ğ²ĞµĞ´Ğ¾Ğ¼Ğ»ĞµĞ½Ğ¸Ğ¹ Ğ¿Ğ¾ĞºĞ° Ğ½ĞµÑ‚',
  'notes.emptyBody': 'ĞšĞ¾Ğ³Ğ´Ğ° Ğ¿Ğ¾ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ´Ğ°ÑÑ‚ Ğ²ÑÑ‚Ñ€ĞµÑ‡Ğ½Ğ¾Ğµ, Ğ¿Ñ€Ğ¸Ñ…Ğ¾Ğ´Ğ¸Ñ‚ ÑĞ¾Ğ¾Ğ±Ñ‰ĞµĞ½Ğ¸Ğµ Ğ¸Ğ»Ğ¸ Ğ¿Ñ€Ğ¾Ğ´Ğ²Ğ¸Ğ³Ğ°ĞµÑ‚ÑÑ Ğ¾Ñ‚Ğ³Ñ€ÑƒĞ·ĞºĞ°, ÑÑ‚Ğ¾ Ñ„Ğ¸ĞºÑĞ¸Ñ€ÑƒĞµÑ‚ÑÑ Ğ·Ğ´ĞµÑÑŒ.',
  'notes.browse': 'Ğ¡Ğ¼Ğ¾Ñ‚Ñ€ĞµÑ‚ÑŒ Ğ³Ğ¾Ñ‚Ğ¾Ğ²Ñ‹Ğ¹ ÑĞºĞ»Ğ°Ğ´',
  'notes.myOrders': 'ĞœĞ¾Ğ¸ Ğ·Ğ°ĞºĞ°Ğ·Ñ‹',
  'notes.count': 'ÑƒĞ²ĞµĞ´Ğ¾Ğ¼Ğ»ĞµĞ½Ğ¸Ğ¹: {n}',
  'notes.unreadCount': 'Ğ½ĞµĞ¿Ñ€Ğ¾Ñ‡Ğ¸Ñ‚Ğ°Ğ½Ğ½Ñ‹Ñ…: {n}',
  'notes.allRead': 'Ğ’ÑÑ‘ Ğ¿Ñ€Ğ¾Ñ‡Ğ¸Ñ‚Ğ°Ğ½Ğ¾',
  'notes.unreadLabel': 'ĞĞµĞ¿Ñ€Ğ¾Ñ‡Ğ¸Ñ‚Ğ°Ğ½Ğ½Ğ¾Ğµ',
  'notes.footnote': 'Ğ¡Ñ‡Ñ‘Ñ‚Ñ‡Ğ¸ĞºĞ¸ Ğ½ĞµĞ¿Ñ€Ğ¾Ñ‡Ğ¸Ñ‚Ğ°Ğ½Ğ½Ğ¾Ğ³Ğ¾ Ğ¿Ñ€Ğ¸Ñ…Ğ¾Ğ´ÑÑ‚ Ğ½Ğ°Ğ¿Ñ€ÑĞ¼ÑƒÑ Ğ¸Ğ· API. ĞÑ‚ĞºÑ€Ñ‹Ñ‚Ğ¸Ğµ Ğ¿ĞµÑ€ĞµĞ¿Ğ¸ÑĞºĞ¸ Ğ¸Ğ»Ğ¸ Ğ¿Ñ€ĞµĞ´Ğ»Ğ¾Ğ¶ĞµĞ½Ğ¸Ñ Ğ¾Ñ‚ÑÑĞ´Ğ° ÑĞ°Ğ¼Ğ¾ Ğ¿Ğ¾ ÑĞµĞ±Ğµ Ğ½Ğµ ÑĞ½Ğ¸Ğ¼Ğ°ĞµÑ‚ ÑƒĞ²ĞµĞ´Ğ¾Ğ¼Ğ»ĞµĞ½Ğ¸Ğµ â€” Ğ¸ÑĞ¿Ğ¾Ğ»ÑŒĞ·ÑƒĞ¹Ñ‚Ğµ Â«ĞÑ‚Ğ¼ĞµÑ‚Ğ¸Ñ‚ÑŒ Ğ²ÑÑ‘ Ğ¿Ñ€Ğ¾Ñ‡Ğ¸Ñ‚Ğ°Ğ½Ğ½Ñ‹Ğ¼Â».',
  'notes.errMark': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ¾Ñ‚Ğ¼ĞµÑ‚Ğ¸Ñ‚ÑŒ ÑƒĞ²ĞµĞ´Ğ¾Ğ¼Ğ»ĞµĞ½Ğ¸Ñ Ğ¿Ñ€Ğ¾Ñ‡Ğ¸Ñ‚Ğ°Ğ½Ğ½Ñ‹Ğ¼Ğ¸ â€” Ğ¿Ğ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ ÑĞ½Ğ¾Ğ²Ğ°.',
  'notes.justNow': 'Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ñ‡Ñ‚Ğ¾',
  'notes.minutesAgo': '{n} Ğ¼Ğ¸Ğ½ Ğ½Ğ°Ğ·Ğ°Ğ´',
  'notes.hoursAgo': '{n} Ñ‡ Ğ½Ğ°Ğ·Ğ°Ğ´',
  'notes.daysAgo': '{n} Ğ´Ğ½. Ğ½Ğ°Ğ·Ğ°Ğ´',
  'notes.open': 'ĞÑ‚ĞºÑ€Ñ‹Ñ‚ÑŒ',
  'msg.title': 'Ğ¡Ğ¾Ğ¾Ğ±Ñ‰ĞµĞ½Ğ¸Ñ',
  'msg.subSupplier': 'Ğ—Ğ°Ğ¿Ñ€Ğ¾ÑÑ‹ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ĞµĞ¹ Ğ¿Ğ¾ Ğ²Ğ°ÑˆĞµĞ¼Ñƒ Ñ‚Ğ¾Ğ²Ğ°Ñ€Ñƒ. ĞÑ‚ĞºÑ€Ñ‹Ñ‚Ğ¸Ğµ Ğ¿ĞµÑ€ĞµĞ¿Ğ¸ÑĞºĞ¸ Ğ¾Ñ‚Ğ¼ĞµÑ‡Ğ°ĞµÑ‚ ĞµÑ‘ Ğ¿Ñ€Ğ¾Ñ‡Ğ¸Ñ‚Ğ°Ğ½Ğ½Ğ¾Ğ¹.',
  'msg.subBuyer': 'Ğ’Ğ°ÑˆĞ¸ Ğ¿ĞµÑ€ĞµĞ¿Ğ¸ÑĞºĞ¸ Ñ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°Ğ¼Ğ¸. ĞÑ‚ĞºÑ€Ñ‹Ñ‚Ğ¸Ğµ Ğ¿ĞµÑ€ĞµĞ¿Ğ¸ÑĞºĞ¸ Ğ¾Ñ‚Ğ¼ĞµÑ‡Ğ°ĞµÑ‚ ĞµÑ‘ Ğ¿Ñ€Ğ¾Ñ‡Ğ¸Ñ‚Ğ°Ğ½Ğ½Ğ¾Ğ¹.',
  'msg.signInSub': 'Ğ’Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ ÑƒĞ²Ğ¸Ğ´ĞµÑ‚ÑŒ ÑĞ²Ğ¾Ğ¸ Ğ¿ĞµÑ€ĞµĞ¿Ğ¸ÑĞºĞ¸',
  'msg.notSignedIn': 'Ğ’Ñ‹ Ğ½Ğµ Ğ²Ğ¾ÑˆĞ»Ğ¸',
  'msg.notSignedInBody': 'ĞŸĞµÑ€ĞµĞ¿Ğ¸ÑĞºĞ¸ Ğ²Ğ¸Ğ´Ğ½Ñ‹ Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ğ´Ğ²ÑƒĞ¼ ÑÑ‚Ğ¾Ñ€Ğ¾Ğ½Ğ°Ğ¼: Ğ²Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ Ñ‡Ğ¸Ñ‚Ğ°Ñ‚ÑŒ Ğ¸ Ğ¾Ñ‚Ğ²ĞµÑ‡Ğ°Ñ‚ÑŒ.',
  'msg.loadErrorTitle': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ Ğ¿ĞµÑ€ĞµĞ¿Ğ¸ÑĞºĞ¸',
  'msg.loadErrorBody': 'API Ğ½Ğµ Ğ²ĞµÑ€Ğ½ÑƒĞ» Ğ²Ğ°ÑˆĞ¸ Ğ¿ĞµÑ€ĞµĞ¿Ğ¸ÑĞºĞ¸ â€” Ğ¿Ğ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ ÑĞ½Ğ¾Ğ²Ğ°.',
  'msg.trying': 'ĞŸÑ€Ğ¾Ğ±ÑƒĞµĞ¼â€¦',
  'msg.emptyTitle': 'ĞŸĞµÑ€ĞµĞ¿Ğ¸ÑĞ¾Ğº Ğ¿Ğ¾ĞºĞ° Ğ½ĞµÑ‚',
  'msg.emptySupplier': 'ĞšĞ¾Ğ³Ğ´Ğ° Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑŒ ÑĞ¿Ñ€Ğ°ÑˆĞ¸Ğ²Ğ°ĞµÑ‚ Ğ¾Ğ± Ğ¾Ğ´Ğ½Ğ¾Ğ¹ Ğ¸Ğ· Ğ²Ğ°ÑˆĞ¸Ñ… Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ğ¹, Ğ¿ĞµÑ€ĞµĞ¿Ğ¸ÑĞºĞ° Ğ¿Ğ¾ÑĞ²Ğ»ÑĞµÑ‚ÑÑ Ğ·Ğ´ĞµÑÑŒ.',
  'msg.emptyBuyer': 'ĞÑ‚ĞºÑ€Ğ¾Ğ¹Ñ‚Ğµ Ğ¸Ğ½Ñ‚ĞµÑ€ĞµÑÑƒÑÑ‰ÑƒÑ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ Ğ¸ Ğ½Ğ°Ğ¿Ğ¸ÑˆĞ¸Ñ‚Ğµ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºÑƒ â€” Ğ¿ĞµÑ€ĞµĞ¿Ğ¸ÑĞºĞ° Ğ¿Ğ¾ÑĞ²Ğ¸Ñ‚ÑÑ Ğ·Ğ´ĞµÑÑŒ.',
  'msg.browse': 'Ğ¡Ğ¼Ğ¾Ñ‚Ñ€ĞµÑ‚ÑŒ Ğ³Ğ¾Ñ‚Ğ¾Ğ²Ñ‹Ğ¹ ÑĞºĞ»Ğ°Ğ´',
  'msg.myListings': 'ĞœĞ¾Ğ¸ Ğ¿Ğ¾Ğ·Ğ¸Ñ†Ğ¸Ğ¸',
  'msg.noMessagesYet': 'Ğ¡Ğ¾Ğ¾Ğ±Ñ‰ĞµĞ½Ğ¸Ğ¹ Ğ¿Ğ¾ĞºĞ° Ğ½ĞµÑ‚',
  'msg.count': 'ÑĞ¾Ğ¾Ğ±Ñ‰ĞµĞ½Ğ¸Ğ¹: {n}',
  'msg.pickTitle': 'Ğ’Ñ‹Ğ±ĞµÑ€Ğ¸Ñ‚Ğµ Ğ¿ĞµÑ€ĞµĞ¿Ğ¸ÑĞºÑƒ',
  'msg.pickBody': 'Ğ•Ñ‘ ÑĞ¾Ğ¾Ğ±Ñ‰ĞµĞ½Ğ¸Ñ Ğ¿Ğ¾ÑĞ²ÑÑ‚ÑÑ Ğ·Ğ´ĞµÑÑŒ.',
  'msg.threadLoadError': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ ÑÑ‚Ñƒ Ğ¿ĞµÑ€ĞµĞ¿Ğ¸ÑĞºÑƒ',
  'msg.threadLoadErrorBody': 'Ğ’Ğ¾Ğ·Ğ¼Ğ¾Ğ¶Ğ½Ğ¾, Ğ¾Ğ½Ğ° ÑƒĞ´Ğ°Ğ»ĞµĞ½Ğ° Ğ¸Ğ»Ğ¸ Ğ½ĞµĞ´Ğ¾ÑÑ‚ÑƒĞ¿Ğ½Ğ° Ğ²Ğ°ÑˆĞµĞ¼Ñƒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ñƒ â€” Ğ¿Ğ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ ÑĞ½Ğ¾Ğ²Ğ°.',
  'msg.noLot': 'ĞŸĞ°Ñ€Ñ‚Ğ¸Ñ Ğ½Ğµ Ğ¿Ñ€Ğ¸Ğ²ÑĞ·Ğ°Ğ½Ğ°',
  'msg.viewLot': 'ĞÑ‚ĞºÑ€Ñ‹Ñ‚ÑŒ Ğ¿Ğ°Ñ€Ñ‚Ğ¸Ñ',
  'msg.emptyThreadTitle': 'Ğ’ ÑÑ‚Ğ¾Ğ¹ Ğ¿ĞµÑ€ĞµĞ¿Ğ¸ÑĞºĞµ Ğ¿Ğ¾ĞºĞ° Ğ½ĞµÑ‚ ÑĞ¾Ğ¾Ğ±Ñ‰ĞµĞ½Ğ¸Ğ¹',
  'msg.emptyThreadBody': 'ĞĞ°Ğ¿Ğ¸ÑˆĞ¸Ñ‚Ğµ Ğ¿ĞµÑ€Ğ²Ğ¾Ğµ ÑĞ¾Ğ¾Ğ±Ñ‰ĞµĞ½Ğ¸Ğµ Ğ½Ğ¸Ğ¶Ğµ.',
  'msg.messagePlaceholder': 'Ğ¡Ğ¾Ğ¾Ğ±Ñ‰ĞµĞ½Ğ¸Ğµ Ğ´Ğ»Ñ {name}â€¦',
  'msg.messageAria': 'ĞĞ°Ğ¿Ğ¸ÑĞ°Ñ‚ÑŒ ÑĞ¾Ğ¾Ğ±Ñ‰ĞµĞ½Ğ¸Ğµ',
  'msg.send': 'ĞÑ‚Ğ¿Ñ€Ğ°Ğ²Ğ¸Ñ‚ÑŒ',
  'msg.sending': 'ĞÑ‚Ğ¿Ñ€Ğ°Ğ²ĞºĞ°â€¦',
  'msg.read': 'Ğ¿Ñ€Ğ¾Ñ‡Ğ¸Ñ‚Ğ°Ğ½Ğ¾',
  'msg.otherParty': 'Ğ´Ñ€ÑƒĞ³Ğ°Ñ ÑÑ‚Ğ¾Ñ€Ğ¾Ğ½Ğ°',
  'msg.errSend': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ¾Ñ‚Ğ¿Ñ€Ğ°Ğ²Ğ¸Ñ‚ÑŒ ÑĞ¾Ğ¾Ğ±Ñ‰ĞµĞ½Ğ¸Ğµ â€” Ğ¿Ğ¾Ğ¿Ñ€Ğ¾Ğ±ÑƒĞ¹Ñ‚Ğµ ÑĞ½Ğ¾Ğ²Ğ°.',
  'msg.justNow': 'Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ñ‡Ñ‚Ğ¾',
  'msg.minutesAgo': '{n} Ğ¼Ğ¸Ğ½ Ğ½Ğ°Ğ·Ğ°Ğ´',
  'msg.hoursAgo': '{n} Ñ‡ Ğ½Ğ°Ğ·Ğ°Ğ´',
  'msg.daysAgo': '{n} Ğ´Ğ½. Ğ½Ğ°Ğ·Ğ°Ğ´',
  'verify.title': 'ĞŸÑ€Ğ¾Ğ²ĞµÑ€ĞºĞ°',
  'verify.sub': 'ĞŸĞ¾Ğ´Ğ°Ğ²Ğ°Ğ¹Ñ‚Ğµ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ñ‹, Ğ¾Ñ‚ÑĞ»ĞµĞ¶Ğ¸Ğ²Ğ°Ğ¹Ñ‚Ğµ Ñ€ĞµÑˆĞµĞ½Ğ¸Ğµ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ÑÑÑ‰ĞµĞ³Ğ¾ Ğ¸ Ğ²Ğ¸Ğ´ÑŒÑ‚Ğµ, Ñ‡Ñ‚Ğ¾ ÑĞ¾Ğ¾Ğ±Ñ‰Ğ°ĞµÑ‚ÑÑ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑĞ¼',
  'verify.signInSub': 'Ğ”Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ñ‹, Ğ½Ğ° ĞºĞ¾Ñ‚Ğ¾Ñ€Ñ‹Ğµ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ğ¸ Ğ¾Ğ¿Ğ¸Ñ€Ğ°ÑÑ‚ÑÑ Ğ´Ğ¾ Ğ¾Ğ¿Ğ»Ğ°Ñ‚Ñ‹',
  'verify.notSignedIn': 'Ğ’Ñ‹ Ğ½Ğµ Ğ²Ğ¾ÑˆĞ»Ğ¸',
  'verify.notSignedInBody':
    'Ğ”Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ñ‹ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸ Ğ¿Ñ€Ğ¸Ğ½Ğ°Ğ´Ğ»ĞµĞ¶Ğ°Ñ‚ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ñƒ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ° Ğ¸ Ğ½Ğ¸ĞºĞ¾Ğ³Ğ´Ğ° Ğ½Ğµ Ğ¿ÑƒĞ±Ğ»Ğ¸ĞºÑƒÑÑ‚ÑÑ Ğ² Ğ¸ÑÑ…Ğ¾Ğ´Ğ½Ğ¾Ğ¼ Ğ²Ğ¸Ğ´Ğµ. Ğ’Ğ¾Ğ¹Ğ´Ğ¸Ñ‚Ğµ, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ Ğ¿Ğ¾Ğ´Ğ°Ñ‚ÑŒ Ğ¸Ğ»Ğ¸ Ğ¾Ğ±Ğ½Ğ¾Ğ²Ğ¸Ñ‚ÑŒ Ğ¸Ñ….',
  'verify.createSupplierAccount': 'Ğ¡Ğ¾Ğ·Ğ´Ğ°Ñ‚ÑŒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°',
  'verify.supplierOnly': 'Ğ¢Ğ¾Ğ»ÑŒĞºĞ¾ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ñ‹ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ²',
  'verify.supplierOnlyBody': 'Ğ’Ğ°Ñˆ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚ â€” {role}, Ğ¿Ğ¾ÑÑ‚Ğ¾Ğ¼Ñƒ Ñ‡ĞµĞº-Ğ»Ğ¸ÑÑ‚ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ° Ğ´Ğ»Ñ Ğ½ĞµĞ³Ğ¾ Ğ½Ğµ Ğ¿Ñ€ĞµĞ´ÑƒÑĞ¼Ğ¾Ñ‚Ñ€ĞµĞ½.',
  'verify.seeSuppliers': 'Ğ¡Ğ¼Ğ¾Ñ‚Ñ€ĞµÑ‚ÑŒ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞµĞ½Ğ½Ñ‹Ñ… Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ²',
  'verify.approved': 'ĞĞ´Ğ¾Ğ±Ñ€ĞµĞ½Ğ¾ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ğ¾Ğ²',
  'verify.waiting': 'Ğ–Ğ´ÑƒÑ‚ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ÑÑÑ‰ĞµĞ³Ğ¾',
  'verify.actionNeeded': 'ĞÑ‚ÑÑƒÑ‚ÑÑ‚Ğ²ÑƒÑÑ‚ Ğ¸Ğ»Ğ¸ Ğ²Ğ¾Ğ·Ğ²Ñ€Ğ°Ñ‰ĞµĞ½Ñ‹',
  'verify.coreApproved': 'ĞÑĞ½Ğ¾Ğ²Ğ½Ñ‹Ğµ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ñ‹ Ğ¾Ğ´Ğ¾Ğ±Ñ€ĞµĞ½Ñ‹',
  'verify.confirmed': 'ĞŸĞ¾Ğ´Ñ‚Ğ²ĞµÑ€Ğ¶Ğ´ĞµĞ½Ğ¾',
  'verify.pending': 'Ğ’ Ğ¾Ğ¶Ğ¸Ğ´Ğ°Ğ½Ğ¸Ğ¸',
  'verify.yourDocs': 'Ğ’Ğ°ÑˆĞ¸ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ñ‹',
  'verify.onFile': 'Ğ² Ğ´ĞµĞ»Ğµ: {n}',
  'verify.loadErrorTitle': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ñ‹',
  'verify.loadErrorBody':
    'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ·Ğ°Ğ³Ñ€ÑƒĞ·Ğ¸Ñ‚ÑŒ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ñ‹ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸ â€” Ğ¿Ğ¾Ğ²Ñ‚Ğ¾Ñ€Ğ¸Ñ‚Ğµ Ğ¿Ğ¾Ğ¿Ñ‹Ñ‚ĞºÑƒ. Ğ•ÑĞ»Ğ¸ Ğ½Ğµ Ğ¿Ğ¾Ğ¼Ğ¾Ğ³Ğ°ĞµÑ‚, Ñƒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ğ° Ğ¼Ğ¾Ğ¶ĞµÑ‚ ĞµÑ‰Ñ‘ Ğ½Ğµ Ğ±Ñ‹Ñ‚ÑŒ Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»Ñ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°.',
  'verify.emptyTitle': 'Ğ”Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ğ¾Ğ² Ğ² Ğ´ĞµĞ»Ğµ Ğ½ĞµÑ‚',
  'verify.emptyBody':
    'ĞŸĞ¾ĞºĞ° Ğ½Ğ¸Ñ‡ĞµĞ³Ğ¾ Ğ½Ğµ Ğ¿Ğ¾Ğ´Ğ°Ğ½Ğ¾, Ğ¿Ğ¾ÑÑ‚Ğ¾Ğ¼Ñƒ Ğ·Ğ½Ğ°Ğº Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑĞ¼ Ğ½Ğµ Ğ¿Ğ¾ĞºĞ°Ğ·Ñ‹Ğ²Ğ°ĞµÑ‚ÑÑ. ĞŸĞ¾Ğ´Ğ°Ğ¹Ñ‚Ğµ Ğ¿ĞµÑ€Ğ²Ñ‹Ğ¹ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚ Ñ‡ĞµÑ€ĞµĞ· Ñ„Ğ¾Ñ€Ğ¼Ñƒ â€” Ğ½Ğ°Ñ‡Ğ½Ğ¸Ñ‚Ğµ Ñ {first}.',
  'verify.col.document': 'Ğ”Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚',
  'verify.col.status': 'Ğ¡Ñ‚Ğ°Ñ‚ÑƒÑ',
  'verify.col.note': 'ĞŸÑ€Ğ¸Ğ¼ĞµÑ‡Ğ°Ğ½Ğ¸Ğµ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ÑÑÑ‰ĞµĞ³Ğ¾',
  'verify.col.reviewed': 'ĞŸÑ€Ğ¾Ğ²ĞµÑ€ĞµĞ½Ğ¾',
  'verify.filed': 'Ğ¿Ğ¾Ğ´Ğ°Ğ½ {date}',
  'verify.reference': 'ÑÑÑ‹Ğ»ĞºĞ°: {ref}',
  'verify.noReference': 'ÑÑÑ‹Ğ»ĞºĞ° Ğ½Ğµ ÑƒĞºĞ°Ğ·Ğ°Ğ½Ğ°',
  'verify.resubmit': 'ĞŸĞ¾Ğ´Ğ°Ñ‚ÑŒ ÑĞ½Ğ¾Ğ²Ğ°',
  'verify.tierFootnote':
    'Ğ—Ğ´ĞµÑÑŒ Ğ¿ĞµÑ€ĞµÑ‡Ğ¸ÑĞ»ĞµĞ½Ñ‹ Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ñ‹, ĞºĞ¾Ñ‚Ğ¾Ñ€Ñ‹Ğµ API Ğ²Ğ¾Ğ·Ğ²Ñ€Ğ°Ñ‰Ğ°ĞµÑ‚ Ğ´Ğ»Ñ Ğ²Ğ°ÑˆĞµĞ³Ğ¾ Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»Ñ Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ°. Ğ£ Ğ¾Ñ‚ÑÑƒÑ‚ÑÑ‚Ğ²ÑƒÑÑ‰Ğ¸Ñ… Ñ‚Ğ¸Ğ¿Ğ¾Ğ² Ğ¿Ñ€Ğ¾ÑÑ‚Ğ¾ Ğ½ĞµÑ‚ ÑÑ‚Ñ€Ğ¾ĞºĞ¸ â€” Ğ¿Ğ¾Ğ´Ğ°Ñ‡Ğ° ĞµÑ‘ ÑĞ¾Ğ·Ğ´Ğ°ÑÑ‚.',
  'verify.fileTitle': 'ĞŸĞ¾Ğ´Ğ°Ñ‚ÑŒ Ğ¸Ğ»Ğ¸ Ğ¾Ğ±Ğ½Ğ¾Ğ²Ğ¸Ñ‚ÑŒ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚',
  'verify.docType': 'Ğ¢Ğ¸Ğ¿ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ğ°',
  'verify.existingHintPre': 'Ğ£ Ğ²Ğ°Ñ ÑƒĞ¶Ğµ ĞµÑÑ‚ÑŒ ÑÑ‚Ñ€Ğ¾ĞºĞ° Ğ´Ğ»Ñ {doc} â€” ÑÑ‚Ğ°Ñ‚ÑƒÑ',
  'verify.existingHintPost':
    '. ĞŸĞ¾Ğ²Ñ‚Ğ¾Ñ€Ğ½Ğ°Ñ Ğ¿Ğ¾Ğ´Ğ°Ñ‡Ğ° Ğ¿ĞµÑ€ĞµĞ·Ğ°Ğ¿Ğ¸ÑˆĞµÑ‚ ĞµÑ‘ Ğ¸ ÑĞ±Ñ€Ğ¾ÑĞ¸Ñ‚ Ğ¿Ñ€ĞµĞ¶Ğ½ĞµĞµ Ñ€ĞµÑˆĞµĞ½Ğ¸Ğµ, Ğ¿Ğ¾ÑÑ‚Ğ¾Ğ¼Ñƒ Ğ¾Ğ´Ğ¾Ğ±Ñ€ĞµĞ½Ğ½Ñ‹Ğ¹ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚ Ğ¿Ğ¾Ñ‚Ñ€ĞµĞ±ÑƒĞµÑ‚ Ğ¿Ğ¾Ğ²Ñ‚Ğ¾Ñ€Ğ½Ğ¾Ğ³Ğ¾ Ğ¾Ğ´Ğ¾Ğ±Ñ€ĞµĞ½Ğ¸Ñ.',
  'verify.refLabel': 'Ğ¡ÑÑ‹Ğ»ĞºĞ° Ğ½Ğ° Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚',
  'verify.refPlaceholder': 'https://â€¦/business-licence.pdf Ğ¸Ğ»Ğ¸ Ğ²Ğ°Ñˆ Ğ½Ğ¾Ğ¼ĞµÑ€ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ğ°',
  'verify.refHintLead': 'Ğ—Ğ°Ğ³Ñ€ÑƒĞ·ĞºĞ° Ñ„Ğ°Ğ¹Ğ»Ğ¾Ğ² Ğ½Ğµ Ñ€ĞµĞ°Ğ»Ğ¸Ğ·Ğ¾Ğ²Ğ°Ğ½Ğ°.',
  'verify.refHintTail':
    'Ğ’ÑÑ‚Ğ°Ğ²ÑŒÑ‚Ğµ ÑÑÑ‹Ğ»ĞºÑƒ Ğ½Ğ° Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚ Ğ¸Ğ»Ğ¸ Ğ¸Ğ´ĞµĞ½Ñ‚Ğ¸Ñ„Ğ¸ĞºĞ°Ñ‚Ğ¾Ñ€, Ğ¿Ğ¾ ĞºĞ¾Ñ‚Ğ¾Ñ€Ğ¾Ğ¼Ñƒ ĞºĞ¾Ğ¼Ğ°Ğ½Ğ´Ğ° Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸ ÑĞ¼Ğ¾Ğ¶ĞµÑ‚ ĞµĞ³Ğ¾ Ğ½Ğ°Ğ¹Ñ‚Ğ¸. ĞĞ½ Ñ…Ñ€Ğ°Ğ½Ğ¸Ñ‚ÑÑ ĞºĞ°Ğº ĞµÑÑ‚ÑŒ Ğ¸ Ğ¿ÑƒĞ±Ğ»Ğ¸Ñ‡Ğ½Ğ¾ Ğ½Ğµ Ğ¿Ğ¾ĞºĞ°Ğ·Ñ‹Ğ²Ğ°ĞµÑ‚ÑÑ.',
  'verify.noteLabel': 'ĞŸÑ€Ğ¸Ğ¼ĞµÑ‡Ğ°Ğ½Ğ¸Ğµ Ğ´Ğ»Ñ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ÑÑÑ‰ĞµĞ³Ğ¾',
  'verify.notePlaceholder': 'Ğ§Ñ‚Ğ¾ Ğ¸Ğ·Ğ¼ĞµĞ½Ğ¸Ğ»Ğ¾ÑÑŒ, Ğ·Ğ°Ñ‡ĞµĞ¼ Ğ¾Ğ±Ğ½Ğ¾Ğ²Ğ»ÑĞµÑ‚ÑÑ, Ñ‡Ñ‚Ğ¾ Ğ²Ğ°Ğ¶Ğ½Ğ¾ Ğ·Ğ½Ğ°Ñ‚ÑŒ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ÑÑÑ‰ĞµĞ¼Ñƒâ€¦',
  'verify.filing': 'ĞŸĞ¾Ğ´Ğ°Ñ‡Ğ°â€¦',
  'verify.resubmitDoc': 'ĞŸĞ¾Ğ´Ğ°Ñ‚ÑŒ {doc} ÑĞ½Ğ¾Ğ²Ğ°',
  'verify.submitDoc': 'ĞŸĞ¾Ğ´Ğ°Ñ‚ÑŒ {doc}',
  'verify.queueNoteLead': 'ĞÑ‚Ğ¿Ñ€Ğ°Ğ²ĞºĞ° Ğ»Ğ¸ÑˆÑŒ ÑÑ‚Ğ°Ğ²Ğ¸Ñ‚ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚ Ğ² Ğ¾Ñ‡ĞµÑ€ĞµĞ´ÑŒ.',
  'verify.queueNoteStrong': 'Ğ—Ğ½Ğ°Ğº Ğ¿Ğ¾ÑĞ²Ğ»ÑĞµÑ‚ÑÑ Ñƒ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ĞµĞ¹, ĞºĞ¾Ğ³Ğ´Ğ° Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ÑÑÑ‰Ğ¸Ğ¹ ĞµĞ³Ğ¾ Ğ¾Ğ´Ğ¾Ğ±Ñ€Ğ¸Ñ‚',
  'verify.queueNoteTail': 'â€” Ğ½Ğ¸ĞºĞ¾Ğ³Ğ´Ğ° Ğ¿Ñ€Ğ¸ Ğ¾Ñ‚Ğ¿Ñ€Ğ°Ğ²ĞºĞµ Ğ¸ Ğ½Ğ¸ĞºĞ¾Ğ³Ğ´Ğ° Ğ°Ğ²Ñ‚Ğ¾Ğ¼Ğ°Ñ‚Ğ¸Ñ‡ĞµÑĞºĞ¸.',
  'verify.filedNotice':
    '{doc} Ğ¿Ğ¾Ğ´Ğ°Ğ½. Ğ¡Ñ‚Ğ°Ñ‚ÑƒÑ Ñ‚ĞµĞ¿ĞµÑ€ÑŒ Â«Ğ¾Ñ‚Ğ¿Ñ€Ğ°Ğ²Ğ»ĞµĞ½Â», Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚ Ğ¶Ğ´Ñ‘Ñ‚ Ğ² Ğ¾Ñ‡ĞµÑ€ĞµĞ´Ğ¸ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸ â€” Ğ·Ğ½Ğ°Ğº Ğ¿Ğ¾ÑĞ²Ğ¸Ñ‚ÑÑ Ñƒ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ĞµĞ¹ Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ğ¿Ğ¾ÑĞ»Ğµ Ğ¾Ğ´Ğ¾Ğ±Ñ€ĞµĞ½Ğ¸Ñ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ÑÑÑ‰Ğ¸Ğ¼.',
  'verify.errFile': 'ĞĞµ ÑƒĞ´Ğ°Ğ»Ğ¾ÑÑŒ Ğ¿Ğ¾Ğ´Ğ°Ñ‚ÑŒ ÑÑ‚Ğ¾Ñ‚ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚.',
  'verify.statusMeans': 'Ğ§Ñ‚Ğ¾ Ğ¾Ğ·Ğ½Ğ°Ñ‡Ğ°ĞµÑ‚ ĞºĞ°Ğ¶Ğ´Ñ‹Ğ¹ ÑÑ‚Ğ°Ñ‚ÑƒÑ',
  'verify.tierTitle': 'Ğ£Ñ€Ğ¾Ğ²ĞµĞ½ÑŒ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸',
  'verify.tierAll': 'ĞŸÑ€Ğ¾Ğ²ĞµÑ€ĞµĞ½ Â· Ğ²ÑĞµ Ğ¾ÑĞ½Ğ¾Ğ²Ğ½Ñ‹Ğµ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ñ‹ Ğ¾Ğ´Ğ¾Ğ±Ñ€ĞµĞ½Ñ‹',
  'verify.tierSome': 'ĞŸÑ€Ğ¾Ğ²ĞµÑ€ĞµĞ½ Â· Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ñ‹ Ğ¾Ğ´Ğ¾Ğ±Ñ€ĞµĞ½Ñ‹',
  'verify.tierNone': 'ĞŸĞ¾ĞºĞ° Ğ½Ğµ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞµĞ½',
  'verify.tierAllBody': 'ĞšĞ°Ğ¶Ğ´Ñ‹Ğ¹ Ñ‚Ğ¸Ğ¿ Ğ¾ÑĞ½Ğ¾Ğ²Ğ½Ñ‹Ñ… Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ğ¾Ğ² Ğ½Ğ° ÑÑ‚Ğ¾Ğ¹ ÑÑ‚Ñ€Ğ°Ğ½Ğ¸Ñ†Ğµ Ğ¾Ğ´Ğ¾Ğ±Ñ€ĞµĞ½ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ÑÑÑ‰Ğ¸Ğ¼.',
  'verify.tierSomeBody': 'ĞĞ´Ğ¾Ğ±Ñ€ĞµĞ½ Ñ…Ğ¾Ñ‚Ñ Ğ±Ñ‹ Ğ¾Ğ´Ğ¸Ğ½ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚{n}; Ğ¾ÑÑ‚Ğ°Ğ»ÑŒĞ½Ñ‹Ğµ Ğ¾ÑĞ½Ğ¾Ğ²Ğ½Ñ‹Ğµ Ñ‚Ğ¸Ğ¿Ñ‹ ÑƒÑĞ¸Ğ»ÑÑ‚ Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»ÑŒ.',
  'verify.tierNoneBody': 'ĞĞ¸ Ğ¾Ğ´Ğ¸Ğ½ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚ Ğ¿Ğ¾ĞºĞ° Ğ½Ğµ Ğ¾Ğ´Ğ¾Ğ±Ñ€ĞµĞ½, Ğ¿Ğ¾ÑÑ‚Ğ¾Ğ¼Ñƒ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑĞ¼ Ğ½Ğµ Ğ¿Ğ¾ĞºĞ°Ğ·Ñ‹Ğ²Ğ°ĞµÑ‚ÑÑ Ğ·Ğ½Ğ°Ğº Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸ Ğ²Ğ°ÑˆĞµĞ¹ ĞºĞ¾Ğ¼Ğ¿Ğ°Ğ½Ğ¸Ğ¸.',
  'verify.tierHint':
    'Ğ£Ñ€Ğ¾Ğ²ĞµĞ½ÑŒ Ğ°ĞºĞºĞ°ÑƒĞ½Ñ‚Ğ° ÑƒÑÑ‚Ğ°Ğ½Ğ°Ğ²Ğ»Ğ¸Ğ²Ğ°ĞµÑ‚ ĞºĞ¾Ğ¼Ğ°Ğ½Ğ´Ğ° Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸ Ğ¿Ğ¾ Ğ¾Ğ´Ğ¾Ğ±Ñ€ĞµĞ½Ğ½Ñ‹Ğ¼ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ğ°Ğ¼ â€” ÑÑ‚Ğ¾Ñ‚ ÑĞºÑ€Ğ°Ğ½ Ğ¿Ğ¾ĞºĞ°Ğ·Ñ‹Ğ²Ğ°ĞµÑ‚ ÑÑ‚Ğ°Ñ‚ÑƒÑÑ‹ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ğ¾Ğ², ĞºĞ¾Ñ‚Ğ¾Ñ€Ñ‹Ğµ Ğ²Ğ¾Ğ·Ğ²Ñ€Ğ°Ñ‰Ğ°ĞµÑ‚ API, Ğ¸ Ğ½Ğµ Ğ²Ñ‹Ñ‡Ğ¸ÑĞ»ÑĞµÑ‚ Ğ½Ğ¾Ğ¼ĞµÑ€ ÑƒÑ€Ğ¾Ğ²Ğ½Ñ ÑĞ°Ğ¼. ĞŸĞ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ğ¸ Ğ²Ğ¸Ğ´ÑÑ‚ Ğ·Ğ½Ğ°Ğº Ñ‚Ğ¾Ğ»ÑŒĞºĞ¾ Ğ¿Ğ¾ Ğ¾Ğ´Ğ¾Ğ±Ñ€ĞµĞ½Ğ½Ñ‹Ğ¼ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ğ°Ğ¼.',
  'verify.suggested': 'Ğ ĞµĞºĞ¾Ğ¼ĞµĞ½Ğ´ÑƒĞµĞ¼Ñ‹Ğ¹ ÑĞ»ĞµĞ´ÑƒÑÑ‰Ğ¸Ğ¹:',
  'verify.select': 'Ğ’Ñ‹Ğ±Ñ€Ğ°Ñ‚ÑŒ',
  'verify.othersNote':
    'ĞŸĞ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ğ¸ Ñ‚Ğ°ĞºĞ¶Ğµ Ğ²Ğ¸Ğ´ÑÑ‚ Ñ€ĞµĞ¹Ñ‚Ğ¸Ğ½Ğ³Ğ¸ Ğ¸ Ñ‡Ğ¸ÑĞ»Ğ¾ Ğ¸Ğ½ÑĞ¿ĞµĞºÑ†Ğ¸Ğ¹ Ğ´Ñ€ÑƒĞ³Ğ¸Ñ… Ğ¿Ğ¾ÑÑ‚Ğ°Ğ²Ñ‰Ğ¸ĞºĞ¾Ğ² Ğ² Ğ¸Ñ… Ğ¿Ñ€Ğ¾Ñ„Ğ¸Ğ»ÑÑ…. Ğ­Ñ‚Ğ¸ Ğ´Ğ°Ğ½Ğ½Ñ‹Ğµ â€” Ğ´ĞµĞ¼Ğ¾Ğ½ÑÑ‚Ñ€Ğ°Ñ†Ğ¸Ğ¾Ğ½Ğ½Ñ‹Ğµ Ğ´Ğ°Ğ½Ğ½Ñ‹Ğµ Ğ¿Ğ»Ğ¾Ñ‰Ğ°Ğ´ĞºĞ¸, Ğ° Ğ½Ğµ Ñ€ĞµĞ·ÑƒĞ»ÑŒÑ‚Ğ°Ñ‚ ÑÑ‚Ğ¾Ğ³Ğ¾ Ñ‡ĞµĞº-Ğ»Ğ¸ÑÑ‚Ğ°, Ğ¿Ğ¾ÑÑ‚Ğ¾Ğ¼Ñƒ Ğ·Ğ´ĞµÑÑŒ Ğ¾Ğ½Ğ¸ Ğ½Ğ°Ğ¼ĞµÑ€ĞµĞ½Ğ½Ğ¾ Ğ½Ğµ Ğ¿Ğ¾ĞºĞ°Ğ·Ñ‹Ğ²Ğ°ÑÑ‚ÑÑ.',
  'verify.help.missing.title': 'ĞĞµ Ğ¿Ğ¾Ğ´Ğ°Ğ½',
  'verify.help.missing.state': 'Ğ•Ñ‰Ñ‘ Ğ½Ğ¸Ñ‡ĞµĞ³Ğ¾ Ğ½Ğµ Ğ¿Ğ¾Ğ´Ğ°Ğ½Ğ¾, Ğ¸Ğ»Ğ¸ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚ Ğ½Ğµ Ğ¾Ñ‚Ğ¿Ñ€Ğ°Ğ²Ğ»ÑĞ»ÑÑ.',
  'verify.help.submitted.title': 'Ğ–Ğ´Ñ‘Ñ‚ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸',
  'verify.help.submitted.state': 'ĞŸĞ¾Ğ´Ğ°Ğ½ Ğ¸ Ğ¶Ğ´Ñ‘Ñ‚ Ğ² Ğ¾Ñ‡ĞµÑ€ĞµĞ´Ğ¸ Ğ¿Ñ€Ğ¾Ğ²ĞµÑ€ĞºĞ¸. ĞŸĞ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»ÑĞ¼ Ğ·Ğ½Ğ°Ğº Ğ¿Ğ¾ĞºĞ° Ğ½Ğµ Ğ¿Ğ¾ĞºĞ°Ğ·Ñ‹Ğ²Ğ°ĞµÑ‚ÑÑ.',
  'verify.help.approved.title': 'ĞĞ´Ğ¾Ğ±Ñ€ĞµĞ½',
  'verify.help.approved.state': 'ĞŸÑ€Ğ¾Ğ²ĞµÑ€ÑÑÑ‰Ğ¸Ğ¹ ÑĞ²ĞµÑ€Ğ¸Ğ» ĞµĞ³Ğ¾ Ñ ÑĞ°Ğ¼Ğ¸Ğ¼ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚Ğ¾Ğ¼. Ğ­Ñ‚Ğ¾ Ğ¸ Ğ²Ğ¸Ğ´ÑÑ‚ Ğ¿Ğ¾ĞºÑƒĞ¿Ğ°Ñ‚ĞµĞ»Ğ¸.',
  'verify.help.rejected.title': 'Ğ’Ğ¾Ğ·Ğ²Ñ€Ğ°Ñ‰Ñ‘Ğ½',
  'verify.help.rejected.state': 'ĞÑ‚ĞºĞ»Ğ¾Ğ½Ñ‘Ğ½ Ñ Ğ¿Ñ€Ğ¸Ğ¼ĞµÑ‡Ğ°Ğ½Ğ¸ĞµĞ¼. Ğ˜ÑĞ¿Ñ€Ğ°Ğ²ÑŒÑ‚Ğµ Ğ´Ğ¾ĞºÑƒĞ¼ĞµĞ½Ñ‚ Ğ¸ Ğ¿Ğ¾Ğ´Ğ°Ğ¹Ñ‚Ğµ ÑĞ½Ğ¾Ğ²Ğ°.',
  'verify.doc.businessLicence': 'Ğ¡Ğ²Ğ¸Ğ´ĞµÑ‚ĞµĞ»ÑŒÑÑ‚Ğ²Ğ¾ Ğ¾ Ñ€ĞµĞ³Ğ¸ÑÑ‚Ñ€Ğ°Ñ†Ğ¸Ğ¸ Ğ±Ğ¸Ğ·Ğ½ĞµÑĞ°',
  'verify.doc.taxCertificate': 'ĞĞ°Ğ»Ğ¾Ğ³Ğ¾Ğ²Ğ¾Ğµ ÑĞ²Ğ¸Ğ´ĞµÑ‚ĞµĞ»ÑŒÑÑ‚Ğ²Ğ¾',
  'verify.doc.factoryAudit': 'ĞÑ‚Ñ‡Ñ‘Ñ‚ Ğ¾Ğ± Ğ°ÑƒĞ´Ğ¸Ñ‚Ğµ Ğ·Ğ°Ğ²Ğ¾Ğ´Ğ°',
  'verify.doc.productCert': 'Ğ¡ĞµÑ€Ñ‚Ğ¸Ñ„Ğ¸ĞºĞ°Ñ‚ Ğ½Ğ° Ğ¿Ñ€Ğ¾Ğ´ÑƒĞºÑ†Ğ¸Ñ',
  'verify.doc.exportLicence': 'Ğ­ĞºÑĞ¿Ğ¾Ñ€Ñ‚Ğ½Ğ°Ñ Ğ»Ğ¸Ñ†ĞµĞ½Ğ·Ğ¸Ñ',
};

const zh: Partial<Record<DictKey, string>> = {
  'status.open': 'å¼€æ”¾ä¸­',
  'status.quoted': 'å·²æŠ¥ä»·',
  'status.closed': 'å·²å…³é—­',
  'status.submitted': 'å·²æäº¤',
  'status.accepted': 'å·²æ¥å—',
  'status.rejected': 'å·²æ‹’ç»',
  'status.active': 'åœ¨å”®',
  'status.sold_out': 'å·²å”®ç½„',
  'status.scheduled': 'å·²æ’æœŸ',
  'status.in_progress': 'è¿›è¡Œä¸­',
  'status.passed': 'å·²é€šè¿‡',
  'status.failed': 'æœªé€šè¿‡',
  'status.pending': 'å¾…å¤„ç†',
  'status.paid': 'å·²ä»˜æ¬¾',
  'status.shipped': 'å·²å‘è´§',
  'status.delivered': 'å·²é€è¾¾',
  'status.cancelled': 'å·²å–æ¶ˆ',
  'status.missing': 'æœªæäº¤',
  'status.approved': 'å·²æ ¸å‡†',
  'status.countered': 'å·²è¿˜ç›˜',
  'status.withdrawn': 'å·²æ’¤å›',
  'status.inspecting': 'æ£€éªŒè¿›è¡Œä¸­',

  'action.close': 'å…³é—­',
  'action.cancel': 'å–æ¶ˆ',
  'action.dismiss': 'å¿½ç•¥',
  'action.refresh': 'åˆ·æ–°',
  'action.refreshing': 'æ­£åœ¨åˆ·æ–°â€¦',
  'action.tryAgain': 'é‡è¯•',
  'action.clear': 'æ¸…é™¤',
  'action.clearFilters': 'æ¸…é™¤ç­›é€‰',
  'action.search': 'æœç´¢',
  'action.save': 'ä¿å­˜æ›´æ”¹',
  'action.discard': 'æ”¾å¼ƒ',
  'action.signIn': 'ç™»å½•',
  'action.signOut': 'é€€å‡ºç™»å½•',
  'action.signingIn': 'æ­£åœ¨ç™»å½•â€¦',
  'action.joinFree': 'å…è´¹æ³¨å†Œ',
  'action.createAccount': 'åˆ›å»ºè´¦å·',
  'action.creatingAccount': 'æ­£åœ¨åˆ›å»ºè´¦å·â€¦',
  'action.backToExplore': 'è¿”å›æµè§ˆ',
  'action.open': 'æ‰“å¼€',
  'action.edit': 'ç¼–è¾‘',
  'action.delete': 'åˆ é™¤',

  'common.loading': 'åŠ è½½ä¸­â€¦',
  'common.loadingEllipsis': 'åŠ è½½ä¸­â€¦',
  'common.notSet': 'æœªå¡«å†™',
  'common.optional': 'é€‰å¡«',
  'common.required': 'å¿…å¡«',
  'common.newestFirst': 'æœ€æ–°ä¼˜å…ˆ',
  'common.anyCountry': 'ä¸é™å›½å®¶',
  'common.allCountries': 'å…¨éƒ¨å›½å®¶',
  'common.verified': 'å·²è®¤è¯',
  'common.tradeAbbrev':
    'RFQ = è¯¢ä»·å• Â· MOQ = æœ€å°èµ·è®¢é‡ Â· FOB = èˆ¹ä¸Šäº¤è´§ Â· TT = ç”µæ±‡',

  'nav.feed': 'é¦–é¡µ',
  'nav.explore': 'æµè§ˆ',
  'nav.exploreStock': 'æµè§ˆç°è´§',
  'nav.offersBuyer': 'æˆ‘çš„æŠ¥ä»·',
  'nav.rfqs': 'æˆ‘çš„è¯¢ä»·å•',
  'nav.orders': 'è®¢å•',
  'nav.shipments': 'ç‰©æµ',
  'nav.messages': 'æ¶ˆæ¯',
  'nav.saved': 'å·²æ”¶è—',
  'nav.savedLots': 'æ”¶è—çš„è´§æº',
  'nav.notifications': 'é€šçŸ¥',
  'nav.help': 'å¸®åŠ©ä¸­å¿ƒ',
  'nav.helpCentre': 'å¸®åŠ©ä¸­å¿ƒ',
  'nav.howItWorks': 'è¿ä½œæ–¹å¼',
  'nav.profile': 'è´¦å·èµ„æ–™',
  'nav.listings': 'æˆ‘çš„è´§æº',
  'nav.post': 'å‘å¸ƒè´§æº',
  'nav.postStock': 'å‘å¸ƒè´§æº',
  'nav.offersSup': 'æŠ¥ä»·',
  'nav.rfqOpps': 'è¯¢ä»·æœºä¼š',
  'nav.verification': 'èµ„è´¨è®¤è¯',
  'nav.suppliers': 'ä¾›åº”å•†',
  'nav.overview': 'æ€»è§ˆ',
  'nav.adminSuppliers': 'ä¾›åº”å•†',
  'nav.adminVerify': 'è®¤è¯å®¡æ ¸å°',
  'nav.adminListings': 'è´§æº',
  'nav.adminRfqs': 'è¯¢ä»·å•',
  'nav.adminPayments': 'ä»˜æ¬¾',
  'nav.sources': 'è´§æºæ¸ é“',
  'nav.growth': 'æ¨ªå¹…ä¸æ¨å¹¿',
  'nav.features': 'åŠŸèƒ½å¼€å…³',

  'topbar.searchPlaceholder': 'æœç´¢äº§å“ã€ä¾›åº”å•†ã€ç±»ç›®â€¦',
  'topbar.searchAria': 'æœç´¢å¹³å°å†…å®¹',
  'topbar.notifications': 'é€šçŸ¥',
  'topbar.createAccountTitle': 'åˆ›å»ºè´¦å·',
  'topbar.account': 'è´¦å·',
  'topbar.languageAria': 'ç•Œé¢è¯­è¨€',
  'rail.allIndustries': 'å…¨éƒ¨è¡Œä¸š',
  'rail.howItWorks': 'è¿ä½œæ–¹å¼',
  'sidebar.moreIndustries': 'æ›´å¤šè¡Œä¸šï¼Œæ›´å¤šå›½å®¶ã€‚',
  'sidebar.moreIndustriesSub': 'ä¸€ä¸ªç°è´§äº¤æ˜“å¹³å°ã€‚',

  'gate.title': 'ä¼šå‘˜æƒé™',
  'gate.body': 'è”ç³»ä¾›åº”å•†ã€å‘å¸ƒè¯¢ä»·å’ŒæŠ¥ä»·å‡ä¸ºä¼šå‘˜æ“ä½œã€‚æµè§ˆå¹³å°å§‹ç»ˆå…è´¹å¼€æ”¾ã€‚',
  'gate.createAccount': 'åˆ›å»ºå…è´¹è´¦å·',
  'gate.haveAccount': 'æˆ‘å·²æœ‰è´¦å·',

  'cards.noPhoto': 'æš‚æ— å›¾ç‰‡',
  'cards.moq': 'MOQ',
  'cards.saveLot': 'æ”¶è—è¯¥è´§æº',
  'cards.demo': 'æ¼”ç¤º',
  'cards.demoTitle': 'æ¼”ç¤ºæ•°æ® â€” å¹¶éçœŸå®æŠ¥ä»·',
  'cards.inspections': 'æ¬¡æ£€éªŒ',

  'auth.signIn.sub': 'æŸ¥çœ‹æ‚¨çš„è®¢å•ã€æŠ¥ä»·å’Œè¯¢ä»·å•ã€‚',
  'auth.email': 'é‚®ç®±',
  'auth.password': 'å¯†ç ',
  'auth.signInCta': 'ç™»å½•',
  'auth.newHere': 'é¦–æ¬¡æ¥è®¿ï¼Ÿ',
  'auth.demoNotice': 'æ¼”ç¤ºæç¤º',
  'auth.seededLogin': 'é¢„ç½®å®¡æ ¸è´¦å·',
  'auth.fillIn': 'å¡«å…¥',
  'auth.demoHintLead': 'æ˜¯é¢„ç½®çš„',
  'auth.demoHintLead2': 'æ¼”ç¤º',
  'auth.demoHintTail': 'è´¦å·ï¼Œç”¨äºä½“éªŒç®¡ç†åå°ã€‚å®ƒä¸æ˜¯çœŸå®å–å®¶ â€” è¯·å‹¿è¾“å…¥çœŸå®å‡­æ®ã€‚',
  'auth.demoHintProduct': 'ç®¡ç†å‘˜',
  'auth.signInFailed': 'ç™»å½•å¤±è´¥',
  'auth.signUp.title': 'åˆ›å»ºè´¦å·',
  'auth.signUp.sub': 'ä¸€ä¸ªè´¦å·å³å¯é‡‡è´­ã€é”€å”®ï¼Œæˆ–æä¾›æ£€éªŒä¸ç‰©æµæœåŠ¡ã€‚',
  'auth.fullName': 'å§“å',
  'auth.workEmail': 'å·¥ä½œé‚®ç®±',
  'auth.minChars': 'è‡³å°‘ 8 ä¸ªå­—ç¬¦',
  'auth.atLeast8': 'è‡³å°‘ 8 ä¸ªå­—ç¬¦ã€‚',
  'auth.iAmA': 'æˆ‘çš„èº«ä»½æ˜¯â€¦',
  'auth.company': 'å…¬å¸',
  'auth.country': 'å›½å®¶',
  'auth.countryHint': 'åœŸè€³å…¶ã€ä¸­å›½â€¦',
  'auth.createCta': 'åˆ›å»ºè´¦å·',
  'auth.alreadyRegistered': 'å·²æ³¨å†Œï¼Ÿ',
  'auth.signUpHint': 'å‘å¸ƒå…è´¹ã€‚ä¿¡ä»»æ ‡è¯†éœ€é€šè¿‡è®¤è¯ã€æ£€éªŒå’Œäº¤ä»˜è®°å½•è·å¾—ã€‚',
  'auth.registerFailed': 'æ³¨å†Œå¤±è´¥',
  'auth.role.buyer': 'é‡‡è´­æ–¹',
  'auth.role.buyerHint': 'æˆ‘é‡‡è´­äº§å“',
  'auth.role.supplier': 'ä¾›åº”å•†',
  'auth.role.supplierHint': 'æˆ‘é”€å”® / ç”Ÿäº§',
  'auth.role.inspector': 'æ£€éªŒæœºæ„',
  'auth.role.inspectorHint': 'æˆ‘å®¡æ ¸å·¥å‚',
  'auth.role.lab': 'å®éªŒå®¤',
  'auth.role.labHint': 'æˆ‘æ£€æµ‹ææ–™',
  'auth.role.logistics': 'ç‰©æµ',
  'auth.role.logisticsHint': 'æˆ‘è¿è¾“è´§ç‰©',

  'profile.title': 'è´¦å·èµ„æ–™',
  'profile.sub': 'å¯¹æ–¹åœ¨æ‚¨çš„æŠ¥ä»·ã€è®¢å•å’Œæ¶ˆæ¯ä¸­çœ‹åˆ°çš„ä¿¡æ¯ã€‚',
  'profile.signInSub': 'ç™»å½•ä»¥ç®¡ç†æ‚¨çš„è´¦å·',
  'profile.notSignedIn': 'æ‚¨å°šæœªç™»å½•',
  'profile.notSignedInBody': 'è´¦å·èµ„æ–™ä»…æ‚¨æœ¬äººå¯è§ï¼šç™»å½•åå³å¯æŸ¥çœ‹å’Œç¼–è¾‘ã€‚',
  'profile.createAccount': 'åˆ›å»ºè´¦å·',
  'profile.accountDetails': 'è´¦å·ä¿¡æ¯',
  'profile.unsaved': 'æœ‰æœªä¿å­˜çš„æ›´æ”¹',
  'profile.fullName': 'å§“å',
  'profile.company': 'å…¬å¸',
  'profile.notSet': 'æœªå¡«å†™',
  'profile.country': 'å›½å®¶',
  'profile.language': 'ç•Œé¢è¯­è¨€',
  'profile.languageHint': 'ç«‹å³åˆ‡æ¢ç•Œé¢è¯­è¨€ï¼Œå¹¶åœ¨ç‚¹å‡»â€œä¿å­˜æ›´æ”¹â€ååŒæ­¥åˆ°æ‚¨çš„è´¦å·ã€‚',
  'profile.save': 'ä¿å­˜æ›´æ”¹',
  'profile.saving': 'æ­£åœ¨ä¿å­˜â€¦',
  'profile.saved': 'å·²ä¿å­˜',
  'profile.savedBody': 'è´¦å·èµ„æ–™å·²æ›´æ–°ã€‚',
  'profile.identity': 'èº«ä»½ä¿¡æ¯',
  'profile.identityNote': 'é‚®ç®±å’Œè§’è‰²æ— æ³•åœ¨æ­¤ä¿®æ”¹ã€‚å®ƒä»¬åœ¨åˆ›å»ºè´¦å·æ—¶å³å·²å›ºå®šï¼Œè´¦å·èµ„æ–™æ¥å£ä¹Ÿä¸æ¥å—è¿™ä¸¤é¡¹ã€‚',
  'profile.email': 'é‚®ç®±',
  'profile.role': 'è§’è‰²',
  'profile.readOnly': 'åªè¯»',
  'profile.readOnlyEmail': 'åªè¯» â€” è´¦å·èµ„æ–™æ¥å£ä¸æ¥å—é‚®ç®±',
  'profile.readOnlyRole': 'åªè¯» â€” è´¦å·èµ„æ–™æ¥å£ä¸æ¥å—è§’è‰²',
  'profile.emailStatus': 'é‚®ç®±çŠ¶æ€',
  'profile.emailVerified': 'é‚®ç®±å·²éªŒè¯',
  'profile.emailNotVerified': 'é‚®ç®±æœªéªŒè¯',
  'profile.memberSince': 'æ³¨å†Œæ—¶é—´',
  'profile.accountLine': 'è´¦å· #{id} Â· ä»¥ {role} èº«ä»½ç™»å½•',
  'profile.errName': 'è¯·è¾“å…¥å§“å â€” æ¥å£ä¸æ¥å—ç©ºå§“åã€‚',
  'profile.errSave': 'è´¦å·èµ„æ–™ä¿å­˜å¤±è´¥ â€” è¯·é‡è¯•ã€‚',

  'explore.title': 'æµè§ˆç°è´§',
  'explore.subLoading': 'æ­£åœ¨åŠ è½½ç°è´§è´§æºâ€¦',
  'explore.subCount': '{n} æ¡è´§æºç¬¦åˆæ‚¨çš„ç­›é€‰',
  'explore.searchPlaceholder': 'é“œé˜´æã€æ³µç±»â€¦',
  'explore.searchAria': 'æœç´¢è´§æº',
  'explore.categoryAria': 'ç±»ç›®',
  'explore.allCategories': 'å…¨éƒ¨ç±»ç›®',
  'explore.originAria': 'åŸäº§å›½',
  'explore.allCountries': 'å…¨éƒ¨å›½å®¶',
  'explore.min': 'æœ€ä½ $',
  'explore.max': 'æœ€é«˜ $',
  'explore.emptyTitle': 'æ²¡æœ‰ç¬¦åˆè¿™äº›ç­›é€‰çš„è´§æº',
  'explore.emptyBody': 'è¯·å°è¯•æ›´å®½çš„ç±»ç›®ã€ä¸åŒçš„åŸäº§å›½ï¼Œæˆ–æ¸…é™¤ç­›é€‰æ¡ä»¶ã€‚',
  'explore.page': 'ç¬¬ {page} é¡µï¼Œå…± {pages} é¡µ',
  'explore.prev': 'â† ä¸Šä¸€é¡µ',
  'explore.next': 'ä¸‹ä¸€é¡µ â†’',

  'feed.welcomeBack': 'æ¬¢è¿å›æ¥ï¼Œ{name}',
  'feed.title': 'å¹³å°é¦–é¡µ',
  'feed.sub': 'æ¥è‡ªå·²è®¤è¯å·¥å‚çš„ç°è´§ã€ä½™æ–™å’Œè¶…å‚¨è´§æº â€” æœ€æ–°ä¼˜å…ˆã€‚',
  'feed.sellStock': 'æˆ‘è¦å–è´§',
  'feed.postRequest': 'å‘å¸ƒè¯¢ä»·',
  'feed.lotsCount': '{n} æ¡è´§æº',
  'feed.lotsMatch': 'æ¡è´§æºç¬¦åˆæ‚¨çš„ç­›é€‰',
  'feed.verifiedSuppliers': 'å®¶å·²è®¤è¯ä¾›åº”å•†',
  'feed.openRequests': 'æ¡å¼€æ”¾è¯¢ä»·',
  'feed.allOrigins': 'å…¨éƒ¨äº§åœ°',
  'feed.searchAria': 'æœç´¢è´§æº',
  'feed.minAria': 'æœ€ä½ä»·æ ¼',
  'feed.maxAria': 'æœ€é«˜ä»·æ ¼',
  'feed.allIndustries': 'å…¨éƒ¨è¡Œä¸š',
  'feed.noLots': 'æš‚æ— è´§æº',
  'feed.shownRange': '{total} æ¡ä¸­çš„ç¬¬ {first}â€“{last} æ¡',
  'feed.emptyTitle': 'æ²¡æœ‰ç¬¦åˆè¿™äº›ç­›é€‰çš„è´§æº',
  'feed.emptyBody': 'è¯·å°è¯•å…¶ä»–è¡Œä¸šã€å…¶ä»–åŸäº§å›½ï¼Œæˆ–æ¸…é™¤ç­›é€‰æ¡ä»¶ã€‚',
  'feed.lookingFor': 'åœ¨æ‰¾ç‰¹å®šè´§æºï¼Ÿ',
  'feed.postRequestLink': 'å‘å¸ƒè¯¢ä»·',
  'feed.lookingForTail': 'è®©å·²è®¤è¯å·¥å‚ä¸ºæ‚¨æŠ¥ä»·ã€‚',
  'feed.sellingInstead': 'æƒ³å‡ºå”®ï¼Ÿ',
  'feed.listYourStock': 'å‘å¸ƒæ‚¨çš„è´§æº',
  'feed.signedInAs': 'å·²ä»¥ {role} èº«ä»½ç™»å½•',
  'feed.createFree': 'åˆ›å»ºå…è´¹è´¦å·',

  'help.title': 'FactoryDepo å¦‚ä½•è¿ä½œ',
  'help.sub': 'ç°è´§è´§æºã€è¯¢ä»·å•ï¼Œä»¥åŠä»¥æ£€éªŒä¸ºæ”¯æ’‘çš„ä¾›åº”ã€‚',
  'help.buying': 'é‡‡è´­',
  'help.buying1.title': '1. æµè§ˆç°è´§ã€‚',
  'help.buying1':
    'æ¯æ¡åœ¨å”®è´§æºéƒ½ä¼šæ˜¾ç¤ºä»·æ ¼ã€æœ€å°èµ·è®¢é‡ã€åŸäº§å›½ä»¥åŠå®é™…å¯å”®æ•°é‡ã€‚æ ‡æ³¨â€œæ¼”ç¤ºâ€çš„è´§æºæ˜¯æ¼”ç¤ºæ•°æ®ï¼Œå¹¶éçœŸå®æŠ¥ä»·ï¼Œæˆ‘ä»¬æ˜ç¡®æ ‡æ³¨ä»¥å…è¯¯å¯¼ã€‚',
  'help.buying2.title': '2. ç´¢å–æŠ¥ä»·ã€‚',
  'help.buying2': 'å‘å¸ƒè¯¢ä»·è¯´æ˜æ‚¨çš„éœ€æ±‚ã€‚ä¾›åº”å•†ä¼šé’ˆå¯¹è¯¥è¯¢ä»·ç»™å‡ºä»·æ ¼ã€äº¤æœŸå’Œæ¡æ¬¾ã€‚',
  'help.buying3.title': '3. æ¯”è¾ƒå¹¶ä¸‹å•ã€‚',
  'help.buying3': 'æŠ¥ä»·ä¼šåœ¨è¯¢ä»·å•ä¸­å¹¶æ’æ˜¾ç¤ºã€‚æ¥å—å…¶ä¸­ä¸€ä¸ªå³ç”Ÿæˆè®¢å•ã€‚',
  'help.buying4.title': '4. é€šè¿‡é“¶è¡Œè½¬è´¦ä»˜æ¬¾ã€‚',
  'help.buying4':
    'å·¥ä¸šè´¸æ˜“ä¸èµ°ä¿¡ç”¨å¡ã€‚æ‚¨ä¼šæ”¶åˆ°å½¢å¼å‘ç¥¨ï¼Œä»¥ TT/ç”µæ±‡ç»“ç®—ï¼Œæ¬¾é¡¹ç¡®è®¤åè®¢å•æ ‡è®°ä¸ºå·²ä»˜æ¬¾ã€‚',
  'help.selling': 'é”€å”®',
  'help.selling1.title': '1. åˆ›å»ºä¾›åº”å•†è´¦å·ã€‚',
  'help.selling1': 'ä»¥ä¾›åº”å•†èº«ä»½æ³¨å†Œä¼šç«‹å³åˆ›å»ºæ‚¨çš„å…¬å¸èµ„æ–™ã€‚',
  'help.selling2.title': '2. å‘å¸ƒæ‚¨çš„è´§æºã€‚',
  'help.selling2': 'å‘å¸ƒå·¥å…·æ­£åœ¨å¼€å‘ä¸­ â€” ä¸Šçº¿å‰ï¼Œä¾›åº”å•†è´§æºç”±æˆ‘ä»¬çš„å›¢é˜Ÿåœ¨å…¥é©»æ—¶æ·»åŠ ã€‚',
  'help.selling3.title': '3. å¯¹æ”¶åˆ°çš„è¯¢ä»·æŠ¥ä»·ã€‚',
  'help.selling3': 'ä¹°å®¶çš„å¼€æ”¾è¯¢ä»·ä¼šå‡ºç°åœ¨æ‚¨çš„çœ‹æ¿ä¸­ï¼Œå¹¶å®æ—¶æ˜¾ç¤ºæœªå›å¤æ•°é‡ã€‚',
  'help.selling4.title': '4. å®Œæˆè®¤è¯ã€‚',
  'help.selling4': 'è®¤è¯ç­‰çº§ä¼šè§£é”æ›å…‰ã€‚åªæœ‰æ–‡ä»¶å®¡æ ¸é€šè¿‡æ‰ä¼šæˆäºˆæ ‡è¯†ï¼Œå› æ­¤æœ¬ç«™çš„æ ‡è¯†æ˜¯æœ‰æ„ä¹‰çš„ã€‚',
  'help.notLive': 'å°šæœªä¸Šçº¿çš„åŠŸèƒ½',
  'help.notLiveLead': 'æˆ‘ä»¬å®æ„¿ç›´è¯´ï¼Œä¹Ÿä¸æ„¿è®©æ‚¨è‡ªå·±å‘ç°ï¼š',
  'help.notLive1': 'ä¾›åº”å•†è‡ªåŠ©å‘å¸ƒå·¥å…·æ­£åœ¨å¼€å‘ä¸­ã€‚',
  'help.notLive2': 'ä¹°å–åŒæ–¹çš„æ¶ˆæ¯åŠŸèƒ½å°šæœªå¼€æ”¾ â€” è¯·ä½¿ç”¨ä¾›åº”å•†èµ„æ–™é¡µä¸Šçš„è”ç³»æ–¹å¼ã€‚',
  'help.notLive3': 'æŠ¥ä»·ä¸è¿˜ç›˜ç›®å‰ç”±äººå·¥å¤„ç†ã€‚',
  'help.notLive4': 'ç‰©æµè·Ÿè¸ªä¸å•æ®å¤„ç†å°šæœªå¼€å‘ã€‚',
  'help.exploreCta': 'æµè§ˆç°è´§',
  'help.rfqCta': 'è¯¢ä»·å•',

  'soon.sub': 'å°šæœªå¼€å‘',
  'soon.title': 'è¯¥é¡µé¢å±äºä¸‹ä¸€é˜¶æ®µå¼€å‘å†…å®¹',
  'soon.body': 'è¯¥é¡µé¢å·²å­˜åœ¨äºå¯¼èˆªä¸­ï¼Œä½†æ•°æ®è¡¨æ ¼å’Œæ¥å£å°šæœªå¼€å‘ã€‚',
  'soon.note.offers': 'æŠ¥ä»·ä¸è¿˜ç›˜è¡¨æ ¼å°†åœ¨ä¸‹ä¸€é˜¶æ®µå¼€å‘ä¸­ä¸Šçº¿ã€‚',
  'soon.note.shipments': 'ç‰©æµèŠ‚ç‚¹ä¸å•æ®å°†åœ¨ä¸‹ä¸€é˜¶æ®µå¼€å‘ä¸­ä¸Šçº¿ã€‚',
  'soon.note.messages': 'ä¹°å–åŒæ–¹çš„æ¶ˆæ¯åŠŸèƒ½å°†åœ¨ä¸‹ä¸€é˜¶æ®µå¼€å‘ä¸­ä¸Šçº¿ã€‚',
  'soon.note.saved': 'æ”¶è—çš„è´§æºå°†åœ¨ä¸‹ä¸€é˜¶æ®µå¼€å‘ä¸­ä¸Šçº¿ã€‚',
  'soon.note.notifications': 'é€šçŸ¥ä¸­å¿ƒå°†åœ¨ä¸‹ä¸€é˜¶æ®µå¼€å‘ä¸­ä¸Šçº¿ã€‚',
  'soon.note.profile': 'è´¦å·èµ„æ–™ç¼–è¾‘å°†åœ¨ä¸‹ä¸€é˜¶æ®µå¼€å‘ä¸­ä¸Šçº¿ã€‚',
  'soon.note.listings': 'å¸¦å½’å±æ ¡éªŒçš„ä¾›åº”å•†è´§æºç®¡ç†å°†åœ¨ä¸‹ä¸€é˜¶æ®µå¼€å‘ä¸­ä¸Šçº¿ã€‚',
  'soon.note.post': 'å¸¦å›¾ç‰‡ä¸Šä¼ çš„è´§æºåˆ›å»º/ç¼–è¾‘å°†åœ¨ä¸‹ä¸€é˜¶æ®µå¼€å‘ä¸­ä¸Šçº¿ã€‚',
  'soon.note.generic': 'å°†åœ¨ä¸‹ä¸€é˜¶æ®µå¼€å‘ä¸­ä¸Šçº¿ã€‚',
  'soon.note.verification': 'è®¤è¯ç­‰çº§ä¸æ–‡ä»¶æäº¤å°†åœ¨ä¸‹ä¸€é˜¶æ®µå¼€å‘ä¸­ä¸Šçº¿ã€‚',
  'soon.note.admin': 'ç®¡ç†åå°å°†åœ¨ä¸‹ä¸€é˜¶æ®µå¼€å‘ä¸­ä¸Šçº¿ã€‚',
  'soon.note.sources': 'ä¾›åº”å•†äººå·¥å½•å…¥å°†åœ¨ä¸‹ä¸€é˜¶æ®µå¼€å‘ä¸­ä¸Šçº¿ã€‚',
  'soon.note.features': 'åŠŸèƒ½å¼€å…³å°†åœ¨ä¸‹ä¸€é˜¶æ®µå¼€å‘ä¸­ä¸Šçº¿ã€‚',

  'orders.title': 'è®¢å•',
  'orders.signInSub': 'ç™»å½•åæŸ¥çœ‹æ‚¨å‚ä¸çš„è®¢å•',
  'orders.notSignedIn': 'æ‚¨å°šæœªç™»å½•',
  'orders.notSignedInBody': 'è®¢å•å±äºéšç§ä¿¡æ¯ï¼šç™»å½•åæŸ¥çœ‹æ‚¨å·²æ‰¿è¯ºè´­ä¹°æˆ–é”€å”®çš„å†…å®¹ã€‚',
  'orders.createAccount': 'åˆ›å»ºè´¦å·',
  'orders.subSupplier': 'ä¹°å®¶å‘æ‚¨çš„è´§æºä¸‹è¾¾çš„è®¢å•',
  'orders.subBuyer': 'æ‚¨å·²æ‰¿è¯ºè´­ä¹°çš„å…¨éƒ¨å†…å®¹',
  'orders.statListings': 'æˆ‘çš„è´§æº',
  'orders.statOffersReceived': 'æ”¶åˆ°çš„æŠ¥ä»·',
  'orders.statOffersOnRfqs': 'æˆ‘çš„è¯¢ä»·å•ä¸Šçš„æŠ¥ä»·',
  'orders.statOrders': 'è®¢å•',
  'orders.statSoldItems': 'å·²å”®å•†å“',
  'orders.statSoldTitle': 'å·²å‘è´§æˆ–å·²é€è¾¾çš„è®¢å•',
  'orders.statViews': 'æµè§ˆé‡',
  'orders.statViewsTitle': 'ä½ èŒƒå›´å†…å•†å“å·²è®°å½•çš„æµè§ˆé‡',
  'orders.metricsError': 'æš‚æ—¶æ— æ³•åŠ è½½æŒ‡æ ‡ã€‚',
  'orders.loadErrorTitle': 'æ— æ³•åŠ è½½è®¢å•',
  'orders.loadErrorBody': 'æ¥å£æœªè¿”å›æ‚¨çš„è®¢å•ã€‚è¯·åˆ·æ–°é¡µé¢æˆ–é‡æ–°ç™»å½•ã€‚',
  'orders.emptyTitle': 'æš‚æ— è®¢å•',
  'orders.emptySupplier': 'ä¹°å®¶å‘æ‚¨çš„è´§æºä¸‹å•åä¼šæ˜¾ç¤ºåœ¨è¿™é‡Œã€‚',
  'orders.emptyBuyer': 'æ‚¨åœ¨ç°è´§ä¸Šæäº¤çš„ç«‹å³è´­ä¹°è®¢å•ä¼šæ˜¾ç¤ºåœ¨è¿™é‡Œã€‚',
  'orders.browseStock': 'æµè§ˆç°è´§',
  'orders.postRfq': 'å‘å¸ƒè¯¢ä»·',
  'orders.count': '{n} ä¸ªè®¢å•',
  'orders.col.order': 'è®¢å•',
  'orders.col.product': 'äº§å“',
  'orders.col.counterparty': 'å¯¹æ–¹',
  'orders.col.qty': 'æ•°é‡',
  'orders.col.total': 'æ€»é¢',
  'orders.col.status': 'çŠ¶æ€',
  'orders.col.date': 'æ—¥æœŸ',
  'orders.buyerLabel': 'ä¹°å®¶',
  'orders.supplierLabel': 'ä¾›åº”å•†',
  'orders.buyerId': 'ä¹°å®¶ #{id}',

  'product.loadingTitle': 'åŠ è½½ä¸­â€¦',
  'product.loadingThis': 'è¯¥è´§æº',
  'product.fetching': 'æ­£åœ¨è·å–{what}â€¦',
  'product.notFound': 'æœªæ‰¾åˆ°è¯¥äº§å“',
  'product.backToExplore': 'è¿”å›æµè§ˆ',
  'product.noPhoto': 'è¯¥è´§æºæœªæä¾›å›¾ç‰‡',
  'product.pricePer': 'ä»·æ ¼ / {unit}',
  'product.minOrder': 'æœ€å°èµ·è®¢é‡',
  'product.availableNow': 'ç°æœ‰å¯å”®',
  'product.origin': 'åŸäº§å›½',
  'product.unavailable': 'å½“å‰ä¸å¯å”®',
  'product.buyNowHeading': 'ç«‹å³è´­ä¹° â€” ç°è´§',
  'product.soldOutBody': 'è¯¥è´§æºå·²æ ‡è®°å”®ç½„ã€‚è¯·å‘ä¾›åº”å•†å’¨è¯¢ä¸‹ä¸€æ‰¹è´§ã€‚',
  'product.noUnitsBody': 'å½“å‰æ²¡æœ‰å¯å”®æ•°é‡ã€‚è¯·å‘ä¾›åº”å•†å’¨è¯¢ä¸‹ä¸€æ‰¹è´§ã€‚',
  'product.purchaseTerms': 'æŒ‰æ ‡ä»· {price}/{unit} è´­ä¹°ï¼Œæœ€å°èµ·è®¢é‡ {moq} {unit}ã€‚',
  'product.stockOnHand': 'åœ¨æ‰‹åº“å­˜',
  'product.buyNowPrice': 'ç«‹å³è´­ä¹° Â· {price}/{unit}',
  'product.outOfStock': 'ç«‹å³è´­ä¹° â€” ç¼ºè´§',
  'product.requestQuote': 'ç´¢å–æŠ¥ä»·',
  'product.shipsFrom': 'ä»{country}å‘è´§',
  'product.signInToOrder': 'ç™»å½•åå¯ä¸‹å•æˆ–ç´¢å–æŠ¥ä»·ã€‚',
  'product.supplier': 'ä¾›åº”å•†',
  'product.viewProfile': 'æŸ¥çœ‹èµ„æ–™',
  'product.loadingSupplier': 'æ­£åœ¨åŠ è½½ä¾›åº”å•†â€¦',
  'product.supplierUnavailable': 'ä¾›åº”å•†ä¿¡æ¯ä¸å¯ç”¨ã€‚',
  'product.rating': 'è¯„åˆ†',
  'product.inspections': 'æ£€éªŒæ¬¡æ•°',
  'product.fulfilment': 'æŒ‰æ—¶äº¤ä»˜ç‡',
  'product.verifiedLevel': 'è®¤è¯ç­‰çº§',
  'product.levelN': '{n} çº§',
  'product.tradingSince': 'ç»è¥èµ·å§‹',
  'product.supplierFiguresHint': 'è¿™äº›æ•°æ®æ˜¯è¯¥ä¾›åº”å•†åœ¨å¹³å°çš„æ•´ä½“è¡¨ç°ï¼Œå¹¶éä»…é’ˆå¯¹è¯¥è´§æºã€‚',
  'product.description': 'æè¿°',
  'product.noDescription': 'ä¾›åº”å•†å°šæœªæ·»åŠ æè¿°ã€‚å¯ç´¢å–æŠ¥ä»·ä»¥äº†è§£è§„æ ¼ã€äº¤æœŸå’Œäº¤ä»˜æ¡æ¬¾ã€‚',
  'product.specification': 'è§„æ ¼',
  'product.noSpec': 'è¯¥è´§æºæ²¡æœ‰è§„æ ¼è®°å½•ã€‚',
  'product.col.attribute': 'é¡¹ç›®',
  'product.col.value': 'æ•°å€¼',
  'product.spec.category': 'ç±»ç›®',
  'product.spec.unit': 'å•ä½',
  'product.spec.purity': 'çº¯åº¦ / ç­‰çº§',

  'checkout.title': 'ç«‹å³è´­ä¹° â€” ç»“ç®—',
  'checkout.placedTitle': 'è®¢å•å·²æäº¤',
  'checkout.confirmed': 'è®¢å• #{id} å·²ç¡®è®¤',
  'checkout.notified': 'å·²é€šçŸ¥ä¾›åº”å•†ã€‚å¯åœ¨è®¢å•é¡µé¢è·Ÿè¸ªè¯¥è®¢å•ã€‚',
  'checkout.viewOrders': 'æŸ¥çœ‹è®¢å•',
  'checkout.keepBrowsing': 'ç»§ç»­æµè§ˆ',
  'checkout.pricePer': 'ä»·æ ¼ / {unit}',
  'checkout.minimumOrder': 'æœ€å°èµ·è®¢é‡',
  'checkout.availableNow': 'ç°æœ‰å¯å”®',
  'checkout.quantity': 'æ•°é‡ï¼ˆ{unit}ï¼‰',
  'checkout.qtyHint': 'åº“å­˜ä¸º {moq} è‡³ {stock} {unit}ã€‚',
  'checkout.fullName': 'å§“å',
  'checkout.country': 'å›½å®¶',
  'checkout.address': 'è¯¦ç»†åœ°å€',
  'checkout.city': 'åŸå¸‚',
  'checkout.phone': 'ç”µè¯',
  'checkout.notes': 'ç»™ä¾›åº”å•†çš„å¤‡æ³¨',
  'checkout.total': 'åˆè®¡ {total}',
  'checkout.placeOrder': 'æäº¤è®¢å• Â· {total}',
  'checkout.placing': 'æ­£åœ¨æäº¤è®¢å•â€¦',
  'checkout.errPlace': 'æ— æ³•æäº¤è®¢å•ã€‚',

  'rfqModal.title': 'ç´¢å–æŠ¥ä»·',
  'rfqModal.postedTitle': 'è¯¢ä»·å·²å‘å¸ƒ',
  'rfqModal.live': 'æ‚¨çš„éœ€æ±‚å·²åœ¨è¯¢ä»·ä¸“åŒºå‘å¸ƒ',
  'rfqModal.canQuote': 'å·²è®¤è¯ä¾›åº”å•†ç°åœ¨å¯ä»¥æŠ¥å‡ºä»·æ ¼å’Œäº¤æœŸã€‚',
  'rfqModal.viewMine': 'æŸ¥çœ‹æˆ‘çš„è¯¢ä»·å•',
  'rfqModal.listedBy': '{product} Â· å‘å¸ƒæ–¹ {supplier}',
  'rfqModal.quantity': 'æ•°é‡',
  'rfqModal.unit': 'å•ä½',
  'rfqModal.specs': 'è§„æ ¼ã€è®¤è¯ã€äº¤ä»˜æ¡æ¬¾',
  'rfqModal.moqHint': 'è¯¥è´§æºçš„æœ€å°èµ·è®¢é‡ä¸º {moq} {unit}ã€‚',
  'rfqModal.post': 'å‘å¸ƒè¯¢ä»·',
  'rfqModal.posting': 'æ­£åœ¨å‘å¸ƒâ€¦',
  'rfqModal.errPost': 'æ— æ³•å‘å¸ƒè¯¥è¯¢ä»·ã€‚',
  'rfqModal.titleSuffix': 'è¯¢ä»·',

  'suppliers.loadingSub': 'æ­£åœ¨è·å–ä¾›åº”å•†ç›®å½•',
  'suppliers.loadingBody': 'æ­£åœ¨è·å–ä¾›åº”å•†ç›®å½•â€¦',
  'suppliers.title': 'ä¾›åº”å•†ç›®å½•',
  'suppliers.sub': 'FactoryDepo ä¸Šçš„å·¥å‚ä¸è´¸æ˜“å•†ã€‚è®¤è¯ç­‰çº§æ¥è‡ªå®åœ°å®¡æ ¸ä¸æ–‡ä»¶æ ¸æŸ¥ã€‚',
  'suppliers.demoNote': 'æ ‡æ³¨æ¼”ç¤ºçš„è¡Œæ˜¯æ¼”ç¤ºæ•°æ®',
  'suppliers.loadErrorTitle': 'æ— æ³•åŠ è½½ç›®å½•',
  'suppliers.loadErrorBody': 'ä¾›åº”å•†æœåŠ¡æœªå“åº”ã€‚è¯·ç¨åé‡è¯•ã€‚',
  'suppliers.emptyTitle': 'å°šæ— ä¾›åº”å•†',
  'suppliers.emptyBody': 'ä¾›åº”å•†å®Œæˆå…¥é©»å’Œè®¤è¯åä¼šæ˜¾ç¤ºåœ¨è¿™é‡Œã€‚',
  'suppliers.totalListed': 'å·²æ”¶å½•ä¾›åº”å•†',
  'suppliers.totalVerified': '2 çº§åŠä»¥ä¸Šè®¤è¯',
  'suppliers.avgRating': 'å¹³å‡è¯„åˆ†',
  'suppliers.avgRatingRated': 'å¹³å‡è¯„åˆ†ï¼ˆ{n} å®¶å·²è¯„åˆ†ï¼‰',
  'suppliers.avgFulfilment': 'æŒ‰æ—¶äº¤ä»˜ç‡',
  'suppliers.avgFulfilmentMeasured': 'æŒ‰æ—¶äº¤ä»˜ç‡ï¼ˆ{n} å®¶å·²æµ‹ï¼‰',
  'suppliers.searchPlaceholder': 'å…¬å¸ã€å›½å®¶ã€åŸå¸‚ã€èƒ½åŠ›â€¦',
  'suppliers.searchAria': 'æœç´¢ä¾›åº”å•†',
  'suppliers.verifiedOnly': 'ä»…çœ‹å·²è®¤è¯',
  'suppliers.showing': 'æ˜¾ç¤º {total} æ¡ä¸­çš„ {shown} æ¡',
  'suppliers.noMatchTitle': 'æ²¡æœ‰ç¬¦åˆè¯¥æœç´¢çš„ä¾›åº”å•†',
  'suppliers.noMatchBody': 'è¯·å°è¯•æ›´çŸ­çš„å…¬å¸åç§°ï¼Œæˆ–å–æ¶ˆè®¤è¯ç­›é€‰ã€‚',
  'suppliers.rating': 'è¯„åˆ†',
  'suppliers.inspections': 'æ£€éªŒ',
  'suppliers.fulfilment': 'äº¤ä»˜è¡¨ç°',

  'supplierDetail.loadingThis': 'è¯¥ä¾›åº”å•†èµ„æ–™',
  'supplierDetail.notFound': 'æœªæ‰¾åˆ°è¯¥ä¾›åº”å•†',
  'supplierDetail.backToDirectory': 'è¿”å›ç›®å½•',
  'supplierDetail.backShort': 'â† è¿”å›ç›®å½•',
  'supplierDetail.tradingSince': 'è‡ª {year} å¹´èµ·ç»è¥',
  'supplierDetail.verifiedL3': 'å·²è®¤è¯ Â· 3 çº§',
  'supplierDetail.registered': 'å·²æ³¨å†Œ',
  'supplierDetail.buyerRating': 'ä¹°å®¶è¯„åˆ†',
  'supplierDetail.notRated': 'æš‚æ— è¯„åˆ†',
  'supplierDetail.inspections': 'å®åœ°æ£€éªŒ',
  'supplierDetail.fulfilment': 'æŒ‰æ—¶äº¤ä»˜ç‡',
  'supplierDetail.activeListings': 'åœ¨å”®è´§æº',
  'supplierDetail.tier': 'è®¤è¯ç­‰çº§',
  'supplierDetail.trustScore': 'ä¿¡ä»»åˆ†ï¼ˆ0â€“100ï¼‰',
  'supplierDetail.about': 'å…³äº {company}',
  'supplierDetail.noDescription': 'è¯¥ä¾›åº”å•†å°šæœªå‘å¸ƒå…¬å¸ç®€ä»‹ã€‚',
  'supplierDetail.capabilities': 'ç”³æŠ¥èƒ½åŠ›',
  'supplierDetail.record': 'è®¤è¯ä¸è®°å½•',
  'supplierDetail.ratingLabel': 'ä¹°å®¶è¯„åˆ†',
  'supplierDetail.inspectionsDone': 'å·²å®Œæˆæ£€éªŒ',
  'supplierDetail.contact': 'è”ç³»',
  'supplierDetail.contactBody': 'æ£€éªŒæŠ¥å‘Šå’Œè®¤è¯æ–‡ä»¶åœ¨é¦–æ¬¡è”ç³»åå‘ä¼šå‘˜å…±äº«ã€‚',
  'supplierDetail.contactSupplier': 'è”ç³»ä¾›åº”å•†',
  'supplierDetail.contactHintSignedIn': 'å°†æ‰“å¼€è¯¢ä»·ä¸“åŒº â€” æŠ¥ä»·æ²Ÿé€šåœ¨é‚£é‡Œè¿›è¡Œã€‚',
  'supplierDetail.contactHintGuest': 'ä»…é™ä¼šå‘˜ Â· å…è´¹åŠ å…¥',
  'supplierDetail.services': 'è´¸æ˜“æœåŠ¡',
  'supplierDetail.service1': 'ä»˜æ¬¾å‰å·¥å‚æ£€éªŒ',
  'supplierDetail.service2': 'å®éªŒå®¤æ£€æµ‹ä¸ææ–™åˆ†æ',
  'supplierDetail.service3': 'è£…ç®±ç›‘è£…',
  'supplierDetail.service4': 'å‡ºå£å•è¯æ”¯æŒ',
  'supplierDetail.stockFrom': '{company} çš„è´§æº',
  'supplierDetail.shown': 'æ˜¾ç¤º {n} æ¡',
  'supplierDetail.loadingLots': 'æ­£åœ¨åŠ è½½ç°è´§è´§æºâ€¦',
  'supplierDetail.noneShown': 'æœªæ˜¾ç¤ºåœ¨å”®è´§æº',
  'supplierDetail.noneShownBody':
    'æ¥å£æ˜¾ç¤ºè¯¥ä¾›åº”å•†æœ‰ {n} æ¡è´§æºï¼Œä½†å½“å‰åˆ—è¡¨è§†å›¾ä¸­æœªè¿”å›ä»»ä½•ä¸€æ¡ã€‚å¯é€šè¿‡è¯¢ä»·ä¸“åŒºå‘å¸ƒè¯¢ä»·ä»¥äº†è§£å…¶äº§å“ç›®å½•ã€‚',

  'rfq.titleSupplier': 'è¯¢ä»·æœºä¼š',
  'rfq.titleBuyer': 'è¯¢ä»·å•',
  'rfq.subSupplier': 'ä¹°å®¶å‘å¸ƒçš„å¼€æ”¾éœ€æ±‚ã€‚è¯·æŠ¥å‡ºæ‚¨çš„ä»·æ ¼å’Œäº¤æœŸã€‚',
  'rfq.subBuyer': 'ä¸“åŒºä¸­å½“å‰çš„éœ€æ±‚ï¼Œæœ€æ–°ä¼˜å…ˆã€‚æ‰“å¼€ä¸€æ¡å³å¯æŸ¥çœ‹å·²æ”¶åˆ°çš„æŠ¥ä»·ã€‚',
  'rfq.postRequest': '+ å‘å¸ƒè¯¢ä»·',
  'rfq.buyerOnlyNotice': 'ä»…ä¹°å®¶è´¦å·å¯ä»¥å‘å¸ƒè¯¢ä»·ã€‚è¯·ä»¥ä¹°å®¶èº«ä»½ç™»å½•åå‘å¸ƒã€‚',
  'rfq.total': 'æ¡è¯¢ä»·',
  'rfq.open': 'æ¡å¼€æ”¾',
  'rfq.quoted': 'æ¡å·²æŠ¥ä»·',
  'rfq.closed': 'æ¡å·²å…³é—­',
  'rfq.quoteable': 'æ‚¨å¯ä»¥æŠ¥ä»·çš„è¯¢ä»·',
  'rfq.allRequests': 'å…¨éƒ¨è¯¢ä»·',
  'rfq.shown': 'æ˜¾ç¤º {n} æ¡',
  'rfq.statusAll': 'å…¨éƒ¨',
  'rfq.statusOpenCount': 'å¼€æ”¾ï¼ˆ{n}ï¼‰',
  'rfq.statusQuotedCount': 'å·²æŠ¥ä»·ï¼ˆ{n}ï¼‰',
  'rfq.quotingCloses': 'ä¹°å®¶æ¥å—æŸä¸€æŠ¥ä»·åå³åœæ­¢æŠ¥ä»·ã€‚',
  'rfq.emptyNone': 'æš‚æ— è¯¢ä»·',
  'rfq.emptyNoMatch': 'æ²¡æœ‰ç¬¦åˆè¯¥ç­›é€‰çš„å†…å®¹',
  'rfq.emptyNoneSupplier': 'ä¸“åŒºå½“å‰æ²¡æœ‰å¼€æ”¾éœ€æ±‚ã€‚',
  'rfq.emptyNoneBuyer': 'å‘å¸ƒæ‚¨çš„ç¬¬ä¸€ä¸ªéœ€æ±‚ï¼Œå·²è®¤è¯å·¥å‚ä¼šå‰æ¥æŠ¥ä»·ã€‚',
  'rfq.emptyNoMatchHint': 'è¯·å°è¯•å…¶ä»–çŠ¶æ€ç­›é€‰ã€‚',
  'rfq.col.requirement': 'éœ€æ±‚',
  'rfq.col.quantity': 'æ•°é‡',
  'rfq.col.deliverTo': 'äº¤ä»˜åœ°',
  'rfq.col.quotes': 'æŠ¥ä»·',
  'rfq.col.posted': 'å‘å¸ƒæ—¥æœŸ',
  'rfq.col.status': 'çŠ¶æ€',
  'rfq.openAria': 'æ‰“å¼€è¯¢ä»· #{id}',
  'rfq.requestRef': '{category} Â· è¯¢ä»· #{id}',
  'rfq.quotesCount': '{n} æ¡æŠ¥ä»·',
  'rfq.postingBuyerOnly': 'å‘å¸ƒè¯¢ä»·æ˜¯ä¹°å®¶æ“ä½œã€‚ä¾›åº”å•†å¯ä»¥',
  'rfq.quoteOpen': 'å¯¹å¼€æ”¾éœ€æ±‚æŠ¥ä»·',
  'rfq.newTitle': 'æ–°å»ºè¯¢ä»·å•',
  'rfq.whatNeed': 'æ‚¨éœ€è¦ä»€ä¹ˆï¼Ÿ',
  'rfq.titlePlaceholder': 'ä¾‹å¦‚ï¼š100 å¨ A çº§é“œé˜´æ',
  'rfq.category': 'ç±»ç›®',
  'rfq.deliverTo': 'äº¤ä»˜åœ°',
  'rfq.quantity': 'æ•°é‡',
  'rfq.unit': 'å•ä½',
  'rfq.specification': 'è§„æ ¼',
  'rfq.specPlaceholder': 'ç­‰çº§ã€çº¯åº¦ã€è®¤è¯ã€è´¸æ˜“æœ¯è¯­ã€åŒ…è£…â€¦',
  'rfq.specHint': 'è§„æ ¼è¶Šæ¸…æ™°ï¼Œå·²è®¤è¯å·¥å‚æŠ¥ä»·è¶Šå¿«ã€‚',
  'rfq.errTitle': 'è¯·ç»™å‡ºæ¸…æ™°çš„æ ‡é¢˜ â€” è‡³å°‘ 5 ä¸ªå­—ç¬¦ã€‚',
  'rfq.errQuantity': 'æ•°é‡å¿…é¡»æ˜¯å¤§äºé›¶çš„æ•°å­—ã€‚',
  'rfq.errPost': 'æ— æ³•å‘å¸ƒè¯¥è¯¢ä»·ã€‚',

  'rfqDetail.loadingTitle': 'è¯¢ä»·',
  'rfqDetail.loadingSub': 'åŠ è½½ä¸­â€¦',
  'rfqDetail.title': 'è¯¢ä»·',
  'rfqDetail.notFound': 'æœªæ‰¾åˆ°è¯¥è¯¢ä»·',
  'rfqDetail.notFoundBody': 'è¯¥éœ€æ±‚å¯èƒ½å·²æ’¤å›ï¼Œæˆ–é“¾æ¥æœ‰è¯¯ã€‚',
  'rfqDetail.backToRequests': 'â† è¿”å›è¯¢ä»·åˆ—è¡¨',
  'rfqDetail.allRequests': 'â† å…¨éƒ¨è¯¢ä»·',
  'rfqDetail.postedOn': 'å‘å¸ƒäº {date}',
  'rfqDetail.requestRef': 'è¯¢ä»· #{id}',
  'rfqDetail.accepting': 'æ­£åœ¨æ¥å—æŠ¥ä»·',
  'rfqDetail.notAccepting': 'ä¸å†æ¥å—æ–°æŠ¥ä»·',
  'rfqDetail.noSpec': 'æœªæä¾›æ›´å¤šè§„æ ¼è¯´æ˜ã€‚',
  'rfqDetail.quantity': 'æ•°é‡',
  'rfqDetail.deliverTo': 'äº¤ä»˜åœ°',
  'rfqDetail.quotations': 'æŠ¥ä»·',
  'rfqDetail.deadline': 'æˆªæ­¢æ—¥æœŸ',
  'rfqDetail.requestedBy': 'è¯¢ä»·æ–¹',
  'rfqDetail.received': 'å·²æ”¶åˆ° {n} æ¡',
  'rfqDetail.noneTitle': 'æš‚æ— æŠ¥ä»·',
  'rfqDetail.noneBody': 'å·²è®¤è¯ä¾›åº”å•†æ­£åœ¨æŸ¥çœ‹è¯¥éœ€æ±‚ã€‚',
  'rfqDetail.col.supplier': 'ä¾›åº”å•†',
  'rfqDetail.col.price': 'ä»·æ ¼',
  'rfqDetail.col.leadTime': 'äº¤æœŸ',
  'rfqDetail.col.notes': 'å¤‡æ³¨',
  'rfqDetail.col.sent': 'å‘é€æ—¶é—´',
  'rfqDetail.col.status': 'çŠ¶æ€',
  'rfqDetail.trustScore': 'ä¿¡ä»»åˆ† {n}',
  'rfqDetail.days': '{n} å¤©',
  'rfqDetail.submitTitle': 'æäº¤æŠ¥ä»·',
  'rfqDetail.supplierAccount': 'ä¾›åº”å•†è´¦å·',
  'rfqDetail.fromSupplier': 'æŠ¥ä»·æ¥è‡ªä¾›åº”å•†è´¦å·ã€‚è¯·åˆ‡æ¢åˆ°æ‚¨çš„ä¾›åº”å•†è´¦å·æ¥å›å¤è¯¥è¯¢ä»·ã€‚',
  'rfqDetail.signInSupplierBody': 'åªæœ‰å·²ç™»å½•çš„ä¾›åº”å•†è´¦å·å¯ä»¥æŠ¥ä»·ã€‚æµè§ˆå¯¹æ‰€æœ‰äººå¼€æ”¾ã€‚',
  'rfqDetail.supplierOnly': 'ä»…é™ä¾›åº”å•†è´¦å·',
  'rfqDetail.signInAsSupplier': 'ä»¥ä¾›åº”å•†èº«ä»½ç™»å½•',
  'rfqDetail.closedBody': 'è¯¥è¯¢ä»·{status}ï¼Œå·²ä¸å†æ¥å—æŠ¥ä»·ã€‚',
  'rfqDetail.seeOpen': 'æŸ¥çœ‹å¼€æ”¾è¯¢ä»·',
  'rfqDetail.respondBody': 'è¯·æŠ¥å‡ºæ‚¨çš„å•ä»·å’Œäº¤æœŸã€‚æ‚¨çš„è®¤è¯èµ„æ–™ä¼šéšæŠ¥ä»·ä¸€åŒå±•ç¤ºã€‚',
  'rfqDetail.unitPrice': 'å•ä»·ï¼ˆUSDï¼‰',
  'rfqDetail.leadTime': 'äº¤æœŸï¼ˆå¤©ï¼‰',
  'rfqDetail.termsNotes': 'æ¡æ¬¾ä¸å¤‡æ³¨',
  'rfqDetail.termsPlaceholder': 'è´¸æ˜“æœ¯è¯­ã€ç­‰çº§ã€åŒ…è£…ã€æ ·å“æ”¿ç­–ã€æœ‰æ•ˆæœŸâ€¦',
  'rfqDetail.compareHint': 'ä¹°å®¶ä¼šå¹¶æ’æ¯”è¾ƒä»·æ ¼ã€äº¤æœŸå’Œè®¤è¯æƒ…å†µã€‚',
  'rfqDetail.submitQuote': 'æäº¤æŠ¥ä»·',
  'rfqDetail.submitting': 'æ­£åœ¨æäº¤â€¦',
  'rfqDetail.errPrice': 'è¯·è¾“å…¥å¤§äºé›¶çš„å•ä»·ã€‚',
  'rfqDetail.errLead': 'äº¤æœŸå¿…é¡»æ˜¯ 1 åˆ° 365 ä¹‹é—´çš„æ•´æ•°å¤©ã€‚',
  'rfqDetail.errSubmit': 'æ— æ³•æäº¤è¯¥æŠ¥ä»·ã€‚',

  'listings.title': 'æˆ‘çš„è´§æº',
  'listings.sub': 'æ‚¨åœ¨å¹³å°ä¸Šå‘å¸ƒçš„è´§æº',
  'listings.signInSub': 'æ‚¨åœ¨å¹³å°ä¸Šå‘å¸ƒçš„è´§æº',
  'listings.notSignedIn': 'æ‚¨å°šæœªç™»å½•',
  'listings.notSignedInBody': 'æ‚¨çš„è´§æºä»…æ‚¨çš„ä¾›åº”å•†è´¦å·å¯è§ã€‚ç™»å½•åå³å¯æŸ¥çœ‹å’Œç®¡ç†ã€‚',
  'listings.createSupplierAccount': 'åˆ›å»ºä¾›åº”å•†è´¦å·',
  'listings.supplierOnly': 'ä»…é™ä¾›åº”å•†è´¦å·',
  'listings.supplierOnlyBody': 'æ‚¨çš„è´¦å·æ˜¯{role}è´¦å·ã€‚è´§æºç”±æ‹¥æœ‰å®ƒçš„ä¾›åº”å•†ç®¡ç†ï¼Œå› æ­¤è¿™é‡Œæ²¡æœ‰å¯æŸ¥çœ‹æˆ–ç¼–è¾‘çš„å†…å®¹ã€‚',
  'listings.browseStock': 'æµè§ˆç°è´§',
  'listings.subLoading': 'æ­£åœ¨åŠ è½½æ‚¨çš„è´§æºâ€¦',
  'listings.subCount': 'æ‚¨çš„ä¾›åº”å•†èµ„æ–™ä¸‹å·²å‘å¸ƒ {n} æ¡è´§æº',
  'listings.postStock': '+ å‘å¸ƒè´§æº',
  'listings.lotsPublished': 'æ¡è´§æºå·²å‘å¸ƒ',
  'listings.bankTransferNote': 'æŠ¥ä»·è¢«æ¥å—åï¼Œä¹°å®¶é€šè¿‡é“¶è¡Œè½¬è´¦ä»˜æ¬¾ã€‚',
  'listings.loadErrorTitle': 'æ— æ³•åŠ è½½æ‚¨çš„è´§æº',
  'listings.loadErrorBody': 'æ— æ³•åŠ è½½æ‚¨çš„è´§æº â€” è¯·é‡è¯•ã€‚è‹¥æŒç»­å¤±è´¥ï¼Œè¯·é‡æ–°ç™»å½•ã€‚',
  'listings.emptyTitle': 'æš‚æ— è´§æº',
  'listings.emptyBody': 'å‘å¸ƒæ‚¨çš„ç¬¬ä¸€æ¡è´§æº â€” ä¸€å¼ å›¾ç‰‡ã€å•ä»·ï¼Œä»¥åŠä»Šå¤©å¯å‘è´§çš„æ•°é‡ã€‚å®ƒä¼šç«‹å³å‡ºç°åœ¨â€œæµè§ˆâ€ä¸­ï¼Œä¾›å¹³å°ä¸Šæ‰€æœ‰ä¹°å®¶æŸ¥çœ‹ã€‚',
  'listings.postFirst': '+ å‘å¸ƒç¬¬ä¸€æ¡è´§æº',
  'listings.getVerified': 'å®Œæˆè®¤è¯',
  'listings.count': '{n} æ¡è´§æº',
  'listings.col.lot': 'è´§æº',
  'listings.col.category': 'ç±»ç›®',
  'listings.col.unitPrice': 'å•ä»·',
  'listings.col.moq': 'MOQ',
  'listings.col.available': 'å¯å”®',
  'listings.col.status': 'çŠ¶æ€',
  'listings.col.posted': 'å‘å¸ƒæ—¥æœŸ',
  'listings.lotRef': 'è´§æº #{id}',
  'listings.noPhotoInline': 'æš‚æ— å›¾ç‰‡',
  'listings.demoNoteLead': 'æ ‡æ³¨',
  'listings.demoNoteTail': 'çš„è´§æºæ˜¯å¹³å°æä¾›çš„æ¼”ç¤ºæ•°æ®ï¼Œå¹¶éæ‚¨å‘å¸ƒçš„è´§æºã€‚åˆ é™¤ä¼šå¯¹æ‰€æœ‰äººç§»é™¤å®ƒã€‚',
  'listings.updated': 'è´§æºå·²æ›´æ–°ã€‚',
  'listings.deleted': 'è´§æºå·²åˆ é™¤ï¼Œå¹³å°ä¸Šä¸å†æ˜¾ç¤ºã€‚',
  'listings.deleteTitle': 'åˆ é™¤è¯¥è´§æºï¼Ÿ',
  'listings.deleteLead': '{name} â€” è´§æº #{id}',
  'listings.deleteBody':
    'è¯¥è´§æºå°†è¢«æ°¸ä¹…ç§»é™¤ã€‚å®ƒä¼šç«‹å³ä»â€œæµè§ˆâ€å’Œæ‚¨çš„è´§æºè¡¨ä¸­æ¶ˆå¤±ï¼Œä¹°å®¶ä¹Ÿæ— æ³•å†ä¸‹å•æˆ–è®®ä»·ã€‚æ­¤æ“ä½œæ— æ³•æ’¤é”€ã€‚',
  'listings.deleteKeepBody':
    'å·²æœ‰è®¢å•æˆ–æŠ¥ä»·çš„è´§æºä¸èƒ½åˆ é™¤ â€” æ¥å£ä¼šä¿ç•™è®°å½•ã€‚è¯·æ”¹ä¸ºå°†å¯å”®åº“å­˜è®¾ä¸º 0ï¼Œæ ‡è®°ä¸ºå”®ç½„ã€‚',
  'listings.keepListing': 'ä¿ç•™è´§æº',
  'listings.deleteForever': 'æ°¸ä¹…åˆ é™¤',
  'listings.deleting': 'æ­£åœ¨åˆ é™¤â€¦',
  'listings.deleteErr': 'æ— æ³•åˆ é™¤è¯¥è´§æºã€‚',
  'listings.editTitle': 'ç¼–è¾‘è´§æº â€” è´§æº #{id}',

  'post.title': 'å‘å¸ƒè´§æº',
  'post.titleEdit': 'ç¼–è¾‘è´§æº',
  'post.sub': 'ä¸€æ¡è´§æºå¯¹åº”ä¸€æ‰¹è´§ï¼šæ˜¯ä»€ä¹ˆã€ä»€ä¹ˆä»·æ ¼ã€ä»Šå¤©èƒ½å‘å¤šå°‘',
  'post.subEdit': 'æ­£åœ¨ä¿®æ”¹è´§æº #{id} â€” ä¿å­˜å°†è¦†ç›–å·²å‘å¸ƒçš„è´§æº',
  'post.signInSub': 'å‘å¸ƒç°è´§ï¼Œè®©ä¹°å®¶ä¸‹å•æˆ–è®®ä»·',
  'post.notSignedIn': 'æ‚¨å°šæœªç™»å½•',
  'post.notSignedInBody': 'å‘å¸ƒè´§æºæ˜¯ä¾›åº”å•†æ“ä½œã€‚è¯·ä»¥ä¾›åº”å•†è´¦å·ç™»å½•åå‘å¸ƒè´§æºã€‚',
  'post.createSupplierAccount': 'åˆ›å»ºä¾›åº”å•†è´¦å·',
  'post.supplierOnly': 'ä»…é™ä¾›åº”å•†è´¦å·',
  'post.supplierOnlyBody': 'æ‚¨çš„è´¦å·æ˜¯{role}è´¦å·ï¼Œæ¥å£ä¸ä¼šæ¥å—å…¶å‘å¸ƒçš„è´§æºã€‚å‘å¸ƒè´§æºå‰éœ€è¦ä¾›åº”å•†èµ„æ–™ã€‚',
  'post.myListings': 'æˆ‘çš„è´§æº',
  'post.loadErrorTitle': 'æ— æ³•åŠ è½½è´§æº',
  'post.loadErrorBody': 'æ— æ³•åŠ è½½è¯¥è´§æº â€” è¯·é‡è¯•ï¼Œæˆ–è¿”å›æ‚¨çš„è´§æºåˆ—è¡¨ã€‚',
  'post.details': 'è´§æºä¿¡æ¯',
  'post.newListing': 'æ–°è´§æº',
  'post.requiredMark': '* å¿…å¡«',
  'post.lotName': 'è´§æºåç§°',
  'post.lotNamePlaceholder': 'ä¾‹å¦‚ï¼šA çº§é“œé˜´æï¼Œ99.99%',
  'post.category': 'ç±»ç›®',
  'post.originCountry': 'åŸäº§å›½',
  'post.notStated': 'æœªå¡«å†™',
  'post.description': 'æè¿°',
  'post.descriptionPlaceholder': 'ç­‰çº§ã€åŒ…è£…ã€è´¸æ˜“æœ¯è¯­ã€äº¤æœŸã€è¯ä¹¦â€¦',
  'post.descriptionHint': 'ä¹°å®¶æ®æ­¤åˆ¤æ–­ã€‚è¯·è¯´æ˜è´§æºå†…å®¹å’Œå‘è´§æ–¹å¼ã€‚',
  'post.unitPrice': 'å•ä»·',
  'post.currency': 'å¸ç§',
  'post.unit': 'å•ä½',
  'post.moq': 'æœ€å°èµ·è®¢é‡ï¼ˆMOQï¼‰',
  'post.moqHint': 'é»˜è®¤ä¸º 1ã€‚',
  'post.available': 'ç°æœ‰å¯å”®',
  'post.availableHint': 'é»˜è®¤ä¸º 0 â€” å³ä»Šå¤©å¯å‘è´§çš„åº“å­˜ã€‚',
  'post.purity': 'çº¯åº¦ / ç­‰çº§',
  'post.purityPlaceholder': '99.99% / A çº§',
  'post.optional': 'é€‰å¡«ã€‚',
  'post.photoUrl': 'å›¾ç‰‡é“¾æ¥',
  'post.photoPlaceholder': 'https://â€¦/copper-cathode.jpg',
  'post.photoHintLead': 'æ–‡ä»¶ä¸Šä¼ å°šæœªå¼€å‘ã€‚',
  'post.photoHintTail': 'ç²˜è´´å›¾ç‰‡çš„å…¬å¼€é“¾æ¥ï¼Œå®ƒä¼šä½œä¸ºè¯¥è´§æºçš„å›¾ç‰‡ä¿å­˜ã€‚æ²¡æœ‰å›¾ç‰‡çš„è´§æºä¼šæ˜¾ç¤ºç®€å•çš„å ä½å›¾ã€‚',
  'post.preview': 'é¢„è§ˆ â€” è‹¥æ— æ³•åŠ è½½ï¼Œè¯´æ˜è¯¥é“¾æ¥ä¸æ˜¯ç›´æ¥å›¾ç‰‡åœ°å€ã€‚',
  'post.save': 'ä¿å­˜æ›´æ”¹',
  'post.saving': 'æ­£åœ¨ä¿å­˜â€¦',
  'post.errName': 'è¯·ä¸ºè´§æºå‘½å â€” è‡³å°‘ 2 ä¸ªå­—ç¬¦ã€‚',
  'post.errCategory': 'è¯·é€‰æ‹©ç±»ç›®ã€‚',
  'post.errUnit': 'è¯·è¯´æ˜æ‚¨çš„é”€å”®å•ä½ï¼ˆå¨ã€åƒå…‹ã€ä»¶â€¦ï¼‰ã€‚',
  'post.errPrice': 'å•ä»·å¿…é¡»æ˜¯å¤§äºé›¶çš„æ•°å­—ã€‚',
  'post.errMoq': 'MOQ å¿…é¡»æ˜¯å¤§äºé›¶çš„æ•°å­—ã€‚',
  'post.errQty': 'å¯å”®æ•°é‡ä¸èƒ½ä¸ºè´Ÿæ•°ã€‚',
  'post.errSave': 'æ— æ³•ä¿å­˜è¯¥è´§æºã€‚',
  'post.errCreate': 'æ— æ³•å‘å¸ƒè¯¥è´§æºã€‚',
  'post.behaviour': 'è¯¥è´§æºå¦‚ä½•è¿ä½œ',
  'post.behaviourBody': 'å‘å¸ƒçš„è´§æºä¼šç«‹å³å‡ºç°åœ¨â€œæµè§ˆâ€ä¸­ï¼Œä»»ä½•å·²ç™»å½•ä¹°å®¶éƒ½å¯ä»¥ä¸‹å•ã€‚ä¹°å®¶ä¹Ÿå¯ä»¥å¼€å‡ºä½äºæ‚¨æ ‡ä»·çš„æŠ¥ä»·ï¼›æ‚¨å¯ä»¥åœ¨',
  'post.offersLink': 'æŠ¥ä»·',
  'post.provenance': 'æ¥æº',
  'post.platformListing': 'å¹³å°è´§æº',
  'post.photo': 'å›¾ç‰‡',
  'post.urlOnly': 'ä»…é“¾æ¥ â€” ä¸Šä¼ æœªå¼€å‘',
  'post.buyerPaysBy': 'ä¹°å®¶ä»˜æ¬¾æ–¹å¼',
  'post.bankTransfer': 'é“¶è¡Œè½¬è´¦',
  'post.noMetrics': 'æœ¬é¡µä¸æ˜¾ç¤ºæµè§ˆé‡ã€è¯„åˆ†æˆ–è®¢å•æ•° â€” è¿™äº›æŒ‡æ ‡å°šæœªç»Ÿè®¡ï¼Œå› æ­¤ä¸äºˆæ˜¾ç¤ºã€‚',

  'offers.title': 'æ‚¨è´§æºæ”¶åˆ°çš„æŠ¥ä»·',
  'offers.sub': 'æ­£åœ¨å¯¹æ‚¨çš„è´§æºè®®ä»·çš„ä¹°å®¶',
  'offers.signInSub': 'æ­£åœ¨å¯¹æ‚¨çš„è´§æºè®®ä»·çš„ä¹°å®¶',
  'offers.notSignedIn': 'æ‚¨å°šæœªç™»å½•',
  'offers.notSignedInBody': 'æŠ¥ä»·ä»…ä¹°å®¶ä¸ç›¸å…³ä¾›åº”å•†å¯è§ã€‚ç™»å½•åå¯å›å¤ã€‚',
  'offers.createSupplierAccount': 'åˆ›å»ºä¾›åº”å•†è´¦å·',
  'offers.supplierOnly': 'ä»…é™ä¾›åº”å•†è´¦å·',
  'offers.supplierOnlyBody': 'æ‚¨çš„è´¦å·æ˜¯{role}è´¦å·ï¼Œå…¶åä¸‹æ²¡æœ‰è´§æºï¼Œå› æ­¤ä¸ä¼šæ”¶åˆ°æŠ¥ä»·ã€‚æ‚¨ä½œä¸ºä¹°å®¶å‘å‡ºçš„æŠ¥ä»·åœ¨å¹³å°çš„ä¹°å®¶ä¾§ã€‚',
  'offers.browseStock': 'æµè§ˆç°è´§',
  'offers.subLoading': 'æ­£åœ¨åŠ è½½æŠ¥ä»·â€¦',
  'offers.subCount': 'æ‚¨çš„è´§æºä¸Šæœ‰ {n} æ¡æŠ¥ä»·',
  'offers.awaiting': 'æ¡ç­‰å¾…æ‚¨å›å¤',
  'offers.decided': 'æ¡å·²å¤„ç†',
  'offers.acceptCreates': 'æ¥å—æŠ¥ä»·ä¼šç”Ÿæˆè®¢å•ï¼›ä¹°å®¶é€šè¿‡é“¶è¡Œè½¬è´¦ä»˜æ¬¾ã€‚',
  'offers.filterAwaiting': 'ç­‰å¾…å›å¤ï¼ˆ{n}ï¼‰',
  'offers.filterDecided': 'å·²å¤„ç†ï¼ˆ{n}ï¼‰',
  'offers.counterNote': 'è¿˜ç›˜ä¼šç”Ÿæˆä¸€æ¡å…³è”çš„æ–°æŠ¥ä»·ï¼›æ‚¨çš„åŸå§‹æ¡æ¬¾ä»ä¿ç•™åœ¨è®°å½•ä¸­ã€‚',
  'offers.loadErrorTitle': 'æ— æ³•åŠ è½½æŠ¥ä»·',
  'offers.loadErrorBody': 'æ— æ³•åŠ è½½æ‚¨è´§æºä¸Šçš„æŠ¥ä»· â€” è¯·é‡è¯•ã€‚',
  'offers.emptyTitle': 'æš‚æ— æŠ¥ä»·',
  'offers.emptyBody': 'å½“ä¹°å®¶å¯¹æ‚¨çš„æŸä¸€è´§æºè®®ä»·æ—¶ï¼Œä¼šæ˜¾ç¤ºåœ¨è¿™é‡Œï¼ŒåŒ…å«å…¶å‡ºä»·å’Œæ‰€éœ€æ•°é‡ã€‚æ‚¨å¯ä»¥æ¥å—ã€æ‹’ç»ï¼Œæˆ–ç”¨è‡ªå·±çš„ä»·æ ¼å›å¤ã€‚',
  'offers.seeListings': 'æŸ¥çœ‹æˆ‘çš„è´§æº',
  'offers.postMore': '+ å‘å¸ƒæ›´å¤šè´§æº',
  'offers.noneAwaiting': 'æ²¡æœ‰ç­‰å¾…æ‚¨å›å¤çš„æŠ¥ä»·',
  'offers.noneDecided': 'æš‚æ— å·²å¤„ç†çš„æŠ¥ä»·',
  'offers.noneAwaitingBody': 'æ‚¨è´§æºä¸Šçš„æŠ¥ä»·éƒ½å·²å›å¤ã€‚åˆ‡æ¢åˆ°â€œå·²å¤„ç†â€å³å¯æŸ¥çœ‹ã€‚',
  'offers.noneDecidedBody': 'æ‚¨æ¥å—æˆ–æ‹’ç»çš„æŠ¥ä»·ä¼šä½œä¸ºè®°å½•ä¿å­˜åœ¨è¿™é‡Œã€‚',
  'offers.count': '{n} æ¡æŠ¥ä»·',
  'offers.col.listing': 'è´§æº',
  'offers.col.buyer': 'ä¹°å®¶',
  'offers.col.quantity': 'æ•°é‡',
  'offers.col.theirPrice': 'å¯¹æ–¹å‡ºä»·',
  'offers.col.status': 'çŠ¶æ€',
  'offers.col.received': 'æ”¶åˆ°æ—¶é—´',
  'offers.decidedLabel': 'å·²å¤„ç†',
  'offers.counter': 'è¿˜ç›˜',
  'offers.accept': 'æ¥å—',
  'offers.reject': 'æ‹’ç»',
  'offers.offerRef': 'æŠ¥ä»· #{id}',
  'offers.answersOffer': 'å›å¤æŠ¥ä»· #{id}',
  'offers.demoNoteLead': 'æ ‡æ³¨',
  'offers.demoNoteTail': 'çš„è¡Œå±äºæ¼”ç¤ºè´§æºï¼Œå¹¶éæ‚¨å‘å¸ƒçš„è´§æºã€‚æ¥å—å®ƒä»ä¼šç”ŸæˆçœŸå®è®¢å• â€” è¯·å…ˆæ ¸å®è´§æºã€‚',
  'offers.counterTitle': 'è¿˜ç›˜ #{id}',
  'offers.counterBody': '{buyer} å¯¹ {product} å‡ºä»· {price} / {qty}ã€‚æ‚¨çš„å›å¤å°†æˆä¸ºä¸€æ¡å…³è”çš„æ–°æŠ¥ä»·ï¼›ä¹°å®¶çš„æ¡æ¬¾ä»ä¿ç•™åœ¨è®°å½•ä¸­ã€‚',
  'offers.counterPrice': 'æ‚¨çš„å•ä»·',
  'offers.perUnit': 'æ¯å•ä½ {currency}',
  'offers.counterQty': 'æ•°é‡',
  'offers.counterQtyHint': 'ä¿æŒä¸å˜å³æ²¿ç”¨ä¹°å®¶çš„æ•°é‡ã€‚',
  'offers.counterNotes': 'ç»™ä¹°å®¶çš„å¤‡æ³¨',
  'offers.counterNotesPlaceholder': 'äº¤æœŸã€åŒ…è£…ã€è´¸æ˜“æœ¯è¯­ã€è¯¥ä»·æ ¼çš„æœ‰æ•ˆæœŸâ€¦',
  'offers.sendCounter': 'å‘é€è¿˜ç›˜',
  'offers.sending': 'æ­£åœ¨å‘é€â€¦',
  'offers.counterErrPrice': 'æ‚¨çš„è¿˜ç›˜ä»·å¿…é¡»æ˜¯å¤§äºé›¶çš„æ•°å­—ã€‚',
  'offers.counterErrQty': 'æ•°é‡å¿…é¡»æ˜¯å¤§äºé›¶çš„æ•°å­—ã€‚',
  'offers.counterErr': 'æ— æ³•å‘é€è¯¥è¿˜ç›˜ã€‚',
  'offers.counterDone': 'è¿˜ç›˜å·²å‘é€ã€‚åŸæŠ¥ä»·æ ‡è®°ä¸ºå·²è¿˜ç›˜ï¼Œå·²é€šçŸ¥ä¹°å®¶ã€‚',
  'offers.acceptTitle': 'æ¥å—æŠ¥ä»· #{id}ï¼Ÿ',
  'offers.listing': 'è´§æº',
  'offers.buyer': 'ä¹°å®¶',
  'offers.quantity': 'æ•°é‡',
  'offers.unitPrice': 'å•ä»·',
  'offers.offerValue': 'æŠ¥ä»·é‡‘é¢',
  'offers.acceptBodyLead': 'æ¥å—å³ç”Ÿæˆè®¢å•ã€‚',
  'offers.acceptBodyBank': 'ä¹°å®¶å¯¹æ­¤ä½œå‡ºæ‰¿è¯ºï¼Œå¹¶é€šè¿‡',
  'offers.acceptBodyTail':
    'ä»˜æ¬¾ â€” å¹³å°ä¸æ”¶å–ä¿¡ç”¨å¡ä»˜æ¬¾ã€‚æ‚¨å¼€å…·å½¢å¼å‘ç¥¨ï¼Œå¹¶åœ¨æ¬¾é¡¹åˆ°è´¦åç¡®è®¤è½¬è´¦ï¼›è®¢å•éšåè¿›å…¥å‘è´§ç¯èŠ‚ã€‚è¯¥å†³å®šä¸ºæœ€ç»ˆå†³å®šï¼šå·²æ¥å—çš„æŠ¥ä»·æ— æ³•é‡æ–°å†³å®šã€‚',
  'offers.acceptCta': 'æ¥å—å¹¶ç”Ÿæˆè®¢å•',
  'offers.accepting': 'æ­£åœ¨æ¥å—â€¦',
  'offers.acceptErr': 'æ— æ³•æ¥å—è¯¥æŠ¥ä»·ã€‚',
  'offers.acceptDone': 'æŠ¥ä»· #{id} å·²æ¥å—ã€‚å·²ä¸º {buyer} ç”Ÿæˆè®¢å•ã€‚',
  'offers.rejectTitle': 'æ‹’ç»æŠ¥ä»· #{id}ï¼Ÿ',
  'offers.rejectBody':
    '{buyer} å¯¹ {product} çš„ {price} æŠ¥ä»·å°†è¢«å…³é—­ã€‚æ‹’ç»ä¸ºæœ€ç»ˆå†³å®š â€” ä¹°å®¶æ— æ³•æ¢å¤è¯¥æŠ¥ä»·ï¼Œä½†å¯ä»¥é‡æ–°å¼€ä¸€æ¡ã€‚',
  'offers.rejectCta': 'æ‹’ç»æŠ¥ä»·',
  'offers.rejecting': 'æ­£åœ¨æ‹’ç»â€¦',
  'offers.rejectErr': 'æ— æ³•æ‹’ç»è¯¥æŠ¥ä»·ã€‚',
  'offers.rejectDone': 'æŠ¥ä»· #{id} å·²æ‹’ç»ã€‚',

  'myoffers.titleSupplier': 'æˆ‘çš„è´§æºæ”¶åˆ°çš„æŠ¥ä»·',
  'myoffers.titleAdmin': 'æ‰€æœ‰æŠ¥ä»·',
  'myoffers.titleBuyer': 'æˆ‘çš„æŠ¥ä»·',
  'myoffers.subSupplier': 'ä¹°å®¶å¯¹æ‚¨çš„è´§æºæäº¤çš„æŠ¥ä»·ã€‚æ‚¨å¯ä»¥å¯¹æ¯ä¸€ç¬”è¿˜ä»·ã€æ¥å—æˆ–æ‹’ç»ã€‚',
  'myoffers.subAdmin': 'å¹³å°ä¸Šçš„å…¨éƒ¨æŠ¥ä»·ï¼Œæœ€æ–°ä¼˜å…ˆã€‚',
  'myoffers.subBuyer': 'æ‚¨å¯¹ç°è´§æäº¤çš„æŠ¥ä»·ã€‚æ‚¨å¯ä»¥å¯¹æ¯ä¸€ç¬”è¿˜ä»·ã€æ¥å—æˆ–æ‹’ç»ã€‚',
  'myoffers.signInSub': 'ç™»å½•åæŸ¥çœ‹æ‚¨æ­£åœ¨æ´½è°ˆçš„æŠ¥ä»·',
  'myoffers.notSignedIn': 'æ‚¨å°šæœªç™»å½•',
  'myoffers.notSignedInBody': 'æŠ¥ä»·ä»…åŒæ–¹å¯è§ï¼šç™»å½•åå³å¯æ‰“å¼€ã€è¿˜ä»·æˆ–æ¥å—ã€‚',
  'myoffers.loadErrorTitle': 'æ— æ³•åŠ è½½æŠ¥ä»·',
  'myoffers.loadErrorBody': 'API æœªè¿”å›æ‚¨çš„æŠ¥ä»· â€” è¯·é‡è¯•ã€‚',
  'myoffers.trying': 'æ­£åœ¨é‡è¯•â€¦',
  'myoffers.emptyTitle': 'æš‚æ— æŠ¥ä»·',
  'myoffers.emptySupplier': 'ä¹°å®¶å¯¹æ‚¨çš„è´§æºæäº¤çš„æŠ¥ä»·ä¼šæ˜¾ç¤ºåœ¨è¿™é‡Œï¼Œå¯ç›´æ¥è¿˜ä»·æˆ–æ¥å—ã€‚',
  'myoffers.emptyAdmin': 'å¹³å°ä¸Šå°šæœªæœ‰ä»»ä½•æŠ¥ä»·ã€‚',
  'myoffers.emptyBuyer': 'æ‰“å¼€æ‚¨æƒ³è¦çš„è´§æºå¹¶æäº¤æŠ¥ä»· â€” ä¾›åº”å•†å¯ä»¥è¿˜ä»·ã€æ¥å—æˆ–æ‹’ç»ã€‚',
  'myoffers.browseStock': 'æµè§ˆç°è´§',
  'myoffers.count': '{n} æ¡æŠ¥ä»·',
  'myoffers.stillOpen': '{n} ç¬”ä»å¼€æ”¾',
  'myoffers.col.offer': 'æŠ¥ä»·',
  'myoffers.col.counterparty': 'äº¤æ˜“å¯¹æ‰‹',
  'myoffers.col.quantity': 'æ•°é‡',
  'myoffers.col.unitPrice': 'å•ä»·',
  'myoffers.col.status': 'çŠ¶æ€',
  'myoffers.col.date': 'æ—¥æœŸ',
  'myoffers.col.action': 'æ“ä½œ',
  'myoffers.counterTo': 'å¯¹ #{id} è¿˜ä»·',
  'myoffers.offerRef': 'æŠ¥ä»· #{id}',
  'myoffers.answersOffer': 'å›å¤æŠ¥ä»· #{id}',
  'myoffers.seatSupplier': 'ä¾›åº”å•†',
  'myoffers.seatBuyer': 'ä¹°å®¶',
  'myoffers.noAction': 'æ— éœ€è¿›ä¸€æ­¥æ“ä½œ',
  'myoffers.confirmReject': 'ç¡®è®¤æ‹’ç»',
  'myoffers.counter': 'è¿˜ä»·',
  'myoffers.accept': 'æ¥å—',
  'myoffers.reject': 'æ‹’ç»',
  'myoffers.counterTitle': 'è¿˜ä»· #{id}',
  'myoffers.counterDoneTitle': 'è¿˜ä»·å·²å‘é€',
  'myoffers.counterDoneBody': 'æ‚¨çš„è¿˜ä»·å·²é€è¾¾å¯¹æ–¹',
  'myoffers.backToOffers': 'è¿”å›æˆ‘çš„æŠ¥ä»·',
  'myoffers.counterLead': '{product} Â· æŠ¥ä»· #{id} Â· {qty} æŒ‰ {price} æ¯å•ä½',
  'myoffers.perUnit': 'ä»¥ {currency} è®¡ï¼Œæ¯å•ä½ã€‚',
  'myoffers.inCurrency': 'ä»¥ {currency} è®¡ï¼Œæ¯å•ä½ã€‚',
  'myoffers.originally': 'æœ€åˆä¸º {qty}ã€‚',
  'myoffers.messageLabel': 'ç»™å¯¹æ–¹çš„æ¶ˆæ¯',
  'myoffers.messagePlaceholder': 'äº¤è´§æœŸã€åŒ…è£…ã€ä»˜æ¬¾æ¡ä»¶â€¦',
  'myoffers.sendCounter': 'å‘é€è¿˜ä»·',
  'myoffers.sending': 'æ­£åœ¨å‘é€â€¦',
  'myoffers.errInvalid': 'è¯·è¾“å…¥å¤§äºé›¶çš„å•ä»·å’Œæ•°é‡ã€‚',
  'myoffers.errCounter': 'æ— æ³•å‘é€è¿˜ä»· â€” è¯·é‡è¯•ã€‚',
  'myoffers.acceptTitle': 'æ¥å—æŠ¥ä»· #{id}',
  'myoffers.acceptLead': '{product} Â· {qty}ï¼Œå•ä»· {price}',
  'myoffers.acceptStripeLead': 'æ¥å—å³è¡¨ç¤ºåŒæ„æ­¤ä»·æ ¼å’Œæ•°é‡ï¼Œå¹¶',
  'myoffers.acceptStripeStrong': 'åˆ›å»ºè®¢å•',
  'myoffers.acceptStripeTail': 'ã€‚è®¢å•éšåä¼šå‡ºç°åœ¨â€œè®¢å•â€ä¸­ï¼Œå¹¶åœ¨é‚£é‡Œè·Ÿè¸ªç‰©æµé‡Œç¨‹ç¢‘ã€‚',
  'myoffers.acceptHint': 'æ­¤æ“ä½œæ— æ³•æ’¤é”€ â€” æ´½è°ˆå°†æŒ‰å·²æ¥å—çš„æ¡æ¬¾ç»“æŸã€‚',
  'myoffers.acceptCta': 'æ¥å—å¹¶åˆ›å»ºè®¢å•',
  'myoffers.accepting': 'æ­£åœ¨æ¥å—â€¦',
  'myoffers.errAccept': 'æ— æ³•æ¥å—è¯¥æŠ¥ä»· â€” è¯·é‡è¯•ã€‚',
  'myoffers.accepted': 'æŠ¥ä»· #{id} å·²æ¥å—ã€‚è¯·åœ¨â€œè®¢å•â€ä¸­æŸ¥çœ‹ç”Ÿæˆçš„è®¢å•ã€‚',
  'myoffers.viewOrders': 'æŸ¥çœ‹è®¢å•',
  'myoffers.errReject': 'æ— æ³•æ‹’ç»æŠ¥ä»· #{id} â€” è¯·é‡è¯•ã€‚',
  'ship.title': 'ç‰©æµ',
  'ship.subSupplier': 'é’ˆå¯¹æ‚¨çš„è´§æºæ‰€ä¸‹è®¢å•çš„é‡Œç¨‹ç¢‘ã€‚æ¯ä¸€æ­¥éƒ½ç”±æ‚¨æ¨è¿›ã€‚',
  'ship.subAdmin': 'æ¯ä¸ªè®¢å•çš„é‡Œç¨‹ç¢‘ã€‚ç®¡ç†å‘˜å¯ä»£è¡¨ä¾›åº”å•†æ¨è¿›è´§ä»¶ã€‚',
  'ship.subBuyer': 'æ‚¨æ‰€ä¸‹è®¢å•çš„é‡Œç¨‹ç¢‘è·Ÿè¸ªã€‚æ¯ä¸€æ­¥ç”±æ‚¨çš„ä¾›åº”å•†æ¨è¿›ã€‚',
  'ship.signInSub': 'ç™»å½•åè·Ÿè¸ªæ‚¨çš„è´§ä»¶',
  'ship.notSignedIn': 'æ‚¨å°šæœªç™»å½•',
  'ship.notSignedInBody': 'è´§ä»¶è·Ÿè¸ªä»…è®¢å•ä¸­çš„ä¹°å®¶ä¸ä¾›åº”å•†å¯è§ã€‚',
  'ship.loadErrorTitle': 'æ— æ³•åŠ è½½è´§ä»¶',
  'ship.loadErrorBody': 'API æœªè¿”å›æ‚¨çš„è´§ä»¶ â€” è¯·é‡è¯•ã€‚',
  'ship.trying': 'æ­£åœ¨é‡è¯•â€¦',
  'ship.emptyTitle': 'æš‚æ— è´§ä»¶',
  'ship.emptySupplier': 'å½“ä¹°å®¶ä»æ‚¨çš„è´§æºä¸‹å•æ—¶ï¼Œä¼šè‡ªåŠ¨åˆ›å»ºè´§ä»¶ã€‚',
  'ship.emptyBuyer': 'æ‚¨æ¯ä¸‹ä¸€ç¬”è®¢å•éƒ½ä¼šè‡ªåŠ¨åˆ›å»ºè´§ä»¶ï¼Œå…¶é‡Œç¨‹ç¢‘ä¼šæ˜¾ç¤ºåœ¨è¿™é‡Œã€‚',
  'ship.myListings': 'æˆ‘çš„è´§æº',
  'ship.viewOrders': 'æŸ¥çœ‹æˆ‘çš„è®¢å•',
  'ship.count': 'ä¸ªè´§ä»¶å¯¹æ‚¨çš„è´¦å·å¯è§',
  'ship.delivered': 'å·²é€è¾¾',
  'ship.advanceRecorded': 'æ¨è¿›é‡Œç¨‹ç¢‘ä¼šè®°å½•æ—¶é—´æˆ³ï¼Œå¹¶ä¸ä¹°å®¶å…±äº«ã€‚',
  'ship.advanceBySupplier': 'æ¯ç¬”è®¢å•çš„é‡Œç¨‹ç¢‘ç”±ä¾›åº”å•†æ¨è¿›ã€‚',
  'ship.trackingTitle': 'è´§ä»¶è·Ÿè¸ª',
  'ship.col.shipment': 'è´§ä»¶',
  'ship.col.product': 'å•†å“',
  'ship.col.carrier': 'æ‰¿è¿å•†',
  'ship.col.trackingNo': 'è¿½è¸ªå·',
  'ship.col.documents': 'å•æ®',
  'ship.col.updated': 'æœ€åæ›´æ–°',
  'ship.col.milestone': 'é‡Œç¨‹ç¢‘',
  'ship.noDocumentTitle': 'è¯¥è´§ä»¶å°šæœªé™„ä¸Šä»»ä½•å•æ®',
  'ship.advance': 'æ¨è¿›é‡Œç¨‹ç¢‘',
  'ship.advancing': 'æ­£åœ¨æ¨è¿›â€¦',
  'ship.deliveredLabel': 'å·²é€è¾¾',
  'ship.advancedBySupplier': 'ç”±ä¾›åº”å•†æ¨è¿›',
  'ship.completeTitle': 'æ‰€æœ‰é‡Œç¨‹ç¢‘å‡å·²è¾¾æˆ',
  'ship.advanceTitle': 'å°†æ­¤è´§ä»¶å‘å‰æ¨è¿›ä¸€æ­¥',
  'ship.noMilestones': 'è¯¥è´§ä»¶å°šæœªè®°å½•ä»»ä½•é‡Œç¨‹ç¢‘ã€‚',
  'ship.reached': 'å·²è¾¾æˆ {step}/{total} ä¸ªé‡Œç¨‹ç¢‘',
  'ship.reachedDelivered': 'å·²é€è¾¾',
  'ship.reachedNext': 'ä¸‹ä¸€æ­¥ï¼š{next}',
  'ship.footLead': 'é‡Œç¨‹ç¢‘å†å²ç”±è®¢å•åŒæ–¹å…±äº«ã€‚è®¢å•åŠå…¶é‡‘é¢ä½äº',
  'ship.footLink': 'â€œè®¢å•â€',
  'ship.footTail': 'ã€‚',
  'ship.errAdvance': 'æ— æ³•æ¨è¿›è´§ä»¶ #{id} â€” è¯·é‡è¯•ã€‚',
  'saved.title': 'å·²æ”¶è—çš„è´§æº',
  'saved.signInSub': 'ç™»å½•åå¯æ”¶è—è´§æºæ¸…å•',
  'saved.notSignedIn': 'æ‚¨å°šæœªç™»å½•',
  'saved.notSignedInBody': 'æ‚¨çš„æ”¶è—æ¸…å•ä»…æ‚¨çš„è´¦å·å¯è§ï¼šç™»å½•åå¯ä¿å­˜å’Œç§»é™¤è´§æºã€‚',
  'saved.sub': 'æ‚¨æ”¶è—çš„è´§æºã€‚ä»·æ ¼å’Œåº“å­˜æ˜¯ä¾›åº”å•†çš„å½“å‰æ•°æ®ï¼Œå¹¶éé¢„ç•™ã€‚',
  'saved.loadErrorTitle': 'æ— æ³•åŠ è½½å·²æ”¶è—çš„è´§æº',
  'saved.loadErrorBody': 'API æœªè¿”å›æ‚¨çš„æ”¶è—æ¸…å• â€” è¯·é‡è¯•ã€‚',
  'saved.trying': 'æ­£åœ¨é‡è¯•â€¦',
  'saved.emptyTitle': 'å°šæœªæ”¶è—ä»»ä½•å†…å®¹',
  'saved.emptyBody': 'åœ¨å¹³å°ä¸Šæ”¶è—ä¸€ä¸ªè´§æºï¼Œå®ƒå°±ä¼šæ˜¾ç¤ºåœ¨è¿™é‡Œï¼Œæ–¹ä¾¿æ—¥åå¿«é€Ÿæ¯”è¾ƒã€‚',
  'saved.browse': 'æµè§ˆç°è´§',
  'saved.goToFeed': 'å‰å¾€æˆ‘çš„é¦–é¡µ',
  'saved.count': 'å·²æ”¶è— {n} æ¡è´§æº',
  'saved.mostRecent': 'æœ€è¿‘æ”¶è—çš„ä¼˜å…ˆ',
  'saved.savedOn': 'æ”¶è—äº {date}',
  'saved.remove': 'ç§»é™¤',
  'saved.removing': 'æ­£åœ¨ç§»é™¤â€¦',
  'saved.removeTitle': 'å°†æ­¤è´§æºä»æ”¶è—æ¸…å•ä¸­ç§»é™¤',
  'saved.errRemove': 'æ— æ³•å°†è¯¥è´§æºä»æ”¶è—æ¸…å•ä¸­ç§»é™¤ â€” è¯·é‡è¯•ã€‚',
  'notes.title': 'é€šçŸ¥',
  'notes.signInSub': 'ç™»å½•åæŸ¥çœ‹æ‚¨è´¦å·çš„åŠ¨æ€',
  'notes.notSignedIn': 'æ‚¨å°šæœªç™»å½•',
  'notes.notSignedInBody': 'é€šçŸ¥ä»…æ‚¨çš„è´¦å·å¯è§ï¼šç™»å½•åå¯æŸ¥çœ‹ã€‚',
  'notes.sub': 'æ‚¨è´¦å·çš„æŠ¥ä»·ã€æ¶ˆæ¯å’Œè´§ä»¶æ›´æ–°ï¼Œæœ€æ–°ä¼˜å…ˆã€‚',
  'notes.markAll': 'å…¨éƒ¨æ ‡ä¸ºå·²è¯»',
  'notes.marking': 'æ­£åœ¨æ ‡è®°â€¦',
  'notes.markAllTitle': 'å°† {n} æ¡æœªè¯»é€šçŸ¥æ ‡ä¸ºå·²è¯»',
  'notes.nothingUnread': 'æ²¡æœ‰æœªè¯»å†…å®¹',
  'notes.loadErrorTitle': 'æ— æ³•åŠ è½½é€šçŸ¥',
  'notes.loadErrorBody': 'API æœªè¿”å›æ‚¨çš„é€šçŸ¥ â€” è¯·é‡è¯•ã€‚',
  'notes.trying': 'æ­£åœ¨é‡è¯•â€¦',
  'notes.emptyTitle': 'æš‚æ— é€šçŸ¥',
  'notes.emptyBody': 'å½“æŠ¥ä»·è¢«è¿˜ä»·ã€æ”¶åˆ°æ¶ˆæ¯æˆ–è´§ä»¶æœ‰è¿›å±•æ—¶ï¼Œéƒ½ä¼šè®°å½•åœ¨è¿™é‡Œã€‚',
  'notes.browse': 'æµè§ˆç°è´§',
  'notes.myOrders': 'æˆ‘çš„è®¢å•',
  'notes.count': '{n} æ¡é€šçŸ¥',
  'notes.unreadCount': '{n} æ¡æœªè¯»',
  'notes.allRead': 'å…¨éƒ¨å·²è¯»',
  'notes.unreadLabel': 'æœªè¯»',
  'notes.footnote': 'æœªè¯»æ•°é‡ç›´æ¥æ¥è‡ª APIã€‚ä»è¿™é‡Œæ‰“å¼€å¯¹è¯æˆ–æŠ¥ä»·æœ¬èº«ä¸ä¼šæ¸…é™¤é€šçŸ¥ â€” è¯·ä½¿ç”¨â€œå…¨éƒ¨æ ‡ä¸ºå·²è¯»â€ã€‚',
  'notes.errMark': 'æ— æ³•å°†é€šçŸ¥æ ‡ä¸ºå·²è¯» â€” è¯·é‡è¯•ã€‚',
  'notes.justNow': 'åˆšåˆš',
  'notes.minutesAgo': '{n} åˆ†é’Ÿå‰',
  'notes.hoursAgo': '{n} å°æ—¶å‰',
  'notes.daysAgo': '{n} å¤©å‰',
  'notes.open': 'æ‰“å¼€',
  'msg.title': 'æ¶ˆæ¯',
  'msg.subSupplier': 'ä¹°å®¶å¯¹æ‚¨è´§æºçš„å’¨è¯¢ã€‚æ‰“å¼€å¯¹è¯å³æ ‡è®°ä¸ºå·²è¯»ã€‚',
  'msg.subBuyer': 'æ‚¨ä¸ä¾›åº”å•†çš„å¯¹è¯ã€‚æ‰“å¼€å¯¹è¯å³æ ‡è®°ä¸ºå·²è¯»ã€‚',
  'msg.signInSub': 'ç™»å½•åæŸ¥çœ‹æ‚¨çš„å¯¹è¯',
  'msg.notSignedIn': 'æ‚¨å°šæœªç™»å½•',
  'msg.notSignedInBody': 'å¯¹è¯ä»…åŒæ–¹å¯è§ï¼šç™»å½•åå¯æŸ¥çœ‹å’Œå›å¤ã€‚',
  'msg.loadErrorTitle': 'æ— æ³•åŠ è½½å¯¹è¯',
  'msg.loadErrorBody': 'API æœªè¿”å›æ‚¨çš„å¯¹è¯ â€” è¯·é‡è¯•ã€‚',
  'msg.trying': 'æ­£åœ¨é‡è¯•â€¦',
  'msg.emptyTitle': 'æš‚æ— å¯¹è¯',
  'msg.emptySupplier': 'å½“ä¹°å®¶å’¨è¯¢æ‚¨çš„æŸä¸ªè´§æºæ—¶ï¼Œå¯¹è¯ä¼šæ˜¾ç¤ºåœ¨è¿™é‡Œã€‚',
  'msg.emptyBuyer': 'æ‰“å¼€æ‚¨æ„Ÿå…´è¶£çš„è´§æºå¹¶ç»™ä¾›åº”å•†å‘æ¶ˆæ¯ â€” å¯¹è¯ä¼šæ˜¾ç¤ºåœ¨è¿™é‡Œã€‚',
  'msg.browse': 'æµè§ˆç°è´§',
  'msg.myListings': 'æˆ‘çš„è´§æº',
  'msg.noMessagesYet': 'æš‚æ— æ¶ˆæ¯',
  'msg.count': '{n} æ¡æ¶ˆæ¯',
  'msg.pickTitle': 'é€‰æ‹©ä¸€ä¸ªå¯¹è¯',
  'msg.pickBody': 'å…¶ä¸­çš„æ¶ˆæ¯ä¼šæ˜¾ç¤ºåœ¨è¿™é‡Œã€‚',
  'msg.threadLoadError': 'æ— æ³•åŠ è½½æ­¤å¯¹è¯',
  'msg.threadLoadErrorBody': 'å®ƒå¯èƒ½å·²è¢«ç§»é™¤ï¼Œæˆ–æ‚¨çš„è´¦å·æ— æƒè®¿é—® â€” è¯·é‡è¯•ã€‚',
  'msg.noLot': 'æœªå…³è”è´§æº',
  'msg.viewLot': 'æŸ¥çœ‹è´§æº',
  'msg.emptyThreadTitle': 'æ­¤å¯¹è¯ä¸­æš‚æ— æ¶ˆæ¯',
  'msg.emptyThreadBody': 'åœ¨ä¸‹æ–¹å†™ä¸‹ç¬¬ä¸€æ¡æ¶ˆæ¯ã€‚',
  'msg.messagePlaceholder': 'ç»™ {name} å‘æ¶ˆæ¯â€¦',
  'msg.messageAria': 'æ’°å†™æ¶ˆæ¯',
  'msg.send': 'å‘é€',
  'msg.sending': 'æ­£åœ¨å‘é€â€¦',
  'msg.read': 'å·²è¯»',
  'msg.otherParty': 'å¯¹æ–¹',
  'msg.errSend': 'æ— æ³•å‘é€æ¶ˆæ¯ â€” è¯·é‡è¯•ã€‚',
  'msg.justNow': 'åˆšåˆš',
  'msg.minutesAgo': '{n} åˆ†é’Ÿå‰',
  'msg.hoursAgo': '{n} å°æ—¶å‰',
  'msg.daysAgo': '{n} å¤©å‰',
  'verify.title': 'èµ„è´¨è®¤è¯',
  'verify.sub': 'æäº¤æ‚¨çš„æ–‡ä»¶ã€è·Ÿè¸ªå®¡æ ¸å†³å®šï¼Œå¹¶äº†è§£ä¹°å®¶çœ‹åˆ°çš„å†…å®¹',
  'verify.signInSub': 'ä¹°å®¶åœ¨ä»˜æ¬¾å‰æ‰€ä¾èµ–çš„æ–‡ä»¶',
  'verify.notSignedIn': 'æ‚¨å°šæœªç™»å½•',
  'verify.notSignedInBody': 'è®¤è¯æ–‡ä»¶å±äºä¾›åº”å•†è´¦å·ï¼Œç»ä¸ä¼šä»¥åŸå§‹å½¢å¼å…¬å¼€ã€‚ç™»å½•åå¯æäº¤æˆ–æ›´æ–°ã€‚',
  'verify.createSupplierAccount': 'åˆ›å»ºä¾›åº”å•†è´¦å·',
  'verify.supplierOnly': 'ä»…é™ä¾›åº”å•†è´¦å·',
  'verify.supplierOnlyBody': 'æ‚¨çš„è´¦å·æ˜¯{role}è´¦å·ï¼Œå› æ­¤æ²¡æœ‰ä¾›åº”å•†æ¸…å•éœ€è¦å®Œæˆã€‚',
  'verify.seeSuppliers': 'æŸ¥çœ‹å·²è®¤è¯ä¾›åº”å•†',
  'verify.approved': 'å·²æ ¸å‡†æ–‡ä»¶',
  'verify.waiting': 'ç­‰å¾…å®¡æ ¸',
  'verify.actionNeeded': 'ç¼ºå¤±æˆ–å·²é€€å›',
  'verify.coreApproved': 'æ ¸å¿ƒæ–‡ä»¶å·²æ ¸å‡†',
  'verify.confirmed': 'å·²ç¡®è®¤',
  'verify.pending': 'å¾…å¤„ç†',
  'verify.yourDocs': 'æ‚¨çš„æ–‡ä»¶',
  'verify.onFile': 'å·²å­˜æ¡£ {n} ä»½',
  'verify.loadErrorTitle': 'æ— æ³•åŠ è½½æ–‡ä»¶',
  'verify.loadErrorBody': 'æ— æ³•åŠ è½½æ‚¨çš„è®¤è¯æ–‡ä»¶ â€” è¯·é‡è¯•ã€‚è‹¥æŒç»­å¤±è´¥ï¼Œæ‚¨çš„è´¦å·å¯èƒ½è¿˜æ²¡æœ‰ä¾›åº”å•†èµ„æ–™ã€‚',
  'verify.emptyTitle': 'å°šæœªå­˜æ¡£ä»»ä½•æ–‡ä»¶',
  'verify.emptyBody': 'è¿˜æ²¡æœ‰æäº¤ä»»ä½•æ–‡ä»¶ï¼Œå› æ­¤æ— æ³•å‘ä¹°å®¶æ˜¾ç¤ºè®¤è¯æ ‡è¯†ã€‚è¯·ä½¿ç”¨è¡¨å•æäº¤ç¬¬ä¸€ä»½æ–‡ä»¶ â€” ä»{first}å¼€å§‹ã€‚',
  'verify.col.document': 'æ–‡ä»¶',
  'verify.col.status': 'çŠ¶æ€',
  'verify.col.note': 'å®¡æ ¸å¤‡æ³¨',
  'verify.col.reviewed': 'å®¡æ ¸æ—¶é—´',
  'verify.filed': 'æäº¤äº {date}',
  'verify.reference': 'å‚è€ƒï¼š{ref}',
  'verify.noReference': 'æœªæä¾›å‚è€ƒ',
  'verify.resubmit': 'é‡æ–°æäº¤',
  'verify.tierFootnote': 'æ­¤å¤„ä»…åˆ—å‡ºæ¥å£ä¸ºæ‚¨çš„ä¾›åº”å•†èµ„æ–™è¿”å›çš„æ–‡ä»¶ã€‚ç¼ºå¤±çš„ç±»å‹åªæ˜¯è¿˜æ²¡æœ‰è®°å½• â€” æäº¤åå³ä¼šåˆ›å»ºã€‚',
  'verify.fileTitle': 'æäº¤æˆ–æ›´æ–°æ–‡ä»¶',
  'verify.docType': 'æ–‡ä»¶ç±»å‹',
  'verify.existingHintPre': 'æ‚¨å·²æœ‰ {doc} çš„è®°å½• â€” çŠ¶æ€',
  'verify.existingHintPost': 'ã€‚å†æ¬¡æäº¤ä¼šè¦†ç›–å®ƒå¹¶æ¸…é™¤æ­¤å‰çš„å†³å®šï¼Œå› æ­¤å·²æ ¸å‡†çš„æ–‡ä»¶éœ€è¦é‡æ–°å®¡æ ¸ã€‚',
  'verify.refLabel': 'æ–‡ä»¶é“¾æ¥ / å‚è€ƒç¼–å·',
  'verify.refPlaceholder': 'https://â€¦/business-licence.pdf æˆ–æ‚¨çš„æ–‡ä»¶ç¼–å·',
  'verify.refHintLead': 'æ–‡ä»¶ä¸Šä¼ å°šæœªå¼€å‘ã€‚',
  'verify.refHintTail': 'è¯·ç²˜è´´æ–‡ä»¶é“¾æ¥ï¼Œæˆ–å®¡æ ¸å›¢é˜Ÿå¯æ®æ­¤è·Ÿè¿›çš„å‚è€ƒç¼–å·ã€‚å®ƒå°†æŒ‰åŸæ ·å­˜å‚¨ï¼Œä¸ä¼šå…¬å¼€æ˜¾ç¤ºã€‚',
  'verify.noteLabel': 'ç»™å®¡æ ¸å‘˜çš„å¤‡æ³¨',
  'verify.notePlaceholder': 'å‘ç”Ÿäº†ä»€ä¹ˆå˜åŒ–ã€ä¸ºä½•æ›´æ–°ã€å®¡æ ¸å‘˜éœ€è¦äº†è§£çš„å†…å®¹â€¦',
  'verify.filing': 'æ­£åœ¨æäº¤â€¦',
  'verify.resubmitDoc': 'é‡æ–°æäº¤{doc}',
  'verify.submitDoc': 'æäº¤{doc}',
  'verify.queueNoteLead': 'æäº¤åªæ˜¯æŠŠæ–‡ä»¶æ”¾å…¥é˜Ÿåˆ—ã€‚',
  'verify.queueNoteStrong': 'åªæœ‰å½“å®¡æ ¸å‘˜æ ¸å‡†åï¼Œä¹°å®¶æ‰ä¼šçœ‹åˆ°æ ‡è¯†',
  'verify.queueNoteTail': 'â€” æäº¤æ—¶ä¸ä¼šï¼Œä¹Ÿç»ä¸ä¼šè‡ªåŠ¨æ˜¾ç¤ºã€‚',
  'verify.filedNotice':
    '{doc}å·²æäº¤ã€‚çŠ¶æ€ç°ä¸ºâ€œå·²æäº¤â€ï¼Œæ­£åœ¨å®¡æ ¸é˜Ÿåˆ—ä¸­ç­‰å¾… â€” åªæœ‰å®¡æ ¸å‘˜æ ¸å‡†åä¹°å®¶æ‰ä¼šçœ‹åˆ°æ ‡è¯†ã€‚',
  'verify.errFile': 'æ— æ³•æäº¤è¯¥æ–‡ä»¶ã€‚',
  'verify.statusMeans': 'å„çŠ¶æ€çš„å«ä¹‰',
  'verify.tierTitle': 'è®¤è¯ç­‰çº§',
  'verify.tierAll': 'å·²è®¤è¯ Â· å…¨éƒ¨æ ¸å¿ƒæ–‡ä»¶å·²æ ¸å‡†',
  'verify.tierSome': 'å·²è®¤è¯ Â· æ–‡ä»¶å·²æ ¸å‡†',
  'verify.tierNone': 'å°šæœªè®¤è¯',
  'verify.tierAllBody': 'æœ¬é¡µåˆ—å‡ºçš„æ¯ç§æ ¸å¿ƒæ–‡ä»¶ç±»å‹å‡å·²ç”±å®¡æ ¸å‘˜æ ¸å‡†ã€‚',
  'verify.tierSomeBody': 'è‡³å°‘æœ‰ä¸€ä»½æ–‡ä»¶å·²æ ¸å‡†{n}ï¼›å…¶ä½™æ ¸å¿ƒç±»å‹ä¼šè¿›ä¸€æ­¥å¢å¼ºèµ„æ–™ã€‚',
  'verify.tierNoneBody': 'å°šæ— æ–‡ä»¶è¢«æ ¸å‡†ï¼Œå› æ­¤ä¸ä¼šå‘ä¹°å®¶æ˜¾ç¤ºæ‚¨å…¬å¸çš„è®¤è¯æ ‡è¯†ã€‚',
  'verify.tierHint':
    'æ‚¨è´¦å·çš„ç­‰çº§ç”±å®¡æ ¸å›¢é˜Ÿæ ¹æ®å·²æ ¸å‡†æ–‡ä»¶è®¾å®š â€” æœ¬é¡µä»…å‘ˆç°æ¥å£è¿”å›çš„æ–‡ä»¶çŠ¶æ€ï¼Œå¹¶ä¸è‡ªè¡Œè®¡ç®—ç­‰çº§ã€‚ä¹°å®¶åªä¼šçœ‹åˆ°å·²æ ¸å‡†æ–‡ä»¶å¯¹åº”çš„æ ‡è¯†ã€‚',
  'verify.suggested': 'å»ºè®®ä¸‹ä¸€æ­¥ï¼š',
  'verify.select': 'é€‰æ‹©',
  'verify.othersNote':
    'ä¹°å®¶è¿˜ä¼šåœ¨å…¶ä»–ä¾›åº”å•†èµ„æ–™é¡µä¸Šçœ‹åˆ°è¯„åˆ†å’Œæ£€éªŒæ¬¡æ•°ã€‚è¿™äº›æ•°å­—æ˜¯å¹³å°æ¼”ç¤ºæ•°æ®ï¼Œå¹¶éæœ¬æ¸…å•ç”Ÿæˆ â€” æœ¬é¡µæœ‰æ„ä¸æ˜¾ç¤ºå…¶ä¸­ä»»ä½•ä¸€é¡¹ã€‚',
  'verify.help.missing.title': 'æœªæäº¤',
  'verify.help.missing.state': 'å°šæœªæäº¤ä»»ä½•æ–‡ä»¶ï¼Œæˆ–è¯¥æ–‡ä»¶ä»æœªæäº¤ã€‚',
  'verify.help.submitted.title': 'ç­‰å¾…å®¡æ ¸',
  'verify.help.submitted.state': 'å·²æäº¤å¹¶åœ¨å®¡æ ¸é˜Ÿåˆ—ä¸­ç­‰å¾…ã€‚ä¹°å®¶æš‚æ—¶çœ‹ä¸åˆ°ä»»ä½•æ ‡è¯†ã€‚',
  'verify.help.approved.title': 'å·²æ ¸å‡†',
  'verify.help.approved.state': 'å®¡æ ¸å‘˜å·²å¯¹ç…§æ–‡ä»¶æœ¬èº«è¿›è¡Œæ ¸æŸ¥ã€‚è¿™å°±æ˜¯ä¹°å®¶çœ‹åˆ°çš„å†…å®¹ã€‚',
  'verify.help.rejected.title': 'å·²é€€å›',
  'verify.help.rejected.state': 'å·²æ‹’ç»å¹¶é™„å¤‡æ³¨ã€‚è¯·ä¿®æ­£æ–‡ä»¶åé‡æ–°æäº¤ã€‚',
  'verify.doc.businessLicence': 'è¥ä¸šæ‰§ç…§',
  'verify.doc.taxCertificate': 'ç¨åŠ¡ç™»è®°è¯',
  'verify.doc.factoryAudit': 'å·¥å‚å®¡æ ¸æŠ¥å‘Š',
  'verify.doc.productCert': 'äº§å“è®¤è¯',
  'verify.doc.exportLicence': 'å‡ºå£è®¸å¯è¯',
};

const es: Partial<Record<DictKey, string>> = {
  'status.open': 'Abierta',
  'status.quoted': 'Con oferta',
  'status.closed': 'Cerrada',
  'status.submitted': 'Enviado',
  'status.accepted': 'Aceptada',
  'status.rejected': 'Rechazada',
  'status.active': 'Activo',
  'status.sold_out': 'Agotado',
  'status.scheduled': 'Programado',
  'status.in_progress': 'En curso',
  'status.passed': 'Superado',
  'status.failed': 'Fallido',
  'status.pending': 'Pendiente',
  'status.paid': 'Pagado',
  'status.shipped': 'Enviado',
  'status.delivered': 'Entregado',
  'status.cancelled': 'Cancelado',
  'status.missing': 'No presentado',
  'status.approved': 'Aprobado',
  'status.countered': 'Con contraoferta',
  'status.withdrawn': 'Retirada',
  'status.inspecting': 'InspecciÃ³n en curso',

  'action.close': 'Cerrar',
  'action.cancel': 'Cancelar',
  'action.dismiss': 'Descartar',
  'action.refresh': 'Actualizar',
  'action.refreshing': 'Actualizandoâ€¦',
  'action.tryAgain': 'Reintentar',
  'action.clear': 'Limpiar',
  'action.clearFilters': 'Limpiar filtros',
  'action.search': 'Buscar',
  'action.save': 'Guardar cambios',
  'action.discard': 'Descartar',
  'action.signIn': 'Iniciar sesiÃ³n',
  'action.signOut': 'Cerrar sesiÃ³n',
  'action.signingIn': 'Iniciando sesiÃ³nâ€¦',
  'action.joinFree': 'Ãšnete gratis',
  'action.createAccount': 'Crear una cuenta',
  'action.creatingAccount': 'Creando la cuentaâ€¦',
  'action.backToExplore': 'Volver a explorar',
  'action.open': 'Abrir',
  'action.edit': 'Editar',
  'action.delete': 'Eliminar',

  'common.loading': 'Cargandoâ€¦',
  'common.loadingEllipsis': 'Cargandoâ€¦',
  'common.notSet': 'Sin definir',
  'common.optional': 'Opcional',
  'common.required': 'obligatorio',
  'common.newestFirst': 'MÃ¡s recientes primero',
  'common.anyCountry': 'Cualquier paÃ­s',
  'common.allCountries': 'Todos los paÃ­ses',
  'common.verified': 'Verificado',
  'common.tradeAbbrev':
    'RFQ = solicitud de cotizaciÃ³n Â· MOQ = cantidad mÃ­nima de pedido Â· FOB = franco a bordo Â· TT = transferencia bancaria',

  'nav.feed': 'Inicio',
  'nav.explore': 'Explorar',
  'nav.exploreStock': 'Explorar existencias',
  'nav.offersBuyer': 'Mis ofertas',
  'nav.rfqs': 'Mis RFQ',
  'nav.orders': 'Pedidos',
  'nav.shipments': 'EnvÃ­os',
  'nav.messages': 'Mensajes',
  'nav.saved': 'Guardado',
  'nav.savedLots': 'Lotes guardados',
  'nav.notifications': 'Notificaciones',
  'nav.help': 'Centro de ayuda',
  'nav.helpCentre': 'Centro de ayuda',
  'nav.howItWorks': 'CÃ³mo funciona',
  'nav.profile': 'Perfil',
  'nav.listings': 'Mis publicaciones',
  'nav.post': 'Publicar stock',
  'nav.postStock': 'Publicar stock',
  'nav.offersSup': 'Ofertas',
  'nav.rfqOpps': 'Oportunidades de RFQ',
  'nav.verification': 'VerificaciÃ³n',
  'nav.suppliers': 'Proveedores',
  'nav.overview': 'Resumen',
  'nav.adminSuppliers': 'Proveedores',
  'nav.adminVerify': 'Mesa de verificaciÃ³n',
  'nav.adminListings': 'Publicaciones',
  'nav.adminRfqs': 'RFQ',
  'nav.adminPayments': 'Pagos',
  'nav.sources': 'Fuentes de suministro',
  'nav.growth': 'Banners y promociones',
  'nav.features': 'Funciones',

  'topbar.searchPlaceholder': 'Buscar productos, proveedores, categorÃ­asâ€¦',
  'topbar.searchAria': 'Buscar en el marketplace',
  'topbar.notifications': 'Notificaciones',
  'topbar.createAccountTitle': 'Crear cuenta',
  'topbar.account': 'Cuenta',
  'topbar.languageAria': 'Idioma de la interfaz',
  'rail.allIndustries': 'Todos los sectores',
  'rail.howItWorks': 'CÃ³mo funciona',
  'sidebar.moreIndustries': 'MÃ¡s sectores. MÃ¡s paÃ­ses.',
  'sidebar.moreIndustriesSub': 'Un marketplace para stock disponible.',

  'gate.title': 'Acceso de miembros',
  'gate.body':
    'Contactar con proveedores, publicar solicitudes y cotizar son acciones de miembros. Explorar el marketplace sigue siendo gratuito y abierto.',
  'gate.createAccount': 'Crear cuenta gratis',
  'gate.haveAccount': 'Ya tengo una cuenta',

  'cards.noPhoto': 'sin foto',
  'cards.moq': 'MOQ',
  'cards.saveLot': 'Guardar este lote',
  'cards.demo': 'Demo',
  'cards.demoTitle': 'Datos de ejemplo â€” no es una oferta real',
  'cards.inspections': 'inspecciones',

  'auth.signIn.sub': 'Accede a tus pedidos, ofertas y RFQ.',
  'auth.email': 'Correo electrÃ³nico',
  'auth.password': 'ContraseÃ±a',
  'auth.signInCta': 'Iniciar sesiÃ³n',
  'auth.newHere': 'Â¿Primera vez aquÃ­?',
  'auth.demoNotice': 'Aviso de demo',
  'auth.seededLogin': 'Acceso de revisiÃ³n precargado',
  'auth.fillIn': 'Rellenar',
  'auth.demoHintLead': 'es una',
  'auth.demoHintLead2': 'demo',
  'auth.demoHintTail':
    'cuenta de demostraciÃ³n precargada para revisar el panel de administraciÃ³n. No es un vendedor real: no introduzcas credenciales reales.',
  'auth.demoHintProduct': 'administrador',
  'auth.signInFailed': 'Error al iniciar sesiÃ³n',
  'auth.signUp.title': 'Crear una cuenta',
  'auth.signUp.sub': 'Una cuenta para comprar, vender o prestar servicios de inspecciÃ³n y logÃ­stica.',
  'auth.fullName': 'Nombre completo',
  'auth.workEmail': 'Correo de trabajo',
  'auth.minChars': 'MÃ­nimo 8 caracteres',
  'auth.atLeast8': 'Al menos 8 caracteres.',
  'auth.iAmA': 'Soyâ€¦',
  'auth.company': 'Empresa',
  'auth.country': 'PaÃ­s',
  'auth.countryHint': 'TurquÃ­a, Chinaâ€¦',
  'auth.createCta': 'Crear cuenta',
  'auth.alreadyRegistered': 'Â¿Ya estÃ¡s registrado?',
  'auth.signUpHint': 'Publicar es gratis. Las insignias de confianza se ganan con verificaciÃ³n, inspecciones e historial de entregas.',
  'auth.registerFailed': 'Error en el registro',
  'auth.role.buyer': 'Comprador',
  'auth.role.buyerHint': 'Compro productos',
  'auth.role.supplier': 'Proveedor',
  'auth.role.supplierHint': 'Vendo / fabrico',
  'auth.role.inspector': 'Inspector',
  'auth.role.inspectorHint': 'Verifico fÃ¡bricas',
  'auth.role.lab': 'Laboratorio',
  'auth.role.labHint': 'Analizo materiales',
  'auth.role.logistics': 'LogÃ­stica',
  'auth.role.logisticsHint': 'Muevo carga',

  'profile.title': 'Perfil',
  'profile.sub': 'Los datos que otras partes ven en tus ofertas, pedidos y mensajes.',
  'profile.signInSub': 'Inicia sesiÃ³n para gestionar tu cuenta',
  'profile.notSignedIn': 'No has iniciado sesiÃ³n',
  'profile.notSignedInBody': 'Tu perfil es privado de tu cuenta: inicia sesiÃ³n para verlo y editarlo.',
  'profile.createAccount': 'Crear una cuenta',
  'profile.accountDetails': 'Datos de la cuenta',
  'profile.unsaved': 'Cambios sin guardar',
  'profile.fullName': 'Nombre completo',
  'profile.company': 'Empresa',
  'profile.notSet': 'Sin definir',
  'profile.country': 'PaÃ­s',
  'profile.language': 'Idioma de la interfaz',
  'profile.languageHint':
    'Cambia el idioma de la interfaz al instante y se guarda en tu cuenta al pulsar Guardar cambios.',
  'profile.save': 'Guardar cambios',
  'profile.saving': 'Guardandoâ€¦',
  'profile.saved': 'Guardado',
  'profile.savedBody': 'Tu perfil se ha actualizado.',
  'profile.identity': 'Identidad',
  'profile.identityNote':
    'El correo y el rol no se pueden editar aquÃ­. Quedan fijados al crear la cuenta y la API de perfil no los acepta.',
  'profile.email': 'Correo electrÃ³nico',
  'profile.role': 'Rol',
  'profile.readOnly': 'Solo lectura',
  'profile.readOnlyEmail': 'Solo lectura â€” la API de perfil no acepta el correo',
  'profile.readOnlyRole': 'Solo lectura â€” la API de perfil no acepta el rol',
  'profile.emailStatus': 'Estado del correo',
  'profile.emailVerified': 'Correo verificado',
  'profile.emailNotVerified': 'Correo sin verificar',
  'profile.memberSince': 'Miembro desde',
  'profile.accountLine': 'Cuenta #{id} Â· sesiÃ³n iniciada como {role}',
  'profile.errName': 'Introduce tu nombre: la API rechaza un nombre vacÃ­o.',
  'profile.errSave': 'No se pudo guardar el perfil. IntÃ©ntalo de nuevo.',

  'explore.title': 'Explorar existencias',
  'explore.subLoading': 'Cargando lotes disponiblesâ€¦',
  'explore.subCount': '{n} publicaciones que coinciden con tus filtros',
  'explore.searchPlaceholder': 'CÃ¡todo de cobre, bombasâ€¦',
  'explore.searchAria': 'Buscar publicaciones',
  'explore.categoryAria': 'CategorÃ­a',
  'explore.allCategories': 'Todas las categorÃ­as',
  'explore.originAria': 'PaÃ­s de origen',
  'explore.allCountries': 'Todos los paÃ­ses',
  'explore.min': 'MÃ­n. $',
  'explore.max': 'MÃ¡x. $',
  'explore.emptyTitle': 'Ninguna publicaciÃ³n coincide con esos filtros',
  'explore.emptyBody': 'Prueba una categorÃ­a mÃ¡s amplia, otro paÃ­s de origen o limpia los filtros.',
  'explore.page': 'PÃ¡gina {page} de {pages}',
  'explore.prev': 'â† Anterior',
  'explore.next': 'Siguiente â†’',

  'feed.welcomeBack': 'Bienvenido de nuevo, {name}',
  'feed.title': 'Inicio del marketplace',
  'feed.sub': 'Stock disponible, excedentes y sobrestock de fÃ¡bricas verificadas: lo mÃ¡s reciente primero.',
  'feed.sellStock': 'Vender stock',
  'feed.postRequest': 'Publicar una solicitud',
  'feed.lotsCount': '{n} lotes',
  'feed.lotsMatch': 'lotes coinciden con tus filtros',
  'feed.verifiedSuppliers': 'proveedores verificados',
  'feed.openRequests': 'solicitudes abiertas',
  'feed.allOrigins': 'Todos los orÃ­genes',
  'feed.searchAria': 'Buscar lotes',
  'feed.minAria': 'Precio mÃ­nimo',
  'feed.maxAria': 'Precio mÃ¡ximo',
  'feed.allIndustries': 'Todos los sectores',
  'feed.noLots': 'Sin lotes',
  'feed.shownRange': '{first}â€“{last} de {total}',
  'feed.emptyTitle': 'NingÃºn lote coincide con esos filtros',
  'feed.emptyBody': 'Prueba otro sector, otro paÃ­s de origen o limpia los filtros.',
  'feed.lookingFor': 'Â¿Buscas algo concreto?',
  'feed.postRequestLink': 'Publica una solicitud',
  'feed.lookingForTail': 'y las fÃ¡bricas verificadas te cotizarÃ¡n.',
  'feed.sellingInstead': 'Â¿Prefieres vender?',
  'feed.listYourStock': 'Publica tu stock',
  'feed.signedInAs': 'sesiÃ³n iniciada como {role}',
  'feed.createFree': 'crea una cuenta gratis',

  'help.title': 'CÃ³mo funciona FactoryDepo',
  'help.sub': 'Stock disponible, solicitudes de cotizaciÃ³n y suministro respaldado por inspecciÃ³n.',
  'help.buying': 'Comprar',
  'help.buying1.title': '1. Explora stock disponible.',
  'help.buying1':
    'Cada lote activo muestra su precio, la cantidad mÃ­nima de pedido, el paÃ­s de origen y cuÃ¡nto hay realmente disponible. Las publicaciones marcadas como Demo son datos de ejemplo â€”no ofertas realesâ€” y van etiquetadas para que nunca te lleven a engaÃ±o.',
  'help.buying2.title': '2. Pide una cotizaciÃ³n.',
  'help.buying2':
    'Publica una solicitud describiendo lo que necesitas. Los proveedores cotizan con un precio, un plazo y sus condiciones.',
  'help.buying3.title': '3. Compara y compromÃ©tete.',
  'help.buying3': 'Las cotizaciones se ven en paralelo en la solicitud. Aceptar una crea un pedido.',
  'help.buying4.title': '4. Paga por transferencia bancaria.',
  'help.buying4':
    'El comercio industrial no funciona con tarjetas. Recibes una factura proforma, pagas por TT/transferencia y el pedido se marca como pagado cuando se confirman los fondos.',
  'help.selling': 'Vender',
  'help.selling1.title': '1. Crea una cuenta de proveedor.',
  'help.selling1': 'Registrarte como proveedor crea tu perfil de empresa de inmediato.',
  'help.selling2.title': '2. Publica tu stock.',
  'help.selling2':
    'Las herramientas de publicaciÃ³n estÃ¡n en desarrollo; hasta que lleguen, nuestro equipo aÃ±ade las publicaciones de proveedores durante el alta.',
  'help.selling3.title': '3. Cotiza las solicitudes entrantes.',
  'help.selling3':
    'Las solicitudes abiertas de compradores aparecen en tu panel con un recuento en vivo de las que no has respondido.',
  'help.selling4.title': '4. VerifÃ­cate.',
  'help.selling4':
    'Los niveles de verificaciÃ³n desbloquean visibilidad. Las insignias solo se conceden cuando se aprueban los documentos, asÃ­ que una insignia aquÃ­ significa algo.',
  'help.notLive': 'Lo que aÃºn no estÃ¡ operativo',
  'help.notLiveLead': 'Preferimos decirlo claramente antes que dejes que lo descubras tÃº:',
  'help.notLive1': 'Las herramientas de autopublicaciÃ³n para proveedores estÃ¡n en desarrollo.',
  'help.notLive2': 'La mensajerÃ­a entre comprador y proveedor aÃºn no estÃ¡ disponible: usa los datos de contacto del perfil del proveedor.',
  'help.notLive3': 'Las ofertas y contraofertas se gestionan manualmente por ahora.',
  'help.notLive4': 'El seguimiento de envÃ­os y la gestiÃ³n documental no estÃ¡n desarrollados.',
  'help.exploreCta': 'Explorar existencias',
  'help.rfqCta': 'Solicitudes de cotizaciÃ³n',

  'soon.sub': 'AÃºn no desarrollado',
  'soon.title': 'Esta vista pertenece a la siguiente fase de desarrollo',
  'soon.body': 'La pantalla existe en la navegaciÃ³n, pero sus tablas de datos y endpoints de API aÃºn no se han desarrollado.',
  'soon.note.offers': 'La tabla de ofertas y contraofertas llega en la siguiente fase de desarrollo.',
  'soon.note.shipments': 'Los hitos de envÃ­o y sus documentos llegan en la siguiente fase de desarrollo.',
  'soon.note.messages': 'La mensajerÃ­a entre comprador y proveedor llega en la siguiente fase de desarrollo.',
  'soon.note.saved': 'Los lotes guardados llegan en la siguiente fase de desarrollo.',
  'soon.note.notifications': 'El centro de notificaciones llega en la siguiente fase de desarrollo.',
  'soon.note.profile': 'La ediciÃ³n del perfil llega en la siguiente fase de desarrollo.',
  'soon.note.listings': 'La gestiÃ³n de publicaciones del proveedor con control de titularidad llega en la siguiente fase de desarrollo.',
  'soon.note.post': 'La creaciÃ³n y ediciÃ³n de publicaciones con subida de imÃ¡genes llega en la siguiente fase de desarrollo.',
  'soon.note.generic': 'Llega en la siguiente fase de desarrollo.',
  'soon.note.verification': 'Los niveles de verificaciÃ³n y el envÃ­o de documentos llegan en la siguiente fase de desarrollo.',
  'soon.note.admin': 'El panel de administraciÃ³n llega en la siguiente fase de desarrollo.',
  'soon.note.sources': 'El alta manual de proveedores llega en la siguiente fase de desarrollo.',
  'soon.note.features': 'Los indicadores de funciones llegan en la siguiente fase de desarrollo.',

  'orders.title': 'Pedidos',
  'orders.signInSub': 'Inicia sesiÃ³n para ver los pedidos en los que participas',
  'orders.notSignedIn': 'No has iniciado sesiÃ³n',
  'orders.notSignedInBody': 'Los pedidos son privados: inicia sesiÃ³n para ver lo que te has comprometido a comprar o vender.',
  'orders.createAccount': 'Crear una cuenta',
  'orders.subSupplier': 'Pedidos que los compradores hicieron sobre tu stock',
  'orders.subBuyer': 'Todo lo que te has comprometido a comprar',
  'orders.statListings': 'Mis publicaciones',
  'orders.statOffersReceived': 'Ofertas recibidas',
  'orders.statOffersOnRfqs': 'Ofertas en mis RFQ',
  'orders.statOrders': 'Pedidos',
  'orders.statSoldItems': 'ArtÃ­culos vendidos',
  'orders.statSoldTitle': 'Pedidos enviados o entregados',
  'orders.statViews': 'Visitas',
  'orders.statViewsTitle': 'Visitas registradas en los anuncios de tu Ã¡mbito',
  'orders.metricsError': 'No se han podido cargar las mÃ©tricas ahora mismo.',
  'orders.loadErrorTitle': 'No se han podido cargar los pedidos',
  'orders.loadErrorBody': 'La API no devolviÃ³ tus pedidos. Actualiza la pÃ¡gina o vuelve a iniciar sesiÃ³n.',
  'orders.emptyTitle': 'AÃºn no hay pedidos',
  'orders.emptySupplier': 'Cuando un comprador pida de tu stock, aparecerÃ¡ aquÃ­.',
  'orders.emptyBuyer': 'Los pedidos de compra inmediata que hagas sobre stock disponible aparecerÃ¡n aquÃ­.',
  'orders.browseStock': 'Ver stock disponible',
  'orders.postRfq': 'Publicar una RFQ',
  'orders.count': '{n} pedidos',
  'orders.col.order': 'Pedido',
  'orders.col.product': 'Producto',
  'orders.col.counterparty': 'Contraparte',
  'orders.col.qty': 'Cant.',
  'orders.col.total': 'Total',
  'orders.col.status': 'Estado',
  'orders.col.date': 'Fecha',
  'orders.buyerLabel': 'comprador',
  'orders.supplierLabel': 'proveedor',
  'orders.buyerId': 'Comprador #{id}',

  'product.loadingTitle': 'Cargandoâ€¦',
  'product.loadingThis': 'esta publicaciÃ³n',
  'product.fetching': 'Obteniendo {what}â€¦',
  'product.notFound': 'Producto no encontrado',
  'product.backToExplore': 'Volver a explorar',
  'product.noPhoto': 'No se ha facilitado foto de este lote',
  'product.pricePer': 'Precio / {unit}',
  'product.minOrder': 'Pedido mÃ­nimo',
  'product.availableNow': 'Disponible ahora',
  'product.origin': 'PaÃ­s de origen',
  'product.unavailable': 'No disponible actualmente',
  'product.buyNowHeading': 'Comprar ya â€” stock disponible',
  'product.soldOutBody': 'Este lote estÃ¡ marcado como agotado. Pide al proveedor el siguiente lote disponible.',
  'product.noUnitsBody': 'No hay unidades disponibles ahora mismo. Pide al proveedor el siguiente lote disponible.',
  'product.purchaseTerms': 'Compra al precio publicado de {price} por {unit}, mÃ­nimo {moq} {unit}.',
  'product.stockOnHand': 'Stock disponible',
  'product.buyNowPrice': 'Comprar ya Â· {price}/{unit}',
  'product.outOfStock': 'Comprar ya â€” sin existencias',
  'product.requestQuote': 'Solicitar cotizaciÃ³n',
  'product.shipsFrom': 'Se envÃ­a desde {country}',
  'product.signInToOrder': 'Inicia sesiÃ³n para pedir o solicitar una cotizaciÃ³n.',
  'product.supplier': 'Proveedor',
  'product.viewProfile': 'Ver perfil',
  'product.loadingSupplier': 'Cargando proveedorâ€¦',
  'product.supplierUnavailable': 'Los datos del proveedor no estÃ¡n disponibles.',
  'product.rating': 'ValoraciÃ³n',
  'product.inspections': 'Inspecciones',
  'product.fulfilment': 'Entregas a tiempo',
  'product.verifiedLevel': 'Nivel de verificaciÃ³n',
  'product.levelN': 'Nivel {n}',
  'product.tradingSince': 'Opera desde',
  'product.supplierFiguresHint': 'Las cifras son de todo el marketplace para este proveedor, no solo de este lote.',
  'product.description': 'DescripciÃ³n',
  'product.noDescription':
    'El proveedor no ha aÃ±adido una descripciÃ³n. Solicita una cotizaciÃ³n para conocer especificaciones, plazo y condiciones de entrega.',
  'product.specification': 'Especificaciones',
  'product.noSpec': 'No hay especificaciones registradas para este lote.',
  'product.col.attribute': 'Atributo',
  'product.col.value': 'Valor',
  'product.spec.category': 'CategorÃ­a',
  'product.spec.unit': 'Unidad',
  'product.spec.purity': 'Pureza / grado',

  'checkout.title': 'Comprar ya â€” pago',
  'checkout.placedTitle': 'Pedido realizado',
  'checkout.confirmed': 'Pedido #{id} confirmado',
  'checkout.notified': 'Se ha avisado al proveedor. Sigue el pedido desde tu pÃ¡gina de pedidos.',
  'checkout.viewOrders': 'Ver pedidos',
  'checkout.keepBrowsing': 'Seguir explorando',
  'checkout.pricePer': 'Precio / {unit}',
  'checkout.minimumOrder': 'Pedido mÃ­nimo',
  'checkout.availableNow': 'Disponible ahora',
  'checkout.quantity': 'Cantidad ({unit})',
  'checkout.qtyHint': 'Entre {moq} y {stock} {unit} en stock.',
  'checkout.fullName': 'Nombre completo',
  'checkout.country': 'PaÃ­s',
  'checkout.address': 'DirecciÃ³n',
  'checkout.city': 'Ciudad',
  'checkout.phone': 'TelÃ©fono',
  'checkout.notes': 'Notas para el proveedor',
  'checkout.total': 'Total {total}',
  'checkout.placeOrder': 'Realizar pedido Â· {total}',
  'checkout.placing': 'Realizando el pedidoâ€¦',
  'checkout.errPlace': 'No se pudo realizar el pedido.',

  'rfqModal.title': 'Solicitar cotizaciÃ³n',
  'rfqModal.postedTitle': 'Solicitud publicada',
  'rfqModal.live': 'Tu necesidad ya estÃ¡ publicada en el intercambio de RFQ',
  'rfqModal.canQuote': 'Los proveedores verificados ya pueden cotizar precio y plazo.',
  'rfqModal.viewMine': 'Ver mis RFQ',
  'rfqModal.listedBy': '{product} Â· publicado por {supplier}',
  'rfqModal.quantity': 'Cantidad',
  'rfqModal.unit': 'Unidad',
  'rfqModal.specs': 'Especificaciones, certificados, condiciones de entrega',
  'rfqModal.moqHint': 'El MOQ de la publicaciÃ³n es {moq} {unit}.',
  'rfqModal.post': 'Publicar solicitud',
  'rfqModal.posting': 'Publicandoâ€¦',
  'rfqModal.errPost': 'No se pudo publicar la solicitud.',
  'rfqModal.titleSuffix': 'solicitud de cotizaciÃ³n',

  'suppliers.loadingSub': 'Obteniendo el directorio de proveedores',
  'suppliers.loadingBody': 'Obteniendo el directorio de proveedoresâ€¦',
  'suppliers.title': 'Directorio de proveedores',
  'suppliers.sub':
    'FÃ¡bricas y casas comerciales en FactoryDepo. Los niveles de verificaciÃ³n proceden de auditorÃ­as presenciales y revisiÃ³n documental.',
  'suppliers.demoNote': 'las filas marcadas como demo son datos de ejemplo',
  'suppliers.loadErrorTitle': 'No se pudo cargar el directorio',
  'suppliers.loadErrorBody': 'El servicio de proveedores no respondiÃ³. IntÃ©ntalo de nuevo en un momento.',
  'suppliers.emptyTitle': 'AÃºn no hay proveedores',
  'suppliers.emptyBody': 'Los perfiles de proveedor aparecen aquÃ­ una vez dados de alta y verificados.',
  'suppliers.totalListed': 'Proveedores listados',
  'suppliers.totalVerified': 'Verificados nivel 2+',
  'suppliers.avgRating': 'ValoraciÃ³n media',
  'suppliers.avgRatingRated': 'ValoraciÃ³n media ({n} valorados)',
  'suppliers.avgFulfilment': 'Entregas a tiempo',
  'suppliers.avgFulfilmentMeasured': 'Entregas a tiempo ({n} medidos)',
  'suppliers.searchPlaceholder': 'Empresa, paÃ­s, ciudad, capacidadâ€¦',
  'suppliers.searchAria': 'Buscar proveedores',
  'suppliers.verifiedOnly': 'Solo verificados',
  'suppliers.showing': 'Mostrando {shown} de {total}',
  'suppliers.noMatchTitle': 'NingÃºn proveedor coincide con esa bÃºsqueda',
  'suppliers.noMatchBody': 'Prueba un nombre de empresa mÃ¡s corto o quita el filtro de verificaciÃ³n.',
  'suppliers.rating': 'ValoraciÃ³n',
  'suppliers.inspections': 'Inspecciones',
  'suppliers.fulfilment': 'Cumplimiento',

  'supplierDetail.loadingThis': 'este perfil de proveedor',
  'supplierDetail.notFound': 'Proveedor no encontrado',
  'supplierDetail.backToDirectory': 'Volver al directorio',
  'supplierDetail.backShort': 'â† Volver al directorio',
  'supplierDetail.tradingSince': 'Opera desde {year}',
  'supplierDetail.verifiedL3': 'Verificado Â· nivel 3',
  'supplierDetail.registered': 'Registrado',
  'supplierDetail.buyerRating': 'ValoraciÃ³n de compradores',
  'supplierDetail.notRated': 'aÃºn sin valoraciones',
  'supplierDetail.inspections': 'Inspecciones presenciales',
  'supplierDetail.fulfilment': 'Entregas a tiempo',
  'supplierDetail.activeListings': 'Publicaciones activas',
  'supplierDetail.tier': 'Nivel de verificaciÃ³n',
  'supplierDetail.trustScore': 'PuntuaciÃ³n de confianza (0â€“100)',
  'supplierDetail.about': 'Sobre {company}',
  'supplierDetail.noDescription': 'Este proveedor aÃºn no ha publicado una descripciÃ³n de empresa.',
  'supplierDetail.capabilities': 'Capacidades declaradas',
  'supplierDetail.record': 'VerificaciÃ³n y historial',
  'supplierDetail.ratingLabel': 'ValoraciÃ³n de compradores',
  'supplierDetail.inspectionsDone': 'Inspecciones completadas',
  'supplierDetail.contact': 'Contacto',
  'supplierDetail.contactBody': 'Los informes de inspecciÃ³n y los documentos de verificaciÃ³n se comparten con los miembros tras el primer contacto.',
  'supplierDetail.contactSupplier': 'Contactar con el proveedor',
  'supplierDetail.contactHintSignedIn': 'Abre el intercambio de RFQ: allÃ­ vive el hilo de cotizaciÃ³n.',
  'supplierDetail.contactHintGuest': 'Solo miembros Â· registro gratis',
  'supplierDetail.services': 'Servicios comerciales',
  'supplierDetail.service1': 'InspecciÃ³n de fÃ¡brica antes del pago',
  'supplierDetail.service2': 'Ensayos de laboratorio y anÃ¡lisis de materiales',
  'supplierDetail.service3': 'SupervisiÃ³n de carga de contenedores',
  'supplierDetail.service4': 'Apoyo en documentaciÃ³n de exportaciÃ³n',
  'supplierDetail.stockFrom': 'Stock de {company}',
  'supplierDetail.shown': '{n} mostrados',
  'supplierDetail.loadingLots': 'Cargando lotes disponiblesâ€¦',
  'supplierDetail.noneShown': 'No se muestran publicaciones activas',
  'supplierDetail.noneShownBody':
    'La API informa de {n} publicaciones de este proveedor, pero ninguna llegÃ³ en la vista actual. Publica una solicitud en el intercambio de RFQ para preguntar por su catÃ¡logo.',

  'rfq.titleSupplier': 'Oportunidades de RFQ',
  'rfq.titleBuyer': 'Solicitudes',
  'rfq.subSupplier': 'Necesidades abiertas publicadas por compradores. Responde con tu precio y plazo.',
  'rfq.subBuyer':
    'Necesidades actuales en el intercambio, lo mÃ¡s reciente primero. Abre una para ver las cotizaciones recibidas.',
  'rfq.postRequest': '+ Publicar una solicitud',
  'rfq.buyerOnlyNotice': 'Solo las cuentas de comprador pueden publicar una solicitud. Inicia sesiÃ³n con un perfil de comprador.',
  'rfq.total': 'solicitudes en total',
  'rfq.open': 'abiertas',
  'rfq.quoted': 'con cotizaciÃ³n',
  'rfq.closed': 'cerradas',
  'rfq.quoteable': 'Solicitudes que puedes cotizar',
  'rfq.allRequests': 'Todas las solicitudes',
  'rfq.shown': '{n} mostradas',
  'rfq.statusAll': 'Todas',
  'rfq.statusOpenCount': 'Abiertas ({n})',
  'rfq.statusQuotedCount': 'Con cotizaciÃ³n ({n})',
  'rfq.quotingCloses': 'La cotizaciÃ³n se cierra cuando el comprador acepta una oferta.',
  'rfq.emptyNone': 'AÃºn no hay solicitudes',
  'rfq.emptyNoMatch': 'Nada coincide con ese filtro',
  'rfq.emptyNoneSupplier': 'Ahora mismo no hay necesidades abiertas en el intercambio.',
  'rfq.emptyNoneBuyer': 'Publica tu primera necesidad y las fÃ¡bricas verificadas responderÃ¡n.',
  'rfq.emptyNoMatchHint': 'Prueba otro filtro de estado.',
  'rfq.col.requirement': 'Necesidad',
  'rfq.col.quantity': 'Cantidad',
  'rfq.col.deliverTo': 'Entregar en',
  'rfq.col.quotes': 'Cotizaciones',
  'rfq.col.posted': 'Publicada',
  'rfq.col.status': 'Estado',
  'rfq.openAria': 'Abrir RFQ #{id}',
  'rfq.requestRef': '{category} Â· solicitud #{id}',
  'rfq.quotesCount': '{n} cotizaciones',
  'rfq.postingBuyerOnly': 'Publicar es una acciÃ³n de comprador. Los proveedores pueden',
  'rfq.quoteOpen': 'cotizar necesidades abiertas',
  'rfq.newTitle': 'Nueva solicitud de cotizaciÃ³n',
  'rfq.whatNeed': 'Â¿QuÃ© necesitas?',
  'rfq.titlePlaceholder': 'p. ej. 100 MT de cÃ¡todo de cobre, grado A',
  'rfq.category': 'CategorÃ­a',
  'rfq.deliverTo': 'Entregar en',
  'rfq.quantity': 'Cantidad',
  'rfq.unit': 'Unidad',
  'rfq.specification': 'Especificaciones',
  'rfq.specPlaceholder': 'Grado, pureza, certificados, Incoterms, embalajeâ€¦',
  'rfq.specHint': 'Cuanto mÃ¡s clara sea la especificaciÃ³n, mÃ¡s rÃ¡pido cotizarÃ¡n las fÃ¡bricas verificadas.',
  'rfq.errTitle': 'Pon a la solicitud un tÃ­tulo claro: al menos 5 caracteres.',
  'rfq.errQuantity': 'La cantidad debe ser un nÃºmero mayor que cero.',
  'rfq.errPost': 'No se pudo publicar esta solicitud.',

  'rfqDetail.loadingTitle': 'Solicitud',
  'rfqDetail.loadingSub': 'Cargandoâ€¦',
  'rfqDetail.title': 'Solicitud',
  'rfqDetail.notFound': 'Solicitud no encontrada',
  'rfqDetail.notFoundBody': 'Es posible que esta necesidad se haya retirado o que el enlace sea incorrecto.',
  'rfqDetail.backToRequests': 'â† Volver a las solicitudes',
  'rfqDetail.allRequests': 'â† Todas las solicitudes',
  'rfqDetail.postedOn': 'publicada el {date}',
  'rfqDetail.requestRef': 'Solicitud #{id}',
  'rfqDetail.accepting': 'Aceptando cotizaciones',
  'rfqDetail.notAccepting': 'No acepta nuevas cotizaciones',
  'rfqDetail.noSpec': 'No se han facilitado mÃ¡s especificaciones.',
  'rfqDetail.quantity': 'Cantidad',
  'rfqDetail.deliverTo': 'Entregar en',
  'rfqDetail.quotations': 'Cotizaciones',
  'rfqDetail.deadline': 'Fecha lÃ­mite',
  'rfqDetail.requestedBy': 'Solicitada por',
  'rfqDetail.received': '{n} recibidas',
  'rfqDetail.noneTitle': 'AÃºn no hay cotizaciones',
  'rfqDetail.noneBody': 'Proveedores verificados estÃ¡n revisando esta necesidad.',
  'rfqDetail.col.supplier': 'Proveedor',
  'rfqDetail.col.price': 'Precio',
  'rfqDetail.col.leadTime': 'Plazo',
  'rfqDetail.col.notes': 'Notas',
  'rfqDetail.col.sent': 'Enviada',
  'rfqDetail.col.status': 'Estado',
  'rfqDetail.trustScore': 'PuntuaciÃ³n de confianza {n}',
  'rfqDetail.days': '{n} dÃ­as',
  'rfqDetail.submitTitle': 'Enviar una cotizaciÃ³n',
  'rfqDetail.supplierAccount': 'Cuenta de proveedor',
  'rfqDetail.fromSupplier': 'Las cotizaciones provienen de cuentas de proveedor. Cambia a tu cuenta de proveedor para responder.',
  'rfqDetail.signInSupplierBody': 'Solo las cuentas de proveedor con sesiÃ³n iniciada pueden cotizar. Explorar sigue abierto a todos.',
  'rfqDetail.supplierOnly': 'Solo cuentas de proveedor',
  'rfqDetail.signInAsSupplier': 'Iniciar sesiÃ³n como proveedor',
  'rfqDetail.closedBody': 'Esta solicitud estÃ¡ {status} y ya no acepta cotizaciones.',
  'rfqDetail.seeOpen': 'Ver solicitudes abiertas',
  'rfqDetail.respondBody': 'Responde con tu precio unitario y plazo. Tu perfil verificado acompaÃ±a a la cotizaciÃ³n.',
  'rfqDetail.unitPrice': 'Precio unitario (USD)',
  'rfqDetail.leadTime': 'Plazo (dÃ­as)',
  'rfqDetail.termsNotes': 'Condiciones y notas',
  'rfqDetail.termsPlaceholder': 'Incoterms, grado, embalaje, polÃ­tica de muestras, validezâ€¦',
  'rfqDetail.compareHint': 'Los compradores comparan precio, plazo y verificaciÃ³n en paralelo.',
  'rfqDetail.submitQuote': 'Enviar cotizaciÃ³n',
  'rfqDetail.submitting': 'Enviandoâ€¦',
  'rfqDetail.errPrice': 'Introduce un precio unitario mayor que cero.',
  'rfqDetail.errLead': 'El plazo debe ser un nÃºmero entero de dÃ­as entre 1 y 365.',
  'rfqDetail.errSubmit': 'No se pudo enviar esta cotizaciÃ³n.',

  'listings.title': 'Mis publicaciones',
  'listings.sub': 'El stock que has publicado en el marketplace',
  'listings.signInSub': 'El stock que has publicado en el marketplace',
  'listings.notSignedIn': 'No has iniciado sesiÃ³n',
  'listings.notSignedInBody': 'Tus publicaciones son privadas de tu cuenta de proveedor. Inicia sesiÃ³n para verlas y gestionarlas.',
  'listings.createSupplierAccount': 'Crear una cuenta de proveedor',
  'listings.supplierOnly': 'Solo cuentas de proveedor',
  'listings.supplierOnlyBody':
    'Tu cuenta es una cuenta de {role}. Las publicaciones las gestiona el proveedor que las posee, asÃ­ que aquÃ­ no hay nada que mostrar ni editar.',
  'listings.browseStock': 'Ver stock disponible',
  'listings.subLoading': 'Cargando tu stockâ€¦',
  'listings.subCount': '{n} publicaciones publicadas bajo tu perfil de proveedor',
  'listings.postStock': '+ Publicar stock',
  'listings.lotsPublished': 'lotes publicados',
  'listings.bankTransferNote': 'Los compradores pagan por transferencia bancaria cuando se acepta una oferta.',
  'listings.loadErrorTitle': 'No se han podido cargar tus publicaciones',
  'listings.loadErrorBody': 'No se pudieron cargar tus publicaciones. IntÃ©ntalo de nuevo. Si sigue fallando, vuelve a iniciar sesiÃ³n.',
  'listings.emptyTitle': 'AÃºn no hay publicaciones',
  'listings.emptyBody':
    'Publica tu primer lote: una foto, un precio unitario y cuÃ¡nto puedes enviar hoy. Se publica en Explorar para todos los compradores del marketplace.',
  'listings.postFirst': '+ Publicar tu primer lote',
  'listings.getVerified': 'Verificarme',
  'listings.count': '{n} publicaciones',
  'listings.col.lot': 'Lote',
  'listings.col.category': 'CategorÃ­a',
  'listings.col.unitPrice': 'Precio unitario',
  'listings.col.moq': 'MOQ',
  'listings.col.available': 'Disponible',
  'listings.col.status': 'Estado',
  'listings.col.posted': 'Publicado',
  'listings.lotRef': 'lote #{id}',
  'listings.noPhotoInline': 'sin foto',
  'listings.demoNoteLead': 'Un lote marcado como',
  'listings.demoNoteTail':
    'son datos de ejemplo facilitados por el marketplace, no stock publicado por ti. Eliminarlo lo quita para todos.',
  'listings.updated': 'PublicaciÃ³n actualizada.',
  'listings.deleted': 'PublicaciÃ³n eliminada. Ya no estÃ¡ en el marketplace.',
  'listings.deleteTitle': 'Â¿Eliminar esta publicaciÃ³n?',
  'listings.deleteLead': '{name} â€” lote #{id}',
  'listings.deleteBody':
    'Esta publicaciÃ³n se elimina de forma permanente. Desaparece de Explorar y de tu tabla de publicaciones de inmediato, y los compradores ya no pueden pedir ni negociar sobre ella. No se puede deshacer.',
  'listings.deleteKeepBody':
    'Un lote que ya tiene pedidos u ofertas no se puede eliminar: la API lo conserva para el registro. MÃ¡rcalo como agotado poniendo el stock disponible a 0.',
  'listings.keepListing': 'Mantener publicaciÃ³n',
  'listings.deleteForever': 'Eliminar permanentemente',
  'listings.deleting': 'Eliminandoâ€¦',
  'listings.deleteErr': 'No se pudo eliminar esta publicaciÃ³n.',
  'listings.editTitle': 'Editar publicaciÃ³n â€” lote #{id}',

  'post.title': 'Publicar stock',
  'post.titleEdit': 'Editar publicaciÃ³n',
  'post.sub': 'Un lote por publicaciÃ³n: quÃ© es, cuÃ¡nto cuesta y cuÃ¡nto puedes enviar hoy',
  'post.subEdit': 'Modificando el lote #{id}: guardar sobrescribe la publicaciÃ³n activa',
  'post.signInSub': 'Publica stock disponible para que los compradores pidan o negocien',
  'post.notSignedIn': 'No has iniciado sesiÃ³n',
  'post.notSignedInBody': 'Publicar stock es una acciÃ³n de proveedor. Inicia sesiÃ³n con una cuenta de proveedor para publicar un lote.',
  'post.createSupplierAccount': 'Crear una cuenta de proveedor',
  'post.supplierOnly': 'Solo cuentas de proveedor',
  'post.supplierOnlyBody':
    'Tu cuenta es una cuenta de {role}, asÃ­ que la API no aceptarÃ¡ una publicaciÃ³n suya. Se requiere un perfil de proveedor antes de publicar stock.',
  'post.myListings': 'Mis publicaciones',
  'post.loadErrorTitle': 'No se pudo cargar la publicaciÃ³n',
  'post.loadErrorBody': 'No se pudo cargar este lote. IntÃ©ntalo de nuevo o vuelve a tus publicaciones.',
  'post.details': 'Datos de la publicaciÃ³n',
  'post.newListing': 'Nueva publicaciÃ³n',
  'post.requiredMark': '* obligatorio',
  'post.lotName': 'Nombre del lote',
  'post.lotNamePlaceholder': 'p. ej. CÃ¡todo de cobre grado A, 99,99%',
  'post.category': 'CategorÃ­a',
  'post.originCountry': 'PaÃ­s de origen',
  'post.notStated': 'Sin indicar',
  'post.description': 'DescripciÃ³n',
  'post.descriptionPlaceholder': 'Grado, embalaje, Incoterms, plazo, certificadosâ€¦',
  'post.descriptionHint': 'Los compradores deciden a partir de este texto. Di quÃ© contiene el lote y cÃ³mo se envÃ­a.',
  'post.unitPrice': 'Precio unitario',
  'post.currency': 'Moneda',
  'post.unit': 'Unidad',
  'post.moq': 'Pedido mÃ­nimo (MOQ)',
  'post.moqHint': 'Por defecto 1.',
  'post.available': 'Disponible ahora',
  'post.availableHint': 'Por defecto 0: el stock que puedes enviar hoy.',
  'post.purity': 'Pureza / grado',
  'post.purityPlaceholder': '99,99% / Grado A',
  'post.optional': 'Opcional.',
  'post.photoUrl': 'URL de la foto',
  'post.photoPlaceholder': 'https://â€¦/copper-cathode.jpg',
  'post.photoHintLead': 'La subida de archivos aÃºn no estÃ¡ desarrollada.',
  'post.photoHintTail':
    'Pega un enlace pÃºblico a la foto y se guardarÃ¡ como imagen de este lote. Los lotes sin foto muestran un marcador de posiciÃ³n simple.',
  'post.preview': 'Vista previa: si no carga nada, el enlace no es una imagen directa.',
  'post.save': 'Guardar cambios',
  'post.saving': 'Guardandoâ€¦',
  'post.errName': 'Pon un nombre al lote: al menos 2 caracteres.',
  'post.errCategory': 'Elige una categorÃ­a.',
  'post.errUnit': 'Indica la unidad en la que vendes (MT, KG, pcsâ€¦).',
  'post.errPrice': 'El precio unitario debe ser un nÃºmero mayor que cero.',
  'post.errMoq': 'El MOQ debe ser un nÃºmero mayor que cero.',
  'post.errQty': 'La cantidad disponible no puede ser negativa.',
  'post.errSave': 'No se pudo guardar esta publicaciÃ³n.',
  'post.errCreate': 'No se pudo publicar este lote.',
  'post.behaviour': 'CÃ³mo se comporta esta publicaciÃ³n',
  'post.behaviourBody':
    'Un lote publicado aparece en Explorar de inmediato y cualquier comprador con sesiÃ³n puede pedirlo. Los compradores tambiÃ©n pueden abrir una oferta por debajo de tu precio; las respondes desde',
  'post.offersLink': 'Ofertas',
  'post.provenance': 'Procedencia',
  'post.platformListing': 'PublicaciÃ³n de la plataforma',
  'post.photo': 'Foto',
  'post.urlOnly': 'Solo URL â€” subida no desarrollada',
  'post.buyerPaysBy': 'El comprador paga por',
  'post.bankTransfer': 'Transferencia bancaria',
  'post.noMetrics':
    'Nada en esta pÃ¡gina muestra visitas, valoraciones ni nÃºmero de pedidos: esas cifras aÃºn no se miden, asÃ­ que no se muestran.',

  'offers.title': 'Ofertas sobre tu stock',
  'offers.sub': 'Compradores negociando tus lotes',
  'offers.signInSub': 'Compradores negociando tus lotes',
  'offers.notSignedIn': 'No has iniciado sesiÃ³n',
  'offers.notSignedInBody': 'Las ofertas son privadas del comprador y del proveedor implicados. Inicia sesiÃ³n para responderlas.',
  'offers.createSupplierAccount': 'Crear una cuenta de proveedor',
  'offers.supplierOnly': 'Solo cuentas de proveedor',
  'offers.supplierOnlyBody':
    'Tu cuenta es una cuenta de {role}, no tiene stock publicado y no pueden llegar ofertas. Las ofertas que has hecho como comprador estÃ¡n en el lado comprador del marketplace.',
  'offers.browseStock': 'Ver stock disponible',
  'offers.subLoading': 'Cargando ofertasâ€¦',
  'offers.subCount': '{n} ofertas sobre tus publicaciones',
  'offers.awaiting': 'esperando tu respuesta',
  'offers.decided': 'decididas',
  'offers.acceptCreates': 'Aceptar una oferta crea un pedido; el comprador paga por transferencia bancaria.',
  'offers.filterAwaiting': 'Esperando respuesta ({n})',
  'offers.filterDecided': 'Decididas ({n})',
  'offers.counterNote': 'Las contraofertas abren una nueva oferta vinculada; tus condiciones originales quedan en el registro.',
  'offers.loadErrorTitle': 'No se han podido cargar las ofertas',
  'offers.loadErrorBody': 'No se pudieron cargar las ofertas sobre tu stock. IntÃ©ntalo de nuevo.',
  'offers.emptyTitle': 'AÃºn no hay ofertas',
  'offers.emptyBody':
    'Cuando un comprador negocie uno de tus lotes aparecerÃ¡ aquÃ­, con el precio que propone y la cantidad que quiere. Puedes aceptarla, rechazarla o responder con tu propio precio.',
  'offers.seeListings': 'Ver mis publicaciones',
  'offers.postMore': '+ Publicar mÃ¡s stock',
  'offers.noneAwaiting': 'Nada esperando tu respuesta',
  'offers.noneDecided': 'AÃºn no hay ofertas decididas',
  'offers.noneAwaitingBody': 'Todas las ofertas sobre tu stock estÃ¡n respondidas. Cambia a Decididas para revisarlas.',
  'offers.noneDecidedBody': 'Las ofertas que aceptas o rechazas se guardan aquÃ­ como registro.',
  'offers.count': '{n} ofertas',
  'offers.col.listing': 'PublicaciÃ³n',
  'offers.col.buyer': 'Comprador',
  'offers.col.quantity': 'Cantidad',
  'offers.col.theirPrice': 'Su precio',
  'offers.col.status': 'Estado',
  'offers.col.received': 'Recibida',
  'offers.decidedLabel': 'Decidida',
  'offers.counter': 'Contraoferta',
  'offers.accept': 'Aceptar',
  'offers.reject': 'Rechazar',
  'offers.offerRef': 'oferta #{id}',
  'offers.answersOffer': 'responde a la oferta #{id}',
  'offers.demoNoteLead': 'Una fila marcada como',
  'offers.demoNoteTail':
    'corresponde a un lote de ejemplo, no a stock que hayas publicado. Aceptarla sigue creando un pedido real: revisa el lote antes de comprometerte.',
  'offers.counterTitle': 'Contraoferta #{id}',
  'offers.counterBody':
    '{buyer} ofreciÃ³ {price} / {qty} por {product}. Tu respuesta se convierte en una nueva oferta vinculada; las condiciones del comprador quedan en el registro.',
  'offers.counterPrice': 'Tu precio unitario',
  'offers.perUnit': '{currency} por unidad',
  'offers.counterQty': 'Cantidad',
  'offers.counterQtyHint': 'DÃ©jala igual para mantener la cantidad del comprador.',
  'offers.counterNotes': 'Nota para el comprador',
  'offers.counterNotesPlaceholder': 'Plazo, embalaje, Incoterms, validez de este precioâ€¦',
  'offers.sendCounter': 'Enviar contraoferta',
  'offers.sending': 'Enviandoâ€¦',
  'offers.counterErrPrice': 'Tu precio de contraoferta debe ser un nÃºmero mayor que cero.',
  'offers.counterErrQty': 'La cantidad debe ser un nÃºmero mayor que cero.',
  'offers.counterErr': 'No se pudo enviar esta contraoferta.',
  'offers.counterDone': 'Contraoferta enviada. La oferta original queda marcada como con contraoferta y se avisa al comprador.',
  'offers.acceptTitle': 'Â¿Aceptar la oferta #{id}?',
  'offers.listing': 'PublicaciÃ³n',
  'offers.buyer': 'Comprador',
  'offers.quantity': 'Cantidad',
  'offers.unitPrice': 'Precio unitario',
  'offers.offerValue': 'Valor de la oferta',
  'offers.acceptBodyLead': 'Aceptar crea un pedido.',
  'offers.acceptBodyBank': 'El comprador queda comprometido y paga por',
  'offers.acceptBodyTail':
    ': la plataforma no acepta pagos con tarjeta. TÃº emites la proforma y confirmas la transferencia cuando llega; el pedido pasa entonces a envÃ­o. Esta decisiÃ³n es firme: una oferta aceptada no se puede volver a decidir.',
  'offers.acceptCta': 'Aceptar y crear pedido',
  'offers.accepting': 'Aceptandoâ€¦',
  'offers.acceptErr': 'No se pudo aceptar esta oferta.',
  'offers.acceptDone': 'Oferta #{id} aceptada. Se ha creado un pedido para {buyer}.',
  'offers.rejectTitle': 'Â¿Rechazar la oferta #{id}?',
  'offers.rejectBody':
    'La oferta de {buyer} de {price} por {product} queda cerrada. Rechazar es definitivo: el comprador no puede revivir esta oferta, aunque puede abrir otra nueva.',
  'offers.rejectCta': 'Rechazar oferta',
  'offers.rejecting': 'Rechazandoâ€¦',
  'offers.rejectErr': 'No se pudo rechazar esta oferta.',
  'offers.rejectDone': 'Oferta #{id} rechazada.',

  'myoffers.titleSupplier': 'Ofertas sobre mi stock',
  'myoffers.titleAdmin': 'Todas las ofertas',
  'myoffers.titleBuyer': 'Mis ofertas',
  'myoffers.subSupplier': 'Ofertas que los compradores han hecho sobre tu stock. Puedes contraofertar, aceptar o rechazar cada una.',
  'myoffers.subAdmin': 'Todas las ofertas de la plataforma, las mÃ¡s recientes primero.',
  'myoffers.subBuyer': 'Ofertas que has hecho sobre stock disponible. Puedes contraofertar, aceptar o rechazar cada una.',
  'myoffers.signInSub': 'Inicia sesiÃ³n para ver las ofertas que estÃ¡s negociando',
  'myoffers.notSignedIn': 'No has iniciado sesiÃ³n',
  'myoffers.notSignedInBody': 'Las ofertas son privadas de las dos partes: inicia sesiÃ³n para abrir, contraofertar o aceptar una.',
  'myoffers.loadErrorTitle': 'No se han podido cargar las ofertas',
  'myoffers.loadErrorBody': 'La API no devolviÃ³ tus ofertas: intÃ©ntalo de nuevo.',
  'myoffers.trying': 'Reintentandoâ€¦',
  'myoffers.emptyTitle': 'AÃºn no hay ofertas',
  'myoffers.emptySupplier': 'Las ofertas que los compradores hagan sobre tus publicaciones aparecerÃ¡n aquÃ­, listas para contraofertar o aceptar.',
  'myoffers.emptyAdmin': 'TodavÃ­a no se ha abierto ninguna oferta en la plataforma.',
  'myoffers.emptyBuyer': 'Abre un lote que te interese y haz una oferta: el proveedor puede contraofertar, aceptarla o rechazarla.',
  'myoffers.browseStock': 'Ver stock disponible',
  'myoffers.count': '{n} ofertas',
  'myoffers.stillOpen': '{n} siguen abiertas',
  'myoffers.col.offer': 'Oferta',
  'myoffers.col.counterparty': 'Contraparte',
  'myoffers.col.quantity': 'Cantidad',
  'myoffers.col.unitPrice': 'Precio unitario',
  'myoffers.col.status': 'Estado',
  'myoffers.col.date': 'Fecha',
  'myoffers.col.action': 'AcciÃ³n',
  'myoffers.counterTo': 'contraoferta a #{id}',
  'myoffers.offerRef': 'oferta #{id}',
  'myoffers.answersOffer': 'responde a la oferta #{id}',
  'myoffers.seatSupplier': 'proveedor',
  'myoffers.seatBuyer': 'comprador',
  'myoffers.noAction': 'Sin mÃ¡s acciones',
  'myoffers.confirmReject': 'Confirmar rechazo',
  'myoffers.counter': 'Contraofertar',
  'myoffers.accept': 'Aceptar',
  'myoffers.reject': 'Rechazar',
  'myoffers.counterTitle': 'Contraoferta #{id}',
  'myoffers.counterDoneTitle': 'Contraoferta enviada',
  'myoffers.counterDoneBody': 'Tu contraoferta estÃ¡ en manos de la otra parte',
  'myoffers.backToOffers': 'Volver a mis ofertas',
  'myoffers.counterLead': '{product} Â· oferta #{id} Â· {qty} ofrecidas a {price} por unidad',
  'myoffers.perUnit': 'En {currency}, por unidad.',
  'myoffers.inCurrency': 'En {currency}, por unidad.',
  'myoffers.originally': 'Originalmente {qty}.',
  'myoffers.messageLabel': 'Mensaje a la otra parte',
  'myoffers.messagePlaceholder': 'Plazo de entrega, embalaje, condiciones de pagoâ€¦',
  'myoffers.sendCounter': 'Enviar contraoferta',
  'myoffers.sending': 'Enviandoâ€¦',
  'myoffers.errInvalid': 'Introduce un precio unitario y una cantidad mayores que cero.',
  'myoffers.errCounter': 'No se ha podido enviar la contraoferta: intÃ©ntalo de nuevo.',
  'myoffers.acceptTitle': 'Aceptar la oferta #{id}',
  'myoffers.acceptLead': '{product} Â· {qty} a {price} por unidad',
  'myoffers.acceptStripeLead': 'Aceptar supone aceptar este precio y esta cantidad y',
  'myoffers.acceptStripeStrong': 'crea un pedido',
  'myoffers.acceptStripeTail': 'para ello. El pedido aparece despuÃ©s en Pedidos, donde se siguen los hitos del envÃ­o.',
  'myoffers.acceptHint': 'Esto no se puede deshacer: la negociaciÃ³n se cierra con las condiciones aceptadas.',
  'myoffers.acceptCta': 'Aceptar y crear pedido',
  'myoffers.accepting': 'Aceptandoâ€¦',
  'myoffers.errAccept': 'No se ha podido aceptar la oferta: intÃ©ntalo de nuevo.',
  'myoffers.accepted': 'Oferta #{id} aceptada. Consulta Pedidos para ver el pedido resultante.',
  'myoffers.viewOrders': 'Ver pedidos',
  'myoffers.errReject': 'No se ha podido rechazar la oferta #{id}: intÃ©ntalo de nuevo.',
  'ship.title': 'EnvÃ­os',
  'ship.subSupplier': 'Hitos de los pedidos realizados sobre tu stock. TÃº avanzas cada envÃ­o.',
  'ship.subAdmin': 'Hitos de todos los pedidos. Los administradores pueden avanzar un envÃ­o en nombre del proveedor.',
  'ship.subBuyer': 'Seguimiento de hitos de los pedidos que realizaste. Tu proveedor avanza cada paso.',
  'ship.signInSub': 'Inicia sesiÃ³n para seguir tus envÃ­os',
  'ship.notSignedIn': 'No has iniciado sesiÃ³n',
  'ship.notSignedInBody': 'El seguimiento del envÃ­o es privado del comprador y el proveedor de un pedido.',
  'ship.loadErrorTitle': 'No se han podido cargar los envÃ­os',
  'ship.loadErrorBody': 'La API no devolviÃ³ tus envÃ­os: intÃ©ntalo de nuevo.',
  'ship.trying': 'Reintentandoâ€¦',
  'ship.emptyTitle': 'AÃºn no hay envÃ­os',
  'ship.emptySupplier': 'Un envÃ­o se crea automÃ¡ticamente cuando un comprador pide de tu stock.',
  'ship.emptyBuyer': 'Se crea un envÃ­o automÃ¡ticamente por cada pedido que realizas, y sus hitos aparecen aquÃ­.',
  'ship.myListings': 'Mis publicaciones',
  'ship.viewOrders': 'Ver mis pedidos',
  'ship.count': 'envÃ­os visibles para tu cuenta',
  'ship.delivered': 'entregados',
  'ship.advanceRecorded': 'Avanzar un hito se registra con marca de tiempo y se comparte con el comprador.',
  'ship.advanceBySupplier': 'Los hitos los avanza el proveedor en cada pedido.',
  'ship.trackingTitle': 'Seguimiento del envÃ­o',
  'ship.col.shipment': 'EnvÃ­o',
  'ship.col.product': 'Producto',
  'ship.col.carrier': 'Transportista',
  'ship.col.trackingNo': 'N.Âº de seguimiento',
  'ship.col.documents': 'Documentos',
  'ship.col.updated': 'Ãšltima actualizaciÃ³n',
  'ship.col.milestone': 'Hito',
  'ship.noDocumentTitle': 'TodavÃ­a no hay ningÃºn documento adjunto a un envÃ­o',
  'ship.advance': 'Avanzar hito',
  'ship.advancing': 'Avanzandoâ€¦',
  'ship.deliveredLabel': 'Entregado',
  'ship.advancedBySupplier': 'Avanzado por el proveedor',
  'ship.completeTitle': 'Se han alcanzado todos los hitos',
  'ship.advanceTitle': 'Avanzar este envÃ­o un paso',
  'ship.noMilestones': 'TodavÃ­a no hay hitos registrados en este envÃ­o.',
  'ship.reached': '{step} de {total} hitos alcanzados',
  'ship.reachedDelivered': 'entregado',
  'ship.reachedNext': 'siguiente: {next}',
  'ship.footLead': 'El historial de hitos lo comparten ambas partes del pedido. Los pedidos y sus importes estÃ¡n en',
  'ship.footLink': 'Pedidos',
  'ship.footTail': '.',
  'ship.errAdvance': 'No se ha podido avanzar el envÃ­o #{id}: intÃ©ntalo de nuevo.',
  'saved.title': 'Lotes guardados',
  'saved.signInSub': 'Inicia sesiÃ³n para guardar una lista de lotes',
  'saved.notSignedIn': 'No has iniciado sesiÃ³n',
  'saved.notSignedInBody': 'Tu lista es privada de tu cuenta: inicia sesiÃ³n para guardar y quitar lotes.',
  'saved.sub': 'Lotes que has guardado. Los precios y el stock son las cifras actuales del proveedor, no una reserva.',
  'saved.loadErrorTitle': 'No se han podido cargar los lotes guardados',
  'saved.loadErrorBody': 'La API no devolviÃ³ tu lista: intÃ©ntalo de nuevo.',
  'saved.trying': 'Reintentandoâ€¦',
  'saved.emptyTitle': 'TodavÃ­a no has guardado nada',
  'saved.emptyBody': 'Guarda un lote del marketplace y aparecerÃ¡ aquÃ­ para compararlo rÃ¡pidamente despuÃ©s.',
  'saved.browse': 'Ver stock disponible',
  'saved.goToFeed': 'Ir a mi inicio',
  'saved.count': '{n} lotes guardados',
  'saved.mostRecent': 'Primero los guardados mÃ¡s recientemente',
  'saved.savedOn': 'Guardado el {date}',
  'saved.remove': 'Quitar',
  'saved.removing': 'Quitandoâ€¦',
  'saved.removeTitle': 'Quitar este lote de tu lista',
  'saved.errRemove': 'No se ha podido quitar ese lote de tu lista: intÃ©ntalo de nuevo.',
  'notes.title': 'Notificaciones',
  'notes.signInSub': 'Inicia sesiÃ³n para ver la actividad de tu cuenta',
  'notes.notSignedIn': 'No has iniciado sesiÃ³n',
  'notes.notSignedInBody': 'Las notificaciones son privadas de tu cuenta: inicia sesiÃ³n para leerlas.',
  'notes.sub': 'Ofertas, mensajes y novedades de envÃ­os de tu cuenta, lo mÃ¡s reciente primero.',
  'notes.markAll': 'Marcar todo como leÃ­do',
  'notes.marking': 'Marcandoâ€¦',
  'notes.markAllTitle': 'Marcar {n} notificaciones no leÃ­das como leÃ­das',
  'notes.nothingUnread': 'No hay nada sin leer',
  'notes.loadErrorTitle': 'No se han podido cargar las notificaciones',
  'notes.loadErrorBody': 'La API no devolviÃ³ tus notificaciones: intÃ©ntalo de nuevo.',
  'notes.trying': 'Reintentandoâ€¦',
  'notes.emptyTitle': 'AÃºn no hay notificaciones',
  'notes.emptyBody': 'Cuando se contraoferta una oferta, llega un mensaje o avanza un envÃ­o, queda registrado aquÃ­.',
  'notes.browse': 'Ver stock disponible',
  'notes.myOrders': 'Mis pedidos',
  'notes.count': '{n} notificaciones',
  'notes.unreadCount': '{n} sin leer',
  'notes.allRead': 'Todo leÃ­do',
  'notes.unreadLabel': 'Sin leer',
  'notes.footnote': 'Los recuentos de no leÃ­dos vienen directamente de la API. Abrir una conversaciÃ³n o una oferta desde aquÃ­ no borra una notificaciÃ³n por sÃ­ solo: usa â€œMarcar todo como leÃ­doâ€.',
  'notes.errMark': 'No se han podido marcar las notificaciones como leÃ­das: intÃ©ntalo de nuevo.',
  'notes.justNow': 'ahora mismo',
  'notes.minutesAgo': 'hace {n} min',
  'notes.hoursAgo': 'hace {n} h',
  'notes.daysAgo': 'hace {n} d',
  'notes.open': 'Abrir',
  'msg.title': 'Mensajes',
  'msg.subSupplier': 'Consultas de compradores sobre tu stock. Abrir una conversaciÃ³n la marca como leÃ­da.',
  'msg.subBuyer': 'Tus conversaciones con proveedores. Abrir una conversaciÃ³n la marca como leÃ­da.',
  'msg.signInSub': 'Inicia sesiÃ³n para ver tus conversaciones',
  'msg.notSignedIn': 'No has iniciado sesiÃ³n',
  'msg.notSignedInBody': 'Las conversaciones son privadas de las dos partes: inicia sesiÃ³n para leer y responder.',
  'msg.loadErrorTitle': 'No se han podido cargar las conversaciones',
  'msg.loadErrorBody': 'La API no devolviÃ³ tus conversaciones: intÃ©ntalo de nuevo.',
  'msg.trying': 'Reintentandoâ€¦',
  'msg.emptyTitle': 'AÃºn no hay conversaciones',
  'msg.emptySupplier': 'Cuando un comprador pregunta por uno de tus lotes, la conversaciÃ³n aparece aquÃ­.',
  'msg.emptyBuyer': 'Abre un lote que te interese y escribe al proveedor: la conversaciÃ³n aparecerÃ¡ aquÃ­.',
  'msg.browse': 'Ver stock disponible',
  'msg.myListings': 'Mis publicaciones',
  'msg.noMessagesYet': 'AÃºn no hay mensajes',
  'msg.count': '{n} mensajes',
  'msg.pickTitle': 'Elige una conversaciÃ³n',
  'msg.pickBody': 'Sus mensajes aparecerÃ¡n aquÃ­.',
  'msg.threadLoadError': 'No se ha podido cargar esta conversaciÃ³n',
  'msg.threadLoadErrorBody': 'Puede que se haya eliminado o que no estÃ© abierta a tu cuenta: intÃ©ntalo de nuevo.',
  'msg.noLot': 'Sin lote adjunto',
  'msg.viewLot': 'Ver lote',
  'msg.emptyThreadTitle': 'AÃºn no hay mensajes en esta conversaciÃ³n',
  'msg.emptyThreadBody': 'Escribe el primero abajo.',
  'msg.messagePlaceholder': 'Mensaje para {name}â€¦',
  'msg.messageAria': 'Escribe un mensaje',
  'msg.send': 'Enviar',
  'msg.sending': 'Enviandoâ€¦',
  'msg.read': 'leÃ­do',
  'msg.otherParty': 'la otra parte',
  'msg.errSend': 'No se ha podido enviar el mensaje: intÃ©ntalo de nuevo.',
  'msg.justNow': 'ahora mismo',
  'msg.minutesAgo': 'hace {n} min',
  'msg.hoursAgo': 'hace {n} h',
  'msg.daysAgo': 'hace {n} d',
  'verify.title': 'VerificaciÃ³n',
  'verify.sub': 'Presenta tus documentos, sigue la decisiÃ³n de revisiÃ³n y ve quÃ© se cuenta a los compradores',
  'verify.signInSub': 'Documentos en los que se apoyan los compradores antes de pagar',
  'verify.notSignedIn': 'No has iniciado sesiÃ³n',
  'verify.notSignedInBody':
    'Los documentos de verificaciÃ³n pertenecen a una cuenta de proveedor y nunca son pÃºblicos en bruto. Inicia sesiÃ³n para presentar o actualizar los tuyos.',
  'verify.createSupplierAccount': 'Crear una cuenta de proveedor',
  'verify.supplierOnly': 'Solo cuentas de proveedor',
  'verify.supplierOnlyBody': 'Tu cuenta es una cuenta de {role}, asÃ­ que no hay ninguna lista de verificaciÃ³n de proveedor que completar.',
  'verify.seeSuppliers': 'Ver proveedores verificados',
  'verify.approved': 'Documentos aprobados',
  'verify.waiting': 'Esperando revisor',
  'verify.actionNeeded': 'Faltantes o devueltos',
  'verify.coreApproved': 'Documentos clave aprobados',
  'verify.confirmed': 'Confirmado',
  'verify.pending': 'Pendiente',
  'verify.yourDocs': 'Tus documentos',
  'verify.onFile': '{n} en el expediente',
  'verify.loadErrorTitle': 'No se han podido cargar los documentos',
  'verify.loadErrorBody':
    'No se pudieron cargar tus documentos de verificaciÃ³n. IntÃ©ntalo de nuevo. Si sigue fallando, puede que tu cuenta aÃºn no tenga perfil de proveedor.',
  'verify.emptyTitle': 'No hay documentos en el expediente',
  'verify.emptyBody':
    'AÃºn no se ha presentado nada, asÃ­ que no se puede mostrar ninguna insignia de verificaciÃ³n a los compradores. Usa el formulario para presentar tu primer documento: empieza por {first}.',
  'verify.col.document': 'Documento',
  'verify.col.status': 'Estado',
  'verify.col.note': 'Nota del revisor',
  'verify.col.reviewed': 'Revisado',
  'verify.filed': 'presentado el {date}',
  'verify.reference': 'referencia: {ref}',
  'verify.noReference': 'sin referencia',
  'verify.resubmit': 'Volver a presentar',
  'verify.tierFootnote':
    'AquÃ­ solo se listan los documentos que la API devuelve para tu perfil de proveedor. Los tipos que faltan simplemente no tienen fila todavÃ­a: presentarlos la crea.',
  'verify.fileTitle': 'Presentar o actualizar un documento',
  'verify.docType': 'Tipo de documento',
  'verify.existingHintPre': 'Ya tienes una fila para {doc} â€” estado',
  'verify.existingHintPost':
    '. Volver a presentarlo la sobrescribe y borra la decisiÃ³n anterior, asÃ­ que un documento aprobado necesitarÃ­a una nueva aprobaciÃ³n.',
  'verify.refLabel': 'Referencia / enlace al documento',
  'verify.refPlaceholder': 'https://â€¦/licencia-comercial.pdf o tu referencia de archivo',
  'verify.refHintLead': 'La subida de archivos no estÃ¡ desarrollada.',
  'verify.refHintTail':
    'Pega un enlace al documento, o una referencia que el equipo de revisiÃ³n pueda seguir. Se guarda tal cual y no se muestra pÃºblicamente.',
  'verify.noteLabel': 'Nota para el revisor',
  'verify.notePlaceholder': 'QuÃ© ha cambiado, por quÃ© se actualiza, cualquier cosa que el revisor deba saberâ€¦',
  'verify.filing': 'Presentandoâ€¦',
  'verify.resubmitDoc': 'Volver a presentar {doc}',
  'verify.submitDoc': 'Presentar {doc}',
  'verify.queueNoteLead': 'Presentar solo pone el documento en la cola.',
  'verify.queueNoteStrong': 'La insignia aparece para los compradores cuando un revisor la aprueba',
  'verify.queueNoteTail': ': nunca al presentarla y nunca automÃ¡ticamente.',
  'verify.filedNotice':
    '{doc} presentado. El estado ahora es "enviado" y estÃ¡ esperando en la cola de revisiÃ³n: la insignia solo aparece para los compradores cuando un revisor lo aprueba.',
  'verify.errFile': 'No se pudo presentar este documento.',
  'verify.statusMeans': 'QuÃ© significa cada estado',
  'verify.tierTitle': 'Nivel de verificaciÃ³n',
  'verify.tierAll': 'Verificado Â· todos los documentos clave aprobados',
  'verify.tierSome': 'Verificado Â· documentos aprobados',
  'verify.tierNone': 'AÃºn sin verificar',
  'verify.tierAllBody': 'Un revisor ha aprobado todos los tipos de documento clave de esta pÃ¡gina.',
  'verify.tierSomeBody': 'Al menos un documento estÃ¡ aprobado{n}; los tipos clave restantes reforzarÃ­an el perfil.',
  'verify.tierNoneBody': 'AÃºn no se ha aprobado ningÃºn documento, asÃ­ que no se muestra ninguna insignia de verificaciÃ³n de tu empresa.',
  'verify.tierHint':
    'El nivel de tu cuenta lo fija el equipo de revisiÃ³n a partir de los documentos aprobados: esta pantalla informa de los estados que devuelve la API y no calcula un nÃºmero de nivel por su cuenta. Los compradores solo ven insignia de documentos aprobados.',
  'verify.suggested': 'Siguiente sugerido:',
  'verify.select': 'Seleccionar',
  'verify.othersNote':
    'Los compradores tambiÃ©n ven las valoraciones y los recuentos de inspecciÃ³n de otros proveedores en sus perfiles. Esas cifras son datos de ejemplo del marketplace, no algo que produzca esta lista, asÃ­ que esta pÃ¡gina no muestra ninguna a propÃ³sito.',
  'verify.help.missing.title': 'No presentado',
  'verify.help.missing.state': 'AÃºn no se ha presentado nada, o el documento nunca se enviÃ³.',
  'verify.help.submitted.title': 'Esperando revisiÃ³n',
  'verify.help.submitted.state': 'Presentado y esperando en la cola de revisiÃ³n. AÃºn no se muestra insignia a los compradores.',
  'verify.help.approved.title': 'Aprobado',
  'verify.help.approved.state': 'Un revisor lo cotejÃ³ con el propio documento. Esto es lo que ven los compradores.',
  'verify.help.rejected.title': 'Devuelto',
  'verify.help.rejected.state': 'Rechazado con una nota. Corrige el documento y vuelve a presentarlo.',
  'verify.doc.businessLicence': 'Licencia comercial',
  'verify.doc.taxCertificate': 'Certificado fiscal',
  'verify.doc.factoryAudit': 'Informe de auditorÃ­a de fÃ¡brica',
  'verify.doc.productCert': 'CertificaciÃ³n de producto',
  'verify.doc.exportLicence': 'Licencia de exportaciÃ³n',
};

const DICTS: Record<LangCode, Partial<Record<DictKey, string>>> = { en, tr, ar, ru, zh, es };

/* --------------------- placeholder titles (route table) ------------------ */

/**
 * App.tsx (owned elsewhere) hands ComingSoon its title and note as English
 * literals. They are looked up here by that English source text so the honest
 * placeholders are translated too, without editing the route table. An
 * unrecognised title is shown as-is â€” never blank.
 */
const TITLE_KEYS: Record<string, DictKey> = {
  'My offers': 'nav.offersBuyer',
  'Shipments': 'nav.shipments',
  'Messages': 'nav.messages',
  'Saved lots': 'nav.savedLots',
  'Notifications': 'nav.notifications',
  'Profile': 'nav.profile',
  'My listings': 'nav.listings',
  'Post stock': 'nav.post',
  'Offers on your stock': 'offers.title',
  'Verification': 'nav.verification',
  'Marketplace overview': 'nav.overview',
  'Suppliers': 'nav.suppliers',
  'Verification desk': 'nav.adminVerify',
  'Listings': 'nav.adminListings',
  'RFQs': 'nav.adminRfqs',
  'Payments': 'nav.adminPayments',
  'Supply sources': 'nav.sources',
  'Banners and promos': 'nav.growth',
  'Features': 'nav.features',
};

const NOTE_KEYS: Record<string, DictKey> = {
  'The offers and counter-offers table lands in the next build phase.': 'soon.note.offers',
  'Shipment milestones and documents land in the next build phase.': 'soon.note.shipments',
  'Buyer â†” supplier messaging lands in the next build phase.': 'soon.note.messages',
  'Saved lots land in the next build phase.': 'soon.note.saved',
  'The notification centre lands in the next build phase.': 'soon.note.notifications',
  'Profile editing lands in the next build phase.': 'soon.note.profile',
  'Supplier product CRUD with ownership checks lands in the next build phase.': 'soon.note.listings',
  'Listing create/edit with image upload lands in the next build phase.': 'soon.note.post',
  'Lands in the next build phase.': 'soon.note.generic',
  'Verification tiers and document submission land in the next build phase.': 'soon.note.verification',
  'The admin console lands in the next build phase.': 'soon.note.admin',
  'Manual supplier intake lands in the next build phase.': 'soon.note.sources',
  'Feature flags land in the next build phase.': 'soon.note.features',
};

export function titleLabel(lang: LangCode, title: string): string {
  const key = TITLE_KEYS[title];
  return key ? translate(lang, key) : title;
}

export function noteLabel(lang: LangCode, note: string): string {
  const key = NOTE_KEYS[note];
  return key ? translate(lang, key) : note;
}

/* ============================== lookups ================================ */

/** `{name}` placeholders. A missing variable is left as-is rather than blanking text. */
export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole,
  );
}

function lookup(lang: LangCode, key: DictKey): string {
  const translated = DICTS[lang][key];
  if (typeof translated === 'string' && translated.length > 0) return translated;
  const fallback = en[key];
  return typeof fallback === 'string' ? fallback : key;
}

/** Current language â†’ English â†’ the key itself. Never throws, never blank. */
export function translate(lang: LangCode, key: DictKey, vars?: Record<string, string | number>): string {
  return format(lookup(lang, key), vars);
}

export const t = translate;

/** True when the language has a real (non-English, non-empty) entry for the key. */
export function hasTranslation(lang: LangCode, key: DictKey): boolean {
  const value = DICTS[lang][key];
  return typeof value === 'string' && value.length > 0;
}

/** Number of keys in the English dictionary (the source of truth). */
export const EN_KEY_COUNT: number = (Object.keys(en) as DictKey[]).length;

/** How many keys each language actually translates, for honest coverage reporting. */
export function coverage(): Record<LangCode, number> {
  const keys = Object.keys(en) as DictKey[];
  const out = {} as Record<LangCode, number>;
  for (const lang of LANG_CODES) {
    out[lang] = keys.filter((k) => hasTranslation(lang, k)).length;
  }
  return out;
}

/** Status labels come from raw API values; unknown values fall back to the raw text. */
export function statusLabel(lang: LangCode, status: string): string {
  const key = `status.${status}` as DictKey;
  return hasTranslation(lang, key) || Object.prototype.hasOwnProperty.call(en, key)
    ? translate(lang, key)
    : status.replace(/_/g, ' ');
}

/* =============================== context ================================ */

export interface I18nValue {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
  dir: LangDir;
  /** Locale tag for date/number formatting in the current language. */
  locale: string;
  /** Same as `t` but for an explicit language â€” for module-level helpers. */
  tx: (lang: LangCode, key: DictKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function applyDocumentLang(lang: LangCode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = dirFor(lang);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => detectInitialLang());

  // Mirror the choice onto <html> and into storage whenever it changes.
  useEffect(() => {
    applyDocumentLang(lang);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      /* storage unavailable â€” the session still switches language */
    }
  }, [lang]);

  const setLang = useCallback((next: LangCode) => {
    if (!isLangCode(next)) return;
    setLangState(next);
  }, []);

  const value = useMemo<I18nValue>(() => ({
    lang,
    setLang,
    t: (key, vars) => translate(lang, key, vars),
    dir: dirFor(lang),
    locale: localeFor(lang),
    tx: translate,
  }), [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Read the current locale. Outside a `LocaleProvider` this returns a safe
 * English fallback rather than throwing, so a component rendered in isolation
 * (tests, previews) still produces readable text.
 */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  return {
    lang: 'en',
    setLang: () => { /* no provider mounted */ },
    t: (key, vars) => translate('en', key, vars),
    dir: 'ltr',
    locale: localeFor('en'),
    tx: translate,
  };
}
