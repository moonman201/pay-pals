"use client";

/**
 * A review that is running while this page was not the one that asked for it:
 * the page was reloaded or reopened mid-review. It shows the running state
 * and refreshes until the verdict lands, instead of offering a second review.
 *
 * Two ways to know. The server says so (`serverRunning`, from the in-process
 * registry), or this browser noted that it asked and the note has not run out
 * (see review-marker.ts), which covers a reopen answered by another server
 * instance. Either way the page polls the snapshot; the verdict itself is
 * always read from the server, never from here.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearReviewMarker, reviewMarkerLeft, type MarkerStorage } from "@/lib/deal/review-marker";

const POLL_MS = 2500;

function storage(): MarkerStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useResumedReview({ dealId, waitingForReview, serverRunning, pageIsRunning }: { dealId: string; waitingForReview: boolean; serverRunning: boolean; pageIsRunning: boolean }): boolean {
  const router = useRouter();
  const [markerMs, setMarkerMs] = useState(0);

  // Read on the client only, after mount, so the server render and the first client render agree.
  useEffect(() => {
    setMarkerMs(waitingForReview && !pageIsRunning ? reviewMarkerLeft(storage(), dealId, Date.now()) : 0);
  }, [dealId, waitingForReview, pageIsRunning]);

  // The review landed (the deal moved on): the note has done its job.
  useEffect(() => {
    if (!waitingForReview) clearReviewMarker(storage(), dealId);
  }, [dealId, waitingForReview]);

  // Stop believing the note when it runs out.
  useEffect(() => {
    if (markerMs <= 0) return;
    const t = setTimeout(() => setMarkerMs(0), markerMs);
    return () => clearTimeout(t);
  }, [markerMs]);

  const resumed = waitingForReview && !pageIsRunning && (serverRunning || markerMs > 0);

  useEffect(() => {
    if (!resumed) return;
    const t = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [resumed, router]);

  return resumed;
}
