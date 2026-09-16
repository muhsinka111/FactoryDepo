/**
 * FactoryDepo i18n — the single source of truth for interface languages.
 *
 * Design notes
 * ------------
 * • `en` is the source of truth. Its object is frozen into the `DictKey` union,
 *   so every `t('…')` call is checked at compile time: a typo in a key is a
 *   build error, not a blank label at runtime.
 * • Every other language is a `Partial<Record<DictKey, string>>` whose keys are
 *   the English keys, so a typo in a translation key is also a build error.
 * • `t()` never throws and never returns `undefined`: current language → English
 *   → the key itself. A missing translation therefore shows readable text rather
 *   than blanking the UI.
 * • Interpolation is `{name}` style. Numbers interpolated as `{n}` come from the
 *   API untouched — translation never rewrites a figure (see `format`).
 * • The chosen language is persisted in `localStorage['fd:lang']`, applied to
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
  /** The language's own name — what the switcher shows. */
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
  { code: 'tr', label: 'Turkish', native: 'Türkçe', dir: 'ltr', locale: 'tr-TR' },
  { code: 'ar', label: 'Arabic', native: 'العربية', dir: 'rtl', locale: 'ar' },
  { code: 'ru', label: 'Russian', native: 'Русский', dir: 'ltr', locale: 'ru-RU' },
  { code: 'zh', label: 'Chinese', native: '中文', dir: 'ltr', locale: 'zh-CN' },
  { code: 'es', label: 'Spanish', native: 'Español', dir: 'ltr', locale: 'es-ES' },
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

/** `tr-TR` → `tr`; anything unsupported is ignored. */
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

