"use client";

import { canTransition, isCardEditable } from "@pay-pals/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ActionId } from "@/lib/deal/actions";
import { canStillPay } from "@/lib/deal/actions";
import type { DealSnapshot } from "@/lib/deal/snapshot";
import { dealApi, postJson } from "@/lib/client/api";
import { palChannel, type Role } from "@/lib/role";
import { ActionBar } from "./ActionBar";
import { ArrivalResult } from "./ArrivalResult";
import { DealHeader } from "./DealHeader";
import { ItemCardView } from "./ItemCardView";
import { PalPane } from "./PalPane";
import { PaymentSummary } from "./PaymentSummary";
import { SharedChat } from "./SharedChat";
import { ShipmentSummary } from "./ShipmentSummary";
import { Timeline } from "./Timeline";
import { VerdictPanel } from "./VerdictPanel";
import Link from "next/link";
import { Panel } from "../ui/Panel";
import { ArrivalStep } from "./steps/ArrivalStep";
import { InvitePanel } from "./steps/InvitePanel";
import { IssueStep } from "./steps/IssueStep";
import { RefusalStep } from "./steps/RefusalStep";
import { JoinForm } from "./steps/JoinForm";
import { PayStep } from "./steps/PayStep";
import { RequestStep } from "./steps/RequestStep";
import { ShipStep } from "./steps/ShipStep";

/**
 * The deal room. Lays out the pieces and turns button presses into API
 * calls, then refreshes. Which moves exist comes from the snapshot and the
 * contract's transition table, not from here.
 */
