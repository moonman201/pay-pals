/**
 * Mock PayPalGateway for demo mode with no PayPal credentials. No network.
 * Order ids are prefixed DEMO- so nobody mistakes them for sandbox orders.
 * Returns a `raw` body like the real gateway so the payment record fills
 * rawOrder and rawCapture the same way.
 */
import { buildCustomId, isLocked, toPaypalAmount, type CaptureResult, type CreateOrderOptions, type CreateOrderResult, type ItemCard } from "@pay-pals/contracts";
import type { PayPalService } from "../services";
import { newId } from "./ids";

type Raw = Record<string, unknown>;

export function createMockPayPalGateway(): PayPalService {
  const orders = new Map<string, { card: ItemCard; dealId: string; raw: Raw }>();
  return {
    async createDealOrder(lockedCard: ItemCard, dealId: string, options?: CreateOrderOptions): Promise<CreateOrderResult & { raw: Raw }> {
      if (!isLocked(lockedCard)) throw new Error("Only a locked card can become a PayPal order.");
      const orderId = `DEMO-${newId().slice(0, 8).toUpperCase()}`;
      const raw: Raw = {
        id: orderId,
        status: "CREATED",
        mock: true,
        purchase_units: [
          {
            custom_id: buildCustomId(dealId, options?.historyHash ?? null),
            payee: { email_address: lockedCard.sellerPaypalEmail },
            amount: { currency_code: lockedCard.currency, value: toPaypalAmount(lockedCard.askingPrice) },
          },
        ],
      };
      orders.set(orderId, { card: lockedCard, dealId, raw });
      return { orderId, status: "CREATED", approveUrl: null, raw };
    },

    /**
     * The order as this process holds it. Never a PayPal confirmation: the
     * body carries mock: true and the page skips the live read on the mock
     * gateway. Here so the mock still satisfies the service type.
     */
    async getOrder(orderId: string): Promise<Raw> {
      const order = orders.get(orderId);
      if (!order) throw new Error(`Unknown order ${orderId}`);
      return order.raw;
    },

    async captureOrder(orderId: string): Promise<CaptureResult & { raw: Raw }> {
      const order = orders.get(orderId);
      if (!order) throw new Error(`Unknown order ${orderId}`);
      const captureId = `DEMO-CAP-${newId().slice(0, 8).toUpperCase()}`;
      const amount = toPaypalAmount(order.card.askingPrice);
      return {
        orderId,
        captureId,
        status: "COMPLETED",
        payeeEmail: order.card.sellerPaypalEmail,
        amount,
        currency: order.card.currency,
        raw: { id: orderId, status: "COMPLETED", mock: true, purchase_units: [{ payments: { captures: [{ id: captureId, status: "COMPLETED", amount: { value: amount, currency_code: order.card.currency } }] } }] },
      };
    },

    async verifyWebhook(): Promise<boolean> {
      return false;
    },
  };
}