/** Stored choice → browser preference → English. */
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
  'listings.viewsNotTracked': string;
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
  'ship.sub': string;
  'ship.signInSub': string;
  'ship.notSignedIn': string;
  'ship.notSignedInBody': string;
  'ship.loadErrorTitle': string;
  'ship.loadErrorBody': string;
  'ship.emptyTitle': string;
  'ship.emptyBody': string;
  'ship.statInTransit': string;
  'ship.statDelivered': string;
  'ship.statPending': string;
  'ship.col.shipment': string;
  'ship.col.order': string;
  'ship.col.carrier': string;
  'ship.col.mode': string;
  'ship.col.status': string;
  'ship.col.eta': string;
  'ship.col.updated': string;
  'ship.milestones': string;
  'ship.tracking': string;
  'ship.noTracking': string;
  'ship.docs': string;
  'ship.noDocs': string;

  /* ---- saved ---- */
  'saved.title': string;
  'saved.sub': string;
  'saved.signInSub': string;
  'saved.notSignedIn': string;
  'saved.notSignedInBody': string;
  'saved.emptyTitle': string;
  'saved.emptyBody': string;
  'saved.browse': string;
  'saved.remove': string;
  'saved.removed': string;
  'saved.loadErrorTitle': string;
  'saved.count': string;

  /* ---- notifications ---- */
  'notes.title': string;
  'notes.sub': string;
  'notes.signInSub': string;
  'notes.notSignedIn': string;
  'notes.notSignedInBody': string;
  'notes.emptyTitle': string;
  'notes.emptyBody': string;
  'notes.loadErrorTitle': string;
  'notes.markAll': string;
  'notes.markRead': string;
  'notes.unread': string;
  'notes.allRead': string;
  'notes.count': string;

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
  'action.refreshing': 'Refreshing…',
  'action.tryAgain': 'Try again',
  'action.clear': 'Clear',
  'action.clearFilters': 'Clear filters',
  'action.search': 'Search',
  'action.save': 'Save changes',
  'action.discard': 'Discard',
  'action.signIn': 'Sign in',
  'action.signOut': 'Sign out',
  'action.signingIn': 'Signing in…',
  'action.joinFree': 'Join free',
  'action.createAccount': 'Create an account',
  'action.creatingAccount': 'Creating account…',
  'action.backToExplore': 'Back to explore',
  'action.open': 'Open',
  'action.edit': 'Edit',
  'action.delete': 'Delete',

  'common.loading': 'Loading…',
  'common.loadingEllipsis': 'Loading…',
  'common.notSet': 'Not set',
  'common.optional': 'Optional',
  'common.required': 'required',
  'common.newestFirst': 'Newest first',
  'common.anyCountry': 'Any country',
  'common.allCountries': 'All countries',
  'common.verified': 'Verified',
  'common.tradeAbbrev': 'RFQ = request for quotation · MOQ = minimum order quantity · FOB = free on board · TT = bank telegraphic transfer',

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

  'topbar.searchPlaceholder': 'Search products, suppliers, categories…',
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
  'cards.demoTitle': 'Seed data — not a real offer',
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
    'account for reviewing the admin console. It is not a real seller — do not enter real credentials.',
  'auth.demoHintProduct': 'admin',
  'auth.signInFailed': 'Login failed',
  'auth.signUp.title': 'Create an account',
  'auth.signUp.sub': 'One account to buy, sell, or provide inspection and logistics services.',
  'auth.fullName': 'Full name',
  'auth.workEmail': 'Work email',
  'auth.minChars': 'Minimum 8 characters',
  'auth.atLeast8': 'At least 8 characters.',
  'auth.iAmA': 'I am a…',
  'auth.company': 'Company',
  'auth.country': 'Country',
  'auth.countryHint': 'Türkiye, China…',
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
  'profile.saving': 'Saving…',
  'profile.saved': 'Saved',
  'profile.savedBody': 'Your profile was updated.',
  'profile.identity': 'Identity',
  'profile.identityNote':
    'Email and role cannot be edited here. They are fixed to the account when it is created and are not accepted by the profile API.',
  'profile.email': 'Email',
  'profile.role': 'Role',
  'profile.readOnly': 'Read-only',
  'profile.readOnlyEmail': 'Read-only — the profile API does not accept email',
  'profile.readOnlyRole': 'Read-only — the profile API does not accept role',
  'profile.emailStatus': 'Email status',
  'profile.emailVerified': 'Email verified',
  'profile.emailNotVerified': 'Email not verified',
  'profile.memberSince': 'Member since',
  'profile.accountLine': 'Account #{id} · signed in as {role}',
  'profile.errName': 'Enter your name — the API rejects an empty name.',
  'profile.errSave': 'Profile could not be saved — try again.',

  'explore.title': 'Explore stock',
  'explore.subLoading': 'Loading live lots…',
  'explore.subCount': '{n} listings matching your filters',
  'explore.searchPlaceholder': 'Copper cathode, pumps…',
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
  'explore.prev': '← Prev',
  'explore.next': 'Next →',

  'feed.welcomeBack': 'Welcome back, {name}',
  'feed.title': 'Marketplace feed',
  'feed.sub': 'Ready stock, surplus and overstock lots from verified factories — newest first.',
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
  'feed.shownRange': '{first}–{last} of {total}',
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
    'Every live lot shows its price, minimum order quantity, origin country and how much is actually available. Listings marked Demo are seed data — not real offers — and are labelled so you are never misled.',
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
    'Listing tools are being built now — until they ship, supplier listings are added by our team during onboarding.',
  'help.selling3.title': '3. Quote incoming requests.',
  'help.selling3':
    'Open buyer requests appear in your dashboard with a live count of how many you have not answered.',
  'help.selling4.title': '4. Get verified.',
  'help.selling4':
    'Verification tiers unlock visibility. Badges are granted only when documents are approved, so a badge on this site means something.',
  'help.notLive': 'What is not live yet',
  'help.notLiveLead': 'We would rather say this plainly than have you discover it:',
  'help.notLive1': 'Supplier self-service listing tools are in development.',
  'help.notLive2': 'Buyer ↔ supplier messaging is not available yet — use the contact details on a supplier profile.',
  'help.notLive3': 'Offers and counter-offers are handled manually at the moment.',
  'help.notLive4': 'Shipment tracking and document handling are not built.',
  'help.exploreCta': 'Explore stock',
  'help.rfqCta': 'Requests for quotation',

  'soon.sub': 'Not built yet',
  'soon.title': 'This view is part of the next build phase',
  'soon.body': 'The screen exists in the navigation, but its data tables and API endpoints have not been built yet.',
  'soon.note.offers': 'The offers and counter-offers table lands in the next build phase.',
  'soon.note.shipments': 'Shipment milestones and documents land in the next build phase.',
  'soon.note.messages': 'Buyer ↔ supplier messaging lands in the next build phase.',
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
  'orders.statViews': 'Views · not tracked yet',
  'orders.statViewsTitle': 'View tracking is not implemented yet',
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

  'product.loadingTitle': 'Loading…',
  'product.loadingThis': 'this listing',
  'product.fetching': 'Fetching {what}…',
  'product.notFound': 'Product not found',
  'product.backToExplore': 'Back to explore',
  'product.noPhoto': 'No photo supplied for this lot',
  'product.pricePer': 'Price / {unit}',
  'product.minOrder': 'Minimum order',
  'product.availableNow': 'Available now',
  'product.origin': 'Country of origin',
  'product.unavailable': 'Currently unavailable',
  'product.buyNowHeading': 'Buy now — ready stock',
  'product.soldOutBody': 'This lot is marked sold out. Ask the supplier for the next available batch.',
  'product.noUnitsBody': 'No units are available at the moment. Ask the supplier for the next available batch.',
  'product.purchaseTerms':
    'Purchase at the listed price of {price} per {unit}, minimum {moq} {unit}.',
  'product.stockOnHand': 'Stock on hand',
  'product.buyNowPrice': 'Buy now · {price}/{unit}',
  'product.outOfStock': 'Buy now — out of stock',
  'product.requestQuote': 'Request a quotation',
  'product.shipsFrom': 'Ships from {country}',
  'product.signInToOrder': 'Sign in to order or request a quotation.',
  'product.supplier': 'Supplier',
  'product.viewProfile': 'View profile',
  'product.loadingSupplier': 'Loading supplier…',
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

  'checkout.title': 'Buy now — checkout',
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
  'checkout.placeOrder': 'Place order · {total}',
  'checkout.placing': 'Placing order…',
  'checkout.errPlace': 'The order could not be placed.',

  'rfqModal.title': 'Request a quotation',
  'rfqModal.postedTitle': 'Request posted',
  'rfqModal.live': 'Your requirement is live in the RFQ exchange',
  'rfqModal.canQuote': 'Verified suppliers can now quote price and lead time.',
  'rfqModal.viewMine': 'View my RFQs',
  'rfqModal.listedBy': '{product} · listed by {supplier}',
  'rfqModal.quantity': 'Quantity',
  'rfqModal.unit': 'Unit',
  'rfqModal.specs': 'Specs, certifications, delivery terms',
  'rfqModal.moqHint': 'The listing MOQ is {moq} {unit}.',
  'rfqModal.post': 'Post request',
  'rfqModal.posting': 'Posting…',
  'rfqModal.errPost': 'The request could not be posted.',
  'rfqModal.titleSuffix': 'quotation request',

  'suppliers.loadingSub': 'Fetching the supplier directory',
  'suppliers.loadingBody': 'Fetching the supplier directory…',
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
  'suppliers.searchPlaceholder': 'Company, country, city, capability…',
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
  'supplierDetail.backShort': '← Back to directory',
  'supplierDetail.tradingSince': 'Trading since {year}',
  'supplierDetail.verifiedL3': 'Verified · level 3',
  'supplierDetail.registered': 'Registered',
  'supplierDetail.buyerRating': 'Buyer rating',
  'supplierDetail.notRated': 'not rated yet',
  'supplierDetail.inspections': 'On-site inspections',
  'supplierDetail.fulfilment': 'On-time fulfilment',
  'supplierDetail.activeListings': 'Active listings',
  'supplierDetail.tier': 'Verification tier',
  'supplierDetail.trustScore': 'Trust score (0–100)',
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
  'supplierDetail.contactHintSignedIn': 'Opens the RFQ exchange — the quote thread lives there.',
  'supplierDetail.contactHintGuest': 'Members only · free to join',
  'supplierDetail.services': 'Trade services',
  'supplierDetail.service1': 'Factory inspection before payment',
  'supplierDetail.service2': 'Laboratory testing and material analysis',
  'supplierDetail.service3': 'Container loading supervision',
  'supplierDetail.service4': 'Export documentation support',
  'supplierDetail.stockFrom': 'Stock from {company}',
  'supplierDetail.shown': '{n} shown',
  'supplierDetail.loadingLots': 'Loading live lots…',
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
  'rfq.requestRef': '{category} · request #{id}',
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
  'rfq.specPlaceholder': 'Grade, purity, certifications, Incoterms, packing…',
  'rfq.specHint': 'The clearer the specification, the faster verified factories can quote.',
  'rfq.errTitle': 'Give the request a clear title — at least 5 characters.',
  'rfq.errQuantity': 'Quantity must be a number greater than zero.',
  'rfq.errPost': 'Could not post this request.',

  'rfqDetail.loadingTitle': 'Request',
  'rfqDetail.loadingSub': 'Loading…',
  'rfqDetail.title': 'Request',
  'rfqDetail.notFound': 'Request not found',
  'rfqDetail.notFoundBody': 'This requirement may have been withdrawn, or the link is wrong.',
  'rfqDetail.backToRequests': '← Back to requests',
  'rfqDetail.allRequests': '← All requests',
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
  'rfqDetail.termsPlaceholder': 'Incoterms, grade, packing, sample policy, validity…',
  'rfqDetail.compareHint': 'Buyers compare price, lead time and verification side by side.',
  'rfqDetail.submitQuote': 'Submit quotation',
  'rfqDetail.submitting': 'Submitting…',
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
  'listings.subLoading': 'Loading your stock…',
  'listings.subCount': '{n} listings published under your supplier profile',
  'listings.postStock': '+ Post stock',
  'listings.lotsPublished': 'lots published',
  'listings.viewsNotTracked': 'views · not tracked yet',
  'listings.bankTransferNote': 'Buyers pay by bank transfer once an offer is accepted.',
  'listings.loadErrorTitle': 'Your listings could not be loaded',
  'listings.loadErrorBody': 'Could not load your listings — try again. If it keeps failing, sign in again.',
  'listings.emptyTitle': 'No listings yet',
  'listings.emptyBody':
    'Post your first lot — a photo, a unit price and how much you can ship today. It goes live in Explore for every buyer on the marketplace.',
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
  'listings.deleteLead': '{name} — lot #{id}',
  'listings.deleteBody':
    'This listing is removed permanently. It disappears from Explore and from your listing table immediately, and buyers can no longer order or negotiate on it. This cannot be undone.',
  'listings.deleteKeepBody':
    'A lot that already has orders or offers against it cannot be deleted — the API keeps it for the record. Mark it sold out instead by setting available stock to 0.',
  'listings.keepListing': 'Keep listing',
  'listings.deleteForever': 'Delete permanently',
  'listings.deleting': 'Deleting…',
  'listings.deleteErr': 'Could not delete this listing.',
  'listings.editTitle': 'Edit listing — lot #{id}',

  'post.title': 'Post stock',
  'post.titleEdit': 'Edit listing',
  'post.sub': 'One lot per listing: what it is, what it costs and how much you can ship today',
  'post.subEdit': 'Changing lot #{id} — saving overwrites the live listing',
  'post.signInSub': 'List ready stock so buyers can order or negotiate on it',
  'post.notSignedIn': 'You are not signed in',
  'post.notSignedInBody': 'Posting stock is a supplier action. Sign in with a supplier account to publish a lot.',
  'post.createSupplierAccount': 'Create a supplier account',
  'post.supplierOnly': 'Supplier accounts only',
  'post.supplierOnlyBody':
    'Your account is a {role} account, so the API will not accept a listing from it. A supplier profile is required before stock can be posted.',
  'post.myListings': 'My listings',
  'post.loadErrorTitle': 'Listing could not be loaded',
  'post.loadErrorBody': 'This lot could not be loaded — try again, or return to your listings.',
  'post.details': 'Listing details',
  'post.newListing': 'New listing',
  'post.requiredMark': '* required',
  'post.lotName': 'Lot name',
  'post.lotNamePlaceholder': 'e.g. Copper cathode grade A, 99.99%',
  'post.category': 'Category',
  'post.originCountry': 'Origin country',
  'post.notStated': 'Not stated',
  'post.description': 'Description',
  'post.descriptionPlaceholder': 'Grade, packing, Incoterms, lead time, certificates…',
  'post.descriptionHint': 'Buyers decide from this text. Say what is in the lot and how it ships.',
  'post.unitPrice': 'Unit price',
  'post.currency': 'Currency',
  'post.unit': 'Unit',
  'post.moq': 'Minimum order (MOQ)',
  'post.moqHint': 'Defaults to 1.',
  'post.available': 'Available now',
  'post.availableHint': 'Defaults to 0 — the stock you can ship today.',
  'post.purity': 'Purity / grade',
  'post.purityPlaceholder': '99.99% / Grade A',
  'post.optional': 'Optional.',
  'post.photoUrl': 'Photo URL',
  'post.photoPlaceholder': 'https://…/copper-cathode.jpg',
  'post.photoHintLead': 'File upload is not built yet.',
  'post.photoHintTail':
    'Paste a public link to the photo and it is stored as this lot’s image. Lots without a photo show a plain placeholder.',
  'post.preview': 'Preview — if nothing loads, the link is not a direct image.',
  'post.save': 'Save changes',
  'post.saving': 'Saving…',
  'post.errName': 'Give the lot a name — at least 2 characters.',
  'post.errCategory': 'Pick a category.',
  'post.errUnit': 'State the unit you sell in (MT, KG, pcs…).',
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
  'post.urlOnly': 'URL only — upload not built',
  'post.buyerPaysBy': 'Buyer pays by',
  'post.bankTransfer': 'Bank transfer',
  'post.noMetrics':
    'Nothing on this page reports views, ratings or order counts — those figures are not measured yet, so they are not shown.',

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
  'offers.subLoading': 'Loading offers…',
  'offers.subCount': '{n} offers on your listings',
  'offers.awaiting': 'awaiting your answer',
  'offers.decided': 'decided',
  'offers.acceptCreates': 'Accepting an offer creates an order; the buyer pays by bank transfer.',
  'offers.filterAwaiting': 'Awaiting answer ({n})',
  'offers.filterDecided': 'Decided ({n})',
  'offers.counterNote': 'Counters open a new linked offer; your original terms stay on record.',
  'offers.loadErrorTitle': 'Offers could not be loaded',
  'offers.loadErrorBody': 'Could not load the offers on your stock — try again.',
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
    'sits on a seeded lot, not stock you posted. Accepting it still creates a real order — check the lot before you commit.',
  'offers.counterTitle': 'Counter offer #{id}',
  'offers.counterBody':
    '{buyer} offered {price} / {qty} on {product}. Your answer becomes a new linked offer; the buyer’s terms stay on the record.',
  'offers.counterPrice': 'Your unit price',
  'offers.perUnit': '{currency} per unit',
  'offers.counterQty': 'Quantity',
  'offers.counterQtyHint': 'Leave as-is to keep the buyer’s quantity.',
  'offers.counterNotes': 'Note to the buyer',
  'offers.counterNotesPlaceholder': 'Lead time, packing, Incoterms, validity of this price…',
  'offers.sendCounter': 'Send counter',
  'offers.sending': 'Sending…',
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
    '— the platform does not take a card payment. You issue the proforma and confirm the transfer when it lands; the order then moves to shipment. This decision is final: an accepted offer cannot be re-decided.',
  'offers.acceptCta': 'Accept and create order',
  'offers.accepting': 'Accepting…',
  'offers.acceptErr': 'Could not accept this offer.',
  'offers.acceptDone': 'Offer #{id} accepted. An order was created for {buyer}.',
  'offers.rejectTitle': 'Reject offer #{id}?',
  'offers.rejectBody':
    '{buyer}’s offer of {price} on {product} is closed. Rejecting is final — the buyer cannot revive this offer, though they may open a new one.',
  'offers.rejectCta': 'Reject offer',
  'offers.rejecting': 'Rejecting…',
  'offers.rejectErr': 'Could not reject this offer.',
  'offers.rejectDone': 'Offer #{id} rejected.',

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
    'Could not load your verification documents — try again. If this keeps failing, your account may not have a supplier profile yet.',
  'verify.emptyTitle': 'No documents on file',
  'verify.emptyBody':
    'Nothing has been filed yet, so no verification badge can be shown to buyers. Use the form to file your first document — start with {first}.',
  'verify.col.document': 'Document',
  'verify.col.status': 'Status',
  'verify.col.note': 'Reviewer note',
  'verify.col.reviewed': 'Reviewed',
  'verify.filed': 'filed {date}',
  'verify.reference': 'reference: {ref}',
  'verify.noReference': 'no reference given',
  'verify.resubmit': 'Resubmit',
  'verify.tierFootnote':
    'Only the documents the API returns for your supplier profile are listed here. Missing types simply have no row yet — filing one creates it.',
  'verify.fileTitle': 'File or refresh a document',
  'verify.docType': 'Document type',
  'verify.existingHintPre': 'You already have a row for {doc} — status',
  'verify.existingHintPost':
    '. Filing again overwrites it and clears the earlier decision, so an approved document would need re-approval.',
  'verify.refLabel': 'Reference / link to the document',
  'verify.refPlaceholder': 'https://…/business-licence.pdf or your file reference',
  'verify.refHintLead': 'File upload is not built.',
  'verify.refHintTail':
    'Paste a link to the document, or a reference the review team can follow up on. It is stored as-is and is not shown publicly.',
  'verify.noteLabel': 'Note for the reviewer',
  'verify.notePlaceholder': 'What changed, why it is being refreshed, anything the reviewer should know…',
  'verify.filing': 'Filing…',
  'verify.resubmitDoc': 'Resubmit {doc}',
  'verify.submitDoc': 'Submit {doc}',
  'verify.queueNoteLead': 'Submitting only puts the document in the queue.',
  'verify.queueNoteStrong': 'A badge appears for buyers when a reviewer approves it',
  'verify.queueNoteTail': '— never on submission, and never automatically.',
  'verify.filedNotice':
    '{doc} filed. Status is now "submitted" and it is waiting in the review queue — a badge only appears for buyers once a reviewer approves it.',
  'verify.errFile': 'Could not file this document.',
  'verify.statusMeans': 'What each status means',
  'verify.tierTitle': 'Verification tier',
  'verify.tierAll': 'Verified · every core document approved',
  'verify.tierSome': 'Verified · documents approved',
  'verify.tierNone': 'Not verified yet',
  'verify.tierAllBody': 'Every core document type on this page has been approved by a reviewer.',
  'verify.tierSomeBody':
    'At least one document is approved{n}; the remaining core types would strengthen the profile.',
  'verify.tierNoneBody': 'No document has been approved yet, so buyers are shown no verification badge for your company.',
  'verify.tierHint':
    'The tier your account carries is set by the review team from the approved documents — this screen reports the document statuses the API returns and does not compute a tier number of its own. Buyers see a badge only for approved documents.',
  'verify.suggested': 'Suggested next:',
  'verify.select': 'Select',
  'verify.othersNote':
    'Buyers also see other suppliers’ ratings and inspection counts on their profiles. Those figures are seeded marketplace data, not something this checklist produces — this page deliberately shows none of them.',
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
  'status.open': 'Açık',
  'status.quoted': 'Teklif verildi',
  'status.closed': 'Kapalı',
  'status.submitted': 'Gönderildi',
  'status.accepted': 'Kabul edildi',
  'status.rejected': 'Reddedildi',
  'status.active': 'Aktif',
  'status.sold_out': 'Tükendi',
  'status.scheduled': 'Planlandı',
  'status.in_progress': 'Sürüyor',
  'status.passed': 'Geçti',
  'status.failed': 'Başarısız',
  'status.pending': 'Beklemede',
  'status.paid': 'Ödendi',
  'status.shipped': 'Sevk edildi',
  'status.delivered': 'Teslim edildi',
  'status.cancelled': 'İptal edildi',
  'status.missing': 'Dosyalanmadı',
  'status.approved': 'Onaylandı',
  'status.countered': 'Karşı teklif verildi',
  'status.withdrawn': 'Geri çekildi',
  'status.inspecting': 'Denetim sürüyor',

  'action.close': 'Kapat',
  'action.cancel': 'Vazgeç',
  'action.dismiss': 'Kapat',
  'action.refresh': 'Yenile',
  'action.refreshing': 'Yenileniyor…',
  'action.tryAgain': 'Yeniden dene',
  'action.clear': 'Temizle',
  'action.clearFilters': 'Filtreleri temizle',
  'action.search': 'Ara',
  'action.save': 'Değişiklikleri kaydet',
  'action.discard': 'Vazgeç',
  'action.signIn': 'Giriş yap',
  'action.signOut': 'Çıkış yap',
  'action.signingIn': 'Giriş yapılıyor…',
  'action.joinFree': 'Ücretsiz katıl',
  'action.createAccount': 'Hesap oluştur',
  'action.creatingAccount': 'Hesap oluşturuluyor…',
  'action.backToExplore': 'Keşfete dön',
  'action.open': 'Aç',
  'action.edit': 'Düzenle',
  'action.delete': 'Sil',

  'common.loading': 'Yükleniyor…',
  'common.loadingEllipsis': 'Yükleniyor…',
  'common.notSet': 'Belirtilmedi',
  'common.optional': 'İsteğe bağlı',
  'common.required': 'zorunlu',
  'common.newestFirst': 'Önce en yeni',
  'common.anyCountry': 'Tüm ülkeler',
  'common.allCountries': 'Tüm ülkeler',
  'common.verified': 'Doğrulanmış',
  'common.tradeAbbrev':
    'RFQ = teklif talebi · MOQ = minimum sipariş miktarı · FOB = gemide teslim · TT = banka havalesi',

  'nav.feed': 'Akış',
  'nav.explore': 'Keşfet',
  'nav.exploreStock': 'Stokları keşfet',
  'nav.offersBuyer': 'Tekliflerim',
  'nav.rfqs': 'Teklif taleplerim',
  'nav.orders': 'Siparişler',
  'nav.shipments': 'Sevkiyatlar',
  'nav.messages': 'Mesajlar',
  'nav.saved': 'Kaydedilenler',
  'nav.savedLots': 'Kaydedilen lotlar',
  'nav.notifications': 'Bildirimler',
  'nav.help': 'Yardım merkezi',
  'nav.helpCentre': 'Yardım merkezi',
  'nav.howItWorks': 'Nasıl çalışır',
  'nav.profile': 'Profil',
  'nav.listings': 'İlanlarım',
  'nav.post': 'Stok yayınla',
  'nav.postStock': 'Stok yayınla',
  'nav.offersSup': 'Teklifler',
  'nav.rfqOpps': 'Teklif talebi fırsatları',
  'nav.verification': 'Doğrulama',
  'nav.suppliers': 'Tedarikçiler',
  'nav.overview': 'Genel bakış',
  'nav.adminSuppliers': 'Tedarikçiler',
  'nav.adminVerify': 'Doğrulama masası',
  'nav.adminListings': 'İlanlar',
  'nav.adminRfqs': 'Teklif talepleri',
  'nav.adminPayments': 'Ödemeler',
  'nav.sources': 'Tedarik kaynakları',
  'nav.growth': 'Banner ve promosyonlar',
  'nav.features': 'Özellikler',

  'topbar.searchPlaceholder': 'Ürün, tedarikçi, kategori ara…',
  'topbar.searchAria': 'Pazar yerinde ara',
  'topbar.notifications': 'Bildirimler',
  'topbar.createAccountTitle': 'Hesap oluştur',
  'topbar.account': 'Hesap',
  'topbar.languageAria': 'Arayüz dili',
  'rail.allIndustries': 'Tüm sektörler',
  'rail.howItWorks': 'Nasıl çalışır',
  'sidebar.moreIndustries': 'Daha fazla sektör. Daha fazla ülke.',
  'sidebar.moreIndustriesSub': 'Hazır stok için tek pazar yeri.',

  'gate.title': 'Üye erişimi',
  'gate.body':
    'Tedarikçilerle iletişim, talep yayınlama ve teklif verme üyelere özeldir. Pazar yerini gezmek herkese açık ve ücretsizdir.',
  'gate.createAccount': 'Ücretsiz hesap oluştur',
  'gate.haveAccount': 'Hesabım var',

  'cards.noPhoto': 'fotoğraf yok',
  'cards.moq': 'MOQ',
  'cards.saveLot': 'Bu lotu kaydet',
  'cards.demo': 'Demo',
  'cards.demoTitle': 'Örnek veri — gerçek bir teklif değil',
  'cards.inspections': 'denetim',

  'auth.signIn.sub': 'Siparişlerinize, tekliflerinize ve teklif taleplerinize erişin.',
  'auth.email': 'E-posta',
  'auth.password': 'Şifre',
  'auth.signInCta': 'Giriş yap',
  'auth.newHere': 'Yeni misiniz?',
  'auth.demoNotice': 'Demo uyarısı',
  'auth.seededLogin': 'Örnek inceleme hesabı',
  'auth.fillIn': 'Doldur',
  'auth.demoHintLead': 'hazır bir',
  'auth.demoHintLead2': 'demo',
  'auth.demoHintTail':
    'hesabıdır ve yönetim konsolunu incelemek içindir. Gerçek bir satıcı değildir — gerçek bilgilerinizi girmeyin.',
  'auth.demoHintProduct': 'yönetici',
  'auth.signInFailed': 'Giriş başarısız',
  'auth.signUp.title': 'Hesap oluştur',
  'auth.signUp.sub': 'Satın almak, satmak veya denetim ve lojistik hizmeti vermek için tek hesap.',
  'auth.fullName': 'Ad soyad',
  'auth.workEmail': 'İş e-postası',
  'auth.minChars': 'En az 8 karakter',
  'auth.atLeast8': 'En az 8 karakter.',
  'auth.iAmA': 'Rolüm…',
  'auth.company': 'Şirket',
  'auth.country': 'Ülke',
  'auth.countryHint': 'Türkiye, Çin…',
  'auth.createCta': 'Hesap oluştur',
  'auth.alreadyRegistered': 'Zaten üye misiniz?',
  'auth.signUpHint': 'İlan vermek ücretsizdir. Güven rozetleri doğrulama, denetim ve teslimat geçmişiyle kazanılır.',
  'auth.registerFailed': 'Kayıt başarısız',
  'auth.role.buyer': 'Alıcı',
  'auth.role.buyerHint': 'Ürün tedarik ediyorum',
  'auth.role.supplier': 'Tedarikçi',
  'auth.role.supplierHint': 'Satıyor / üretiyorum',
  'auth.role.inspector': 'Denetçi',
  'auth.role.inspectorHint': 'Fabrikaları denetliyorum',
  'auth.role.lab': 'Laboratuvar',
  'auth.role.labHint': 'Malzeme testi yapıyorum',
  'auth.role.logistics': 'Lojistik',
  'auth.role.logisticsHint': 'Yük taşıyorum',

  'profile.title': 'Profil',
  'profile.sub': 'Tekliflerinizde, siparişlerinizde ve mesajlarınızda karşı tarafın gördüğü bilgiler.',
  'profile.signInSub': 'Hesabınızı yönetmek için giriş yapın',
  'profile.notSignedIn': 'Giriş yapmadınız',
  'profile.notSignedInBody': 'Profiliniz hesabınıza özeldir: görüntülemek ve düzenlemek için giriş yapın.',
  'profile.createAccount': 'Hesap oluştur',
  'profile.accountDetails': 'Hesap bilgileri',
  'profile.unsaved': 'Kaydedilmemiş değişiklikler',
  'profile.fullName': 'Ad soyad',
  'profile.company': 'Şirket',
  'profile.notSet': 'Belirtilmedi',
  'profile.country': 'Ülke',
  'profile.language': 'Arayüz dili',
  'profile.languageHint':
    'Arayüzün dilini hemen değiştirir ve Değişiklikleri kaydet dediğinizde hesabınıza kaydedilir.',
  'profile.save': 'Değişiklikleri kaydet',
  'profile.saving': 'Kaydediliyor…',
  'profile.saved': 'Kaydedildi',
  'profile.savedBody': 'Profiliniz güncellendi.',
  'profile.identity': 'Kimlik',
  'profile.identityNote':
    'E-posta ve rol burada düzenlenemez. Hesap oluşturulurken sabitlenir ve profil API’si bu alanları kabul etmez.',
  'profile.email': 'E-posta',
  'profile.role': 'Rol',
  'profile.readOnly': 'Salt okunur',
  'profile.readOnlyEmail': 'Salt okunur — profil API’si e-posta kabul etmez',
  'profile.readOnlyRole': 'Salt okunur — profil API’si rol kabul etmez',
  'profile.emailStatus': 'E-posta durumu',
  'profile.emailVerified': 'E-posta doğrulandı',
  'profile.emailNotVerified': 'E-posta doğrulanmadı',
  'profile.memberSince': 'Üyelik başlangıcı',
  'profile.accountLine': 'Hesap #{id} · {role} olarak giriş yapıldı',
  'profile.errName': 'Adınızı girin — API boş adı reddeder.',
  'profile.errSave': 'Profil kaydedilemedi — yeniden deneyin.',

  'explore.title': 'Stokları keşfet',
  'explore.subLoading': 'Canlı lotlar yükleniyor…',
  'explore.subCount': 'Filtrelerinize uyan {n} ilan',
  'explore.searchPlaceholder': 'Bakır katot, pompalar…',
  'explore.searchAria': 'İlanlarda ara',
  'explore.categoryAria': 'Kategori',
  'explore.allCategories': 'Tüm kategoriler',
  'explore.originAria': 'Menşe ülke',
  'explore.allCountries': 'Tüm ülkeler',
  'explore.min': 'Min $',
  'explore.max': 'Maks $',
  'explore.emptyTitle': 'Bu filtrelerle eşleşen ilan yok',
  'explore.emptyBody': 'Daha geniş bir kategori, farklı bir menşe ülke deneyin veya filtreleri temizleyin.',
  'explore.page': 'Sayfa {page} / {pages}',
  'explore.prev': '← Önceki',
  'explore.next': 'Sonraki →',

  'feed.welcomeBack': 'Tekrar hoş geldiniz, {name}',
  'feed.title': 'Pazar yeri akışı',
  'feed.sub': 'Doğrulanmış fabrikalardan hazır stok, artık ve fazla lotlar — en yeniler önce.',
  'feed.sellStock': 'Stok sat',
  'feed.postRequest': 'Talep yayınla',
  'feed.lotsCount': '{n} lot',
  'feed.lotsMatch': 'lot filtrelerinizle eşleşiyor',
  'feed.verifiedSuppliers': 'doğrulanmış tedarikçi',
  'feed.openRequests': 'açık talep',
  'feed.allOrigins': 'Tüm menşeler',
  'feed.searchAria': 'Lotlarda ara',
  'feed.minAria': 'Minimum fiyat',
  'feed.maxAria': 'Maksimum fiyat',
  'feed.allIndustries': 'Tüm sektörler',
  'feed.noLots': 'Lot yok',
  'feed.shownRange': '{total} kayıttan {first}–{last}',
  'feed.emptyTitle': 'Bu filtrelerle eşleşen lot yok',
  'feed.emptyBody': 'Farklı bir sektör, başka bir menşe ülke deneyin veya filtreleri temizleyin.',
  'feed.lookingFor': 'Belirli bir şey mi arıyorsunuz?',
  'feed.postRequestLink': 'Talep yayınlayın',
  'feed.lookingForTail': 've doğrulanmış fabrikalar size teklif versin.',
  'feed.sellingInstead': 'Satmak mı istiyorsunuz?',
  'feed.listYourStock': 'Stoğunuzu listeleyin',
  'feed.signedInAs': '{role} olarak giriş yapıldı',
  'feed.createFree': 'ücretsiz hesap oluşturun',

  'help.title': 'FactoryDepo nasıl çalışır',
  'help.sub': 'Hazır stok, teklif talepleri ve denetim destekli tedarik.',
  'help.buying': 'Satın alma',
  'help.buying1.title': '1. Hazır stoğa göz atın.',
  'help.buying1':
    'Her canlı lot fiyatını, minimum sipariş miktarını, menşe ülkeyi ve gerçekten ne kadar mevcut olduğunu gösterir. Demo etiketli ilanlar örnek veridir — gerçek teklif değildir — ve yanılmamanız için işaretlenmiştir.',
  'help.buying2.title': '2. Teklif isteyin.',
  'help.buying2':
    'İhtiyacınızı anlatan bir talep yayınlayın. Tedarikçiler fiyat, termin ve kendi koşullarıyla teklif verir.',
  'help.buying3.title': '3. Karşılaştırın ve bağlanın.',
  'help.buying3': 'Teklifler talep üzerinde yan yana görünür. Birini kabul etmek sipariş oluşturur.',
  'help.buying4.title': '4. Banka havalesiyle ödeyin.',
  'help.buying4':
    'Endüstriyel ticaret kartla yürümez. Proforma fatura alırsınız, TT/havale ile ödersiniz ve ödeme onaylandığında sipariş ödendi olarak işaretlenir.',
  'help.selling': 'Satış',
  'help.selling1.title': '1. Tedarikçi hesabı oluşturun.',
  'help.selling1': 'Tedarikçi olarak kaydolmak şirket profilinizi hemen oluşturur.',
  'help.selling2.title': '2. Stoğunuzu yayınlayın.',
  'help.selling2':
    'İlan araçları şu anda geliştiriliyor — yayına alınana kadar tedarikçi ilanları ekibimiz tarafından eklenir.',
  'help.selling3.title': '3. Gelen taleplere teklif verin.',
  'help.selling3':
    'Açık alıcı talepleri panelinizde, yanıtlamadıklarınızın canlı sayısıyla görünür.',
  'help.selling4.title': '4. Doğrulanın.',
  'help.selling4':
    'Doğrulama seviyeleri görünürlük açar. Rozetler yalnızca belgeler onaylandığında verilir, yani buradaki bir rozet bir anlam taşır.',
  'help.notLive': 'Henüz yayında olmayanlar',
  'help.notLiveLead': 'Bunları siz keşfetmeden önce açıkça söylemeyi tercih ederiz:',
  'help.notLive1': 'Tedarikçi self-servis ilan araçları geliştiriliyor.',
  'help.notLive2': 'Alıcı ↔ tedarikçi mesajlaşması henüz yok — tedarikçi profilindeki iletişim bilgilerini kullanın.',
  'help.notLive3': 'Teklifler ve karşı teklifler şu an elle yürütülüyor.',
  'help.notLive4': 'Sevkiyat takibi ve belge yönetimi henüz yok.',
  'help.exploreCta': 'Stokları keşfet',
  'help.rfqCta': 'Teklif talepleri',

  'soon.sub': 'Henüz yapılmadı',
  'soon.title': 'Bu ekran sonraki geliştirme aşamasında',
  'soon.body': 'Ekran navigasyonda var, ancak veri tabloları ve API uç noktaları henüz yapılmadı.',
  'soon.note.offers': 'Teklifler ve karşı teklifler tablosu sonraki geliştirme aşamasında geliyor.',
  'soon.note.shipments': 'Sevkiyat aşamaları ve belgeleri sonraki geliştirme aşamasında geliyor.',
  'soon.note.messages': 'Alıcı ↔ tedarikçi mesajlaşması sonraki geliştirme aşamasında geliyor.',
  'soon.note.saved': 'Kaydedilen lotlar sonraki geliştirme aşamasında geliyor.',
  'soon.note.notifications': 'Bildirim merkezi sonraki geliştirme aşamasında geliyor.',
  'soon.note.profile': 'Profil düzenleme sonraki geliştirme aşamasında geliyor.',
  'soon.note.listings': 'Sahiplik kontrollü tedarikçi ilan yönetimi sonraki geliştirme aşamasında geliyor.',
  'soon.note.post': 'Görsel yüklemeli ilan oluşturma/düzenleme sonraki geliştirme aşamasında geliyor.',
  'soon.note.generic': 'Sonraki geliştirme aşamasında geliyor.',
  'soon.note.verification': 'Doğrulama seviyeleri ve belge gönderimi sonraki geliştirme aşamasında geliyor.',
  'soon.note.admin': 'Yönetim konsolu sonraki geliştirme aşamasında geliyor.',
  'soon.note.sources': 'Elle tedarikçi kaydı sonraki geliştirme aşamasında geliyor.',
  'soon.note.features': 'Özellik anahtarları sonraki geliştirme aşamasında geliyor.',

  'orders.title': 'Siparişler',
  'orders.signInSub': 'Taraf olduğunuz siparişleri görmek için giriş yapın',
  'orders.notSignedIn': 'Giriş yapmadınız',
  'orders.notSignedInBody': 'Siparişler gizlidir: almayı veya satmayı taahhüt ettiklerinizi görmek için giriş yapın.',
  'orders.createAccount': 'Hesap oluştur',
  'orders.subSupplier': 'Alıcıların stoğunuzdan verdiği siparişler',
  'orders.subBuyer': 'Satın almayı taahhüt ettiğiniz her şey',
  'orders.statListings': 'İlanlarım',
  'orders.statOffersReceived': 'Alınan teklifler',
  'orders.statOffersOnRfqs': 'Taleplerimdeki teklifler',
  'orders.statOrders': 'Siparişler',
  'orders.statSoldItems': 'Satılan kalemler',
  'orders.statSoldTitle': 'Sevk edilmiş veya teslim edilmiş siparişler',
  'orders.statViews': 'Görüntüleme · henüz izlenmiyor',
  'orders.statViewsTitle': 'Görüntüleme takibi henüz uygulanmadı',
  'orders.metricsError': 'Ölçümler şu anda yüklenemedi.',
  'orders.loadErrorTitle': 'Siparişler yüklenemedi',
  'orders.loadErrorBody': 'API siparişlerinizi döndürmedi. Sayfayı yenileyin veya tekrar giriş yapın.',
  'orders.emptyTitle': 'Henüz sipariş yok',
  'orders.emptySupplier': 'Bir alıcı stoğunuzdan sipariş verdiğinde burada görünür.',
  'orders.emptyBuyer': 'Hazır stokta verdiğiniz hemen al siparişleri burada görünür.',
  'orders.browseStock': 'Hazır stoğa göz at',
  'orders.postRfq': 'Teklif talebi yayınla',
  'orders.count': '{n} sipariş',
  'orders.col.order': 'Sipariş',
  'orders.col.product': 'Ürün',
  'orders.col.counterparty': 'Karşı taraf',
  'orders.col.qty': 'Miktar',
  'orders.col.total': 'Toplam',
  'orders.col.status': 'Durum',
  'orders.col.date': 'Tarih',
  'orders.buyerLabel': 'alıcı',
  'orders.supplierLabel': 'tedarikçi',
  'orders.buyerId': 'Alıcı #{id}',

  'product.loadingTitle': 'Yükleniyor…',
  'product.loadingThis': 'bu ilan',
  'product.fetching': '{what} getiriliyor…',
  'product.notFound': 'Ürün bulunamadı',
  'product.backToExplore': 'Keşfete dön',
  'product.noPhoto': 'Bu lot için fotoğraf verilmedi',
  'product.pricePer': 'Fiyat / {unit}',
  'product.minOrder': 'Minimum sipariş',
  'product.availableNow': 'Şu anda mevcut',
  'product.origin': 'Menşe ülke',
  'product.unavailable': 'Şu anda mevcut değil',
  'product.buyNowHeading': 'Hemen al — hazır stok',
  'product.soldOutBody': 'Bu lot tükendi olarak işaretli. Tedarikçiden sıradaki partiyi isteyin.',
  'product.noUnitsBody': 'Şu anda hiç birim yok. Tedarikçiden sıradaki partiyi isteyin.',
  'product.purchaseTerms': 'Liste fiyatı {price} / {unit}, minimum {moq} {unit} üzerinden satın alın.',
  'product.stockOnHand': 'Eldeki stok',
  'product.buyNowPrice': 'Hemen al · {price}/{unit}',
  'product.outOfStock': 'Hemen al — stok yok',
  'product.requestQuote': 'Teklif isteyin',
  'product.shipsFrom': '{country} çıkışlı',
  'product.signInToOrder': 'Sipariş vermek veya teklif istemek için giriş yapın.',
  'product.supplier': 'Tedarikçi',
  'product.viewProfile': 'Profili gör',
  'product.loadingSupplier': 'Tedarikçi yükleniyor…',
  'product.supplierUnavailable': 'Tedarikçi bilgileri mevcut değil.',
  'product.rating': 'Puan',
  'product.inspections': 'Denetimler',
  'product.fulfilment': 'Zamanında teslim',
  'product.verifiedLevel': 'Doğrulama seviyesi',
  'product.levelN': 'Seviye {n}',
  'product.tradingSince': 'Faaliyet yılı',
  'product.supplierFiguresHint': 'Bu rakamlar yalnızca bu lot için değil, tedarikçinin tüm pazar yeri performansıdır.',
  'product.description': 'Açıklama',
  'product.noDescription':
    'Tedarikçi açıklama eklememiş. Özellikler, termin ve teslim koşulları için teklif isteyin.',
  'product.specification': 'Teknik özellikler',
  'product.noSpec': 'Bu lot için teknik özellik kaydı yok.',
  'product.col.attribute': 'Özellik',
  'product.col.value': 'Değer',
  'product.spec.category': 'Kategori',
  'product.spec.unit': 'Birim',
  'product.spec.purity': 'Saflık / kalite',

  'checkout.title': 'Hemen al — ödeme',
  'checkout.placedTitle': 'Sipariş verildi',
  'checkout.confirmed': 'Sipariş #{id} onaylandı',
  'checkout.notified': 'Tedarikçi bilgilendirildi. Siparişi siparişler sayfanızdan takip edin.',
  'checkout.viewOrders': 'Siparişleri gör',
  'checkout.keepBrowsing': 'Gezmeye devam et',
  'checkout.pricePer': 'Fiyat / {unit}',
  'checkout.minimumOrder': 'Minimum sipariş',
  'checkout.availableNow': 'Şu anda mevcut',
  'checkout.quantity': 'Miktar ({unit})',
  'checkout.qtyHint': 'Stokta {moq} ile {stock} {unit} arasında.',
  'checkout.fullName': 'Ad soyad',
  'checkout.country': 'Ülke',
  'checkout.address': 'Açık adres',
  'checkout.city': 'Şehir',
  'checkout.phone': 'Telefon',
  'checkout.notes': 'Tedarikçiye notlar',
  'checkout.total': 'Toplam {total}',
  'checkout.placeOrder': 'Sipariş ver · {total}',
  'checkout.placing': 'Sipariş veriliyor…',
  'checkout.errPlace': 'Sipariş verilemedi.',

  'rfqModal.title': 'Teklif isteyin',
  'rfqModal.postedTitle': 'Talep yayınlandı',
  'rfqModal.live': 'İhtiyacınız teklif talebi borsasında yayında',
  'rfqModal.canQuote': 'Doğrulanmış tedarikçiler artık fiyat ve termin teklifi verebilir.',
  'rfqModal.viewMine': 'Teklif taleplerimi gör',
  'rfqModal.listedBy': '{product} · ilan sahibi {supplier}',
  'rfqModal.quantity': 'Miktar',
  'rfqModal.unit': 'Birim',
  'rfqModal.specs': 'Özellikler, sertifikalar, teslim koşulları',
  'rfqModal.moqHint': 'İlanın MOQ değeri {moq} {unit}.',
  'rfqModal.post': 'Talep yayınla',
  'rfqModal.posting': 'Yayınlanıyor…',
  'rfqModal.errPost': 'Talep yayınlanamadı.',
  'rfqModal.titleSuffix': 'teklif talebi',

  'suppliers.loadingSub': 'Tedarikçi dizini getiriliyor',
  'suppliers.loadingBody': 'Tedarikçi dizini getiriliyor…',
  'suppliers.title': 'Tedarikçi dizini',
  'suppliers.sub':
    'FactoryDepo’daki fabrikalar ve ticaret evleri. Doğrulama seviyeleri yerinde denetim ve belge kontrolünden gelir.',
  'suppliers.demoNote': 'demo işaretli satırlar örnek veridir',
  'suppliers.loadErrorTitle': 'Dizin yüklenemedi',
  'suppliers.loadErrorBody': 'Tedarikçi servisi yanıt vermedi. Birazdan tekrar deneyin.',
  'suppliers.emptyTitle': 'Henüz tedarikçi yok',
  'suppliers.emptyBody': 'Tedarikçi profilleri kaydedilip doğrulandıktan sonra burada görünür.',
  'suppliers.totalListed': 'Listelenen tedarikçi',
  'suppliers.totalVerified': 'Seviye 2+ doğrulanmış',
  'suppliers.avgRating': 'Ortalama puan',
  'suppliers.avgRatingRated': 'Ortalama puan ({n} puanlanmış)',
  'suppliers.avgFulfilment': 'Zamanında teslim',
  'suppliers.avgFulfilmentMeasured': 'Zamanında teslim ({n} ölçülmüş)',
  'suppliers.searchPlaceholder': 'Şirket, ülke, şehir, yetkinlik…',
  'suppliers.searchAria': 'Tedarikçi ara',
  'suppliers.verifiedOnly': 'Yalnızca doğrulanmış',
  'suppliers.showing': '{total} kayıttan {shown} gösteriliyor',
  'suppliers.noMatchTitle': 'Bu aramayla eşleşen tedarikçi yok',
  'suppliers.noMatchBody': 'Daha kısa bir şirket adı deneyin veya doğrulama filtresini kaldırın.',
  'suppliers.rating': 'Puan',
  'suppliers.inspections': 'Denetim',
  'suppliers.fulfilment': 'Teslim performansı',

  'supplierDetail.loadingThis': 'bu tedarikçi profili',
  'supplierDetail.notFound': 'Tedarikçi bulunamadı',
  'supplierDetail.backToDirectory': 'Dizine dön',
  'supplierDetail.backShort': '← Dizine dön',
  'supplierDetail.tradingSince': '{year} yılından beri faaliyette',
  'supplierDetail.verifiedL3': 'Doğrulanmış · seviye 3',
  'supplierDetail.registered': 'Kayıtlı',
  'supplierDetail.buyerRating': 'Alıcı puanı',
  'supplierDetail.notRated': 'henüz puanlanmadı',
  'supplierDetail.inspections': 'Yerinde denetim',
  'supplierDetail.fulfilment': 'Zamanında teslim',
  'supplierDetail.activeListings': 'Aktif ilanlar',
  'supplierDetail.tier': 'Doğrulama seviyesi',
  'supplierDetail.trustScore': 'Güven puanı (0–100)',
  'supplierDetail.about': '{company} hakkında',
  'supplierDetail.noDescription': 'Bu tedarikçi henüz bir şirket açıklaması yayınlamadı.',
  'supplierDetail.capabilities': 'Beyan edilen yetkinlikler',
  'supplierDetail.record': 'Doğrulama ve geçmiş',
  'supplierDetail.ratingLabel': 'Alıcı puanı',
  'supplierDetail.inspectionsDone': 'Tamamlanan denetimler',
  'supplierDetail.contact': 'İletişim',
  'supplierDetail.contactBody': 'Denetim raporları ve doğrulama belgeleri ilk temastan sonra üyelerle paylaşılır.',
  'supplierDetail.contactSupplier': 'Tedarikçiyle iletişime geç',
  'supplierDetail.contactHintSignedIn': 'Teklif talebi borsasını açar — teklif yazışması orada yürür.',
  'supplierDetail.contactHintGuest': 'Yalnızca üyeler · üyelik ücretsiz',
  'supplierDetail.services': 'Ticaret hizmetleri',
  'supplierDetail.service1': 'Ödeme öncesi fabrika denetimi',
  'supplierDetail.service2': 'Laboratuvar testi ve malzeme analizi',
  'supplierDetail.service3': 'Konteyner yükleme gözetimi',
  'supplierDetail.service4': 'İhracat evrak desteği',
  'supplierDetail.stockFrom': '{company} stoğu',
  'supplierDetail.shown': '{n} gösteriliyor',
  'supplierDetail.loadingLots': 'Canlı lotlar yükleniyor…',
  'supplierDetail.noneShown': 'Aktif ilan gösterilmiyor',
  'supplierDetail.noneShownBody':
    'API bu tedarikçi için {n} ilan bildiriyor, ancak mevcut liste görünümünde hiçbiri gelmedi. Kataloglarını sormak için teklif talebi borsasından bir talep yayınlayın.',

  'rfq.titleSupplier': 'Teklif talebi fırsatları',
  'rfq.titleBuyer': 'Talepler',
  'rfq.subSupplier': 'Alıcıların yayınladığı açık ihtiyaçlar. Fiyatınız ve termininizle yanıtlayın.',
  'rfq.subBuyer':
    'Borsadaki güncel ihtiyaçlar, en yeniler önce. Birini açıp aldığı teklifleri görün.',
  'rfq.postRequest': '+ Talep yayınla',
  'rfq.buyerOnlyNotice': 'Yalnızca alıcı hesapları talep yayınlayabilir. Yayınlamak için alıcı profiliyle giriş yapın.',
  'rfq.total': 'toplam talep',
  'rfq.open': 'açık',
  'rfq.quoted': 'teklif verilmiş',
  'rfq.closed': 'kapalı',
  'rfq.quoteable': 'Teklif verebileceğiniz talepler',
  'rfq.allRequests': 'Tüm talepler',
  'rfq.shown': '{n} gösteriliyor',
  'rfq.statusAll': 'Tümü',
  'rfq.statusOpenCount': 'Açık ({n})',
  'rfq.statusQuotedCount': 'Teklif verilmiş ({n})',
  'rfq.quotingCloses': 'Alıcı bir teklifi kabul ettiğinde teklif verme kapanır.',
  'rfq.emptyNone': 'Henüz talep yok',
  'rfq.emptyNoMatch': 'Bu filtreyle eşleşen yok',
  'rfq.emptyNoneSupplier': 'Borsada şu anda açık ihtiyaç yok.',
  'rfq.emptyNoneBuyer': 'İlk ihtiyacınızı yayınlayın, doğrulanmış fabrikalar yanıtlasın.',
  'rfq.emptyNoMatchHint': 'Farklı bir durum filtresi deneyin.',
  'rfq.col.requirement': 'İhtiyaç',
  'rfq.col.quantity': 'Miktar',
  'rfq.col.deliverTo': 'Teslim yeri',
  'rfq.col.quotes': 'Teklifler',
  'rfq.col.posted': 'Yayınlandı',
  'rfq.col.status': 'Durum',
  'rfq.openAria': 'Teklif talebi #{id} aç',
  'rfq.requestRef': '{category} · talep #{id}',
  'rfq.quotesCount': '{n} teklif',
  'rfq.postingBuyerOnly': 'Yayınlamak bir alıcı işlemidir. Tedarikçiler',
  'rfq.quoteOpen': 'açık ihtiyaçlara teklif verebilir',
  'rfq.newTitle': 'Yeni teklif talebi',
  'rfq.whatNeed': 'Neye ihtiyacınız var?',
  'rfq.titlePlaceholder': 'örn. 100 MT bakır katot, A kalite',
  'rfq.category': 'Kategori',
  'rfq.deliverTo': 'Teslim yeri',
  'rfq.quantity': 'Miktar',
  'rfq.unit': 'Birim',
  'rfq.specification': 'Teknik özellikler',
  'rfq.specPlaceholder': 'Kalite, saflık, sertifikalar, Incoterms, paketleme…',
  'rfq.specHint': 'Teknik özellik ne kadar netse doğrulanmış fabrikalar o kadar hızlı teklif verir.',
  'rfq.errTitle': 'Talebe net bir başlık verin — en az 5 karakter.',
  'rfq.errQuantity': 'Miktar sıfırdan büyük bir sayı olmalı.',
  'rfq.errPost': 'Bu talep yayınlanamadı.',

  'rfqDetail.loadingTitle': 'Talep',
  'rfqDetail.loadingSub': 'Yükleniyor…',
  'rfqDetail.title': 'Talep',
  'rfqDetail.notFound': 'Talep bulunamadı',
  'rfqDetail.notFoundBody': 'Bu ihtiyaç geri çekilmiş olabilir veya bağlantı yanlış.',
  'rfqDetail.backToRequests': '← Taleplere dön',
  'rfqDetail.allRequests': '← Tüm talepler',
  'rfqDetail.postedOn': '{date} tarihinde yayınlandı',
  'rfqDetail.requestRef': 'Talep #{id}',
  'rfqDetail.accepting': 'Teklif kabul ediliyor',
  'rfqDetail.notAccepting': 'Yeni teklif kabul edilmiyor',
  'rfqDetail.noSpec': 'Ek teknik özellik verilmedi.',
  'rfqDetail.quantity': 'Miktar',
  'rfqDetail.deliverTo': 'Teslim yeri',
  'rfqDetail.quotations': 'Teklifler',
  'rfqDetail.deadline': 'Son tarih',
  'rfqDetail.requestedBy': 'Talep eden',
  'rfqDetail.received': '{n} alındı',
  'rfqDetail.noneTitle': 'Henüz teklif yok',
  'rfqDetail.noneBody': 'Doğrulanmış tedarikçiler bu ihtiyacı inceliyor.',
  'rfqDetail.col.supplier': 'Tedarikçi',
  'rfqDetail.col.price': 'Fiyat',
  'rfqDetail.col.leadTime': 'Termin',
  'rfqDetail.col.notes': 'Notlar',
  'rfqDetail.col.sent': 'Gönderildi',
  'rfqDetail.col.status': 'Durum',
  'rfqDetail.trustScore': 'Güven puanı {n}',
  'rfqDetail.days': '{n} gün',
  'rfqDetail.submitTitle': 'Teklif ver',
  'rfqDetail.supplierAccount': 'Tedarikçi hesabı',
  'rfqDetail.fromSupplier': 'Teklifler tedarikçi hesaplarından gelir. Bu talebe yanıt vermek için tedarikçi hesabınıza geçin.',
  'rfqDetail.signInSupplierBody': 'Bir talebe yalnızca giriş yapmış tedarikçi hesapları teklif verebilir. Gezinmek herkese açıktır.',
  'rfqDetail.supplierOnly': 'Yalnızca tedarikçi hesapları',
  'rfqDetail.signInAsSupplier': 'Tedarikçi olarak giriş yap',
  'rfqDetail.closedBody': 'Bu talep {status} ve artık teklif kabul etmiyor.',
  'rfqDetail.seeOpen': 'Açık talepleri gör',
  'rfqDetail.respondBody': 'Birim fiyatınız ve termininizle yanıtlayın. Doğrulanmış profiliniz teklifle birlikte gider.',
  'rfqDetail.unitPrice': 'Birim fiyat (USD)',
  'rfqDetail.leadTime': 'Termin (gün)',
  'rfqDetail.termsNotes': 'Koşullar ve notlar',
  'rfqDetail.termsPlaceholder': 'Incoterms, kalite, paketleme, numune politikası, geçerlilik…',
  'rfqDetail.compareHint': 'Alıcılar fiyatı, termini ve doğrulamayı yan yana karşılaştırır.',
  'rfqDetail.submitQuote': 'Teklifi gönder',
  'rfqDetail.submitting': 'Gönderiliyor…',
  'rfqDetail.errPrice': 'Sıfırdan büyük bir birim fiyat girin.',
  'rfqDetail.errLead': 'Termin 1 ile 365 arasında tam gün sayısı olmalı.',
  'rfqDetail.errSubmit': 'Bu teklif gönderilemedi.',

  'listings.title': 'İlanlarım',
  'listings.sub': 'Pazar yerinde yayınladığınız stok',
  'listings.signInSub': 'Pazar yerinde yayınladığınız stok',
  'listings.notSignedIn': 'Giriş yapmadınız',
  'listings.notSignedInBody': 'İlanlarınız tedarikçi hesabınıza özeldir. Görüntülemek ve yönetmek için giriş yapın.',
  'listings.createSupplierAccount': 'Tedarikçi hesabı oluştur',
  'listings.supplierOnly': 'Yalnızca tedarikçi hesapları',
  'listings.supplierOnlyBody':
    'Hesabınız bir {role} hesabı. İlanlar sahibi tedarikçi tarafından yönetilir, bu yüzden burada gösterilecek veya düzenlenecek bir şey yok.',
  'listings.browseStock': 'Hazır stoğa göz at',
  'listings.subLoading': 'Stoğunuz yükleniyor…',
  'listings.subCount': 'Tedarikçi profiliniz altında yayınlanan {n} ilan',
  'listings.postStock': '+ Stok yayınla',
  'listings.lotsPublished': 'lot yayınlandı',
  'listings.viewsNotTracked': 'görüntüleme · henüz izlenmiyor',
  'listings.bankTransferNote': 'Bir teklif kabul edildiğinde alıcılar banka havalesiyle öder.',
  'listings.loadErrorTitle': 'İlanlarınız yüklenemedi',
  'listings.loadErrorBody': 'İlanlarınız yüklenemedi — yeniden deneyin. Sürekli başarısız olursa tekrar giriş yapın.',
  'listings.emptyTitle': 'Henüz ilan yok',
  'listings.emptyBody':
    'İlk lotunuzu yayınlayın — bir fotoğraf, birim fiyat ve bugün ne kadar sevk edebileceğiniz. Pazar yerindeki her alıcı için Keşfet’te yayına girer.',
  'listings.postFirst': '+ İlk lotunuzu yayınlayın',
  'listings.getVerified': 'Doğrulanın',
  'listings.count': '{n} ilan',
  'listings.col.lot': 'Lot',
  'listings.col.category': 'Kategori',
  'listings.col.unitPrice': 'Birim fiyat',
  'listings.col.moq': 'MOQ',
  'listings.col.available': 'Mevcut',
  'listings.col.status': 'Durum',
  'listings.col.posted': 'Yayınlandı',
  'listings.lotRef': 'lot #{id}',
  'listings.noPhotoInline': 'fotoğraf yok',
  'listings.demoNoteLead': 'Demo işaretli bir lot,',
  'listings.demoNoteTail':
    'sizin yayınladığınız stok değil pazar yerinin sağladığı örnek veridir. Silmek onu herkes için kaldırır.',
  'listings.updated': 'İlan güncellendi.',
  'listings.deleted': 'İlan silindi. Artık pazar yerinde değil.',
  'listings.deleteTitle': 'Bu ilan silinsin mi?',
  'listings.deleteLead': '{name} — lot #{id}',
  'listings.deleteBody':
    'Bu ilan kalıcı olarak kaldırılır. Keşfet’ten ve ilan tablonuzdan hemen kaybolur, alıcılar artık sipariş veremez veya pazarlık edemez. Bu geri alınamaz.',
  'listings.deleteKeepBody':
    'Üzerinde sipariş veya teklif bulunan bir lot silinemez — API onu kayıt için saklar. Bunun yerine mevcut stoğu 0 yaparak tükendi olarak işaretleyin.',
  'listings.keepListing': 'İlanı koru',
  'listings.deleteForever': 'Kalıcı olarak sil',
  'listings.deleting': 'Siliniyor…',
  'listings.deleteErr': 'Bu ilan silinemedi.',
  'listings.editTitle': 'İlanı düzenle — lot #{id}',

  'post.title': 'Stok yayınla',
  'post.titleEdit': 'İlanı düzenle',
  'post.sub': 'İlan başına bir lot: ne olduğu, fiyatı ve bugün ne kadar sevk edebileceğiniz',
  'post.subEdit': 'Lot #{id} değiştiriliyor — kaydetmek yayındaki ilanın üzerine yazar',
  'post.signInSub': 'Alıcıların sipariş verebilmesi veya pazarlık edebilmesi için hazır stok listeleyin',
  'post.notSignedIn': 'Giriş yapmadınız',
  'post.notSignedInBody': 'Stok yayınlamak bir tedarikçi işlemidir. Lot yayınlamak için tedarikçi hesabıyla giriş yapın.',
  'post.createSupplierAccount': 'Tedarikçi hesabı oluştur',
  'post.supplierOnly': 'Yalnızca tedarikçi hesapları',
  'post.supplierOnlyBody':
    'Hesabınız bir {role} hesabı, bu yüzden API ondan ilan kabul etmez. Stok yayınlanmadan önce tedarikçi profili gerekir.',
  'post.myListings': 'İlanlarım',
  'post.loadErrorTitle': 'İlan yüklenemedi',
  'post.loadErrorBody': 'Bu lot yüklenemedi — yeniden deneyin veya ilanlarınıza dönün.',
  'post.details': 'İlan bilgileri',
  'post.newListing': 'Yeni ilan',
  'post.requiredMark': '* zorunlu',
  'post.lotName': 'Lot adı',
  'post.lotNamePlaceholder': 'örn. Bakır katot A kalite, %99,99',
  'post.category': 'Kategori',
  'post.originCountry': 'Menşe ülke',
  'post.notStated': 'Belirtilmedi',
  'post.description': 'Açıklama',
  'post.descriptionPlaceholder': 'Kalite, paketleme, Incoterms, termin, sertifikalar…',
  'post.descriptionHint': 'Alıcılar bu metne göre karar verir. Lotta ne olduğunu ve nasıl sevk edildiğini yazın.',
  'post.unitPrice': 'Birim fiyat',
  'post.currency': 'Para birimi',
  'post.unit': 'Birim',
  'post.moq': 'Minimum sipariş (MOQ)',
  'post.moqHint': 'Varsayılan 1.',
  'post.available': 'Şu anda mevcut',
  'post.availableHint': 'Varsayılan 0 — bugün sevk edebileceğiniz stok.',
  'post.purity': 'Saflık / kalite',
  'post.purityPlaceholder': '%99,99 / A kalite',
  'post.optional': 'İsteğe bağlı.',
  'post.photoUrl': 'Fotoğraf URL’si',
  'post.photoPlaceholder': 'https://…/bakir-katot.jpg',
  'post.photoHintLead': 'Dosya yükleme henüz yapılmadı.',
  'post.photoHintTail':
    'Fotoğrafın herkese açık bağlantısını yapıştırın, bu lotun görseli olarak saklanır. Fotoğrafsız lotlar sade bir yer tutucu gösterir.',
  'post.preview': 'Önizleme — hiçbir şey yüklenmiyorsa bağlantı doğrudan bir görsel değildir.',
  'post.save': 'Değişiklikleri kaydet',
  'post.saving': 'Kaydediliyor…',
  'post.errName': 'Lota bir ad verin — en az 2 karakter.',
  'post.errCategory': 'Bir kategori seçin.',
  'post.errUnit': 'Sattığınız birimi belirtin (MT, KG, adet…).',
  'post.errPrice': 'Birim fiyat sıfırdan büyük bir sayı olmalı.',
  'post.errMoq': 'MOQ sıfırdan büyük bir sayı olmalı.',
  'post.errQty': 'Mevcut miktar negatif olamaz.',
  'post.errSave': 'Bu ilan kaydedilemedi.',
  'post.errCreate': 'Bu ilan yayınlanamadı.',
  'post.behaviour': 'Bu ilan nasıl çalışır',
  'post.behaviourBody':
    'Yayınlanan lot hemen Keşfet’te görünür ve giriş yapmış her alıcı sipariş verebilir. Alıcılar ayrıca istediğiniz fiyatın altında teklif açabilir; bunları şuradan yanıtlarsınız:',
  'post.offersLink': 'Teklifler',
  'post.provenance': 'Kaynak',
  'post.platformListing': 'Platform ilanı',
  'post.photo': 'Fotoğraf',
  'post.urlOnly': 'Yalnızca URL — yükleme yok',
  'post.buyerPaysBy': 'Alıcı ödeme yöntemi',
  'post.bankTransfer': 'Banka havalesi',
  'post.noMetrics':
    'Bu sayfa görüntüleme, puan veya sipariş sayısı göstermez — bu ölçümler henüz yapılmadığı için gösterilmez.',

  'offers.title': 'Stoğunuzdaki teklifler',
  'offers.sub': 'Lotlarınız için pazarlık eden alıcılar',
  'offers.signInSub': 'Lotlarınız için pazarlık eden alıcılar',
  'offers.notSignedIn': 'Giriş yapmadınız',
  'offers.notSignedInBody': 'Teklifler alıcı ve tedarikçiye özeldir. Yanıtlamak için giriş yapın.',
  'offers.createSupplierAccount': 'Tedarikçi hesabı oluştur',
  'offers.supplierOnly': 'Yalnızca tedarikçi hesapları',
  'offers.supplierOnlyBody':
    'Hesabınız bir {role} hesabı, altında stok listelenmediği için teklif gelemez. Alıcı olarak verdiğiniz teklifler pazar yerinin alıcı tarafındadır.',
  'offers.browseStock': 'Hazır stoğa göz at',
  'offers.subLoading': 'Teklifler yükleniyor…',
  'offers.subCount': 'İlanlarınızda {n} teklif',
  'offers.awaiting': 'yanıtınızı bekliyor',
  'offers.decided': 'sonuçlandı',
  'offers.acceptCreates': 'Bir teklifi kabul etmek sipariş oluşturur; alıcı banka havalesiyle öder.',
  'offers.filterAwaiting': 'Yanıt bekleyen ({n})',
  'offers.filterDecided': 'Sonuçlanan ({n})',
  'offers.counterNote': 'Karşı teklifler yeni ve bağlantılı bir teklif açar; ilk koşullarınız kayıtta kalır.',
  'offers.loadErrorTitle': 'Teklifler yüklenemedi',
  'offers.loadErrorBody': 'Stoğunuzdaki teklifler yüklenemedi — yeniden deneyin.',
  'offers.emptyTitle': 'Henüz teklif yok',
  'offers.emptyBody':
    'Bir alıcı lotlarınızdan biri için pazarlık ettiğinde, önerdiği fiyat ve istediği miktarla burada görünür. Kabul edebilir, reddedebilir veya kendi fiyatınızla yanıtlayabilirsiniz.',
  'offers.seeListings': 'İlanlarımı gör',
  'offers.postMore': '+ Daha fazla stok yayınla',
  'offers.noneAwaiting': 'Yanıtınızı bekleyen yok',
  'offers.noneDecided': 'Henüz sonuçlanan teklif yok',
  'offers.noneAwaitingBody': 'Stoğunuzdaki tüm teklifler yanıtlandı. İncelemek için Sonuçlanan sekmesine geçin.',
  'offers.noneDecidedBody': 'Kabul veya reddettiğiniz teklifler kayıt olarak burada tutulur.',
  'offers.count': '{n} teklif',
  'offers.col.listing': 'İlan',
  'offers.col.buyer': 'Alıcı',
  'offers.col.quantity': 'Miktar',
  'offers.col.theirPrice': 'Alıcının fiyatı',
  'offers.col.status': 'Durum',
  'offers.col.received': 'Alındı',
  'offers.decidedLabel': 'Sonuçlandı',
  'offers.counter': 'Karşı teklif',
  'offers.accept': 'Kabul et',
  'offers.reject': 'Reddet',
  'offers.offerRef': 'teklif #{id}',
  'offers.answersOffer': '#{id} numaralı teklifi yanıtlıyor',
  'offers.demoNoteLead': 'Demo etiketli satır,',
  'offers.demoNoteTail':
    'sizin yayınladığınız stok değil örnek bir lot üzerindedir. Kabul etmek yine gerçek bir sipariş oluşturur — bağlanmadan önce lotu kontrol edin.',
  'offers.counterTitle': 'Karşı teklif #{id}',
  'offers.counterBody':
    '{buyer}, {product} için {qty} adede {price} teklif etti. Yanıtınız yeni ve bağlantılı bir teklif olur; alıcının koşulları kayıtta kalır.',
  'offers.counterPrice': 'Birim fiyatınız',
  'offers.perUnit': 'birim başına {currency}',
  'offers.counterQty': 'Miktar',
  'offers.counterQtyHint': 'Alıcının miktarını korumak için olduğu gibi bırakın.',
  'offers.counterNotes': 'Alıcıya not',
  'offers.counterNotesPlaceholder': 'Termin, paketleme, Incoterms, bu fiyatın geçerliliği…',
  'offers.sendCounter': 'Karşı teklifi gönder',
  'offers.sending': 'Gönderiliyor…',
  'offers.counterErrPrice': 'Karşı teklif fiyatınız sıfırdan büyük bir sayı olmalı.',
  'offers.counterErrQty': 'Miktar sıfırdan büyük bir sayı olmalı.',
  'offers.counterErr': 'Bu karşı teklif gönderilemedi.',
  'offers.counterDone': 'Karşı teklif gönderildi. İlk teklif karşı teklif verildi olarak işaretlendi ve alıcı bilgilendirildi.',
  'offers.acceptTitle': '#{id} numaralı teklif kabul edilsin mi?',
  'offers.listing': 'İlan',
  'offers.buyer': 'Alıcı',
  'offers.quantity': 'Miktar',
  'offers.unitPrice': 'Birim fiyat',
  'offers.offerValue': 'Teklif tutarı',
  'offers.acceptBodyLead': 'Kabul etmek bir sipariş oluşturur.',
  'offers.acceptBodyBank': 'Alıcı buna bağlanır ve şu yöntemle öder:',
  'offers.acceptBodyTail':
    '— platform kartla ödeme almaz. Proformayı siz düzenler ve havale geldiğinde onaylarsınız; sipariş ardından sevkiyata geçer. Bu karar kesindir: kabul edilen bir teklif yeniden karara bağlanamaz.',
  'offers.acceptCta': 'Kabul et ve sipariş oluştur',
  'offers.accepting': 'Kabul ediliyor…',
  'offers.acceptErr': 'Bu teklif kabul edilemedi.',
  'offers.acceptDone': 'Teklif #{id} kabul edildi. {buyer} için sipariş oluşturuldu.',
  'offers.rejectTitle': '#{id} numaralı teklif reddedilsin mi?',
  'offers.rejectBody':
    '{buyer} adlı alıcının {product} için verdiği {price} tutarındaki teklif kapanır. Reddetmek kesindir — alıcı bu teklifi canlandıramaz, ancak yeni bir teklif açabilir.',
  'offers.rejectCta': 'Teklifi reddet',
  'offers.rejecting': 'Reddediliyor…',
  'offers.rejectErr': 'Bu teklif reddedilemedi.',
  'offers.rejectDone': 'Teklif #{id} reddedildi.',

  'verify.title': 'Doğrulama',
  'verify.sub': 'Belgelerinizi dosyalayın, inceleme kararını izleyin ve alıcılara ne söylendiğini görün',
  'verify.signInSub': 'Alıcıların parayı bağlamadan önce güvendiği belgeler',
  'verify.notSignedIn': 'Giriş yapmadınız',
  'verify.notSignedInBody':
    'Doğrulama belgeleri bir tedarikçi hesabına aittir ve ham hâliyle asla herkese açık olmaz. Dosyalamak veya yenilemek için giriş yapın.',
  'verify.createSupplierAccount': 'Tedarikçi hesabı oluştur',
  'verify.supplierOnly': 'Yalnızca tedarikçi hesapları',
  'verify.supplierOnlyBody': 'Hesabınız bir {role} hesabı, tamamlanacak bir tedarikçi kontrol listesi yok.',
  'verify.seeSuppliers': 'Doğrulanmış tedarikçileri gör',
  'verify.approved': 'Onaylanan belgeler',
  'verify.waiting': 'İnceleyici bekleniyor',
  'verify.actionNeeded': 'Eksik veya geri gönderilen',
  'verify.coreApproved': 'Temel belgeler onaylandı',
  'verify.confirmed': 'Onaylandı',
  'verify.pending': 'Beklemede',
  'verify.yourDocs': 'Belgeleriniz',
  'verify.onFile': 'kayıtlı {n} belge',
  'verify.loadErrorTitle': 'Belgeler yüklenemedi',
  'verify.loadErrorBody':
    'Doğrulama belgeleriniz yüklenemedi — yeniden deneyin. Sürekli başarısız olursa hesabınızda henüz tedarikçi profili olmayabilir.',
  'verify.emptyTitle': 'Kayıtlı belge yok',
  'verify.emptyBody':
    'Henüz bir belge dosyalanmadı, bu yüzden alıcılara doğrulama rozeti gösterilemez. İlk belgenizi dosyalamak için formu kullanın — {first} ile başlayın.',
  'verify.col.document': 'Belge',
  'verify.col.status': 'Durum',
  'verify.col.note': 'İnceleyici notu',
  'verify.col.reviewed': 'İncelendi',
  'verify.filed': '{date} tarihinde dosyalandı',
  'verify.reference': 'referans: {ref}',
  'verify.noReference': 'referans verilmedi',
  'verify.resubmit': 'Yeniden gönder',
  'verify.tierFootnote':
    'Burada yalnızca API’nin tedarikçi profiliniz için döndürdüğü belgeler listelenir. Eksik türlerin henüz satırı yoktur — dosyalamak satırı oluşturur.',
  'verify.fileTitle': 'Belge dosyala veya yenile',
  'verify.docType': 'Belge türü',
  'verify.existingHintPre': '{doc} için zaten bir satırınız var — durum',
  'verify.existingHintPost':
    '. Yeniden dosyalamak onun üzerine yazar ve önceki kararı siler, yani onaylanmış bir belge yeniden onay gerektirir.',
  'verify.refLabel': 'Belgeye referans / bağlantı',
  'verify.refPlaceholder': 'https://…/ticaret-sicili.pdf veya dosya referansınız',
  'verify.refHintLead': 'Dosya yükleme henüz yapılmadı.',
  'verify.refHintTail':
    'Belgenin bağlantısını veya inceleme ekibinin takip edebileceği bir referansı yapıştırın. Olduğu gibi saklanır ve herkese açık gösterilmez.',
  'verify.noteLabel': 'İnceleyiciye not',
  'verify.notePlaceholder': 'Ne değişti, neden yenileniyor, inceleyicinin bilmesi gerekenler…',
  'verify.filing': 'Dosyalanıyor…',
  'verify.resubmitDoc': '{doc} belgesini yeniden gönder',
  'verify.submitDoc': '{doc} belgesini gönder',
  'verify.queueNoteLead': 'Göndermek belgeyi yalnızca kuyruğa alır.',
  'verify.queueNoteStrong': 'Alıcılara rozet, bir inceleyici onayladığında görünür',
  'verify.queueNoteTail': '— gönderimde asla ve hiçbir zaman otomatik olarak değil.',
  'verify.filedNotice':
    '{doc} dosyalandı. Durum artık "gönderildi" ve inceleme kuyruğunda bekliyor — alıcılara rozet yalnızca bir inceleyici onayladığında görünür.',
  'verify.errFile': 'Bu belge dosyalanamadı.',
  'verify.statusMeans': 'Her durumun anlamı',
  'verify.tierTitle': 'Doğrulama seviyesi',
  'verify.tierAll': 'Doğrulanmış · tüm temel belgeler onaylandı',
  'verify.tierSome': 'Doğrulanmış · belgeler onaylandı',
  'verify.tierNone': 'Henüz doğrulanmadı',
  'verify.tierAllBody': 'Bu sayfadaki her temel belge türü bir inceleyici tarafından onaylandı.',
  'verify.tierSomeBody':
    'En az bir belge onaylandı{n}; kalan temel türler profili güçlendirir.',
  'verify.tierNoneBody': 'Henüz hiçbir belge onaylanmadı, bu yüzden alıcılara şirketiniz için doğrulama rozeti gösterilmiyor.',
  'verify.tierHint':
    'Hesabınızın taşıdığı seviyeyi inceleme ekibi onaylanan belgelerden belirler — bu ekran API’nin döndürdüğü belge durumlarını bildirir ve kendi başına bir seviye numarası hesaplamaz. Alıcılar rozeti yalnızca onaylanmış belgeler için görür.',
  'verify.suggested': 'Önerilen sonraki:',
  'verify.select': 'Seç',
  'verify.othersNote':
    'Alıcılar diğer tedarikçilerin puanlarını ve denetim sayılarını da profillerinde görür. Bu rakamlar bu kontrol listesinin ürettiği değil, pazar yerinin örnek verisidir — bu sayfa bilinçli olarak hiçbirini göstermez.',
  'verify.help.missing.title': 'Dosyalanmadı',
  'verify.help.missing.state': 'Henüz bir şey dosyalanmadı veya belge hiç gönderilmedi.',
  'verify.help.submitted.title': 'İnceleme bekliyor',
  'verify.help.submitted.state': 'Dosyalandı ve inceleme kuyruğunda bekliyor. Alıcılara henüz rozet gösterilmiyor.',
  'verify.help.approved.title': 'Onaylandı',
  'verify.help.approved.state': 'Bir inceleyici belgenin kendisiyle karşılaştırarak kontrol etti. Alıcıların gördüğü budur.',
  'verify.help.rejected.title': 'Geri gönderildi',
  'verify.help.rejected.state': 'Notla reddedildi. Belgeyi düzeltip yeniden gönderin.',
  'verify.doc.businessLicence': 'Ticaret sicil belgesi',
  'verify.doc.taxCertificate': 'Vergi levhası',
  'verify.doc.factoryAudit': 'Fabrika denetim raporu',
  'verify.doc.productCert': 'Ürün sertifikası',
  'verify.doc.exportLicence': 'İhracat lisansı',
};