export function DealRoom({ snapshot, role }: { snapshot: DealSnapshot; role: Role }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const { deal, currentCard } = snapshot;
  const state = deal.state;

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  function onAction(id: ActionId, opts?: { override?: boolean }) {
    const api = (action: string, body?: unknown) => () => postJson(dealApi(deal.id, action), body);
    switch (id) {
      case "review":
        return run(id, api("review"));
      case "agree":
        return run(id, api("agree", { by: role, override: Boolean(opts?.override) }));
      case "confirm_delivery":
        return run(id, api("deliver"));
      case "complete":
        return run(id, api("complete"));
      case "report_issue":
        // Always ask. After a failed arrival check the mismatch choice is preselected and one click confirms.
        setIssueOpen(true);
        return;
      case "cancel":
        if (window.confirm("Cancel this deal?")) return run(id, api("cancel", { by: role }));
        return;
      case "pay":
      case "ship":
        document.getElementById(`step-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
    }
  }

  const refresh = () => router.refresh();
  const myPal = snapshot.messages.filter((m) => m.channel === palChannel(role));
  const needsBuyer = role === "buyer" && deal.buyer === null;
  const shared = snapshot.messages.filter((m) => m.channel === "deal");
  const openQuestions = snapshot.verdict && currentCard && snapshot.verdict.cardVersion === currentCard.version ? snapshot.verdict.questionsForSeller : [];
  // This side agreed to an earlier version and the store cleared it when the card changed.
  const agreedEarlier = snapshot.events.some((e) => e.kind === "agreed" && e.actor === role);
  const cardChangedSinceAgree = agreedEarlier && (role === "buyer" ? deal.buyerAgreedAt : deal.sellerAgreedAt) === null;

  return (
    <div className={`theme-${role} min-h-screen bg-wash`}>
      <DealHeader snapshot={snapshot} role={role} />
      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:py-6">
        <div className="min-w-0 space-y-4">
          {currentCard ? (
            <ItemCardView cards={snapshot.cards} currentVersion={deal.currentCardVersion} lockedVersion={deal.lockedCardVersion} certCheck={snapshot.verdict?.certCheck ?? null} />
          ) : null}
          {role === "buyer" && state === "INVITED" ? <InvitePanel deal={deal} /> : null}
          {role === "buyer" && state === "INVITED" && !snapshot.inviteDeclined ? <RefusalStep dealId={deal.id} onDone={refresh} /> : null}
          {role === "seller" && state === "INVITED" ? (
            <Panel title="You have not joined yet" accent>
              <p className="text-sm">
                The buyer invited you. Open the{" "}
                <Link href={`/deals/${deal.id}/join?as=seller`} className="font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline">
                  join page
                </Link>{" "}
                to add your photos, or to say you will not use Pay Pals.
              </p>
            </Panel>
          ) : null}
          {snapshot.verdict ? (
            <VerdictPanel
              verdict={snapshot.verdict}
              currentVersion={deal.currentCardVersion}
              locked={deal.lockedCardVersion !== null}
              cardTitle={currentCard?.title ?? null}
              cardGrade={currentCard?.grade ?? null}
            />
          ) : null}
          {snapshot.payment ? <PaymentSummary payment={snapshot.payment} /> : null}
          {snapshot.shipment ? <ShipmentSummary shipment={snapshot.shipment} /> : null}
          {snapshot.arrivalCheck ? <ArrivalResult check={snapshot.arrivalCheck} /> : null}

          {needsBuyer ? (
            <JoinForm dealId={deal.id} onDone={refresh} />
          ) : (
            <>
              <ActionBar
                state={state}
                role={role}
                verdict={snapshot.verdict}
                dealId={deal.id}
                busy={busy}
                hasLockedCard={snapshot.lockedCard !== null}
                agreement={{ buyerAgreedAt: deal.buyerAgreedAt, sellerAgreedAt: deal.sellerAgreedAt }}
                cardVersion={deal.currentCardVersion}
                cardChangedSinceAgree={cardChangedSinceAgree}
                refusalToReview={snapshot.inviteDeclined || shared.length > 0}
                onAction={onAction}
              />
              {error ? (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-stop">
                  {error}
                </p>
              ) : null}
              {role === "seller" && isCardEditable(state) && currentCard ? (
                <RequestStep dealId={deal.id} questions={openQuestions} suggestions={snapshot.demo?.requestPhotos ?? []} uploadsEnabled={snapshot.uploadsEnabled} onDone={refresh} />
              ) : null}
              {role === "buyer" && canStillPay(state) && snapshot.lockedCard ? (
                <PayStep dealId={deal.id} card={snapshot.lockedCard} payMode={snapshot.payMode} onDone={refresh} />
              ) : null}
              {role === "seller" && state === "PAID" && snapshot.checklist ? (
                <ShipStep dealId={deal.id} checklist={snapshot.checklist} palMessage={snapshot.checklistMessage} demo={snapshot.demo?.packing ?? null} uploadsEnabled={snapshot.uploadsEnabled} onDone={refresh} />
              ) : null}
              {role === "buyer" && issueOpen && canTransition(state, "ISSUE") ? (
                <IssueStep
                  dealId={deal.id}
                  state={state}
                  preselect={snapshot.arrivalCheck && !snapshot.arrivalCheck.matches ? "arrival_mismatch" : undefined}
                  onDone={() => { setIssueOpen(false); refresh(); }}
                  onClose={() => setIssueOpen(false)}
                />
              ) : null}
              {role === "buyer" && state === "DELIVERED" && !snapshot.arrivalCheck ? (
                <ArrivalStep dealId={deal.id} suggestions={snapshot.demo?.arrivalPhotos ?? []} uploadsEnabled={snapshot.uploadsEnabled} onDone={refresh} />
              ) : null}
            </>
          )}
        </div>
        <aside className="min-w-0 space-y-4">
          <PalPane role={role} messages={myPal} />
          <SharedChat deal={deal} role={role} messages={shared} onSend={(text) => run("chat", () => postJson(dealApi(deal.id, "messages"), { by: role, text }))} />
          <Timeline deal={deal} events={snapshot.events} />
        </aside>
      </main>
    </div>
  );
}
