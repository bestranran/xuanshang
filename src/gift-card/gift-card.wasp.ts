import { action, query, type Spec } from "@wasp.sh/spec";
import { createGiftCardBatch, getGiftCardBatchDetails, getGiftCardBatches, redeemGiftCard, setGiftCardEnabled } from "./operations" with { type: "ref" };

const entities = ["User", "WalletAccount", "WalletEntry", "GiftCardBatch", "GiftCard", "AdminAuditLog"];

export const giftCardSpec: Spec = [
  query(getGiftCardBatches, { entities }),
  query(getGiftCardBatchDetails, { entities }),
  action(createGiftCardBatch, { entities }),
  action(setGiftCardEnabled, { entities }),
  action(redeemGiftCard, { entities }),
];
