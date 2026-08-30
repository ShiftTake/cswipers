import React from 'react';

export default function TermsOfService({ onClose, isModal = false }) {
  const content = (
    <div className="space-y-6 text-white text-left">
      <header className="border-b border-white/10 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#FFD700] font-bold">CardSwipers Legal & Compliance</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Terms of Service & EULA</h1>
            <p className="text-xs text-white/60 mt-0.5">Version 1.2 · Effective August 2026</p>
          </div>
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
              aria-label="Close Terms of Service"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-[#161B22]/70 p-4 sm:p-5">
        <h2 className="text-lg font-bold text-[#FFE66D] flex items-center gap-2">
          <span>1.</span> Acceptance & Platform Overview
        </h2>
        <p className="text-xs sm:text-sm leading-relaxed text-white/80">
          Welcome to <strong>CardSwipers</strong>. By creating an account, downloading the mobile application from the Apple App Store or Google Play Store, or accessing our web platform, you agree to be bound by these Terms of Service, our Privacy Policy, and any community guidelines incorporated herein. If you do not agree to all terms, do not access or use the application.
        </p>
        <p className="text-xs sm:text-sm leading-relaxed text-white/80">
          CardSwipers is a peer-to-peer card trading, social discovery, and collector community platform. CardSwipers provides software and facilitation tools—including swipe-based discovery, private messaging, Card Clubs, and escrow-backed checkout—to enable collectors to discover, negotiate, and execute card trades and sales.
        </p>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-[#161B22]/70 p-4 sm:p-5">
        <h2 className="text-lg font-bold text-[#FFE66D] flex items-center gap-2">
          <span>2.</span> Escrow System & Marketplace Rules
        </h2>
        <div className="space-y-2 text-xs sm:text-sm leading-relaxed text-white/80">
          <p>
            <strong>2.1 Payment Flow:</strong> CardSwipers utilizes Stripe Connect Separate Charges and Transfers to process payments and hold transaction funds on behalf of buyers and sellers during shipment and inspection. CardSwipers is not a bank, depository institution, or licensed escrow company; all payment facilitation is automated via integrated payment processors.
          </p>
          <p>
            <strong>2.2 48-Hour Inspection Window:</strong> Once the designated carrier (USPS, UPS, or FedEx) records a confirmed delivery scan at the buyer's shipping address on file, the buyer has exactly <strong>48 hours</strong> to physically inspect the card and either accept delivery or open a formal dispute with photographic evidence.
          </p>
          <p>
            <strong>2.3 Automatic Release:</strong> If no dispute is filed within 48 hours of carrier-verified delivery, or after 7 business days following carrier tracking submission without buyer intervention, CardSwipers automatically and irrevocably releases the net seller payout to the seller's connected Stripe account.
          </p>
          <p>
            <strong>2.4 Shipping Requirements:</strong> Sellers are required to enter valid, scannable tracking numbers within 5 calendar days of order placement. Orders lacking valid carrier tracking after 5 days are subject to automatic cancellation and buyer refund.
          </p>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-[#161B22]/70 p-4 sm:p-5">
        <h2 className="text-lg font-bold text-[#FFE66D] flex items-center gap-2">
          <span>3.</span> Disputes, Authenticity & Card Verification
        </h2>
        <div className="space-y-2 text-xs sm:text-sm leading-relaxed text-white/80">
          <p>
            <strong>3.1 Dispute Categories:</strong> Disputes may only be raised for: (a) Item Not Received (tracking missing or invalid destination); (b) Significant Misrepresentation of condition (severe flaws omitted from listing); or (c) Counterfeit or Altered card without disclosure.
          </p>
          <p>
            <strong>3.2 Binding Administrative Resolution:</strong> In the event of a dispute, CardSwipers administrators review carrier telemetry, photographic evidence, and grading certification lookups (PSA, BGS, CGC). Both parties agree that CardSwipers' administrative determination regarding escrow release or buyer refund is final, conclusive, and binding.
          </p>
          <p>
            <strong>3.3 Return Shipments:</strong> If a return is mandated, the buyer must provide valid return tracking within 4 calendar days. Refunds are triggered only upon verified carrier delivery scan back to the seller.
          </p>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-[#161B22]/70 p-4 sm:p-5">
        <h2 className="text-lg font-bold text-[#FFE66D] flex items-center gap-2">
          <span>4.</span> User-Generated Content & Prohibited Conduct
        </h2>
        <div className="space-y-2 text-xs sm:text-sm leading-relaxed text-white/80">
          <p>Users are solely responsible for all listings, images, chat messages, and club posts. You strictly agree NOT to:</p>
          <ul className="list-disc pl-5 space-y-1 text-white/75">
            <li>List counterfeit, reprinted, forged, trimmed, re-colored, or altered cards without clear and conspicuous disclosure;</li>
            <li>Submit fraudulent tracking numbers or manipulate carrier delivery scans;</li>
            <li>Harass, intimidate, defame, impersonate, or abuse other collectors or administrators;</li>
            <li>Circumvent platform escrow or payment workflows for transactions initiated on CardSwipers;</li>
            <li>Use automated bots, scrapers, or reverse-engineering tools on CardSwipers APIs or mobile applications.</li>
          </ul>
          <p>Violations result in immediate listing deletion, account deactivation, forfeiture of platform privileges, and referral to law enforcement where applicable.</p>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-[#161B22]/70 p-4 sm:p-5">
        <h2 className="text-lg font-bold text-[#FFE66D] flex items-center gap-2">
          <span>5.</span> Account Termination & Apple Guideline 5.1.1(v) Deletion
        </h2>
        <div className="space-y-2 text-xs sm:text-sm leading-relaxed text-white/80">
          <p>
            <strong>5.1 Self-Service Account Deletion:</strong> In compliance with Apple App Store Review Guideline 5.1.1(v) and global data privacy standards (GDPR, CCPA), users may permanently delete their account at any time directly within the application via <em>Settings → Delete Account Permanently</em>.
          </p>
          <p>
            <strong>5.2 Deletion Scope:</strong> Account deletion permanently purges authentication credentials, binder items, card listings, draft cards, notifications, and club memberships from active databases.
          </p>
          <p>
            <strong>5.3 Active Escrow Limitation:</strong> To prevent fraud and protect trading counterparties, accounts with active, in-flight escrow transactions cannot be deleted until all pending orders and disputes reach final completion or refund.
          </p>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-[#161B22]/70 p-4 sm:p-5">
        <h2 className="text-lg font-bold text-[#FFE66D] flex items-center gap-2">
          <span>6.</span> Apple App Store & Google Play Standard EULA
        </h2>
        <div className="space-y-2 text-xs sm:text-sm leading-relaxed text-white/80">
          <p>
            <strong>6.1 Scope of License:</strong> CardSwipers grants you a revocable, non-exclusive, non-transferable license to use the CardSwipers app on Apple-branded or Android products that you own or control, as permitted by the Usage Rules set forth in the Apple Media Services Terms and Conditions and Google Play Terms of Service.
          </p>
          <p>
            <strong>6.2 Maintenance & Support:</strong> CardSwipers is solely responsible for providing maintenance and support services. You acknowledge that Apple Inc. and Google LLC have no obligation whatsoever to furnish any maintenance or support services with respect to the app.
          </p>
          <p>
            <strong>6.3 Product Claims & Intellectual Property:</strong> CardSwipers, not Apple or Google, is responsible for addressing any claims relating to the application, including product liability, legal/regulatory compliance, consumer protection, and intellectual property infringement.
          </p>
          <p>
            <strong>6.4 Third-Party Beneficiary:</strong> Apple and Google, and their subsidiaries, are third-party beneficiaries of this Agreement. Upon your acceptance of these Terms, Apple and Google have the right (and are deemed to have accepted the right) to enforce this Agreement against you as a third-party beneficiary.
          </p>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-[#161B22]/70 p-4 sm:p-5">
        <h2 className="text-lg font-bold text-[#FFE66D] flex items-center gap-2">
          <span>7.</span> Disclaimers, Limitation of Liability & Arbitration
        </h2>
        <div className="space-y-2 text-xs sm:text-sm leading-relaxed text-white/80">
          <p>
            <strong>7.1 As-Is Disclaimers:</strong> CardSwipers is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis without warranties of any kind. CardSwipers does not guarantee card market value stability, liquidity, or condition accuracy.
          </p>
          <p>
            <strong>7.2 Liability Cap:</strong> To the maximum extent permitted by applicable law, CardSwipers' cumulative aggregate liability for any claims arising out of or related to this agreement or the use of the platform is strictly limited to the platform fees collected by CardSwipers on the specific transaction at issue.
          </p>
          <p>
            <strong>7.3 Mandatory Binding Arbitration:</strong> Any dispute, controversy, or claim arising out of or relating to these terms shall be settled by binding individual arbitration administered by the American Arbitration Association (AAA), waiving any right to a jury trial or class action participation.
          </p>
        </div>
      </section>

      <footer className="border-t border-white/10 pt-4 text-center text-xs text-white/50 space-y-1">
        <p>CardSwipers Inc. · All rights reserved.</p>
        <p>Questions or legal inquiries: <a href="mailto:help@cardswipers.com" className="text-[#FFD700] underline">help@cardswipers.com</a></p>
      </footer>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 sm:p-5 overflow-y-auto" role="dialog" aria-modal="true">
        <div className="relative w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-3xl border border-[#30363D] bg-[#0D1117] p-5 sm:p-8 shadow-2xl [scrollbar-width:thin]">
          {content}
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl bg-[#FFD700] px-6 py-2.5 text-sm font-bold text-[#0B0E14] hover:bg-[#FFE66D] transition-colors"
            >
              I Understand & Agree
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-10 sm:py-16">
      {content}
    </main>
  );
}
