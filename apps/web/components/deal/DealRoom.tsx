"use client";

import { canTransition, isCardEditable } from "@pay-pals/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ActionId } from "@/lib/deal/actions";
import { canStillPay } from "@/lib/deal/actions";
import type { DealSnapshot } from "@/lib/deal/snapshot";
import { canChooseOffPlatform, hasChosenOffPlatform } from "@/lib/deal/off-platform";
import { dealStatusView } from "@/lib/deal/status-view";
import { diffVerdicts, lastTwoVerdicts } from "@/lib/deal/verdict-diff";
import { dealApi, postJson } from "@/lib/client/api";
import { streamReview } from "@/lib/client/review-stream";
import { agreeLockedLine, applyProgress, IDLE_REVIEW, startedReview, type LiveReviewState } from "@/lib/deal/live-review";
import { palChannel, type Role } from "@/lib/role";
import { ActionBar } from "./ActionBar";
import { ArrivalResult } from "./ArrivalResult";
import { DealHeader } from "./DealHeader";
import { ItemCardView } from "./ItemCardView";
import { LiveReview } from "./LiveReview";
import { OffPlatformNotice } from "./OffPlatformNotice";
import { PalPane } from "./PalPane";
import { PaymentSummary } from "./PaymentSummary";
import { SharedChat } from "./SharedChat";
import { StatusView } from "./StatusView";
import { ShipmentSummary } from "./ShipmentSummary";
import { Timeline } from "./Timeline";
import { VerdictDiffPanel } from "./VerdictDiffPanel";
import { VerdictPanel } from "./VerdictPanel";
import Link from "next/link";
import { Panel } from "../ui/Panel";
import { ArrivalStep } from "./steps/ArrivalStep";
import { InvitePanel } from "./steps/InvitePanel";
import { IssueStep } from "./steps/IssueStep";
import { RefusalStep } from "./steps/RefusalStep";
import { JoinForm } from "./steps/JoinForm";
import { OffPlatformStep } from "./steps/OffPlatformStep";
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
  /*
    The review as it streams in (Decision 19). Local to this page: the verdict is saved on the
    server from the final Verdict whatever happens here, so losing this state loses nothing but
    the live view. `snapshot.reviewInFlight` covers the other case, a reload while one runs.
  */
  const [live, setLive] = useState<LiveReviewState>(IDLE_REVIEW);
  const { deal, currentCard } = snapshot;
  const state = deal.state;
  const reviewing = live.running || snapshot.reviewInFlight;

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

  /** Findings land here as they arrive, and the panel is torn down when the review ends. */
  async function review() {
    setBusy("review");
    setError(null);
    setLive(startedReview());
    try {
      await streamReview(deal.id, { onProgress: (event) => setLive((prev) => applyProgress(prev, event)) });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      // Cleared either way: a review that ended is not a review in flight, and Agree must open
      // again. The finished verdict comes from the refresh, never from what streamed in.
      setLive(IDLE_REVIEW);
      setBusy(null);
    }
  }

  function onAction(id: ActionId, opts?: { override?: boolean }) {
    const api = (action: string, body?: unknown) => () => postJson(dealApi(deal.id, action), body);
    switch (id) {
      case "review":
        return review();
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
  // Decision 12: once the buyer says they are paying another way, Pay Pals has stepped back.
  const offPlatform = hasChosenOffPlatform(snapshot.events);
  // The pal looked again after new evidence: both reviews stay on the page (C6).
  const pair = lastTwoVerdicts(snapshot.verdicts);
  const verdictDiff = pair ? diffVerdicts(pair.previous, pair.current) : null;
  // One status view per deal (E12). Everything in it comes off the snapshot.
  const statusGroups = dealStatusView({
    deal,
    cards: snapshot.cards,
    lockedCard: snapshot.lockedCard,
    verdicts: snapshot.verdicts,
    arrivalCheck: snapshot.arrivalCheck,
    payment: snapshot.payment,
    paypalRead: snapshot.paypalRead,
    shipment: snapshot.shipment,
    events: snapshot.events,
    hasEvidence: snapshot.hasEvidence,
  });

  return (
    <div className={`theme-${role} min-h-screen bg-wash`} data-review={reviewing ? "running" : "idle"}>
      <DealHeader snapshot={snapshot} role={role} />
      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:py-6">
        <div className="min-w-0 space-y-4">
          {currentCard ? (
            <ItemCardView cards={snapshot.cards} currentVersion={deal.currentCardVersion} lockedVersion={deal.lockedCardVersion} certCheck={snapshot.verdict?.certCheck ?? null} dealId={deal.id} />
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
          {reviewing ? <LiveReview state={live.running ? live : startedReview()} /> : null}
          {snapshot.verdict ? (
            <VerdictPanel
              verdict={snapshot.verdict}
              currentVersion={deal.currentCardVersion}
              locked={deal.lockedCardVersion !== null}
              cardTitle={currentCard?.title ?? null}
              cardGrade={currentCard?.grade ?? null}
            />
          ) : null}
          {verdictDiff ? <VerdictDiffPanel diff={verdictDiff} /> : null}
          <StatusView groups={statusGroups} />
          {snapshot.payment ? (
            <PaymentSummary
              payment={snapshot.payment}
              read={snapshot.paypalRead}
              dealId={deal.id}
              events={snapshot.events}
              record={{
                cards: snapshot.cards,
                lockedVersion: deal.lockedCardVersion,
                messages: snapshot.messages,
                verdicts: snapshot.verdicts,
                arrivalCheck: snapshot.arrivalCheck,
                shipment: snapshot.shipment,
                method: snapshot.payment.method,
              }}
            />
          ) : null}
          {snapshot.shipment ? <ShipmentSummary shipment={snapshot.shipment} /> : null}
          {snapshot.arrivalCheck ? <ArrivalResult check={snapshot.arrivalCheck} lockedCard={snapshot.lockedCard} /> : null}
          {offPlatform ? <OffPlatformNotice state={state} orderId={snapshot.payment?.paypalOrderId ?? null} /> : null}

          {needsBuyer ? (
            <JoinForm dealId={deal.id} onDone={refresh} />
          ) : offPlatform ? null : (
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
                hasCert={Boolean(currentCard?.certNumber)}
                reviewing={reviewing}
                reviewingLine={agreeLockedLine({ ...live, running: reviewing })}
                onAction={onAction}
              />
              {error ? (
                <p role="alert" className="rounded-lg border border-stop-line bg-stop-soft px-3 py-2 text-sm text-stop">
                  {error}
                </p>
              ) : null}
              {role === "seller" && isCardEditable(state) && currentCard ? (
                <RequestStep dealId={deal.id} questions={openQuestions} suggestions={snapshot.demo?.requestPhotos ?? []} uploadsEnabled={snapshot.uploadsEnabled} onDone={refresh} />
              ) : null}
              {role === "buyer" && canStillPay(state) && snapshot.lockedCard ? (
                <PayStep dealId={deal.id} card={snapshot.lockedCard} payMode={snapshot.payMode} payment={snapshot.payment} sandboxBuyer={snapshot.sandboxBuyer} onDone={refresh} />
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
              {role === "buyer" && canChooseOffPlatform(state, snapshot.events) ? <OffPlatformStep dealId={deal.id} onDone={refresh} /> : null}
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
