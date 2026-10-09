"use client";

import { isTerminal, type Deal, type Message } from "@pay-pals/contracts";
import { useState } from "react";
import { formatTime } from "@/lib/format";
import { actorLabel } from "@/lib/labels";
import type { Role } from "@/lib/role";
import { PalAvatar } from "../pal/PalAvatar";
import { PhotoGrid } from "../photos/PhotoGrid";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";

interface Props {
  deal: Deal;
  role: Role;
  messages: Message[];
  onSend: (text: string) => void;
}

/** The chat both people see. Pals post here too when they have something for the other side. */
export function SharedChat({ deal, role, messages, onSend }: Props) {
  const [text, setText] = useState("");
  const closed = isTerminal(deal.state);

  return (
    <Panel title="Deal chat" aside={<span className="text-xs text-muted">both sides see this</span>}>
      {messages.length === 0 ? <p className="text-sm text-muted">No messages yet.</p> : null}
      <ol className="space-y-2">
        {messages.map((m) => {
          const mine = m.author === role;
          const pal = m.author === "buyer_pal" || m.author === "seller_pal";
          return (
            <li key={m.id} className={`flex gap-2 `}>
              {pal ? <PalAvatar pal={m.author === "buyer_pal" ? "buyer" : "seller"} size={24} className="mt-1.5" /> : null}
              <div className={`max-w-[85%] rounded-xl px-3 py-2 `}>
                <p className={`text-[11px] font-semibold ${mine ? "opacity-80" : "text-muted"}`}>{actorLabel(m.author, deal)}</p>
                <p className="text-sm leading-relaxed">{m.text}</p>
                {m.photos.length > 0 ? (
                  <div className="mt-2">
                    <PhotoGrid photos={m.photos} size="sm" />
                  </div>
                ) : null}
                <p className={`mt-1 text-[10px] ${mine ? "opacity-70" : "text-muted"}`}>{formatTime(m.at)}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {closed ? null : (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            onSend(text.trim());
            setText("");
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Message the ${role === "buyer" ? "seller" : "buyer"}`}
            className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm"
            maxLength={2000}
          />
          <Button type="submit" variant="secondary">
            Send
          </Button>
        </form>
      )}
    </Panel>
  );
}