const ar: Partial<Record<DictKey, string>> = {
  'status.open': 'مفتوح',
  'status.quoted': 'تم تقديم عرض',
  'status.closed': 'مغلق',
  'status.submitted': 'مُرسل',
  'status.accepted': 'مقبول',
  'status.rejected': 'مرفوض',
  'status.active': 'نشط',
  'status.sold_out': 'نفدت الكمية',
  'status.scheduled': 'مجدول',
  'status.in_progress': 'قيد التنفيذ',
  'status.passed': 'ناجح',
  'status.failed': 'فاشل',
  'status.pending': 'قيد الانتظار',
  'status.paid': 'مدفوع',
  'status.shipped': 'تم الشحن',
  'status.delivered': 'تم التسليم',
  'status.cancelled': 'ملغى',
  'status.missing': 'لم يُودع',
  'status.approved': 'معتمد',
  'status.countered': 'تم الرد بعرض مضاد',
  'status.withdrawn': 'مسحوب',
  'status.inspecting': 'التفتيش جارٍ',

  'action.close': 'إغلاق',
  'action.cancel': 'إلغاء',
  'action.dismiss': 'تجاهل',
  'action.refresh': 'تحديث',
  'action.refreshing': 'جارٍ التحديث…',
  'action.tryAgain': 'إعادة المحاولة',
  'action.clear': 'مسح',
  'action.clearFilters': 'مسح المرشحات',
  'action.search': 'بحث',
  'action.save': 'حفظ التغييرات',
  'action.discard': 'تراجع',
  'action.signIn': 'تسجيل الدخول',
  'action.signOut': 'تسجيل الخروج',
  'action.signingIn': 'جارٍ تسجيل الدخول…',
  'action.joinFree': 'انضم مجانًا',
  'action.createAccount': 'إنشاء حساب',
  'action.creatingAccount': 'جارٍ إنشاء الحساب…',
  'action.backToExplore': 'العودة إلى الاستكشاف',
  'action.open': 'فتح',
  'action.edit': 'تعديل',
  'action.delete': 'حذف',

  'common.loading': 'جارٍ التحميل…',
  'common.loadingEllipsis': 'جارٍ التحميل…',
  'common.notSet': 'غير محدد',
  'common.optional': 'اختياري',
  'common.required': 'مطلوب',
  'common.newestFirst': 'الأحدث أولًا',
  'common.anyCountry': 'أي بلد',
  'common.allCountries': 'كل البلدان',
  'common.verified': 'موثّق',
  'common.tradeAbbrev':
    'RFQ = طلب عرض سعر · MOQ = الحد الأدنى لكمية الطلب · FOB = التسليم على ظهر السفينة · TT = حوالة مصرفية',

  'nav.feed': 'الرئيسية',
  'nav.explore': 'استكشاف',
  'nav.exploreStock': 'استكشاف المخزون',
  'nav.offersBuyer': 'عروضي',
  'nav.rfqs': 'طلبات عروض الأسعار',
  'nav.orders': 'الطلبات',
  'nav.shipments': 'الشحنات',
  'nav.messages': 'الرسائل',
  'nav.saved': 'المحفوظات',
  'nav.savedLots': 'الدفعات المحفوظة',
  'nav.notifications': 'الإشعارات',
  'nav.help': 'مركز المساعدة',
  'nav.helpCentre': 'مركز المساعدة',
  'nav.howItWorks': 'كيف يعمل الموقع',
  'nav.profile': 'الملف الشخصي',
  'nav.listings': 'إعلاناتي',
  'nav.post': 'نشر مخزون',
  'nav.postStock': 'نشر مخزون',
  'nav.offersSup': 'العروض',
  'nav.rfqOpps': 'فرص طلبات عروض الأسعار',
  'nav.verification': 'التوثيق',
  'nav.suppliers': 'الموردون',
  'nav.overview': 'نظرة عامة',
  'nav.adminSuppliers': 'الموردون',
  'nav.adminVerify': 'مكتب التوثيق',
  'nav.adminListings': 'الإعلانات',
  'nav.adminRfqs': 'طلبات عروض الأسعار',
  'nav.adminPayments': 'المدفوعات',
  'nav.sources': 'مصادر التوريد',
  'nav.growth': 'اللافتات والعروض الترويجية',
  'nav.features': 'الميزات',

  'topbar.searchPlaceholder': 'ابحث عن منتجات أو موردين أو فئات…',
  'topbar.searchAria': 'البحث في السوق',
  'topbar.notifications': 'الإشعارات',
  'topbar.createAccountTitle': 'إنشاء حساب',
  'topbar.account': 'الحساب',
  'topbar.languageAria': 'لغة الواجهة',
  'rail.allIndustries': 'كل القطاعات',
  'rail.howItWorks': 'كيف يعمل الموقع',
  'sidebar.moreIndustries': 'قطاعات أكثر. بلدان أكثر.',
  'sidebar.moreIndustriesSub': 'سوق واحد للمخزون الجاهز.',

  'gate.title': 'وصول الأعضاء',
  'gate.body':
    'التواصل مع الموردين ونشر الطلبات وتقديم عروض الأسعار كلها إجراءات للأعضاء. تصفح السوق يبقى مجانيًا ومتاحًا للجميع.',
  'gate.createAccount': 'أنشئ حسابًا مجانيًا',
  'gate.haveAccount': 'لديّ حساب بالفعل',

  'cards.noPhoto': 'لا توجد صورة',
  'cards.moq': 'MOQ',
  'cards.saveLot': 'حفظ هذه الدفعة',
  'cards.demo': 'تجريبي',
  'cards.demoTitle': 'بيانات تجريبية — ليست عرضًا حقيقيًا',
  'cards.inspections': 'عمليات تفتيش',

  'auth.signIn.sub': 'الوصول إلى طلباتك وعروضك وطلبات عروض الأسعار.',
  'auth.email': 'البريد الإلكتروني',
  'auth.password': 'كلمة المرور',
  'auth.signInCta': 'تسجيل الدخول',
  'auth.newHere': 'جديد هنا؟',
  'auth.demoNotice': 'تنبيه تجريبي',
  'auth.seededLogin': 'حساب مراجعة تجريبي',
  'auth.fillIn': 'تعبئة',
  'auth.demoHintLead': 'هو',
  'auth.demoHintLead2': 'تجريبي',
  'auth.demoHintTail':
    'حساب تجريبي لمراجعة لوحة الإدارة. ليس بائعًا حقيقيًا — لا تُدخل بيانات اعتماد حقيقية.',
  'auth.demoHintProduct': 'مدير',
  'auth.signInFailed': 'فشل تسجيل الدخول',
  'auth.signUp.title': 'إنشاء حساب',
  'auth.signUp.sub': 'حساب واحد للشراء أو البيع أو تقديم خدمات التفتيش والخدمات اللوجستية.',
  'auth.fullName': 'الاسم الكامل',
  'auth.workEmail': 'بريد العمل الإلكتروني',
  'auth.minChars': '8 أحرف على الأقل',
  'auth.atLeast8': '8 أحرف على الأقل.',
  'auth.iAmA': 'أنا…',
  'auth.company': 'الشركة',
  'auth.country': 'البلد',
  'auth.countryHint': 'تركيا، الصين…',
  'auth.createCta': 'إنشاء الحساب',
  'auth.alreadyRegistered': 'مسجل بالفعل؟',
  'auth.signUpHint': 'النشر مجاني. شارات الثقة تُكتسب بالتوثيق والتفتيش وسجل التسليم.',
  'auth.registerFailed': 'فشل التسجيل',
  'auth.role.buyer': 'مشترٍ',
  'auth.role.buyerHint': 'أبحث عن منتجات',
  'auth.role.supplier': 'مورّد',
  'auth.role.supplierHint': 'أبيع / أُصنّع',
  'auth.role.inspector': 'مفتش',
  'auth.role.inspectorHint': 'أفحص المصانع',
  'auth.role.lab': 'مختبر',
  'auth.role.labHint': 'أختبر المواد',
  'auth.role.logistics': 'لوجستيات',
  'auth.role.logisticsHint': 'أنقل البضائع',

  'profile.title': 'الملف الشخصي',
  'profile.sub': 'البيانات التي يراها الطرف الآخر في عروضك وطلباتك ورسائلك.',
  'profile.signInSub': 'سجّل الدخول لإدارة حسابك',
  'profile.notSignedIn': 'لم تسجّل الدخول',
  'profile.notSignedInBody': 'ملفك الشخصي خاص بحسابك: سجّل الدخول لعرضه وتعديله.',
  'profile.createAccount': 'إنشاء حساب',
  'profile.accountDetails': 'بيانات الحساب',
  'profile.unsaved': 'تغييرات غير محفوظة',
  'profile.fullName': 'الاسم الكامل',
  'profile.company': 'الشركة',
  'profile.notSet': 'غير محدد',
  'profile.country': 'البلد',
  'profile.language': 'لغة الواجهة',
  'profile.languageHint': 'تغيّر لغة الواجهة فورًا وتُحفظ في حسابك عند الضغط على حفظ التغييرات.',
  'profile.save': 'حفظ التغييرات',
  'profile.saving': 'جارٍ الحفظ…',
  'profile.saved': 'تم الحفظ',
  'profile.savedBody': 'تم تحديث ملفك الشخصي.',
  'profile.identity': 'الهوية',
  'profile.identityNote':
    'لا يمكن تعديل البريد الإلكتروني والدور هنا. يُثبَّتان عند إنشاء الحساب ولا يقبلهما واجهة الملف الشخصي.',
  'profile.email': 'البريد الإلكتروني',
  'profile.role': 'الدور',
  'profile.readOnly': 'للقراءة فقط',
  'profile.readOnlyEmail': 'للقراءة فقط — واجهة الملف الشخصي لا تقبل البريد الإلكتروني',
  'profile.readOnlyRole': 'للقراءة فقط — واجهة الملف الشخصي لا تقبل الدور',
  'profile.emailStatus': 'حالة البريد الإلكتروني',
  'profile.emailVerified': 'البريد الإلكتروني موثّق',
  'profile.emailNotVerified': 'البريد الإلكتروني غير موثّق',
  'profile.memberSince': 'عضو منذ',
  'profile.accountLine': 'الحساب #{id} · مسجّل الدخول بصفة {role}',
  'profile.errName': 'أدخل اسمك — الواجهة ترفض الاسم الفارغ.',
  'profile.errSave': 'تعذّر حفظ الملف الشخصي — أعد المحاولة.',

  'explore.title': 'استكشاف المخزون',
  'explore.subLoading': 'جارٍ تحميل الدفعات المتاحة…',
  'explore.subCount': '{n} إعلانًا مطابقًا لمرشحاتك',
  'explore.searchPlaceholder': 'كاثود النحاس، مضخات…',
  'explore.searchAria': 'البحث في الإعلانات',
  'explore.categoryAria': 'الفئة',
  'explore.allCategories': 'كل الفئات',
  'explore.originAria': 'بلد المنشأ',
  'explore.allCountries': 'كل البلدان',
  'explore.min': 'الحد الأدنى $',
  'explore.max': 'الحد الأعلى $',
  'explore.emptyTitle': 'لا توجد إعلانات مطابقة لهذه المرشحات',
  'explore.emptyBody': 'جرّب فئة أوسع أو بلد منشأ مختلفًا، أو امسح المرشحات.',
  'explore.page': 'الصفحة {page} من {pages}',
  'explore.prev': '→ السابق',
  'explore.next': 'التالي ←',

  'feed.welcomeBack': 'مرحبًا بعودتك، {name}',
  'feed.title': 'تدفق السوق',
  'feed.sub': 'مخزون جاهز ودفعات فائضة من مصانع موثّقة — الأحدث أولًا.',
  'feed.sellStock': 'بِع مخزونًا',
  'feed.postRequest': 'انشر طلبًا',
  'feed.lotsCount': '{n} دفعة',
  'feed.lotsMatch': 'دفعة تطابق مرشحاتك',
  'feed.verifiedSuppliers': 'مورد موثّق',
  'feed.openRequests': 'طلب مفتوح',
  'feed.allOrigins': 'كل بلدان المنشأ',
  'feed.searchAria': 'البحث في الدفعات',
  'feed.minAria': 'أدنى سعر',
  'feed.maxAria': 'أعلى سعر',
  'feed.allIndustries': 'كل القطاعات',
  'feed.noLots': 'لا توجد دفعات',
  'feed.shownRange': '{first}–{last} من {total}',
  'feed.emptyTitle': 'لا توجد دفعات مطابقة لهذه المرشحات',
  'feed.emptyBody': 'جرّب قطاعًا آخر أو بلد منشأ مختلفًا، أو امسح المرشحات.',
  'feed.lookingFor': 'تبحث عن شيء محدد؟',
  'feed.postRequestLink': 'انشر طلبًا',
  'feed.lookingForTail': 'ودع المصانع الموثّقة تقدّم لك عروضها.',
  'feed.sellingInstead': 'تريد البيع بدلًا من ذلك؟',
  'feed.listYourStock': 'اعرض مخزونك',
  'feed.signedInAs': 'مسجّل الدخول بصفة {role}',
  'feed.createFree': 'أنشئ حسابًا مجانيًا',

  'help.title': 'كيف يعمل FactoryDepo',
  'help.sub': 'مخزون جاهز، وطلبات عروض أسعار، وتوريد مدعوم بالتفتيش.',
  'help.buying': 'الشراء',
  'help.buying1.title': '1. تصفّح المخزون الجاهز.',
  'help.buying1':
    'كل دفعة متاحة تعرض سعرها والحد الأدنى لكمية الطلب وبلد المنشأ والكمية المتاحة فعليًا. الإعلانات المعلّمة بـ «تجريبي» بيانات تجريبية — وليست عروضًا حقيقية — وموسومة حتى لا تُضلَّل.',
  'help.buying2.title': '2. اطلب عرض سعر.',
  'help.buying2':
    'انشر طلبًا يوضح ما تحتاجه. يقدّم الموردون عرضًا بالسعر ومدة التنفيذ وشروطهم.',
  'help.buying3.title': '3. قارن ثم التزم.',
  'help.buying3': 'تظهر العروض جنبًا إلى جنب على الطلب. قبول أحدها يُنشئ طلب شراء.',
  'help.buying4.title': '4. ادفع بحوالة مصرفية.',
  'help.buying4':
    'التجارة الصناعية لا تعمل بالبطاقات. تستلم فاتورة أولية، وتسدد بحوالة TT، ويُعلَّم الطلب مدفوعًا بعد تأكيد الأموال.',
  'help.selling': 'البيع',
  'help.selling1.title': '1. أنشئ حساب مورّد.',
  'help.selling1': 'التسجيل كمورّد ينشئ ملف شركتك فورًا.',
  'help.selling2.title': '2. انشر مخزونك.',
  'help.selling2':
    'أدوات النشر قيد التطوير الآن — وإلى أن تصدر، يضيف فريقنا إعلانات الموردين أثناء التسجيل.',
  'help.selling3.title': '3. قدّم عروضًا على الطلبات الواردة.',
  'help.selling3':
    'تظهر طلبات المشترين المفتوحة في لوحتك مع عدد مباشر لما لم تجب عليه.',
  'help.selling4.title': '4. وثّق حسابك.',
  'help.selling4':
    'مستويات التوثيق تفتح الظهور. لا تُمنح الشارات إلا بعد اعتماد المستندات، لذا للشارة هنا معنى.',
  'help.notLive': 'ما لم يُطلق بعد',
  'help.notLiveLead': 'نفضّل قول ذلك بصراحة بدلًا من أن تكتشفه بنفسك:',
  'help.notLive1': 'أدوات نشر الموردين الذاتية قيد التطوير.',
  'help.notLive2': 'المراسلة بين المشتري والمورد غير متاحة بعد — استخدم بيانات الاتصال في ملف المورد.',
  'help.notLive3': 'العروض والعروض المضادة تُدار يدويًا في الوقت الحالي.',
  'help.notLive4': 'تتبع الشحنات ومعالجة المستندات غير مبنيين بعد.',
  'help.exploreCta': 'استكشاف المخزون',
  'help.rfqCta': 'طلبات عروض الأسعار',

  'soon.sub': 'لم يُبنَ بعد',
  'soon.title': 'هذا العرض ضمن مرحلة التطوير التالية',
  'soon.body': 'الشاشة موجودة في التنقل، لكن جداول بياناتها ونقاط واجهة البرمجة لم تُبنَ بعد.',
  'soon.note.offers': 'يصل جدول العروض والعروض المضادة في مرحلة التطوير التالية.',
  'soon.note.shipments': 'تصل مراحل الشحن ومستنداته في مرحلة التطوير التالية.',
  'soon.note.messages': 'تصل مراسلة المشتري ↔ المورّد في مرحلة التطوير التالية.',
  'soon.note.saved': 'تصل الدفعات المحفوظة في مرحلة التطوير التالية.',
  'soon.note.notifications': 'يصل مركز الإشعارات في مرحلة التطوير التالية.',
  'soon.note.profile': 'يصل تعديل الملف الشخصي في مرحلة التطوير التالية.',
  'soon.note.listings': 'تصل إدارة إعلانات المورّد مع التحقق من الملكية في مرحلة التطوير التالية.',
  'soon.note.post': 'يصل إنشاء/تعديل الإعلان مع رفع الصور في مرحلة التطوير التالية.',
  'soon.note.generic': 'يصل في مرحلة التطوير التالية.',
  'soon.note.verification': 'تصل مستويات التوثيق وتقديم المستندات في مرحلة التطوير التالية.',
  'soon.note.admin': 'تصل لوحة الإدارة في مرحلة التطوير التالية.',
  'soon.note.sources': 'يصل الإدخال اليدوي للموردين في مرحلة التطوير التالية.',
  'soon.note.features': 'تصل مفاتيح الميزات في مرحلة التطوير التالية.',

  'orders.title': 'الطلبات',
  'orders.signInSub': 'سجّل الدخول لعرض الطلبات التي أنت طرف فيها',
  'orders.notSignedIn': 'لم تسجّل الدخول',
  'orders.notSignedInBody': 'الطلبات خاصة: سجّل الدخول لترى ما التزمت بشرائه أو بيعه.',
  'orders.createAccount': 'إنشاء حساب',
  'orders.subSupplier': 'الطلبات التي قدّمها المشترون على مخزونك',
  'orders.subBuyer': 'كل ما التزمت بشرائه',
  'orders.statListings': 'إعلاناتي',
  'orders.statOffersReceived': 'العروض المستلمة',
  'orders.statOffersOnRfqs': 'عروض على طلباتي',
  'orders.statOrders': 'الطلبات',
  'orders.statSoldItems': 'الأصناف المبيعة',
  'orders.statSoldTitle': 'الطلبات المشحونة أو المسلّمة',
  'orders.statViews': 'المشاهدات · غير متتبَّعة بعد',
  'orders.statViewsTitle': 'تتبع المشاهدات غير مطبَّق بعد',
  'orders.metricsError': 'تعذّر تحميل المؤشرات الآن.',
  'orders.loadErrorTitle': 'تعذّر تحميل الطلبات',
  'orders.loadErrorBody': 'لم تُرجع الواجهة طلباتك. حدّث الصفحة أو سجّل الدخول مرة أخرى.',
  'orders.emptyTitle': 'لا توجد طلبات بعد',
  'orders.emptySupplier': 'عندما يطلب مشترٍ من مخزونك يظهر الطلب هنا.',
  'orders.emptyBuyer': 'طلبات الشراء الفوري التي تقدّمها على المخزون الجاهز تظهر هنا.',
  'orders.browseStock': 'تصفّح المخزون الجاهز',
  'orders.postRfq': 'انشر طلب عرض سعر',
  'orders.count': '{n} طلبًا',
  'orders.col.order': 'الطلب',
  'orders.col.product': 'المنتج',
  'orders.col.counterparty': 'الطرف الآخر',
  'orders.col.qty': 'الكمية',
  'orders.col.total': 'الإجمالي',
  'orders.col.status': 'الحالة',
  'orders.col.date': 'التاريخ',
  'orders.buyerLabel': 'مشترٍ',
  'orders.supplierLabel': 'مورّد',
  'orders.buyerId': 'المشتري #{id}',

  'product.loadingTitle': 'جارٍ التحميل…',
  'product.loadingThis': 'هذا الإعلان',
  'product.fetching': 'جارٍ إحضار {what}…',
  'product.notFound': 'المنتج غير موجود',
  'product.backToExplore': 'العودة إلى الاستكشاف',
  'product.noPhoto': 'لا توجد صورة لهذه الدفعة',
  'product.pricePer': 'السعر / {unit}',
  'product.minOrder': 'الحد الأدنى للطلب',
  'product.availableNow': 'المتاح الآن',
  'product.origin': 'بلد المنشأ',
  'product.unavailable': 'غير متاح حاليًا',
  'product.buyNowHeading': 'اشترِ الآن — مخزون جاهز',
  'product.soldOutBody': 'هذه الدفعة معلّمة كنفدت الكمية. اطلب من المورد الدفعة التالية.',
  'product.noUnitsBody': 'لا توجد وحدات متاحة الآن. اطلب من المورد الدفعة التالية.',
  'product.purchaseTerms': 'اشترِ بسعر الإعلان {price} لكل {unit}، بحد أدنى {moq} {unit}.',
  'product.stockOnHand': 'المخزون المتوفر',
  'product.buyNowPrice': 'اشترِ الآن · {price}/{unit}',
  'product.outOfStock': 'اشترِ الآن — نفدت الكمية',
  'product.requestQuote': 'اطلب عرض سعر',
  'product.shipsFrom': 'يُشحن من {country}',
  'product.signInToOrder': 'سجّل الدخول للشراء أو لطلب عرض سعر.',
  'product.supplier': 'المورّد',
  'product.viewProfile': 'عرض الملف',
  'product.loadingSupplier': 'جارٍ تحميل بيانات المورّد…',
  'product.supplierUnavailable': 'بيانات المورّد غير متاحة.',
  'product.rating': 'التقييم',
  'product.inspections': 'عمليات التفتيش',
  'product.fulfilment': 'التسليم في الموعد',
  'product.verifiedLevel': 'مستوى التوثيق',
  'product.levelN': 'المستوى {n}',
  'product.tradingSince': 'يعمل منذ',
  'product.supplierFiguresHint': 'الأرقام على مستوى السوق لهذا المورّد، وليست لهذه الدفعة فقط.',
  'product.description': 'الوصف',
  'product.noDescription': 'لم يضف المورّد وصفًا. اطلب عرض سعر للمواصفات ومدة التنفيذ وشروط التسليم.',
  'product.specification': 'المواصفات',
  'product.noSpec': 'لا توجد مواصفات مسجلة لهذه الدفعة.',
  'product.col.attribute': 'الخاصية',
  'product.col.value': 'القيمة',
  'product.spec.category': 'الفئة',
  'product.spec.unit': 'الوحدة',
  'product.spec.purity': 'النقاء / الدرجة',

  'checkout.title': 'اشترِ الآن — إتمام الطلب',
  'checkout.placedTitle': 'تم تقديم الطلب',
  'checkout.confirmed': 'تم تأكيد الطلب #{id}',
  'checkout.notified': 'تم إبلاغ المورّد. تابع الطلب من صفحة الطلبات.',
  'checkout.viewOrders': 'عرض الطلبات',
  'checkout.keepBrowsing': 'متابعة التصفح',
  'checkout.pricePer': 'السعر / {unit}',
  'checkout.minimumOrder': 'الحد الأدنى للطلب',
  'checkout.availableNow': 'المتاح الآن',
  'checkout.quantity': 'الكمية ({unit})',
  'checkout.qtyHint': 'بين {moq} و{stock} {unit} في المخزون.',
  'checkout.fullName': 'الاسم الكامل',
  'checkout.country': 'البلد',
  'checkout.address': 'العنوان',
  'checkout.city': 'المدينة',
  'checkout.phone': 'الهاتف',
  'checkout.notes': 'ملاحظات للمورّد',
  'checkout.total': 'الإجمالي {total}',
  'checkout.placeOrder': 'تأكيد الطلب · {total}',
  'checkout.placing': 'جارٍ تقديم الطلب…',
  'checkout.errPlace': 'تعذّر تقديم الطلب.',

  'rfqModal.title': 'اطلب عرض سعر',
  'rfqModal.postedTitle': 'تم نشر الطلب',
  'rfqModal.live': 'متطلبك منشور الآن في منصة طلبات عروض الأسعار',
  'rfqModal.canQuote': 'يمكن للموردين الموثّقين الآن تقديم السعر ومدة التنفيذ.',
  'rfqModal.viewMine': 'عرض طلباتي',
  'rfqModal.listedBy': '{product} · معروض من {supplier}',
  'rfqModal.quantity': 'الكمية',
  'rfqModal.unit': 'الوحدة',
  'rfqModal.specs': 'المواصفات والشهادات وشروط التسليم',
  'rfqModal.moqHint': 'الحد الأدنى لكمية الطلب في الإعلان هو {moq} {unit}.',
  'rfqModal.post': 'نشر الطلب',
  'rfqModal.posting': 'جارٍ النشر…',
  'rfqModal.errPost': 'تعذّر نشر الطلب.',
  'rfqModal.titleSuffix': 'طلب عرض سعر',

  'suppliers.loadingSub': 'جارٍ إحضار دليل الموردين',
  'suppliers.loadingBody': 'جارٍ إحضار دليل الموردين…',
  'suppliers.title': 'دليل الموردين',
  'suppliers.sub':
    'المصانع والشركات التجارية على FactoryDepo. مستويات التوثيق تأتي من التفتيش الميداني وفحص المستندات.',
  'suppliers.demoNote': 'الصفوف المعلّمة بـ «تجريبي» بيانات تجريبية',
  'suppliers.loadErrorTitle': 'تعذّر تحميل الدليل',
  'suppliers.loadErrorBody': 'لم تستجب خدمة الموردين. أعد المحاولة بعد قليل.',
  'suppliers.emptyTitle': 'لا يوجد موردون بعد',
  'suppliers.emptyBody': 'تظهر ملفات الموردين هنا بعد تسجيلهم وتوثيقهم.',
  'suppliers.totalListed': 'الموردون المدرجون',
  'suppliers.totalVerified': 'موثّقون بمستوى 2+',
  'suppliers.avgRating': 'متوسط التقييم',
  'suppliers.avgRatingRated': 'متوسط التقييم ({n} مُقيَّم)',
  'suppliers.avgFulfilment': 'التسليم في الموعد',
  'suppliers.avgFulfilmentMeasured': 'التسليم في الموعد ({n} مقيس)',
  'suppliers.searchPlaceholder': 'شركة، بلد، مدينة، قدرة…',
  'suppliers.searchAria': 'البحث عن موردين',
  'suppliers.verifiedOnly': 'الموثّقون فقط',
  'suppliers.showing': 'عرض {shown} من {total}',
  'suppliers.noMatchTitle': 'لا يوجد موردون مطابقون لهذا البحث',
  'suppliers.noMatchBody': 'جرّب اسم شركة أقصر أو امسح مرشح التوثيق.',
  'suppliers.rating': 'التقييم',
  'suppliers.inspections': 'عمليات التفتيش',
  'suppliers.fulfilment': 'الوفاء بالتسليم',

  'supplierDetail.loadingThis': 'ملف هذا المورّد',
  'supplierDetail.notFound': 'المورّد غير موجود',
  'supplierDetail.backToDirectory': 'العودة إلى الدليل',
  'supplierDetail.backShort': '← العودة إلى الدليل',
  'supplierDetail.tradingSince': 'يعمل منذ {year}',
  'supplierDetail.verifiedL3': 'موثّق · المستوى 3',
  'supplierDetail.registered': 'مسجّل',
  'supplierDetail.buyerRating': 'تقييم المشترين',
  'supplierDetail.notRated': 'لا يوجد تقييم بعد',
  'supplierDetail.inspections': 'عمليات التفتيش الميداني',
  'supplierDetail.fulfilment': 'التسليم في الموعد',
  'supplierDetail.activeListings': 'الإعلانات النشطة',
  'supplierDetail.tier': 'مستوى التوثيق',
  'supplierDetail.trustScore': 'درجة الثقة (0–100)',
  'supplierDetail.about': 'عن {company}',
  'supplierDetail.noDescription': 'لم ينشر هذا المورّد وصفًا للشركة بعد.',
  'supplierDetail.capabilities': 'القدرات المعلنة',
  'supplierDetail.record': 'التوثيق والسجل',
  'supplierDetail.ratingLabel': 'تقييم المشترين',
  'supplierDetail.inspectionsDone': 'عمليات التفتيش المكتملة',
  'supplierDetail.contact': 'التواصل',
  'supplierDetail.contactBody': 'تُشارك تقارير التفتيش ومستندات التوثيق مع الأعضاء بعد أول تواصل.',
  'supplierDetail.contactSupplier': 'تواصل مع المورّد',
  'supplierDetail.contactHintSignedIn': 'يفتح منصة طلبات عروض الأسعار — محادثة العرض تجري هناك.',
  'supplierDetail.contactHintGuest': 'للأعضاء فقط · الانضمام مجاني',
  'supplierDetail.services': 'الخدمات التجارية',
  'supplierDetail.service1': 'تفتيش المصنع قبل الدفع',
  'supplierDetail.service2': 'الاختبار المختبري وتحليل المواد',
  'supplierDetail.service3': 'الإشراف على تحميل الحاويات',
  'supplierDetail.service4': 'دعم مستندات التصدير',
  'supplierDetail.stockFrom': 'مخزون {company}',
  'supplierDetail.shown': '{n} معروض',
  'supplierDetail.loadingLots': 'جارٍ تحميل الدفعات المتاحة…',
  'supplierDetail.noneShown': 'لا توجد إعلانات نشطة معروضة',
  'supplierDetail.noneShownBody':
    'تُبلغ الواجهة عن {n} إعلانًا لهذا المورّد، لكن لم يصل أي منها في عرض الإعلانات الحالي. انشر طلبًا عبر منصة طلبات عروض الأسعار للسؤال عن كتالوجهم.',

  'rfq.titleSupplier': 'فرص طلبات عروض الأسعار',
  'rfq.titleBuyer': 'الطلبات',
  'rfq.subSupplier': 'متطلبات مفتوحة نشرها المشترون. ردّ بسعرك ومدة التنفيذ.',
  'rfq.subBuyer': 'المتطلبات الحالية في المنصة، الأحدث أولًا. افتح أحدها لرؤية العروض المستلمة.',
  'rfq.postRequest': '+ انشر طلبًا',
  'rfq.buyerOnlyNotice': 'حسابات المشترين فقط يمكنها نشر طلب. سجّل الدخول بملف مشترٍ للنشر.',
  'rfq.total': 'إجمالي الطلبات',
  'rfq.open': 'مفتوح',
  'rfq.quoted': 'بعرض سعر',
  'rfq.closed': 'مغلق',
  'rfq.quoteable': 'طلبات يمكنك تقديم عرض عليها',
  'rfq.allRequests': 'كل الطلبات',
  'rfq.shown': '{n} معروض',
  'rfq.statusAll': 'الكل',
  'rfq.statusOpenCount': 'مفتوح ({n})',
  'rfq.statusQuotedCount': 'بعرض سعر ({n})',
  'rfq.quotingCloses': 'يُغلق تقديم العروض عندما يقبل المشتري عرضًا.',
  'rfq.emptyNone': 'لا توجد طلبات بعد',
  'rfq.emptyNoMatch': 'لا شيء يطابق هذا المرشح',
  'rfq.emptyNoneSupplier': 'لا توجد متطلبات مفتوحة في المنصة الآن.',
  'rfq.emptyNoneBuyer': 'انشر متطلبك الأول وسيردّ عليك مصانع موثّقة.',
  'rfq.emptyNoMatchHint': 'جرّب مرشح حالة مختلفًا.',
  'rfq.col.requirement': 'المتطلب',
  'rfq.col.quantity': 'الكمية',
  'rfq.col.deliverTo': 'التسليم إلى',
  'rfq.col.quotes': 'العروض',
  'rfq.col.posted': 'تاريخ النشر',
  'rfq.col.status': 'الحالة',
  'rfq.openAria': 'افتح طلب عرض السعر #{id}',
  'rfq.requestRef': '{category} · طلب #{id}',
  'rfq.quotesCount': '{n} عرضًا',
  'rfq.postingBuyerOnly': 'النشر إجراء خاص بالمشتري. يمكن للموردين',
  'rfq.quoteOpen': 'تقديم عروض على المتطلبات المفتوحة',
  'rfq.newTitle': 'طلب عرض سعر جديد',
  'rfq.whatNeed': 'ما الذي تحتاجه؟',
  'rfq.titlePlaceholder': 'مثال: 100 طن متري كاثود نحاس، درجة A',
  'rfq.category': 'الفئة',
  'rfq.deliverTo': 'التسليم إلى',
  'rfq.quantity': 'الكمية',
  'rfq.unit': 'الوحدة',
  'rfq.specification': 'المواصفات',
  'rfq.specPlaceholder': 'الدرجة، النقاء، الشهادات، شروط التجارة الدولية، التغليف…',
  'rfq.specHint': 'كلما كانت المواصفات أوضح، أسرع المصانع الموثّقة في تقديم العروض.',
  'rfq.errTitle': 'أعطِ الطلب عنوانًا واضحًا — 5 أحرف على الأقل.',
  'rfq.errQuantity': 'يجب أن تكون الكمية رقمًا أكبر من صفر.',
  'rfq.errPost': 'تعذّر نشر هذا الطلب.',

  'rfqDetail.loadingTitle': 'الطلب',
  'rfqDetail.loadingSub': 'جارٍ التحميل…',
  'rfqDetail.title': 'الطلب',
  'rfqDetail.notFound': 'الطلب غير موجود',
  'rfqDetail.notFoundBody': 'قد يكون هذا المتطلب مسحوبًا، أو الرابط غير صحيح.',
  'rfqDetail.backToRequests': '→ العودة إلى الطلبات',
  'rfqDetail.allRequests': '→ كل الطلبات',
  'rfqDetail.postedOn': 'نُشر في {date}',
  'rfqDetail.requestRef': 'الطلب #{id}',
  'rfqDetail.accepting': 'يستقبل عروض الأسعار',
  'rfqDetail.notAccepting': 'لا يستقبل عروض أسعار جديدة',
  'rfqDetail.noSpec': 'لم تُقدَّم مواصفات إضافية.',
  'rfqDetail.quantity': 'الكمية',
  'rfqDetail.deliverTo': 'التسليم إلى',
  'rfqDetail.quotations': 'عروض الأسعار',
  'rfqDetail.deadline': 'الموعد النهائي',
  'rfqDetail.requestedBy': 'طُلب بواسطة',
  'rfqDetail.received': '{n} مستلم',
  'rfqDetail.noneTitle': 'لا توجد عروض أسعار بعد',
  'rfqDetail.noneBody': 'يراجع موردون موثّقون هذا المتطلب.',
  'rfqDetail.col.supplier': 'المورّد',
  'rfqDetail.col.price': 'السعر',
  'rfqDetail.col.leadTime': 'مدة التنفيذ',
  'rfqDetail.col.notes': 'ملاحظات',
  'rfqDetail.col.sent': 'أُرسل',
  'rfqDetail.col.status': 'الحالة',
  'rfqDetail.trustScore': 'درجة الثقة {n}',
  'rfqDetail.days': '{n} يومًا',
  'rfqDetail.submitTitle': 'قدّم عرض سعر',
  'rfqDetail.supplierAccount': 'حساب مورّد',
  'rfqDetail.fromSupplier': 'تأتي عروض الأسعار من حسابات الموردين. انتقل إلى حساب المورّد للرد على هذا الطلب.',
  'rfqDetail.signInSupplierBody': 'حسابات الموردين المسجّلة فقط يمكنها تقديم عرض. التصفح متاح للجميع.',
  'rfqDetail.supplierOnly': 'حسابات الموردين فقط',
  'rfqDetail.signInAsSupplier': 'سجّل الدخول كمورّد',
  'rfqDetail.closedBody': 'هذا الطلب {status} ولم يعد يستقبل عروض أسعار.',
  'rfqDetail.seeOpen': 'اطّلع على الطلبات المفتوحة',
  'rfqDetail.respondBody': 'ردّ بسعر الوحدة ومدة التنفيذ. ملفك الموثّق يُرفق مع عرض السعر.',
  'rfqDetail.unitPrice': 'سعر الوحدة (USD)',
  'rfqDetail.leadTime': 'مدة التنفيذ (أيام)',
  'rfqDetail.termsNotes': 'الشروط والملاحظات',
  'rfqDetail.termsPlaceholder': 'شروط التجارة الدولية، الدرجة، التغليف، سياسة العينات، الصلاحية…',
  'rfqDetail.compareHint': 'يقارن المشترون السعر ومدة التنفيذ والتوثيق جنبًا إلى جنب.',
  'rfqDetail.submitQuote': 'إرسال عرض السعر',
  'rfqDetail.submitting': 'جارٍ الإرسال…',
  'rfqDetail.errPrice': 'أدخل سعر وحدة أكبر من صفر.',
  'rfqDetail.errLead': 'يجب أن تكون مدة التنفيذ عددًا صحيحًا من الأيام بين 1 و365.',
  'rfqDetail.errSubmit': 'تعذّر إرسال عرض السعر.',

  'listings.title': 'إعلاناتي',
  'listings.sub': 'المخزون الذي نشرته في السوق',
  'listings.signInSub': 'المخزون الذي نشرته في السوق',
  'listings.notSignedIn': 'لم تسجّل الدخول',
  'listings.notSignedInBody': 'إعلاناتك خاصة بحساب المورّد. سجّل الدخول لعرضها وإدارتها.',
  'listings.createSupplierAccount': 'إنشاء حساب مورّد',
  'listings.supplierOnly': 'حسابات الموردين فقط',
  'listings.supplierOnlyBody':
    'حسابك حساب {role}. الإعلانات يديرها المورّد المالك لها، لذا لا شيء لعرضه أو تعديله هنا.',
  'listings.browseStock': 'تصفّح المخزون الجاهز',
  'listings.subLoading': 'جارٍ تحميل مخزونك…',
  'listings.subCount': '{n} إعلانًا منشورًا تحت ملف المورّد الخاص بك',
  'listings.postStock': '+ انشر مخزونًا',
  'listings.lotsPublished': 'دفعة منشورة',
  'listings.viewsNotTracked': 'مشاهدة · غير متتبَّعة بعد',
  'listings.bankTransferNote': 'يدفع المشترون بحوالة مصرفية بعد قبول العرض.',
  'listings.loadErrorTitle': 'تعذّر تحميل إعلاناتك',
  'listings.loadErrorBody': 'تعذّر تحميل إعلاناتك — أعد المحاولة. إذا استمر الفشل، سجّل الدخول مجددًا.',
  'listings.emptyTitle': 'لا توجد إعلانات بعد',
  'listings.emptyBody':
    'انشر دفعتك الأولى — صورة، وسعر وحدة، والكمية التي يمكنك شحنها اليوم. تنشر فورًا في «استكشاف» أمام كل مشترٍ في السوق.',
  'listings.postFirst': '+ انشر دفعتك الأولى',
  'listings.getVerified': 'وثّق حسابك',
  'listings.count': '{n} إعلانًا',
  'listings.col.lot': 'الدفعة',
  'listings.col.category': 'الفئة',
  'listings.col.unitPrice': 'سعر الوحدة',
  'listings.col.moq': 'MOQ',
  'listings.col.available': 'المتاح',
  'listings.col.status': 'الحالة',
  'listings.col.posted': 'تاريخ النشر',
  'listings.lotRef': 'دفعة #{id}',
  'listings.noPhotoInline': 'لا توجد صورة',
  'listings.demoNoteLead': 'الدفعة المعلّمة بـ',
  'listings.demoNoteTail':
    'بيانات تجريبية من السوق، وليست مخزونًا نشرته أنت. حذفها يزيلها للجميع.',
  'listings.updated': 'تم تحديث الإعلان.',
  'listings.deleted': 'تم حذف الإعلان. لم يعد موجودًا في السوق.',
  'listings.deleteTitle': 'حذف هذا الإعلان؟',
  'listings.deleteLead': '{name} — دفعة #{id}',
  'listings.deleteBody':
    'يُحذف هذا الإعلان نهائيًا. يختفي من «استكشاف» ومن جدول إعلاناتك فورًا، ولا يمكن للمشترين الشراء أو التفاوض عليه. لا يمكن التراجع عن ذلك.',
  'listings.deleteKeepBody':
    'لا يمكن حذف دفعة عليها طلبات أو عروض — تحتفظ بها الواجهة للسجل. علّمها كنفدت الكمية بضبط المخزون المتاح على 0.',
  'listings.keepListing': 'الإبقاء على الإعلان',
  'listings.deleteForever': 'حذف نهائي',
  'listings.deleting': 'جارٍ الحذف…',
  'listings.deleteErr': 'تعذّر حذف هذا الإعلان.',
  'listings.editTitle': 'تعديل الإعلان — دفعة #{id}',

  'post.title': 'نشر مخزون',
  'post.titleEdit': 'تعديل الإعلان',
  'post.sub': 'دفعة واحدة لكل إعلان: ما هي، وكم سعرها، وكم يمكنك شحنه اليوم',
  'post.subEdit': 'تعديل الدفعة #{id} — الحفظ يستبدل الإعلان المنشور',
  'post.signInSub': 'اعرض المخزون الجاهز ليتمكن المشترون من الشراء أو التفاوض',
  'post.notSignedIn': 'لم تسجّل الدخول',
  'post.notSignedInBody': 'نشر المخزون إجراء خاص بالمورّد. سجّل الدخول بحساب مورّد لنشر دفعة.',
  'post.createSupplierAccount': 'إنشاء حساب مورّد',
  'post.supplierOnly': 'حسابات الموردين فقط',
  'post.supplierOnlyBody':
    'حسابك حساب {role}، لذا لن تقبل الواجهة إعلانًا منه. يلزم ملف مورّد قبل نشر المخزون.',
  'post.myListings': 'إعلاناتي',
  'post.loadErrorTitle': 'تعذّر تحميل الإعلان',
  'post.loadErrorBody': 'تعذّر تحميل هذه الدفعة — أعد المحاولة، أو ارجع إلى إعلاناتك.',
  'post.details': 'تفاصيل الإعلان',
  'post.newListing': 'إعلان جديد',
  'post.requiredMark': '* مطلوب',
  'post.lotName': 'اسم الدفعة',
  'post.lotNamePlaceholder': 'مثال: كاثود نحاس درجة A، 99.99%',
  'post.category': 'الفئة',
  'post.originCountry': 'بلد المنشأ',
  'post.notStated': 'غير محدد',
  'post.description': 'الوصف',
  'post.descriptionPlaceholder': 'الدرجة، التغليف، شروط التجارة الدولية، مدة التنفيذ، الشهادات…',
  'post.descriptionHint': 'المشترون يقرّرون من هذا النص. اذكر ما تحتويه الدفعة وكيف تُشحن.',
  'post.unitPrice': 'سعر الوحدة',
  'post.currency': 'العملة',
  'post.unit': 'الوحدة',
  'post.moq': 'الحد الأدنى للطلب (MOQ)',
  'post.moqHint': 'القيمة الافتراضية 1.',
  'post.available': 'المتاح الآن',
  'post.availableHint': 'القيمة الافتراضية 0 — المخزون الذي يمكنك شحنه اليوم.',
  'post.purity': 'النقاء / الدرجة',
  'post.purityPlaceholder': '99.99% / درجة A',
  'post.optional': 'اختياري.',
  'post.photoUrl': 'رابط الصورة',
  'post.photoPlaceholder': 'https://…/copper-cathode.jpg',
  'post.photoHintLead': 'رفع الملفات غير مبني بعد.',
  'post.photoHintTail':
    'الصق رابطًا عامًا للصورة وسيُخزَّن كصورة هذه الدفعة. الدفعات بلا صورة تُظهر عنصرًا نائبًا بسيطًا.',
  'post.preview': 'معاينة — إذا لم يظهر شيء، فالرابط ليس صورة مباشرة.',
  'post.save': 'حفظ التغييرات',
  'post.saving': 'جارٍ الحفظ…',
  'post.errName': 'أعطِ الدفعة اسمًا — حرفان على الأقل.',
  'post.errCategory': 'اختر فئة.',
  'post.errUnit': 'حدّد الوحدة التي تبيع بها (طن متري، كجم، قطعة…).',
  'post.errPrice': 'يجب أن يكون سعر الوحدة رقمًا أكبر من صفر.',
  'post.errMoq': 'يجب أن يكون الحد الأدنى للطلب رقمًا أكبر من صفر.',
  'post.errQty': 'لا يمكن أن تكون الكمية المتاحة سالبة.',
  'post.errSave': 'تعذّر حفظ هذا الإعلان.',
  'post.errCreate': 'تعذّر نشر هذا الإعلان.',
  'post.behaviour': 'كيف يعمل هذا الإعلان',
  'post.behaviourBody':
    'تظهر الدفعة المنشورة في «استكشاف» فورًا ويمكن لأي مشترٍ مسجّل شراؤها. وقد يفتح المشترون عرضًا بأقل من سعرك المطلوب؛ تردّ عليها من',
  'post.offersLink': 'العروض',
  'post.provenance': 'المصدر',
  'post.platformListing': 'إعلان على المنصة',
  'post.photo': 'الصورة',
  'post.urlOnly': 'رابط فقط — الرفع غير مبني',
  'post.buyerPaysBy': 'طريقة دفع المشتري',
  'post.bankTransfer': 'حوالة مصرفية',
  'post.noMetrics':
    'لا يعرض أي جزء من هذه الصفحة مشاهدات أو تقييمات أو أعداد طلبات — فهذه الأرقام غير مقيسة بعد، لذا لا تُعرض.',

  'offers.title': 'العروض على مخزونك',
  'offers.sub': 'مشترون يتفاوضون على دفعاتك',
  'offers.signInSub': 'مشترون يتفاوضون على دفعاتك',
  'offers.notSignedIn': 'لم تسجّل الدخول',
  'offers.notSignedInBody': 'العروض خاصة بالمشتري والمورّد المعنيين. سجّل الدخول للرد عليها.',
  'offers.createSupplierAccount': 'إنشاء حساب مورّد',
  'offers.supplierOnly': 'حسابات الموردين فقط',
  'offers.supplierOnlyBody':
    'حسابك حساب {role}، ولا مخزون مدرج تحته لذا لا تصل عروض. العروض التي قدّمتها كمشترٍ موجودة في جانب المشترين من السوق.',
  'offers.browseStock': 'تصفّح المخزون الجاهز',
  'offers.subLoading': 'جارٍ تحميل العروض…',
  'offers.subCount': '{n} عرضًا على إعلاناتك',
  'offers.awaiting': 'بانتظار ردّك',
  'offers.decided': 'محسوم',
  'offers.acceptCreates': 'قبول عرض يُنشئ طلبًا؛ ويدفع المشتري بحوالة مصرفية.',
  'offers.filterAwaiting': 'بانتظار الرد ({n})',
  'offers.filterDecided': 'محسومة ({n})',
  'offers.counterNote': 'العروض المضادة تفتح عرضًا جديدًا مرتبطًا؛ وتبقى شروطك الأصلية في السجل.',
  'offers.loadErrorTitle': 'تعذّر تحميل العروض',
  'offers.loadErrorBody': 'تعذّر تحميل العروض على مخزونك — أعد المحاولة.',
  'offers.emptyTitle': 'لا توجد عروض بعد',
  'offers.emptyBody':
    'عندما يتفاوض مشترٍ على إحدى دفعاتك يظهر هنا بالسعر الذي اقترحه والكمية التي يريدها. يمكنك قبوله أو رفضه أو الرد بسعرك.',
  'offers.seeListings': 'اطّلع على إعلاناتي',
  'offers.postMore': '+ انشر مخزونًا إضافيًا',
  'offers.noneAwaiting': 'لا شيء بانتظار ردّك',
  'offers.noneDecided': 'لا توجد عروض محسومة بعد',
  'offers.noneAwaitingBody': 'تم الرد على كل عرض على مخزونك. انتقل إلى «محسومة» لمراجعتها.',
  'offers.noneDecidedBody': 'تُحفظ هنا العروض التي تقبلها أو ترفضها كسجل.',
  'offers.count': '{n} عرضًا',
  'offers.col.listing': 'الإعلان',
  'offers.col.buyer': 'المشتري',
  'offers.col.quantity': 'الكمية',
  'offers.col.theirPrice': 'سعرهم',
  'offers.col.status': 'الحالة',
  'offers.col.received': 'تاريخ الاستلام',
  'offers.decidedLabel': 'محسوم',
  'offers.counter': 'عرض مضاد',
  'offers.accept': 'قبول',
  'offers.reject': 'رفض',
  'offers.offerRef': 'عرض #{id}',
  'offers.answersOffer': 'يرد على العرض #{id}',
  'offers.demoNoteLead': 'الصف المعلّم بـ',
  'offers.demoNoteTail':
    'يخص دفعة تجريبية لا مخزونًا نشرته أنت. قبوله يُنشئ طلبًا حقيقيًا مع ذلك — تحقق من الدفعة قبل الالتزام.',
  'offers.counterTitle': 'عرض مضاد #{id}',
  'offers.counterBody':
    'قدّم {buyer} عرضًا بقيمة {price} مقابل {qty} على {product}. يصبح ردّك عرضًا جديدًا مرتبطًا؛ وتبقى شروط المشتري في السجل.',
  'offers.counterPrice': 'سعر وحدتك',
  'offers.perUnit': '{currency} لكل وحدة',
  'offers.counterQty': 'الكمية',
  'offers.counterQtyHint': 'اتركها كما هي للإبقاء على كمية المشتري.',
  'offers.counterNotes': 'ملاحظة إلى المشتري',
  'offers.counterNotesPlaceholder': 'مدة التنفيذ، التغليف، شروط التجارة الدولية، صلاحية هذا السعر…',
  'offers.sendCounter': 'إرسال العرض المضاد',
  'offers.sending': 'جارٍ الإرسال…',
  'offers.counterErrPrice': 'يجب أن يكون سعرك المضاد رقمًا أكبر من صفر.',
  'offers.counterErrQty': 'يجب أن تكون الكمية رقمًا أكبر من صفر.',
  'offers.counterErr': 'تعذّر إرسال هذا العرض المضاد.',
  'offers.counterDone': 'تم إرسال العرض المضاد. أصبح العرض الأصلي «تم الرد بعرض مضاد» وتم إبلاغ المشتري.',
  'offers.acceptTitle': 'قبول العرض #{id}؟',
  'offers.listing': 'الإعلان',
  'offers.buyer': 'المشتري',
  'offers.quantity': 'الكمية',
  'offers.unitPrice': 'سعر الوحدة',
  'offers.offerValue': 'قيمة العرض',
  'offers.acceptBodyLead': 'القبول يُنشئ طلبًا.',
  'offers.acceptBodyBank': 'يلتزم به المشتري ويدفع عن طريق',
  'offers.acceptBodyTail':
    '— المنصة لا تستقبل مدفوعات بالبطاقة. أنت تُصدر الفاتورة الأولية وتؤكد الحوالة عند وصولها؛ ثم ينتقل الطلب إلى الشحن. هذا القرار نهائي: لا يمكن إعادة البتّ في عرض مقبول.',
  'offers.acceptCta': 'اقبل وأنشئ الطلب',
  'offers.accepting': 'جارٍ القبول…',
  'offers.acceptErr': 'تعذّر قبول هذا العرض.',
  'offers.acceptDone': 'تم قبول العرض #{id}. أُنشئ طلب لـ {buyer}.',
  'offers.rejectTitle': 'رفض العرض #{id}؟',
  'offers.rejectBody':
    'عرض {buyer} بقيمة {price} على {product} يُغلق. الرفض نهائي — لا يمكن للمشتري إحياء هذا العرض، لكنه قد يفتح عرضًا جديدًا.',
  'offers.rejectCta': 'ارفض العرض',
  'offers.rejecting': 'جارٍ الرفض…',
  'offers.rejectErr': 'تعذّر رفض هذا العرض.',
  'offers.rejectDone': 'تم رفض العرض #{id}.',

  'verify.title': 'التوثيق',
  'verify.sub': 'أودع مستنداتك، وتابع قرار المراجعة، واعرف ما يُقال للمشترين عنها',
  'verify.signInSub': 'مستندات يعتمد عليها المشترون قبل دفع المال',
  'verify.notSignedIn': 'لم تسجّل الدخول',
  'verify.notSignedInBody':
    'مستندات التوثيق تخص حساب مورّد ولا تكون علنية بشكلها الخام أبدًا. سجّل الدخول لإيداعها أو تحديثها.',
  'verify.createSupplierAccount': 'إنشاء حساب مورّد',
  'verify.supplierOnly': 'حسابات الموردين فقط',
  'verify.supplierOnlyBody': 'حسابك حساب {role}، لذا لا توجد قائمة تحقق للمورّد لإكمالها.',
  'verify.seeSuppliers': 'اطّلع على الموردين الموثّقين',
  'verify.approved': 'المستندات المعتمدة',
  'verify.waiting': 'بانتظار المراجع',
  'verify.actionNeeded': 'ناقص أو مُعاد',
  'verify.coreApproved': 'المستندات الأساسية معتمدة',
  'verify.confirmed': 'مؤكد',
  'verify.pending': 'قيد الانتظار',
  'verify.yourDocs': 'مستنداتك',
  'verify.onFile': '{n} في السجل',
  'verify.loadErrorTitle': 'تعذّر تحميل المستندات',
  'verify.loadErrorBody':
    'تعذّر تحميل مستندات التوثيق — أعد المحاولة. إذا استمر الفشل، فقد لا يكون لحسابك ملف مورّد بعد.',
  'verify.emptyTitle': 'لا مستندات في السجل',
  'verify.emptyBody':
    'لم يُودَع أي مستند بعد، لذا لا يمكن إظهار شارة توثيق للمشترين. استخدم النموذج لإيداع أول مستند — ابدأ بـ {first}.',
  'verify.col.document': 'المستند',
  'verify.col.status': 'الحالة',
  'verify.col.note': 'ملاحظة المراجع',
  'verify.col.reviewed': 'تاريخ المراجعة',
  'verify.filed': 'أُودع في {date}',
  'verify.reference': 'المرجع: {ref}',
  'verify.noReference': 'لم يُعطَ مرجع',
  'verify.resubmit': 'إعادة الإرسال',
  'verify.tierFootnote':
    'تُدرج هنا فقط المستندات التي ترجعها الواجهة لملف المورّد الخاص بك. الأنواع الناقصة ليس لها صف بعد — وإيداعها يُنشئه.',
  'verify.fileTitle': 'إيداع مستند أو تحديثه',
  'verify.docType': 'نوع المستند',
  'verify.existingHintPre': 'لديك بالفعل صف لـ {doc} — الحالة',
  'verify.existingHintPost':
    '. الإيداع مجددًا يستبدله ويمسح القرار السابق، لذا سيحتاج المستند المعتمد إلى اعتماد جديد.',
  'verify.refLabel': 'مرجع / رابط المستند',
  'verify.refPlaceholder': 'https://…/business-licence.pdf أو مرجع ملفك',
  'verify.refHintLead': 'رفع الملفات غير مبني.',
  'verify.refHintTail':
    'الصق رابط المستند، أو مرجعًا يمكن لفريق المراجعة متابعته. يُخزَّن كما هو ولا يُعرض علنًا.',
  'verify.noteLabel': 'ملاحظة للمراجع',
  'verify.notePlaceholder': 'ما الذي تغيّر، ولماذا يُحدَّث، وأي شيء ينبغي أن يعرفه المراجع…',
  'verify.filing': 'جارٍ الإيداع…',
  'verify.resubmitDoc': 'أعد إرسال {doc}',
  'verify.submitDoc': 'أرسل {doc}',
  'verify.queueNoteLead': 'الإرسال يضع المستند في قائمة الانتظار فقط.',
  'verify.queueNoteStrong': 'تظهر الشارة للمشترين عندما يعتمده مراجع',
  'verify.queueNoteTail': '— لا عند الإرسال أبدًا، ولا تلقائيًا.',
  'verify.filedNotice':
    'تم إيداع {doc}. الحالة الآن "مُرسل" وهو في قائمة المراجعة — ولا تظهر الشارة للمشترين إلا بعد اعتماد المراجع.',
  'verify.errFile': 'تعذّر إيداع هذا المستند.',
  'verify.statusMeans': 'معنى كل حالة',
  'verify.tierTitle': 'مستوى التوثيق',
  'verify.tierAll': 'موثّق · كل المستندات الأساسية معتمدة',
  'verify.tierSome': 'موثّق · المستندات معتمدة',
  'verify.tierNone': 'غير موثّق بعد',
  'verify.tierAllBody': 'اعتمد مراجع كل نوع من أنواع المستندات الأساسية في هذه الصفحة.',
  'verify.tierSomeBody': 'مستند واحد على الأقل معتمد{n}؛ والأنواع الأساسية المتبقية تقوّي الملف.',
  'verify.tierNoneBody': 'لم يُعتمد أي مستند بعد، لذا لا تُعرض للمشترين أي شارة توثيق لشركتك.',
  'verify.tierHint':
    'يحدّد فريق المراجعة المستوى الذي يحمله حسابك من المستندات المعتمدة — هذه الشاشة تعرض حالات المستندات التي ترجعها الواجهة ولا تحسب رقم مستوى بنفسها. يرى المشترون الشارة للمستندات المعتمدة فقط.',
  'verify.suggested': 'المقترح التالي:',
  'verify.select': 'اختيار',
  'verify.othersNote':
    'يرى المشترون أيضًا تقييمات موردين آخرين وأعداد التفتيش في ملفاتهم. تلك الأرقام بيانات سوق تجريبية وليست نتاج هذه القائمة — وهذه الصفحة لا تعرض أيًا منها عن قصد.',
  'verify.help.missing.title': 'لم يُودع',
  'verify.help.missing.state': 'لم يُودع شيء بعد، أو لم يُرسَل المستند قط.',
  'verify.help.submitted.title': 'بانتظار المراجعة',
  'verify.help.submitted.state': 'أُودع وينتظر في قائمة المراجعة. لا تُعرض أي شارة للمشترين بعد.',
  'verify.help.approved.title': 'معتمد',
  'verify.help.approved.state': 'راجعه مراجع مقابل المستند نفسه. هذا ما يراه المشترون.',
  'verify.help.rejected.title': 'أُعيد',
  'verify.help.rejected.state': 'رُفض مع ملاحظة. صحّح المستند وأرسله مرة أخرى.',
  'verify.doc.businessLicence': 'السجل التجاري',
  'verify.doc.taxCertificate': 'شهادة ضريبية',
  'verify.doc.factoryAudit': 'تقرير تفتيش المصنع',
  'verify.doc.productCert': 'شهادة المنتج',
  'verify.doc.exportLicence': 'رخصة التصدير',
};

