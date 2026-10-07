/**
 * Mock PayPalGateway for demo mode. No network. Order ids are prefixed
 * DEMO- so nobody mistakes them for sandbox orders.
 */
import { isLocked, toPaypalAmount, type CaptureResult, type CreateOrderResult, type ItemCard, type PayPalGateway } from "@pay-pals/contracts";
import { newId } from "./ids";

export function createMockPayPalGateway(): PayPalGateway {
  const orders = new Map<string, { card: ItemCard; dealId: string }>();
  return {
    async createDealOrder(lockedCard: ItemCard, dealId: string): Promise<CreateOrderResult> {
      if (!isLocked(lockedCard)) throw new Error("Only a locked card can become a PayPal order.");
      const orderId = `DEMO-${newId().slice(0, 8).toUpperCase()}`;
      orders.set(orderId, { card: lockedCard, dealId });
      return { orderId, status: "CREATED", approveUrl: null };
    },

    async captureOrder(orderId: string): Promise<CaptureResult> {
      const order = orders.get(orderId);
      if (!order) throw new Error(`Unknown order ${orderId}`);
      return {
        orderId,
        captureId: `DEMO-CAP-${newId().slice(0, 8).toUpperCase()}`,
        status: "COMPLETED",
        payeeEmail: order.card.sellerPaypalEmail,
        amount: toPaypalAmount(order.card.askingPrice),
        currency: order.card.currency,
      };
    },

    async verifyWebhook(): Promise<boolean> {
      return false;
    },
  };
}