const ru: Partial<Record<DictKey, string>> = {
  'status.open': 'Открыт',
  'status.quoted': 'Есть предложение',
  'status.closed': 'Закрыт',
  'status.submitted': 'Отправлен',
  'status.accepted': 'Принят',
  'status.rejected': 'Отклонён',
  'status.active': 'Активен',
  'status.sold_out': 'Распродан',
  'status.scheduled': 'Запланирован',
  'status.in_progress': 'В работе',
  'status.passed': 'Пройден',
  'status.failed': 'Не пройден',
  'status.pending': 'В ожидании',
  'status.paid': 'Оплачен',
  'status.shipped': 'Отгружен',
  'status.delivered': 'Доставлен',
  'status.cancelled': 'Отменён',
  'status.missing': 'Не подан',
  'status.approved': 'Одобрен',
  'status.countered': 'Встречное предложение',
  'status.withdrawn': 'Отозван',
  'status.inspecting': 'Идёт инспекция',

  'action.close': 'Закрыть',
  'action.cancel': 'Отмена',
  'action.dismiss': 'Скрыть',
  'action.refresh': 'Обновить',
  'action.refreshing': 'Обновление…',
  'action.tryAgain': 'Повторить',
  'action.clear': 'Сбросить',
  'action.clearFilters': 'Сбросить фильтры',
  'action.search': 'Найти',
  'action.save': 'Сохранить изменения',
  'action.discard': 'Отменить',
  'action.signIn': 'Войти',
  'action.signOut': 'Выйти',
  'action.signingIn': 'Вход…',
  'action.joinFree': 'Регистрация бесплатно',
  'action.createAccount': 'Создать аккаунт',
  'action.creatingAccount': 'Создание аккаунта…',
  'action.backToExplore': 'Назад к каталогу',
  'action.open': 'Открыть',
  'action.edit': 'Изменить',
  'action.delete': 'Удалить',

  'common.loading': 'Загрузка…',
  'common.loadingEllipsis': 'Загрузка…',
  'common.notSet': 'Не указано',
  'common.optional': 'Необязательно',
  'common.required': 'обязательно',
  'common.newestFirst': 'Сначала новые',
  'common.anyCountry': 'Любая страна',
  'common.allCountries': 'Все страны',
  'common.verified': 'Проверен',
  'common.tradeAbbrev':
    'RFQ — запрос цены · MOQ — минимальный объём заказа · FOB — франко-борт · TT — банковский перевод',

  'nav.feed': 'Лента',
  'nav.explore': 'Каталог',
  'nav.exploreStock': 'Каталог склада',
  'nav.offersBuyer': 'Мои предложения',
  'nav.rfqs': 'Мои запросы',
  'nav.orders': 'Заказы',
  'nav.shipments': 'Отгрузки',
  'nav.messages': 'Сообщения',
  'nav.saved': 'Сохранённое',
  'nav.savedLots': 'Сохранённые партии',
  'nav.notifications': 'Уведомления',
  'nav.help': 'Справочный центр',
  'nav.helpCentre': 'Справочный центр',
  'nav.howItWorks': 'Как это работает',
  'nav.profile': 'Профиль',
  'nav.listings': 'Мои позиции',
  'nav.post': 'Разместить товар',
  'nav.postStock': 'Разместить товар',
  'nav.offersSup': 'Предложения',
  'nav.rfqOpps': 'Запросы покупателей',
  'nav.verification': 'Проверка',
  'nav.suppliers': 'Поставщики',
  'nav.overview': 'Обзор',
  'nav.adminSuppliers': 'Поставщики',
  'nav.adminVerify': 'Отдел проверки',
  'nav.adminListings': 'Позиции',
  'nav.adminRfqs': 'Запросы цены',
  'nav.adminPayments': 'Платежи',
  'nav.sources': 'Источники поставок',
  'nav.growth': 'Баннеры и акции',
  'nav.features': 'Функции',

  'topbar.searchPlaceholder': 'Поиск товаров, поставщиков, категорий…',
  'topbar.searchAria': 'Поиск по площадке',
  'topbar.notifications': 'Уведомления',
  'topbar.createAccountTitle': 'Создать аккаунт',
  'topbar.account': 'Аккаунт',
  'topbar.languageAria': 'Язык интерфейса',
  'rail.allIndustries': 'Все отрасли',
  'rail.howItWorks': 'Как это работает',
  'sidebar.moreIndustries': 'Больше отраслей. Больше стран.',
  'sidebar.moreIndustriesSub': 'Одна площадка для готового склада.',

  'gate.title': 'Доступ для участников',
  'gate.body':
    'Связь с поставщиками, публикация запросов и предложение цены доступны участникам. Просмотр площадки остаётся бесплатным и открытым.',
  'gate.createAccount': 'Создать бесплатный аккаунт',
  'gate.haveAccount': 'У меня уже есть аккаунт',

  'cards.noPhoto': 'нет фото',
  'cards.moq': 'MOQ',
  'cards.saveLot': 'Сохранить партию',
  'cards.demo': 'Демо',
  'cards.demoTitle': 'Демонстрационные данные — не настоящее предложение',
  'cards.inspections': 'инспекций',

  'auth.signIn.sub': 'Доступ к заказам, предложениям и запросам цены.',
  'auth.email': 'Эл. почта',
  'auth.password': 'Пароль',
  'auth.signInCta': 'Войти',
  'auth.newHere': 'Впервые здесь?',
  'auth.demoNotice': 'Демо-уведомление',
  'auth.seededLogin': 'Тестовый аккаунт для проверки',
  'auth.fillIn': 'Заполнить',
  'auth.demoHintLead': '— это тестовый',
  'auth.demoHintLead2': 'демо',
  'auth.demoHintTail':
    'аккаунт для проверки админ-консоли. Это не настоящий продавец — не вводите реальные данные.',
  'auth.demoHintProduct': 'администратора',
  'auth.signInFailed': 'Не удалось войти',
  'auth.signUp.title': 'Создать аккаунт',
  'auth.signUp.sub': 'Один аккаунт для закупок, продаж, инспекции и логистики.',
  'auth.fullName': 'Имя и фамилия',
  'auth.workEmail': 'Рабочая почта',
  'auth.minChars': 'Не менее 8 символов',
  'auth.atLeast8': 'Не менее 8 символов.',
  'auth.iAmA': 'Я…',
  'auth.company': 'Компания',
  'auth.country': 'Страна',
  'auth.countryHint': 'Турция, Китай…',
  'auth.createCta': 'Создать аккаунт',
  'auth.alreadyRegistered': 'Уже зарегистрированы?',
  'auth.signUpHint': 'Размещение бесплатно. Знаки доверия зарабатываются проверкой, инспекциями и историей поставок.',
  'auth.registerFailed': 'Не удалось зарегистрироваться',
  'auth.role.buyer': 'Покупатель',
  'auth.role.buyerHint': 'Я закупаю продукцию',
  'auth.role.supplier': 'Поставщик',
  'auth.role.supplierHint': 'Я продаю / произвожу',
  'auth.role.inspector': 'Инспектор',
  'auth.role.inspectorHint': 'Я проверяю заводы',
  'auth.role.lab': 'Лаборатория',
  'auth.role.labHint': 'Я испытываю материалы',
  'auth.role.logistics': 'Логистика',
  'auth.role.logisticsHint': 'Я перевожу грузы',

  'profile.title': 'Профиль',
  'profile.sub': 'Данные, которые видят другие стороны в ваших предложениях, заказах и сообщениях.',
  'profile.signInSub': 'Войдите, чтобы управлять аккаунтом',
  'profile.notSignedIn': 'Вы не вошли',
  'profile.notSignedInBody': 'Профиль виден только вашему аккаунту: войдите, чтобы посмотреть и изменить его.',
  'profile.createAccount': 'Создать аккаунт',
  'profile.accountDetails': 'Данные аккаунта',
  'profile.unsaved': 'Несохранённые изменения',
  'profile.fullName': 'Имя и фамилия',
  'profile.company': 'Компания',
  'profile.notSet': 'Не указано',
  'profile.country': 'Страна',
  'profile.language': 'Язык интерфейса',
  'profile.languageHint':
    'Сразу меняет язык интерфейса и сохраняется в аккаунте при нажатии «Сохранить изменения».',
  'profile.save': 'Сохранить изменения',
  'profile.saving': 'Сохранение…',
  'profile.saved': 'Сохранено',
  'profile.savedBody': 'Профиль обновлён.',
  'profile.identity': 'Идентификация',
  'profile.identityNote':
    'Почту и роль здесь изменить нельзя. Они фиксируются при создании аккаунта, и API профиля их не принимает.',
  'profile.email': 'Эл. почта',
  'profile.role': 'Роль',
  'profile.readOnly': 'Только чтение',
  'profile.readOnlyEmail': 'Только чтение — API профиля не принимает почту',
  'profile.readOnlyRole': 'Только чтение — API профиля не принимает роль',
  'profile.emailStatus': 'Статус почты',
  'profile.emailVerified': 'Почта подтверждена',
  'profile.emailNotVerified': 'Почта не подтверждена',
  'profile.memberSince': 'Участник с',
  'profile.accountLine': 'Аккаунт #{id} · вход как {role}',
  'profile.errName': 'Укажите имя — API отклоняет пустое имя.',
  'profile.errSave': 'Не удалось сохранить профиль — повторите попытку.',

  'explore.title': 'Каталог склада',
  'explore.subLoading': 'Загрузка доступных партий…',
  'explore.subCount': '{n} позиций по вашим фильтрам',
  'explore.searchPlaceholder': 'Медный катод, насосы…',
  'explore.searchAria': 'Поиск по позициям',
  'explore.categoryAria': 'Категория',
  'explore.allCategories': 'Все категории',
  'explore.originAria': 'Страна происхождения',
  'explore.allCountries': 'Все страны',
  'explore.min': 'Мин. $',
  'explore.max': 'Макс. $',
  'explore.emptyTitle': 'По этим фильтрам позиций нет',
  'explore.emptyBody': 'Попробуйте более широкую категорию, другую страну происхождения или сбросьте фильтры.',
  'explore.page': 'Страница {page} из {pages}',
  'explore.prev': '← Назад',
  'explore.next': 'Вперёд →',

  'feed.welcomeBack': 'С возвращением, {name}',
  'feed.title': 'Лента площадки',
  'feed.sub': 'Готовый склад, излишки и сверхнормативные партии от проверенных заводов — сначала новые.',
  'feed.sellStock': 'Продать товар',
  'feed.postRequest': 'Разместить запрос',
  'feed.lotsCount': '{n} партий',
  'feed.lotsMatch': 'партий по вашим фильтрам',
  'feed.verifiedSuppliers': 'проверенных поставщиков',
  'feed.openRequests': 'открытых запросов',
  'feed.allOrigins': 'Все страны происхождения',
  'feed.searchAria': 'Поиск по партиям',
  'feed.minAria': 'Минимальная цена',
  'feed.maxAria': 'Максимальная цена',
  'feed.allIndustries': 'Все отрасли',
  'feed.noLots': 'Партий нет',
  'feed.shownRange': '{first}–{last} из {total}',
  'feed.emptyTitle': 'По этим фильтрам партий нет',
  'feed.emptyBody': 'Попробуйте другую отрасль, другую страну происхождения или сбросьте фильтры.',
  'feed.lookingFor': 'Ищете что-то конкретное?',
  'feed.postRequestLink': 'Разместите запрос',
  'feed.lookingForTail': 'и проверенные заводы предложат вам цену.',
  'feed.sellingInstead': 'Хотите продавать?',
  'feed.listYourStock': 'Разместите свой товар',
  'feed.signedInAs': 'вход как {role}',
  'feed.createFree': 'создайте бесплатный аккаунт',

  'help.title': 'Как работает FactoryDepo',
  'help.sub': 'Готовый склад, запросы цены и поставки с инспекцией.',
  'help.buying': 'Покупка',
  'help.buying1.title': '1. Смотрите готовый склад.',
  'help.buying1':
    'Каждая доступная партия показывает цену, минимальный объём заказа, страну происхождения и реальное наличие. Позиции с меткой «Демо» — демонстрационные данные, а не настоящие предложения, и помечены, чтобы вы не были введены в заблуждение.',
  'help.buying2.title': '2. Запросите цену.',
  'help.buying2':
    'Разместите запрос с описанием потребности. Поставщики отвечают ценой, сроком и своими условиями.',
  'help.buying3.title': '3. Сравните и решите.',
  'help.buying3': 'Предложения видны рядом в одном запросе. Принятие одного создаёт заказ.',
  'help.buying4.title': '4. Оплата банковским переводом.',
  'help.buying4':
    'Промышленная торговля не работает по картам. Вы получаете счёт-проформу, оплачиваете переводом TT и заказ помечается оплаченным после подтверждения средств.',
  'help.selling': 'Продажа',
  'help.selling1.title': '1. Создайте аккаунт поставщика.',
  'help.selling1': 'Регистрация как поставщик сразу создаёт профиль компании.',
  'help.selling2.title': '2. Разместите товар.',
  'help.selling2':
    'Инструменты размещения сейчас разрабатываются — до их запуска позиции поставщиков добавляет наша команда при подключении.',
  'help.selling3.title': '3. Отвечайте на входящие запросы.',
  'help.selling3':
    'Открытые запросы покупателей видны в вашей панели с актуальным числом неотвеченных.',
  'help.selling4.title': '4. Пройдите проверку.',
  'help.selling4':
    'Уровни проверки открывают видимость. Знаки выдаются только после одобрения документов, поэтому знак на сайте что-то значит.',
  'help.notLive': 'Что ещё не работает',
  'help.notLiveLead': 'Мы предпочитаем сказать это прямо, а не позволять вам узнать самому:',
  'help.notLive1': 'Самостоятельное размещение позиций поставщиком в разработке.',
  'help.notLive2': 'Переписка покупателя с поставщиком пока недоступна — используйте контакты в профиле поставщика.',
  'help.notLive3': 'Предложения и встречные предложения сейчас обрабатываются вручную.',
  'help.notLive4': 'Отслеживание отгрузок и работа с документами не реализованы.',
  'help.exploreCta': 'Каталог склада',
  'help.rfqCta': 'Запросы цены',

  'soon.sub': 'Ещё не реализовано',
  'soon.title': 'Этот раздел появится на следующем этапе',
  'soon.body': 'Раздел есть в навигации, но его таблицы данных и конечные точки API ещё не реализованы.',
  'soon.note.offers': 'Таблица предложений и встречных предложений появится на следующем этапе.',
  'soon.note.shipments': 'Этапы отгрузки и документы появятся на следующем этапе.',
  'soon.note.messages': 'Переписка покупателя ↔ поставщика появится на следующем этапе.',
  'soon.note.saved': 'Сохранённые партии появятся на следующем этапе.',
  'soon.note.notifications': 'Центр уведомлений появится на следующем этапе.',
  'soon.note.profile': 'Редактирование профиля появится на следующем этапе.',
  'soon.note.listings': 'Управление позициями поставщика с проверкой владельца появится на следующем этапе.',
  'soon.note.post': 'Создание и редактирование позиции с загрузкой изображений появится на следующем этапе.',
  'soon.note.generic': 'Появится на следующем этапе.',
  'soon.note.verification': 'Уровни проверки и подача документов появятся на следующем этапе.',
  'soon.note.admin': 'Админ-консоль появится на следующем этапе.',
  'soon.note.sources': 'Ручное подключение поставщиков появится на следующем этапе.',
  'soon.note.features': 'Флаги функций появятся на следующем этапе.',

  'orders.title': 'Заказы',
  'orders.signInSub': 'Войдите, чтобы увидеть заказы, в которых вы участвуете',
  'orders.notSignedIn': 'Вы не вошли',
  'orders.notSignedInBody': 'Заказы приватны: войдите, чтобы увидеть, что вы обязались купить или продать.',
  'orders.createAccount': 'Создать аккаунт',
  'orders.subSupplier': 'Заказы покупателей на ваш товар',
  'orders.subBuyer': 'Всё, что вы обязались купить',
  'orders.statListings': 'Мои позиции',
  'orders.statOffersReceived': 'Полученные предложения',
  'orders.statOffersOnRfqs': 'Предложения по моим запросам',
  'orders.statOrders': 'Заказы',
  'orders.statSoldItems': 'Проданные позиции',
  'orders.statSoldTitle': 'Отгруженные или доставленные заказы',
  'orders.statViews': 'Просмотры · пока не отслеживаются',
  'orders.statViewsTitle': 'Учёт просмотров ещё не реализован',
  'orders.metricsError': 'Не удалось загрузить показатели.',
  'orders.loadErrorTitle': 'Не удалось загрузить заказы',
  'orders.loadErrorBody': 'API не вернул ваши заказы. Обновите страницу или войдите снова.',
  'orders.emptyTitle': 'Заказов пока нет',
  'orders.emptySupplier': 'Когда покупатель заказывает ваш товар, заказ появляется здесь.',
  'orders.emptyBuyer': 'Заказы «купить сейчас» по готовому складу появятся здесь.',
  'orders.browseStock': 'Смотреть готовый склад',
  'orders.postRfq': 'Разместить запрос цены',
  'orders.count': '{n} заказов',
  'orders.col.order': 'Заказ',
  'orders.col.product': 'Товар',
  'orders.col.counterparty': 'Контрагент',
  'orders.col.qty': 'Кол-во',
  'orders.col.total': 'Итого',
  'orders.col.status': 'Статус',
  'orders.col.date': 'Дата',
  'orders.buyerLabel': 'покупатель',
  'orders.supplierLabel': 'поставщик',
  'orders.buyerId': 'Покупатель #{id}',

  'product.loadingTitle': 'Загрузка…',
  'product.loadingThis': 'эту позицию',
  'product.fetching': 'Загрузка: {what}…',
  'product.notFound': 'Товар не найден',
  'product.backToExplore': 'Назад к каталогу',
  'product.noPhoto': 'Фото для этой партии не предоставлено',
  'product.pricePer': 'Цена / {unit}',
  'product.minOrder': 'Минимальный заказ',
  'product.availableNow': 'Доступно сейчас',
  'product.origin': 'Страна происхождения',
  'product.unavailable': 'Сейчас недоступно',
  'product.buyNowHeading': 'Купить сейчас — готовый склад',
  'product.soldOutBody': 'Эта партия помечена как распроданная. Запросите у поставщика следующую партию.',
  'product.noUnitsBody': 'Сейчас единиц нет в наличии. Запросите у поставщика следующую партию.',
  'product.purchaseTerms': 'Покупка по указанной цене {price} за {unit}, минимум {moq} {unit}.',
  'product.stockOnHand': 'Наличие на складе',
  'product.buyNowPrice': 'Купить сейчас · {price}/{unit}',
  'product.outOfStock': 'Купить сейчас — нет в наличии',
  'product.requestQuote': 'Запросить цену',
  'product.shipsFrom': 'Отгрузка из {country}',
  'product.signInToOrder': 'Войдите, чтобы заказать или запросить цену.',
  'product.supplier': 'Поставщик',
  'product.viewProfile': 'Открыть профиль',
  'product.loadingSupplier': 'Загрузка данных поставщика…',
  'product.supplierUnavailable': 'Данные поставщика недоступны.',
  'product.rating': 'Рейтинг',
  'product.inspections': 'Инспекции',
  'product.fulfilment': 'Поставки в срок',
  'product.verifiedLevel': 'Уровень проверки',
  'product.levelN': 'Уровень {n}',
  'product.tradingSince': 'Работает с',
  'product.supplierFiguresHint': 'Показатели относятся ко всему поставщику на площадке, а не только к этой партии.',
  'product.description': 'Описание',
  'product.noDescription':
    'Поставщик не добавил описание. Запросите цену, чтобы узнать характеристики, срок и условия поставки.',
  'product.specification': 'Характеристики',
  'product.noSpec': 'Для этой партии характеристики не указаны.',
  'product.col.attribute': 'Параметр',
  'product.col.value': 'Значение',
  'product.spec.category': 'Категория',
  'product.spec.unit': 'Единица',
  'product.spec.purity': 'Чистота / сорт',

  'checkout.title': 'Купить сейчас — оформление',
  'checkout.placedTitle': 'Заказ оформлен',
  'checkout.confirmed': 'Заказ #{id} подтверждён',
  'checkout.notified': 'Поставщик уведомлён. Отслеживайте заказ на странице заказов.',
  'checkout.viewOrders': 'Мои заказы',
  'checkout.keepBrowsing': 'Продолжить просмотр',
  'checkout.pricePer': 'Цена / {unit}',
  'checkout.minimumOrder': 'Минимальный заказ',
  'checkout.availableNow': 'Доступно сейчас',
  'checkout.quantity': 'Количество ({unit})',
  'checkout.qtyHint': 'На складе от {moq} до {stock} {unit}.',
  'checkout.fullName': 'Имя и фамилия',
  'checkout.country': 'Страна',
  'checkout.address': 'Адрес',
  'checkout.city': 'Город',
  'checkout.phone': 'Телефон',
  'checkout.notes': 'Примечания для поставщика',
  'checkout.total': 'Итого {total}',
  'checkout.placeOrder': 'Оформить заказ · {total}',
  'checkout.placing': 'Оформление заказа…',
  'checkout.errPlace': 'Не удалось оформить заказ.',

  'rfqModal.title': 'Запросить цену',
  'rfqModal.postedTitle': 'Запрос размещён',
  'rfqModal.live': 'Ваша потребность опубликована в бирже запросов цены',
  'rfqModal.canQuote': 'Проверенные поставщики могут предложить цену и срок.',
  'rfqModal.viewMine': 'Мои запросы цены',
  'rfqModal.listedBy': '{product} · разместил {supplier}',
  'rfqModal.quantity': 'Количество',
  'rfqModal.unit': 'Единица',
  'rfqModal.specs': 'Характеристики, сертификаты, условия поставки',
  'rfqModal.moqHint': 'MOQ позиции — {moq} {unit}.',
  'rfqModal.post': 'Разместить запрос',
  'rfqModal.posting': 'Размещение…',
  'rfqModal.errPost': 'Не удалось разместить запрос.',
  'rfqModal.titleSuffix': 'запрос цены',

  'suppliers.loadingSub': 'Загрузка каталога поставщиков',
  'suppliers.loadingBody': 'Загрузка каталога поставщиков…',
  'suppliers.title': 'Каталог поставщиков',
  'suppliers.sub':
    'Заводы и торговые компании на FactoryDepo. Уровни проверки основаны на выездных аудитах и проверке документов.',
  'suppliers.demoNote': 'строки с меткой «Демо» — демонстрационные данные',
  'suppliers.loadErrorTitle': 'Не удалось загрузить каталог',
  'suppliers.loadErrorBody': 'Сервис поставщиков не ответил. Повторите попытку позже.',
  'suppliers.emptyTitle': 'Поставщиков пока нет',
  'suppliers.emptyBody': 'Профили поставщиков появятся здесь после подключения и проверки.',
  'suppliers.totalListed': 'Поставщиков в каталоге',
  'suppliers.totalVerified': 'Проверены, уровень 2+',
  'suppliers.avgRating': 'Средний рейтинг',
  'suppliers.avgRatingRated': 'Средний рейтинг (оценено: {n})',
  'suppliers.avgFulfilment': 'Поставки в срок',
  'suppliers.avgFulfilmentMeasured': 'Поставки в срок (измерено: {n})',
  'suppliers.searchPlaceholder': 'Компания, страна, город, компетенция…',
  'suppliers.searchAria': 'Поиск поставщиков',
  'suppliers.verifiedOnly': 'Только проверенные',
  'suppliers.showing': 'Показано {shown} из {total}',
  'suppliers.noMatchTitle': 'По этому запросу поставщиков нет',
  'suppliers.noMatchBody': 'Попробуйте более короткое название компании или снимите фильтр проверки.',
  'suppliers.rating': 'Рейтинг',
  'suppliers.inspections': 'Инспекции',
  'suppliers.fulfilment': 'Исполнение',

  'supplierDetail.loadingThis': 'этот профиль поставщика',
  'supplierDetail.notFound': 'Поставщик не найден',
  'supplierDetail.backToDirectory': 'Назад в каталог',
  'supplierDetail.backShort': '← Назад в каталог',
  'supplierDetail.tradingSince': 'Работает с {year}',
  'supplierDetail.verifiedL3': 'Проверен · уровень 3',
  'supplierDetail.registered': 'Зарегистрирован',
  'supplierDetail.buyerRating': 'Рейтинг покупателей',
  'supplierDetail.notRated': 'пока без оценок',
  'supplierDetail.inspections': 'Выездные инспекции',
  'supplierDetail.fulfilment': 'Поставки в срок',
  'supplierDetail.activeListings': 'Активные позиции',
  'supplierDetail.tier': 'Уровень проверки',
  'supplierDetail.trustScore': 'Индекс доверия (0–100)',
  'supplierDetail.about': 'О компании {company}',
  'supplierDetail.noDescription': 'Этот поставщик ещё не опубликовал описание компании.',
  'supplierDetail.capabilities': 'Заявленные компетенции',
  'supplierDetail.record': 'Проверка и история',
  'supplierDetail.ratingLabel': 'Рейтинг покупателей',
  'supplierDetail.inspectionsDone': 'Проведено инспекций',
  'supplierDetail.contact': 'Контакты',
  'supplierDetail.contactBody': 'Отчёты об инспекции и документы проверки передаются участникам после первого контакта.',
  'supplierDetail.contactSupplier': 'Связаться с поставщиком',
  'supplierDetail.contactHintSignedIn': 'Открывает биржу запросов цены — переписка по цене идёт там.',
  'supplierDetail.contactHintGuest': 'Только для участников · бесплатное подключение',
  'supplierDetail.services': 'Торговые услуги',
  'supplierDetail.service1': 'Инспекция завода до оплаты',
  'supplierDetail.service2': 'Лабораторные испытания и анализ материалов',
  'supplierDetail.service3': 'Контроль загрузки контейнера',
  'supplierDetail.service4': 'Поддержка экспортных документов',
  'supplierDetail.stockFrom': 'Товар от {company}',
  'supplierDetail.shown': 'показано {n}',
  'supplierDetail.loadingLots': 'Загрузка доступных партий…',
  'supplierDetail.noneShown': 'Активных позиций не показано',
  'supplierDetail.noneShownBody':
    'API сообщает о {n} позициях этого поставщика, но ни одна не вернулась в текущем списке. Разместите запрос через биржу запросов цены, чтобы узнать о каталоге.',

  'rfq.titleSupplier': 'Запросы покупателей',
  'rfq.titleBuyer': 'Запросы',
  'rfq.subSupplier': 'Открытые потребности покупателей. Ответьте ценой и сроком.',
  'rfq.subBuyer': 'Актуальные потребности на бирже, сначала новые. Откройте одну, чтобы увидеть полученные предложения.',
  'rfq.postRequest': '+ Разместить запрос',
  'rfq.buyerOnlyNotice': 'Размещать запросы могут только аккаунты покупателей. Войдите с профилем покупателя.',
  'rfq.total': 'всего запросов',
  'rfq.open': 'открыто',
  'rfq.quoted': 'с предложениями',
  'rfq.closed': 'закрыто',
  'rfq.quoteable': 'Запросы, по которым можно предложить цену',
  'rfq.allRequests': 'Все запросы',
  'rfq.shown': 'показано {n}',
  'rfq.statusAll': 'Все',
  'rfq.statusOpenCount': 'Открытые ({n})',
  'rfq.statusQuotedCount': 'С предложениями ({n})',
  'rfq.quotingCloses': 'Приём предложений закрывается, когда покупатель принимает одно из них.',
  'rfq.emptyNone': 'Запросов пока нет',
  'rfq.emptyNoMatch': 'По этому фильтру ничего нет',
  'rfq.emptyNoneSupplier': 'Сейчас на бирже нет открытых потребностей.',
  'rfq.emptyNoneBuyer': 'Разместите первую потребность, и проверенные заводы ответят.',
  'rfq.emptyNoMatchHint': 'Попробуйте другой фильтр статуса.',
  'rfq.col.requirement': 'Потребность',
  'rfq.col.quantity': 'Количество',
  'rfq.col.deliverTo': 'Куда поставить',
  'rfq.col.quotes': 'Предложения',
  'rfq.col.posted': 'Размещён',
  'rfq.col.status': 'Статус',
  'rfq.openAria': 'Открыть запрос #{id}',
  'rfq.requestRef': '{category} · запрос #{id}',
  'rfq.quotesCount': '{n} предложений',
  'rfq.postingBuyerOnly': 'Размещение — действие покупателя. Поставщики могут',
  'rfq.quoteOpen': 'предложить цену по открытым потребностям',
  'rfq.newTitle': 'Новый запрос цены',
  'rfq.whatNeed': 'Что вам нужно?',
  'rfq.titlePlaceholder': 'например, 100 т медного катода, сорт A',
  'rfq.category': 'Категория',
  'rfq.deliverTo': 'Куда поставить',
  'rfq.quantity': 'Количество',
  'rfq.unit': 'Единица',
  'rfq.specification': 'Характеристики',
  'rfq.specPlaceholder': 'Сорт, чистота, сертификаты, Инкотермс, упаковка…',
  'rfq.specHint': 'Чем точнее характеристики, тем быстрее проверенные заводы предложат цену.',
  'rfq.errTitle': 'Дайте запросу понятное название — минимум 5 символов.',
  'rfq.errQuantity': 'Количество должно быть числом больше нуля.',
  'rfq.errPost': 'Не удалось разместить этот запрос.',

  'rfqDetail.loadingTitle': 'Запрос',
  'rfqDetail.loadingSub': 'Загрузка…',
  'rfqDetail.title': 'Запрос',
  'rfqDetail.notFound': 'Запрос не найден',
  'rfqDetail.notFoundBody': 'Возможно, потребность отозвана или ссылка неверна.',
  'rfqDetail.backToRequests': '← Назад к запросам',
  'rfqDetail.allRequests': '← Все запросы',
  'rfqDetail.postedOn': 'размещён {date}',
  'rfqDetail.requestRef': 'Запрос #{id}',
  'rfqDetail.accepting': 'Приём предложений открыт',
  'rfqDetail.notAccepting': 'Новые предложения не принимаются',
  'rfqDetail.noSpec': 'Дополнительные характеристики не указаны.',
  'rfqDetail.quantity': 'Количество',
  'rfqDetail.deliverTo': 'Куда поставить',
  'rfqDetail.quotations': 'Предложения',
  'rfqDetail.deadline': 'Срок',
  'rfqDetail.requestedBy': 'Запросил',
  'rfqDetail.received': 'получено: {n}',
  'rfqDetail.noneTitle': 'Предложений пока нет',
  'rfqDetail.noneBody': 'Проверенные поставщики изучают эту потребность.',
  'rfqDetail.col.supplier': 'Поставщик',
  'rfqDetail.col.price': 'Цена',
  'rfqDetail.col.leadTime': 'Срок',
  'rfqDetail.col.notes': 'Примечания',
  'rfqDetail.col.sent': 'Отправлено',
  'rfqDetail.col.status': 'Статус',
  'rfqDetail.trustScore': 'Индекс доверия {n}',
  'rfqDetail.days': '{n} дней',
  'rfqDetail.submitTitle': 'Предложить цену',
  'rfqDetail.supplierAccount': 'Аккаунт поставщика',
  'rfqDetail.fromSupplier': 'Предложения приходят от аккаунтов поставщиков. Переключитесь на аккаунт поставщика, чтобы ответить.',
  'rfqDetail.signInSupplierBody': 'Предлагать цену могут только вошедшие аккаунты поставщиков. Просмотр открыт для всех.',
  'rfqDetail.supplierOnly': 'Только аккаунты поставщиков',
  'rfqDetail.signInAsSupplier': 'Войти как поставщик',
  'rfqDetail.closedBody': 'Этот запрос {status} и больше не принимает предложения.',
  'rfqDetail.seeOpen': 'Смотреть открытые запросы',
  'rfqDetail.respondBody': 'Ответьте ценой за единицу и сроком. Ваш проверенный профиль идёт вместе с предложением.',
  'rfqDetail.unitPrice': 'Цена за единицу (USD)',
  'rfqDetail.leadTime': 'Срок (дней)',
  'rfqDetail.termsNotes': 'Условия и примечания',
  'rfqDetail.termsPlaceholder': 'Инкотермс, сорт, упаковка, условия образцов, срок действия…',
  'rfqDetail.compareHint': 'Покупатели сравнивают цену, срок и проверку рядом.',
  'rfqDetail.submitQuote': 'Отправить предложение',
  'rfqDetail.submitting': 'Отправка…',
  'rfqDetail.errPrice': 'Укажите цену за единицу больше нуля.',
  'rfqDetail.errLead': 'Срок должен быть целым числом дней от 1 до 365.',
  'rfqDetail.errSubmit': 'Не удалось отправить предложение.',

  'listings.title': 'Мои позиции',
  'listings.sub': 'Товар, который вы опубликовали на площадке',
  'listings.signInSub': 'Товар, который вы опубликовали на площадке',
  'listings.notSignedIn': 'Вы не вошли',
  'listings.notSignedInBody': 'Ваши позиции видны только вашему аккаунту поставщика. Войдите, чтобы посмотреть и управлять ими.',
  'listings.createSupplierAccount': 'Создать аккаунт поставщика',
  'listings.supplierOnly': 'Только аккаунты поставщиков',
  'listings.supplierOnlyBody':
    'Ваш аккаунт — {role}. Позициями управляет владеющий ими поставщик, поэтому здесь нечего показывать или менять.',
  'listings.browseStock': 'Смотреть готовый склад',
  'listings.subLoading': 'Загрузка вашего товара…',
  'listings.subCount': '{n} позиций опубликовано под вашим профилем поставщика',
  'listings.postStock': '+ Разместить товар',
  'listings.lotsPublished': 'партий опубликовано',
  'listings.viewsNotTracked': 'просмотры · пока не отслеживаются',
  'listings.bankTransferNote': 'После принятия предложения покупатели платят банковским переводом.',
  'listings.loadErrorTitle': 'Не удалось загрузить ваши позиции',
  'listings.loadErrorBody': 'Не удалось загрузить позиции — повторите попытку. Если не помогает, войдите снова.',
  'listings.emptyTitle': 'Позиций пока нет',
  'listings.emptyBody':
    'Разместите первую партию — фото, цену за единицу и объём, который можете отгрузить сегодня. Она сразу появится в каталоге для всех покупателей.',
  'listings.postFirst': '+ Разместить первую партию',
  'listings.getVerified': 'Пройти проверку',
  'listings.count': '{n} позиций',
  'listings.col.lot': 'Партия',
  'listings.col.category': 'Категория',
  'listings.col.unitPrice': 'Цена за единицу',
  'listings.col.moq': 'MOQ',
  'listings.col.available': 'В наличии',
  'listings.col.status': 'Статус',
  'listings.col.posted': 'Размещено',
  'listings.lotRef': 'партия #{id}',
  'listings.noPhotoInline': 'нет фото',
  'listings.demoNoteLead': 'Партия с меткой',
  'listings.demoNoteTail':
    '— демонстрационные данные площадки, а не размещённый вами товар. Удаление уберёт её для всех.',
  'listings.updated': 'Позиция обновлена.',
  'listings.deleted': 'Позиция удалена. Её больше нет на площадке.',
  'listings.deleteTitle': 'Удалить эту позицию?',
  'listings.deleteLead': '{name} — партия #{id}',
  'listings.deleteBody':
    'Позиция удаляется безвозвратно. Она сразу исчезает из каталога и из вашей таблицы, и покупатели больше не могут заказать её или торговаться. Отменить это нельзя.',
  'listings.deleteKeepBody':
    'Партию, по которой уже есть заказы или предложения, удалить нельзя — API хранит её для истории. Вместо этого отметьте её как распроданную, указав наличие 0.',
  'listings.keepListing': 'Оставить позицию',
  'listings.deleteForever': 'Удалить навсегда',
  'listings.deleting': 'Удаление…',
  'listings.deleteErr': 'Не удалось удалить эту позицию.',
  'listings.editTitle': 'Изменить позицию — партия #{id}',

  'post.title': 'Разместить товар',
  'post.titleEdit': 'Изменить позицию',
  'post.sub': 'Одна партия на позицию: что это, сколько стоит и сколько можете отгрузить сегодня',
  'post.subEdit': 'Изменение партии #{id} — сохранение перезаписывает опубликованную позицию',
  'post.signInSub': 'Разместите готовый товар, чтобы покупатели могли заказать его или торговаться',
  'post.notSignedIn': 'Вы не вошли',
  'post.notSignedInBody': 'Размещение товара — действие поставщика. Войдите с аккаунтом поставщика, чтобы опубликовать партию.',
  'post.createSupplierAccount': 'Создать аккаунт поставщика',
  'post.supplierOnly': 'Только аккаунты поставщиков',
  'post.supplierOnlyBody':
    'Ваш аккаунт — {role}, поэтому API не примет от него позицию. Для размещения товара нужен профиль поставщика.',
  'post.myListings': 'Мои позиции',
  'post.loadErrorTitle': 'Не удалось загрузить позицию',
  'post.loadErrorBody': 'Не удалось загрузить эту партию — повторите попытку или вернитесь к позициям.',
  'post.details': 'Данные позиции',
  'post.newListing': 'Новая позиция',
  'post.requiredMark': '* обязательно',
  'post.lotName': 'Название партии',
  'post.lotNamePlaceholder': 'например, медный катод сорт A, 99,99%',
  'post.category': 'Категория',
  'post.originCountry': 'Страна происхождения',
  'post.notStated': 'Не указано',
  'post.description': 'Описание',
  'post.descriptionPlaceholder': 'Сорт, упаковка, Инкотермс, срок, сертификаты…',
  'post.descriptionHint': 'Покупатели решают по этому тексту. Укажите, что в партии и как она отгружается.',
  'post.unitPrice': 'Цена за единицу',
  'post.currency': 'Валюта',
  'post.unit': 'Единица',
  'post.moq': 'Минимальный заказ (MOQ)',
  'post.moqHint': 'По умолчанию 1.',
  'post.available': 'Доступно сейчас',
  'post.availableHint': 'По умолчанию 0 — товар, который можете отгрузить сегодня.',
  'post.purity': 'Чистота / сорт',
  'post.purityPlaceholder': '99,99% / сорт A',
  'post.optional': 'Необязательно.',
  'post.photoUrl': 'Ссылка на фото',
  'post.photoPlaceholder': 'https://…/copper-cathode.jpg',
  'post.photoHintLead': 'Загрузка файлов ещё не реализована.',
  'post.photoHintTail':
    'Вставьте публичную ссылку на фото, и она сохранится как изображение партии. Партии без фото показывают простую заглушку.',
  'post.preview': 'Предпросмотр — если ничего не загрузилось, ссылка не ведёт прямо на изображение.',
  'post.save': 'Сохранить изменения',
  'post.saving': 'Сохранение…',
  'post.errName': 'Дайте партии название — минимум 2 символа.',
  'post.errCategory': 'Выберите категорию.',
  'post.errUnit': 'Укажите единицу продажи (т, кг, шт…).',
  'post.errPrice': 'Цена за единицу должна быть числом больше нуля.',
  'post.errMoq': 'MOQ должен быть числом больше нуля.',
  'post.errQty': 'Доступное количество не может быть отрицательным.',
  'post.errSave': 'Не удалось сохранить эту позицию.',
  'post.errCreate': 'Не удалось разместить эту позицию.',
  'post.behaviour': 'Как работает эта позиция',
  'post.behaviourBody':
    'Размещённая партия сразу появляется в каталоге, и любой вошедший покупатель может её заказать. Покупатели также могут открыть предложение ниже вашей цены; вы отвечаете на них в разделе',
  'post.offersLink': 'Предложения',
  'post.provenance': 'Происхождение',
  'post.platformListing': 'Позиция площадки',
  'post.photo': 'Фото',
  'post.urlOnly': 'Только ссылка — загрузка не реализована',
  'post.buyerPaysBy': 'Способ оплаты покупателя',
  'post.bankTransfer': 'Банковский перевод',
  'post.noMetrics':
    'Ничто на этой странице не показывает просмотры, рейтинги или число заказов — эти показатели пока не измеряются, поэтому не отображаются.',

  'offers.title': 'Предложения по вашему товару',
  'offers.sub': 'Покупатели, торгующиеся по вашим партиям',
  'offers.signInSub': 'Покупатели, торгующиеся по вашим партиям',
  'offers.notSignedIn': 'Вы не вошли',
  'offers.notSignedInBody': 'Предложения видны только покупателю и поставщику по ним. Войдите, чтобы ответить.',
  'offers.createSupplierAccount': 'Создать аккаунт поставщика',
  'offers.supplierOnly': 'Только аккаунты поставщиков',
  'offers.supplierOnlyBody':
    'Ваш аккаунт — {role}, под ним нет товара, поэтому предложения не поступают. Ваши предложения как покупателя находятся на стороне покупателя.',
  'offers.browseStock': 'Смотреть готовый склад',
  'offers.subLoading': 'Загрузка предложений…',
  'offers.subCount': 'предложений: {n} по вашим позициям',
  'offers.awaiting': 'ждут вашего ответа',
  'offers.decided': 'решено',
  'offers.acceptCreates': 'Принятие предложения создаёт заказ; покупатель платит банковским переводом.',
  'offers.filterAwaiting': 'Ждут ответа ({n})',
  'offers.filterDecided': 'Решённые ({n})',
  'offers.counterNote': 'Встречные предложения открывают новое связанное предложение; исходные условия остаются в истории.',
  'offers.loadErrorTitle': 'Не удалось загрузить предложения',
  'offers.loadErrorBody': 'Не удалось загрузить предложения по вашему товару — повторите попытку.',
  'offers.emptyTitle': 'Предложений пока нет',
  'offers.emptyBody':
    'Когда покупатель торгуется по одной из ваших партий, это появляется здесь с предложенной ценой и нужным количеством. Можно принять, отклонить или ответить своей ценой.',
  'offers.seeListings': 'Мои позиции',
  'offers.postMore': '+ Разместить ещё товар',
  'offers.noneAwaiting': 'Ничего не ждёт вашего ответа',
  'offers.noneDecided': 'Решённых предложений пока нет',
  'offers.noneAwaitingBody': 'На все предложения по вашему товару отвечено. Перейдите в «Решённые», чтобы посмотреть их.',
  'offers.noneDecidedBody': 'Принятые и отклонённые предложения хранятся здесь как история.',
  'offers.count': 'предложений: {n}',
  'offers.col.listing': 'Позиция',
  'offers.col.buyer': 'Покупатель',
  'offers.col.quantity': 'Количество',
  'offers.col.theirPrice': 'Их цена',
  'offers.col.status': 'Статус',
  'offers.col.received': 'Получено',
  'offers.decidedLabel': 'Решено',
  'offers.counter': 'Встречное',
  'offers.accept': 'Принять',
  'offers.reject': 'Отклонить',
  'offers.offerRef': 'предложение #{id}',
  'offers.answersOffer': 'ответ на предложение #{id}',
  'offers.demoNoteLead': 'Строка с меткой',
  'offers.demoNoteTail':
    'относится к демонстрационной партии, а не к вашему товару. Принятие всё равно создаёт реальный заказ — проверьте партию перед решением.',
  'offers.counterTitle': 'Встречное предложение #{id}',
  'offers.counterBody':
    '{buyer} предложил {price} за {qty} по позиции {product}. Ваш ответ станет новым связанным предложением; условия покупателя остаются в истории.',
  'offers.counterPrice': 'Ваша цена за единицу',
  'offers.perUnit': '{currency} за единицу',
  'offers.counterQty': 'Количество',
  'offers.counterQtyHint': 'Оставьте без изменений, чтобы сохранить количество покупателя.',
  'offers.counterNotes': 'Примечание покупателю',
  'offers.counterNotesPlaceholder': 'Срок, упаковка, Инкотермс, срок действия цены…',
  'offers.sendCounter': 'Отправить встречное',
  'offers.sending': 'Отправка…',
  'offers.counterErrPrice': 'Ваша встречная цена должна быть числом больше нуля.',
  'offers.counterErrQty': 'Количество должно быть числом больше нуля.',
  'offers.counterErr': 'Не удалось отправить встречное предложение.',
  'offers.counterDone': 'Встречное предложение отправлено. Исходное помечено как отвеченное, покупатель уведомлён.',
  'offers.acceptTitle': 'Принять предложение #{id}?',
  'offers.listing': 'Позиция',
  'offers.buyer': 'Покупатель',
  'offers.quantity': 'Количество',
  'offers.unitPrice': 'Цена за единицу',
  'offers.offerValue': 'Сумма предложения',
  'offers.acceptBodyLead': 'Принятие создаёт заказ.',
  'offers.acceptBodyBank': 'Покупатель берёт обязательство и платит через',
  'offers.acceptBodyTail':
    '— площадка не принимает оплату картой. Вы выставляете счёт-проформу и подтверждаете перевод при поступлении; затем заказ переходит к отгрузке. Решение окончательное: принятое предложение нельзя пересмотреть.',
  'offers.acceptCta': 'Принять и создать заказ',
  'offers.accepting': 'Принятие…',
  'offers.acceptErr': 'Не удалось принять это предложение.',
  'offers.acceptDone': 'Предложение #{id} принято. Создан заказ для {buyer}.',
  'offers.rejectTitle': 'Отклонить предложение #{id}?',
  'offers.rejectBody':
    'Предложение {buyer} на {price} по позиции {product} закрывается. Отклонение окончательное — покупатель не может возобновить это предложение, но может открыть новое.',
  'offers.rejectCta': 'Отклонить предложение',
  'offers.rejecting': 'Отклонение…',
  'offers.rejectErr': 'Не удалось отклонить это предложение.',
  'offers.rejectDone': 'Предложение #{id} отклонено.',

  'verify.title': 'Проверка',
  'verify.sub': 'Подавайте документы, отслеживайте решение проверяющего и видьте, что сообщается покупателям',
  'verify.signInSub': 'Документы, на которые покупатели опираются до оплаты',
  'verify.notSignedIn': 'Вы не вошли',
  'verify.notSignedInBody':
    'Документы проверки принадлежат аккаунту поставщика и никогда не публикуются в исходном виде. Войдите, чтобы подать или обновить их.',
  'verify.createSupplierAccount': 'Создать аккаунт поставщика',
  'verify.supplierOnly': 'Только аккаунты поставщиков',
  'verify.supplierOnlyBody': 'Ваш аккаунт — {role}, поэтому чек-лист поставщика для него не предусмотрен.',
  'verify.seeSuppliers': 'Смотреть проверенных поставщиков',
  'verify.approved': 'Одобрено документов',
  'verify.waiting': 'Ждут проверяющего',
  'verify.actionNeeded': 'Отсутствуют или возвращены',
  'verify.coreApproved': 'Основные документы одобрены',
  'verify.confirmed': 'Подтверждено',
  'verify.pending': 'В ожидании',
  'verify.yourDocs': 'Ваши документы',
  'verify.onFile': 'в деле: {n}',
  'verify.loadErrorTitle': 'Не удалось загрузить документы',
  'verify.loadErrorBody':
    'Не удалось загрузить документы проверки — повторите попытку. Если не помогает, у аккаунта может ещё не быть профиля поставщика.',
  'verify.emptyTitle': 'Документов в деле нет',
  'verify.emptyBody':
    'Пока ничего не подано, поэтому знак проверки покупателям не показывается. Подайте первый документ через форму — начните с {first}.',
  'verify.col.document': 'Документ',
  'verify.col.status': 'Статус',
  'verify.col.note': 'Примечание проверяющего',
  'verify.col.reviewed': 'Проверено',
  'verify.filed': 'подан {date}',
  'verify.reference': 'ссылка: {ref}',
  'verify.noReference': 'ссылка не указана',
  'verify.resubmit': 'Подать снова',
  'verify.tierFootnote':
    'Здесь перечислены только документы, которые API возвращает для вашего профиля поставщика. У отсутствующих типов просто нет строки — подача её создаст.',
  'verify.fileTitle': 'Подать или обновить документ',
  'verify.docType': 'Тип документа',
  'verify.existingHintPre': 'У вас уже есть строка для {doc} — статус',
  'verify.existingHintPost':
    '. Повторная подача перезапишет её и сбросит прежнее решение, поэтому одобренный документ потребует повторного одобрения.',
  'verify.refLabel': 'Ссылка на документ',
  'verify.refPlaceholder': 'https://…/business-licence.pdf или ваш номер документа',
  'verify.refHintLead': 'Загрузка файлов не реализована.',
  'verify.refHintTail':
    'Вставьте ссылку на документ или идентификатор, по которому команда проверки сможет его найти. Он хранится как есть и публично не показывается.',
  'verify.noteLabel': 'Примечание для проверяющего',
  'verify.notePlaceholder': 'Что изменилось, зачем обновляется, что важно знать проверяющему…',
  'verify.filing': 'Подача…',
  'verify.resubmitDoc': 'Подать {doc} снова',
  'verify.submitDoc': 'Подать {doc}',
  'verify.queueNoteLead': 'Отправка лишь ставит документ в очередь.',
  'verify.queueNoteStrong': 'Знак появляется у покупателей, когда проверяющий его одобрит',
  'verify.queueNoteTail': '— никогда при отправке и никогда автоматически.',
  'verify.filedNotice':
    '{doc} подан. Статус теперь «отправлен», документ ждёт в очереди проверки — знак появится у покупателей только после одобрения проверяющим.',
  'verify.errFile': 'Не удалось подать этот документ.',
  'verify.statusMeans': 'Что означает каждый статус',
  'verify.tierTitle': 'Уровень проверки',
  'verify.tierAll': 'Проверен · все основные документы одобрены',
  'verify.tierSome': 'Проверен · документы одобрены',
  'verify.tierNone': 'Пока не проверен',
  'verify.tierAllBody': 'Каждый тип основных документов на этой странице одобрен проверяющим.',
  'verify.tierSomeBody': 'Одобрен хотя бы один документ{n}; остальные основные типы усилят профиль.',
  'verify.tierNoneBody': 'Ни один документ пока не одобрен, поэтому покупателям не показывается знак проверки вашей компании.',
  'verify.tierHint':
    'Уровень аккаунта устанавливает команда проверки по одобренным документам — этот экран показывает статусы документов, которые возвращает API, и не вычисляет номер уровня сам. Покупатели видят знак только по одобренным документам.',
  'verify.suggested': 'Рекомендуемый следующий:',
  'verify.select': 'Выбрать',
  'verify.othersNote':
    'Покупатели также видят рейтинги и число инспекций других поставщиков в их профилях. Эти данные — демонстрационные данные площадки, а не результат этого чек-листа, поэтому здесь они намеренно не показываются.',
  'verify.help.missing.title': 'Не подан',
  'verify.help.missing.state': 'Ещё ничего не подано, или документ не отправлялся.',
  'verify.help.submitted.title': 'Ждёт проверки',
  'verify.help.submitted.state': 'Подан и ждёт в очереди проверки. Покупателям знак пока не показывается.',
  'verify.help.approved.title': 'Одобрен',
  'verify.help.approved.state': 'Проверяющий сверил его с самим документом. Это и видят покупатели.',
  'verify.help.rejected.title': 'Возвращён',
  'verify.help.rejected.state': 'Отклонён с примечанием. Исправьте документ и подайте снова.',
  'verify.doc.businessLicence': 'Свидетельство о регистрации бизнеса',
  'verify.doc.taxCertificate': 'Налоговое свидетельство',
  'verify.doc.factoryAudit': 'Отчёт об аудите завода',
  'verify.doc.productCert': 'Сертификат на продукцию',
  'verify.doc.exportLicence': 'Экспортная лицензия',
};

const zh: Partial<Record<DictKey, string>> = {
  'status.open': '开放中',
  'status.quoted': '已报价',
  'status.closed': '已关闭',
  'status.submitted': '已提交',
  'status.accepted': '已接受',
  'status.rejected': '已拒绝',
  'status.active': '在售',
  'status.sold_out': '已售罄',
  'status.scheduled': '已排期',
  'status.in_progress': '进行中',
  'status.passed': '已通过',
  'status.failed': '未通过',
  'status.pending': '待处理',
  'status.paid': '已付款',
  'status.shipped': '已发货',
  'status.delivered': '已送达',
  'status.cancelled': '已取消',
  'status.missing': '未提交',
  'status.approved': '已核准',
  'status.countered': '已还盘',
  'status.withdrawn': '已撤回',
  'status.inspecting': '检验进行中',

  'action.close': '关闭',
  'action.cancel': '取消',
  'action.dismiss': '忽略',
  'action.refresh': '刷新',
  'action.refreshing': '正在刷新…',
  'action.tryAgain': '重试',
  'action.clear': '清除',
  'action.clearFilters': '清除筛选',
  'action.search': '搜索',
  'action.save': '保存更改',
  'action.discard': '放弃',
  'action.signIn': '登录',
  'action.signOut': '退出登录',
  'action.signingIn': '正在登录…',
  'action.joinFree': '免费注册',
  'action.createAccount': '创建账号',
  'action.creatingAccount': '正在创建账号…',
  'action.backToExplore': '返回浏览',
  'action.open': '打开',
  'action.edit': '编辑',
  'action.delete': '删除',

  'common.loading': '加载中…',
  'common.loadingEllipsis': '加载中…',
  'common.notSet': '未填写',
  'common.optional': '选填',
  'common.required': '必填',
  'common.newestFirst': '最新优先',
  'common.anyCountry': '不限国家',
  'common.allCountries': '全部国家',
  'common.verified': '已认证',
  'common.tradeAbbrev':
    'RFQ = 询价单 · MOQ = 最小起订量 · FOB = 船上交货 · TT = 电汇',

  'nav.feed': '首页',
  'nav.explore': '浏览',
  'nav.exploreStock': '浏览现货',
  'nav.offersBuyer': '我的报价',
  'nav.rfqs': '我的询价单',
  'nav.orders': '订单',
  'nav.shipments': '物流',
  'nav.messages': '消息',
  'nav.saved': '已收藏',
  'nav.savedLots': '收藏的货源',
  'nav.notifications': '通知',
  'nav.help': '帮助中心',
  'nav.helpCentre': '帮助中心',
  'nav.howItWorks': '运作方式',
  'nav.profile': '账号资料',
  'nav.listings': '我的货源',
  'nav.post': '发布货源',
  'nav.postStock': '发布货源',
  'nav.offersSup': '报价',
  'nav.rfqOpps': '询价机会',
  'nav.verification': '资质认证',
  'nav.suppliers': '供应商',
  'nav.overview': '总览',
  'nav.adminSuppliers': '供应商',
  'nav.adminVerify': '认证审核台',
  'nav.adminListings': '货源',
  'nav.adminRfqs': '询价单',
  'nav.adminPayments': '付款',
  'nav.sources': '货源渠道',
  'nav.growth': '横幅与推广',
  'nav.features': '功能开关',

  'topbar.searchPlaceholder': '搜索产品、供应商、类目…',
  'topbar.searchAria': '搜索平台内容',
  'topbar.notifications': '通知',
  'topbar.createAccountTitle': '创建账号',
  'topbar.account': '账号',
  'topbar.languageAria': '界面语言',
  'rail.allIndustries': '全部行业',
  'rail.howItWorks': '运作方式',
  'sidebar.moreIndustries': '更多行业，更多国家。',
  'sidebar.moreIndustriesSub': '一个现货交易平台。',

  'gate.title': '会员权限',
  'gate.body': '联系供应商、发布询价和报价均为会员操作。浏览平台始终免费开放。',
  'gate.createAccount': '创建免费账号',
  'gate.haveAccount': '我已有账号',

  'cards.noPhoto': '暂无图片',
  'cards.moq': 'MOQ',
  'cards.saveLot': '收藏该货源',
  'cards.demo': '演示',
  'cards.demoTitle': '演示数据 — 并非真实报价',
  'cards.inspections': '次检验',

  'auth.signIn.sub': '查看您的订单、报价和询价单。',
  'auth.email': '邮箱',
  'auth.password': '密码',
  'auth.signInCta': '登录',
  'auth.newHere': '首次来访？',
  'auth.demoNotice': '演示提示',
  'auth.seededLogin': '预置审核账号',
  'auth.fillIn': '填入',
  'auth.demoHintLead': '是预置的',
  'auth.demoHintLead2': '演示',
  'auth.demoHintTail': '账号，用于体验管理后台。它不是真实卖家 — 请勿输入真实凭据。',
  'auth.demoHintProduct': '管理员',
  'auth.signInFailed': '登录失败',
  'auth.signUp.title': '创建账号',
  'auth.signUp.sub': '一个账号即可采购、销售，或提供检验与物流服务。',
  'auth.fullName': '姓名',
  'auth.workEmail': '工作邮箱',
  'auth.minChars': '至少 8 个字符',
  'auth.atLeast8': '至少 8 个字符。',
  'auth.iAmA': '我的身份是…',
  'auth.company': '公司',
  'auth.country': '国家',
  'auth.countryHint': '土耳其、中国…',
  'auth.createCta': '创建账号',
  'auth.alreadyRegistered': '已注册？',
  'auth.signUpHint': '发布免费。信任标识需通过认证、检验和交付记录获得。',
  'auth.registerFailed': '注册失败',
  'auth.role.buyer': '采购方',
  'auth.role.buyerHint': '我采购产品',
  'auth.role.supplier': '供应商',
  'auth.role.supplierHint': '我销售 / 生产',
  'auth.role.inspector': '检验机构',
  'auth.role.inspectorHint': '我审核工厂',
  'auth.role.lab': '实验室',
  'auth.role.labHint': '我检测材料',
  'auth.role.logistics': '物流',
  'auth.role.logisticsHint': '我运输货物',

  'profile.title': '账号资料',
  'profile.sub': '对方在您的报价、订单和消息中看到的信息。',
  'profile.signInSub': '登录以管理您的账号',
  'profile.notSignedIn': '您尚未登录',
  'profile.notSignedInBody': '账号资料仅您本人可见：登录后即可查看和编辑。',
  'profile.createAccount': '创建账号',
  'profile.accountDetails': '账号信息',
  'profile.unsaved': '有未保存的更改',
  'profile.fullName': '姓名',
  'profile.company': '公司',
  'profile.notSet': '未填写',
  'profile.country': '国家',
  'profile.language': '界面语言',
  'profile.languageHint': '立即切换界面语言，并在点击“保存更改”后同步到您的账号。',
  'profile.save': '保存更改',
  'profile.saving': '正在保存…',
  'profile.saved': '已保存',
  'profile.savedBody': '账号资料已更新。',
  'profile.identity': '身份信息',
  'profile.identityNote': '邮箱和角色无法在此修改。它们在创建账号时即已固定，账号资料接口也不接受这两项。',
  'profile.email': '邮箱',
  'profile.role': '角色',
  'profile.readOnly': '只读',
  'profile.readOnlyEmail': '只读 — 账号资料接口不接受邮箱',
  'profile.readOnlyRole': '只读 — 账号资料接口不接受角色',
  'profile.emailStatus': '邮箱状态',
  'profile.emailVerified': '邮箱已验证',
  'profile.emailNotVerified': '邮箱未验证',
  'profile.memberSince': '注册时间',
  'profile.accountLine': '账号 #{id} · 以 {role} 身份登录',
  'profile.errName': '请输入姓名 — 接口不接受空姓名。',
  'profile.errSave': '账号资料保存失败 — 请重试。',

  'explore.title': '浏览现货',
  'explore.subLoading': '正在加载现货货源…',
  'explore.subCount': '{n} 条货源符合您的筛选',
  'explore.searchPlaceholder': '铜阴极、泵类…',
  'explore.searchAria': '搜索货源',
  'explore.categoryAria': '类目',
  'explore.allCategories': '全部类目',
  'explore.originAria': '原产国',
  'explore.allCountries': '全部国家',
  'explore.min': '最低 $',
  'explore.max': '最高 $',
  'explore.emptyTitle': '没有符合这些筛选的货源',
  'explore.emptyBody': '请尝试更宽的类目、不同的原产国，或清除筛选条件。',
  'explore.page': '第 {page} 页，共 {pages} 页',
  'explore.prev': '← 上一页',
  'explore.next': '下一页 →',

  'feed.welcomeBack': '欢迎回来，{name}',
  'feed.title': '平台首页',
  'feed.sub': '来自已认证工厂的现货、余料和超储货源 — 最新优先。',
  'feed.sellStock': '我要卖货',
  'feed.postRequest': '发布询价',
  'feed.lotsCount': '{n} 条货源',
  'feed.lotsMatch': '条货源符合您的筛选',
  'feed.verifiedSuppliers': '家已认证供应商',
  'feed.openRequests': '条开放询价',
  'feed.allOrigins': '全部产地',
  'feed.searchAria': '搜索货源',
  'feed.minAria': '最低价格',
  'feed.maxAria': '最高价格',
  'feed.allIndustries': '全部行业',
  'feed.noLots': '暂无货源',
  'feed.shownRange': '{total} 条中的第 {first}–{last} 条',
  'feed.emptyTitle': '没有符合这些筛选的货源',
  'feed.emptyBody': '请尝试其他行业、其他原产国，或清除筛选条件。',
  'feed.lookingFor': '在找特定货源？',
  'feed.postRequestLink': '发布询价',
  'feed.lookingForTail': '让已认证工厂为您报价。',
  'feed.sellingInstead': '想出售？',
  'feed.listYourStock': '发布您的货源',
  'feed.signedInAs': '已以 {role} 身份登录',
  'feed.createFree': '创建免费账号',

  'help.title': 'FactoryDepo 如何运作',
  'help.sub': '现货货源、询价单，以及以检验为支撑的供应。',
  'help.buying': '采购',
  'help.buying1.title': '1. 浏览现货。',
  'help.buying1':
    '每条在售货源都会显示价格、最小起订量、原产国以及实际可售数量。标注“演示”的货源是演示数据，并非真实报价，我们明确标注以免误导。',
  'help.buying2.title': '2. 索取报价。',
  'help.buying2': '发布询价说明您的需求。供应商会针对该询价给出价格、交期和条款。',
  'help.buying3.title': '3. 比较并下单。',
  'help.buying3': '报价会在询价单中并排显示。接受其中一个即生成订单。',
  'help.buying4.title': '4. 通过银行转账付款。',
  'help.buying4':
    '工业贸易不走信用卡。您会收到形式发票，以 TT/电汇结算，款项确认后订单标记为已付款。',
  'help.selling': '销售',
  'help.selling1.title': '1. 创建供应商账号。',
  'help.selling1': '以供应商身份注册会立即创建您的公司资料。',
  'help.selling2.title': '2. 发布您的货源。',
  'help.selling2': '发布工具正在开发中 — 上线前，供应商货源由我们的团队在入驻时添加。',
  'help.selling3.title': '3. 对收到的询价报价。',
  'help.selling3': '买家的开放询价会出现在您的看板中，并实时显示未回复数量。',
  'help.selling4.title': '4. 完成认证。',
  'help.selling4': '认证等级会解锁曝光。只有文件审核通过才会授予标识，因此本站的标识是有意义的。',
  'help.notLive': '尚未上线的功能',
  'help.notLiveLead': '我们宁愿直说，也不愿让您自己发现：',
  'help.notLive1': '供应商自助发布工具正在开发中。',
  'help.notLive2': '买卖双方的消息功能尚未开放 — 请使用供应商资料页上的联系方式。',
  'help.notLive3': '报价与还盘目前由人工处理。',
  'help.notLive4': '物流跟踪与单据处理尚未开发。',
  'help.exploreCta': '浏览现货',
  'help.rfqCta': '询价单',

  'soon.sub': '尚未开发',
  'soon.title': '该页面属于下一阶段开发内容',
  'soon.body': '该页面已存在于导航中，但数据表格和接口尚未开发。',
  'soon.note.offers': '报价与还盘表格将在下一阶段开发中上线。',
  'soon.note.shipments': '物流节点与单据将在下一阶段开发中上线。',
  'soon.note.messages': '买卖双方的消息功能将在下一阶段开发中上线。',
  'soon.note.saved': '收藏的货源将在下一阶段开发中上线。',
  'soon.note.notifications': '通知中心将在下一阶段开发中上线。',
  'soon.note.profile': '账号资料编辑将在下一阶段开发中上线。',
  'soon.note.listings': '带归属校验的供应商货源管理将在下一阶段开发中上线。',
  'soon.note.post': '带图片上传的货源创建/编辑将在下一阶段开发中上线。',
  'soon.note.generic': '将在下一阶段开发中上线。',
  'soon.note.verification': '认证等级与文件提交将在下一阶段开发中上线。',
  'soon.note.admin': '管理后台将在下一阶段开发中上线。',
  'soon.note.sources': '供应商人工录入将在下一阶段开发中上线。',
  'soon.note.features': '功能开关将在下一阶段开发中上线。',

  'orders.title': '订单',
  'orders.signInSub': '登录后查看您参与的订单',
  'orders.notSignedIn': '您尚未登录',
  'orders.notSignedInBody': '订单属于隐私信息：登录后查看您已承诺购买或销售的内容。',
  'orders.createAccount': '创建账号',
  'orders.subSupplier': '买家向您的货源下达的订单',
  'orders.subBuyer': '您已承诺购买的全部内容',
  'orders.statListings': '我的货源',
  'orders.statOffersReceived': '收到的报价',
  'orders.statOffersOnRfqs': '我的询价单上的报价',
  'orders.statOrders': '订单',
  'orders.statSoldItems': '已售商品',
  'orders.statSoldTitle': '已发货或已送达的订单',
  'orders.statViews': '浏览量 · 尚未统计',
  'orders.statViewsTitle': '浏览量统计尚未实现',
  'orders.metricsError': '暂时无法加载指标。',
  'orders.loadErrorTitle': '无法加载订单',
  'orders.loadErrorBody': '接口未返回您的订单。请刷新页面或重新登录。',
  'orders.emptyTitle': '暂无订单',
  'orders.emptySupplier': '买家向您的货源下单后会显示在这里。',
  'orders.emptyBuyer': '您在现货上提交的立即购买订单会显示在这里。',
  'orders.browseStock': '浏览现货',
  'orders.postRfq': '发布询价',
  'orders.count': '{n} 个订单',
  'orders.col.order': '订单',
  'orders.col.product': '产品',
  'orders.col.counterparty': '对方',
  'orders.col.qty': '数量',
  'orders.col.total': '总额',
  'orders.col.status': '状态',
  'orders.col.date': '日期',
  'orders.buyerLabel': '买家',
  'orders.supplierLabel': '供应商',
  'orders.buyerId': '买家 #{id}',

  'product.loadingTitle': '加载中…',
  'product.loadingThis': '该货源',
  'product.fetching': '正在获取{what}…',
  'product.notFound': '未找到该产品',
  'product.backToExplore': '返回浏览',
  'product.noPhoto': '该货源未提供图片',
  'product.pricePer': '价格 / {unit}',
  'product.minOrder': '最小起订量',
  'product.availableNow': '现有可售',
  'product.origin': '原产国',
  'product.unavailable': '当前不可售',
  'product.buyNowHeading': '立即购买 — 现货',
  'product.soldOutBody': '该货源已标记售罄。请向供应商咨询下一批货。',
  'product.noUnitsBody': '当前没有可售数量。请向供应商咨询下一批货。',
  'product.purchaseTerms': '按标价 {price}/{unit} 购买，最小起订量 {moq} {unit}。',
  'product.stockOnHand': '在手库存',
  'product.buyNowPrice': '立即购买 · {price}/{unit}',
  'product.outOfStock': '立即购买 — 缺货',
  'product.requestQuote': '索取报价',
  'product.shipsFrom': '从{country}发货',
  'product.signInToOrder': '登录后可下单或索取报价。',
  'product.supplier': '供应商',
  'product.viewProfile': '查看资料',
  'product.loadingSupplier': '正在加载供应商…',
  'product.supplierUnavailable': '供应商信息不可用。',
  'product.rating': '评分',
  'product.inspections': '检验次数',
  'product.fulfilment': '按时交付率',
  'product.verifiedLevel': '认证等级',
  'product.levelN': '{n} 级',
  'product.tradingSince': '经营起始',
  'product.supplierFiguresHint': '这些数据是该供应商在平台的整体表现，并非仅针对该货源。',
  'product.description': '描述',
  'product.noDescription': '供应商尚未添加描述。可索取报价以了解规格、交期和交付条款。',
  'product.specification': '规格',
  'product.noSpec': '该货源没有规格记录。',
  'product.col.attribute': '项目',
  'product.col.value': '数值',
  'product.spec.category': '类目',
  'product.spec.unit': '单位',
  'product.spec.purity': '纯度 / 等级',

  'checkout.title': '立即购买 — 结算',
  'checkout.placedTitle': '订单已提交',
  'checkout.confirmed': '订单 #{id} 已确认',
  'checkout.notified': '已通知供应商。可在订单页面跟踪该订单。',
  'checkout.viewOrders': '查看订单',
  'checkout.keepBrowsing': '继续浏览',
  'checkout.pricePer': '价格 / {unit}',
  'checkout.minimumOrder': '最小起订量',
  'checkout.availableNow': '现有可售',
  'checkout.quantity': '数量（{unit}）',
  'checkout.qtyHint': '库存为 {moq} 至 {stock} {unit}。',
  'checkout.fullName': '姓名',
  'checkout.country': '国家',
  'checkout.address': '详细地址',
  'checkout.city': '城市',
  'checkout.phone': '电话',
  'checkout.notes': '给供应商的备注',
  'checkout.total': '合计 {total}',
  'checkout.placeOrder': '提交订单 · {total}',
  'checkout.placing': '正在提交订单…',
  'checkout.errPlace': '无法提交订单。',

  'rfqModal.title': '索取报价',
  'rfqModal.postedTitle': '询价已发布',
  'rfqModal.live': '您的需求已在询价专区发布',
  'rfqModal.canQuote': '已认证供应商现在可以报出价格和交期。',
  'rfqModal.viewMine': '查看我的询价单',
  'rfqModal.listedBy': '{product} · 发布方 {supplier}',
  'rfqModal.quantity': '数量',
  'rfqModal.unit': '单位',
  'rfqModal.specs': '规格、认证、交付条款',
  'rfqModal.moqHint': '该货源的最小起订量为 {moq} {unit}。',
  'rfqModal.post': '发布询价',
  'rfqModal.posting': '正在发布…',
  'rfqModal.errPost': '无法发布该询价。',
  'rfqModal.titleSuffix': '询价',

  'suppliers.loadingSub': '正在获取供应商目录',
  'suppliers.loadingBody': '正在获取供应商目录…',
  'suppliers.title': '供应商目录',
  'suppliers.sub': 'FactoryDepo 上的工厂与贸易商。认证等级来自实地审核与文件核查。',
  'suppliers.demoNote': '标注演示的行是演示数据',
  'suppliers.loadErrorTitle': '无法加载目录',
  'suppliers.loadErrorBody': '供应商服务未响应。请稍后重试。',
  'suppliers.emptyTitle': '尚无供应商',
  'suppliers.emptyBody': '供应商完成入驻和认证后会显示在这里。',
  'suppliers.totalListed': '已收录供应商',
  'suppliers.totalVerified': '2 级及以上认证',
  'suppliers.avgRating': '平均评分',
  'suppliers.avgRatingRated': '平均评分（{n} 家已评分）',
  'suppliers.avgFulfilment': '按时交付率',
  'suppliers.avgFulfilmentMeasured': '按时交付率（{n} 家已测）',
  'suppliers.searchPlaceholder': '公司、国家、城市、能力…',
  'suppliers.searchAria': '搜索供应商',
  'suppliers.verifiedOnly': '仅看已认证',
  'suppliers.showing': '显示 {total} 条中的 {shown} 条',
  'suppliers.noMatchTitle': '没有符合该搜索的供应商',
  'suppliers.noMatchBody': '请尝试更短的公司名称，或取消认证筛选。',
  'suppliers.rating': '评分',
  'suppliers.inspections': '检验',
  'suppliers.fulfilment': '交付表现',

  'supplierDetail.loadingThis': '该供应商资料',
  'supplierDetail.notFound': '未找到该供应商',
  'supplierDetail.backToDirectory': '返回目录',
  'supplierDetail.backShort': '← 返回目录',
  'supplierDetail.tradingSince': '自 {year} 年起经营',
  'supplierDetail.verifiedL3': '已认证 · 3 级',
  'supplierDetail.registered': '已注册',
  'supplierDetail.buyerRating': '买家评分',
  'supplierDetail.notRated': '暂无评分',
  'supplierDetail.inspections': '实地检验',
  'supplierDetail.fulfilment': '按时交付率',
  'supplierDetail.activeListings': '在售货源',
  'supplierDetail.tier': '认证等级',
  'supplierDetail.trustScore': '信任分（0–100）',
  'supplierDetail.about': '关于 {company}',
  'supplierDetail.noDescription': '该供应商尚未发布公司简介。',
  'supplierDetail.capabilities': '申报能力',
  'supplierDetail.record': '认证与记录',
  'supplierDetail.ratingLabel': '买家评分',
  'supplierDetail.inspectionsDone': '已完成检验',
  'supplierDetail.contact': '联系',
  'supplierDetail.contactBody': '检验报告和认证文件在首次联系后向会员共享。',
  'supplierDetail.contactSupplier': '联系供应商',
  'supplierDetail.contactHintSignedIn': '将打开询价专区 — 报价沟通在那里进行。',
  'supplierDetail.contactHintGuest': '仅限会员 · 免费加入',
  'supplierDetail.services': '贸易服务',
  'supplierDetail.service1': '付款前工厂检验',
  'supplierDetail.service2': '实验室检测与材料分析',
  'supplierDetail.service3': '装箱监装',
  'supplierDetail.service4': '出口单证支持',
  'supplierDetail.stockFrom': '{company} 的货源',
  'supplierDetail.shown': '显示 {n} 条',
  'supplierDetail.loadingLots': '正在加载现货货源…',
  'supplierDetail.noneShown': '未显示在售货源',
  'supplierDetail.noneShownBody':
    '接口显示该供应商有 {n} 条货源，但当前列表视图中未返回任何一条。可通过询价专区发布询价以了解其产品目录。',

  'rfq.titleSupplier': '询价机会',
  'rfq.titleBuyer': '询价单',
  'rfq.subSupplier': '买家发布的开放需求。请报出您的价格和交期。',
  'rfq.subBuyer': '专区中当前的需求，最新优先。打开一条即可查看已收到的报价。',
  'rfq.postRequest': '+ 发布询价',
  'rfq.buyerOnlyNotice': '仅买家账号可以发布询价。请以买家身份登录后发布。',
  'rfq.total': '条询价',
  'rfq.open': '条开放',
  'rfq.quoted': '条已报价',
  'rfq.closed': '条已关闭',
  'rfq.quoteable': '您可以报价的询价',
  'rfq.allRequests': '全部询价',
  'rfq.shown': '显示 {n} 条',
  'rfq.statusAll': '全部',
  'rfq.statusOpenCount': '开放（{n}）',
  'rfq.statusQuotedCount': '已报价（{n}）',
  'rfq.quotingCloses': '买家接受某一报价后即停止报价。',
  'rfq.emptyNone': '暂无询价',
  'rfq.emptyNoMatch': '没有符合该筛选的内容',
  'rfq.emptyNoneSupplier': '专区当前没有开放需求。',
  'rfq.emptyNoneBuyer': '发布您的第一个需求，已认证工厂会前来报价。',
  'rfq.emptyNoMatchHint': '请尝试其他状态筛选。',
  'rfq.col.requirement': '需求',
  'rfq.col.quantity': '数量',
  'rfq.col.deliverTo': '交付地',
  'rfq.col.quotes': '报价',
  'rfq.col.posted': '发布日期',
  'rfq.col.status': '状态',
  'rfq.openAria': '打开询价 #{id}',
  'rfq.requestRef': '{category} · 询价 #{id}',
  'rfq.quotesCount': '{n} 条报价',
  'rfq.postingBuyerOnly': '发布询价是买家操作。供应商可以',
  'rfq.quoteOpen': '对开放需求报价',
  'rfq.newTitle': '新建询价单',
  'rfq.whatNeed': '您需要什么？',
  'rfq.titlePlaceholder': '例如：100 吨 A 级铜阴极',
  'rfq.category': '类目',
  'rfq.deliverTo': '交付地',
  'rfq.quantity': '数量',
  'rfq.unit': '单位',
  'rfq.specification': '规格',
  'rfq.specPlaceholder': '等级、纯度、认证、贸易术语、包装…',
  'rfq.specHint': '规格越清晰，已认证工厂报价越快。',
  'rfq.errTitle': '请给出清晰的标题 — 至少 5 个字符。',
  'rfq.errQuantity': '数量必须是大于零的数字。',
  'rfq.errPost': '无法发布该询价。',

  'rfqDetail.loadingTitle': '询价',
  'rfqDetail.loadingSub': '加载中…',
  'rfqDetail.title': '询价',
  'rfqDetail.notFound': '未找到该询价',
  'rfqDetail.notFoundBody': '该需求可能已撤回，或链接有误。',
  'rfqDetail.backToRequests': '← 返回询价列表',
  'rfqDetail.allRequests': '← 全部询价',
  'rfqDetail.postedOn': '发布于 {date}',
  'rfqDetail.requestRef': '询价 #{id}',
  'rfqDetail.accepting': '正在接受报价',
  'rfqDetail.notAccepting': '不再接受新报价',
  'rfqDetail.noSpec': '未提供更多规格说明。',
  'rfqDetail.quantity': '数量',
  'rfqDetail.deliverTo': '交付地',
  'rfqDetail.quotations': '报价',
  'rfqDetail.deadline': '截止日期',
  'rfqDetail.requestedBy': '询价方',
  'rfqDetail.received': '已收到 {n} 条',
  'rfqDetail.noneTitle': '暂无报价',
  'rfqDetail.noneBody': '已认证供应商正在查看该需求。',
  'rfqDetail.col.supplier': '供应商',
  'rfqDetail.col.price': '价格',
  'rfqDetail.col.leadTime': '交期',
  'rfqDetail.col.notes': '备注',
  'rfqDetail.col.sent': '发送时间',
  'rfqDetail.col.status': '状态',
  'rfqDetail.trustScore': '信任分 {n}',
  'rfqDetail.days': '{n} 天',
  'rfqDetail.submitTitle': '提交报价',
  'rfqDetail.supplierAccount': '供应商账号',
  'rfqDetail.fromSupplier': '报价来自供应商账号。请切换到您的供应商账号来回复该询价。',
  'rfqDetail.signInSupplierBody': '只有已登录的供应商账号可以报价。浏览对所有人开放。',
  'rfqDetail.supplierOnly': '仅限供应商账号',
  'rfqDetail.signInAsSupplier': '以供应商身份登录',
  'rfqDetail.closedBody': '该询价{status}，已不再接受报价。',
  'rfqDetail.seeOpen': '查看开放询价',
  'rfqDetail.respondBody': '请报出您的单价和交期。您的认证资料会随报价一同展示。',
  'rfqDetail.unitPrice': '单价（USD）',
  'rfqDetail.leadTime': '交期（天）',
  'rfqDetail.termsNotes': '条款与备注',
  'rfqDetail.termsPlaceholder': '贸易术语、等级、包装、样品政策、有效期…',
  'rfqDetail.compareHint': '买家会并排比较价格、交期和认证情况。',
  'rfqDetail.submitQuote': '提交报价',
  'rfqDetail.submitting': '正在提交…',
  'rfqDetail.errPrice': '请输入大于零的单价。',
  'rfqDetail.errLead': '交期必须是 1 到 365 之间的整数天。',
  'rfqDetail.errSubmit': '无法提交该报价。',

  'listings.title': '我的货源',
  'listings.sub': '您在平台上发布的货源',
  'listings.signInSub': '您在平台上发布的货源',
  'listings.notSignedIn': '您尚未登录',
  'listings.notSignedInBody': '您的货源仅您的供应商账号可见。登录后即可查看和管理。',
  'listings.createSupplierAccount': '创建供应商账号',
  'listings.supplierOnly': '仅限供应商账号',
  'listings.supplierOnlyBody': '您的账号是{role}账号。货源由拥有它的供应商管理，因此这里没有可查看或编辑的内容。',
  'listings.browseStock': '浏览现货',
  'listings.subLoading': '正在加载您的货源…',
  'listings.subCount': '您的供应商资料下已发布 {n} 条货源',
  'listings.postStock': '+ 发布货源',
  'listings.lotsPublished': '条货源已发布',
  'listings.viewsNotTracked': '浏览量 · 尚未统计',
  'listings.bankTransferNote': '报价被接受后，买家通过银行转账付款。',
  'listings.loadErrorTitle': '无法加载您的货源',
  'listings.loadErrorBody': '无法加载您的货源 — 请重试。若持续失败，请重新登录。',
  'listings.emptyTitle': '暂无货源',
  'listings.emptyBody': '发布您的第一条货源 — 一张图片、单价，以及今天可发货的数量。它会立即出现在“浏览”中，供平台上所有买家查看。',
  'listings.postFirst': '+ 发布第一条货源',
  'listings.getVerified': '完成认证',
  'listings.count': '{n} 条货源',
  'listings.col.lot': '货源',
  'listings.col.category': '类目',
  'listings.col.unitPrice': '单价',
  'listings.col.moq': 'MOQ',
  'listings.col.available': '可售',
  'listings.col.status': '状态',
  'listings.col.posted': '发布日期',
  'listings.lotRef': '货源 #{id}',
  'listings.noPhotoInline': '暂无图片',
  'listings.demoNoteLead': '标注',
  'listings.demoNoteTail': '的货源是平台提供的演示数据，并非您发布的货源。删除会对所有人移除它。',
  'listings.updated': '货源已更新。',
  'listings.deleted': '货源已删除，平台上不再显示。',
  'listings.deleteTitle': '删除该货源？',
  'listings.deleteLead': '{name} — 货源 #{id}',
  'listings.deleteBody':
    '该货源将被永久移除。它会立即从“浏览”和您的货源表中消失，买家也无法再下单或议价。此操作无法撤销。',
  'listings.deleteKeepBody':
    '已有订单或报价的货源不能删除 — 接口会保留记录。请改为将可售库存设为 0，标记为售罄。',
  'listings.keepListing': '保留货源',
  'listings.deleteForever': '永久删除',
  'listings.deleting': '正在删除…',
  'listings.deleteErr': '无法删除该货源。',
  'listings.editTitle': '编辑货源 — 货源 #{id}',

  'post.title': '发布货源',
  'post.titleEdit': '编辑货源',
  'post.sub': '一条货源对应一批货：是什么、什么价格、今天能发多少',
  'post.subEdit': '正在修改货源 #{id} — 保存将覆盖已发布的货源',
  'post.signInSub': '发布现货，让买家下单或议价',
  'post.notSignedIn': '您尚未登录',
  'post.notSignedInBody': '发布货源是供应商操作。请以供应商账号登录后发布货源。',
  'post.createSupplierAccount': '创建供应商账号',
  'post.supplierOnly': '仅限供应商账号',
  'post.supplierOnlyBody': '您的账号是{role}账号，接口不会接受其发布的货源。发布货源前需要供应商资料。',
  'post.myListings': '我的货源',
  'post.loadErrorTitle': '无法加载货源',
  'post.loadErrorBody': '无法加载该货源 — 请重试，或返回您的货源列表。',
  'post.details': '货源信息',
  'post.newListing': '新货源',
  'post.requiredMark': '* 必填',
  'post.lotName': '货源名称',
  'post.lotNamePlaceholder': '例如：A 级铜阴极，99.99%',
  'post.category': '类目',
  'post.originCountry': '原产国',
  'post.notStated': '未填写',
  'post.description': '描述',
  'post.descriptionPlaceholder': '等级、包装、贸易术语、交期、证书…',
  'post.descriptionHint': '买家据此判断。请说明货源内容和发货方式。',
  'post.unitPrice': '单价',
  'post.currency': '币种',
  'post.unit': '单位',
  'post.moq': '最小起订量（MOQ）',
  'post.moqHint': '默认为 1。',
  'post.available': '现有可售',
  'post.availableHint': '默认为 0 — 即今天可发货的库存。',
  'post.purity': '纯度 / 等级',
  'post.purityPlaceholder': '99.99% / A 级',
  'post.optional': '选填。',
  'post.photoUrl': '图片链接',
  'post.photoPlaceholder': 'https://…/copper-cathode.jpg',
  'post.photoHintLead': '文件上传尚未开发。',
  'post.photoHintTail': '粘贴图片的公开链接，它会作为该货源的图片保存。没有图片的货源会显示简单的占位图。',
  'post.preview': '预览 — 若无法加载，说明该链接不是直接图片地址。',
  'post.save': '保存更改',
  'post.saving': '正在保存…',
  'post.errName': '请为货源命名 — 至少 2 个字符。',
  'post.errCategory': '请选择类目。',
  'post.errUnit': '请说明您的销售单位（吨、千克、件…）。',
  'post.errPrice': '单价必须是大于零的数字。',
  'post.errMoq': 'MOQ 必须是大于零的数字。',
  'post.errQty': '可售数量不能为负数。',
  'post.errSave': '无法保存该货源。',
  'post.errCreate': '无法发布该货源。',
  'post.behaviour': '该货源如何运作',
  'post.behaviourBody': '发布的货源会立即出现在“浏览”中，任何已登录买家都可以下单。买家也可以开出低于您标价的报价；您可以在',
  'post.offersLink': '报价',
  'post.provenance': '来源',
  'post.platformListing': '平台货源',
  'post.photo': '图片',
  'post.urlOnly': '仅链接 — 上传未开发',
  'post.buyerPaysBy': '买家付款方式',
  'post.bankTransfer': '银行转账',
  'post.noMetrics': '本页不显示浏览量、评分或订单数 — 这些指标尚未统计，因此不予显示。',

  'offers.title': '您货源收到的报价',
  'offers.sub': '正在对您的货源议价的买家',
  'offers.signInSub': '正在对您的货源议价的买家',
  'offers.notSignedIn': '您尚未登录',
  'offers.notSignedInBody': '报价仅买家与相关供应商可见。登录后可回复。',
  'offers.createSupplierAccount': '创建供应商账号',
  'offers.supplierOnly': '仅限供应商账号',
  'offers.supplierOnlyBody': '您的账号是{role}账号，其名下没有货源，因此不会收到报价。您作为买家发出的报价在平台的买家侧。',
  'offers.browseStock': '浏览现货',
  'offers.subLoading': '正在加载报价…',
  'offers.subCount': '您的货源上有 {n} 条报价',
  'offers.awaiting': '条等待您回复',
  'offers.decided': '条已处理',
  'offers.acceptCreates': '接受报价会生成订单；买家通过银行转账付款。',
  'offers.filterAwaiting': '等待回复（{n}）',
  'offers.filterDecided': '已处理（{n}）',
  'offers.counterNote': '还盘会生成一条关联的新报价；您的原始条款仍保留在记录中。',
  'offers.loadErrorTitle': '无法加载报价',
  'offers.loadErrorBody': '无法加载您货源上的报价 — 请重试。',
  'offers.emptyTitle': '暂无报价',
  'offers.emptyBody': '当买家对您的某一货源议价时，会显示在这里，包含其出价和所需数量。您可以接受、拒绝，或用自己的价格回复。',
  'offers.seeListings': '查看我的货源',
  'offers.postMore': '+ 发布更多货源',
  'offers.noneAwaiting': '没有等待您回复的报价',
  'offers.noneDecided': '暂无已处理的报价',
  'offers.noneAwaitingBody': '您货源上的报价都已回复。切换到“已处理”即可查看。',
  'offers.noneDecidedBody': '您接受或拒绝的报价会作为记录保存在这里。',
  'offers.count': '{n} 条报价',
  'offers.col.listing': '货源',
  'offers.col.buyer': '买家',
  'offers.col.quantity': '数量',
  'offers.col.theirPrice': '对方出价',
  'offers.col.status': '状态',
  'offers.col.received': '收到时间',
  'offers.decidedLabel': '已处理',
  'offers.counter': '还盘',
  'offers.accept': '接受',
  'offers.reject': '拒绝',
  'offers.offerRef': '报价 #{id}',
  'offers.answersOffer': '回复报价 #{id}',
  'offers.demoNoteLead': '标注',
  'offers.demoNoteTail': '的行属于演示货源，并非您发布的货源。接受它仍会生成真实订单 — 请先核实货源。',
  'offers.counterTitle': '还盘 #{id}',
  'offers.counterBody': '{buyer} 对 {product} 出价 {price} / {qty}。您的回复将成为一条关联的新报价；买家的条款仍保留在记录中。',
  'offers.counterPrice': '您的单价',
  'offers.perUnit': '每单位 {currency}',
  'offers.counterQty': '数量',
  'offers.counterQtyHint': '保持不变即沿用买家的数量。',
  'offers.counterNotes': '给买家的备注',
  'offers.counterNotesPlaceholder': '交期、包装、贸易术语、该价格的有效期…',
  'offers.sendCounter': '发送还盘',
  'offers.sending': '正在发送…',
  'offers.counterErrPrice': '您的还盘价必须是大于零的数字。',
  'offers.counterErrQty': '数量必须是大于零的数字。',
  'offers.counterErr': '无法发送该还盘。',
  'offers.counterDone': '还盘已发送。原报价标记为已还盘，已通知买家。',
  'offers.acceptTitle': '接受报价 #{id}？',
  'offers.listing': '货源',
  'offers.buyer': '买家',
  'offers.quantity': '数量',
  'offers.unitPrice': '单价',
  'offers.offerValue': '报价金额',
  'offers.acceptBodyLead': '接受即生成订单。',
  'offers.acceptBodyBank': '买家对此作出承诺，并通过',
  'offers.acceptBodyTail':
    '付款 — 平台不收取信用卡付款。您开具形式发票，并在款项到账后确认转账；订单随后进入发货环节。该决定为最终决定：已接受的报价无法重新决定。',
  'offers.acceptCta': '接受并生成订单',
  'offers.accepting': '正在接受…',
  'offers.acceptErr': '无法接受该报价。',
  'offers.acceptDone': '报价 #{id} 已接受。已为 {buyer} 生成订单。',
  'offers.rejectTitle': '拒绝报价 #{id}？',
  'offers.rejectBody':
    '{buyer} 对 {product} 的 {price} 报价将被关闭。拒绝为最终决定 — 买家无法恢复该报价，但可以重新开一条。',
  'offers.rejectCta': '拒绝报价',
  'offers.rejecting': '正在拒绝…',
  'offers.rejectErr': '无法拒绝该报价。',
  'offers.rejectDone': '报价 #{id} 已拒绝。',

  'verify.title': '资质认证',
  'verify.sub': '提交您的文件、跟踪审核决定，并了解买家看到的内容',
  'verify.signInSub': '买家在付款前所依赖的文件',
  'verify.notSignedIn': '您尚未登录',
  'verify.notSignedInBody': '认证文件属于供应商账号，绝不会以原始形式公开。登录后可提交或更新。',
  'verify.createSupplierAccount': '创建供应商账号',
  'verify.supplierOnly': '仅限供应商账号',
  'verify.supplierOnlyBody': '您的账号是{role}账号，因此没有供应商清单需要完成。',
  'verify.seeSuppliers': '查看已认证供应商',
  'verify.approved': '已核准文件',
  'verify.waiting': '等待审核',
  'verify.actionNeeded': '缺失或已退回',
  'verify.coreApproved': '核心文件已核准',
  'verify.confirmed': '已确认',
  'verify.pending': '待处理',
  'verify.yourDocs': '您的文件',
  'verify.onFile': '已存档 {n} 份',
  'verify.loadErrorTitle': '无法加载文件',
  'verify.loadErrorBody': '无法加载您的认证文件 — 请重试。若持续失败，您的账号可能还没有供应商资料。',
  'verify.emptyTitle': '尚未存档任何文件',
  'verify.emptyBody': '还没有提交任何文件，因此无法向买家显示认证标识。请使用表单提交第一份文件 — 从{first}开始。',
  'verify.col.document': '文件',
  'verify.col.status': '状态',
  'verify.col.note': '审核备注',
  'verify.col.reviewed': '审核时间',
  'verify.filed': '提交于 {date}',
  'verify.reference': '参考：{ref}',
  'verify.noReference': '未提供参考',
  'verify.resubmit': '重新提交',
  'verify.tierFootnote': '此处仅列出接口为您的供应商资料返回的文件。缺失的类型只是还没有记录 — 提交后即会创建。',
  'verify.fileTitle': '提交或更新文件',
  'verify.docType': '文件类型',
  'verify.existingHintPre': '您已有 {doc} 的记录 — 状态',
  'verify.existingHintPost': '。再次提交会覆盖它并清除此前的决定，因此已核准的文件需要重新审核。',
  'verify.refLabel': '文件链接 / 参考编号',
  'verify.refPlaceholder': 'https://…/business-licence.pdf 或您的文件编号',
  'verify.refHintLead': '文件上传尚未开发。',
  'verify.refHintTail': '请粘贴文件链接，或审核团队可据此跟进的参考编号。它将按原样存储，不会公开显示。',
  'verify.noteLabel': '给审核员的备注',
  'verify.notePlaceholder': '发生了什么变化、为何更新、审核员需要了解的内容…',
  'verify.filing': '正在提交…',
  'verify.resubmitDoc': '重新提交{doc}',
  'verify.submitDoc': '提交{doc}',
  'verify.queueNoteLead': '提交只是把文件放入队列。',
  'verify.queueNoteStrong': '只有当审核员核准后，买家才会看到标识',
  'verify.queueNoteTail': '— 提交时不会，也绝不会自动显示。',
  'verify.filedNotice':
    '{doc}已提交。状态现为“已提交”，正在审核队列中等待 — 只有审核员核准后买家才会看到标识。',
  'verify.errFile': '无法提交该文件。',
  'verify.statusMeans': '各状态的含义',
  'verify.tierTitle': '认证等级',
  'verify.tierAll': '已认证 · 全部核心文件已核准',
  'verify.tierSome': '已认证 · 文件已核准',
  'verify.tierNone': '尚未认证',
  'verify.tierAllBody': '本页列出的每种核心文件类型均已由审核员核准。',
  'verify.tierSomeBody': '至少有一份文件已核准{n}；其余核心类型会进一步增强资料。',
  'verify.tierNoneBody': '尚无文件被核准，因此不会向买家显示您公司的认证标识。',
  'verify.tierHint':
    '您账号的等级由审核团队根据已核准文件设定 — 本页仅呈现接口返回的文件状态，并不自行计算等级。买家只会看到已核准文件对应的标识。',
  'verify.suggested': '建议下一步：',
  'verify.select': '选择',
  'verify.othersNote':
    '买家还会在其他供应商资料页上看到评分和检验次数。这些数字是平台演示数据，并非本清单生成 — 本页有意不显示其中任何一项。',
  'verify.help.missing.title': '未提交',
  'verify.help.missing.state': '尚未提交任何文件，或该文件从未提交。',
  'verify.help.submitted.title': '等待审核',
  'verify.help.submitted.state': '已提交并在审核队列中等待。买家暂时看不到任何标识。',
  'verify.help.approved.title': '已核准',
  'verify.help.approved.state': '审核员已对照文件本身进行核查。这就是买家看到的内容。',
  'verify.help.rejected.title': '已退回',
  'verify.help.rejected.state': '已拒绝并附备注。请修正文件后重新提交。',
  'verify.doc.businessLicence': '营业执照',
  'verify.doc.taxCertificate': '税务登记证',
  'verify.doc.factoryAudit': '工厂审核报告',
  'verify.doc.productCert': '产品认证',
  'verify.doc.exportLicence': '出口许可证',
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
  'status.inspecting': 'Inspección en curso',

  'action.close': 'Cerrar',
  'action.cancel': 'Cancelar',
  'action.dismiss': 'Descartar',
  'action.refresh': 'Actualizar',
  'action.refreshing': 'Actualizando…',
  'action.tryAgain': 'Reintentar',
  'action.clear': 'Limpiar',
  'action.clearFilters': 'Limpiar filtros',
  'action.search': 'Buscar',
  'action.save': 'Guardar cambios',
  'action.discard': 'Descartar',
  'action.signIn': 'Iniciar sesión',
  'action.signOut': 'Cerrar sesión',
  'action.signingIn': 'Iniciando sesión…',
  'action.joinFree': 'Únete gratis',
  'action.createAccount': 'Crear una cuenta',
  'action.creatingAccount': 'Creando la cuenta…',
  'action.backToExplore': 'Volver a explorar',
  'action.open': 'Abrir',
  'action.edit': 'Editar',
  'action.delete': 'Eliminar',

  'common.loading': 'Cargando…',
  'common.loadingEllipsis': 'Cargando…',
  'common.notSet': 'Sin definir',
  'common.optional': 'Opcional',
  'common.required': 'obligatorio',
  'common.newestFirst': 'Más recientes primero',
  'common.anyCountry': 'Cualquier país',
  'common.allCountries': 'Todos los países',
  'common.verified': 'Verificado',
  'common.tradeAbbrev':
    'RFQ = solicitud de cotización · MOQ = cantidad mínima de pedido · FOB = franco a bordo · TT = transferencia bancaria',

  'nav.feed': 'Inicio',
  'nav.explore': 'Explorar',
  'nav.exploreStock': 'Explorar existencias',
  'nav.offersBuyer': 'Mis ofertas',
  'nav.rfqs': 'Mis RFQ',
  'nav.orders': 'Pedidos',
  'nav.shipments': 'Envíos',
  'nav.messages': 'Mensajes',
  'nav.saved': 'Guardado',
  'nav.savedLots': 'Lotes guardados',
  'nav.notifications': 'Notificaciones',
  'nav.help': 'Centro de ayuda',
  'nav.helpCentre': 'Centro de ayuda',
  'nav.howItWorks': 'Cómo funciona',
  'nav.profile': 'Perfil',
  'nav.listings': 'Mis publicaciones',
  'nav.post': 'Publicar stock',
  'nav.postStock': 'Publicar stock',
  'nav.offersSup': 'Ofertas',
  'nav.rfqOpps': 'Oportunidades de RFQ',
  'nav.verification': 'Verificación',
  'nav.suppliers': 'Proveedores',
  'nav.overview': 'Resumen',
  'nav.adminSuppliers': 'Proveedores',
  'nav.adminVerify': 'Mesa de verificación',
  'nav.adminListings': 'Publicaciones',
  'nav.adminRfqs': 'RFQ',
  'nav.adminPayments': 'Pagos',
  'nav.sources': 'Fuentes de suministro',
  'nav.growth': 'Banners y promociones',
  'nav.features': 'Funciones',

  'topbar.searchPlaceholder': 'Buscar productos, proveedores, categorías…',
  'topbar.searchAria': 'Buscar en el marketplace',
  'topbar.notifications': 'Notificaciones',
  'topbar.createAccountTitle': 'Crear cuenta',
  'topbar.account': 'Cuenta',
  'topbar.languageAria': 'Idioma de la interfaz',
  'rail.allIndustries': 'Todos los sectores',
  'rail.howItWorks': 'Cómo funciona',
  'sidebar.moreIndustries': 'Más sectores. Más países.',
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
  'cards.demoTitle': 'Datos de ejemplo — no es una oferta real',
  'cards.inspections': 'inspecciones',

  'auth.signIn.sub': 'Accede a tus pedidos, ofertas y RFQ.',
  'auth.email': 'Correo electrónico',
  'auth.password': 'Contraseña',
  'auth.signInCta': 'Iniciar sesión',
  'auth.newHere': '¿Primera vez aquí?',
  'auth.demoNotice': 'Aviso de demo',
  'auth.seededLogin': 'Acceso de revisión precargado',
  'auth.fillIn': 'Rellenar',
  'auth.demoHintLead': 'es una',
  'auth.demoHintLead2': 'demo',
  'auth.demoHintTail':
    'cuenta de demostración precargada para revisar el panel de administración. No es un vendedor real: no introduzcas credenciales reales.',
  'auth.demoHintProduct': 'administrador',
  'auth.signInFailed': 'Error al iniciar sesión',
  'auth.signUp.title': 'Crear una cuenta',
  'auth.signUp.sub': 'Una cuenta para comprar, vender o prestar servicios de inspección y logística.',
  'auth.fullName': 'Nombre completo',
  'auth.workEmail': 'Correo de trabajo',
  'auth.minChars': 'Mínimo 8 caracteres',
  'auth.atLeast8': 'Al menos 8 caracteres.',
  'auth.iAmA': 'Soy…',
  'auth.company': 'Empresa',
  'auth.country': 'País',
  'auth.countryHint': 'Turquía, China…',
  'auth.createCta': 'Crear cuenta',
  'auth.alreadyRegistered': '¿Ya estás registrado?',
  'auth.signUpHint': 'Publicar es gratis. Las insignias de confianza se ganan con verificación, inspecciones e historial de entregas.',
  'auth.registerFailed': 'Error en el registro',
  'auth.role.buyer': 'Comprador',
  'auth.role.buyerHint': 'Compro productos',
  'auth.role.supplier': 'Proveedor',
  'auth.role.supplierHint': 'Vendo / fabrico',
  'auth.role.inspector': 'Inspector',
  'auth.role.inspectorHint': 'Verifico fábricas',
  'auth.role.lab': 'Laboratorio',
  'auth.role.labHint': 'Analizo materiales',
  'auth.role.logistics': 'Logística',
  'auth.role.logisticsHint': 'Muevo carga',

  'profile.title': 'Perfil',
  'profile.sub': 'Los datos que otras partes ven en tus ofertas, pedidos y mensajes.',
  'profile.signInSub': 'Inicia sesión para gestionar tu cuenta',
  'profile.notSignedIn': 'No has iniciado sesión',
  'profile.notSignedInBody': 'Tu perfil es privado de tu cuenta: inicia sesión para verlo y editarlo.',
  'profile.createAccount': 'Crear una cuenta',
  'profile.accountDetails': 'Datos de la cuenta',
  'profile.unsaved': 'Cambios sin guardar',
  'profile.fullName': 'Nombre completo',
  'profile.company': 'Empresa',
  'profile.notSet': 'Sin definir',
  'profile.country': 'País',
  'profile.language': 'Idioma de la interfaz',
  'profile.languageHint':
    'Cambia el idioma de la interfaz al instante y se guarda en tu cuenta al pulsar Guardar cambios.',
  'profile.save': 'Guardar cambios',
  'profile.saving': 'Guardando…',
  'profile.saved': 'Guardado',
  'profile.savedBody': 'Tu perfil se ha actualizado.',
  'profile.identity': 'Identidad',
  'profile.identityNote':
    'El correo y el rol no se pueden editar aquí. Quedan fijados al crear la cuenta y la API de perfil no los acepta.',
  'profile.email': 'Correo electrónico',
  'profile.role': 'Rol',
  'profile.readOnly': 'Solo lectura',
  'profile.readOnlyEmail': 'Solo lectura — la API de perfil no acepta el correo',
  'profile.readOnlyRole': 'Solo lectura — la API de perfil no acepta el rol',
  'profile.emailStatus': 'Estado del correo',
  'profile.emailVerified': 'Correo verificado',
  'profile.emailNotVerified': 'Correo sin verificar',
  'profile.memberSince': 'Miembro desde',
  'profile.accountLine': 'Cuenta #{id} · sesión iniciada como {role}',
  'profile.errName': 'Introduce tu nombre: la API rechaza un nombre vacío.',
  'profile.errSave': 'No se pudo guardar el perfil. Inténtalo de nuevo.',

  'explore.title': 'Explorar existencias',
  'explore.subLoading': 'Cargando lotes disponibles…',
  'explore.subCount': '{n} publicaciones que coinciden con tus filtros',
  'explore.searchPlaceholder': 'Cátodo de cobre, bombas…',
  'explore.searchAria': 'Buscar publicaciones',
  'explore.categoryAria': 'Categoría',
  'explore.allCategories': 'Todas las categorías',
  'explore.originAria': 'País de origen',
  'explore.allCountries': 'Todos los países',
  'explore.min': 'Mín. $',
  'explore.max': 'Máx. $',
  'explore.emptyTitle': 'Ninguna publicación coincide con esos filtros',
  'explore.emptyBody': 'Prueba una categoría más amplia, otro país de origen o limpia los filtros.',
  'explore.page': 'Página {page} de {pages}',
  'explore.prev': '← Anterior',
  'explore.next': 'Siguiente →',

  'feed.welcomeBack': 'Bienvenido de nuevo, {name}',
  'feed.title': 'Inicio del marketplace',
  'feed.sub': 'Stock disponible, excedentes y sobrestock de fábricas verificadas: lo más reciente primero.',
  'feed.sellStock': 'Vender stock',
  'feed.postRequest': 'Publicar una solicitud',
  'feed.lotsCount': '{n} lotes',
  'feed.lotsMatch': 'lotes coinciden con tus filtros',
  'feed.verifiedSuppliers': 'proveedores verificados',
  'feed.openRequests': 'solicitudes abiertas',
  'feed.allOrigins': 'Todos los orígenes',
  'feed.searchAria': 'Buscar lotes',
  'feed.minAria': 'Precio mínimo',
  'feed.maxAria': 'Precio máximo',
  'feed.allIndustries': 'Todos los sectores',
  'feed.noLots': 'Sin lotes',
  'feed.shownRange': '{first}–{last} de {total}',
  'feed.emptyTitle': 'Ningún lote coincide con esos filtros',
  'feed.emptyBody': 'Prueba otro sector, otro país de origen o limpia los filtros.',
  'feed.lookingFor': '¿Buscas algo concreto?',
  'feed.postRequestLink': 'Publica una solicitud',
  'feed.lookingForTail': 'y las fábricas verificadas te cotizarán.',
  'feed.sellingInstead': '¿Prefieres vender?',
  'feed.listYourStock': 'Publica tu stock',
  'feed.signedInAs': 'sesión iniciada como {role}',
  'feed.createFree': 'crea una cuenta gratis',

  'help.title': 'Cómo funciona FactoryDepo',
  'help.sub': 'Stock disponible, solicitudes de cotización y suministro respaldado por inspección.',
  'help.buying': 'Comprar',
  'help.buying1.title': '1. Explora stock disponible.',
  'help.buying1':
    'Cada lote activo muestra su precio, la cantidad mínima de pedido, el país de origen y cuánto hay realmente disponible. Las publicaciones marcadas como Demo son datos de ejemplo —no ofertas reales— y van etiquetadas para que nunca te lleven a engaño.',
  'help.buying2.title': '2. Pide una cotización.',
  'help.buying2':
    'Publica una solicitud describiendo lo que necesitas. Los proveedores cotizan con un precio, un plazo y sus condiciones.',
  'help.buying3.title': '3. Compara y comprométete.',
  'help.buying3': 'Las cotizaciones se ven en paralelo en la solicitud. Aceptar una crea un pedido.',
  'help.buying4.title': '4. Paga por transferencia bancaria.',
  'help.buying4':
    'El comercio industrial no funciona con tarjetas. Recibes una factura proforma, pagas por TT/transferencia y el pedido se marca como pagado cuando se confirman los fondos.',
  'help.selling': 'Vender',
  'help.selling1.title': '1. Crea una cuenta de proveedor.',
  'help.selling1': 'Registrarte como proveedor crea tu perfil de empresa de inmediato.',
  'help.selling2.title': '2. Publica tu stock.',
  'help.selling2':
    'Las herramientas de publicación están en desarrollo; hasta que lleguen, nuestro equipo añade las publicaciones de proveedores durante el alta.',
  'help.selling3.title': '3. Cotiza las solicitudes entrantes.',
  'help.selling3':
    'Las solicitudes abiertas de compradores aparecen en tu panel con un recuento en vivo de las que no has respondido.',
  'help.selling4.title': '4. Verifícate.',
  'help.selling4':
    'Los niveles de verificación desbloquean visibilidad. Las insignias solo se conceden cuando se aprueban los documentos, así que una insignia aquí significa algo.',
  'help.notLive': 'Lo que aún no está operativo',
  'help.notLiveLead': 'Preferimos decirlo claramente antes que dejes que lo descubras tú:',
  'help.notLive1': 'Las herramientas de autopublicación para proveedores están en desarrollo.',
  'help.notLive2': 'La mensajería entre comprador y proveedor aún no está disponible: usa los datos de contacto del perfil del proveedor.',
  'help.notLive3': 'Las ofertas y contraofertas se gestionan manualmente por ahora.',
  'help.notLive4': 'El seguimiento de envíos y la gestión documental no están desarrollados.',
  'help.exploreCta': 'Explorar existencias',
  'help.rfqCta': 'Solicitudes de cotización',

  'soon.sub': 'Aún no desarrollado',
  'soon.title': 'Esta vista pertenece a la siguiente fase de desarrollo',
  'soon.body': 'La pantalla existe en la navegación, pero sus tablas de datos y endpoints de API aún no se han desarrollado.',
  'soon.note.offers': 'La tabla de ofertas y contraofertas llega en la siguiente fase de desarrollo.',
  'soon.note.shipments': 'Los hitos de envío y sus documentos llegan en la siguiente fase de desarrollo.',
  'soon.note.messages': 'La mensajería entre comprador y proveedor llega en la siguiente fase de desarrollo.',
  'soon.note.saved': 'Los lotes guardados llegan en la siguiente fase de desarrollo.',
  'soon.note.notifications': 'El centro de notificaciones llega en la siguiente fase de desarrollo.',
  'soon.note.profile': 'La edición del perfil llega en la siguiente fase de desarrollo.',
  'soon.note.listings': 'La gestión de publicaciones del proveedor con control de titularidad llega en la siguiente fase de desarrollo.',
  'soon.note.post': 'La creación y edición de publicaciones con subida de imágenes llega en la siguiente fase de desarrollo.',
  'soon.note.generic': 'Llega en la siguiente fase de desarrollo.',
  'soon.note.verification': 'Los niveles de verificación y el envío de documentos llegan en la siguiente fase de desarrollo.',
  'soon.note.admin': 'El panel de administración llega en la siguiente fase de desarrollo.',
  'soon.note.sources': 'El alta manual de proveedores llega en la siguiente fase de desarrollo.',
  'soon.note.features': 'Los indicadores de funciones llegan en la siguiente fase de desarrollo.',

  'orders.title': 'Pedidos',
  'orders.signInSub': 'Inicia sesión para ver los pedidos en los que participas',
  'orders.notSignedIn': 'No has iniciado sesión',
  'orders.notSignedInBody': 'Los pedidos son privados: inicia sesión para ver lo que te has comprometido a comprar o vender.',
  'orders.createAccount': 'Crear una cuenta',
  'orders.subSupplier': 'Pedidos que los compradores hicieron sobre tu stock',
  'orders.subBuyer': 'Todo lo que te has comprometido a comprar',
  'orders.statListings': 'Mis publicaciones',
  'orders.statOffersReceived': 'Ofertas recibidas',
  'orders.statOffersOnRfqs': 'Ofertas en mis RFQ',
  'orders.statOrders': 'Pedidos',
  'orders.statSoldItems': 'Artículos vendidos',
  'orders.statSoldTitle': 'Pedidos enviados o entregados',
  'orders.statViews': 'Visitas · aún sin medir',
  'orders.statViewsTitle': 'El seguimiento de visitas aún no está implementado',
  'orders.metricsError': 'No se han podido cargar las métricas ahora mismo.',
  'orders.loadErrorTitle': 'No se han podido cargar los pedidos',
  'orders.loadErrorBody': 'La API no devolvió tus pedidos. Actualiza la página o vuelve a iniciar sesión.',
  'orders.emptyTitle': 'Aún no hay pedidos',
  'orders.emptySupplier': 'Cuando un comprador pida de tu stock, aparecerá aquí.',
  'orders.emptyBuyer': 'Los pedidos de compra inmediata que hagas sobre stock disponible aparecerán aquí.',
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

  'product.loadingTitle': 'Cargando…',
  'product.loadingThis': 'esta publicación',
  'product.fetching': 'Obteniendo {what}…',
  'product.notFound': 'Producto no encontrado',
  'product.backToExplore': 'Volver a explorar',
  'product.noPhoto': 'No se ha facilitado foto de este lote',
  'product.pricePer': 'Precio / {unit}',
  'product.minOrder': 'Pedido mínimo',
  'product.availableNow': 'Disponible ahora',
  'product.origin': 'País de origen',
  'product.unavailable': 'No disponible actualmente',
  'product.buyNowHeading': 'Comprar ya — stock disponible',
  'product.soldOutBody': 'Este lote está marcado como agotado. Pide al proveedor el siguiente lote disponible.',
  'product.noUnitsBody': 'No hay unidades disponibles ahora mismo. Pide al proveedor el siguiente lote disponible.',
  'product.purchaseTerms': 'Compra al precio publicado de {price} por {unit}, mínimo {moq} {unit}.',
  'product.stockOnHand': 'Stock disponible',
  'product.buyNowPrice': 'Comprar ya · {price}/{unit}',
  'product.outOfStock': 'Comprar ya — sin existencias',
  'product.requestQuote': 'Solicitar cotización',
  'product.shipsFrom': 'Se envía desde {country}',
  'product.signInToOrder': 'Inicia sesión para pedir o solicitar una cotización.',
  'product.supplier': 'Proveedor',
  'product.viewProfile': 'Ver perfil',
  'product.loadingSupplier': 'Cargando proveedor…',
  'product.supplierUnavailable': 'Los datos del proveedor no están disponibles.',
  'product.rating': 'Valoración',
  'product.inspections': 'Inspecciones',
  'product.fulfilment': 'Entregas a tiempo',
  'product.verifiedLevel': 'Nivel de verificación',
  'product.levelN': 'Nivel {n}',
  'product.tradingSince': 'Opera desde',
  'product.supplierFiguresHint': 'Las cifras son de todo el marketplace para este proveedor, no solo de este lote.',
  'product.description': 'Descripción',
  'product.noDescription':
    'El proveedor no ha añadido una descripción. Solicita una cotización para conocer especificaciones, plazo y condiciones de entrega.',
  'product.specification': 'Especificaciones',
  'product.noSpec': 'No hay especificaciones registradas para este lote.',
  'product.col.attribute': 'Atributo',
  'product.col.value': 'Valor',
  'product.spec.category': 'Categoría',
  'product.spec.unit': 'Unidad',
  'product.spec.purity': 'Pureza / grado',

  'checkout.title': 'Comprar ya — pago',
  'checkout.placedTitle': 'Pedido realizado',
  'checkout.confirmed': 'Pedido #{id} confirmado',
  'checkout.notified': 'Se ha avisado al proveedor. Sigue el pedido desde tu página de pedidos.',
  'checkout.viewOrders': 'Ver pedidos',
  'checkout.keepBrowsing': 'Seguir explorando',
  'checkout.pricePer': 'Precio / {unit}',
  'checkout.minimumOrder': 'Pedido mínimo',
  'checkout.availableNow': 'Disponible ahora',
  'checkout.quantity': 'Cantidad ({unit})',
  'checkout.qtyHint': 'Entre {moq} y {stock} {unit} en stock.',
  'checkout.fullName': 'Nombre completo',
  'checkout.country': 'País',
  'checkout.address': 'Dirección',
  'checkout.city': 'Ciudad',
  'checkout.phone': 'Teléfono',
  'checkout.notes': 'Notas para el proveedor',
  'checkout.total': 'Total {total}',
  'checkout.placeOrder': 'Realizar pedido · {total}',
  'checkout.placing': 'Realizando el pedido…',
  'checkout.errPlace': 'No se pudo realizar el pedido.',

  'rfqModal.title': 'Solicitar cotización',
  'rfqModal.postedTitle': 'Solicitud publicada',
  'rfqModal.live': 'Tu necesidad ya está publicada en el intercambio de RFQ',
  'rfqModal.canQuote': 'Los proveedores verificados ya pueden cotizar precio y plazo.',
  'rfqModal.viewMine': 'Ver mis RFQ',
  'rfqModal.listedBy': '{product} · publicado por {supplier}',
  'rfqModal.quantity': 'Cantidad',
  'rfqModal.unit': 'Unidad',
  'rfqModal.specs': 'Especificaciones, certificados, condiciones de entrega',
  'rfqModal.moqHint': 'El MOQ de la publicación es {moq} {unit}.',
  'rfqModal.post': 'Publicar solicitud',
  'rfqModal.posting': 'Publicando…',
  'rfqModal.errPost': 'No se pudo publicar la solicitud.',
  'rfqModal.titleSuffix': 'solicitud de cotización',

  'suppliers.loadingSub': 'Obteniendo el directorio de proveedores',
  'suppliers.loadingBody': 'Obteniendo el directorio de proveedores…',
  'suppliers.title': 'Directorio de proveedores',
  'suppliers.sub':
    'Fábricas y casas comerciales en FactoryDepo. Los niveles de verificación proceden de auditorías presenciales y revisión documental.',
  'suppliers.demoNote': 'las filas marcadas como demo son datos de ejemplo',
  'suppliers.loadErrorTitle': 'No se pudo cargar el directorio',
  'suppliers.loadErrorBody': 'El servicio de proveedores no respondió. Inténtalo de nuevo en un momento.',
  'suppliers.emptyTitle': 'Aún no hay proveedores',
  'suppliers.emptyBody': 'Los perfiles de proveedor aparecen aquí una vez dados de alta y verificados.',
  'suppliers.totalListed': 'Proveedores listados',
  'suppliers.totalVerified': 'Verificados nivel 2+',
  'suppliers.avgRating': 'Valoración media',
  'suppliers.avgRatingRated': 'Valoración media ({n} valorados)',
  'suppliers.avgFulfilment': 'Entregas a tiempo',
  'suppliers.avgFulfilmentMeasured': 'Entregas a tiempo ({n} medidos)',
  'suppliers.searchPlaceholder': 'Empresa, país, ciudad, capacidad…',
  'suppliers.searchAria': 'Buscar proveedores',
  'suppliers.verifiedOnly': 'Solo verificados',
  'suppliers.showing': 'Mostrando {shown} de {total}',
  'suppliers.noMatchTitle': 'Ningún proveedor coincide con esa búsqueda',
  'suppliers.noMatchBody': 'Prueba un nombre de empresa más corto o quita el filtro de verificación.',
  'suppliers.rating': 'Valoración',
  'suppliers.inspections': 'Inspecciones',
  'suppliers.fulfilment': 'Cumplimiento',

  'supplierDetail.loadingThis': 'este perfil de proveedor',
  'supplierDetail.notFound': 'Proveedor no encontrado',
  'supplierDetail.backToDirectory': 'Volver al directorio',
  'supplierDetail.backShort': '← Volver al directorio',
  'supplierDetail.tradingSince': 'Opera desde {year}',
  'supplierDetail.verifiedL3': 'Verificado · nivel 3',
  'supplierDetail.registered': 'Registrado',
  'supplierDetail.buyerRating': 'Valoración de compradores',
  'supplierDetail.notRated': 'aún sin valoraciones',
  'supplierDetail.inspections': 'Inspecciones presenciales',
  'supplierDetail.fulfilment': 'Entregas a tiempo',
  'supplierDetail.activeListings': 'Publicaciones activas',
  'supplierDetail.tier': 'Nivel de verificación',
  'supplierDetail.trustScore': 'Puntuación de confianza (0–100)',
  'supplierDetail.about': 'Sobre {company}',
  'supplierDetail.noDescription': 'Este proveedor aún no ha publicado una descripción de empresa.',
  'supplierDetail.capabilities': 'Capacidades declaradas',
  'supplierDetail.record': 'Verificación y historial',
  'supplierDetail.ratingLabel': 'Valoración de compradores',
  'supplierDetail.inspectionsDone': 'Inspecciones completadas',
  'supplierDetail.contact': 'Contacto',
  'supplierDetail.contactBody': 'Los informes de inspección y los documentos de verificación se comparten con los miembros tras el primer contacto.',
  'supplierDetail.contactSupplier': 'Contactar con el proveedor',
  'supplierDetail.contactHintSignedIn': 'Abre el intercambio de RFQ: allí vive el hilo de cotización.',
  'supplierDetail.contactHintGuest': 'Solo miembros · registro gratis',
  'supplierDetail.services': 'Servicios comerciales',
  'supplierDetail.service1': 'Inspección de fábrica antes del pago',
  'supplierDetail.service2': 'Ensayos de laboratorio y análisis de materiales',
  'supplierDetail.service3': 'Supervisión de carga de contenedores',
  'supplierDetail.service4': 'Apoyo en documentación de exportación',
  'supplierDetail.stockFrom': 'Stock de {company}',
  'supplierDetail.shown': '{n} mostrados',
  'supplierDetail.loadingLots': 'Cargando lotes disponibles…',
  'supplierDetail.noneShown': 'No se muestran publicaciones activas',
  'supplierDetail.noneShownBody':
    'La API informa de {n} publicaciones de este proveedor, pero ninguna llegó en la vista actual. Publica una solicitud en el intercambio de RFQ para preguntar por su catálogo.',

  'rfq.titleSupplier': 'Oportunidades de RFQ',
  'rfq.titleBuyer': 'Solicitudes',
  'rfq.subSupplier': 'Necesidades abiertas publicadas por compradores. Responde con tu precio y plazo.',
  'rfq.subBuyer':
    'Necesidades actuales en el intercambio, lo más reciente primero. Abre una para ver las cotizaciones recibidas.',
  'rfq.postRequest': '+ Publicar una solicitud',
  'rfq.buyerOnlyNotice': 'Solo las cuentas de comprador pueden publicar una solicitud. Inicia sesión con un perfil de comprador.',
  'rfq.total': 'solicitudes en total',
  'rfq.open': 'abiertas',
  'rfq.quoted': 'con cotización',
  'rfq.closed': 'cerradas',
  'rfq.quoteable': 'Solicitudes que puedes cotizar',
  'rfq.allRequests': 'Todas las solicitudes',
  'rfq.shown': '{n} mostradas',
  'rfq.statusAll': 'Todas',
  'rfq.statusOpenCount': 'Abiertas ({n})',
  'rfq.statusQuotedCount': 'Con cotización ({n})',
  'rfq.quotingCloses': 'La cotización se cierra cuando el comprador acepta una oferta.',
  'rfq.emptyNone': 'Aún no hay solicitudes',
  'rfq.emptyNoMatch': 'Nada coincide con ese filtro',
  'rfq.emptyNoneSupplier': 'Ahora mismo no hay necesidades abiertas en el intercambio.',
  'rfq.emptyNoneBuyer': 'Publica tu primera necesidad y las fábricas verificadas responderán.',
  'rfq.emptyNoMatchHint': 'Prueba otro filtro de estado.',
  'rfq.col.requirement': 'Necesidad',
  'rfq.col.quantity': 'Cantidad',
  'rfq.col.deliverTo': 'Entregar en',
  'rfq.col.quotes': 'Cotizaciones',
  'rfq.col.posted': 'Publicada',
  'rfq.col.status': 'Estado',
  'rfq.openAria': 'Abrir RFQ #{id}',
  'rfq.requestRef': '{category} · solicitud #{id}',
  'rfq.quotesCount': '{n} cotizaciones',
  'rfq.postingBuyerOnly': 'Publicar es una acción de comprador. Los proveedores pueden',
  'rfq.quoteOpen': 'cotizar necesidades abiertas',
  'rfq.newTitle': 'Nueva solicitud de cotización',
  'rfq.whatNeed': '¿Qué necesitas?',
  'rfq.titlePlaceholder': 'p. ej. 100 MT de cátodo de cobre, grado A',
  'rfq.category': 'Categoría',
  'rfq.deliverTo': 'Entregar en',
  'rfq.quantity': 'Cantidad',
  'rfq.unit': 'Unidad',
  'rfq.specification': 'Especificaciones',
  'rfq.specPlaceholder': 'Grado, pureza, certificados, Incoterms, embalaje…',
  'rfq.specHint': 'Cuanto más clara sea la especificación, más rápido cotizarán las fábricas verificadas.',
  'rfq.errTitle': 'Pon a la solicitud un título claro: al menos 5 caracteres.',
  'rfq.errQuantity': 'La cantidad debe ser un número mayor que cero.',
  'rfq.errPost': 'No se pudo publicar esta solicitud.',

  'rfqDetail.loadingTitle': 'Solicitud',
  'rfqDetail.loadingSub': 'Cargando…',
  'rfqDetail.title': 'Solicitud',
  'rfqDetail.notFound': 'Solicitud no encontrada',
  'rfqDetail.notFoundBody': 'Es posible que esta necesidad se haya retirado o que el enlace sea incorrecto.',
  'rfqDetail.backToRequests': '← Volver a las solicitudes',
  'rfqDetail.allRequests': '← Todas las solicitudes',
  'rfqDetail.postedOn': 'publicada el {date}',
  'rfqDetail.requestRef': 'Solicitud #{id}',
  'rfqDetail.accepting': 'Aceptando cotizaciones',
  'rfqDetail.notAccepting': 'No acepta nuevas cotizaciones',
  'rfqDetail.noSpec': 'No se han facilitado más especificaciones.',
  'rfqDetail.quantity': 'Cantidad',
  'rfqDetail.deliverTo': 'Entregar en',
  'rfqDetail.quotations': 'Cotizaciones',
  'rfqDetail.deadline': 'Fecha límite',
  'rfqDetail.requestedBy': 'Solicitada por',
  'rfqDetail.received': '{n} recibidas',
  'rfqDetail.noneTitle': 'Aún no hay cotizaciones',
  'rfqDetail.noneBody': 'Proveedores verificados están revisando esta necesidad.',
  'rfqDetail.col.supplier': 'Proveedor',
  'rfqDetail.col.price': 'Precio',
  'rfqDetail.col.leadTime': 'Plazo',
  'rfqDetail.col.notes': 'Notas',
  'rfqDetail.col.sent': 'Enviada',
  'rfqDetail.col.status': 'Estado',
  'rfqDetail.trustScore': 'Puntuación de confianza {n}',
  'rfqDetail.days': '{n} días',
  'rfqDetail.submitTitle': 'Enviar una cotización',
  'rfqDetail.supplierAccount': 'Cuenta de proveedor',
  'rfqDetail.fromSupplier': 'Las cotizaciones provienen de cuentas de proveedor. Cambia a tu cuenta de proveedor para responder.',
  'rfqDetail.signInSupplierBody': 'Solo las cuentas de proveedor con sesión iniciada pueden cotizar. Explorar sigue abierto a todos.',
  'rfqDetail.supplierOnly': 'Solo cuentas de proveedor',
  'rfqDetail.signInAsSupplier': 'Iniciar sesión como proveedor',
  'rfqDetail.closedBody': 'Esta solicitud está {status} y ya no acepta cotizaciones.',
  'rfqDetail.seeOpen': 'Ver solicitudes abiertas',
  'rfqDetail.respondBody': 'Responde con tu precio unitario y plazo. Tu perfil verificado acompaña a la cotización.',
  'rfqDetail.unitPrice': 'Precio unitario (USD)',
  'rfqDetail.leadTime': 'Plazo (días)',
  'rfqDetail.termsNotes': 'Condiciones y notas',
  'rfqDetail.termsPlaceholder': 'Incoterms, grado, embalaje, política de muestras, validez…',
  'rfqDetail.compareHint': 'Los compradores comparan precio, plazo y verificación en paralelo.',
  'rfqDetail.submitQuote': 'Enviar cotización',
  'rfqDetail.submitting': 'Enviando…',
  'rfqDetail.errPrice': 'Introduce un precio unitario mayor que cero.',
  'rfqDetail.errLead': 'El plazo debe ser un número entero de días entre 1 y 365.',
  'rfqDetail.errSubmit': 'No se pudo enviar esta cotización.',

  'listings.title': 'Mis publicaciones',
  'listings.sub': 'El stock que has publicado en el marketplace',
  'listings.signInSub': 'El stock que has publicado en el marketplace',
  'listings.notSignedIn': 'No has iniciado sesión',
  'listings.notSignedInBody': 'Tus publicaciones son privadas de tu cuenta de proveedor. Inicia sesión para verlas y gestionarlas.',
  'listings.createSupplierAccount': 'Crear una cuenta de proveedor',
  'listings.supplierOnly': 'Solo cuentas de proveedor',
  'listings.supplierOnlyBody':
    'Tu cuenta es una cuenta de {role}. Las publicaciones las gestiona el proveedor que las posee, así que aquí no hay nada que mostrar ni editar.',
  'listings.browseStock': 'Ver stock disponible',
  'listings.subLoading': 'Cargando tu stock…',
  'listings.subCount': '{n} publicaciones publicadas bajo tu perfil de proveedor',
  'listings.postStock': '+ Publicar stock',
  'listings.lotsPublished': 'lotes publicados',
  'listings.viewsNotTracked': 'visitas · aún sin medir',
  'listings.bankTransferNote': 'Los compradores pagan por transferencia bancaria cuando se acepta una oferta.',
  'listings.loadErrorTitle': 'No se han podido cargar tus publicaciones',
  'listings.loadErrorBody': 'No se pudieron cargar tus publicaciones. Inténtalo de nuevo. Si sigue fallando, vuelve a iniciar sesión.',
  'listings.emptyTitle': 'Aún no hay publicaciones',
  'listings.emptyBody':
    'Publica tu primer lote: una foto, un precio unitario y cuánto puedes enviar hoy. Se publica en Explorar para todos los compradores del marketplace.',
  'listings.postFirst': '+ Publicar tu primer lote',
  'listings.getVerified': 'Verificarme',
  'listings.count': '{n} publicaciones',
  'listings.col.lot': 'Lote',
  'listings.col.category': 'Categoría',
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
  'listings.updated': 'Publicación actualizada.',
  'listings.deleted': 'Publicación eliminada. Ya no está en el marketplace.',
  'listings.deleteTitle': '¿Eliminar esta publicación?',
  'listings.deleteLead': '{name} — lote #{id}',
  'listings.deleteBody':
    'Esta publicación se elimina de forma permanente. Desaparece de Explorar y de tu tabla de publicaciones de inmediato, y los compradores ya no pueden pedir ni negociar sobre ella. No se puede deshacer.',
  'listings.deleteKeepBody':
    'Un lote que ya tiene pedidos u ofertas no se puede eliminar: la API lo conserva para el registro. Márcalo como agotado poniendo el stock disponible a 0.',
  'listings.keepListing': 'Mantener publicación',
  'listings.deleteForever': 'Eliminar permanentemente',
  'listings.deleting': 'Eliminando…',
  'listings.deleteErr': 'No se pudo eliminar esta publicación.',
  'listings.editTitle': 'Editar publicación — lote #{id}',

  'post.title': 'Publicar stock',
  'post.titleEdit': 'Editar publicación',
  'post.sub': 'Un lote por publicación: qué es, cuánto cuesta y cuánto puedes enviar hoy',
  'post.subEdit': 'Modificando el lote #{id}: guardar sobrescribe la publicación activa',
  'post.signInSub': 'Publica stock disponible para que los compradores pidan o negocien',
  'post.notSignedIn': 'No has iniciado sesión',
  'post.notSignedInBody': 'Publicar stock es una acción de proveedor. Inicia sesión con una cuenta de proveedor para publicar un lote.',
  'post.createSupplierAccount': 'Crear una cuenta de proveedor',
  'post.supplierOnly': 'Solo cuentas de proveedor',
  'post.supplierOnlyBody':
    'Tu cuenta es una cuenta de {role}, así que la API no aceptará una publicación suya. Se requiere un perfil de proveedor antes de publicar stock.',
  'post.myListings': 'Mis publicaciones',
  'post.loadErrorTitle': 'No se pudo cargar la publicación',
  'post.loadErrorBody': 'No se pudo cargar este lote. Inténtalo de nuevo o vuelve a tus publicaciones.',
  'post.details': 'Datos de la publicación',
  'post.newListing': 'Nueva publicación',
  'post.requiredMark': '* obligatorio',
  'post.lotName': 'Nombre del lote',
  'post.lotNamePlaceholder': 'p. ej. Cátodo de cobre grado A, 99,99%',
  'post.category': 'Categoría',
  'post.originCountry': 'País de origen',
  'post.notStated': 'Sin indicar',
  'post.description': 'Descripción',
  'post.descriptionPlaceholder': 'Grado, embalaje, Incoterms, plazo, certificados…',
  'post.descriptionHint': 'Los compradores deciden a partir de este texto. Di qué contiene el lote y cómo se envía.',
  'post.unitPrice': 'Precio unitario',
  'post.currency': 'Moneda',
  'post.unit': 'Unidad',
  'post.moq': 'Pedido mínimo (MOQ)',
  'post.moqHint': 'Por defecto 1.',
  'post.available': 'Disponible ahora',
  'post.availableHint': 'Por defecto 0: el stock que puedes enviar hoy.',
  'post.purity': 'Pureza / grado',
  'post.purityPlaceholder': '99,99% / Grado A',
  'post.optional': 'Opcional.',
  'post.photoUrl': 'URL de la foto',
  'post.photoPlaceholder': 'https://…/copper-cathode.jpg',
  'post.photoHintLead': 'La subida de archivos aún no está desarrollada.',
  'post.photoHintTail':
    'Pega un enlace público a la foto y se guardará como imagen de este lote. Los lotes sin foto muestran un marcador de posición simple.',
  'post.preview': 'Vista previa: si no carga nada, el enlace no es una imagen directa.',
  'post.save': 'Guardar cambios',
  'post.saving': 'Guardando…',
  'post.errName': 'Pon un nombre al lote: al menos 2 caracteres.',
  'post.errCategory': 'Elige una categoría.',
  'post.errUnit': 'Indica la unidad en la que vendes (MT, KG, pcs…).',
  'post.errPrice': 'El precio unitario debe ser un número mayor que cero.',
  'post.errMoq': 'El MOQ debe ser un número mayor que cero.',
  'post.errQty': 'La cantidad disponible no puede ser negativa.',
  'post.errSave': 'No se pudo guardar esta publicación.',
  'post.errCreate': 'No se pudo publicar este lote.',
  'post.behaviour': 'Cómo se comporta esta publicación',
  'post.behaviourBody':
    'Un lote publicado aparece en Explorar de inmediato y cualquier comprador con sesión puede pedirlo. Los compradores también pueden abrir una oferta por debajo de tu precio; las respondes desde',
  'post.offersLink': 'Ofertas',
  'post.provenance': 'Procedencia',
  'post.platformListing': 'Publicación de la plataforma',
  'post.photo': 'Foto',
  'post.urlOnly': 'Solo URL — subida no desarrollada',
  'post.buyerPaysBy': 'El comprador paga por',
  'post.bankTransfer': 'Transferencia bancaria',
  'post.noMetrics':
    'Nada en esta página muestra visitas, valoraciones ni número de pedidos: esas cifras aún no se miden, así que no se muestran.',

  'offers.title': 'Ofertas sobre tu stock',
  'offers.sub': 'Compradores negociando tus lotes',
  'offers.signInSub': 'Compradores negociando tus lotes',
  'offers.notSignedIn': 'No has iniciado sesión',
  'offers.notSignedInBody': 'Las ofertas son privadas del comprador y del proveedor implicados. Inicia sesión para responderlas.',
  'offers.createSupplierAccount': 'Crear una cuenta de proveedor',
  'offers.supplierOnly': 'Solo cuentas de proveedor',
  'offers.supplierOnlyBody':
    'Tu cuenta es una cuenta de {role}, no tiene stock publicado y no pueden llegar ofertas. Las ofertas que has hecho como comprador están en el lado comprador del marketplace.',
  'offers.browseStock': 'Ver stock disponible',
  'offers.subLoading': 'Cargando ofertas…',
  'offers.subCount': '{n} ofertas sobre tus publicaciones',
  'offers.awaiting': 'esperando tu respuesta',
  'offers.decided': 'decididas',
  'offers.acceptCreates': 'Aceptar una oferta crea un pedido; el comprador paga por transferencia bancaria.',
  'offers.filterAwaiting': 'Esperando respuesta ({n})',
  'offers.filterDecided': 'Decididas ({n})',
  'offers.counterNote': 'Las contraofertas abren una nueva oferta vinculada; tus condiciones originales quedan en el registro.',
  'offers.loadErrorTitle': 'No se han podido cargar las ofertas',
  'offers.loadErrorBody': 'No se pudieron cargar las ofertas sobre tu stock. Inténtalo de nuevo.',
  'offers.emptyTitle': 'Aún no hay ofertas',
  'offers.emptyBody':
    'Cuando un comprador negocie uno de tus lotes aparecerá aquí, con el precio que propone y la cantidad que quiere. Puedes aceptarla, rechazarla o responder con tu propio precio.',
  'offers.seeListings': 'Ver mis publicaciones',
  'offers.postMore': '+ Publicar más stock',
  'offers.noneAwaiting': 'Nada esperando tu respuesta',
  'offers.noneDecided': 'Aún no hay ofertas decididas',
  'offers.noneAwaitingBody': 'Todas las ofertas sobre tu stock están respondidas. Cambia a Decididas para revisarlas.',
  'offers.noneDecidedBody': 'Las ofertas que aceptas o rechazas se guardan aquí como registro.',
  'offers.count': '{n} ofertas',
  'offers.col.listing': 'Publicación',
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
    '{buyer} ofreció {price} / {qty} por {product}. Tu respuesta se convierte en una nueva oferta vinculada; las condiciones del comprador quedan en el registro.',
  'offers.counterPrice': 'Tu precio unitario',
  'offers.perUnit': '{currency} por unidad',
  'offers.counterQty': 'Cantidad',
  'offers.counterQtyHint': 'Déjala igual para mantener la cantidad del comprador.',
  'offers.counterNotes': 'Nota para el comprador',
  'offers.counterNotesPlaceholder': 'Plazo, embalaje, Incoterms, validez de este precio…',
  'offers.sendCounter': 'Enviar contraoferta',
  'offers.sending': 'Enviando…',
  'offers.counterErrPrice': 'Tu precio de contraoferta debe ser un número mayor que cero.',
  'offers.counterErrQty': 'La cantidad debe ser un número mayor que cero.',
  'offers.counterErr': 'No se pudo enviar esta contraoferta.',
  'offers.counterDone': 'Contraoferta enviada. La oferta original queda marcada como con contraoferta y se avisa al comprador.',
  'offers.acceptTitle': '¿Aceptar la oferta #{id}?',
  'offers.listing': 'Publicación',
  'offers.buyer': 'Comprador',
  'offers.quantity': 'Cantidad',
  'offers.unitPrice': 'Precio unitario',
  'offers.offerValue': 'Valor de la oferta',
  'offers.acceptBodyLead': 'Aceptar crea un pedido.',
  'offers.acceptBodyBank': 'El comprador queda comprometido y paga por',
  'offers.acceptBodyTail':
    ': la plataforma no acepta pagos con tarjeta. Tú emites la proforma y confirmas la transferencia cuando llega; el pedido pasa entonces a envío. Esta decisión es firme: una oferta aceptada no se puede volver a decidir.',
  'offers.acceptCta': 'Aceptar y crear pedido',
  'offers.accepting': 'Aceptando…',
  'offers.acceptErr': 'No se pudo aceptar esta oferta.',
  'offers.acceptDone': 'Oferta #{id} aceptada. Se ha creado un pedido para {buyer}.',
  'offers.rejectTitle': '¿Rechazar la oferta #{id}?',
  'offers.rejectBody':
    'La oferta de {buyer} de {price} por {product} queda cerrada. Rechazar es definitivo: el comprador no puede revivir esta oferta, aunque puede abrir otra nueva.',
  'offers.rejectCta': 'Rechazar oferta',
  'offers.rejecting': 'Rechazando…',
  'offers.rejectErr': 'No se pudo rechazar esta oferta.',
  'offers.rejectDone': 'Oferta #{id} rechazada.',

  'verify.title': 'Verificación',
  'verify.sub': 'Presenta tus documentos, sigue la decisión de revisión y ve qué se cuenta a los compradores',
  'verify.signInSub': 'Documentos en los que se apoyan los compradores antes de pagar',
  'verify.notSignedIn': 'No has iniciado sesión',
  'verify.notSignedInBody':
    'Los documentos de verificación pertenecen a una cuenta de proveedor y nunca son públicos en bruto. Inicia sesión para presentar o actualizar los tuyos.',
  'verify.createSupplierAccount': 'Crear una cuenta de proveedor',
  'verify.supplierOnly': 'Solo cuentas de proveedor',
  'verify.supplierOnlyBody': 'Tu cuenta es una cuenta de {role}, así que no hay ninguna lista de verificación de proveedor que completar.',
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
    'No se pudieron cargar tus documentos de verificación. Inténtalo de nuevo. Si sigue fallando, puede que tu cuenta aún no tenga perfil de proveedor.',
  'verify.emptyTitle': 'No hay documentos en el expediente',
  'verify.emptyBody':
    'Aún no se ha presentado nada, así que no se puede mostrar ninguna insignia de verificación a los compradores. Usa el formulario para presentar tu primer documento: empieza por {first}.',
  'verify.col.document': 'Documento',
  'verify.col.status': 'Estado',
  'verify.col.note': 'Nota del revisor',
  'verify.col.reviewed': 'Revisado',
  'verify.filed': 'presentado el {date}',
  'verify.reference': 'referencia: {ref}',
  'verify.noReference': 'sin referencia',
  'verify.resubmit': 'Volver a presentar',
  'verify.tierFootnote':
    'Aquí solo se listan los documentos que la API devuelve para tu perfil de proveedor. Los tipos que faltan simplemente no tienen fila todavía: presentarlos la crea.',
  'verify.fileTitle': 'Presentar o actualizar un documento',
  'verify.docType': 'Tipo de documento',
  'verify.existingHintPre': 'Ya tienes una fila para {doc} — estado',
  'verify.existingHintPost':
    '. Volver a presentarlo la sobrescribe y borra la decisión anterior, así que un documento aprobado necesitaría una nueva aprobación.',
  'verify.refLabel': 'Referencia / enlace al documento',
  'verify.refPlaceholder': 'https://…/licencia-comercial.pdf o tu referencia de archivo',
  'verify.refHintLead': 'La subida de archivos no está desarrollada.',
  'verify.refHintTail':
    'Pega un enlace al documento, o una referencia que el equipo de revisión pueda seguir. Se guarda tal cual y no se muestra públicamente.',
  'verify.noteLabel': 'Nota para el revisor',
  'verify.notePlaceholder': 'Qué ha cambiado, por qué se actualiza, cualquier cosa que el revisor deba saber…',
  'verify.filing': 'Presentando…',
  'verify.resubmitDoc': 'Volver a presentar {doc}',
  'verify.submitDoc': 'Presentar {doc}',
  'verify.queueNoteLead': 'Presentar solo pone el documento en la cola.',
  'verify.queueNoteStrong': 'La insignia aparece para los compradores cuando un revisor la aprueba',
  'verify.queueNoteTail': ': nunca al presentarla y nunca automáticamente.',
  'verify.filedNotice':
    '{doc} presentado. El estado ahora es "enviado" y está esperando en la cola de revisión: la insignia solo aparece para los compradores cuando un revisor lo aprueba.',
  'verify.errFile': 'No se pudo presentar este documento.',
  'verify.statusMeans': 'Qué significa cada estado',
  'verify.tierTitle': 'Nivel de verificación',
  'verify.tierAll': 'Verificado · todos los documentos clave aprobados',
  'verify.tierSome': 'Verificado · documentos aprobados',
  'verify.tierNone': 'Aún sin verificar',
  'verify.tierAllBody': 'Un revisor ha aprobado todos los tipos de documento clave de esta página.',
  'verify.tierSomeBody': 'Al menos un documento está aprobado{n}; los tipos clave restantes reforzarían el perfil.',
  'verify.tierNoneBody': 'Aún no se ha aprobado ningún documento, así que no se muestra ninguna insignia de verificación de tu empresa.',
  'verify.tierHint':
    'El nivel de tu cuenta lo fija el equipo de revisión a partir de los documentos aprobados: esta pantalla informa de los estados que devuelve la API y no calcula un número de nivel por su cuenta. Los compradores solo ven insignia de documentos aprobados.',
  'verify.suggested': 'Siguiente sugerido:',
  'verify.select': 'Seleccionar',
  'verify.othersNote':
    'Los compradores también ven las valoraciones y los recuentos de inspección de otros proveedores en sus perfiles. Esas cifras son datos de ejemplo del marketplace, no algo que produzca esta lista, así que esta página no muestra ninguna a propósito.',
  'verify.help.missing.title': 'No presentado',
  'verify.help.missing.state': 'Aún no se ha presentado nada, o el documento nunca se envió.',
  'verify.help.submitted.title': 'Esperando revisión',
  'verify.help.submitted.state': 'Presentado y esperando en la cola de revisión. Aún no se muestra insignia a los compradores.',
  'verify.help.approved.title': 'Aprobado',
  'verify.help.approved.state': 'Un revisor lo cotejó con el propio documento. Esto es lo que ven los compradores.',
  'verify.help.rejected.title': 'Devuelto',
  'verify.help.rejected.state': 'Rechazado con una nota. Corrige el documento y vuelve a presentarlo.',
  'verify.doc.businessLicence': 'Licencia comercial',
  'verify.doc.taxCertificate': 'Certificado fiscal',
  'verify.doc.factoryAudit': 'Informe de auditoría de fábrica',
  'verify.doc.productCert': 'Certificación de producto',
  'verify.doc.exportLicence': 'Licencia de exportación',
};

const DICTS: Record<LangCode, Partial<Record<DictKey, string>>> = { en, tr, ar, ru, zh, es };

/* --------------------- placeholder titles (route table) ------------------ */

/**
 * App.tsx (owned elsewhere) hands ComingSoon its title and note as English
 * literals. They are looked up here by that English source text so the honest
 * placeholders are translated too, without editing the route table. An
 * unrecognised title is shown as-is — never blank.
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
  'Buyer ↔ supplier messaging lands in the next build phase.': 'soon.note.messages',
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

/** Current language → English → the key itself. Never throws, never blank. */
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
  /** Same as `t` but for an explicit language — for module-level helpers. */
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
      /* storage unavailable — the session still switches language */
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
